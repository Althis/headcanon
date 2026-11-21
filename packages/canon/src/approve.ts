/**
 * The commits HeadCanon makes itself: the build branch with the canon committed on it, the accepted tests, the
 * canon changes of a slice the person approved, and the revert of a slice the person discarded. Every one goes
 * through `git commit` with the commit-msg hook in force, so its message is the intent format and a canon change
 * carries a review record; the message is checked here first with the hook's own check, so a refusal is known
 * before anything is committed. A failure undoes what the call staged, switched or wrote, and says why.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { isCodeUnit } from "./built.js";
import { buildCodeTree, saveCodeTree } from "./code.js";
import { canonPathOf, checkCommitMessage, checkStagedCommit, gitAppendOnlyFiles } from "./commit-msg.js";
import { dropSection } from "./edits.js";
import { journalChange } from "./journal.js";
import { loadCanon } from "./load.js";
import { applyOp, gitDirOf, readOps } from "./ops.js";
import { adoptionReviewFrom, loadReviewRecord, stagedCanonEntries, stagedIntentDiff, storeReviewRecord, validateReviewRecord, type StagedEntry } from "./review.js";
import { activeRun, flagsOf, latestRun, updateSlice, type CliCtx, type Run, type Slice } from "./runs.js";
import { loadManifest, manifestPath } from "./testing.js";
import type { Canon, ReqNode } from "./types.js";

export const BUILD_BRANCH = "headcanon/build";
/** Where the build branch remembers the branch it was made from. */
const BASE_KEY = `branch.${BUILD_BRANCH}.headcanon-base`;
const MAX_BUFFER = 1024 * 1024 * 1024;

/** A refusal with its reason in plain words; everything else that throws is git's own error. */
class Refusal extends Error {}

function git(repo: string, args: string[], input?: string): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: MAX_BUFFER, ...(input !== undefined ? { input } : {}) });
}
const tryGit = (repo: string, args: string[]): string | undefined => { try { return git(repo, args); } catch { return undefined; } };
const reasonOf = (e: unknown): string => {
  if (e instanceof Refusal) return e.message;
  const std = String((e as { stderr?: unknown })?.stderr ?? "").trim();
  return std || (e instanceof Error ? e.message : String(e));
};

type Undo = Array<() => void>;
/** Undo what a call did, last step first; a step that cannot be undone does not stop the others. */
function rollback(undo: Undo): void {
  for (const step of undo.reverse()) { try { step(); } catch { /* the rest is still undone */ } }
}

const posix = (p: string) => p.split("\\").join("/");
const under = (dir: string, path: string) => path === dir || path.startsWith(`${dir}/`);
const short = (sha: string) => sha.slice(0, 7);
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const headOf = (repo: string): string | undefined => tryGit(repo, ["rev-parse", "--verify", "-q", "HEAD"])?.trim() || undefined;

/** The canon folder relative to the repository; undefined when it lies outside. */
function canonInside(repo: string, canonDir: string): string | undefined {
  const rel = posix(relative(resolve(repo), resolve(canonDir)));
  return rel && !rel.startsWith("..") && !/^[A-Za-z]:/.test(rel) ? rel : undefined;
}

interface Change { xy: string; path: string }
/** Every changed, staged or untracked file of the repository, a move read as a file removed and a file added. */
function changesOf(repo: string): Change[] {
  const out: Change[] = [];
  for (const rec of git(repo, ["status", "--porcelain", "-z", "--untracked-files=all", "--no-renames"]).split("\0")) if (rec.length > 3) out.push({ xy: rec.slice(0, 2), path: rec.slice(3) });
  return out;
}
const isStaged = (c: Change) => c.xy !== "??" && c.xy[0] !== " ";

/** Stage exactly these paths as they are in the working tree, removals included; the undo unstages them. */
function stage(repo: string, paths: string[], undo: Undo): void {
  if (!paths.length) return;
  const list = paths.join("\0");
  git(repo, ["add", "-A", "--pathspec-from-file=-", "--pathspec-file-nul"], list);
  undo.push(() => { git(repo, headOf(repo) ? ["reset", "-q", "--pathspec-from-file=-", "--pathspec-file-nul"] : ["rm", "-r", "-q", "--cached", "--ignore-unmatch", "--pathspec-from-file=-", "--pathspec-file-nul"], list); });
}

const message = (header: string, body: string[], trailers: Array<[string, string]>): string =>
  [header, ...body.filter((p) => p.trim()), trailers.map(([k, v]) => `${k}: ${oneLine(v)}`).join("\n")].join("\n\n") + "\n";

