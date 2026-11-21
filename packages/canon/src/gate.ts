import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { sliceCommits } from "./approve.js";
import { parseTrailers } from "./commit-msg.js";
import { loadCanon } from "./load.js";
import { RETRY_BUDGET, gitDirOf } from "./ops.js";
import { sliceOfAgent, updateSlice, type CliCtx, type Run, type Slice, type SliceStatus } from "./runs.js";
import { SessionState, type AskRequest } from "./session.js";
import { loadManifest, loadResults, treeDigest, type Outcome, type TestManifest, type TestResult, type TestResults } from "./testing.js";
import type { Canon } from "./types.js";

/**
 * The stop gate of an implementation agent. The agent is free in how it builds; what holds it is here: it may stop
 * when the tests of the boxes it owes pass and its work is committed in the intent format, or when every box still
 * failing waits on the person behind an issue. `stopDecision` is the rule, a pure function; `sliceFacts` gathers
 * what it weighs from the stored test result, git and the question store; `gateCli` is the SubagentStop hook, which
 * answers for implementation agents of an active run and stays silent for everyone else.
 */

export interface GateDecision { decision: "allow" | "block"; reason: string; fileIssues?: Array<{ box: string; text: string }> }

export interface StopInput { run: Run; slice: Slice; results: TestResults | undefined; tree: string; dirty: boolean; badCommits: string[]; openIssuesByBox: Record<string, number>; regressed: string[] }

export const OUTCOME_WORDS: Record<Outcome, string> = {
  passed: "passed",
  failed: "failed",
  errored: "broke before it could finish",
  skipped: "was skipped",
  missing: "its file is gone",
  changed: "its file was changed after it was accepted",
  stale: "its box was reworded after the test was written, so it was not run",
  "not-run": "was not run",
};
/** What a builder can break: a test that ran and did not pass, or whose file it removed or changed. */
const BROKEN: ReadonlySet<Outcome> = new Set<Outcome>(["failed", "errored", "missing", "changed"]);

const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];
const oneLine = (s: string, max: number): string => { const t = s.replace(/\s+/g, " ").trim(); return t.length > max ? `${t.slice(0, max)}…` : t; };
const sameSet = (a: string[], b: string[]): boolean => a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");
const testLine = (r: Pick<TestResult, "title" | "file" | "outcome" | "message">): string => `- ${r.title} (${r.file}): ${OUTCOME_WORDS[r.outcome] ?? r.outcome}${r.message ? `: ${oneLine(r.message, 300)}` : ""}`;
export const agentNameOf = (slice: Slice): string => slice.agentName ?? `implementer-${slice.box}`;

/** The results of the tests a slice owes that did not pass. Only a pass counts: a test skipped, stale or not run proves nothing. */
export function failingOf(slice: Slice, results: TestResults | undefined): TestResult[] {
  const owed = new Set(slice.owes);
  return (results?.results ?? []).filter((r) => owed.has(r.box) && r.outcome !== "passed");
}

/** The tree a result was measured on: one kept from an earlier run of other boxes carries its own. */
const treeOf = (r: TestResult, results: TestResults): string => (r as { tree?: string }).tree ?? results.tree;

/** The stored result speaks for the files as they are now: it was measured on this tree, every owed test with it. */
export function isFresh(input: Pick<StopInput, "slice" | "results" | "tree">): boolean {
  const { slice, results, tree } = input;
  if (!results || results.tree !== tree) return false;
  const owed = new Set(slice.owes);
  return results.results.every((r) => !owed.has(r.box) || treeOf(r, results) === tree);
}

/** Titles that passed in the run's first run and are broken now, whoever's box they test; a result measured on an earlier tree says nothing. */
export function regressedOf(run: Run, results: TestResults | undefined): string[] {
  if (!results) return [];
  const before = new Set(run.firstRun?.passing ?? []);
  return uniq(results.results.filter((r) => before.has(r.title) && BROKEN.has(r.outcome) && treeOf(r, results) === results.tree).map((r) => r.title)).sort();
}

