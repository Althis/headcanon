import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prepareBuild } from "./approve.js";
import { marksOf, type NodeMark } from "./built.js";
import { compareIds, descendants, loadCanon } from "./load.js";
import { loadManifest, loadResults, runTests, type TestManifest, type TestResults } from "./testing.js";
import type { Canon, ReqNode } from "./types.js";

/**
 * A run of Implement/align: the nodes in scope that are not built or out of sync, one slice each, built by one
 * implementation agent at a time and decided by the user at the end. The record lives under the git directory,
 * one file per run, so the session, the page, the gate behind SubagentStop and a session that compacts all read
 * the same state. A slice records what its agent owes when it starts, by stable id, so rewording, moving or
 * deleting a failing node does not clear the debt.
 */

export interface CliCtx { canonDir: string; repo: string; gitDir: string | undefined; port: number; by: string | undefined; json: boolean; out: (s: string) => void; err: (s: string) => void; stdin: () => string }

export type SliceStatus = "queued" | "building" | "passed" | "blocked" | "review" | "approved" | "discarded" | "sent-back" | "stopped";
export interface Slice { node: string; uid: string; title: string; status: SliceStatus; agent?: string; agentName?: string; owes: string[] /* uids */; attempts: number; lastFailing: string[]; commits: string[]; issues: string[]; summary?: string; note?: string; startedAt?: string; endedAt?: string; baseSha?: string }
export interface RunStep { name: "prepare" | "readiness" | "tests" | "first-run" | "build" | "review"; status: "waiting" | "running" | "done" | "blocked"; note?: string; at?: string }
export interface Run { id: string; startedAt: string; scope: string[]; single: boolean; branch: string; base: string; status: "running" | "waiting" | "review" | "done" | "stopped"; steps: RunStep[]; slices: Slice[]; firstRun?: { passing: string[] /* titles */ }; endedAt?: string; /** Untracked files outside the canon that were there before the run began: the user's own, which no gate counts as work left uncommitted. */ preexisting?: string[] }

/** The brief's first line is `headcanon-run: <run id> slice: <node id>`. */
export const BRIEF_MARKER = "headcanon-run:";

/** Files outside the canon folder with uncommitted work: tracked ones that changed, and untracked ones. */
export function uncommittedOutside(repo: string, canonDir: string): { changed: string[]; untracked: string[] } {
  const out = { changed: [] as string[], untracked: [] as string[] };
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const slash = (p: string) => p.split(String.fromCharCode(92)).join("/").toLowerCase();
    const canonRel = slash(canonDir).startsWith(slash(top) + "/") ? slash(canonDir).slice(slash(top).length + 1) : "";
    for (const l of execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n")) {
      if (l.length <= 3) continue;
      const raw = l.slice(3); const to = raw.includes(" -> ") ? raw.slice(raw.indexOf(" -> ") + 4) : raw;
      const p = to.startsWith(String.fromCharCode(34)) && to.endsWith(String.fromCharCode(34)) ? to.slice(1, -1) : to;
      if (canonRel && (p.toLowerCase() === canonRel || p.toLowerCase().startsWith(canonRel + "/"))) continue;
      (l.startsWith("??") ? out.untracked : out.changed).push(p);
    }
  } catch { /* not a repository: nothing to report */ }
  return out;
}

export const STEP_NAMES: ReadonlyArray<RunStep["name"]> = ["prepare", "readiness", "tests", "first-run", "build", "review"];
export const STEP_STATUSES: ReadonlyArray<RunStep["status"]> = ["waiting", "running", "done", "blocked"];
export const SLICE_STATUSES: readonly SliceStatus[] = ["queued", "building", "passed", "blocked", "review", "approved", "discarded", "sent-back", "stopped"];

/** Work the session still has to do on a slice: start an agent, wait for it, or check what it returned. */
const WORKING: ReadonlySet<SliceStatus> = new Set<SliceStatus>(["queued", "building", "sent-back", "passed"]);
/** A slice in one of these has no agent on it any more. */
const ENDED: ReadonlySet<SliceStatus> = new Set<SliceStatus>(["passed", "blocked", "review", "approved", "discarded", "stopped"]);