/** Box ids as Intent trailers, a few to a line. */
function intentTrailers(ids: string[], none: string): Array<[string, string]> {
  if (!ids.length) return [["Intent", `none (${none})`]];
  const out: Array<[string, string]> = [];
  for (let i = 0; i < ids.length; i += 8) out.push(["Intent", ids.slice(i, i + 8).join(", ")]);
  return out;
}

interface CanonChanges { changes: string[]; decisions: string[]; removed: string[]; whole: boolean }

/**
 * One Intent-Change per staged entry, read from its front matter. A canon whose root file is new to git is one
 * operation, the creation of the canon. An id the canon no longer holds cannot be named in a trailer (the check
 * knows no such id), so it is listed apart for the message's prose.
 */
function canonChanges(repo: string, canon: Canon, entries: StagedEntry[]): CanonChanges {
  const known = (id: string) => (id === "ROOT" ? canon.root !== undefined : id.startsWith("REQ-") ? id in canon.nodes : id.startsWith("JRN-") ? canon.journeys.some((j) => j.id === id) : id.startsWith("DEC-") ? canon.decisions.some((d) => d.id === id) : false);
  const decisions = entries.filter((e) => e.status === "A" && e.id?.startsWith("DEC-") && known(e.id)).map((e) => e.id!);
  if (entries.some((e) => e.id === "ROOT" && e.status === "A")) return { changes: ["create ROOT"], decisions, removed: [], whole: true };
  const ops = new Map<string, "create" | "update" | "delete">();
  const removed: string[] = [];
  for (const e of entries) {
    if (!e.id) continue;
    if (!known(e.id)) { if (e.status === "D") removed.push(e.id); continue; }
    // a file that moved is its entry removed in one place and added in another: one update
    const now = e.status === "A" ? "create" : e.status === "M" ? "update" : "delete";
    const prior = ops.get(e.id);
    ops.set(e.id, prior && prior !== now ? "update" : now);
  }
  const changes = [...ops].map(([id, op]) => `${op} ${id}`);
  const root = entries.find((e) => e.id === "ROOT" && e.status === "M");
  if (root) {
    const old = tryGit(repo, ["show", `HEAD:${root.path}`]) ?? "";
    const named = (id: string) => new RegExp(`${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9-])`).test(old);
    for (const p of canon.principles) if (!named(p.id)) changes.push(`create ${p.id}`);
    for (const t of canon.terms) if (!named(t.id)) changes.push(`create ${t.id}`);
  }
  return { changes, decisions, removed: [...new Set(removed)].filter((id) => !ops.has(id)), whole: false };
}

interface CommitPlan {
  header: string;
  /** Paragraphs of prose; `changes` receives what is staged of the canon. */
  body: (c: CanonChanges) => string[];
  /** The boxes the commit serves, or the reason it serves none. */
  intent: string[];
  noIntent: string;
  /** The approving person, when one approved; otherwise how approval is being sought. */
  approvedBy?: string;
  pending: string;
  testChanges?: string[];
  /** Refuse when the change holds sets of boxes and the operations log holds a verdict for none of them. */
  mustBeReviewed?: boolean;
}

/**
 * Commit what is staged, through the hook. The trailers are derived from the staged files; a canon change that
 * needs a review gets its record from the reviews in the operations log, unless a valid record is already stored
 * for this exact change. The message is checked first with the hook's check. Returns the new commit.
 */