/** What an attempt left failing, as the set compared from one stop to the next. */
export function failingSet(input: Pick<StopInput, "slice" | "results" | "regressed">): string[] {
  return uniq([...failingOf(input.slice, input.results).map((r) => r.title), ...input.regressed]).sort();
}

/** The decision, and whether this stop counts as an attempt: the agent was sent back with tests to make pass. */
function decide(input: StopInput): GateDecision & { counts: boolean } {
  const { run, slice, results, dirty, badCommits, openIssuesByBox, regressed } = input;
  const testCommand = `HC tests run --run ${run.id}`;
  const block = (reason: string, counts = false) => ({ decision: "block" as const, reason, counts });
  const allow = (reason: string, fileIssues?: GateDecision["fileIssues"]) => ({ decision: "allow" as const, reason, counts: false, ...(fileIssues?.length ? { fileIssues } : {}) });

  if (!results || !isFresh(input))
    return block(`Run the tests first: \`${testCommand}\`. No test result is stored for the files as they are now, so nothing shows whether your boxes pass.`);
  if (badCommits.length)
    return block(`These commits are not in the intent format:\n${badCommits.map((c) => `- ${c}`).join("\n")}\nRewrite each message: a Conventional Commits header, then a last paragraph with the line \`Intent: ${slice.box}\`. Then stop again.`);

  const failing = failingOf(slice, results);
  const set = failingSet(input);
  // the same tests failing again after the budget of retries: the agent is let go and the person decides
  const spent = set.length > 0 && sameSet(set, slice.lastFailing) && slice.attempts >= RETRY_BUDGET;
  if (regressed.length && !spent)
    return block(`These tests passed before you started and fail now:\n${regressed.map((t) => { const r = results.results.find((x) => x.title === t); return r ? testLine(r) : `- ${t}`; }).join("\n")}\nMake them pass again without breaking your own, run \`${testCommand}\`, then stop again.`, true);
  if (!failing.length && !regressed.length) {
    if (!dirty) return allow("every test of its boxes passes and the tree is clean");
    return block("Commit your work: the tests pass but the tree is not clean (`git status` lists what is left). One commit per box, in the intent format, naming the box; remove what should not stay. Then stop again.");
  }
  if (dirty)
    return block("Commit your work: the tree is not clean (`git status` lists what is left). Commit what you want kept, one commit per box, in the intent format, naming the box, and remove the rest. Then stop again.");

  const failingBoxes = uniq(failing.map((r) => r.box));
  const unasked = failingBoxes.filter((b) => !((openIssuesByBox[b] ?? 0) > 0));
  if (!regressed.length && !unasked.length) return allow("every box still failing has an issue waiting on the person");
  if (spent) {
    const stops = slice.attempts + 1;
    const issues = unasked.map((box) => ({ box, text: `The implementation agent could not make this box pass: the same tests failed at ${stops} stops in a row.\nStill failing:\n${failing.filter((r) => r.box === box).map(testLine).join("\n")}` }));
    if (regressed.length) issues.push({ box: slice.uid, text: `Building this box broke tests that passed before, and the implementation agent could not make them pass again in ${stops} stops in a row.\nBroken:\n${regressed.map((t) => `- ${t}`).join("\n")}` });
    return allow(`the same tests failed at ${stops} stops in a row: filed for the person as impossible`, issues);
  }
  const name = agentNameOf(slice);
  return block([
    "These tests of your boxes do not pass yet:",
    ...failing.map(testLine),
    "There are two ways out.",
    `One: make them pass, run \`${testCommand}\` again, commit, then stop.`,
    `Two: for each box you cannot make pass, file an issue that blocks it and says what you tried and what stands in the way, then stop. The issue goes through \`HC ask -\` with \`nodeId\` the box, \`by\` "${name}", \`blocks\` true, and \`kind\` "impossible" when you tried and could not.`,
    ...(unasked.length < failingBoxes.length ? ["Boxes that already have your issue need no second one."] : []),
  ].join("\n"), true);
}

