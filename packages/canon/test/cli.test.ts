import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adoptionComplete, heldBoxes, lastAssistantText, main, stopDecision } from "../src/cli.js";
import { loadCanon } from "../src/load.js";

// The commands a module owns are handed to stand-ins here, so these tests see what the CLI passes and run nothing of
// the modules' own; every other export stays the module's.
const handed = vi.hoisted(() => {
  const calls: Array<{ fn: string; args: unknown[] }> = [];
  const answer = { code: 0, fail: "" };
  const stand = (fn: string) => async (...args: unknown[]) => { calls.push({ fn, args }); if (answer.fail) throw new Error(answer.fail); return answer.code; };
  return { calls, answer, stand };
});
vi.mock("../src/lookup.js", async (real) => ({ ...(await real<object>()), lookupCli: handed.stand("lookupCli") }));
vi.mock("../src/proposals.js", async (real) => ({ ...(await real<object>()), proposalsCli: handed.stand("proposalsCli") }));
vi.mock("../src/testing.js", async (real) => ({ ...(await real<object>()), testsCli: handed.stand("testsCli") }));
vi.mock("../src/runs.js", async (real) => ({ ...(await real<object>()), runCli: handed.stand("runCli") }));
vi.mock("../src/brief.js", async (real) => ({ ...(await real<object>()), briefCli: handed.stand("briefCli") }));
vi.mock("../src/gate.js", async (real) => ({ ...(await real<object>()), gateCli: handed.stand("gateCli") }));
vi.mock("../src/approve.js", async (real) => ({ ...(await real<object>()), approveCli: handed.stand("approveCli") }));

/** Run the CLI in-process, capturing what it writes; `stdin` is what the command would read there. */
async function run(argv: string[], stdin?: string): Promise<{ code: number; out: string; err: string }> {
  const got = { out: "", err: "" };
  const spy = (stream: NodeJS.WriteStream, key: "out" | "err") => vi.spyOn(stream, "write").mockImplementation((chunk: unknown) => { got[key] += String(chunk); return true; });
  const o = spy(process.stdout, "out");
  const e = spy(process.stderr, "err");
  try {
    const code = await main(argv, stdin === undefined ? {} : { stdin: () => stdin });
    return { code, ...got };
  } finally {
    o.mockRestore();
    e.mockRestore();
  }
}

/** A canon of two top-level guesses under a resolved premise. */
function canon(root: string): string {
  const dir = join(root, "canon");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "README.md"), '---\nid: ROOT\ntitle: "Held canon"\nstate: resolved\n---\n\n# Held canon\n');
  for (const id of ["REQ-1", "REQ-4"]) writeFileSync(join(dir, `${id}-x.md`), `---\nid: ${id}\ntitle: "${id}"\nstate: assumed\n---\n\n# ${id}\n\n## Intent\n\nKnown.\n`);
  return dir;
}