function commitStaged(repo: string, canonDir: string, canonPath: string, plan: CommitPlan, undo: Undo): string {
  const entries = stagedCanonEntries(repo, canonPath);
  const canon = loadCanon(canonDir);
  const changed = canonChanges(repo, canon, entries);
  const trailers: Array<[string, string]> = intentTrailers(plan.intent, plan.noIntent);
  for (const c of changed.changes) trailers.push(["Intent-Change", c]);
  for (const d of changed.decisions) trailers.push(["Decision", d]);
  for (const t of plan.testChanges ?? []) trailers.push(["Test-Change", t]);

  const appendOnly = gitAppendOnlyFiles(repo);
  if (appendOnly.length) throw new Refusal(`${appendOnly.map((f) => f.path).join(", ")} only gained lines since the last commit. The commit check then asks for a "Consolidated:" trailer, which only a reader who merged the addition into the file can write: commit these with /headcanon:commit, then start again.`);

  const diff = stagedIntentDiff(repo, canonPath);
  if (diff.required) {
    const stored = loadReviewRecord(repo, diff.hash);
    if (stored && validateReviewRecord(stored, diff).length === 0) trailers.push(["Intent-Review", `${diff.hash}, ${plural(stored.findings.length, "finding")}, all resolved`]);
    else {
      const gitDir = gitDirOf(resolve(canonDir));
      const made = adoptionReviewFrom(diff, entries, gitDir ? readOps(join(gitDir, "headcanon", "ops.jsonl")) : []);
      const { passed, failed, changed: changedSets, unreviewed } = made.sets;
      if (plan.mustBeReviewed && unreviewed > 0 && passed + failed + changedSets === 0)
        throw new Refusal("the operations log holds no review of any box in this canon, so there is nothing to make its review record from. Have the reviewer review it (/headcanon:commit records the review and commits), then start again.");
      const path = storeReviewRecord(repo, made.record);
      undo.push(() => rmSync(path, { force: true }));
      trailers.push(["Intent-Review", `${diff.hash}, ${made.outcome}`]);
    }
  }
  if (changed.changes.length || plan.testChanges?.length) trailers.push(["Approved-By", plan.approvedBy ?? `pending (${plan.pending})`]);

  const text = message(plan.header, plan.body(changed), trailers);
  const check = checkStagedCommit(repo, canonDir, text);
  if (!check.ok) throw new Refusal(`the commit check refuses the message: ${check.errors.join("; ")}`);
  git(repo, ["commit", "-q", "-F", "-"], text);
  return git(repo, ["rev-parse", "HEAD"]).trim();
}

/** Nothing may be staged before HeadCanon stages its own files: the commit would carry it along. */
function mustHaveCleanIndex(changes: Change[], except?: string): void {
  const staged = changes.filter((c) => isStaged(c) && !(except && under(except, c.path)));
  if (staged.length) throw new Refusal(`${plural(staged.length, "file is", "files are")} already staged (${staged.slice(0, 5).map((c) => c.path).join(", ")}${staged.length > 5 ? ", and more" : ""}): commit or unstage ${staged.length === 1 ? "it" : "them"} first`);
}

/** Switch to the build branch, made from the current branch when absent or wholly merged into it. Returns the base. */
function switchToBuild(repo: string, current: string, undo: Undo): string {
  const stored = tryGit(repo, ["config", "--get", BASE_KEY])?.trim() || undefined;
  if (current === BUILD_BRANCH) return stored ?? current;
  const head = headOf(repo);
  const tip = tryGit(repo, ["rev-parse", "--verify", "-q", `refs/heads/${BUILD_BRANCH}`])?.trim() || undefined;
  const rememberBase = () => {
    git(repo, ["config", BASE_KEY, current]);
    undo.push(() => { if (stored) git(repo, ["config", BASE_KEY, stored]); else git(repo, ["config", "--unset", BASE_KEY]); });
  };
  if (!tip) {
    git(repo, ["checkout", "-q", "-b", BUILD_BRANCH]);
    undo.push(() => {
      if (!head) { git(repo, ["symbolic-ref", "HEAD", `refs/heads/${current}`]); return; }
      git(repo, ["checkout", "-q", current]);
      git(repo, ["branch", "-q", "-D", BUILD_BRANCH]);
    });
    rememberBase();
    return current;
  }
  // every commit of the build branch is already in the current branch: the build starts again from here
  if (head && tryGit(repo, ["merge-base", "--is-ancestor", tip, head]) !== undefined) {
    git(repo, ["checkout", "-q", "-B", BUILD_BRANCH]);
    undo.push(() => { git(repo, ["checkout", "-q", current]); git(repo, ["branch", "-q", "-f", BUILD_BRANCH, tip]); });
    rememberBase();
    return current;
  }
  git(repo, ["checkout", "-q", BUILD_BRANCH]);
  undo.push(() => { git(repo, ["checkout", "-q", current]); });
  return stored ?? current;
}

/** A canon kept out of git by the repository's private ignore list is taken off it; any other ignore rule is the owner's to lift. */
function liftIgnore(repo: string, canonPath: string, undo: Undo): void {
  const probe = `${canonPath}/README.md`;
  if (tryGit(repo, ["ls-files", "--error-unmatch", "--", probe]) !== undefined) return;
  const hit = tryGit(repo, ["check-ignore", "-v", "--", probe]);
  const m = hit ? /^(.*):(\d+):([^\t]*)\t/.exec(hit) : null;
  if (!m) return;
  const source = resolve(repo, m[1]!);
  const exclude = resolve(repo, git(repo, ["rev-parse", "--git-path", "info/exclude"]).trim());
  if (source.toLowerCase() !== exclude.toLowerCase()) throw new Refusal(`the canon folder is ignored by ${m[1]} (line ${m[2]}: ${m[3]}); remove that line so the canon can be committed`);
  const before = readFileSync(exclude, "utf8");
  const lines = before.split("\n");
  lines.splice(Number(m[2]) - 1, 1);
  writeFileSync(exclude, lines.join("\n"));
  undo.push(() => writeFileSync(exclude, before));
}