export function stopDecision(input: StopInput): GateDecision {
  const d = decide(input);
  return { decision: d.decision, reason: d.reason, ...(d.fileIssues ? { fileIssues: d.fileIssues } : {}) };
}

/**
 * What the slice records after this stop. A stop counts as an attempt when the agent is sent back with tests to make
 * pass; a stop refused for stale results, a commit message or an unclean tree does not. The same tests again add one;
 * a different set starts over.
 */
export function nextAttempt(input: StopInput): { attempts: number; lastFailing: string[] } {
  const { slice } = input;
  const d = decide(input);
  if (!isFresh(input)) return { attempts: slice.attempts, lastFailing: slice.lastFailing };
  const set = failingSet(input);
  if (!set.length) return { attempts: 0, lastFailing: [] };
  if (!d.counts) return { attempts: slice.attempts, lastFailing: d.decision === "allow" ? set : slice.lastFailing };
  return { attempts: sameSet(set, slice.lastFailing) ? slice.attempts + 1 : 1, lastFailing: set };
}

const git = (repo: string, args: string[]): string => execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const real = (p: string): string => { try { return realpathSync.native(p); } catch { return resolve(p); } };

/** Files changed or untracked outside the canon folder. The canon is HeadCanon's to commit: an assumption an agent adds must not hold it. */
export function dirtyFiles(repo: string, canonDir: string): string[] {
  const top = real(git(repo, ["rev-parse", "--show-toplevel"]).trim());
  const canonRel = relative(top, real(canonDir)).split("\\").join("/");
  const inCanon = (p: string) => canonRel !== "" && !canonRel.startsWith("..") && (p === canonRel || p.startsWith(`${canonRel}/`));
  return git(repo, ["status", "--porcelain", "--untracked-files=all"]).split("\n").filter((l) => l.length > 3)
    .map((l) => { const p = l.slice(3); const to = p.includes(" -> ") ? p.slice(p.indexOf(" -> ") + 4) : p; return to.replace(/^"|"$/g, ""); })
    .filter((p) => !inCanon(p));
}

export interface SliceCommit { sha: string; subject: string; ok: boolean; errors: string[]; /** The boxes its Intent trailer names. */ names: string[]; /** It names a box this slice owes. */ mine: boolean }

function intentIds(repo: string, sha: string): string[] {
  if (!/^[0-9a-f]{4,64}$/i.test(sha)) return [];
  try { return (parseTrailers(git(repo, ["log", "-1", "--format=%B", sha]).trim())["Intent"] ?? []).flatMap((v) => v.split(/[,\s]+/)).filter((id) => /^(REQ|JRN|DEC)-/.test(id)); }
  catch { return []; }
}

/** The commits since the slice began, without those another slice already holds, each with the boxes it names. */
function commitsOf(repo: string, canon: Canon, run: Run, slice: Slice): SliceCommit[] {
  const others = new Set(run.slices.filter((s) => s.box !== slice.box).flatMap((s) => s.commits));
  const owes = new Set(slice.owes);
  const owedIds = new Set([slice.box, ...Object.values(canon.nodes).filter((n) => n.uid !== undefined && owes.has(n.uid)).map((n) => n.id)]);
  return sliceCommits(repo, slice.baseSha ?? run.base).filter((c) => !others.has(c.sha)).map((c) => {
    const names = intentIds(repo, c.sha);
    return { ...c, names, mine: names.some((id) => owedIds.has(id)) };
  });
}