describe("the stop hook's rule [REQ-11.1]", () => {
  // an unfinished adoption with the viewer up and the human's list still closed: the attend loop's usual state
  const live = { finished: false, viewerAnswers: true, gateOpen: false };

  it("allows the stop when no viewer answers or a waiter is armed, finished or not", () => {
    expect(stopDecision({ ...live, viewerAnswers: false }).decision).toBe("allow");
    expect(stopDecision({ ...live, finished: true, viewerAnswers: false }).decision).toBe("allow");
    expect(stopDecision({ ...live, finished: true, waiterArmed: true }).decision).toBe("allow");
  });

  it("keeps a finished canon listening: with the viewer up and no waiter the stop is sent back, a running agent or not", () => {
    expect(stopDecision({ ...live, finished: true, gateOpen: true }).decision).toBe("block");
    expect(stopDecision({ ...live, finished: true, gateOpen: true, backgroundTasks: [{ type: "subagent" }] }).decision).toBe("block");
    expect(stopDecision({ ...live, finished: true, lastAssistantMessage: "Stopping attend, as you asked." }).decision).toBe("allow");
  });

  it("blocks while the loop attends, with the reason that tells the session to arm the waiter", () => {
    const d = stopDecision(live);
    expect(d.decision).toBe("block");
    expect(d.reason).toContain("HC wait --port <port> <cursor>");
    expect(d.reason).toContain("your own messages do not");
    expect(d.reason).toContain("'stopping attend'");
  });

  it("reads the session's last words from the hook input, and from the transcript only when the input carries none", () => {
    expect(stopDecision({ ...live, lastAssistantMessage: "Stopping attend, as you asked." }).decision).toBe("allow");
    // the field is present and silent: the transcript is not consulted, whatever it says
    expect(stopDecision({ ...live, lastAssistantMessage: "Still attending.", transcriptTail: "stopping attend" }).decision).toBe("block");
    expect(stopDecision({ ...live, lastAssistantMessage: "", transcriptTail: "stopping attend" }).decision).toBe("block");
    expect(stopDecision({ ...live, transcriptTail: "I am stopping attend now." }).decision).toBe("allow");
    expect(stopDecision({ ...live, transcriptTail: "Next box." }).decision).toBe("block");
  });

  it("lets a session with a running subagent stop while the human's list is closed, and keeps it attending once the list is open", () => {
    const sub = [{ type: "subagent", status: "running" }];
    expect(stopDecision({ ...live, backgroundTasks: sub }).decision).toBe("allow");
    expect(stopDecision({ ...live, gateOpen: true, backgroundTasks: sub }).decision).toBe("block");
    expect(stopDecision({ ...live, backgroundTasks: [{ type: "shell", status: "running" }, { type: "subagent" }] }).decision).toBe("allow");
    expect(stopDecision({ ...live, backgroundTasks: [{ type: "shell", status: "running" }] }).decision).toBe("block");
    expect(stopDecision({ ...live, backgroundTasks: [] }).decision).toBe("block");
    expect(stopDecision({ ...live, backgroundTasks: undefined }).decision).toBe("block");
  });

  it("finds the last assistant text in a transcript, and nothing in a missing one", () => {
    const dir = mkdtempSync(join(tmpdir(), "headcanon-transcript-"));
    const path = join(dir, "t.jsonl");
    const line = (type: string, content: unknown[]) => JSON.stringify({ type, message: { content } });
    writeFileSync(path, [line("assistant", [{ type: "text", text: "stopping attend" }]), line("user", [{ type: "text", text: "go on" }]), "not json", line("assistant", [{ type: "tool_use", name: "x" }, { type: "text", text: "Next box." }])].join("\n") + "\n");
    expect(lastAssistantText(path)).toBe("Next box.");
    expect(lastAssistantText(join(dir, "none.jsonl"))).toBeUndefined();
    expect(lastAssistantText(undefined)).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("next: the held boxes and the scope check [DEC-024]", () => {
  const roots: string[] = [];
  afterAll(() => roots.forEach((d) => rmSync(d, { recursive: true, force: true })));
  const fresh = () => { const root = mkdtempSync(join(tmpdir(), "headcanon-cli-")); roots.push(root); return root; };

  it("holds a box from its dispatch record until a later returned record names it, and never from a refused one", () => {
    const rec = (op: string, id?: string) => ({ request: id ? { op, id } : { op } });
    expect(heldBoxes([rec("dispatch", "REQ-4"), rec("dispatch", "REQ-1"), rec("returned", "REQ-4"), rec("dispatch", "REQ-4"), rec("link"), rec("dispatch", "REQ-2"), rec("returned", "REQ-2"), rec("returned", "REQ-7")])).toEqual(["REQ-1", "REQ-4"]);
    // a dispatch the log refused (an id outside the canon) handed nothing to anyone
    expect(heldBoxes([{ ok: false, request: { op: "dispatch", id: "REQ-9" } }, { ok: true, request: { op: "dispatch", id: "REQ-10" } }])).toEqual(["REQ-10"]);
    expect(heldBoxes([])).toEqual([]);
  });

  it("refuses an --under id that is not in the canon instead of printing an order that reads as nothing left", async () => {
    const dir = canon(fresh());
    const r = await run(["next", "--under", "REQ-9", "--canon", dir]);
    expect([r.code, r.out, r.err]).toEqual([1, "", "REQ-9 is not in the canon\n"]);
    expect((await run(["next", "--under", "ROOT", "--canon", dir])).code).toBe(0);
    const one = await run(["next", "--under", "REQ-1", "--canon", dir, "--json"]);
    expect(one.code).toBe(0);
    expect(JSON.parse(one.out)).toMatchObject({ next: { id: "REQ-1" }, frozen: 0, held: [] });
  });

  it("lists the held boxes from the repository's operations log, in JSON and in text", async () => {
    const root = fresh();
    execFileSync("git", ["init", "-q"], { cwd: root, stdio: "ignore" });
    const dir = canon(root);
    const gitDir = execFileSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: root, encoding: "utf8" }).trim();
    mkdirSync(join(gitDir, "headcanon"), { recursive: true });
    const records = [
      { at: "2026-11-15T10:00:00Z", by: "orchestrator", request: { op: "dispatch", id: "REQ-4" }, ok: true, changes: [] },
      { at: "2026-11-15T10:00:01Z", by: "orchestrator", request: { op: "dispatch", id: "REQ-1" }, ok: true, changes: [] },
      { at: "2026-11-15T10:05:00Z", by: "REQ-4", request: { op: "returned", id: "REQ-4" }, ok: true, changes: [] },
      { at: "2026-11-15T10:06:00Z", by: "orchestrator", request: { op: "dispatch", id: "REQ-4" }, ok: true, changes: [] },
    ];
    writeFileSync(join(gitDir, "headcanon", "ops.jsonl"), records.map((r) => JSON.stringify(r)).join("\n") + "\n");
    const j = await run(["next", "--json", "--canon", dir]);
    expect(j.code).toBe(0);
    expect((JSON.parse(j.out) as { held: string[] }).held).toEqual(["REQ-1", "REQ-4"]);
    const t = await run(["next", "--canon", dir]);
    expect(t.out).toContain("Next to refine: REQ-1");
    expect(t.out).toContain("\nHeld by running agents: REQ-1, REQ-4.\n");
  });
});

// ── Ledgerline: a canon small enough to read whole, with one capability and the requirements a test puts under it ──

const made: string[] = [];
const open: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of open.splice(0)) await close(); });
afterAll(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));
/** A scratch folder, a git repository when asked. */
function scratch(git = false): string {
  const root = mkdtempSync(join(tmpdir(), "headcanon-cli-"));
  made.push(root);
  if (git) execFileSync("git", ["init", "-q"], { cwd: root, stdio: "ignore" });
  return root;
}

