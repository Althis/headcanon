import { existsSync, mkdirSync, readdirSync, readFileSync, readSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkCommitMessage, gitAppendOnlyFiles } from "./commit-msg.js";
import { execFileSync } from "node:child_process";
import { relative } from "node:path";
import { loadReviewRecord, stagedIntentDiff, storeReviewRecord, validateReviewRecord, type ReviewRecord } from "./review.js";
import { runMcp } from "./mcp.js";
import { detectTerms, nameWords } from "./terms.js";
import { adoptionFinished, describeNext, describePath, listGate, pathToValidate, refinementOrder } from "./next.js";
import { OP_NAMES, applyOp, gitDirOf, newUid, opStats, readOps, type Op } from "./ops.js";
import { builtOf } from "./built.js";
import type { Canon, ReqNode } from "./types.js";
import { buildCodeTree, describeTodo, expandUnit, loadCodeTree, loadDescriptions, saveCodeTree, saveDescriptions } from "./code.js";
import { addClaims, coverageFindings, loadClaims, parcelText } from "./parcel.js";
import { coherenceClusters, describeCoherence } from "./coherence.js";
import { sessionContext } from "./context.js";
import { initCanon } from "./init.js";
import { FORMAT_VERSION, describeFormat, upgradeText } from "./format.js";
import { compareIds, loadCanon } from "./load.js";
import { renderMermaidIndex } from "./render.js";
import { buildSnapshot } from "./snapshot.js";
import { serveUi } from "./ui/server.js";
import { isUserEntry, type FeedEntry } from "./session.js";
import { readSettings, writeSettings } from "./settings.js";
import { readJournal, revertTo } from "./journal.js";

const HELP = `headcanon <command> [options]

Commands
  init           Create the canon skeleton and install the commit-msg hook in this repository.
  check          Validate the canon: structure, links, files and states that need a user. Exit 1 on errors.
  summary        Print the requirement tree as plain text.
  render         Write the Mermaid index (canon/INDEX.md by default).
  attention      What is waiting on the user: approvals, unmerged changes, open and contested items.
  next [ID]      Which node to refine next and what the user should approve or settle, by impact; with an ID, the path to validate above it.
  op <JSON|@F|->   Apply one operation to the canon (${OP_NAMES.join(", ")}); checked, logged, rolled back on error. - reads the JSON from stdin.
  op --log [ID]  Print the operations log, or the entries naming ID.  op --stats  Failures per operation, retries per check and per node.
  ask <JSON|@F|->  File an issue in the running viewer's queue (--port) and return at once; {questions: [...]} files several. Who asks (by) and whether the node waits on the answer (blocks) travel in the JSON; --by and --blocks fill them in.
  propose <JSON|@F|->  Record an operation outside your own capability for the session to apply: --why "<reason>" --by <name>.
  proposals      List the proposals (--open: those still waiting).  proposals apply <id>  proposals reject <id> --why "<reason>"
  context <ID>   What a node is read with, within --budget characters: the node whole, its path from the premise, its family, its links, the journeys and decisions that cite it, its relatives in other branches, its terms. ROOT is valid.
  find "<words>"   The nodes that carry the words in a title, an intent, a check, a journey, a decision or a term; one line per hit.
  coherence      Candidates for the cross-branch coherence pass: clusters of nodes in different branches that share a term, a file, a required node or a title word.
  code <sub>     The code tree: build [--repo dir], show <unit>, find "<words>", todo [--level n] [--limit n], describe <JSON|@F>, stats.
  claims         What the documents and the content claim, as a list.  claims add <JSON|@F>
  parcel <ID>    The evidence a node is refined from, within --budget tokens.  parcel --check  Exit 1 while a parent's evidence is not covered by its children, or a requirement does not say where it is built.
  reading parts <n>  The repository's documents in n groups balanced by size, as JSON: one reader per group.
  tests <sub>    The record of tests: runner <name> <JSON>, add <JSON|@F|->, review <uid|ID> pass|fail [--note "<text>"], list [ID], run [ID...] [--kind k] [--all] [--run <run id>], results.
  brief <ID>     The brief an agent starts from: --for implementer|tester|refiner, with --run <run id>, --canon-only, --budget <characters>.
  run <sub>      An Implement/align run: start <ID...> [--single], status, step <name> <status> [--note "<text>"], slice <node> <status> [--agent <agent id>] [--summary "<plain words>"] [--note "<text>"], check <node>, stop.
  build <sub>    prepare: switch to the build branch and commit the canon's pending changes there.  tests [ID...]: commit the accepted tests with the record of tests.
  slice <sub>    The user's decision on what was built for a node: approve <node>, discard <node>.
  working <ID...>  Tell the page where a worker is (--by <worker>).  working --off --by <worker>  The worker is done.
  wait [cursor]  Block until the user acts on the page, then exit; run in the background, it wakes an idle session. --since <cursor> is the same cursor.
  history        The recorded changes to the canon, newest first (--limit).  revert <seq>  Restore the canon to before that change.
  settings [guided|full-auto]  Print the settings the user chose on the page; with a mode, store that mode first.
  upgrade        Bring an older canon up to this format: states, section names, a uid where one is missing.
  commit-msg F   Validate the commit message in file F (used by the git hook). Exit 1 on errors.
  review-hash    Describe the staged canon diff: its hash and whether it needs a semantic review.
  review-record F  Store the finished review in F (JSON) for the staged canon diff. Exit 1 if invalid.
  format         Print the canon format: every type, the start sequence, the versions (--out writes it to a file).
  session-start  Print the session context as a Claude Code SessionStart hook result.
  stop-hook      As a Claude Code Stop hook: refuse to end the turn while an adoption is unfinished and the viewer is up, unless a waiter is armed.
  prompt-hook    As a Claude Code UserPromptSubmit hook: mirror the user's terminal prompt into the page's chat.
  gate subagent-stop  As a Claude Code SubagentStop hook: let an implementation agent stop only when the tests of its nodes pass, or each node still failing has an issue it filed.
  ui             Serve the local viewer.
  mcp            Serve the MCP tools for Claude Code over stdio (starts the viewer when none runs).
  terms          List candidate jargon in a draft (--text or stdin) that the glossary does not define.

Options
  --canon <dir>   Canon directory (default: ./canon, or $CLAUDE_PROJECT_DIR/canon for mcp and the hooks)
  --port <n>      Port of the viewer (default: 4317)
  --no-open       For mcp: do not open the browser on the first question
  --text <draft>  For terms: the draft to scan
  --by <who>      Who asks: written to the log for op, to the issue for ask, to the record for propose and tests; the worker for working and parcel
  --blocks        For ask: the node cannot be built until the user settles the issue
  --under <ID>    For next: only the nodes under ID, what one agent owns
  --log, --stats  For op: read the log instead of applying
  --check         For parcel: check the coverage instead of printing a parcel
  --budget <n>    For parcel, context and brief: how much to print
  --repo <dir>    The repository root, when it is not the folder above the canon
  --out <file>    Output file for render and format
  --json          Machine-readable output
  --force         For init: replace a commit-msg hook HeadCanon did not install
  --depth <n>     For summary: deepest level to print
`;

/** The launcher the git hook and the plugin call; resolves from src/ and dist/ alike. */
const BIN = fileURLToPath(new URL("../bin/headcanon.js", import.meta.url));