/** An accepted test of an owed box with no result in the store was not run: the stored result must speak for every one. */
function withOwed(results: TestResults | undefined, manifest: TestManifest, slice: Slice): TestResults | undefined {
  if (!results) return undefined;
  const owed = new Set(slice.owes);
  const have = new Set(results.results.map((r) => `${r.box}\n${r.title}`));
  const missing = manifest.tests.filter((t) => t.status === "accepted" && owed.has(t.box) && !have.has(`${t.box}\n${t.title}`))
    .map((t): TestResult => ({ box: t.box, title: t.title, file: t.file, runner: t.runner, outcome: "not-run" }));
  return missing.length ? { ...results, results: [...results.results, ...missing] } : results;
}

const questionStore = (gitDir: string): string => join(gitDir, "headcanon", "questions.json");

/** The slice's own open issues that block a box it owes, counted by the box's stable id. */
function openIssues(gitDir: string, canon: Canon, slice: Slice): { byBox: Record<string, number>; ids: string[] } {
  const byBox: Record<string, number> = {};
  const ids: string[] = [];
  const store = questionStore(gitDir);
  if (!existsSync(store)) return { byBox, ids };
  const name = agentNameOf(slice);
  const owed = new Set(slice.owes);
  for (const q of new SessionState(store).queuedFull()) {
    if (q.by !== name || q.blocks !== true || !q.nodeId) continue;
    const uid = canon.nodes[q.nodeId]?.uid ?? (q.nodeId === slice.box ? slice.uid : undefined);
    if (!uid || !owed.has(uid)) continue;
    byBox[uid] = (byBox[uid] ?? 0) + 1;
    ids.push(q.id);
  }
  return { byBox, ids };
}

export interface SliceFacts extends StopInput { dirtyFiles: string[]; commits: SliceCommit[]; issues: string[]; canon: Canon }

/** Everything the rule weighs for one slice, read from the stored result (or the one given), git and the question store. */
export function sliceFacts(at: { canonDir: string; repo: string; gitDir: string; run: Run; slice: Slice; results?: TestResults }): SliceFacts {
  const canon = loadCanon(at.canonDir);
  const results = withOwed(at.results ?? loadResults(at.gitDir), loadManifest(at.canonDir), at.slice);
  const commits = commitsOf(at.repo, canon, at.run, at.slice);
  const mine = new Set(at.run.preexisting ?? []);
  const dirty = dirtyFiles(at.repo, at.canonDir).filter((p) => !mine.has(p));
  const issues = openIssues(at.gitDir, canon, at.slice);
  return {
    run: at.run,
    slice: at.slice,
    results,
    tree: treeDigest(at.repo),
    dirty: dirty.length > 0,
    dirtyFiles: dirty,
    badCommits: commits.filter((c) => !c.ok).map((c) => `${c.sha.slice(0, 7)} ${c.subject}: ${c.errors.join("; ")}`),
    commits,
    openIssuesByBox: issues.byBox,
    issues: issues.ids,
    regressed: regressedOf(at.run, results),
    canon,
  };
}

export interface SliceReport { box: string; verdict: "pass" | "blocked" | "fail"; passing: number; failing: Array<Pick<TestResult, "box" | "title" | "file" | "outcome" | "message">>; regressed: string[]; commits: SliceCommit[]; dirty: string[]; issues: string[]; text: string }

/**
 * The session's own measure of a slice after its agent returned, from a result it just ran: pass when every owed
 * test passes, nothing that passed before is broken, every commit is in the format and the tree is clean; blocked
 * when what fails waits on the person behind the slice's issues; fail otherwise, with what fails.
 */