/** Commit every pending change of the canon folder; undefined when there is none. */
function commitCanon(repo: string, canonDir: string, canonPath: string, undo: Undo): string | undefined {
  if (!existsSync(canonDir)) return undefined;
  const pending = () => changesOf(repo).filter((c) => under(canonPath, c.path));
  if (!pending().length) { liftIgnore(repo, canonPath, undo); if (!pending().length) return undefined; }
  stage(repo, [canonPath], undo);
  if (tryGit(repo, ["diff", "--cached", "--quiet"]) !== undefined) return undefined;
  const canon = loadCanon(canonDir);
  const boxes = Object.keys(canon.nodes).length;
  return commitStaged(repo, canonDir, canonPath, {
    header: "docs(canon): record the canon as it stands",
    body: (c) => [
      c.whole
        ? `The canon enters git as adoption drafted it: ${plural(boxes, "box", "boxes")}, ${plural(canon.journeys.length, "journey")}, ${plural(canon.decisions.length, "decision")}, ${plural(canon.terms.length, "term")}, ${plural(canon.principles.length, "principle")}.`
        : `The canon's changes since its last commit: ${plural(c.changes.length, "entry", "entries")} created, updated or retired.`,
      c.removed.length ? `Removed from the tree: ${c.removed.join(", ")}.` : "",
      "Each entry keeps its state: a guess stays a guess until the owner approves it on the page. Merging this branch is the approval of the commit.",
    ],
    intent: [],
    noIntent: "the canon itself, no code",
    pending: "guesses from adoption; the owner approves boxes on the page and merges the build branch",
    mustBeReviewed: true,
  }, undo);
}

/**
 * Switches to the branch `headcanon/build`, creating it from the current branch when absent. When the canon folder
 * has uncommitted or untracked files it commits them there in the intent format, with a review record made from
 * the reviews in the operations log.
 */
export function prepareBuild(repo: string, canonDir: string): { ok: boolean; branch: string; base: string; canonCommit?: string; error?: string } {
  const undo: Undo = [];
  let base = "";
  try {
    const canonPath = canonInside(repo, canonDir);
    if (!canonPath) throw new Refusal("the canon folder is not inside the repository");
    const current = tryGit(repo, ["symbolic-ref", "--short", "-q", "HEAD"])?.trim();
    if (!current) throw new Refusal("no branch is checked out here (a detached HEAD, or no git repository): check out a branch first");
    base = current;
    mustHaveCleanIndex(changesOf(repo), canonPath);
    base = switchToBuild(repo, current, undo);
    const canonCommit = commitCanon(repo, canonDir, canonPath, undo);
    return { ok: true, branch: BUILD_BRANCH, base, ...(canonCommit ? { canonCommit } : {}) };
  } catch (e) {
    rollback(undo);
    return { ok: false, branch: BUILD_BRANCH, base, error: reasonOf(e) };
  }
}

/** The box a caller names by its id or by its stable id. */
const boxOf = (canon: Canon, name: string): ReqNode | undefined => canon.nodes[name] ?? Object.values(canon.nodes).find((n) => n.uid !== undefined && n.uid === name);

/**
 * Commits the accepted test files of the named boxes (ids or stable ids; all accepted tests when none is named)
 * together with tests.json. A test file that was already in git and changed is named in a Test-Change trailer.
 * `extra` names the files the tests cannot run without and the testers added: helpers, a runner's configuration.
 */