interface Args {
  command: string | undefined;
  /** `wait --since <cursor>`: the same as the positional cursor, since the skill text and the session both reach for it */
  since?: number | undefined;
  /** `working --off`: the worker is done with what it signalled */
  off?: boolean | undefined;
  positional: string[];
  canon: string | undefined;
  port: number;
  out: string | undefined;
  json: boolean;
  force: boolean;
  depth: number | undefined;
  open: boolean;
  text: string | undefined;
  by: string | undefined;
  log: boolean;
  stats: boolean;
  under: string | undefined;
  repo: string | undefined;
  level: number | undefined;
  limit: number | undefined;
  budget: number | undefined;
  check: boolean;
  /** `ask --blocks`: the node cannot be built until the user settles the issue */
  blocks: boolean;
  /** Options this parser does not know; a command whose module reads its own arguments expects them */
  unknown: string[];
  /** What follows the command word, as typed and with the shared options taken out: what a module's cli is handed */
  rest: string[];
}

/** The options every command shares. A module's cli finds them in its context, so they are taken out of its arguments. */
const SHARED_VALUED = new Set(["--canon", "--port", "--by", "--repo"]);

function withoutShared(argv: string[]): string[] {
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i]!;
    const eq = x.indexOf("=");
    if (SHARED_VALUED.has(x)) i++;
    else if (x !== "--json" && !(eq > 0 && SHARED_VALUED.has(x.slice(0, eq)))) rest.push(x);
  }
  return rest;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { command: undefined, positional: [], canon: undefined, port: 4317, out: undefined, json: false, force: false, depth: undefined, open: true, text: undefined, by: undefined, log: false, stats: false, under: undefined, repo: undefined, level: undefined, limit: undefined, budget: undefined, check: false, blocks: false, unknown: [], rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i]!;
    const next = () => argv[++i];
    if (x === "--canon") a.canon = next();
    else if (x.startsWith("--canon=")) a.canon = x.slice(8);
    else if (x === "--port") a.port = Number(next() ?? a.port);
    else if (x.startsWith("--port=")) a.port = Number(x.slice(7));
    else if (x === "--out") a.out = next();
    else if (x.startsWith("--out=")) a.out = x.slice(6);
    else if (x === "--depth") a.depth = Number(next());
    else if (x.startsWith("--depth=")) a.depth = Number(x.slice(8));
    else if (x === "--json") a.json = true;
    else if (x === "--force") a.force = true;
    else if (x === "--no-open") a.open = false;
    else if (x === "--text") a.text = next();
    else if (x.startsWith("--text=")) a.text = x.slice(7);
    else if (x === "--by") a.by = next();
    else if (x.startsWith("--by=")) a.by = x.slice(5);
    else if (x === "--log") a.log = true;
    else if (x === "--stats") a.stats = true;
    else if (x === "--under") a.under = next();
    else if (x === "--since") a.since = Number(next());
    else if (x === "--off") a.off = true;
    else if (x === "--repo") a.repo = next();
    else if (x.startsWith("--repo=")) a.repo = x.slice(7);
    else if (x === "--level") a.level = Number(next());
    else if (x.startsWith("--level=")) a.level = Number(x.slice(8));
    else if (x === "--limit") a.limit = Number(next());
    else if (x === "--budget") a.budget = Number(next());
    else if (x.startsWith("--budget=")) a.budget = Number(x.slice(9));
    else if (x === "--check") a.check = true;
    else if (x === "--blocks") a.blocks = true;
    else if (x.startsWith("--under=")) a.under = x.slice(8);
    // a lone dash is an argument: the JSON arrives on stdin
    else if (x.startsWith("-") && x !== "-") a.unknown.push(x);
    else if (!a.command) { a.command = x; a.rest = withoutShared(argv.slice(i + 1)); }
    else a.positional.push(x);
  }
  return a;
}

/**
 * All of stdin, read at once: where `-` in place of JSON reads from, and where a hook's input arrives. It waits for
 * the end of the input, so it is called only when the command line asked for stdin. Empty on a terminal.
 */