export function checkSlice(at: { canonDir: string; repo: string; gitDir: string; run: Run; slice: Slice; results: TestResults }): SliceReport {
  const f = sliceFacts(at);
  const failing = failingOf(at.slice, f.results);
  const owed = new Set(at.slice.owes);
  const passing = (f.results?.results ?? []).filter((r) => owed.has(r.box) && r.outcome === "passed").length;
  const sound = !f.badCommits.length && !f.regressed.length && !f.dirty;
  const asked = failing.length > 0 && uniq(failing.map((r) => r.box)).every((b) => (f.openIssuesByBox[b] ?? 0) > 0);
  const verdict: SliceReport["verdict"] = sound && !failing.length ? "pass" : sound && asked ? "blocked" : "fail";
  const lines = [
    `${at.slice.box} ${at.slice.title}: ${verdict === "pass" ? "pass" : verdict === "blocked" ? "blocked: what fails waits on the person" : "fail"}`,
    `Tests: ${passing} passing, ${failing.length} not passing.`,
    ...failing.map(testLine),
    ...(f.regressed.length ? ["Passed in the first run and fail now:", ...f.regressed.map((t) => `- ${t}`)] : []),
    f.commits.length ? "Commits since the slice began:" : "Commits since the slice began: none.",
    ...f.commits.map((c) => `- ${c.sha.slice(0, 7)} ${c.subject}: ${c.ok ? "in the intent format" : `not in the intent format (${c.errors.join("; ")})`}${c.mine ? "" : c.names.length ? `; names ${c.names.join(", ")}, no box of this slice` : "; names no box"}`),
    f.dirty ? `Tree: not clean (${f.dirtyFiles.slice(0, 12).join(", ")}${f.dirtyFiles.length > 12 ? ", …" : ""}).` : "Tree: clean.",
    `Issues of this slice waiting on the person: ${f.issues.length}.`,
  ];
  return { box: at.slice.box, verdict, passing, failing: failing.map(({ box, title, file, outcome, message }) => ({ box, title, file, outcome, ...(message ? { message } : {}) })), regressed: f.regressed, commits: f.commits, dirty: f.dirtyFiles, issues: f.issues, text: lines.join("\n") + "\n" };
}

const samePath = (a: string, b: string): boolean => { const x = real(a), y = real(b); return process.platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y; };

/** The port of this canon's viewer, when one answers: the port in the session marker, else the one given. */
async function viewerPort(gitDir: string, canonDir: string, fallback: number): Promise<number | undefined> {
  let port = fallback;
  try {
    const marker = JSON.parse(readFileSync(join(gitDir, "headcanon", "waiting"), "utf8")) as { port?: unknown };
    if (typeof marker.port === "number" && Number.isInteger(marker.port) && marker.port > 0) port = marker.port;
  } catch { /* no waiter is armed, or it wrote no port */ }
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`, { headers: { connection: "close" }, signal: AbortSignal.timeout(1500) });
    if (!r.ok) return undefined;
    const body = (await r.json()) as { canon?: unknown };
    // a viewer of another canon on the same port must never receive this canon's issues
    return typeof body.canon !== "string" || samePath(body.canon, canonDir) ? port : undefined;
  } catch { return undefined; }
}

/** File one issue: through the viewer when it answers, so the page shows it at once; else straight into the question store. */
async function fileIssue(port: number | undefined, gitDir: string, req: AskRequest): Promise<string | undefined> {
  if (port !== undefined) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/ask`, { method: "POST", headers: { "content-type": "application/json", "x-headcanon-agent": "gate", connection: "close" }, body: JSON.stringify(req), signal: AbortSignal.timeout(3000) });
      if (r.ok) return ((await r.json()) as { questionId?: string }).questionId;
    } catch { /* the viewer went away: the store takes it */ }
  }
  return new SessionState(questionStore(gitDir)).ask(req).id;
}

function impossibleRequest(canon: Canon, slice: Slice, issue: { box: string; text: string }): AskRequest {
  const node = Object.values(canon.nodes).find((n) => n.uid === issue.box) ?? canon.nodes[slice.box];
  const title = node?.title ?? slice.title;
  return {
    kind: "impossible",
    question: `"${title}" could not be built. How do you want to handle it?`,
    why: issue.text,
    nodeId: node?.id ?? slice.box,
    by: agentNameOf(slice),
    blocks: true,
    options: [
      { label: "Try again", description: "A fresh implementation agent starts on this box." },
      { label: "Change the requirement", description: "You rewrite the box, then it is built." },
      { label: "Leave it for now", description: "The box stays as it is and the rest goes on." },
    ],
  };
}