export function commitTests(repo: string, canonDir: string, ids: string[], extra: string[] = []): { ok: boolean; sha?: string; error?: string } {
  const undo: Undo = [];
  try {
    const canonPath = canonInside(repo, canonDir);
    if (!canonPath) throw new Refusal("the canon folder is not inside the repository");
    const canon = loadCanon(canonDir);
    const wanted = new Set(ids.flatMap((id) => { const n = boxOf(canon, id); return [id, ...(n ? [n.id, ...(n.uid ? [n.uid] : [])] : [])]; }));
    const tests = loadManifest(canonDir).tests.filter((t) => t.status === "accepted" && (!ids.length || wanted.has(t.box) || wanted.has(t.id)));
    if (!tests.length) throw new Refusal(ids.length ? `no accepted test is recorded for ${ids.join(", ")}` : "no accepted test is recorded");
    const files = new Set(tests.map((t) => posix(t.file)));
    const record = posix(relative(resolve(repo), manifestPath(canonDir)));
    const changes = changesOf(repo);
    mustHaveCleanIndex(changes);
    const support = new Set(extra.map((p) => posix(p)).filter((p) => p !== canonPath && !p.startsWith(`${canonPath}/`)));
    const pending = changes.filter((c) => files.has(c.path) || c.path === record || support.has(c.path));
    if (!pending.length) return { ok: true };
    stage(repo, pending.map((c) => c.path), undo);
    const boxes = [...new Set(tests.map((t) => boxOf(canon, t.box)?.id ?? (canon.nodes[t.id] ? t.id : undefined)).filter((id): id is string => Boolean(id)))];
    const kinds = new Map<string, number>();
    for (const t of tests) kinds.set(t.kind, (kinds.get(t.kind) ?? 0) + 1);
    const rewritten = pending.filter((c) => files.has(c.path) && c.xy !== "??" && !c.xy.includes("A"));
    const sha = commitStaged(repo, canonDir, canonPath, {
      header: `test: record the accepted tests of ${plural(boxes.length || tests.length, boxes.length ? "box" : "test", boxes.length ? "boxes" : "tests")}`,
      body: () => [`${plural(tests.length, "test")} accepted by the reviewer (${[...kinds].map(([k, n]) => `${n} ${k}`).join(", ")}) in ${plural(files.size, "file")}, with the record of tests. Each was written from its box before the code; failing is expected where the box is not built.`],
      intent: boxes,
      noIntent: "the tests' boxes are no longer in the canon",
      pending: "accepted by HeadCanon's reviewer; the owner reads each test's description on its box",
      testChanges: rewritten.map((c) => `${c.path} ${c.xy.includes("D") ? "removed" : "rewritten"}, on the reviewer's verdict in the record of tests`),
    }, undo);
    return { ok: true, sha };
  } catch (e) {
    rollback(undo);
    return { ok: false, error: reasonOf(e) };
  }
}

/** The commits after `baseSha` up to HEAD, oldest first, each message put to the commit check; with a canon folder, its ids are checked too. */
export function sliceCommits(repo: string, baseSha: string, canonDir?: string): Array<{ sha: string; subject: string; ok: boolean; errors: string[] }> {
  const raw = tryGit(repo, ["log", "--reverse", "--format=%H%x1f%B%x1e", `${baseSha}..HEAD`]);
  if (!raw) return [];
  const canon = canonDir && existsSync(canonDir) ? loadCanon(canonDir) : undefined;
  return raw.split("\x1e").map((rec) => rec.replace(/^\s+/, "")).filter(Boolean).map((rec) => {
    const [sha = "", text = ""] = rec.split("\x1f");
    const check = checkCommitMessage(text, canon);
    return { sha, subject: text.split("\n")[0] ?? "", ok: check.ok, errors: check.errors };
  });
}

/** The lines of a file as it is at HEAD that one of the commits wrote last. */
function linesWrittenBy(repo: string, file: string, commits: Set<string>): number[] {
  const out: number[] = [];
  const raw = tryGit(repo, ["blame", "--porcelain", "HEAD", "--", file]) ?? "";
  for (const line of raw.split("\n")) {
    const m = /^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/.exec(line);
    if (m && commits.has(m[1]!)) out.push(Number(m[2]));
  }
  return out;
}

/** "not built" at the start of a line, as `built.ts` reads it, in the sections where it is read. */
const NOT_BUILT = /^\s*(?:[-*]\s+)?(?:\d{4}-\d{2}-\d{2}:?\s+)*not built(?![\w-])/i;
const NOT_BUILT_SECTIONS = ["Implemented by", "Open", "As built"];

/** Pure: the box's text without its "not built" lines; a section they leave empty goes with them. */
export function dropNotBuilt(text: string): string {
  const lines = text.split("\n");
  let section = "";
  let dropped = false;
  const kept = lines.filter((l) => {
    const h = /^##\s+(.*?)(?:\s*\[[a-z]+\])?\s*$/.exec(l);
    if (h) { section = h[1]!.trim().toLowerCase(); return true; }
    const hit = NOT_BUILT_SECTIONS.some((s) => s.toLowerCase() === section) && NOT_BUILT.test(l);
    if (hit) dropped = true;
    return !hit;
  });
  if (!dropped) return text;
  let out = kept.join("\n");
  for (const s of NOT_BUILT_SECTIONS) {
    const body = new RegExp(`^##[ \\t]+${s}\\b[^\\n]*\\n([\\s\\S]*?)(?=^##[ \\t]|(?![\\s\\S]))`, "mi").exec(out);
    if (body && !body[1]!.trim()) out = dropSection(out, s);
  }
  return out.replace(/\n{3,}/g, "\n\n").replace(/\n*$/, "\n");
}