interface Box { parent?: string; state?: string; kind?: string; binds?: string[]; notBuilt?: string }
const CLOSE = "implements src/months.ts#closeMonth";
const BUILT: Box = { kind: "binary", binds: [CLOSE] };
const page = (id: string, o: Box = {}): string =>
  `---\nid: ${id}\n${o.parent ? `parent: ${o.parent}\n` : ""}title: "${id}"\nstate: ${o.state ?? "assumed"}\n${o.kind ? `kind: ${o.kind}\nuid: u${id.replace(/\W/g, "")}\n` : ""}${o.binds ? `binds: [${o.binds.map((b) => `"${b}"`).join(", ")}]\n` : ""}---\n\n# ${id}\n\n## Intent\n\nA closed month takes no new entry.\n${o.kind ? "\n## Check\n\nAn entry dated in a closed month is refused.\n" : ""}${o.notBuilt ? `\n## Implemented by\n\n- not built: ${o.notBuilt}\n` : ""}`;

/** The premise, the capability REQ-1 and the requirements given under it. */
function ledger(root: string, leaves: Record<string, Box>): string {
  const dir = join(root, "canon"), months = join(dir, "REQ-1-months");
  mkdirSync(months, { recursive: true });
  writeFileSync(join(dir, "README.md"), '---\nid: ROOT\ntitle: "Ledgerline canon"\nstate: resolved\n---\n\n# Ledgerline canon\n\n## Intent\n\nLedgerline keeps the books of a small business.\n');
  writeFileSync(join(months, "README.md"), page("REQ-1"));
  for (const [id, o] of Object.entries(leaves)) writeFileSync(join(months, `${id}-x.md`), page(id, { parent: "REQ-1", ...o }));
  return dir;
}

function decision(dir: string, id: string): void {
  mkdirSync(join(dir, "decisions"), { recursive: true });
  writeFileSync(join(dir, "decisions", `${id}-months-close-on-their-last-day.md`), `---\nid: ${id}\ntitle: "Months close on their last day"\nstate: assumed\ndate: 2026-11-18\nintents: [REQ-1]\n---\n\n# Months close on their last day\n\n## Why\n\nThe statements are cut by month.\n`);
}

interface Posted { path: string; body: Record<string, unknown>; agent: string | undefined }
/** A stand-in for the viewer of `canonDir`: it answers the routes the CLI calls and keeps what was posted to it. It takes any free port, or the one asked for. */
async function viewer(canonDir: string, port = 0, feed: (query: string) => unknown = () => ({ cursor: 42, entries: [] })): Promise<{ port: number; posts: Posted[] }> {
  const posts: Posted[] = [];
  const server: Server = createServer((req, res) => {
    let text = "";
    req.on("data", (c) => (text += c));
    req.on("end", () => {
      const [path = "", query = ""] = (req.url ?? "").split("?");
      if (req.method === "POST") posts.push({ path, body: JSON.parse(text || "{}") as Record<string, unknown>, agent: req.headers["x-headcanon-agent"] as string | undefined });
      const answer = path === "/api/health" ? { ok: true, canon: canonDir } : path === "/api/changes" ? feed(query) : path === "/api/ask" ? { questionId: `q${posts.filter((p) => p.path === "/api/ask").length}` } : { ok: true };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(answer));
    });
  });
  await new Promise<void>((ok, fail) => { server.once("error", fail); server.listen(port, "127.0.0.1", ok); });
  open.push(() => new Promise<void>((ok) => server.close(() => ok())));
  return { port: (server.address() as AddressInfo).port, posts };
}

/** A port nothing listens on. */
async function quietPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((ok) => server.close(() => ok()));
  return port;
}

/** Arm the waiter's marker for the canon's repository, as `headcanon wait` does while it runs. */
function armWaiter(root: string): void {
  const gitDir = execFileSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: root, encoding: "utf8" }).trim();
  mkdirSync(join(gitDir, "headcanon"), { recursive: true });
  writeFileSync(join(gitDir, "headcanon", "waiting"), JSON.stringify({ pid: 1, since: 0, at: new Date().toISOString() }));
}