/** A slice in one of these owes nothing more: its agent was already let go, or the person decided. */
const SETTLED: ReadonlySet<SliceStatus> = new Set<SliceStatus>(["review", "approved", "discarded", "stopped"]);

interface HookInput { agent_id?: unknown; agent_type?: unknown; agent_transcript_path?: unknown; cwd?: unknown }
const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);

/** Where the canon is: where the command line says, else under the project the hook runs for. */
function locate(ctx: CliCtx, cwd: string | undefined): { canonDir: string; repo: string; gitDir: string | undefined } {
  if (ctx.gitDir && existsSync(join(ctx.canonDir, "README.md"))) return { canonDir: ctx.canonDir, repo: ctx.repo, gitDir: ctx.gitDir };
  for (const base of [process.env["CLAUDE_PROJECT_DIR"], cwd]) {
    const canonDir = base ? resolve(base, basename(ctx.canonDir)) : undefined;
    if (base && canonDir && existsSync(join(canonDir, "README.md"))) return { canonDir, repo: resolve(base), gitDir: gitDirOf(canonDir) };
  }
  return { canonDir: ctx.canonDir, repo: ctx.repo, gitDir: ctx.gitDir };
}

async function subagentStop(ctx: CliCtx): Promise<void> {
  const input = JSON.parse(ctx.stdin() || "{}") as HookInput;
  const { canonDir, repo, gitDir } = locate(ctx, str(input.cwd));
  if (!gitDir) return;
  const found = sliceOfAgent(gitDir, str(input.agent_id), str(input.agent_transcript_path));
  if (!found || found.run.status === "done" || found.run.status === "stopped" || SETTLED.has(found.slice.status)) return;
  const { run, slice } = found;
  const facts = sliceFacts({ canonDir, repo, gitDir, run, slice });
  const decision = stopDecision(facts);
  const patch: Partial<Slice> = { ...nextAttempt(facts), commits: facts.commits.filter((c) => c.mine).map((c) => c.sha) };
  const agentId = str(input.agent_id);
  if (agentId && !slice.agent) patch.agent = agentId;
  if (decision.decision === "allow") {
    const filed: string[] = [];
    if (decision.fileIssues?.length) {
      const port = await viewerPort(gitDir, canonDir, ctx.port);
      for (const issue of decision.fileIssues) { const id = await fileIssue(port, gitDir, impossibleRequest(facts.canon, slice, issue)); if (id) filed.push(id); }
    }
    patch.issues = uniq([...facts.issues, ...filed]);
    patch.status = failingOf(slice, facts.results).length || facts.regressed.length ? "blocked" : "passed";
  }
  updateSlice(gitDir, run.id, slice.box, patch);
  if (decision.decision === "block") ctx.out(JSON.stringify({ decision: "block", reason: decision.reason }) + "\n");
}

/**
 * `gate subagent-stop`: the SubagentStop hook. It reads the hook's JSON on stdin and prints `{"decision":"block",…}`
 * to send an implementation agent back; for any other agent it prints nothing. It never fails a stop: any error goes
 * to stderr and the exit is 0, since a hook that breaks must not hold an agent that owes nothing.
 */
export async function gateCli(rest: string[], ctx: CliCtx): Promise<number> {
  if (rest.find((x) => !x.startsWith("-")) !== "subagent-stop") { ctx.err("usage: headcanon gate subagent-stop   (reads the SubagentStop hook's JSON on stdin)\n"); return 2; }
  try { await subagentStop(ctx); }
  catch (e) { try { ctx.err(`gate: ${e instanceof Error ? e.message : String(e)}\n`); } catch { /* nothing to write to */ } }
  return 0;
}
