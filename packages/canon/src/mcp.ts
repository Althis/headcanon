import { spawn } from "node:child_process";
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

async function alive(base: string): Promise<boolean> {
  try {
    const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
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
  const base = `http://127.0.0.1:${opts.port}`;
  if (!(await alive(base))) {
    try {
      await serveUi({ canonDir: opts.canonDir, port: opts.port });
      process.stderr.write(`headcanon: viewer started at ${base}/ for ${opts.canonDir}\n`);
    } catch (e) {
      process.stderr.write(`headcanon: could not start the viewer on ${opts.port} (${e instanceof Error ? e.message : String(e)}); assuming one is running\n`);
    }
  }
  let opened = false;
  const ensureOpen = () => {
    if (opened || !opts.openBrowser) return;
    opened = true;
    openBrowser(`${base}/`);
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

  server.registerTool(
    "headcanon_ask",
    {
      title: "Ask the human through the HeadCanon page",
      description:
        "Shows a question in the HeadCanon viewer beside the canon tree and waits for the human's answer. Use it instead of AskUserQuestion whenever the viewer is available. The question text holds the full draft as prose with footnote markers and a Sources line. Options default to Approve as written and Drop; the human can always type in Other. Pass `terms` for every word in the draft that the glossary does not define, each with your guessed definition: the page marks them and the human keeps (enshrines in the glossary) or drops each one before answering. Pass `nodeId` to open that node on the human's screen. Returns the answer, or {pending: true, questionId} after waitSeconds; then call headcanon_wait.",
      inputSchema: {
        question: z.string().describe("The full question text: layer label, the draft, footnotes, the Sources line, and 'To correct or rewrite, type in Other.'"),
        header: z.string().optional().describe("Short label, e.g. 'Premise (1 of 5)' or 'REQ-1.4'"),
        options: z.array(z.object({ label: z.string(), description: z.string().optional() })).optional().describe("Defaults to Approve as written / Drop. For a list, one option per item with its ID and title."),
        multiSelect: z.boolean().optional().describe("True for a first pass over a list: ticked means approved as written."),
        nodeId: z.string().optional().describe("A canon node to focus on the human's screen while they answer."),
        terms: z.array(z.object({ term: z.string(), definition: z.string() })).optional().describe("Jargon in the draft with the agent's guessed definition, from `headcanon terms`."),
        waitSeconds: z.number().optional().describe(`How long to wait for the answer before returning pending (default ${WAIT_DEFAULT}, max ${WAIT_MAX}).`),
      },
    },
    async (args) => {
      ensureOpen();
      const { waitSeconds, ...req } = args;
      const q = await api<{ questionId: string }>(base, "/api/ask", { method: "POST", body: JSON.stringify(req) });
      return text({ questionId: q.questionId, url: `${base}/`, ...(await waitFor(q.questionId, waitSeconds ?? WAIT_DEFAULT)) });
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
      title: "Open a node on the human's screen",
      description: "Navigates the HeadCanon viewer to a canon node so the human sees what you are talking about.",
      inputSchema: { id: z.string().describe("A node id such as REQ-1.4, or ROOT") },
    },
    async ({ id }) => {
      ensureOpen();
      return text(await api(base, "/api/focus", { method: "POST", body: JSON.stringify({ id }) }));
    },
  );

  server.registerTool(
    "headcanon_changes",
    {
      title: "What the human did in the page",
      description:
        "Returns the feed of what the human did in the HeadCanon viewer since a cursor: nodes they edited or created (treat their wording as stated), glossary terms they enshrined or dropped, free-text messages they typed, and refine-request entries naming a branch they want defined next. Call it before drafting each layer and whenever a question returns. Pass the cursor from the previous call.",
      inputSchema: { since: z.number().optional().describe("The cursor returned last time; 0 or omitted for everything.") },
    },
    async ({ since }) => text(await api(base, `/api/changes?since=${since ?? 0}`)),
  );

  server.registerTool(
    "headcanon_open",
    {
      title: "Open the HeadCanon page in the browser",
      description: "Opens the viewer in the human's default browser and returns its URL.",
      inputSchema: {},
    },
    async () => {
      opened = false;
      ensureOpen();
      return text({ url: `${base}/` });
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("headcanon: MCP server ready\n");
  await new Promise(() => {});
}