describe("the stop hook's test for a finished adoption", () => {
  it("is finished when every branch ends in a requirement with a check that says where it is built, or that it is not", () => {
    expect(adoptionComplete(loadCanon(ledger(scratch(), { "REQ-1.1": BUILT, "REQ-1.2": { kind: "binary", notBuilt: "months are closed by hand" } })))).toBe(true);
  });

  it("is unfinished while a branch ends without a check, a check does not say where it is built, or nothing is written under the premise", () => {
    expect(adoptionComplete(loadCanon(ledger(scratch(), { "REQ-1.1": BUILT, "REQ-1.2": {} })))).toBe(false);
    expect(adoptionComplete(loadCanon(ledger(scratch(), { "REQ-1.1": BUILT, "REQ-1.2": { kind: "binary" } })))).toBe(false);
    // the capability alone: a branch that ends in a box with no check
    expect(adoptionComplete(loadCanon(ledger(scratch(), {})))).toBe(false);
    const premise = join(scratch(), "canon");
    mkdirSync(premise);
    writeFileSync(join(premise, "README.md"), '---\nid: ROOT\ntitle: "Ledgerline canon"\nstate: draft\n---\n\n# Ledgerline canon\n\n## Intent\n\nNot yet stated.\n');
    expect(adoptionComplete(loadCanon(premise))).toBe(false);
  });

  it("is not held by a red box, nor by what hangs under one: they wait on the human", () => {
    expect(adoptionComplete(loadCanon(ledger(scratch(), { "REQ-1.1": BUILT, "REQ-1.2": { state: "draft" }, "REQ-1.3": { state: "contested", kind: "binary" } })))).toBe(true);
    const dir = ledger(scratch(), { "REQ-1.1": BUILT });
    const statements = join(dir, "REQ-1-months", "REQ-1.2-statements");
    mkdirSync(statements);
    writeFileSync(join(statements, "README.md"), page("REQ-1.2", { parent: "REQ-1", state: "draft" }));
    writeFileSync(join(statements, "REQ-1.2.1-x.md"), page("REQ-1.2.1", { parent: "REQ-1.2" }));
    expect(adoptionComplete(loadCanon(dir))).toBe(true);
    // the same box under a guess holds the adoption open
    writeFileSync(join(statements, "README.md"), page("REQ-1.2", { parent: "REQ-1" }));
    expect(adoptionComplete(loadCanon(dir))).toBe(false);
  });

  it("reads no decision record: the first one written does not finish an adoption, and a finished one needs none", () => {
    const dir = ledger(scratch(), { "REQ-1.1": BUILT, "REQ-1.2": {} });
    decision(dir, "DEC-001");
    const canon = loadCanon(dir);
    expect(canon.decisions.map((d) => d.id)).toEqual(["DEC-001"]);
    expect(adoptionComplete(canon)).toBe(false);
    expect(loadCanon(ledger(scratch(), { "REQ-1.1": BUILT })).decisions).toEqual([]);
    expect(adoptionComplete(loadCanon(ledger(scratch(), { "REQ-1.1": BUILT })))).toBe(true);
  });
});

describe("the stop hook, with and without a viewer and a waiter [REQ-11.1]", () => {
  const UNFINISHED = { "REQ-1.1": BUILT, "REQ-1.2": {} };
  const SAID = "The months are drafted.";
  const hook = (dir: string, port: number, input: Record<string, unknown> = {}) => run(["stop-hook", "--canon", dir, "--port", String(port)], JSON.stringify({ last_assistant_message: SAID, ...input }));
  const mirrored: Posted[] = [{ path: "/api/terminal", body: { role: "session", text: SAID }, agent: undefined }];

  it("blocks an unfinished adoption while a viewer serves its canon and no waiter is armed, naming the command that arms one", async () => {
    const dir = ledger(scratch(true), UNFINISHED);
    const v = await viewer(dir);
    const r = await hook(dir, v.port);
    expect([r.code, r.err]).toEqual([0, ""]);
    const d = JSON.parse(r.out) as { decision: string; reason: string };
    expect(d.decision).toBe("block");
    expect(d.reason).toContain("The viewer is up and no waiter is armed");
    expect(d.reason).toContain(`Right now: \`HC wait --port ${v.port} 42\`.`);
    expect(v.posts).toEqual(mirrored);
  });

  it("finds the viewer of its canon on a later port, past the one that serves another project", async () => {
    const dir = ledger(scratch(true), UNFINISHED);
    const other = await viewer(join(scratch(), "canon"));
    // the first port above it that is free, as the MCP server would take
    let mine: Awaited<ReturnType<typeof viewer>> | undefined;
    for (let port = other.port + 1; !mine && port < other.port + 10; port++) mine = await viewer(dir, port).catch(() => undefined);
    if (!mine) throw new Error(`no free port between ${other.port + 1} and ${other.port + 9}`);
    const r = await hook(dir, other.port);
    expect((JSON.parse(r.out) as { reason: string }).reason).toContain(`HC wait --port ${mine.port} 42`);
    expect(mine.posts).toEqual(mirrored);
    expect(other.posts).toEqual([]);
  });

  it("lets the session stop once a waiter is armed, and still shows its words on the page", async () => {
    const root = scratch(true);
    const dir = ledger(root, UNFINISHED);
    armWaiter(root);
    const v = await viewer(dir);
    expect(await hook(dir, v.port)).toEqual({ code: 0, out: "", err: "" });
    expect(v.posts).toEqual(mirrored);
  });

  it("lets it stop when no viewer answers, and when the port serves another project's canon, which is told nothing", async () => {
    const dir = ledger(scratch(true), UNFINISHED);
    expect(await hook(dir, await quietPort())).toEqual({ code: 0, out: "", err: "" });
    const other = await viewer(join(scratch(), "canon"));
    expect(await hook(dir, other.port)).toEqual({ code: 0, out: "", err: "" });
    expect(other.posts).toEqual([]);
  });

  it("keeps a finished adoption listening: viewer up and no waiter sends the stop back, and still shows its words on the page", async () => {
    const dir = ledger(scratch(true), { "REQ-1.1": BUILT, "REQ-1.2": { kind: "binary", notBuilt: "months are closed by hand" }, "REQ-1.3": { state: "draft" } });
    const v = await viewer(dir);
    const r = await hook(dir, v.port);
    expect([r.code, r.err]).toEqual([0, ""]);
    expect((JSON.parse(r.out) as { decision: string }).decision).toBe("block");
    expect(v.posts).toEqual(mirrored);
  });

  it("does not take the first decision record for the end of the adoption", async () => {
    const dir = ledger(scratch(true), UNFINISHED);
    decision(dir, "DEC-001");
    const v = await viewer(dir);
    expect((JSON.parse((await hook(dir, v.port)).out) as { decision: string }).decision).toBe("block");
  });

  it("lets it stop where there is no canon, and when it says it is stopping attend, which the page is not shown", async () => {
    const empty = join(scratch(true), "canon");
    const none = await viewer(empty);
    expect(await hook(empty, none.port)).toEqual({ code: 0, out: "", err: "" });
    const dir = ledger(scratch(true), UNFINISHED);
    const v = await viewer(dir);
    expect(await hook(dir, v.port, { last_assistant_message: "Stopping attend, as you asked." })).toEqual({ code: 0, out: "", err: "" });
    expect(v.posts).toEqual([]);
  });

  it("lets it stop while a subagent runs and the human's list is closed", async () => {
    const dir = ledger(scratch(true), UNFINISHED);
    const v = await viewer(dir);
    expect((await hook(dir, v.port, { background_tasks: [{ type: "subagent", status: "running" }] })).out).toBe("");
  });
});

