import { execFileSync } from "node:child_process";
import { gitDirOf } from "../ops.js";
import { readSettings, writeSettings } from "../settings.js";
import { readingProgress } from "../reading.js";
import { journalChange, readJournal, revertTo } from "../journal.js";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { basename, dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { approveNode, deletePrinciple, deleteTerm, dropSection, editNode, editPrinciple, editTerm, setPrincipleState, setTermState } from "../edits.js";
import { addGlossaryTerm } from "../glossary.js";
import { descendants, loadCanon } from "../load.js";
import { parseFrontMatter, str } from "../parse.js";
import { SessionState, isHumanEntry, type AskAnswer, type AskRequest, type PendingQuestion, type TermDecision } from "../session.js";
import { buildSnapshot } from "../snapshot.js";
import { isLayer, type Layer } from "../types.js";
import { approveSlice, discardSlice } from "../approve.js";
import { marksOf, type BoxMark } from "../built.js";
import { activeRun, latestRun, runsDir, updateSlice, type Run, type Slice } from "../runs.js";
import { loadManifest, loadResults, resultsPath, testsOf, type TestEntry, type TestManifest, type TestResults } from "../testing.js";

const PUBLIC = fileURLToPath(new URL("../../public/", import.meta.url));

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

export interface ServeOptions {
  canonDir: string;
  port: number;
  host?: string;
}

export interface Served {
  url: string;
  port: number;
  session: SessionState;
  close: () => void;
}

/**
 * The viewer: static files, a JSON snapshot rebuilt from disk on every request, and the session
 * endpoints the page and the MCP server use (REQ-12.1.7). Edits made in the page write canon
 * files; the hook, the check and the verifier see them like any other change.
 */
/**
 * The canon's revision: a hash of every file's path, size and modification time under the canon directory. It
 * changes with any edit however it was made, so the page can re-read the canon without a feed entry. A directory
 * that cannot be read (the disk dropped) yields undefined, and the caller keeps the last value, so nothing flaps.
 */
const canonRevLast = new Map<string, string>();
/** When the session's MCP server last called, per canon: the page tells a live session from a dead one by it. */
const agentSeenAt = new Map<string, number>();
// The principles gate (DEC-025): the session waits for `principles-approved`. It arrives when the human presses
// "Approve the rest", or, once, when the last principle is settled one by one; a principle going back to a guess
// re-arms it. The human never has to press a button for a list they already went through.
const principlesGateSent = new Map<string, boolean>();
const principleSettled = (state: string): boolean => state === "stated" || state === "resolved";
function principlesGate(canonDir: string, session: SessionState): void {
  let prns: Array<{ state: string }> = [];
  try { prns = loadCanon(canonDir).principles; } catch { return; }
  if (prns.length && prns.every((x) => principleSettled(x.state))) {
    if (!principlesGateSent.get(canonDir)) { principlesGateSent.set(canonDir, true); session.push("principles-approved", { text: "every principle is settled" }); }
  } else principlesGateSent.set(canonDir, false);
}

function canonRev(canonDir: string): string | undefined {
  if (!existsSync(canonDir)) return "";
  try {
    const h = createHash("sha1");
    const walk = (dir: string, rel: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
        if (e.name.startsWith(".") || e.name === "node_modules") continue;
        const abs = join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(abs, r);
        else { const st = statSync(abs); h.update(`${r}|${st.size}|${st.mtimeMs}\n`); }
      }
    };
    walk(canonDir, "");
    return h.digest("hex").slice(0, 12);
  } catch { return undefined; }
}
/** The queue's file: under the repository's git directory, beside the review records; none outside a repository. */
function questionStore(canonDir: string): string | undefined {
  try {
    const dir = existsSync(canonDir) ? canonDir : dirname(canonDir);
    const gitDir = execFileSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return gitDir ? join(gitDir, "headcanon", "questions.json") : undefined;
  } catch { return undefined; }
}
/** Open long polls on the feed per canon: while one is open, a session is listening (DEC-025). */
const listeners = new Map<string, number>();
const listening = (canonDir: string): boolean => (listeners.get(canonDir) ?? 0) > 0;

// ---- marks, tests and the run: read from their stores on every call; a store that is absent or cannot be read
// answers empty, so the page works before the first test and outside a repository ----

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
/** A file's size and time, empty when it is absent: what a revision is made of. */
function stamp(file: string): string {
  try { const st = statSync(file, { throwIfNoEntry: false }); return st ? `${st.size}|${st.mtimeMs}` : ""; } catch { return ""; }
}
const revOf = (text: string): string => createHash("sha1").update(text).digest("hex").slice(0, 12);

/** Changes when the canon, `tests.json` (which lives in the canon folder) or `results.json` changes. */
function marksRev(canonDir: string, canon: string = canonRev(canonDir) ?? canonRevLast.get(canonDir) ?? ""): string {
  const git = gitDirOf(canonDir);
  let results = "";
  try { if (git) results = stamp(resultsPath(git)); } catch { /* no results yet */ }
  return revOf(`${canon}|${results}`);
}
/** Changes when any run's file changes. */
function runRev(canonDir: string): string {
  const git = gitDirOf(canonDir);
  let text = "";
  try {
    const dir = git ? runsDir(git) : undefined;
    if (dir && existsSync(dir)) text = readdirSync(dir).sort().map((name) => `${name}|${stamp(join(dir, name))}`).join("\n");
  } catch { /* no run yet */ }
  return revOf(text);
}