/**
 * Rebuilds the code tree, binds to the box as `implements` the units whose lines the commits wrote, and drops the
 * box's "not built" line. A line belongs to the smallest unit around it; a changed file in which the tree knows no
 * unit for the change (another language, a stylesheet, content) is bound as the file itself, so the box still says
 * where it is built. Canon files and recorded tests are never bound.
 */
export function bindFromCommits(repo: string, canonDir: string, box: string, commits: string[]): { bound: string[] } {
  const dir = resolve(canonDir);
  const node = boxOf(loadCanon(dir), box);
  if (!node || !commits.length) return { bound: [] };
  const canonPath = canonInside(repo, dir);
  const gitDir = gitDirOf(dir);
  const tree = buildCodeTree(repo, canonPath ? { skip: [canonPath] } : {});
  if (gitDir) saveCodeTree(gitDir, tree);

  const full = new Set(commits.map((c) => tryGit(repo, ["rev-parse", "--verify", "-q", `${c}^{commit}`])?.trim()).filter((s): s is string => Boolean(s)));
  const tests = new Set(loadManifest(dir).tests.map((t) => posix(t.file)));
  const files = new Set<string>();
  for (const sha of full) for (const f of (tryGit(repo, ["show", "--no-renames", "--name-only", "--format=", sha]) ?? "").split("\n").map((l) => l.trim()).filter(Boolean)) {
    if ((canonPath && under(canonPath, f)) || tests.has(f) || !existsSync(join(repo, f))) continue;
    files.add(f);
  }
  const units: string[] = [];
  for (const file of [...files].sort()) {
    // smallest first, so a line inside a nested function is that function's and not the one around it
    // the unit that stands for a file's top-level code spans the whole file, so it is the answer only when no function is
    const inFile = Object.values(tree.functions).filter((u) => u.file === file && u.name !== "<module>").sort((a, b) => (a.lines[1] - a.lines[0]) - (b.lines[1] - b.lines[0]));
    const hit = new Set<string>();
    if (inFile.length) for (const line of linesWrittenBy(repo, file, full)) { const u = inFile.find((x) => x.lines[0] <= line && line <= x.lines[1]); if (u) hit.add(u.id); }
    units.push(...(hit.size ? [...hit].sort() : [tree.functions[`${file}#<module>`]?.id ?? file]));
  }
  const bound: string[] = [];
  const why = `built by ${[...full].map(short).join(", ")}`;
  for (const unit of units) if (applyOp(dir, { op: "bind", id: node.id, unit, relation: "implements", why }, { by: "session" }).ok) bound.push(unit);

  const after = loadCanon(dir).nodes[node.id];
  if (after && after.binds.some((b) => b.relation !== "contradicts" && isCodeUnit(b.unit))) {
    const abs = resolve(dir, after.file);
    journalChange(dir, { kind: "op", summary: `${node.id}: built, its not-built line dropped`, id: node.id }, [abs], () => {
      const text = readFileSync(abs, "utf8");
      const next = dropNotBuilt(text);
      if (next !== text) writeFileSync(abs, next);
    });
  }
  return { bound };
}

/** The slice of a run for a box named by id or stable id, with the box as the canon holds it now. */
function sliceAndBox(canonDir: string, run: Run, box: string): { slice: Slice; node: ReqNode } {
  const slice = run.slices.find((s) => s.box === box) ?? run.slices.find((s) => s.uid !== "" && s.uid === box);
  if (!slice) throw new Refusal(`${box} is not part of run ${run.id}`);
  const canon = loadCanon(canonDir);
  const node = (slice.uid ? Object.values(canon.nodes).find((n) => n.uid === slice.uid) : undefined) ?? canon.nodes[slice.box];
  if (!node) throw new Refusal(`${slice.box} is no longer in the canon`);
  return { slice, node };
}

function mustBeOn(repo: string, branch: string): void {
  const current = tryGit(repo, ["symbolic-ref", "--short", "-q", "HEAD"])?.trim();
  if (current !== branch) throw new Refusal(`the run's branch is ${branch} and ${current ? `${current} is` : "no branch is"} checked out: switch to ${branch} first`);
}