describe("session-start after a compaction or a resume", () => {
  const context = async (dir: string, source: string) => (JSON.parse((await run(["session-start", "--canon", dir], JSON.stringify({ source }))).out) as { hookSpecificOutput: { additionalContext: string } }).hookSpecificOutput.additionalContext;
  const UNFINISHED = "## An adoption is unfinished";

  it("sends the session back to the attend loop while branches still end without a check, and only then", async () => {
    const dir = ledger(scratch(), { "REQ-1.1": BUILT, "REQ-1.2": {} });
    expect(await context(dir, "compact")).toContain(UNFINISHED);
    expect(await context(dir, "resume")).toContain("the attend loop was running before this resume");
    expect(await context(dir, "startup")).not.toContain(UNFINISHED);
    expect(await context(ledger(scratch(), { "REQ-1.1": BUILT }), "compact")).not.toContain(UNFINISHED);
  });

  it("never sends a canon with a scope record back into the loop: it was written by hand or adopted before it", async () => {
    const dir = ledger(scratch(), { "REQ-1.1": BUILT, "REQ-1.2": {} });
    decision(dir, "DEC-001");
    expect(await context(dir, "compact")).not.toContain(UNFINISHED);
  });

  it("in Guided, names no box next that the human has not approved, and says which ones wait [DEC-025]", async () => {
    const dir = ledger(scratch(true), { "REQ-1.1": BUILT, "REQ-1.2": {} });
    expect(await context(dir, "compact")).toContain("Next to refine: REQ-1.2");
    expect((await run(["settings", "guided", "--canon", dir])).code).toBe(0);
    const guided = await context(dir, "compact");
    expect(guided).toContain(UNFINISHED);
    expect(guided).not.toContain("Next to refine");
    expect(guided).toContain("Guided: 1 box(es) wait for the human's approval, and nothing is drafted under one before it: REQ-1.2.");
  });
});

describe("settings: the mode the human changes in the chat [DEC-025]", () => {
  const stored = (root: string) => join(execFileSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: root, encoding: "utf8" }).trim(), "headcanon", "settings.json");

  it("stores a mode and keeps the cap, prints what is stored, and refuses any other word", async () => {
    const root = scratch(true);
    const dir = ledger(root, {});
    expect(await run(["settings", "--canon", dir])).toEqual({ code: 0, out: '{"mode":"full-auto"}\n', err: "" });
    expect(existsSync(stored(root))).toBe(false);
    mkdirSync(dirname(stored(root)), { recursive: true });
    writeFileSync(stored(root), JSON.stringify({ mode: "full-auto", cap: "4", at: "2026-11-18T09:00:00.000Z" }));
    const r = await run(["settings", "guided", "--canon", dir]);
    expect([r.code, r.err]).toEqual([0, ""]);
    const now = JSON.parse(r.out) as { mode: string; cap?: string; at?: string };
    expect(now).toMatchObject({ mode: "guided", cap: "4" });
    expect(now.at).not.toBe("2026-11-18T09:00:00.000Z");
    expect(JSON.parse(readFileSync(stored(root), "utf8"))).toEqual(now);
    expect(await run(["settings", "auto", "--canon", dir])).toEqual({ code: 1, out: "", err: "usage: headcanon settings [guided|full-auto]\n" });
    expect(JSON.parse((await run(["settings", "--canon", dir])).out)).toEqual(now);
    expect(JSON.parse((await run(["settings", "full-auto", "--canon", dir])).out)).toMatchObject({ mode: "full-auto", cap: "4" });
  });

  it("says so where there is no repository to keep the mode in", async () => {
    expect(await run(["settings", "guided", "--canon", ledger(scratch(), {})])).toEqual({ code: 1, out: "", err: "no git directory to keep the settings in\n" });
  });

  it("next follows the stored mode: in Guided a box that is not approved is gated, never ready, and a pause is not printed as the end", async () => {
    const root = scratch(true);
    const dir = ledger(root, { "REQ-1.1": BUILT, "REQ-1.2": {} });
    expect((await run(["next", "--canon", dir])).out).toContain("Next to refine: REQ-1.2");
    await run(["settings", "guided", "--canon", dir]);
    const t = (await run(["next", "--canon", dir])).out;
    expect(t).not.toContain("Next to refine");
    expect(t).not.toContain("Nothing left to refine");
    expect(t).toContain("Guided: 1 box(es) wait for the human's approval, and nothing is drafted under one before it: REQ-1.2.");
    const j = JSON.parse((await run(["next", "--json", "--canon", dir])).out) as { next?: unknown; ready: unknown[]; gated: Array<{ id: string }> };
    expect(j.next).toBeUndefined();
    expect(j.ready).toEqual([]);
    expect(j.gated.map((p) => p.id)).toEqual(["REQ-1.2"]);
    // the human approves it on the page: the box is theirs, and what hangs under it may be drafted
    writeFileSync(join(dir, "REQ-1-months", "REQ-1.2-x.md"), page("REQ-1.2", { parent: "REQ-1", state: "stated" }));
    expect((await run(["next", "--canon", dir])).out).toContain("Next to refine: REQ-1.2");
    await run(["settings", "full-auto", "--canon", dir]);
    expect((JSON.parse((await run(["next", "--json", "--canon", dir])).out) as { gated: unknown[] }).gated).toEqual([]);
  });
});