function testStores(canonDir: string): { manifest: TestManifest | undefined; results: TestResults | undefined } {
  let manifest: TestManifest | undefined, results: TestResults | undefined;
  try { manifest = loadManifest(canonDir); } catch { /* a record that cannot be read is no record */ }
  try { const git = gitDirOf(canonDir); if (git) results = loadResults(git); } catch { /* the same for the results */ }
  return { manifest, results };
}

interface MarksBody { rev: string; marks: Record<string, BoxMark>; counts: { notBuilt: number; outOfSync: number; tested: number; measurable: number } }
/** The last answer per canon: the page asks again on every change of `marksRev`, and often nothing it reads changed. */
const marksLast = new Map<string, MarksBody>();
function marksBody(canonDir: string): MarksBody {
  const rev = marksRev(canonDir);
  const hit = marksLast.get(canonDir);
  if (hit && hit.rev === rev) return hit;
  const canon = loadCanon(canonDir);
  const { manifest, results } = testStores(canonDir);
  let marks: Record<string, BoxMark> = {};
  try { marks = marksOf(canon, results, manifest); } catch { /* nothing is marked rather than the page failing */ }
  // counted over the boxes that carry a check, so a parent's mark never counts its children twice; a draft has no mark
  const measured = Object.values(canon.nodes).filter((n) => n.kind && n.state !== "draft");
  const counts = { notBuilt: 0, outOfSync: 0, tested: 0, measurable: measured.length };
  for (const n of measured) {
    const m = marks[n.id];
    if (!m) continue;
    if (m.mark === "not-built") counts.notBuilt++;
    if (m.mark === "out-of-sync") counts.outOfSync++;
    if (m.tests > 0) counts.tested++;
  }
  const body = { rev, marks, counts };
  marksLast.set(canonDir, body);
  return body;
}

/** A box's recorded tests in plain words, each with its last outcome when it has run. */
function testsFor(canonDir: string, id: string) {
  const node = loadCanon(canonDir).nodes[id];
  const { manifest, results } = testStores(canonDir);
  if (!node || !manifest) return [];
  let entries: TestEntry[] = [];
  try { entries = node.uid ? testsOf(manifest, node.uid) : manifest.tests.filter((t) => t.id === id); } catch { return []; }
  const recorded = results && Array.isArray(results.results) ? results.results : [];
  return entries.map((t) => {
    const r = recorded.find((x) => x.box === t.box && x.title === t.title && x.file === t.file) ?? recorded.find((x) => x.box === t.box && x.title === t.title);
    return {
      description: t.description, kind: t.kind, file: t.file, runner: t.runner, status: t.status,
      ...(t.journey ? { journey: t.journey } : {}),
      ...(r ? { outcome: r.outcome } : {}),
      ...(r?.message ? { message: r.message } : {}),
      ...(t.review ? { review: t.review } : {}),
    };
  });
}

/**
 * The run the page shows: the one in progress, or one that ended while a slice of it still waits on the person's
 * decision. A run that is over and decided is none, so the page offers a new one.
 */
function currentRun(canonDir: string): Run | undefined {
  const git = gitDirOf(canonDir);
  if (!git) return undefined;
  try {
    const active = activeRun(git);
    if (active) return active;
    const last = latestRun(git);
    return last?.slices.some((s) => s.status === "review") ? last : undefined;
  } catch { return undefined; }
}
/** The step a run is at: the one running or blocked, else the next one waiting. */
const stepOf = (run: Run): string | null =>
  (run.steps.find((s) => s.status === "running" || s.status === "blocked") ?? run.steps.find((s) => s.status === "waiting"))?.name ?? null;