function stdinText(): string {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  const buf = Buffer.alloc(65536);
  for (;;) {
    let n: number;
    try { n = readSync(0, buf, 0, buf.length, null); }
    catch (e) {
      // a pipe that has nothing yet says so with an error; the end of a pipe on Windows is an error too
      if ((e as NodeJS.ErrnoException).code === "EAGAIN") { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10); continue; }
      break;
    }
    if (n === 0) break;
    chunks.push(Buffer.from(buf.subarray(0, n)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** JSON given on the line, in a file as `@file`, or on stdin as `-`, which spares an agent a temporary file. */
function jsonText(raw: string, stdin: () => string): string {
  const text = raw === "-" ? stdin() : raw.startsWith("@") ? readFileSync(resolve(raw.slice(1)), "utf8") : raw;
  if (raw === "-" && !text.trim()) throw new Error("nothing arrived on stdin");
  return text.replace(/^\uFEFF/, "");
}

/** What `main` reads besides its arguments; a test hands it in, the launcher leaves it to the process. */
export interface MainIo {
  /** All of stdin as text. */
  stdin?: () => string;
}

/** What a module's `cli` function is handed (the same shape each module declares for itself). */
interface CliCtx { canonDir: string; repo: string; gitDir: string | undefined; port: number; by: string | undefined; json: boolean; out: (s: string) => void; err: (s: string) => void; stdin: () => string }

/** The commands a module owns whole: its arguments, its output and its exit code. */
const ROUTED = new Set(["context", "find", "reading", "propose", "proposals", "tests", "run", "brief", "gate", "slice", "build"]);

/** Hand a command to its module; undefined when the command is not one a module owns. Each module is loaded only when its command runs, so the hooks start fast. */
async function routed(command: string, rest: string[], ctx: CliCtx): Promise<number | undefined> {
  switch (command) {
    case "context": return (await import("./lookup.js")).lookupCli("context", rest, ctx);
    case "find": return (await import("./lookup.js")).lookupCli("find", rest, ctx);
    case "code": return rest[0] === "find" ? (await import("./lookup.js")).lookupCli("code-find", rest.slice(1), ctx) : undefined;
    case "reading":
      if (rest[0] !== "parts") { ctx.err("usage: headcanon reading parts <n>\n"); return 2; }
      return (await import("./lookup.js")).lookupCli("reading-parts", rest.slice(1), ctx);
    case "propose": case "proposals": return (await import("./proposals.js")).proposalsCli(command, rest, ctx);
    case "tests": return (await import("./testing.js")).testsCli(rest, ctx);
    case "run": return (await import("./runs.js")).runCli(rest, ctx);
    case "brief": return (await import("./brief.js")).briefCli(rest, ctx);
    case "gate": return (await import("./gate.js")).gateCli(rest, ctx);
    // one module answers both words, so it is handed the word too
    case "slice": case "build": return (await import("./approve.js")).approveCli([command, ...rest], ctx);
    default: return undefined;
  }
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  return new Promise((ok) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => ok(data));
    process.stdin.on("error", () => ok(data));
    setTimeout(() => ok(data), 2000).unref();
  });
}

/** The Stop hook's input as Claude Code sends it; every field may be absent. */
interface StopHookInput {
  cwd?: string;
  transcript_path?: string;
  last_assistant_message?: string;
  stop_hook_active?: boolean;
  background_tasks?: Array<{ type?: string; status?: string }>;
}

/** True while `headcanon wait` runs for this canon: its marker exists and is younger than a working day. */
function waiterArmed(canonDir: string): boolean {
  const git = gitDirOf(canonDir);
  const marker = git ? join(git, "headcanon", "waiting") : undefined;
  if (!marker || !existsSync(marker)) return false;
  try { return Date.now() - statSync(marker).mtimeMs < 8 * 3600_000; } catch { return false; }
}

/** What the stop hook's rule weighs; gathered by the command, judged by `stopDecision`. */
export interface StopFacts {
  /** The adoption is finished (`adoptionComplete`), or there is no canon to attend. */
  finished: boolean;
  /** No canon exists here yet: nothing to attend, whatever viewer answers. */
  noCanon?: boolean | undefined;
  /** A viewer serves this canon. */
  viewerAnswers: boolean;
  /** The user's list is open (the gate): they may be working it, so the session keeps attending. */
  gateOpen: boolean;
  /** The session's last words, when the hook input carries them. */
  lastAssistantMessage?: string | undefined;
  /** The last assistant text in the transcript, read only when the hook input carries no message. */
  transcriptTail?: string | undefined;
  /** Claude Code's background tasks, when the hook input carries them; absent means nothing in flight. */
  backgroundTasks?: Array<{ type?: string; status?: string }> | undefined;
  /** `headcanon wait` is running for this canon: the user's next action wakes the session, so it may stop (DEC-025). */
  waiterArmed?: boolean | undefined;
}

export const STOP_BLOCK_REASON = "The viewer is up and no waiter is armed, so the user's next action on the page (an answer, an edit, Implement) would not reach you. Arm it and end the turn: run `HC wait --port <port> <cursor>` (HC as the attend skill defines it, the cursor the last headcanon_changes returned) with the Bash tool's run_in_background; the user's next action on the page wakes you, your own messages do not. Say the words 'stopping attend' only when the user asked you to stop.";

const red = (n: ReqNode): boolean => n.state === "draft" || n.state === "contested";

/**
 * The adoption is finished: the canon holds requirements, every branch ends in a requirement with a check, and each
 * requirement with a check says where it is built or that it is not. A red node, a draft or a contested one, waits on
 * the user and holds nothing, and neither does what hangs under it. No decision record is read: the first one
 * written during an adoption would otherwise end the attendance, and an adoption that writes none would never end.
 */
export function adoptionComplete(canon: Canon): boolean {
  const nodes = Object.values(canon.nodes);
  const waits = (n: ReqNode | undefined): boolean => n !== undefined && (red(n) || waits(n.parent ? canon.nodes[n.parent] : undefined));
  return nodes.length > 0 && nodes.every((n) => waits(n) || (n.kind ? builtOf(n).built !== "unstated" : n.children.length > 0));
}

/**
 * Whether the session may end its turn (REQ-11.1): yes when a waiter is armed, when no viewer is up, when its last
 * words say "stopping attend", or, while the adoption is unfinished, when a subagent runs with the user's list closed,
 * since its report wakes the session. Otherwise the session arms the waiter first. A finished adoption does not end
 * the listening: the page's buttons, Implement among them, reach the session only through a waiter (DEC-026).
 * Pure, so the rule is tested apart from stdin and the viewer.
 */
export function stopDecision(f: StopFacts): { decision: "allow" | "block"; reason: string } {
  if (f.noCanon) return { decision: "allow", reason: "there is no canon to attend" };
  if (f.waiterArmed) return { decision: "allow", reason: "a waiter is armed: the user's next action wakes the session" };
  if (!f.viewerAnswers) return { decision: "allow", reason: "no viewer answers" };
  // the hook's own field is the session's last message; the transcript is the fallback when the field is absent
  if (/stopping attend/i.test(f.lastAssistantMessage ?? f.transcriptTail ?? "")) return { decision: "allow", reason: "the session said it is stopping attend" };
  // a running refiner wakes the session with its report; while the list is open the user may be working it
  if (!f.finished && !f.gateOpen && (f.backgroundTasks ?? []).some((t) => t.type === "subagent")) return { decision: "allow", reason: "a subagent is running and the user's list is closed: its report wakes the session" };
  return { decision: "block", reason: STOP_BLOCK_REASON };
}

/** The text of the last assistant message in a Claude Code transcript; undefined when there is none to read. */
export function lastAssistantText(transcriptPath: string | undefined): string | undefined {
  if (!transcriptPath || !existsSync(transcriptPath)) return undefined;
  const lines = readFileSync(transcriptPath, "utf8").split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0 && i > lines.length - 60; i--) {
    try {
      const j = JSON.parse(lines[i]!) as { type?: string; message?: { content?: Array<{ type: string; text?: string }> } };
      if (j.type !== "assistant") continue;
      return (j.message?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join(" ");
    } catch { /* not a message line */ }
  }
  return undefined;
}

/**
 * One request to the viewer on this machine; undefined when nothing answered in time. Every request carries a
 * timeout, and none is left open when the promise settles: it resolves when the socket has closed. The global
 * `fetch` is not used by any command that ends: on Windows a process that calls `process.exit` after it dies with a
 * libuv assertion (measured on Node 24: three requests and an exit, every run), which lost the Stop hook's decision.
 */
function call(port: number, path: string, opts: { body?: unknown; agent?: string; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<{ status: number; text: string } | undefined> {
  return new Promise((ok) => {
    const payload = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const timeoutMs = opts.timeoutMs ?? 1500;
    let status = 0, text = "", whole = false, settled = false;
    const req = httpRequest({
      host: "127.0.0.1", port, path, method: payload === undefined ? "GET" : "POST", agent: false, timeout: timeoutMs,
      headers: { connection: "close", ...(payload === undefined ? {} : { "content-type": "application/json", "content-length": Buffer.byteLength(payload) }), ...(opts.agent ? { "x-headcanon-agent": opts.agent } : {}) },
      ...(opts.signal ? { signal: opts.signal } : {}),
    }, (res) => {
      status = res.statusCode ?? 0;
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (text += chunk));
      res.on("end", () => (whole = true));
    });
    // the socket's own timeout covers silence; the deadline covers an answer that trickles
    const deadline = setTimeout(() => req.destroy(), timeoutMs);
    const settle = () => { if (settled) return; settled = true; clearTimeout(deadline); ok(whole ? { status, text } : undefined); };
    req.on("socket", (socket) => socket.once("close", settle));
    req.on("timeout", () => req.destroy());
    req.on("error", () => { /* the close that follows settles it */ });
    req.on("close", () => { if (!req.socket) settle(); });
    req.end(payload);
  });
}

function samePath(a: string, b: string): boolean {
  const norm = (p: string) => resolve(p).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? norm(a).toLowerCase() === norm(b).toLowerCase() : norm(a) === norm(b);
}

/**
 * The port where a viewer serves this canon; undefined when none does. The MCP server starts the viewer on the
 * first free port from `first` up, past any that serve another project, so the same ports are asked here and a
 * hook never speaks to another project's page.
 */
async function viewerFor(canonDir: string, first: number): Promise<number | undefined> {
  const ports = Array.from({ length: 10 }, (_, i) => first + i);
  const answers = await Promise.all(ports.map((port) => call(port, "/api/health", { timeoutMs: 800 })));
  return ports.find((_, i) => {
    try { const canon = (JSON.parse(answers[i]?.text ?? "{}") as { canon?: unknown }).canon; return answers[i]?.status === 200 && typeof canon === "string" && samePath(canon, canonDir); }
    catch { return false; /* something else listens there */ }
  });
}

/** Where a worker is now, to the page; a viewer that is not up costs one refused connection and nothing else. */
async function signalWorking(port: number, ids: string[], by: string): Promise<void> {
  await call(port, "/api/working", { body: { ids, on: true, by }, agent: by, timeoutMs: 800 });
}

/** Whether a viewer answers on the port. */
async function viewerUp(port: number): Promise<boolean> {
  return (await call(port, "/api/health"))?.status === 200;
}

/**
 * The nodes whose agents were dispatched and have not reported: a `dispatch` record in the operations log with no
 * later `returned` record for the same id. The records are read as `{ op, id }`, whatever kinds the log's types name;
 * a refused attempt (`ok: false`, an id outside the canon) handed nothing to anyone and is passed over.
 */
export function heldNodes(records: ReadonlyArray<{ ok?: boolean; request: { op: string; id?: string } }>): string[] {
  const held = new Set<string>();
  for (const { ok, request } of records) {
    if (ok === false || !request.id) continue;
    if (request.op === "dispatch") held.add(request.id);
    else if (request.op === "returned") held.delete(request.id);
  }
  return [...held].sort(compareIds);
}

export async function main(argv: string[], io: MainIo = {}): Promise<number> {
  const args = parseArgs(argv);
  const out = (s: string) => process.stdout.write(s);
  const err = (s: string) => process.stderr.write(s);
  if (!args.command || args.command === "help" || argv.includes("--help")) {
    out(HELP);
    return 0;
  }
  // stdin is read once, and only when a command asks for it
  let piped: string | undefined;
  const stdin = (): string => (piped ??= (io.stdin ?? stdinText)());
  /** A hook's input: stdin as Claude Code sends it, given up on after two seconds so a hook never hangs on a pipe left open. */
  const hookInput = async (): Promise<string> => (io.stdin ? stdin() : await readStdin());
  const routedHere = ROUTED.has(args.command) || (args.command === "code" && args.rest[0] === "find");
  if (!routedHere) for (const x of args.unknown) err(`ignoring unknown option ${x}\n`);
  const ctxFor = (canonDir: string): CliCtx => ({ canonDir, repo: args.repo ? resolve(args.repo) : dirname(canonDir), gitDir: gitDirOf(canonDir), port: args.port, by: args.by, json: args.json, out, err, stdin });

  // The three hooks never fail: an exit code other than 0 from a hook reaches the session as a refusal, so whatever
  // goes wrong is written to stderr and the hook lets go.
  // prompt-hook: the user's terminal prompt is mirrored into the page's chat as a terminal line (DEC-025), so the
  // page and the terminal read as one conversation; the session does not act on it, it already has the prompt.
  if (args.command === "prompt-hook") {
    try {
      let input: { prompt?: string; cwd?: string } = {};
      try { input = JSON.parse((await hookInput()) || "{}") as { prompt?: string; cwd?: string }; } catch { /* no hook input */ }
      const text = typeof input.prompt === "string" ? input.prompt.trim() : "";
      if (text && !text.startsWith("<")) {
        const port = await viewerFor(resolve(process.env["CLAUDE_PROJECT_DIR"] ?? input.cwd ?? process.cwd(), args.canon ?? "canon"), args.port);
        if (port !== undefined) await call(port, "/api/terminal", { body: { role: "user", text: text.slice(0, 4000) } });
      }
    } catch (e) { err(`prompt-hook: ${e instanceof Error ? e.message : String(e)}\n`); }
    return 0;
  }

  // stop-hook: a session that attends an unfinished adoption never ends its turn by accident. It may stop when the
  // adoption is finished, when a waiter is armed, when no viewer serves this canon, when its last words say
  // "stopping attend", or when a subagent runs while the user's list is closed; the rule is `stopDecision`, this
  // gathers what it weighs. Whether the adoption is finished is read from the canon alone (`adoptionComplete`);
  // the viewer and the waiter are asked apart from it, so the terminal mirror works after the adoption too.
  if (args.command === "stop-hook") {
    try {
      let input: StopHookInput = {};
      try { input = JSON.parse((await hookInput()) || "{}") as StopHookInput; } catch { /* no hook input */ }
      const cwd = process.env["CLAUDE_PROJECT_DIR"] ?? input.cwd ?? process.cwd();
      const canonDir = resolve(cwd, args.canon ?? "canon");
      const said = typeof input.last_assistant_message === "string" ? input.last_assistant_message : undefined;
      const port = await viewerFor(canonDir, args.port);
      // the session's last words go to the page's chat as a terminal line, whatever the decision
      if (port !== undefined && said && !/stopping attend/i.test(said)) await call(port, "/api/terminal", { body: { role: "session", text: said.slice(0, 4000) } });
      const armed = waiterArmed(canonDir);
      // the canon and the transcript are read only while they can still change the outcome
      const attending = port !== undefined && !armed;
      const noCanon = !existsSync(join(canonDir, "README.md"));
      let finished = noCanon, gateOpen = false;
      if (attending && !finished) {
        try { const canon = loadCanon(canonDir); finished = adoptionComplete(canon); gateOpen = listGate(canon).open; }
        catch { gateOpen = true; /* an unreadable canon is an unfinished one, and the user may be at the list */ }
      }
      const d = stopDecision({
        finished,
        noCanon,
        viewerAnswers: port !== undefined,
        gateOpen,
        lastAssistantMessage: said,
        transcriptTail: attending && !finished && said === undefined ? lastAssistantText(input.transcript_path) : undefined,
        backgroundTasks: Array.isArray(input.background_tasks) ? input.background_tasks : undefined,
        waiterArmed: armed,
      });
      if (d.decision === "block" && port !== undefined) {
        // the reason names the exact command, port and cursor included, so the session arms the waiter instead of polling
        let cursor = 0;
        try { cursor = (JSON.parse((await call(port, "/api/changes?since=0&timeout=0"))?.text ?? "{}") as { cursor?: number }).cursor ?? 0; } catch { /* the page is gone */ }
        out(JSON.stringify({ decision: "block", reason: `${d.reason} Right now: \`HC wait --port ${port} ${cursor}\`.` }) + "\n");
      }
    } catch (e) { err(`stop-hook: ${e instanceof Error ? e.message : String(e)}\n`); }
    return 0;
  }

  // gate: the SubagentStop hook. It runs in every project the plugin is on, with or without a canon, so it comes
  // before the check that a canon exists; its module finds the run from the hook's input.
  if (args.command === "gate") {
    try {
      let cwd: string | undefined;
      try { const c = (JSON.parse(stdin() || "{}") as { cwd?: unknown }).cwd; if (typeof c === "string") cwd = c; } catch { /* no hook input */ }
      return (await routed("gate", args.rest, ctxFor(resolve(process.env["CLAUDE_PROJECT_DIR"] ?? cwd ?? process.cwd(), args.canon ?? "canon")))) ?? 0;
    } catch (e) { err(`gate: ${e instanceof Error ? e.message : String(e)}\n`); return 0; }
  }

  // session-start must never break a session: it answers even without a canon, and never throws.
  if (args.command === "session-start") {
    let cwd = process.cwd();
    let source = "";
    try {
      const input = JSON.parse((await hookInput()) || "{}") as { cwd?: string; source?: string };
      if (input.cwd) cwd = input.cwd;
      if (input.source) source = input.source;
    } catch {
      /* no hook input */
    }
    if (process.env["CLAUDE_PROJECT_DIR"] && !argv.includes("--canon")) cwd = process.env["CLAUDE_PROJECT_DIR"];
    const canonDir = resolve(cwd, args.canon ?? "canon");
    let context: string;
    try {
      context = existsSync(canonDir) ? sessionContext(buildSnapshot(canonDir), canonDir) : sessionContext(undefined, canonDir);
      // after a compaction or a resume mid-adoption the loop's procedure is gone from the context; the canon on disk
      // is the state, so the session is told where to pick it up instead of ending its turn. A canon with a scope
      // record was written by hand or adopted before this loop, and is never sent back into it.
      const canon = (source === "compact" || source === "resume") && existsSync(canonDir) ? loadCanon(canonDir) : undefined;
      if (canon?.root && !adoptionFinished(canon) && !adoptionComplete(canon))
        context += `\n\n## An adoption is unfinished\n\nThe canon exists and some of its branches do not end in a requirement with a check yet: the attend loop was running before this ${source}. Re-read the attend skill (skills/attend/SKILL.md under the plugin root) and continue from \`headcanon next --json\`: the canon on disk and the operations log are the whole state; nothing in memory is needed. \`headcanon next --json\` lists under \`held\` the nodes whose agents were dispatched and have not reported; do not dispatch those again, their reports arrive as notifications.`;
    } catch (e) {
      context = `# HeadCanon\n\nThe canon at ${canonDir} could not be read: ${e instanceof Error ? e.message : String(e)}\nRun \`headcanon check\` and fix the file it names before relying on the canon.`;
    }
    out(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } }) + "\n");
    return 0;
  }

  // mcp runs for the whole session; the canon is the project's, which Claude Code names in the environment.
  if (args.command === "mcp") {
    const projectDir = process.env["CLAUDE_PROJECT_DIR"] || process.cwd();
    const canonDir = resolve(args.canon ?? resolve(projectDir, "canon"));
    // a trial run sets these so it never takes the default port or opens a tab on the owner's screen
    const envPort = Number(process.env["HEADCANON_PORT"]);
    await runMcp({ canonDir, port: argv.includes("--port") || !Number.isInteger(envPort) || envPort <= 0 ? args.port : envPort, openBrowser: args.open && process.env["HEADCANON_NO_OPEN"] !== "1" });
    return 0;
  }

  if (args.command === "terms") {
    const draft = args.text ?? (await readStdin());
    const glossaryDir = resolve(args.canon ?? "canon");
    const canon = existsSync(glossaryDir) ? loadCanon(glossaryDir) : undefined;
    // The project's own name is never jargon: the canon's title, or the repository folder before init.
    const ignore = nameWords(canon?.root?.title ?? basename(dirname(glossaryDir)));
    const found = detectTerms(draft, canon?.terms ?? [], { ignore });
    out(args.json ? JSON.stringify(found) + "\n" : found.length ? found.join("\n") + "\n" : "");
    return 0;
  }

  if (args.command === "init") {
    const r = initCanon({ repoDir: process.cwd(), cliPath: BIN, force: args.force, ...(args.canon ? { canonDir: args.canon } : {}) });
    for (const c of r.created) out(`created ${c}\n`);
    for (const n of r.notes) out(`note: ${n}\n`);
    out(r.hookInstalled ? `commit-msg hook: ${r.hookPath}\n` : "commit-msg hook: not installed\n");
    out(`canon: ${r.canonDir}\nNext: run /headcanon:adopt in Claude Code, or write canon/README.md by hand.\n`);
    return 0;
  }

  const canonDir = resolve(args.canon ?? "canon");

  if (args.command === "commit-msg") {
    const file = args.positional[0];
    if (!file) {
      err("usage: headcanon commit-msg <message-file> [--canon dir]\n");
      return 2;
    }
    const canon = existsSync(canonDir) ? loadCanon(canonDir) : undefined;
    const repoRoot = repoRootOf(process.cwd()) ?? repoRootOf(dirnameOf(file));
    let review: import("./commit-msg.js").ReviewState | undefined;
    if (repoRoot) {
      const diff = stagedIntentDiff(repoRoot, canonPathspec(repoRoot, canonDir));
      const record = diff.required ? loadReviewRecord(repoRoot, diff.hash) : undefined;
      review = { diff, record, recordErrors: record ? validateReviewRecord(record, diff) : [] };
    }
    const r = checkCommitMessage(readFileSync(file, "utf8"), canon, { appendOnly: repoRoot ? gitAppendOnlyFiles(repoRoot) : [], ...(review ? { review } : {}) });
    for (const w of r.warnings) err(`warning: ${w}\n`);
    if (!r.ok) {
      err("HeadCanon rejected the commit message:\n");
      for (const e of r.errors) err(`  - ${e}\n`);
      err("\nFormat: Conventional Commits header, a blank line, prose, a blank line, then trailers:\n  Intent: REQ-1.2            (or: none (reason))\n  Intent-Change: update REQ-1.2\n  Approved-By: <git user.name> or pending (how approval happens)\n");
      if (!canon) err(`(no canon found at ${canonDir}; ids were not checked)\n`);
      return 1;
    }
    return 0;
  }

  if (args.command === "review-hash" || args.command === "review-record") {
    const repoRoot = repoRootOf(process.cwd());
    if (!repoRoot) {
      err("not a git repository\n");
      return 2;
    }
    const diff = stagedIntentDiff(repoRoot, canonPathspec(repoRoot, canonDir));
    if (args.command === "review-hash") {
      out(JSON.stringify(diff, null, 2) + "\n");
      return 0;
    }
    const file = args.positional[0];
    if (!file) {
      err("usage: headcanon review-record <review.json>\n");
      return 2;
    }
    let rec: ReviewRecord;
    try {
      rec = JSON.parse(readFileSync(file, "utf8")) as ReviewRecord;
    } catch (e) {
      err(`cannot read ${file}: ${e instanceof Error ? e.message : String(e)}\n`);
      return 2;
    }
    if (!rec.at) rec.at = new Date().toISOString();
    const problems = validateReviewRecord(rec, diff);
    if (problems.length) {
      err("The review record was not stored:\n");
      for (const p of problems) err(`  - ${p}\n`);
      return 1;
    }
    const path = storeReviewRecord(repoRoot, rec);
    out(`stored ${path}\n${rec.findings.length} finding(s), all resolved; ${diff.affectedParents.length} untouched parent(s) accounted for; add the trailer: Intent-Review: ${diff.hash}, ${rec.findings.length} finding(s)\n`);
    return 0;
  }

  // The viewer serves an empty canon before init, as the MCP server does; every other command needs one.
  if (!existsSync(canonDir) && args.command !== "ui" && args.command !== "format") {
    err(`No canon at ${canonDir}. Run \`headcanon init\`, or pass --canon <dir>.\n`);
    return 2;
  }

  // a command a module owns whole: its arguments are its own, and the shared options reach it in the context
  if (routedHere) {
    const code = await routed(args.command, args.rest, ctxFor(canonDir));
    if (code !== undefined) return code;
  }

  switch (args.command) {
    case "check": {
      const snap = buildSnapshot(canonDir);
      if (args.json) out(JSON.stringify(snap.findings, null, 2) + "\n");
      else {
        for (const f of snap.findings) out(`${f.level.padEnd(5)} ${f.code.padEnd(20)} ${f.message}\n`);
        const { errors, warnings, infos, nodes, unrefined } = snap.stats;
        out(`\n${nodes} requirements, ${errors} errors, ${warnings} warnings, ${infos} notes, ${unrefined} leaves to refine\n`);
      }
      return snap.stats.errors > 0 ? 1 : 0;
    }
    case "summary": {
      const snap = buildSnapshot(canonDir);
      const { renderTextTree } = await import("./tree.js");
      out((args.depth === undefined ? snap.textTree : renderTextTree(snap.canon, snap.findings, { maxDepth: args.depth })) + "\n");
      return 0;
    }
    case "format": {
      const doc = describeFormat() + "\n";
      if (args.out) { writeFileSync(resolve(args.out), doc); out(`wrote ${resolve(args.out)}\n`); } else out(doc);
      return 0;
    }
    case "render": {
      const snap = buildSnapshot(canonDir);
      const target = resolve(args.out ?? join(canonDir, "INDEX.md"));
      writeFileSync(target, renderMermaidIndex(snap.canon, snap.findings));
      out(`wrote ${target}\n`);
      return 0;
    }
    case "code": {
      // The code tree (DEC-025): built by the parser, described by the readers, read by the refiners through parcels.
      const git = gitDirOf(canonDir);
      if (!git) { err("no git repository above the canon; the code tree lives in its .git/headcanon/code\n"); return 1; }
      const sub = args.positional[0];
      if (sub === "build") {
        const repo = args.repo ? resolve(args.repo) : dirname(canonDir);
        const tree = buildCodeTree(repo, { skip: [relative(repo, canonDir).replace(/\\/g, "/")] });
        const file = saveCodeTree(git, tree);
        out(`${tree.stats.functions} functions in ${tree.files.length} files; calls ${tree.stats.calls} sure, ${tree.stats.possible} possible, ${tree.stats.unresolved} unresolved; ${tree.stats.unreachable} unreachable; clusters by level ${tree.stats.clustersByLevel.join(" > ")}; ${file}\n`);
        return 0;
      }
      const tree = loadCodeTree(git);
      if (!tree) { err("no code tree yet: run `headcanon code build`\n"); return 1; }
      const d = loadDescriptions(git);
      if (sub === "show") { const u = expandUnit(tree, d, args.positional[1] ?? ""); if (!u) { err("no such unit\n"); return 1; } out(JSON.stringify(u, null, 2) + "\n"); return 0; }
      if (sub === "todo") { out(JSON.stringify(describeTodo(tree, d, args.level ?? 0, args.limit ?? 50), null, 1) + "\n"); return 0; }
      if (sub === "describe") {
        const raw = args.positional[1] ?? "";
        let body: Record<string, unknown>;
        try { body = JSON.parse(raw.startsWith("@") ? readFileSync(resolve(raw.slice(1)), "utf8") : raw) as Record<string, unknown>; } catch { err("usage: headcanon code describe '{\"<unit id>\": \"<description>\"}' or @file\n"); return 1; }
        let n = 0; const at = new Date().toISOString();
        for (const [id, text] of Object.entries(body)) if ((tree.clusters[id] || tree.functions[id]) && typeof text === "string" && text.trim()) { d[id] = { text: text.trim(), at, ...(args.by ? { by: args.by } : {}) }; n++; }
        saveDescriptions(git, d);
        out(`${n} described; ${Object.keys(d).length} of ${Object.keys(tree.functions).length + Object.keys(tree.clusters).length} units have a description\n`);
        return 0;
      }
      if (sub === "stats") { out(JSON.stringify({ ...tree.stats, files: tree.files.length, levels: tree.levels, roots: tree.roots, described: Object.keys(d).length }, null, 2) + "\n"); return 0; }
      err("usage: headcanon code build [--repo dir] | show <unit> | todo [--level n] [--limit n] | describe <json|@file> [--by who] | stats\n");
      return 1;
    }
    case "claims": {
      const git = gitDirOf(canonDir);
      if (!git) { err("no git repository above the canon\n"); return 1; }
      if (args.positional[0] === "add") {
        const raw = args.positional[1] ?? "";
        let body: unknown;
        try { body = JSON.parse(raw.startsWith("@") ? readFileSync(resolve(raw.slice(1)), "utf8") : raw); } catch { err("usage: headcanon claims add <json array|@file>\n"); return 1; }
        const r = addClaims(git, (Array.isArray(body) ? body : [body]) as Parameters<typeof addClaims>[1]);
        out(`${r.added} added; ${r.total} claims\n`);
        return 0;
      }
      const claims = loadClaims(git);
      out(args.json ? JSON.stringify(claims, null, 1) + "\n" : claims.map((c) => `${c.id} (${c.kind}, ${c.date}) ${c.statement} — ${c.sources.join("; ")}`).join("\n") + "\n");
      return 0;
    }
    case "parcel": {
      // reading a parcel is the start of a worker's turn on that node: the page shows the worker there from this moment
      if (args.by && args.positional[0] && !args.check) await signalWorking(args.port, [args.positional[0]], args.by);
      const git = gitDirOf(canonDir);
      const canon = loadCanon(canonDir);
      const tree = git ? loadCodeTree(git) : undefined, d = git ? loadDescriptions(git) : {}, claims = git ? loadClaims(git) : [];
      if (args.check) {
        const f = coverageFindings(canon, tree);
        out(f.length ? f.map((x) => `warn  ${x.code}  ${x.message}`).join("\n") + "\n" : "every parent's parcel is covered by its children\n");
        return f.length ? 1 : 0;
      }
      const id = args.positional[0];
      if (!id) { err("usage: headcanon parcel <node id|ROOT> [--budget tokens] | --check\n"); return 1; }
      if (id !== "ROOT" && !canon.nodes[id]) { err(`${id} is not in the canon\n`); return 1; }
      const p = parcelText(canon, id, tree, d, claims, args.budget ?? 20000);
      out(p.text + (p.truncated ? `\n(truncated at ${args.budget ?? 20000} tokens; \`headcanon code show <unit>\` has the rest)\n` : ""));
      return 0;
    }
    case "upgrade": {
      // The mechanical part of bringing a canon up to this format (format 4): state open to draft, As built to
      // Implemented by, a uid where a requirement has none, and the version on the root.
      let files = 0; const what = new Map<string, number>();
      const walk = (dir: string) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const p = join(dir, e.name);
          if (e.isDirectory()) walk(p);
          else if (e.name.endsWith(".md")) { const r = upgradeText(readFileSync(p, "utf8"), newUid); if (r.changed.length) { writeFileSync(p, r.text); files++; for (const c of r.changed) what.set(c, (what.get(c) ?? 0) + 1); } }
        }
      };
      walk(canonDir);
      const root = join(canonDir, "README.md");
      if (existsSync(root)) {
        const t = readFileSync(root, "utf8"); const v = /^format:\s*(\d+)/m.exec(t);
        if (!v || Number(v[1]) < FORMAT_VERSION) { writeFileSync(root, v ? t.replace(/^format:\s*\d+/m, `format: ${FORMAT_VERSION}`) : t.replace(/^(id: ROOT[^\n]*\n)/m, `$1format: ${FORMAT_VERSION}\n`)); what.set("format version", 1); }
      }
      out(`${files} files changed${what.size ? ": " + [...what].map(([k, v]) => `${k} ×${v}`).join(", ") : ""}\n`);
      return 0;
    }
    case "working": {
      // `working <id> --by <worker>`: where this worker is now; `working --off --by <worker>`: done. The page shows it live.
      const by = args.by ?? "session";
      const ids = args.positional;
      if (!ids.length && !args.off) { err("usage: headcanon working <id...> --by <worker> [--port N]   |   headcanon working --off --by <worker>\n"); return 1; }
      if (!(await viewerUp(args.port))) { err("no viewer on that port; nothing to signal\n"); return 1; }
      const r = await call(args.port, "/api/working", { body: { ids, on: !args.off, by }, agent: by, timeoutMs: 2000 });
      if (!r) { err("could not signal: the viewer did not answer\n"); return 1; }
      try { out(JSON.stringify(JSON.parse(r.text)) + "\n"); } catch { err(`could not signal: the viewer answered ${r.status}\n`); return 1; }
      return 0;
    }
    case "history": {
      const log = readJournal(canonDir).slice(-(args.limit ?? 40)).reverse();
      out(args.json ? JSON.stringify(log.map((e) => ({ ...e, files: e.files.map((f) => f.path) })), null, 1) + "\n" : (log.length ? log.map((e) => `#${e.seq} ${e.at.slice(0, 19).replace("T", " ")} ${e.kind} ${e.summary} (${e.files.length} file${e.files.length === 1 ? "" : "s"})`).join("\n") : "no changes recorded") + "\n");
      return 0;
    }
    case "revert": {
      const seq = Number(args.positional[0]);
      if (!Number.isFinite(seq) || seq < 1) { err("usage: headcanon revert <seq>   (restores the canon to before that change; see headcanon history)\n"); return 1; }
      const r = revertTo(canonDir, seq);
      out(`${r.entries} change(s) undone, ${r.restored} file(s) restored${r.entry ? ` (#${r.entry.seq})` : ""}\n`);
      return 0;
    }
    case "settings": {
      // with a mode, store it: the user changed it in the chat, where the page's card is no longer shown; the cap stays
      const m = args.positional[0];
      if (m === "guided" || m === "full-auto") {
        if (!writeSettings(canonDir, { ...readSettings(canonDir), mode: m, at: new Date().toISOString() })) { err("no git directory to keep the settings in\n"); return 1; }
      } else if (m) { err("usage: headcanon settings [guided|full-auto]\n"); return 1; }
      out(JSON.stringify(readSettings(canonDir)) + "\n");
      return 0;
    }
    case "wait": {
      // Idle at no cost (DEC-025): block until the page's feed has an entry after the cursor, then exit; run in the
      // background by the session, whose turn ends meanwhile; the marker tells the Stop hook a waiter is armed.
      let since = Number(args.positional[0] ?? args.since ?? args.under ?? 0);
      const git = gitDirOf(canonDir);
      const marker = git ? join(git, "headcanon", "waiting") : undefined;
      if (marker) { mkdirSync(join(git!, "headcanon"), { recursive: true }); writeFileSync(marker, JSON.stringify({ pid: process.pid, port: args.port, since, at: new Date().toISOString() })); }
      const clear = () => { try { if (marker && existsSync(marker)) unlinkSync(marker); } catch { /* fine */ } };
      // Ctrl+C drops the open poll and lets the loop return once its socket has closed; the process is never ended
      // from here with a request in flight
      const interrupted = new AbortController();
      process.once("SIGINT", () => interrupted.abort());
      const pause = (ms: number) => new Promise<void>((ok) => {
        const done = () => { clearTimeout(timer); interrupted.signal.removeEventListener("abort", done); ok(); };
        const timer = setTimeout(done, ms);
        interrupted.signal.addEventListener("abort", done);
      });
      const deadline = Date.now() + Math.max(60, args.depth ?? 6 * 3600) * 1000;
      try {
        while (Date.now() < deadline) {
          let r: { cursor: number; entries: FeedEntry[] } | undefined;
          // the viewer holds a poll for 25 seconds at most; the timeout leaves room for a slow answer
          try { r = JSON.parse((await call(args.port, `/api/changes?since=${since}&timeout=25&wake=user`, { timeoutMs: 35_000, signal: interrupted.signal }))?.text ?? "") as { cursor: number; entries: FeedEntry[] }; } catch { /* no viewer, or not a viewer's answer */ }
          if (interrupted.signal.aborted) return 130;
          if (!r || !Array.isArray(r.entries)) { await pause(5000); if (interrupted.signal.aborted) return 130; continue; }
          // only the user wakes the session: its own says and the terminal mirror of its words are skipped (a viewer
          // from before `wake=user` returns them; the filter here holds either way) and the cursor moves past them
          const user = r.entries.filter(isUserEntry);
          if (user.length) { out(JSON.stringify({ cursor: r.cursor, entries: user.length, since }) + "\n"); clear(); return 0; }
          if (r.entries.length) since = r.cursor;
        }
        out(JSON.stringify({ cursor: since, entries: 0, since, timedOut: true }) + "\n");
        clear();
        return 0;
      } finally { clear(); }
    }
    case "coherence": {
      // Candidates for the cross-branch coherence pass (DEC-024): clusters of nodes in different branches that share a
      // glossary term, a cited file, a required node or a rare title word; a reader agent judges them from their full text.
      const c = coherenceClusters(loadCanon(canonDir));
      out(args.json ? JSON.stringify(c, null, 2) + "\n" : describeCoherence(c) + "\n");
      return 0;
    }
    case "ask": {
      // `ask <json | @file | ->`: file an issue in the viewer's queue over HTTP and return at once; an agent's way
      // to ask without waiting on anyone. The JSON is an ask request, or {questions: [...]} for several.
      const raw = args.positional[0];
      if (!raw) { err("ask needs the request as JSON, @<file> holding it, or - to read it from stdin\n"); return 2; }
      let body: { questions?: unknown[] } & Record<string, unknown>;
      try { body = JSON.parse(jsonText(raw, stdin)) as typeof body; }
      catch (e) { err(`ask: the request is not valid JSON: ${(e as Error).message}\n`); return 2; }
      const items = Array.isArray(body?.questions) ? body.questions : [body];
      // who asks and whether the node waits on the answer travel with each question; the options fill in what it leaves out
      const named = { ...(args.by ? { by: args.by } : {}), ...(args.blocks ? { blocks: true } : {}) };
      const ids: string[] = [];
      for (const q of items) {
        const r = await call(args.port, "/api/ask", { body: q && typeof q === "object" ? { ...named, ...q } : q, agent: "cli", timeoutMs: 5000 });
        if (!r) { err(`ask: no viewer answers on port ${args.port}\n`); return 1; }
        let id: unknown;
        try { id = (JSON.parse(r.text) as { questionId?: unknown }).questionId; } catch { /* not a viewer's answer */ }
        if (r.status !== 200 || typeof id !== "string") { err(`ask: the viewer on port ${args.port} refused the question: ${r.text}\n`); return 1; }
        ids.push(id);
      }
      out(JSON.stringify({ questionIds: ids }) + "\n");
      return 0;
    }
    case "op": {
      // `op <json | @file | ->` applies one operation; `op --log [ID]` prints the log; `op --stats` reads it
      const git = gitDirOf(canonDir);
      const logPath = git ? join(git, "headcanon", "ops.jsonl") : undefined;
      if (args.stats) { out(JSON.stringify(opStats(logPath ? readOps(logPath) : []), null, 2) + "\n"); return 0; }
      if (args.log) { out(JSON.stringify(logPath ? readOps(logPath, args.positional[0]) : [], null, 2) + "\n"); return 0; }
      const raw = args.positional[0];
      if (!raw) { err("op needs the operation as JSON, @<file> holding it, or - to read it from stdin; see headcanon --help\n"); return 2; }
      let op: Op;
      try { op = JSON.parse(jsonText(raw, stdin)) as Op; }
      catch (e) { err(`op: the operation is not valid JSON: ${(e as Error).message}\n`); return 2; }
      const r = applyOp(canonDir, op, args.by ? { by: args.by } : {});
      out(JSON.stringify(r, null, 2) + "\n");
      // the worker's position is the node being refined, the parent of a turn: a parcel read sets it, a create confirms
      // it through `under`, a review sets it to the set's parent; operations on the children never move it
      { const o = op as { op?: string; id?: string; under?: string }; const at = o.op === "create" ? o.under : o.op === "review" ? o.id : undefined; if (at && args.by) await signalWorking(args.port, [at], args.by); }
      return r.ok ? 0 : 1;
    }
    case "next": {
      const canon = loadCanon(canonDir);
      // `next <ID>`: the unapproved nodes on the path down to that node, what the user validates before work under it
      if (args.positional[0]) {
        const path = pathToValidate(canon, args.positional[0]);
        out(args.json ? JSON.stringify({ id: args.positional[0], path: path ?? null }, null, 2) + "\n" : describePath(args.positional[0], path) + "\n");
        return path ? 0 : 1;
      }
      // `--under <ID>` scopes the lists to one subtree, what a branch agent owns; an id outside the canon is an error,
      // never an empty order that reads as nothing left
      if (args.under && args.under !== "ROOT" && !canon.nodes[args.under]) { err(`${args.under} is not in the canon\n`); return 1; }
      const order = refinementOrder(canon, args.under, { guided: readSettings(canonDir).mode === "guided" });
      // the nodes whose agents were dispatched and have not reported, from the operations log: not to be dispatched again
      const git = gitDirOf(canonDir);
      const held = heldNodes(git ? readOps(join(git, "headcanon", "ops.jsonl")) : []);
      if (args.json) out(JSON.stringify({ ...order, held }, null, 2) + "\n");
      else out(describeNext(order, canon) + (held.length ? `\nHeld by running agents: ${held.join(", ")}.` : "") + "\n");
      return order.cycles.length ? 1 : 0;
    }
    case "attention": {
      const snap = buildSnapshot(canonDir);
      const nodes = Object.values(snap.canon.nodes);
      const data = {
        pending: snap.git.pending.map((c) => ({ sha: c.short, subject: c.subject, changes: c.trailers["Intent-Change"] ?? [], approvedBy: c.trailers["Approved-By"] ?? [] })),
        unmerged: snap.git.unmerged.filter((c) => !snap.git.pending.includes(c)).map((c) => ({ sha: c.short, subject: c.subject, changes: c.trailers["Intent-Change"] ?? [] })),
        uncommitted: snap.git.uncommitted,
        errors: snap.findings.filter((f) => f.level === "error").map((f) => f.message),
        contested: nodes.filter((n) => n.state === "contested").map((n) => ({ id: n.id, title: n.title })),
        draft: nodes.filter((n) => n.state === "draft").map((n) => ({ id: n.id, title: n.title })),
        unconfirmedDecisions: snap.canon.decisions.filter((d) => d.state === "assumed").map((d) => ({ id: d.id, title: d.title, intents: d.intents })),
        assumed: nodes.filter((n) => n.state === "assumed").map((n) => ({ id: n.id, title: n.title, parent: n.parent })),
      };
      if (args.json) out(JSON.stringify(data, null, 2) + "\n");
      else {
        const section = (title: string, items: string[]) => out(`${title} (${items.length})\n${items.map((i) => `  ${i}`).join("\n")}${items.length ? "\n" : ""}\n`);
        section("Pending approvals", data.pending.map((p) => `${p.sha} ${p.subject} [${p.changes.length} changes]`));
        section("Unmerged intent changes", data.unmerged.map((p) => `${p.sha} ${p.subject} [${p.changes.length} changes]`));
        section("Uncommitted canon edits", data.uncommitted);
        section("Errors", data.errors);
        section("Contested", data.contested.map((n) => `${n.id} ${n.title}`));
        section("Open questions", data.draft.map((n) => `${n.id} ${n.title}`));
        section("Decisions awaiting confirmation", data.unconfirmedDecisions.map((d) => `${d.id} ${d.title}`));
        section("Assumed requirements", data.assumed.map((n) => `${n.id} ${n.title}`));
      }
      return 0;
    }
    case "ui": {
      const { url } = await serveUi({ canonDir, port: args.port });
      out(`HeadCanon viewer at ${url}\nCanon: ${canonDir}${existsSync(canonDir) ? "" : " (not created yet; the page shows it once it exists)"}\nPress Ctrl+C to stop.\n`);
      return await new Promise(() => {});
    }
    default:
      err(`Unknown command: ${args.command}\n\n${HELP}`);
      return 2;
  }
}

function dirnameOf(file: string): string {
  const abs = resolve(file);
  return abs.slice(0, Math.max(abs.lastIndexOf("/"), abs.lastIndexOf("\\")) || 1);
}

/** The work tree root for a directory, or undefined outside a repository (git hooks run at the root). */
function repoRootOf(dir: string): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

/** The canon directory as a git pathspec relative to the repository root. */
function canonPathspec(repoRoot: string, canonDir: string): string {
  const rel = relative(repoRoot, canonDir).split("\\").join("/");
  return rel && !rel.startsWith("..") ? rel : "canon";
}

// Run when invoked directly (node dist/cli.js, tsx src/cli.ts); bin/headcanon.js imports main instead.
const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (entry && import.meta.url === entry) {
  // The exit code is set and the process left to end when its handles have closed: `process.exit` with a request
  // still open is the assertion that killed the Stop hook on Windows. The timer ends a process that something
  // keeps open (the viewer the MCP server started, a pipe on stdin) and never holds one that is ready to end.
  const end = (code: number) => { process.exitCode = code; setTimeout(() => process.exit(code), 5000).unref(); };
  main(process.argv.slice(2)).then(end, (e) => {
    console.error(e instanceof Error ? e.message : String(e));
    end(2);
  });
}