describe("op and ask read their JSON from stdin", () => {
  const TERM = { op: "term", term: "closed month", definition: "A month whose entries can no longer change." };

  it("applies the operation that arrives on stdin when the argument is a dash", async () => {
    const dir = ledger(scratch(true), { "REQ-1.1": BUILT });
    const r = await run(["op", "-", "--canon", dir, "--by", "top"], JSON.stringify(TERM));
    expect([r.code, r.err]).toEqual([0, ""]);
    expect((JSON.parse(r.out) as { ok: boolean }).ok).toBe(true);
    expect(readFileSync(join(dir, "README.md"), "utf8")).toContain("**closed month** (`TERM-closed-month`) [assumed]: A month whose entries can no longer change.");
  });

  it("reads past a byte order mark, and says so when nothing arrived", async () => {
    const dir = ledger(scratch(true), { "REQ-1.1": BUILT });
    expect((await run(["op", "-", "--canon", dir], "\uFEFF" + JSON.stringify(TERM))).code).toBe(0);
    expect(await run(["op", "-", "--canon", dir], " \n")).toEqual({ code: 2, out: "", err: "op: the operation is not valid JSON: nothing arrived on stdin\n" });
    expect(await run(["ask", "-", "--canon", dir], "")).toEqual({ code: 2, out: "", err: "ask: the request is not valid JSON: nothing arrived on stdin\n" });
  });

  it("files the issue that arrives on stdin, with who asks and whether the box waits on it", async () => {
    const dir = ledger(scratch(), { "REQ-1.1": BUILT });
    const v = await viewer(dir);
    const q = { question: "Closing a month fails when an entry carries no date. What should happen to such an entry?", kind: "impossible", nodeId: "REQ-1.1", by: "implementer-REQ-1.1", blocks: true };
    expect(await run(["ask", "-", "--canon", dir, "--port", String(v.port)], JSON.stringify(q))).toEqual({ code: 0, out: '{"questionIds":["q1"]}\n', err: "" });
    expect(v.posts).toEqual([{ path: "/api/ask", body: q, agent: "cli" }]);
  });

  it("fills in who asks and that the box waits from --by and --blocks, and never over what the JSON says", async () => {
    const dir = ledger(scratch(), { "REQ-1.1": BUILT });
    const v = await viewer(dir);
    const questions = [{ question: "Does a closed month reopen?", nodeId: "REQ-1.1" }, { question: "Is a statement cut per month?", by: "tester-REQ-1", blocks: false }];
    const r = await run(["ask", JSON.stringify({ questions }), "--by", "implementer-REQ-1.1", "--blocks", "--canon", dir, "--port", String(v.port)]);
    expect(r).toEqual({ code: 0, out: '{"questionIds":["q1","q2"]}\n', err: "" });
    expect(v.posts.map((p) => p.body)).toEqual([{ ...questions[0], by: "implementer-REQ-1.1", blocks: true }, questions[1]]);
  });

  it("says so when no viewer answers", async () => {
    const dir = ledger(scratch(), { "REQ-1.1": BUILT });
    const port = await quietPort();
    expect(await run(["ask", '{"question":"Does a closed month reopen?"}', "--canon", dir, "--port", String(port)])).toEqual({ code: 1, out: "", err: `ask: no viewer answers on port ${port}\n` });
  });
});

describe("wait: the idle waiter", () => {
  it("passes over the session's own entries, moves its cursor past them, and ends on the human's, its marker gone", async () => {
    const root = scratch(true);
    const dir = ledger(root, { "REQ-1.1": BUILT });
    const marker = join(execFileSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: root, encoding: "utf8" }).trim(), "headcanon", "waiting");
    const asked: string[] = [];
    const armed: boolean[] = [];
    const at = "2026-11-18T10:00:00Z";
    const v = await viewer(dir, 0, (query) => {
      asked.push(query);
      armed.push(existsSync(marker));
      return query.startsWith("since=5&")
        ? { cursor: 6, entries: [{ seq: 6, at, kind: "say", text: "Reading the months." }] }
        : { cursor: 7, entries: [{ seq: 7, at, kind: "terminal", role: "session", text: "Done." }, { seq: 8, at, kind: "implement-request", id: "REQ-1.1", text: "single" }] };
    });
    const r = await run(["wait", "--since", "5", "--canon", dir, "--port", String(v.port)]);
    expect(r).toEqual({ code: 0, out: '{"cursor":7,"entries":1,"since":6}\n', err: "" });
    expect(asked).toEqual(["since=5&timeout=25&wake=human", "since=6&timeout=25&wake=human"]);
    // the marker stood while the waiter ran, which is what the Stop hook reads, and is cleared when it ends
    expect(armed).toEqual([true, true]);
    expect(existsSync(marker)).toBe(false);
  });
});