const now = () => new Date().toISOString();
const red = (n: ReqNode): boolean => n.state === "contested" || n.state === "draft";
const below = (id: string, top: string): boolean => id === top || id.startsWith(`${top}.`);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function runsDir(gitDir: string): string {
  return join(gitDir, "headcanon", "runs");
}

/** Every node the scope names and every node under one; an empty scope, or ROOT, is the whole tree. */
export function nodesInScope(canon: Canon, scope: string[]): string[] {
  const ids = new Set<string>();
  if (scope.length === 0 || scope.includes("ROOT")) for (const id of Object.keys(canon.nodes)) ids.add(id);
  else for (const id of scope) if (canon.nodes[id]) { ids.add(id); for (const d of descendants(canon, id)) ids.add(d); }
  return [...ids].sort(compareIds);
}

// keyed by node id; a table keyed by stable id is read the same way
const markOf = (marks: Record<string, NodeMark>, n: ReqNode): NodeMark | undefined => marks[n.id] ?? (n.uid ? marks[n.uid] : undefined);

/** The nodes of a scope that get a slice: they carry a kind, are not red, and are not built or out of sync. */
function candidates(canon: Canon, scope: string[], marks: Record<string, NodeMark>): ReqNode[] {
  return nodesInScope(canon, scope).map((id) => canon.nodes[id]!).filter((n) => n.kind !== undefined && !red(n) && markOf(marks, n)?.mark !== undefined);
}

/** What a slice's agent owes: its node and the nodes below it, by stable id. A red node below waits on the user and is not owed. */
function owedBy(canon: Canon, n: ReqNode): string[] {
  const under = descendants(canon, n.id).map((id) => canon.nodes[id]!).filter((d) => !red(d));
  return [...new Set([n, ...under].map((x) => x.uid).filter((u): u is string => Boolean(u)))];
}

/**
 * Build order: a node comes after the nodes it requires, after those the nodes above it require, and after its own
 * nodes below; the lowest id first among those that are free. A knot of links that leaves nothing free is cut at
 * the lowest id, so the order is always whole.
 */
function ordered(canon: Canon, slices: Slice[]): Slice[] {
  const needs = new Map<Slice, Slice[]>();
  for (const s of slices) {
    const required: string[] = [];
    for (let n = canon.nodes[s.node]; n; n = n.parent ? canon.nodes[n.parent] : undefined) required.push(...n.requires);
    needs.set(s, slices.filter((t) => t !== s && !below(s.node, t.node) && (below(t.node, s.node) || required.some((r) => below(t.node, r)))));
  }
  const left = [...slices].sort((a, b) => compareIds(a.node, b.node));
  const done = new Set<Slice>();
  const out: Slice[] = [];
  while (left.length) {
    const i = Math.max(0, left.findIndex((s) => needs.get(s)!.every((t) => done.has(t))));
    const [s] = left.splice(i, 1);
    done.add(s!);
    out.push(s!);
  }
  return out;
}

const newSlice = (canon: Canon, n: ReqNode): Slice => ({ node: n.id, uid: n.uid ?? "", title: n.title, status: "queued", owes: owedBy(canon, n), attempts: 0, lastFailing: [], commits: [], issues: [] });

/** One slice per node in scope that carries a kind, is not red and is not built or out of sync; the run is stored at once. */
export function createRun(gitDir: string, canon: Canon, scope: string[], single: boolean, branch: string, base: string): Run {
  const marks = marksOf(canon, loadResults(gitDir), loadManifest(canon.dir));
  const at = now();
  const run: Run = {
    id: `${at.replace(/[-:]/g, "").slice(0, 15)}-${randomBytes(2).toString("hex")}`,
    startedAt: at,
    scope: [...scope],
    single,
    branch,
    base,
    status: "running",
    steps: STEP_NAMES.map((name) => ({ name, status: "waiting" as const })),
    slices: ordered(canon, candidates(canon, scope, marks).map((n) => newSlice(canon, n))),
  };
  saveRun(gitDir, run);
  return run;
}