/**
 * The person approved what was built for a box: the code the slice's commits wrote is bound to the box, its
 * "not built" line goes, and that change, with the canon files the slice's own agent wrote through operations,
 * is one commit in the intent format with Approved-By. Other pending canon changes are left for `prepareBuild`.
 */
export function approveSlice(repo: string, canonDir: string, run: Run, box: string, approver: string): { ok: boolean; sha?: string; error?: string } {
  const undo: Undo = [];
  try {
    const dir = resolve(canonDir);
    const canonPath = canonInside(repo, dir);
    if (!canonPath) throw new Refusal("the canon folder is not inside the repository");
    if (!approver.trim()) throw new Refusal("an approval carries the name of the person who approves");
    const { slice, node } = sliceAndBox(dir, run, box);
    mustBeOn(repo, run.branch);
    mustHaveCleanIndex(changesOf(repo));

    const abs = resolve(dir, node.file);
    const before = readFileSync(abs, "utf8");
    undo.push(() => { if (readFileSync(abs, "utf8") !== before) journalChange(dir, { kind: "revert", summary: `${node.id}: approval not committed, the box is as it was`, id: node.id }, [abs], () => writeFileSync(abs, before)); });
    const { bound } = bindFromCommits(repo, dir, node.id, slice.commits);

    const gitDir = gitDirOf(dir);
    const agent = slice.agentName ?? `implementer-${slice.box}`;
    const written = new Set([node.file, ...(gitDir ? readOps(join(gitDir, "headcanon", "ops.jsonl")) : []).filter((e) => e.ok && e.by === agent).flatMap((e) => e.changes ?? [])].map((f) => `${canonPath}/${posix(f)}`));
    const pending = changesOf(repo).filter((c) => written.has(c.path));
    if (!pending.length) return { ok: true };
    stage(repo, pending.map((c) => c.path), undo);
    const sha = commitStaged(repo, dir, canonPath, {
      header: `docs(canon): record ${node.id} as built`,
      body: () => [
        `${node.title}.${slice.summary ? ` ${oneLine(slice.summary)}` : ""}`,
        `${slice.commits.length ? `Built in ${slice.commits.map(short).join(", ")}` : "No commit of its own"}; ${bound.length ? `bound as implementing it: ${bound.join(", ")}` : "nothing new was bound"}. Approved on the page by ${oneLine(approver)}.`,
      ],
      intent: [node.id],
      noIntent: "",
      approvedBy: oneLine(approver),
      pending: "",
    }, undo);
    return { ok: true, sha };
  } catch (e) {
    rollback(undo);
    return { ok: false, error: reasonOf(e) };
  }
}

/**
 * The person discarded what was built for a box: the slice's commits are reverted, newest first, in one commit in
 * the intent format. Git refuses when a file they touched has changes not yet committed; nothing is reverted then.
 */
export function discardSlice(repo: string, canonDir: string, run: Run, box: string): { ok: boolean; error?: string } {
  const undo: Undo = [];
  try {
    const dir = resolve(canonDir);
    const canonPath = canonInside(repo, dir);
    if (!canonPath) throw new Refusal("the canon folder is not inside the repository");
    const slice = run.slices.find((s) => s.box === box) ?? run.slices.find((s) => s.uid !== "" && s.uid === box);
    if (!slice) throw new Refusal(`${box} is not part of run ${run.id}`);
    if (!slice.commits.length) return { ok: true };
    mustBeOn(repo, run.branch);
    mustHaveCleanIndex(changesOf(repo));

    const order = git(repo, ["rev-list", "--topo-order", "HEAD"]).split("\n");
    const at = new Map(order.map((sha, i) => [sha, i] as const));
    const commits = slice.commits.map((c) => {
      const sha = tryGit(repo, ["rev-parse", "--verify", "-q", `${c}^{commit}`])?.trim();
      if (!sha || !at.has(sha)) throw new Refusal(`commit ${c} is not on ${run.branch}`);
      return sha;
    }).sort((a, b) => at.get(a)! - at.get(b)!);
    const subjects = commits.map((sha) => `${short(sha)} ${git(repo, ["log", "-1", "--format=%s", sha]).trim()}`);

    undo.push(() => { if (tryGit(repo, ["revert", "--abort"]) === undefined) git(repo, ["reset", "-q", "--merge", "HEAD"]); });
    git(repo, ["revert", "--no-commit", ...commits]);
    const canon = loadCanon(dir);
    const node = (slice.uid ? Object.values(canon.nodes).find((n) => n.uid === slice.uid) : undefined) ?? canon.nodes[slice.box];
    commitStaged(repo, dir, canonPath, {
      header: `revert: discard what was built for ${node?.id ?? slice.box}`,
      body: () => [`${node?.title ?? slice.title}. The person discarded the slice; this reverts, newest first:`, subjects.map((s) => `- ${s}`).join("\n")],
      intent: node ? [node.id] : [],
      noIntent: `the discarded box ${slice.box} is no longer in the canon`,
      pending: "the owner discarded the slice on the page; the reverted canon changes wait for review there",
    }, undo);
    return { ok: true };
  } catch (e) {
    rollback(undo);
    return { ok: false, error: reasonOf(e) };
  }
}