describe("the commands a module owns are handed to it with one context", () => {
  interface Ctx { canonDir: string; repo: string; gitDir: string | undefined; port: number; by: string | undefined; json: boolean; stdin: () => string }
  const ctxOf = (i = 0) => handed.calls[i]!.args.at(-1) as Ctx;
  const project = process.env["CLAUDE_PROJECT_DIR"];
  beforeEach(() => { handed.calls.length = 0; handed.answer.code = 0; handed.answer.fail = ""; });
  afterEach(() => { if (project === undefined) delete process.env["CLAUDE_PROJECT_DIR"]; else process.env["CLAUDE_PROJECT_DIR"] = project; });

  it("hands each command to its module's cli with the words that follow it, the shared options taken out and put in the context", async () => {
    const dir = ledger(scratch(), {});
    const cases: Array<[argv: string[], fn: string, args: unknown[]]> = [
      [["context", "REQ-1", "--budget", "500"], "lookupCli", ["context", ["REQ-1", "--budget", "500"]]],
      [["find", "closed month", "--limit", "3"], "lookupCli", ["find", ["closed month", "--limit", "3"]]],
      [["code", "find", "close a month"], "lookupCli", ["code-find", ["close a month"]]],
      [["reading", "parts", "3"], "lookupCli", ["reading-parts", ["3"]]],
      [["propose", "-", "--why", "it belongs to the statements"], "proposalsCli", ["propose", ["-", "--why", "it belongs to the statements"]]],
      [["proposals", "reject", "P-2", "--why", "the box is approved"], "proposalsCli", ["proposals", ["reject", "P-2", "--why", "the box is approved"]]],
      [["tests", "run", "REQ-1", "--kind", "unit", "--all"], "testsCli", [["run", "REQ-1", "--kind", "unit", "--all"]]],
      [["run", "slice", "REQ-1.1", "building", "--agent", "a1", "--summary", "A closed month refuses a late entry."], "runCli", [["slice", "REQ-1.1", "building", "--agent", "a1", "--summary", "A closed month refuses a late entry."]]],
      [["brief", "REQ-1", "--for", "tester", "--canon-only"], "briefCli", [["REQ-1", "--for", "tester", "--canon-only"]]],
      [["slice", "approve", "REQ-1.1"], "approveCli", [["slice", "approve", "REQ-1.1"]]],
      [["build", "tests", "REQ-1"], "approveCli", [["build", "tests", "REQ-1"]]],
    ];
    for (const [argv, fn, args] of cases) {
      handed.calls.length = 0;
      // the shared options, after the command's words in one form and around them in the other
      const r = await run([...argv, "--canon", dir, "--by=refiner-REQ-1", "--json", "--port", "4399"], "piped");
      expect([argv[0], r.code, r.out, r.err]).toEqual([argv[0], 0, "", ""]);
      expect(handed.calls.map((c) => c.fn)).toEqual([fn]);
      expect(handed.calls[0]!.args.slice(0, -1)).toEqual(args);
      expect(ctxOf()).toMatchObject({ canonDir: dir, repo: dirname(dir), port: 4399, by: "refiner-REQ-1", json: true });
      expect(ctxOf().stdin()).toBe("piped");
      await run(["--canon", dir, argv[0]!, "--by", "top", ...argv.slice(1)]);
      expect(handed.calls[1]!.args.slice(0, -1)).toEqual(args);
      expect(ctxOf(1)).toMatchObject({ canonDir: dir, port: 4317, by: "top", json: false });
    }
  });

  it("gives the context the repository's git folder, and --repo when the repository is not the folder above the canon", async () => {
    const root = scratch(true);
    const dir = ledger(root, {});
    await run(["find", "month", "--canon", dir]);
    expect(ctxOf().gitDir?.replace(/\\/g, "/").toLowerCase()).toBe(execFileSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: root, encoding: "utf8" }).trim().toLowerCase());
    await run(["find", "month", "--canon", dir, "--repo", tmpdir()]);
    expect(ctxOf(1).repo.toLowerCase()).toBe(join(tmpdir()).toLowerCase());
  });

  it("returns the module's exit code", async () => {
    handed.answer.code = 1;
    expect((await run(["proposals", "apply", "P-9", "--canon", ledger(scratch(), {})])).code).toBe(1);
  });

  it("keeps the code tree's own commands, and `reading` without its word, out of the modules", async () => {
    const dir = ledger(scratch(), {});
    expect((await run(["code", "show", "c1-1", "--canon", dir])).code).toBe(1);
    expect(await run(["reading", "--canon", dir])).toEqual({ code: 2, out: "", err: "usage: headcanon reading parts <n>\n" });
    expect(handed.calls).toEqual([]);
  });

  it("refuses a module's command where there is no canon, and still names an option it does not know on a command it parses itself", async () => {
    const missing = join(scratch(), "canon");
    const r = await run(["find", "month", "--canon", missing]);
    expect([r.code, r.err]).toEqual([2, `No canon at ${missing}. Run \`headcanon init\`, or pass --canon <dir>.\n`]);
    expect(handed.calls).toEqual([]);
    expect((await run(["settings", "--canon", ledger(scratch(), {}), "--sideways"])).err).toBe("ignoring unknown option --sideways\n");
  });

  it("runs the gate before asking for a canon, with the hook's input on stdin and the project taken from the session, then from the input", async () => {
    const root = scratch(), elsewhere = scratch();
    const input = JSON.stringify({ agent_id: "a1", agent_type: "headcanon:implementer", cwd: root });
    delete process.env["CLAUDE_PROJECT_DIR"];
    expect(await run(["gate", "subagent-stop"], input)).toEqual({ code: 0, out: "", err: "" });
    expect(handed.calls[0]).toMatchObject({ fn: "gateCli", args: [["subagent-stop"], { canonDir: join(root, "canon") }] });
    expect(ctxOf().stdin()).toBe(input);
    process.env["CLAUDE_PROJECT_DIR"] = elsewhere;
    await run(["gate", "subagent-stop"], input);
    expect(ctxOf(1).canonDir).toBe(join(elsewhere, "canon"));
  });

  it("lets the agent go when the gate fails: a hook that ends in an error would hold it", async () => {
    handed.answer.fail = "the run store cannot be read";
    expect(await run(["gate", "subagent-stop"], "{}")).toEqual({ code: 0, out: "", err: "gate: the run store cannot be read\n" });
  });

  it("names every command and every operation in the help", async () => {
    const help = (await run(["--help"])).out;
    for (const command of ['context <ID>', 'find "<words>"', "code <sub>", "reading parts <n>", "propose <JSON|@F|->", "proposals", "tests <sub>", "run <sub>", "brief <ID>", "build <sub>", "slice <sub>", "gate subagent-stop", "op <JSON|@F|->", "ask <JSON|@F|->", "parcel <ID>", "claims", "working <ID...>", "wait [cursor]", "history", "settings", "upgrade", "stop-hook", "prompt-hook"]) expect(help).toContain(`\n  ${command} `);
    for (const op of ["link", "create", "bind", "note", "journey", "review", "dispatch", "returned"]) expect(help).toMatch(new RegExp(`\\(.*\\b${op}\\b.*\\); checked, logged`));
  });
});