export function loadRun(gitDir: string, id: string): Run | undefined {
  if (!SAFE_ID.test(id)) return undefined;
  try {
    const run = JSON.parse(readFileSync(join(runsDir(gitDir), `${id}.json`), "utf8")) as Run;
    return run && Array.isArray(run.slices) && Array.isArray(run.steps) ? run : undefined;
  } catch { return undefined; }
}

/** Every stored run, the newest first. */
function allRuns(gitDir: string): Run[] {
  let names: string[];
  try { names = readdirSync(runsDir(gitDir)); } catch { return []; }
  return names.filter((f) => f.endsWith(".json")).map((f) => loadRun(gitDir, f.slice(0, -5))).filter((r): r is Run => Boolean(r))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id));
}

/** The newest run that is not done or stopped. */
export function activeRun(gitDir: string): Run | undefined {
  return allRuns(gitDir).find((r) => r.status !== "done" && r.status !== "stopped");
}

export function latestRun(gitDir: string): Run | undefined {
  return allRuns(gitDir)[0];
}

export function saveRun(gitDir: string, run: Run): void {
  const dir = runsDir(gitDir);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${run.id}.json`);
  const text = JSON.stringify(run, null, 2);
  // written beside and renamed, so the gate and the page never read half a file; a rename refused while another
  // process holds the file open falls back to writing in place
  const tmp = `${file}.${process.pid}.tmp`;
  try { writeFileSync(tmp, text); renameSync(tmp, file); }
  catch { writeFileSync(file, text); rmSync(tmp, { force: true }); }
}

/**
 * What the steps and the slices together say about the run. The session sets steps and slices; the build and
 * review steps and the run's status follow from the slices, so the page is right when the session forgets a step.
 * A run waits when a step is blocked or every slice left needs an answer from the user; it is in review when
 * what is left is the user's decision; it is done when every slice is decided.
 */
function settle(run: Run): Run {
  if (run.status === "stopped" || run.status === "done") return run;
  const step = (name: RunStep["name"]) => run.steps.find((s) => s.name === name);
  const count = (...statuses: SliceStatus[]) => run.slices.filter((s) => statuses.includes(s.status)).length;
  const mark = (s: RunStep, status: RunStep["status"]) => { s.status = status; s.at = now(); };
  const working = run.slices.filter((s) => WORKING.has(s.status)).length;
  // the build can be judged once the steps before it are done, or once a slice has moved, whatever the steps say
  const prepared = (["prepare", "readiness", "tests", "first-run"] as const).every((n) => step(n)?.status === "done") || run.slices.some((s) => s.status !== "queued");
  const build = step("build");
  const review = step("review");
  // a slice sent back after the build was done opens the build again
  if (build && working && (build.status === "done" || (build.status === "waiting" && count("building")))) mark(build, "running");
  if (build && prepared && !working && build.status !== "done" && build.status !== "blocked") mark(build, "done");
  if (review && review.status === "waiting" && count("review")) mark(review, "running");
  if (review && build?.status === "done" && !count("review", "blocked") && review.status !== "done" && review.status !== "blocked") mark(review, "done");
  if (run.steps.some((s) => s.status === "blocked")) run.status = "waiting";
  else if (review?.status === "done" && !working) { run.status = "done"; run.endedAt = now(); }
  else if (working || !prepared) run.status = "running";
  else if (count("review")) run.status = "review";
  else if (count("blocked")) run.status = "waiting";
  else run.status = "running";
  return run;
}

function mustLoad(gitDir: string, runId: string): Run {
  const run = loadRun(gitDir, runId);
  if (!run) throw new Error(`no run ${runId}`);
  return run;
}

export function setStep(gitDir: string, runId: string, name: RunStep["name"], status: RunStep["status"], note?: string): Run {
  const run = mustLoad(gitDir, runId);
  const step = run.steps.find((s) => s.name === name);
  if (!step) throw new Error(`run ${runId} has no step ${name}`);
  step.status = status;
  step.at = now();
  if (note) step.note = note; else delete step.note;
  saveRun(gitDir, settle(run));
  return run;
}

/** Change one slice, found by its node id or its stable id; a slice that starts building gets its start time, one that ends its end time. */
export function updateSlice(gitDir: string, runId: string, node: string, patch: Partial<Slice>): Run {
  const run = mustLoad(gitDir, runId);
  const slice = run.slices.find((s) => s.node === node) ?? run.slices.find((s) => s.uid !== "" && s.uid === node);
  if (!slice) throw new Error(`run ${runId} has no slice for ${node}`);
  const before = slice.status;
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) (slice as unknown as Record<string, unknown>)[k] = v;
  if (slice.status !== before) {
    if (slice.status === "building") { slice.startedAt = slice.startedAt ?? now(); delete slice.endedAt; }
    else if (ENDED.has(slice.status)) slice.endedAt = now();
  }
  saveRun(gitDir, settle(run));
  return run;
}

/**
 * After the first run of the tests the marks are known in full: the titles that pass are kept, to tell later what a
 * builder broke, and the slices follow the marks: a queued slice whose node turned out fine goes, a node the tests
 * showed out of sync gets one.
 */
export function afterFirstRun(gitDir: string, runId: string, canon: Canon): Run {
  const run = mustLoad(gitDir, runId);
  const results = loadResults(gitDir);
  if (results) run.firstRun = { passing: [...new Set(results.results.filter((r) => r.outcome === "passed").map((r) => r.title))].sort() };
  const wanted = candidates(canon, run.scope, marksOf(canon, results, loadManifest(canon.dir)));
  const wantedIds = new Set(wanted.map((n) => n.id));
  const kept = run.slices.filter((s) => s.status !== "queued" || wantedIds.has(s.node));
  const have = new Set(kept.map((s) => s.node));
  run.slices = ordered(canon, [...kept, ...wanted.filter((n) => !have.has(n.id)).map((n) => newSlice(canon, n))]);
  saveRun(gitDir, settle(run));
  return run;
}

/** The text of the first user message of a transcript as Claude Code writes it: JSON lines, the content a string or blocks. */
function firstUserText(transcriptPath: string): string | undefined {
  let chunk: string;
  try {
    const fd = openSync(transcriptPath, "r");
    try {
      const buf = Buffer.alloc(1 << 20);
      chunk = buf.subarray(0, readSync(fd, buf, 0, buf.length, 0)).toString("utf8");
    } finally { closeSync(fd); }
  } catch { return undefined; }
  for (const line of chunk.split("\n").slice(0, 40)) {
    if (!line.trim()) continue;
    let entry: { type?: unknown; message?: { role?: unknown; content?: unknown } };
    try { entry = JSON.parse(line) as typeof entry; } catch { continue; }
    if (!entry || typeof entry !== "object" || (entry.type !== "user" && entry.message?.role !== "user")) continue;
    const content = entry.message?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      const block = content.find((b): b is { type: "text"; text: string } => Boolean(b) && typeof b === "object" && (b as { type?: unknown }).type === "text" && typeof (b as { text?: unknown }).text === "string");
      return block?.text;
    }
    return undefined;
  }
  return undefined;
}

/** The run and the node a brief names on its first line. */
export function markerOf(text: string): { run: string; node: string } | undefined {
  const first = text.replace(/^﻿/, "").split(/\r?\n/).find((l) => l.trim() !== "")?.trim();
  if (!first || !first.startsWith(BRIEF_MARKER)) return undefined;
  const m = /^(\S+)\s+slice:\s*(\S+)$/.exec(first.slice(BRIEF_MARKER.length).trim());
  return m ? { run: m[1]!, node: m[2]! } : undefined;
}

/** The slice an agent builds: by its agent id in the active run, else by the marker line in the first message of its transcript. */
export function sliceOfAgent(gitDir: string, agentId: string | undefined, transcriptPath: string | undefined): { run: Run; slice: Slice } | undefined {
  if (agentId) {
    const run = activeRun(gitDir);
    const slice = run?.slices.find((s) => s.agent === agentId);
    if (run && slice) return { run, slice };
  }
  const text = transcriptPath ? firstUserText(transcriptPath) : undefined;
  const mark = text ? markerOf(text) : undefined;
  if (!mark) return undefined;
  const run = loadRun(gitDir, mark.run);
  const slice = run?.slices.find((s) => s.node === mark.node);
  return run && slice ? { run, slice } : undefined;
}

const VALUE_FLAGS = new Set(["note", "agent", "summary", "for", "run", "budget", "by", "port", "canon", "repo", "kind"]);

/** The words and the `--flags` of a command line; a flag that takes a value takes the next word or what follows `=`. */
export function flagsOf(rest: string[]): { words: string[]; flags: Record<string, string | true> } {
  const words: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i++) {
    const x = rest[i]!;
    if (!x.startsWith("--") || x === "--") { words.push(x); continue; }
    const eq = x.indexOf("=");
    const name = eq > 0 ? x.slice(2, eq) : x.slice(2);
    if (eq > 0) flags[name] = x.slice(eq + 1);
    else if (VALUE_FLAGS.has(name) && i + 1 < rest.length) flags[name] = rest[++i]!;
    else flags[name] = true;
  }
  return { words, flags };
}

const text = (v: string | true | undefined): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);

export interface ScopeCounts { measurable: number; toTest: number; toBuild: number; toAlign: number; leftOut: number }

/** What a scope holds, as the run card counts it: nodes with a check, those without an accepted test, to build, to align, and the red ones left out. */
export function scopeCounts(canon: Canon, scope: string[], marks: Record<string, NodeMark>, manifest: TestManifest): ScopeCounts {
  const nodes = nodesInScope(canon, scope).map((id) => canon.nodes[id]!);
  const measurable = nodes.filter((n) => n.kind !== undefined && !red(n));
  const tested = new Set(manifest.tests.filter((t) => t.status === "accepted").map((t) => t.node));
  return {
    measurable: measurable.length,
    toTest: measurable.filter((n) => !n.uid || !tested.has(n.uid)).length,
    toBuild: measurable.filter((n) => markOf(marks, n)?.mark === "not-built").length,
    toAlign: measurable.filter((n) => markOf(marks, n)?.mark === "out-of-sync").length,
    leftOut: nodes.filter(red).length,
  };
}

const stepLine = (s: RunStep): string => `  ${s.name}: ${s.status}${s.note ? ` (${s.note})` : ""}`;
function sliceLine(s: Slice): string {
  const more = [s.agentName, s.attempts ? `stops sent back ${s.attempts}` : "", s.lastFailing.length ? `failing ${s.lastFailing.length}` : "", s.issues.length ? `issues ${s.issues.length}` : "", s.commits.length ? `commits ${s.commits.length}` : ""].filter(Boolean).join(", ");
  return `  ${s.node} ${s.title}: ${s.status}${more ? ` (${more})` : ""}${s.summary ? `\n    ${s.summary}` : ""}${s.note ? `\n    note: ${s.note}` : ""}`;
}

export function describeRun(run: Run): string {
  const lines = [`Run ${run.id}: ${run.status}. Branch ${run.branch}. Scope: ${run.scope.length ? run.scope.join(" ") : "everything"}${run.single ? " (one node)" : ""}.`, "Steps:", ...run.steps.map(stepLine)];
  lines.push(run.slices.length ? "Slices, in build order:" : "Slices: none.", ...run.slices.map(sliceLine));
  return lines.join("\n") + "\n";
}

function headOf(repo: string): string | undefined {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined; }
  catch { return undefined; }
}

const USAGE = `usage: headcanon run <subcommand>
  start <id...> [--single] [--json]     prepare the build branch and create the run and its slices
  status [--json]                       the active run, or the last one
  step <name> <status> [--note "<text>"]    name: ${STEP_NAMES.join(", ")}; status: ${STEP_STATUSES.join(", ")}
  slice <node> <status> [--agent <agent id>] [--summary "<plain words>"] [--note "<text>"]    status: ${SLICE_STATUSES.join(", ")}
  check <node> [--json]                  after an agent returns: rerun the tests it owes, list its commits, say pass or what fails
  stop                                  end the active run
`;

export async function runCli(rest: string[], ctx: CliCtx): Promise<number> {
  const { words, flags } = flagsOf(rest);
  const json = ctx.json || flags["json"] === true;
  const sub = words[0];
  const print = (value: unknown, plain: string) => ctx.out(json ? JSON.stringify(value, null, 2) + "\n" : plain);
  if (!sub || !["start", "status", "step", "slice", "check", "stop"].includes(sub)) { ctx.err(USAGE); return 2; }
  const gitDir = ctx.gitDir;
  if (!gitDir) { ctx.err("run: this canon is not inside a git repository, so there is nowhere to keep a run\n"); return 1; }
  try {
    if (sub === "start") {
      const canon = loadCanon(ctx.canonDir);
      if (!canon.root && !Object.keys(canon.nodes).length) { ctx.err(`run start: no canon at ${ctx.canonDir}\n`); return 1; }
      const scope = words.slice(1);
      const unknown = scope.filter((id) => id !== "ROOT" && !canon.nodes[id]);
      if (unknown.length) { ctx.err(`run start: no node ${unknown.join(", ")}\n`); return 1; }
      const active = activeRun(gitDir);
      if (active) { ctx.err(`run start: run ${active.id} is still ${active.status}. See it with \`headcanon run status\`; end it with \`headcanon run stop\`.\n`); return 1; }
      const manifest = loadManifest(canon.dir);
      const counts = scopeCounts(canon, scope, marksOf(canon, loadResults(gitDir), manifest), manifest);
      if (!counts.measurable) { ctx.err(`run start: nothing in scope can be built: ${counts.leftOut ? `${counts.leftOut} node(s) wait on the user` : "no node there carries a check"}\n`); return 1; }
      // what is uncommitted before the run begins is the user's: a changed tracked file would be swept into the build, so it stops the start; an untracked one is left alone and remembered
      const before = uncommittedOutside(ctx.repo, ctx.canonDir);
      if (before.changed.length) { ctx.err(`run start: ${before.changed.length} file(s) outside the canon have uncommitted changes and would be swept into the build: ${before.changed.slice(0, 8).join(", ")}${before.changed.length > 8 ? ", ..." : ""}. Commit them or set them aside, then start again.\n`); return 1; }
      const prep = prepareBuild(ctx.repo, ctx.canonDir);
      if (!prep.ok) { ctx.err(`run start: the build branch could not be prepared: ${prep.error ?? "no reason given"}\n`); return 1; }
      const created = createRun(gitDir, loadCanon(ctx.canonDir), scope, flags["single"] === true, prep.branch, prep.base);
      if (before.untracked.length) { created.preexisting = before.untracked; saveRun(gitDir, created); }
      const run = setStep(gitDir, created.id, "prepare", "done", `branch ${prep.branch}${prep.canonCommit ? `, canon committed in ${prep.canonCommit.slice(0, 7)}` : ""}`);
      print({ run, counts }, `${describeRun(run)}In scope: ${counts.measurable} node(s) with a check. To test: ${counts.toTest}. To build: ${counts.toBuild}. To align: ${counts.toAlign}. Left out because they need the user: ${counts.leftOut}.\n`);
      return 0;
    }
    if (sub === "status") {
      const run = activeRun(gitDir) ?? latestRun(gitDir);
      print({ run: run ?? null }, run ? describeRun(run) : "No run yet.\n");
      return 0;
    }
    const run = activeRun(gitDir);
    if (!run) { ctx.err(`run ${sub}: no run is active\n`); return 1; }
    if (sub === "stop") {
      for (const s of run.slices) if (WORKING.has(s.status)) { s.status = "stopped"; s.endedAt = now(); }
      run.status = "stopped";
      run.endedAt = now();
      saveRun(gitDir, run);
      print({ run }, `Run ${run.id} stopped.\n`);
      return 0;
    }
    if (sub === "step") {
      const name = words[1] as RunStep["name"] | undefined;
      const status = words[2] as RunStep["status"] | undefined;
      if (!name || !status || !STEP_NAMES.includes(name) || !STEP_STATUSES.includes(status)) { ctx.err(USAGE); return 2; }
      // the slices follow the first run before its step is closed, so a run with nothing left to build ends only then
      if (name === "first-run" && status === "done") afterFirstRun(gitDir, run.id, loadCanon(ctx.canonDir));
      const next = setStep(gitDir, run.id, name, status, text(flags["note"]));
      print({ run: next }, describeRun(next));
      return 0;
    }
    const node = words[1];
    const slice = node ? run.slices.find((s) => s.node === node) ?? run.slices.find((s) => s.uid !== "" && s.uid === node) : undefined;
    if (!node || !slice) { ctx.err(node ? `run ${sub}: run ${run.id} has no slice for ${node}\n` : USAGE); return node ? 1 : 2; }
    if (sub === "slice") {
      const status = words[2] as SliceStatus | undefined;
      if (!status || !SLICE_STATUSES.includes(status)) { ctx.err(USAGE); return 2; }
      // the user's decision stands: a slice they approved or discarded is never put back before them, though its words may still be filled in
      const decided = (slice.status === "approved" || slice.status === "discarded") && (status === "review" || status === "passed");
      const patch: Partial<Slice> = decided ? {} : { status };
      const agent = text(flags["agent"]);
      const summary = text(flags["summary"]);
      const note = text(flags["note"]);
      if (agent) patch.agent = agent;
      if (summary) patch.summary = summary;
      if (note) patch.note = note;
      if (status === "building") {
        patch.agentName = slice.agentName ?? `implementer-${slice.node}`;
        // a fresh start gets the whole retry budget again; the first start fixes where the slice's commits begin
        if (slice.status !== "building") { patch.attempts = 0; patch.lastFailing = []; }
        const head = slice.baseSha ?? headOf(ctx.repo);
        if (head) patch.baseSha = head;
      }
      const next = updateSlice(gitDir, run.id, slice.node, patch);
      const after = next.slices.find((s) => s.node === slice.node)!;
      print({ run: next, slice: after }, sliceLine(after).trimStart() + "\n");
      return 0;
    }
    // check: the session's own measure after an agent returns, since a hook that crashes or times out lets an agent go
    const { checkSlice } = await import("./gate.js");
    // the same tests the agent's own command runs: what the slice owes, and what passed in the first run, so a break shows
    const passedBefore = new Set(run.firstRun?.passing ?? []);
    const nodes = [...new Set([...slice.owes, ...loadManifest(ctx.canonDir).tests.filter((t) => passedBefore.has(t.title)).map((t) => t.node)])];
    const results: TestResults = runTests(ctx.canonDir, { nodes });
    const report = await checkSlice({ canonDir: ctx.canonDir, repo: ctx.repo, gitDir, run, slice, results });
    updateSlice(gitDir, run.id, slice.node, {
      commits: report.commits.filter((c) => c.mine).map((c) => c.sha),
      lastFailing: report.failing.map((f) => f.title),
      issues: report.issues,
      ...(report.verdict === "pass" ? { status: "passed" as const } : report.verdict === "blocked" ? { status: "blocked" as const } : {}),
    });
    print(report, report.text);
    return report.verdict === "pass" ? 0 : 1;
  } catch (e) {
    ctx.err(`run ${sub}: ${e instanceof Error ? e.message : String(e)}\n`);
    return 1;
  }
}