const USAGE = `usage:
  headcanon build prepare            Switch to ${BUILD_BRANCH}, made from this branch when absent, and commit the canon's pending changes there.
  headcanon build tests [<id>...]    Commit the accepted tests of the named boxes, or of every box, with the record of tests.
  headcanon slice approve <box>      Bind what the slice built to its box and commit the canon change, approved by you.
  headcanon slice discard <box>      Revert the slice's commits.
`;

/** `HC build prepare|tests`, `HC slice approve|discard <box>`; the first word may be the command itself. */
export async function approveCli(rest: string[], ctx: CliCtx): Promise<number> {
  const { words, flags } = flagsOf(rest);
  const json = ctx.json || flags["json"] === true;
  const group = words[0] === "build" || words[0] === "slice" ? words.shift() : undefined;
  const sub = words.shift();
  const print = (value: unknown, plain: string) => ctx.out(json ? JSON.stringify(value, null, 2) + "\n" : plain);
  const known = { build: ["prepare", "tests"], slice: ["approve", "discard"] };
  if (!sub || !(group ? known[group as "build" | "slice"] : [...known.build, ...known.slice]).includes(sub)) { ctx.err(USAGE); return 2; }

  if (sub === "prepare") {
    const r = prepareBuild(ctx.repo, ctx.canonDir);
    if (!r.ok) { ctx.err(`build prepare: ${r.error ?? "no reason given"}\n`); return 1; }
    print(r, `On ${r.branch}, made from ${r.base}. ${r.canonCommit ? `The canon is committed in ${short(r.canonCommit)}.` : "The canon had nothing to commit."}\n`);
    return 0;
  }
  if (sub === "tests") {
    // --with <path,path>: the helpers and the runner's configuration the testers added, committed with the tests
    const extra = typeof flags["with"] === "string" ? flags["with"].split(",").map((p) => p.trim()).filter(Boolean) : [];
    const r = commitTests(ctx.repo, ctx.canonDir, words, extra);
    if (!r.ok) { ctx.err(`build tests: ${r.error ?? "no reason given"}\n`); return 1; }
    print(r, r.sha ? `The accepted tests are committed in ${short(r.sha)}.\n` : "The accepted tests were already committed.\n");
    return 0;
  }

  const box = words[0];
  if (!box) { ctx.err(USAGE); return 2; }
  const gitDir = ctx.gitDir;
  const run = gitDir ? activeRun(gitDir) ?? latestRun(gitDir) : undefined;
  if (!gitDir || !run) { ctx.err(`slice ${sub}: there is no run to decide on\n`); return 1; }
  const settle = (status: Slice["status"]) => { try { updateSlice(gitDir, run.id, box, { status }); } catch { /* what git did stands */ } };
  if (sub === "approve") {
    const who = ctx.by?.trim() || (typeof flags["by"] === "string" ? flags["by"].trim() : "") || tryGit(ctx.repo, ["config", "user.name"])?.trim() || "";
    if (!who) { ctx.err("slice approve: git has no user name in this repository; set one with `git config user.name \"<your name>\"` or pass --by\n"); return 1; }
    const r = approveSlice(ctx.repo, ctx.canonDir, run, box, who);
    if (!r.ok) { ctx.err(`slice approve: ${r.error ?? "no reason given"}\n`); return 1; }
    settle("approved");
    print(r, `${box} is approved by ${who}${r.sha ? `, its canon change committed in ${short(r.sha)}` : "; the canon had nothing to commit"}.\n`);
    return 0;
  }
  const r = discardSlice(ctx.repo, ctx.canonDir, run, box);
  if (!r.ok) { ctx.err(`slice discard: ${r.error ?? "no reason given"}\n`); return 1; }
  settle("discarded");
  print(r, `${box} is discarded: its commits are reverted.\n`);
  return 0;
}