describe("the hooks and stdin, as the processes they run as", () => {
  const tsx = fileURLToPath(new URL("../../../node_modules/tsx/dist/cli.mjs", import.meta.url));
  const source = pathToFileURL(fileURLToPath(new URL("../src/cli.ts", import.meta.url))).href;

  /** Start the CLI the way the launcher does: `main`, then `process.exit` with its code as soon as it returns. */
  function launch(argv: string[], stdin: string): Promise<{ code: number | null; out: string; err: string }> {
    const launcher = join(scratch(), "launcher.mts");
    writeFileSync(launcher, `import { main } from ${JSON.stringify(source)};\nmain(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e); process.exit(2); });\n`);
    return new Promise((ok, fail) => {
      const child = spawn(process.execPath, [tsx, launcher, ...argv], { stdio: ["pipe", "pipe", "pipe"] });
      let out = "", err = "";
      child.stdout.on("data", (c) => (out += String(c)));
      child.stderr.on("data", (c) => (err += String(c)));
      child.on("error", fail);
      child.on("close", (code) => ok({ code, out, err }));
      child.stdin.end(stdin);
    });
  }

  // On Windows a process that called `process.exit` after its requests died with a libuv assertion, and the hook's decision with it (run 10)
  it.skipIf(!existsSync(tsx))("the stop hook ends with exit code 0 and its decision after it has spoken to the viewer", async () => {
    const dir = ledger(scratch(true), { "REQ-1.1": BUILT, "REQ-1.2": {} });
    const v = await viewer(dir);
    const r = await launch(["stop-hook", "--canon", dir, "--port", String(v.port)], JSON.stringify({ last_assistant_message: "The months are drafted." }));
    expect([r.code, r.err]).toEqual([0, ""]);
    expect((JSON.parse(r.out) as { decision: string }).decision).toBe("block");
    expect(v.posts.map((p) => p.path)).toEqual(["/api/terminal"]);
  }, 60_000);

  it.skipIf(!existsSync(tsx))("the prompt hook mirrors the prompt and ends with exit code 0", async () => {
    const dir = ledger(scratch(true), { "REQ-1.1": BUILT });
    const v = await viewer(dir);
    const r = await launch(["prompt-hook", "--canon", dir, "--port", String(v.port)], JSON.stringify({ prompt: "Close March." }));
    expect(r).toEqual({ code: 0, out: "", err: "" });
    expect(v.posts).toEqual([{ path: "/api/terminal", body: { role: "human", text: "Close March." }, agent: undefined }]);
  }, 60_000);

  it.skipIf(!existsSync(tsx))("op reads the operation from the process's own stdin", async () => {
    const dir = ledger(scratch(true), { "REQ-1.1": BUILT });
    const r = await launch(["op", "-", "--canon", dir], JSON.stringify({ op: "term", term: "closed month", definition: "A month whose entries can no longer change." }));
    expect([r.code, r.err]).toEqual([0, ""]);
    expect((JSON.parse(r.out) as { ok: boolean }).ok).toBe(true);
  }, 60_000);
});