/** The slice that waits on the person's decision for a box, with what a decision needs; or why there is none. */
function sliceInReview(canonDir: string, box: string): { git: string; repo: string; run: Run; slice: Slice } | { error: string } {
  const git = gitDirOf(canonDir);
  if (!git) return { error: "The canon is not inside a git repository, so there is no run to decide on." };
  const run = currentRun(canonDir);
  if (!run) return { error: "No run is waiting on your decision." };
  const slice = run.slices.find((s) => s.box === box || s.uid === box);
  if (!slice) return { error: `${box} is not part of the run.` };
  if (slice.status !== "review") return { error: `${slice.box} is not waiting on your decision: it is ${slice.status}.` };
  let repo = "";
  try { repo = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: canonDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { /* reported below */ }
  if (!repo) return { error: "The repository of this canon could not be found." };
  return { git, repo, run, slice };
}
/** The name git signs commits with in this repository: who approves. */
function gitUser(repo: string): string {
  try { return execFileSync("git", ["config", "user.name"], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; }
}

export async function serveUi(opts: ServeOptions): Promise<Served> {
  const host = opts.host ?? "127.0.0.1";
  const canonDir = resolve(opts.canonDir);
  const session = new SessionState(questionStore(canonDir));
  const server = createServer((req, res) => {
    route(req, res, canonDir, session).catch((e) => send(res, 500, "text/plain; charset=utf-8", e instanceof Error ? e.stack ?? e.message : String(e)));
  });
  await new Promise<void>((ok, fail) => {
    server.once("error", fail);
    server.listen(opts.port, host, () => ok());
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : opts.port;
  return { url: `http://${host}:${port}/`, port, session, close: () => server.close() };
}

async function route(req: IncomingMessage, res: ServerResponse, canonDir: string, session: SessionState): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const p = url.pathname;
  const method = req.method ?? "GET";
  const json = (status: number, body: unknown) => send(res, status, "application/json; charset=utf-8", JSON.stringify(body));

  if (p === "/api/health") return json(200, { ok: true, canon: canonDir });
  if (req.headers["x-headcanon-agent"]) agentSeenAt.set(canonDir, Date.now());
  if (p === "/api/snapshot") {
    const snap = buildSnapshot(canonDir);
    return send(res, 200, "application/json; charset=utf-8", JSON.stringify(snap));
  }

  // ---- session: what the page polls ----
  if (p === "/api/settings" && method === "GET") return json(200, readSettings(canonDir));
  if (p === "/api/settings" && method === "POST") {
    const body = (await readJson(req)) as { mode?: string; cap?: string | number | null };
    const mode = body?.mode === "guided" ? "guided" : body?.mode === "full-auto" ? "full-auto" : undefined;
    if (!mode) return json(400, { error: "mode is guided or full-auto" });
    const cap = body.cap === undefined || body.cap === null || body.cap === "" ? undefined : String(body.cap);
    const settings = { mode, ...(cap ? { cap } : {}), at: new Date().toISOString() } as const;
    writeSettings(canonDir, { mode, ...(cap ? { cap } : {}), at: settings.at });
    return json(200, { ok: true, settings, feed: session.push("onboarding", { text: `mode ${mode}${cap ? `, cap ${cap}` : ""}`, mode, ...(cap ? { cap } : {}) }) });
  }
  if (p === "/api/working" && method === "POST") {
    const body = (await readJson(req)) as { ids?: string[]; on?: boolean; by?: string };
    if (!Array.isArray(body?.ids)) return json(400, { error: "ids is required" });
    session.setWorking(body.ids.filter((x): x is string => typeof x === "string"), body.on !== false, typeof body.by === "string" && body.by.trim() ? body.by.trim().slice(0, 60) : "session");
    return json(200, { ok: true, working: session.workingIds(), workers: session.workers() });
  }
  if (p === "/api/history" && method === "GET") return json(200, { entries: readJournal(canonDir).slice(-300).reverse().map((e) => ({ seq: e.seq, at: e.at, kind: e.kind, summary: e.summary, id: e.id, files: e.files.map((f) => f.path) })) });
  if (p === "/api/revert" && method === "POST") {
    const body = (await readJson(req)) as { seq?: number };
    const seq = Number(body?.seq);
    if (!Number.isFinite(seq) || seq < 1) return json(400, { error: "seq is required" });
    const r = revertTo(canonDir, seq);
    session.refresh();
    return json(200, { ok: true, ...r, feed: session.push("revert", { text: `reverted to before change #${seq}: ${r.restored} file(s) restored` }) });
  }
  if (p === "/api/terminal" && method === "POST") {
    const body = (await readJson(req)) as { role?: string; text?: string };
    if (!body?.text?.trim()) return json(400, { error: "text is required" });
    return json(200, session.push("terminal", { text: body.text.trim().slice(0, 4000), role: body.role === "session" ? "session" : "human" }));
  }
  if (p === "/api/status" && method === "GET") {
    const run = currentRun(canonDir);
    return json(200, { listening: listening(canonDir), working: session.workingIds(), workers: session.workers(), settings: readSettings(canonDir), reading: (() => { const g = gitDirOf(canonDir); return g ? readingProgress(g, canonDir) : undefined; })(), run: run ? { id: run.id, status: run.status, step: stepOf(run) } : null });
  }

  // ---- marks, tests, and Implement/align: the page asks, the listening session does the work ----
  if (p === "/api/marks" && method === "GET") return json(200, marksBody(canonDir));
  if (p === "/api/tests" && method === "GET") {
    const id = url.searchParams.get("id") ?? "";
    if (!id) return json(400, { error: "id is required" });
    return json(200, { tests: testsFor(canonDir, id) });
  }
  if (p === "/api/run" && method === "GET") return json(200, { run: currentRun(canonDir) ?? null, listening: listening(canonDir) });
  if (p === "/api/implement" && method === "POST") {
    const body = (await readJson(req)) as { ids?: unknown; single?: boolean };
    if (!Array.isArray(body?.ids)) return json(400, { ok: false, error: "ids is required" });
    const ids = body.ids.map((x) => (typeof x === "string" ? x.trim() : ""));
    // an id that is not a box is refused rather than dropped: an empty scope means every box
    const nodes = loadCanon(canonDir).nodes;
    const unknown = body.ids.filter((_, i) => !ids[i] || (ids[i] !== "ROOT" && !nodes[ids[i]!]));
    if (unknown.length) return json(400, { ok: false, error: `no such box: ${unknown.map(String).join(", ")}` });
    const scope = [...new Set(ids)], single = body.single === true;
    if (single && scope.length !== 1) return json(400, { ok: false, error: "single takes one box" });
    session.push("implement-request", { id: scope.join(" "), text: single ? "single" : "all" });
    return json(200, { ok: true, listening: listening(canonDir) });
  }
  if (p === "/api/run/stop" && method === "POST") {
    session.push("run-stop", { text: "The human asked to stop the run." });
    return json(200, { ok: true, listening: listening(canonDir) });
  }
  if (p === "/api/run/continue" && method === "POST") {
    session.push("run-continue", { text: "The human asked to continue the run." });
    return json(200, { ok: true, listening: listening(canonDir) });
  }
  // The person's final decision on a slice. Approving and discarding are done here, in git, before the session hears.
  const sliceMatch = method === "POST" ? /^\/api\/slice\/(approve|discard|send-back)$/.exec(p) : null;
  if (sliceMatch) {
    const body = (await readJson(req)) as { box?: string; note?: string };
    const box = typeof body?.box === "string" ? body.box.trim() : "";
    if (!box) return json(400, { ok: false, error: "box is required" });
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (sliceMatch[1] === "send-back" && !note) return json(400, { ok: false, error: "note is required: say what to change" });
    const found = sliceInReview(canonDir, box);
    if ("error" in found) return json(200, { ok: false, error: found.error });
    const { git, repo, run, slice } = found;
    // what git did stands even when the run's file cannot be written: the session still hears the decision
    const settle = (status: Slice["status"]) => { try { updateSlice(git, run.id, slice.box, { status }); } catch { /* the feed carries it */ } };
    try {
      if (sliceMatch[1] === "send-back") {
        updateSlice(git, run.id, slice.box, { status: "sent-back", note });
        session.push("slice-sent-back", { id: slice.box, text: note });
        return json(200, { ok: true });
      }
      if (sliceMatch[1] === "discard") {
        const r = discardSlice(repo, canonDir, run, slice.box);
        if (!r.ok) return json(200, { ok: false, error: r.error ?? `${slice.box} could not be discarded.` });
        settle("discarded");
        session.push("slice-discarded", { id: slice.box, text: `${slice.box}: the human discarded what was built` });
        return json(200, { ok: true });
      }
      const who = gitUser(repo);
      if (!who) return json(200, { ok: false, error: "Git has no user name in this repository. Set one with `git config user.name \"<your name>\"`, then approve again." });
      const r = approveSlice(repo, canonDir, run, slice.box, who);
      if (!r.ok) return json(200, { ok: false, error: r.error ?? `${slice.box} could not be approved.` });
      settle("approved");
      session.push("slice-approved", { id: slice.box, text: `${slice.box}: approved by ${who}${r.sha ? `, commit ${r.sha.slice(0, 10)}` : ""}` });
      return json(200, { ok: true, ...(r.sha ? { sha: r.sha } : {}) });
    } catch (e) {
      return json(200, { ok: false, error: errorText(e) });
    }
  }
  if (p === "/api/principles/approve" && method === "POST") {
    // "Approve the rest": every principle still guessed becomes approved, in one change, then the gate opens
    const readme = join(canonDir, "README.md");
    const open = existsSync(readme) ? loadCanon(canonDir).principles.filter((x) => !principleSettled(x.state)).map((x) => x.id) : [];
    if (open.length) journalChange(canonDir, { kind: "page", summary: `${open.length} principle${open.length === 1 ? "" : "s"} approved as listed` }, [readme], () => { let text = readFileSync(readme, "utf8"); for (const id of open) text = setPrincipleState(text, id, "resolved"); writeFileSync(readme, text); });
    for (const id of open) session.push("node-approved", { id, path: "README.md", text: `${id} approved as written` });
    principlesGateSent.set(canonDir, true);
    return json(200, { ok: true, approved: open, feed: session.push("principles-approved", { text: "the principles were approved as listed" }) });
  }
  if (p === "/api/session" && method === "GET") {
    // the queue file may have been rewritten by an operation (ids moved); the canon may have lost a box whose
    // question is still queued: both are read from disk here, where the page asks
    session.refresh();
    const rev = canonRev(canonDir);
    if (rev !== undefined && rev !== canonRevLast.get(canonDir)) {
      canonRevLast.set(canonDir, rev);
      const nodes = loadCanon(canonDir).nodes;
      for (const id of new Set(session.queued().map((x) => x.nodeId).filter((x): x is string => Boolean(x) && x !== "ROOT" && !nodes[x!]))) session.supersede(id, "the box is gone");
    }
    const q = session.current();
    // the queue is the heavy part of this poll (every open question with its options): it travels only when it changed
    const queueRev = createHash("sha1").update(session.queued().map((x) => x.id).join("|")).digest("hex").slice(0, 10);
    const queue = url.searchParams.get("queueRev") === queueRev ? undefined : session.queuedFull().map(presentQuestion);
    return json(200, { question: q ? presentQuestion(q) : null, pending: session.pendingCount(), queueRev, ...(queue ? { queue } : {}), focus: session.focus(), cursor: session.changes().cursor, doing: session.doing, rev: canonRevLast.get(canonDir) ?? "", marksRev: marksRev(canonDir, canonRevLast.get(canonDir) ?? ""), runRev: runRev(canonDir), agentSeenAgo: agentSeenAt.has(canonDir) ? Math.round((Date.now() - agentSeenAt.get(canonDir)!) / 1000) : null });
  }
  if (p === "/api/ask" && method === "POST") {
    const body = (await readJson(req)) as AskRequest;
    if (!body || typeof body.question !== "string") return json(400, { error: "question is required" });
    const q = session.ask(body);
    return json(200, { questionId: q.id });
  }
  if (p === "/api/wait" && method === "GET") {
    const id = url.searchParams.get("id") ?? "";
    const timeout = Math.min(Number(url.searchParams.get("timeout") ?? 25), 25) * 1000;
    const r = await session.waitFor(id, timeout);
    if (r === null) return json(200, { unknown: true });
    return json(200, r ? { answer: r } : { pending: true });
  }
  if (p === "/api/answer" && method === "POST") {
    const body = (await readJson(req)) as Partial<AskAnswer>;
    if (!body?.questionId) return json(400, { error: "questionId is required" });
    const ok = session.answer({ questionId: body.questionId, selected: body.selected ?? [], other: body.other ?? "", terms: (body.terms ?? []) as TermDecision[] });
    return json(ok ? 200 : 404, ok ? { ok } : { ok, error: "that question is no longer open: it was answered, withdrawn, or replaced by a newer one on the same box" });
  }
  if (p === "/api/focus" && method === "POST") {
    const body = (await readJson(req)) as { id?: string; open?: boolean };
    if (!body?.id) return json(400, { error: "id is required" });
    session.setFocus(body.id, body.open === true);
    return json(200, { ok: true, focus: session.focus() });
  }
  if (p === "/api/changes" && method === "GET") {
    const since = Number(url.searchParams.get("since") ?? 0);
    const timeout = Math.min(Math.max(Number(url.searchParams.get("timeout") ?? 0), 0), 25);
    // `wake=human`: the session's own says and the terminal mirror do not end the wait (DEC-025, waiting costs nothing)
    const wakes = url.searchParams.get("wake") === "human" ? isHumanEntry : undefined;
    listeners.set(canonDir, (listeners.get(canonDir) ?? 0) + 1);
    try { return json(200, await session.waitChanges(since, timeout * 1000, wakes)); } finally { listeners.set(canonDir, Math.max(0, (listeners.get(canonDir) ?? 1) - 1)); }
  }
  if (p === "/api/message" && method === "POST") {
    const body = (await readJson(req)) as { text?: string; nodeId?: string; quote?: string };
    if (!body?.text?.trim()) return json(400, { error: "text is required" });
    return json(200, session.push("message", { text: body.text.trim(), id: body.nodeId, quote: body.quote?.trim() || undefined }));
  }
  // The session rewrote a box the human was writing in; the human chose, and the session hears which.
  if (p === "/api/conflict" && method === "POST") {
    const body = (await readJson(req)) as { id?: string; choice?: string };
    if (!body?.id) return json(400, { error: "id is required" });
    const keep = body.choice === "keep";
    return json(200, session.push("edit-conflict", { id: body.id, text: keep ? `${body.id}: the human keeps their own rewrite in progress over yours; leave the box until their words arrive` : `${body.id}: the human took your rewrite and dropped theirs` }));
  }
  // The session speaks to the human: a line in the page's chat, optionally about a node.
  if (p === "/api/say" && method === "POST") {
    const body = (await readJson(req)) as { text?: string; nodeId?: string; to?: string; doing?: string[]; attention?: boolean };
    if (!body?.text?.trim()) return json(400, { error: "text is required" });
    if (Array.isArray(body.doing)) session.setDoing(body.doing);
    return json(200, session.push("say", { text: body.text.trim(), id: body.nodeId, to: body.to === "human" ? "human" : undefined, ...(body.attention === true ? { attention: true } : {}), ...(body.to === "intro" ? { intro: true } : {}) }));
  }
  if (p === "/api/withdraw" && method === "POST") {
    const body = (await readJson(req)) as { nodeId?: string; reason?: string; by?: string };
    if (!body?.nodeId) return json(400, { error: "nodeId is required" });
    // with `by`, only that author's questions on the box: an agent withdraws its own, never another's
    const by = typeof body.by === "string" && body.by.trim() ? body.by.trim() : undefined;
    return json(200, { withdrawn: session.supersede(body.nodeId, body.reason?.trim() || "the session decided it", by ? (q) => q.by === by : undefined) });
  }
  if (p === "/api/finish" && method === "POST") {
    return json(200, session.push("finish-request", { text: "The human asked to finish the adoption." }));
  }
  if (p === "/api/refine" && method === "POST") {
    const body = (await readJson(req)) as { id?: string; note?: string };
    if (!body?.id) return json(400, { error: "id is required" });
    return json(200, session.push("refine-request", { id: body.id, text: body.note?.trim() || `Define ${body.id} next.` }));
  }
  if (p === "/api/term" && method === "POST") {
    const body = (await readJson(req)) as { term?: string; definition?: string; decision?: "keep" | "drop"; replacement?: string };
    if (!body?.term || !body.decision) return json(400, { error: "term and decision are required" });
    if (body.decision === "keep") {
      const w = addGlossaryTerm(canonDir, body.term, body.definition ?? "");
      return json(200, { ok: true, ...w, feed: session.push("term-enshrined", { id: w.id, text: `${body.term}: ${body.definition ?? ""}`, path: "README.md" }) });
    }
    return json(200, { ok: true, feed: session.push("term-dropped", { text: `${body.term}${body.replacement ? ` → ${body.replacement}` : ""}` }) });
  }

  // ---- nodes: read raw, edit, approve, delete, create ----
  const nodeMatch = /^\/api\/node\/([^/]+)(\/raw|\/approve)?$/.exec(p);
  const today = () => new Date().toISOString().slice(0, 10);
  // A glossary term lives in the root README with its own marker; the page approves, rewrites and deletes it there.
  if (nodeMatch && nodeMatch[2] !== "/raw" && /^TERM-/.test(decodeURIComponent(nodeMatch[1] ?? ""))) {
    const id = decodeURIComponent(nodeMatch[1] ?? "");
    const readme = join(canonDir, "README.md");
    if (!existsSync(readme) || !loadCanon(canonDir).terms.some((t) => t.id === id)) return json(404, { error: "no such term" });
    const text = readFileSync(readme, "utf8");
    if (method === "POST" && nodeMatch[2] === "/approve") {
      journalChange(canonDir, { kind: "page", summary: `${id} approved in the page`, id }, [readme], () => writeFileSync(readme, setTermState(text, id, "resolved")));
      return json(200, { ok: true, path: "README.md", feed: session.push("node-approved", { id, path: "README.md", text: `${id} approved as written` }) });
    }
    if (method === "PUT") {
      const body = (await readJson(req)) as { title?: string; intent?: string };
      if (typeof body?.intent !== "string" || !body.intent.trim()) return json(400, { error: "intent is required" });
      journalChange(canonDir, { kind: "page", summary: `${id} edited in the page`, id }, [readme], () => writeFileSync(readme, editTerm(text, id, { term: body.title?.trim() || undefined, definition: body.intent! })));
      return json(200, { ok: true, path: "README.md", feed: session.push("node-edited", { id, path: "README.md", text: `${id} rewritten: ${body.intent.trim().slice(0, 120)}` }) });
    }
    if (method === "DELETE") {
      journalChange(canonDir, { kind: "page", summary: `${id} deleted in the page`, id }, [readme], () => writeFileSync(readme, deleteTerm(text, id)));
      return json(200, { ok: true, removed: [id], feed: session.push("node-deleted", { id, path: "README.md", text: `${id} deleted in the page` }) });
    }
  }
  // A principle lives in the root README with its own marker; the page approves, rewrites and deletes it there.
  if (nodeMatch && nodeMatch[2] !== "/raw" && /^PRN-\d+$/.test(decodeURIComponent(nodeMatch[1] ?? ""))) {
    const id = decodeURIComponent(nodeMatch[1] ?? "");
    const readme = join(canonDir, "README.md");
    if (!existsSync(readme) || !loadCanon(canonDir).principles.some((x) => x.id === id)) return json(404, { error: "no such principle" });
    const text = readFileSync(readme, "utf8");
    if (method === "POST" && nodeMatch[2] === "/approve") {
      journalChange(canonDir, { kind: "page", summary: `${id} approved in the page`, id }, [readme], () => writeFileSync(readme, setPrincipleState(text, id, "resolved")));
      const feed = session.push("node-approved", { id, path: "README.md", text: `${id} approved as written` });
      principlesGate(canonDir, session);
      return json(200, { ok: true, path: "README.md", feed });
    }
    if (method === "PUT") {
      const body = (await readJson(req)) as { title?: string; intent?: string };
      if (typeof body?.intent !== "string" || !body.intent.trim()) return json(400, { error: "intent is required" });
      journalChange(canonDir, { kind: "page", summary: `${id} edited in the page`, id }, [readme], () => writeFileSync(readme, editPrinciple(text, id, { title: body.title?.trim() || undefined, statement: body.intent! }, today())));
      const feed = session.push("node-edited", { id, path: "README.md", text: `${id} rewritten: ${body.intent.trim().slice(0, 120)}` });
      principlesGate(canonDir, session);
      return json(200, { ok: true, path: "README.md", feed });
    }
    if (method === "DELETE") {
      journalChange(canonDir, { kind: "page", summary: `${id} deleted in the page`, id }, [readme], () => writeFileSync(readme, deletePrinciple(text, id)));
      const feed = session.push("node-deleted", { id, path: "README.md", text: `${id} deleted in the page` });
      principlesGate(canonDir, session);
      return json(200, { ok: true, removed: [id], feed });
    }
  }
  if (nodeMatch && method === "GET" && nodeMatch[2] === "/raw") {
    const file = fileOf(canonDir, decodeURIComponent(nodeMatch[1] ?? ""));
    if (!file) return json(404, { error: "no such node" });
    return json(200, { id: nodeMatch[1], path: file.rel, text: readFileSync(file.abs, "utf8") });
  }
  if (nodeMatch && method === "POST" && nodeMatch[2] === "/approve") {
    const id = decodeURIComponent(nodeMatch[1] ?? "");
    const file = fileOf(canonDir, id);
    if (!file) return json(404, { error: "no such node" });
    journalChange(canonDir, { kind: "page", summary: `${id} approved as written`, id }, [file.abs], () => writeFileSync(file.abs, approveNode(readFileSync(file.abs, "utf8"), today())));
    return json(200, { ok: true, path: file.rel, feed: session.push("node-approved", { id, path: file.rel, text: `${id} approved as written` }) });
  }
  if (nodeMatch && method === "PUT" && !nodeMatch[2]) {
    const id = decodeURIComponent(nodeMatch[1] ?? "");
    const file = fileOf(canonDir, id);
    if (!file) return json(404, { error: "no such node" });
    const body = (await readJson(req)) as { text?: string; title?: string; intent?: string; resolve?: string };
    if (typeof body?.text === "string") {
      const { data } = parseFrontMatter(body.text);
      if (str(data["id"])?.trim() !== id) return json(400, { error: `the front-matter id must stay ${id}` });
      journalChange(canonDir, { kind: "page", summary: `${id} edited as text`, id }, [file.abs], () => writeFileSync(file.abs, body.text!.endsWith("\n") ? body.text! : body.text + "\n"));
      session.supersede(id, "the human edited the box");
      return json(200, { ok: true, path: file.rel, feed: session.push("node-edited", { id, path: file.rel, text: "edited in the page" }) });
    }
    // Fields from the popup: the typed text is the human's wording, stated, and becomes the entry.
    if (typeof body?.intent !== "string" || !body.intent.trim()) return json(400, { error: "text or intent is required" });
    // settling an issue with these words also drops the section the issue came from
    let out = editNode(readFileSync(file.abs, "utf8"), { title: body.title?.trim() || undefined, intent: body.intent }, today());
    if (body.resolve === "contested") out = dropSection(out, "Contested");
    journalChange(canonDir, { kind: "page", summary: `${id} ${body.resolve ? "settled" : "rewritten"} in the page`, id }, [file.abs], () => writeFileSync(file.abs, out));
    // the human's words make every pending question on the box stale
    session.supersede(id, "the human rewrote the box");
    return json(200, { ok: true, path: file.rel, feed: session.push("node-edited", { id, path: file.rel, text: `${id} ${body.resolve ? "settled" : "rewritten"}: ${body.intent.trim().slice(0, 120)}` }) });
  }
  if (nodeMatch && method === "DELETE" && !nodeMatch[2]) {
    const id = decodeURIComponent(nodeMatch[1] ?? "");
    const file = fileOf(canonDir, id);
    if (!file) return json(404, { error: "no such node" });
    const canon = loadCanon(canonDir);
    const removed = [id, ...descendants(canon, id)];
    journalChange(canonDir, { kind: "page", summary: `${id} deleted in the page`, id }, [basename(file.abs) === "README.md" ? dirname(file.abs) : file.abs], () => {
      if (basename(file.abs) === "README.md") rmSync(dirname(file.abs), { recursive: true, force: true });
      else rmSync(file.abs, { force: true });
    });
    for (const r of removed) session.supersede(r, "the box was deleted");
    return json(200, { ok: true, removed, feed: session.push("node-deleted", { id, path: file.rel, text: `${removed.join(", ")} deleted in the page` }) });
  }
  if (p === "/api/node" && method === "POST") {
    const body = (await readJson(req)) as { parent?: string; title?: string; intent?: string; layer?: string };
    if (!body?.title?.trim()) return json(400, { error: "title is required" });
    const r = createNode(canonDir, body.parent?.trim() || undefined, body.title.trim(), (body.intent ?? "").trim(), isLayer(body.layer) ? body.layer : undefined);
    if ("error" in r) return json(400, r);
    return json(200, { ...r, feed: session.push("node-created", { id: r.id, path: r.path, text: `${body.title.trim()} (created in the page)` }) });
  }

  // ---- static ----
  const rel = p === "/" ? "index.html" : p.replace(/^\/+/, "");
  const file = normalize(join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC) || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, "text/plain; charset=utf-8", `Not found: ${p}`);
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
  createReadStream(file).pipe(res);
}

/** The `Sources: [1] a, [2] b` line of a question, as a map from footnote number to source. */
export function parseSources(question: string): Map<string, string> {
  const out = new Map<string, string>();
  const line = /^Sources:\s*(.+)$/m.exec(question)?.[1];
  if (!line) return out;
  for (const m of line.matchAll(/\[(\d+)\]\s*([^[]+?)\s*(?=[,;.]?\s*\[\d+\]|[.]?\s*$)/g)) out.set(m[1]!, (m[2] ?? "").replace(/[,;]$/, "").trim());
  return out;
}

/** Replace text outside tags, leaving the HTML tags themselves alone. */
function mapText(html: string, fn: (text: string) => string): string {
  return html.split(/(<[^>]+>)/).map((seg) => (seg.startsWith("<") ? seg : fn(seg))).join("");
}

/**
 * The question as the page shows it: rendered HTML with each jargon term wrapped in a span, and
 * each footnote marker carrying its source as a tooltip instead of a Sources line at the end.
 */
function presentQuestion(q: PendingQuestion) {
  const sources = parseSources(q.question);
  const decorate = (input: string) => {
    let html = input;
    if (sources.size) {
      html = html.replace(/<p>Sources:[\s\S]*?<\/p>\s*/i, "");
      html = mapText(html, (text) => text.replace(/\[(\d+)\]/g, (m, n: string) => (sources.has(n) ? `<sup class="fn" title="${escapeAttr(sources.get(n)!)}">${m}</sup>` : m)));
    }
    for (const t of q.terms) {
      const re = new RegExp(`\\b(${t.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\b`, "gi");
      html = mapText(html, (seg) => seg.replace(re, (m) => `<span class="jargon" data-term="${escapeAttr(t.term)}">${m}</span>`));
    }
    return html;
  };
  // An option's description is the item's draft; it gets the same tooltips and jargon marks as the body.
  const options = q.options.map((o) => ({ ...o, html: o.description ? decorate(marked.parseInline(o.description, { async: false }) as string) : "" }));
  return { ...q, options, html: decorate(marked.parse(q.question, { async: false }) as string) };
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function fileOf(canonDir: string, id: string): { abs: string; rel: string } | undefined {
  const canon = loadCanon(canonDir);
  const rel = id === "ROOT" ? canon.root?.file : canon.nodes[id]?.file ?? canon.journeys.find((j) => j.id === id)?.file ?? canon.decisions.find((d) => d.id === id)?.file;
  if (!rel) return undefined;
  const abs = resolve(canonDir, rel);
  if (!abs.startsWith(resolve(canonDir))) return undefined;
  return { abs, rel };
}

function slugOf(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "node";
}

/** Create a child node file; a leaf parent becomes a folder with a README first. */
function createNode(canonDir: string, parentId: string | undefined, title: string, intent: string, layer: Layer | undefined): { id: string; path: string } | { error: string } {
  const canon = loadCanon(canonDir);
  let dir = canonDir;
  let id: string;
  let depth = 0;
  if (parentId) {
    const parent = canon.nodes[parentId];
    if (!parent) return { error: `no such parent ${parentId}` };
    const parentAbs = resolve(canonDir, parent.file);
    if (basename(parentAbs) !== "README.md") {
      const folder = parentAbs.replace(/\.md$/, "");
      mkdirSync(folder, { recursive: true });
      renameSync(parentAbs, join(folder, "README.md"));
      dir = folder;
    } else dir = dirname(parentAbs);
    const used = parent.children.map((c) => Number(c.slice(parentId.length + 1).split(".")[0])).filter((n) => Number.isFinite(n));
    id = `${parentId}.${(used.length ? Math.max(...used) : 0) + 1}`;
    depth = parent.depth + 1;
  } else {
    const used = canon.roots.map((r) => Number(r.replace(/^REQ-/, "").split(".")[0])).filter((n) => Number.isFinite(n));
    id = `REQ-${(used.length ? Math.max(...used) : 0) + 1}`;
  }
  const chosen: Layer = layer ?? (["domain", "capability", "requirement"][Math.min(depth, 2)] as Layer);
  const file = join(dir, `${id}-${slugOf(title)}.md`);
  const today = new Date().toISOString().slice(0, 10);
  const text = `---\nid: ${id}\n${parentId ? `parent: ${parentId}\n` : ""}title: "${title.replace(/"/g, "'")}"\nstate: stated\nlayer: ${chosen}\nsource: "created in the viewer, ${today}"\n---\n\n# ${title}\n\n## Stated\n\n> ${intent || title}\n\nSource: typed by the human in the viewer, ${today}\n`;
  writeFileSync(file, text);
  return { id, path: file.slice(resolve(canonDir).length + 1).split("\\").join("/") };
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((ok, fail) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        ok(data ? JSON.parse(data) : {});
      } catch (e) {
        fail(e);
      }
    });
    req.on("error", fail);
  });
}

function send(res: ServerResponse, status: number, type: string, body: string) {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}
