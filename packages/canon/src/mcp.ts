import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { serveUi } from "./ui/server.js";

/**
 * The MCP server the plugin registers (REQ-12.1.7). It runs over stdio for Claude Code and
 * talks to the viewer over HTTP, starting the viewer in-process when none is running on the
 * port, so the session's questions, focus and change feed all go through one page.
 * Nothing here writes to stdout except the protocol; logs go to stderr.
 */

export interface McpOptions {
  canonDir: string;
  port: number;
  openBrowser: boolean;
}

const WAIT_DEFAULT = 90;
const WAIT_MAX = 600;

const log = (line: string) => process.stderr.write(`headcanon: ${line}\n`);

async function health(base: string): Promise<{ ok: boolean; canon?: string } | undefined> {
  try {
    const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1500) });
    return r.ok ? ((await r.json()) as { ok: boolean; canon?: string }) : undefined;
  } catch {
    return undefined;
  }
}

function samePath(a: string, b: string): boolean {
  const norm = (p: string) => resolve(p).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? norm(a).toLowerCase() === norm(b).toLowerCase() : norm(a) === norm(b);
}

/**
 * Find or start the viewer for this canon. A viewer already serving the same canon is reused;
 * a port that serves another project's canon is skipped, so two sessions never share a page;
 * the first free port after that gets a new viewer.
 */
async function attachViewer(canonDir: string, firstPort: number): Promise<string> {
  for (let port = firstPort; port < firstPort + 10; port++) {
    const base = `http://127.0.0.1:${port}`;
    const h = await health(base);
    if (h?.ok) {
      if (h.canon && samePath(h.canon, canonDir)) {
        log(`reusing the viewer at ${base}/`);
        return base;
      }
      log(`port ${port} serves another canon (${h.canon ?? "unknown"}); trying the next`);
      continue;
    }
    try {
      await serveUi({ canonDir, port });
      log(`viewer started at ${base}/ for ${canonDir}`);
      return base;
    } catch (e) {
      log(`could not listen on ${port} (${e instanceof Error ? e.message : String(e)}); trying the next`);
    }
  }
  const base = `http://127.0.0.1:${firstPort}`;
  log(`no usable port between ${firstPort} and ${firstPort + 9}; assuming a viewer at ${base}/`);
  return base;
}

async function api<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${base}${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path}: ${r.status} ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

function openBrowser(url: string): void {
  try {
    const cmd = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
    const child = spawn(cmd[0] as string, cmd[1] as string[], { detached: true, stdio: "ignore" });
    child.unref();
  } catch {
    /* no browser available; the URL is in the tool result */
  }
}

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });

export async function runMcp(opts: McpOptions): Promise<void> {
  const base = await attachViewer(opts.canonDir, opts.port);
  let opened = false;
  // Where the human lands: an adoption in progress, no canon yet or no scope decision, is the Adopt
  // view's business; a finished canon opens on the overview.
  const landing = () => {
    const decisions = join(opts.canonDir, "decisions");
    const finished = existsSync(decisions) && readdirSync(decisions).some((f) => /adoption-scope/.test(f));
    return finished ? `${base}/` : `${base}/#/adopt`;
  };
  const ensureOpen = () => {
    if (opened || !opts.openBrowser) return;
    opened = true;
    openBrowser(landing());
  };

  const waitFor = async (questionId: string, seconds: number) => {
    const deadline = Date.now() + Math.min(Math.max(seconds, 1), WAIT_MAX) * 1000;
    while (Date.now() < deadline) {
      const slice = Math.min(25, Math.ceil((deadline - Date.now()) / 1000));
      const r = await api<{ answer?: unknown; pending?: boolean; unknown?: boolean }>(base, `/api/wait?id=${encodeURIComponent(questionId)}&timeout=${slice}`);
      if (r.answer) return { answered: true, answer: r.answer };
      if (r.unknown) return { answered: false, unknown: true, questionId };
    }
    return { answered: false, pending: true, questionId, hint: "The human has not answered yet. Call headcanon_wait with this questionId to keep waiting." };
  };

  const server = new McpServer({ name: "headcanon", version: "0.1.0" });

  const questionShape = {
    question: z.string().describe("The full question text: layer label, the draft, footnotes and the Sources line."),
    header: z.string().optional().describe("A short label of the kind of question, e.g. 'Premise (1 of 5)' or 'Draft'; never a node id, which goes in nodeId. The page titles the card with the node's title, or with the draft's first sentence when the node is new."),
    options: z.array(z.object({ label: z.string(), description: z.string().optional() })).optional().describe("Defaults to Approve as written / Drop. For a list, one option per item: label is the ID and title, description is the item's one-line draft with its footnote."),
    multiSelect: z.boolean().optional().describe("True for a first pass over a list: ticked means approved as written."),
    nodeId: z.string().optional().describe("A canon node to focus on the human's screen while they answer."),
    terms: z.array(z.object({ term: z.string(), definition: z.string() })).optional().describe("Jargon in the draft with the agent's guessed definition, from `headcanon terms`."),
    notice: z.string().optional().describe("One sentence the human must know that is not part of the draft, e.g. that the commit-msg hook is now installed; shown apart from the question."),
  };

  server.registerTool(
    "headcanon_ask",
    {
      title: "Ask the human through the HeadCanon page",
      description:
        "Files a question as an issue in the HeadCanon viewer's Issues panel, beside the canvas, and waits for the human's answer; the human opens it when they choose, so it never interrupts them. A thing you cannot define from its family and the threads is asked here, never written as a node: header names the thing in doubt, nodeId its parent, options your suggestions with their sources. Use it instead of AskUserQuestion whenever the viewer is available. The question text holds the full draft as prose with footnote markers and a Sources line; the page turns the markers into tooltips. Options default to Approve as written and Drop; the human can always switch to typing in Other. Pass `terms` for every word in the draft that the glossary does not define, each with your guessed definition: the page marks them and the human keeps (enshrines in the glossary) or drops each one before answering. Pass `nodeId` to open that node on the human's screen. To ask several questions in one turn, as AskUserQuestion allows, pass `questions`: the page shows them one after another and the result holds every answer in order. Returns the answer(s), or pending question ids after waitSeconds; then call headcanon_wait for each.",
      inputSchema: {
        question: questionShape.question.optional(),
        header: questionShape.header,
        options: questionShape.options,
        multiSelect: questionShape.multiSelect,
        nodeId: questionShape.nodeId,
        terms: questionShape.terms,
        notice: questionShape.notice,
        questions: z.array(z.object(questionShape)).optional().describe("Several questions for one turn, shown one after another; use this instead of `question`."),
        waitSeconds: z.number().optional().describe(`How long to wait for the answers before returning pending (default ${WAIT_DEFAULT}, max ${WAIT_MAX}).`),
      },
    },
    async (args) => {
      ensureOpen();
      const { waitSeconds, questions, ...single } = args;
      const list = questions && questions.length ? questions : single.question ? [single] : [];
      if (!list.length) return text({ error: "pass `question` or `questions`" });
      const ids: string[] = [];
      for (const req of list) ids.push((await api<{ questionId: string }>(base, "/api/ask", { method: "POST", body: JSON.stringify(req) })).questionId);
      if (ids.length === 1) return text({ questionId: ids[0], url: landing(), base: `${base}/`, ...(await waitFor(ids[0]!, waitSeconds ?? WAIT_DEFAULT)) });
      // Several: the human answers them in order, so wait for each in turn within one deadline.
      const deadline = Date.now() + Math.min(Math.max(waitSeconds ?? WAIT_DEFAULT, 1), WAIT_MAX) * 1000;
      const answers: unknown[] = [];
      const pending: string[] = [];
      for (const id of ids) {
        const left = Math.ceil((deadline - Date.now()) / 1000);
        const r = left > 0 && pending.length === 0 ? await waitFor(id, left) : { answered: false as const };
        if (r.answered) answers.push({ questionId: id, answer: (r as { answer: unknown }).answer });
        else pending.push(id);
      }
      return text({ questionIds: ids, url: landing(), base: `${base}/`, answers, ...(pending.length ? { pending: true, pendingIds: pending, hint: "The human has not answered these yet. Call headcanon_wait with each questionId in order." } : { answered: true }) });
    },
  );

  server.registerTool(
    "headcanon_wait",
    {
      title: "Keep waiting for an answer in the page",
      description: "Continues waiting for a question asked with headcanon_ask that returned pending. Returns the answer, or pending again.",
      inputSchema: { questionId: z.string(), waitSeconds: z.number().optional() },
    },
    async ({ questionId, waitSeconds }) => text(await waitFor(questionId, waitSeconds ?? WAIT_DEFAULT)),
  );

  server.registerTool(
    "headcanon_focus",
    {
      title: "Point at a node on the human's screen, or open it",
      description: "Navigates the HeadCanon viewer to a canon node so the human sees what you are talking about. With `open`, the node's card opens as well, with its text and its approve, edit and delete actions.",
      inputSchema: { id: z.string().describe("A node id such as REQ-1.4, or ROOT"), open: z.boolean().optional().describe("Ignored by the page since 2026-10-29: a card opens only when the human opens it. The focus highlights the box on the canvas and the chat notes it.") },
    },
    async ({ id, open }) => {
      ensureOpen();
      return text(await api(base, "/api/focus", { method: "POST", body: JSON.stringify({ id, open: open === true }) }));
    },
  );

  server.registerTool(
    "headcanon_say",
    {
      title: "Say something to the human in the page's chat",
      description:
        "Posts a line from you into the HeadCanon viewer's chat, where the human reads it beside the canvas. Use it to explain a passage they asked about, to summarize what you changed after their edit, to say what is still red and where to start, and to end a working spell: the page shows a working indicator from the human's last action until your next say or question. One or two sentences; the chat is not a report.",
      inputSchema: { text: z.string().describe("What to say, in plain words."), nodeId: z.string().optional().describe("The node this is about, so the page can link it."), to: z.enum(["human", "history"]).optional().describe("'human' when the line asks something of the human or needs their eyes now (a key point); it lands in their chat. Otherwise it is a report of what you did and goes to the page's history.") },
    },
    async ({ text: line, nodeId, to }) => text(await api(base, "/api/say", { method: "POST", body: JSON.stringify({ text: line, nodeId, to }) })),
  );

  server.registerTool(
    "headcanon_changes",
    {
      title: "What the human did in the page",
      description:
        "Returns the feed of what the human did in the HeadCanon viewer since a cursor: nodes they approved, edited, created or deleted (their wording is stated), glossary terms they enshrined or dropped, free-text messages (with `quote` and `nodeId` when the human highlighted a passage in a node's card first), edit-conflict entries when the session rewrote a box the human was writing in and they chose to keep theirs or take the session's, refine-request entries naming a branch to define next, and a finish-request when they pressed Finish. With `waitSeconds` the call waits for the next entry instead of returning at once, which is how a session attends the page. Pass the cursor from the previous call.",
      inputSchema: {
        since: z.number().optional().describe("The cursor returned last time; 0 or omitted for everything."),
        waitSeconds: z.number().optional().describe(`Wait this long for a first entry before returning empty (max ${WAIT_MAX}).`),
      },
    },
    async ({ since, waitSeconds }) => {
      const deadline = Date.now() + Math.min(Math.max(waitSeconds ?? 0, 0), WAIT_MAX) * 1000;
      let r = await api<{ cursor: number; entries: unknown[] }>(base, `/api/changes?since=${since ?? 0}&timeout=${Math.min(25, Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))}`);
      while (!r.entries.length && Date.now() < deadline) {
        const slice = Math.min(25, Math.ceil((deadline - Date.now()) / 1000));
        r = await api(base, `/api/changes?since=${since ?? 0}&timeout=${slice}`);
      }
      return text(r);
    },
  );

  server.registerTool(
    "headcanon_open",
    {
      title: "Open the HeadCanon page in the browser",
      description: "Opens the viewer in the human's default browser and returns its URL. `view` picks the page: `adopt` is the canvas for reviewing a drafted canon.",
      inputSchema: { view: z.string().optional().describe("adopt, tree, health, attention, journeys, decisions or glossary; omitted for the overview.") },
    },
    async ({ view }) => {
      opened = false;
      ensureOpen();
      const url = view ? `${base}/#/${view}` : landing();
      if (view) openBrowser(url);
      return text({ url, base: `${base}/` });
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("MCP server ready");
  await new Promise(() => {});
}
