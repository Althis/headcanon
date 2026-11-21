/**
 * The tests HeadCanon keeps for the nodes (DEC-026): the record of tests committed with the canon, the runners
 * that run them, and the results stored beside it in the git directory. A test is of any kind the project needs
 * and runs through whatever command the project uses; nothing here knows a language or a tool beyond the four
 * result formats it reads. A test finds its node by the `[hc:<uid>]` tag in its title, never by position.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { sectionText } from "./check.js";
import { descendants, loadCanon } from "./load.js";
import { gitDirOf } from "./ops.js";
import type { Canon, ReqNode } from "./types.js";

export type TestKind = "unit" | "integration" | "e2e" | "eval" | "other";
export type RunnerFormat = "junit" | "vitest-json" | "playwright-json" | "headcanon-json";
/** Command placeholders: `{files}` the test files separated by spaces, `{out}` a result file path outside the repository, `{titles}` a pattern of titles when the runner supports it. */
export interface Runner { kind: TestKind; command: string; format: RunnerFormat; cwd?: string; timeoutSec?: number }
export interface TestEntry {
  /** The node's uid. */
  node: string;
  /** The node's id when the test was recorded. */
  id: string;
  runner: string;
  kind: TestKind;
  file: string;
  /** Contains `[hc:<uid>]`. */
  title: string;
  /** Plain words: what is tested and how. */
  description: string;
  journey?: string;
  /** sha256 of the node's Intent and Check. */
  pin: string;
  /** sha256 of the file, set on acceptance. */
  fingerprint?: string;
  status: "proposed" | "accepted" | "rejected";
  by?: string;
  at: string;
  review?: string;
}
export interface TestManifest { runners: Record<string, Runner>; tests: TestEntry[] }
export type Outcome = "passed" | "failed" | "errored" | "skipped" | "missing" | "changed" | "stale" | "not-run";
/** `tree` is set only on a result carried over from a run on another tree; without it the result is of `TestResults.tree`. */
export interface TestResult { node: string; title: string; file: string; runner: string; outcome: Outcome; message?: string; ms?: number; tree?: string }
export interface TestResults { at: string; tree: string; results: TestResult[]; runs: Array<{ runner: string; exit: number | null; ms: number; error?: string }> }
export interface ParsedResult { title: string; file?: string; outcome: "passed" | "failed" | "errored" | "skipped"; message?: string; ms?: number }
export interface CliCtx { canonDir: string; repo: string; gitDir: string | undefined; port: number; by: string | undefined; json: boolean; out: (s: string) => void; err: (s: string) => void; stdin: () => string }

export const TEST_KINDS: readonly TestKind[] = ["unit", "integration", "e2e", "eval", "other"];
export const RUNNER_FORMATS: readonly RunnerFormat[] = ["junit", "vitest-json", "playwright-json", "headcanon-json"];
/** The outcomes that count as failing for the gate; `not-run` and `skipped` say nothing either way. */
export const FAILING: readonly Outcome[] = ["failed", "errored", "missing", "changed", "stale"];
export const isFailing = (o: Outcome): boolean => FAILING.includes(o);

const sha = (s: string | Buffer): string => createHash("sha256").update(s).digest("hex");
const posix = (p: string): string => p.split("\\").join("/");
const squash = (s: string): string => s.replace(/\s+/g, " ").trim();
const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** The tag a test's title carries for the node with this uid. */
export const tagOf = (uid: string): string => `[hc:${uid}]`;
/** The uids a title names. */
export function uidsIn(title: string): string[] {
  return [...title.matchAll(/\[hc:([^\]\s]+)\]/g)].map((m) => m[1]!);
}

const byUid = (canon: Canon): Map<string, ReqNode> => new Map(Object.values(canon.nodes).filter((n) => n.uid).map((n) => [n.uid!, n] as const));

// git reads only, and without the optional locks, so a run never collides with a git command of the user or an agent
function gitBytes(repo: string, args: string[]): Buffer | undefined {
  try { return execFileSync("git", ["--no-optional-locks", ...args], { cwd: repo, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 29, windowsHide: true }); } catch { return undefined; }
}
const git = (repo: string, args: string[]): string | undefined => gitBytes(repo, args)?.toString("utf8");

/** The repository a canon folder belongs to: its git work tree, else the folder that holds it. */
function repoOf(canonDir: string): string {
  const parent = dirname(resolve(canonDir));
  return git(parent, ["rev-parse", "--show-toplevel"])?.trim() || parent;
}

// ---- the record of tests ----

export function manifestPath(canonDir: string): string {
  return join(resolve(canonDir), "tests.json");
}

function readManifest(canonDir: string): TestManifest {
  const file = manifestPath(canonDir);
  if (!existsSync(file)) return { runners: {}, tests: [] };
  const m = JSON.parse(readFileSync(file, "utf8")) as Partial<TestManifest> | null;
  return { runners: m?.runners && typeof m.runners === "object" ? m.runners : {}, tests: Array.isArray(m?.tests) ? m.tests : [] };
}

/** The record as it stands; an empty one when the file is absent or cannot be read, so a reader never throws. */
export function loadManifest(canonDir: string): TestManifest {
  try { return readManifest(canonDir); } catch { return { runners: {}, tests: [] }; }
}

/** Write a file whole or not at all, so a reader that polls it never meets half of it. */
function writeWhole(file: string, body: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const part = `${file}.${process.pid}.part`;
  writeFileSync(part, body);
  try { renameSync(part, file); } catch { writeFileSync(file, body); rmSync(part, { force: true }); }   // Windows refuses the rename while a reader holds the file
}

export function saveManifest(canonDir: string, m: TestManifest): void {
  writeWhole(manifestPath(canonDir), JSON.stringify(m, null, 1) + "\n");
}

// A writer never replaces a record it could not read: a tests.json torn by a merge is repaired by hand, not emptied.
function manifestToChange(canonDir: string): TestManifest {
  try { return readManifest(canonDir); } catch (e) { throw new Error(`${manifestPath(canonDir)} cannot be read (${errorText(e)}); repair it before recording tests`); }
}

/**
 * One change to the record at a time: several testers record at once, each in a process of its own, and a change
 * made between another's read and write would be lost. The lock is a folder outside the work tree; one left by a
 * process that died is taken over, and a writer that cannot get it goes on rather than fail.
 */
function oneAtATime<T>(canonDir: string, change: () => T): T {
  const dir = resolve(canonDir), gitDir = gitDirOf(dir);
  const lock = join(gitDir ? join(gitDir, "headcanon") : tmpdir(), `tests-${sha(dir).slice(0, 12)}.lock`);
  mkdirSync(dirname(lock), { recursive: true });
  const giveUp = Date.now() + 15_000;
  for (;;) {
    try { mkdirSync(lock); break; }
    catch {
      try { if (Date.now() - statSync(lock).mtimeMs > 30_000) rmSync(lock, { recursive: true, force: true }); } catch { /* released meanwhile */ }
      if (Date.now() > giveUp) break;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40);
    }
  }
  try { return change(); } finally { rmSync(lock, { recursive: true, force: true }); }
}

/** What a test is pinned to: the node's Intent and Check, with line breaks and spacing left out so a reflow is no change. */
export function pinOf(node: ReqNode): string {
  return sha(`${squash(sectionText(node.body, "Intent"))}\n${squash(sectionText(node.body, "Check"))}`);
}

/** The file's content as a hash, the same under either line ending; undefined when the file is absent. */
export function fingerprintOf(repo: string, file: string): string | undefined {
  const abs = isAbsolute(file) ? file : join(repo, file);
  try { return statSync(abs).isFile() ? sha(readFileSync(abs, "utf8").replace(/\r\n/g, "\n")) : undefined; } catch { return undefined; }
}

/** Why a description does not read as plain prose, or undefined when it does. */
function proseProblem(text: string): string | undefined {
  const t = text.trim();
  if (t.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length < 4) return "the description must say in plain words what is checked and how";
  const code = /`|=>|[=!]==?|&&|\|\||[{}]|[A-Za-z_$][\w$.]*\((?!s\))|[A-Za-z]_[A-Za-z]/.exec(t);
  return code ? `the description must be plain words a user who cannot read code understands; it holds code ("${code[0]}")` : undefined;
}

function checkRunner(name: string, r: Runner): string | undefined {
  if (!/^[\w.-]+$/.test(name)) return `a runner's name is letters, digits, dots and dashes: "${name}"`;
  if (!r || typeof r !== "object") return "a runner is an object with kind, command and format";
  if (!TEST_KINDS.includes(r.kind)) return `kind must be one of ${TEST_KINDS.join(", ")}`;
  if (!RUNNER_FORMATS.includes(r.format)) return `format must be one of ${RUNNER_FORMATS.join(", ")}`;
  if (typeof r.command !== "string" || !r.command.trim()) return "command must be the line that runs the tests";
  if (r.cwd !== undefined && (typeof r.cwd !== "string" || isAbsolute(r.cwd) || posix(r.cwd).split("/").includes(".."))) return "cwd must be a folder inside the repository, written from its root";
  if (r.timeoutSec !== undefined && !(typeof r.timeoutSec === "number" && r.timeoutSec > 0)) return "timeoutSec must be a number of seconds above zero";
  return undefined;
}

/** Record how one kind of test runs in this project; a runner of the same name is replaced. Throws on a runner that cannot run. */
export function setRunner(canonDir: string, name: string, r: Runner): void {
  const problem = checkRunner(name, r);
  if (problem) throw new Error(problem);
  oneAtATime(canonDir, () => {
    const m = manifestToChange(canonDir);
    m.runners[name] = { kind: r.kind, command: r.command.trim(), format: r.format, ...(r.cwd ? { cwd: posix(r.cwd) } : {}), ...(r.timeoutSec ? { timeoutSec: r.timeoutSec } : {}) };
    saveManifest(canonDir, m);
  });
}

/**
 * Record tests as proposed. Each must name a node by its uid, carry `[hc:<uid>]` in its title, point at a file
 * that exists, and describe itself in plain prose; an e2e test names the journey it plays. A test recorded again
 * (same node, file and title) replaces the earlier entry and waits for review again.
 */
export function addTests(canonDir: string, entries: Array<Omit<TestEntry, "pin" | "status" | "at" | "id"> & { id?: string }>, by?: string): { added: number; errors: string[] } {
  const dir = resolve(canonDir);
  const canon = loadCanon(dir), repo = repoOf(dir), nodes = byUid(canon);
  return oneAtATime(dir, () => recordTests(dir, canon, repo, nodes, entries, by));
}

function recordTests(dir: string, canon: Canon, repo: string, nodes: Map<string, ReqNode>, entries: Parameters<typeof addTests>[1], by: string | undefined): { added: number; errors: string[] } {
  const errors: string[] = [];
  let m: TestManifest;
  try { m = manifestToChange(dir); } catch (e) { return { added: 0, errors: [errorText(e)] }; }
  let added = 0;
  entries.forEach((e, i) => {
    const name = `test ${i + 1}${typeof e?.title === "string" ? ` "${e.title}"` : ""}`;
    const refuse = (why: string) => { errors.push(`${name}: ${why}`); };
    if (!e || typeof e !== "object") return refuse("is not an object");
    const node = typeof e.node === "string" ? nodes.get(e.node) : undefined;
    if (!node) return refuse(`node "${String(e.node)}" is not the uid of a node in the canon`);
    if (typeof e.title !== "string" || !uidsIn(e.title).includes(node.uid!)) return refuse(`the title must carry ${tagOf(node.uid!)}`);
    if (!TEST_KINDS.includes(e.kind)) return refuse(`kind must be one of ${TEST_KINDS.join(", ")}`);
    if (typeof e.runner !== "string" || !e.runner.trim()) return refuse("names no runner");
    if (typeof e.file !== "string" || !e.file.trim()) return refuse("names no file");
    const abs = isAbsolute(e.file) ? e.file : join(repo, e.file);
    const file = posix(relative(repo, abs));
    if (file.startsWith("..") || isAbsolute(file)) return refuse(`the file ${e.file} is outside the repository`);
    if (fingerprintOf(repo, file) === undefined) return refuse(`the file ${file} does not exist`);
    const prose = proseProblem(typeof e.description === "string" ? e.description : "");
    if (prose) return refuse(prose);
    if (e.journey !== undefined && !canon.journeys.some((j) => j.id === e.journey)) return refuse(`journey "${e.journey}" is not in the canon`);
    if (e.kind === "e2e" && !e.journey) return refuse("an e2e test names the journey it plays; record the journey first");
    const entry: TestEntry = { node: node.uid!, id: node.id, runner: e.runner.trim(), kind: e.kind, file, title: e.title, description: e.description.trim(), ...(e.journey ? { journey: e.journey } : {}), pin: pinOf(node), status: "proposed", ...(by ?? e.by ? { by: (by ?? e.by)! } : {}), at: new Date().toISOString() };
    const at = m.tests.findIndex((t) => t.node === entry.node && t.file === entry.file && t.title === entry.title);
    if (at >= 0) m.tests[at] = entry; else m.tests.push(entry);
    added++;
  });
  if (added) saveManifest(dir, m);
  return { added, errors };
}

/**
 * The reviewer's verdict on a node's proposed tests. Pass: each is accepted with the fingerprint of its file as it
 * is now. Fail: each is rejected with the note. Returns how many entries the verdict changed.
 */
export function reviewTests(canonDir: string, node: string, verdict: "pass" | "fail", note?: string): number {
  const dir = resolve(canonDir), repo = repoOf(dir);
  return oneAtATime(dir, () => {
    const m = manifestToChange(dir);
    let changed = 0;
    m.tests = m.tests.map((t) => {
      if (t.node !== node || t.status !== "proposed") return t;
      const { review: _old, fingerprint: _was, ...rest } = t;
      if (verdict === "fail") { changed++; return { ...rest, status: "rejected" as const, ...(note ? { review: note } : {}) }; }
      const fingerprint = fingerprintOf(repo, t.file);
      if (!fingerprint) return t;   // a test whose file is gone cannot be accepted
      changed++;
      return { ...rest, fingerprint, status: "accepted" as const, ...(note ? { review: note } : {}) };
    });
    if (changed) saveManifest(dir, m);
    return changed;
  });
}

export function testsOf(m: TestManifest, uid: string): TestEntry[] {
  return m.tests.filter((t) => t.node === uid);
}

// ---- the state of the tree ----

const stampOf = (abs: string): string => { try { const s = statSync(abs); return `${s.size}:${Math.floor(s.mtimeMs)}`; } catch { return "gone"; } };

const nulList = (s: string | undefined): string[] => (s ?? "").split("\0").filter(Boolean);

/** The id git gives each file's content, through the same filters a commit applies; a file git cannot hash keeps its size and time instead. */
function contentIds(repo: string, paths: string[]): Map<string, string> {
  const out = new Map(paths.map((p) => [p, stampOf(join(repo, p))] as const));
  const plain = paths.filter((p) => !/[\r\n]/.test(p) && (() => { try { return statSync(join(repo, p)).isFile(); } catch { return false; } })());
  if (!plain.length) return out;
  try {
    const ids = execFileSync("git", ["--no-optional-locks", "hash-object", "--stdin-paths"], { cwd: repo, input: plain.join("\n") + "\n", encoding: "utf8", stdio: ["pipe", "pipe", "ignore"], maxBuffer: 1 << 29, windowsHide: true }).split(/\r?\n/).filter(Boolean);
    if (ids.length === plain.length) plain.forEach((p, i) => out.set(p, ids[i]!));
  } catch { /* the stamps stand */ }
  return out;
}

/**
 * One value for the files as they are now: every tracked or untracked file that is not ignored, with the id of its
 * content. It changes when a file changes, appears or goes, and with nothing else: a commit of the files as they
 * are leaves it as it was, so a result measured before the commit still speaks for the tree after it. Git answers
 * from its index, so only the changed and the untracked files are read, however large the repository is.
 * Empty outside a git repository.
 */
export function treeDigest(repo: string): string {
  const index = git(repo, ["ls-files", "-s", "-z"]);
  if (index === undefined) return "";
  const files = new Map<string, string>();
  // "<mode> <id> <stage>\t<path>"; the mode is left out, since a file read from the work tree has none to compare
  for (const e of nulList(index)) { const tab = e.indexOf("\t"), path = e.slice(tab + 1); if (tab > 0) files.set(path, `${files.get(path) ?? ""}${e.slice(0, tab).split(" ")[1] ?? ""}`); }
  const changed = nulList(git(repo, ["diff", "--name-only", "-z"]));
  const untracked = nulList(git(repo, ["ls-files", "--others", "--exclude-standard", "-z"]));
  const ids = contentIds(repo, [...changed, ...untracked]);
  for (const f of changed) { if (existsSync(join(repo, f))) files.set(f, ids.get(f)!); else files.delete(f); }
  for (const f of untracked) files.set(f, ids.get(f)!);
  const h = createHash("sha256");
  for (const f of [...files.keys()].sort()) h.update(`${f}\0${files.get(f)!}\0`);
  return h.digest("hex");
}

/** `git status --porcelain` as a map from each file it lists to its status and stamp, so a file already changed that changes again is seen too. */
function dirtyFiles(repo: string): Map<string, string> {
  const out = new Map<string, string>();
  const parts = (git(repo, ["status", "--porcelain", "-z", "--untracked-files=all"]) ?? "").split("\0");
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i]!;
    if (e.length < 4) continue;
    const code = e.slice(0, 2), path = e.slice(3);
    if (code.includes("R") || code.includes("C")) i++;   // a rename or a copy carries its origin as the next entry
    out.set(path, `${code} ${stampOf(join(repo, path))}`);
  }
  return out;
}

function changedBetween(before: Map<string, string>, after: Map<string, string>): string[] {
  return [...new Set([...before.keys(), ...after.keys()])].filter((f) => before.get(f) !== after.get(f)).sort();
}

// ---- results ----

export function resultsPath(gitDir: string): string {
  return join(gitDir, "headcanon", "results.json");
}

export function loadResults(gitDir: string): TestResults | undefined {
  try {
    const r = JSON.parse(readFileSync(resultsPath(gitDir), "utf8")) as TestResults;
    return r && Array.isArray(r.results) && Array.isArray(r.runs) ? r : undefined;
  } catch { return undefined; }
}

// ---- reading what a runner wrote ----

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown): string | undefined => (typeof v === "string" && v.length ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
/** A message as a user reads it: no terminal colour codes, no end spaces, cut where it stops helping. */
const clean = (s: string): string => { const t = s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "").trim(); return t.length > 4000 ? `${t.slice(0, 4000)}\n…` : t; };

function parsed(title: string, outcome: ParsedResult["outcome"], file?: string, message?: string, ms?: number): ParsedResult {
  const m = message ? clean(message) : "";
  return { title, outcome, ...(file ? { file } : {}), ...(m ? { message: m } : {}), ...(ms !== undefined ? { ms: Math.round(ms) } : {}) };
}

function jsonIn(body: string, format: RunnerFormat): unknown {
  const t = body.trim();
  try { return JSON.parse(t); } catch { /* a runner may print lines around its JSON */ }
  const spans = ([["{", "}"], ["[", "]"]] as const).map(([open, close]) => [t.indexOf(open), t.lastIndexOf(close)] as const).filter(([from, to]) => from >= 0 && to > from).sort((a, b) => a[0] - b[0]);
  for (const [from, to] of spans) { try { return JSON.parse(t.slice(from, to + 1)); } catch { /* try the other bracket */ } }
  throw new Error(`the result does not read as ${format}: it is not JSON`);
}

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[A-Za-z]+);/g, (whole, name: string) => {
    if (name.startsWith("#x")) return String.fromCodePoint(parseInt(name.slice(2), 16));
    if (name.startsWith("#")) return String.fromCodePoint(Number(name.slice(1)));
    return ENTITIES[name] ?? whole;
  });
}

/** The index of the `>` that ends the tag opened at `from`, quotes respected; -1 when the tag never ends. */
function tagEnd(s: string, from: number): number {
  let quote = "";
  for (let i = from + 1; i < s.length; i++) {
    const c = s[i]!;
    if (quote) { if (c === quote) quote = ""; }
    else if (c === '"' || c === "'") quote = c;
    else if (c === ">") return i;
  }
  return -1;
}

function attrsOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1]!] = decodeXml(m[2] ?? m[3] ?? "");
  return out;
}

const looksLikePath = (s: string | undefined): boolean => Boolean(s && /[\\/]/.test(s));

/**
 * JUnit XML as test runners write it: `testsuite` and `testcase` elements, a `failure`, `error` or `skipped` child
 * deciding the outcome, text in entities or CDATA. Read as a stream of tags; anything else in the file is passed over.
 */
function parseJunit(body: string): ParsedResult[] {
  const out: ParsedResult[] = [];
  const suites: Array<Record<string, string>> = [];
  let sawSuite = false;
  let tc: { attrs: Record<string, string>; kids: Array<{ tag: string; attrs: Record<string, string>; text: string }> } | undefined;
  let kid: { tag: string; attrs: Record<string, string>; text: string } | undefined;
  const open = (tag: string, attrs: Record<string, string>) => {
    if (tag === "testsuite" || tag === "testsuites") sawSuite = true;
    if (tag === "testsuite") suites.push(attrs);
    else if (tag === "testcase") tc = { attrs, kids: [] };
    else if (tc && (tag === "failure" || tag === "error" || tag === "skipped")) kid = { tag, attrs, text: "" };
  };
  const close = (tag: string) => {
    if (kid && tag === kid.tag) { tc?.kids.push(kid); kid = undefined; }
    else if (tag === "testsuite") suites.pop();
    else if (tag === "testcase" && tc) {
      const a = tc.attrs, name = a["name"] ?? "";
      const verdict = tc.kids.find((k) => k.tag === "failure") ?? tc.kids.find((k) => k.tag === "error") ?? tc.kids.find((k) => k.tag === "skipped");
      const outcome = verdict?.tag === "failure" ? "failed" : verdict?.tag === "error" ? "errored" : verdict ? "skipped" : "passed";
      const said = verdict?.attrs["message"] ?? "", told = verdict?.text.trim() ?? "";
      // the tag may sit on the class or the suite the case belongs to, when one node has several cases
      const holder = uidsIn(name).length ? undefined : [a["classname"], ...suites.map((s) => s["name"]).reverse()].find((s) => s && uidsIn(s).length);
      const file = a["file"] ?? [...suites].reverse().find((s) => s["file"])?.["file"] ?? [a["classname"], suites.at(-1)?.["name"]].find(looksLikePath);
      const seconds = Number(a["time"]);
      out.push(parsed(holder ? `${holder} > ${name}` : name, outcome, file, told.includes(said) ? told : said && told ? `${said}\n${told}` : said || told, a["time"] !== undefined && Number.isFinite(seconds) ? seconds * 1000 : undefined));
      tc = undefined;
    }
  };
  let i = 0;
  while (i < body.length) {
    const lt = body.indexOf("<", i);
    if (kid) kid.text += decodeXml(body.slice(i, lt < 0 ? body.length : lt));
    if (lt < 0) break;
    const skipTo = (end: string) => { const e = body.indexOf(end, lt); i = e < 0 ? body.length : e + end.length; return e; };
    if (body.startsWith("<![CDATA[", lt)) { const e = skipTo("]]>"); if (kid) kid.text += body.slice(lt + 9, e < 0 ? body.length : e); continue; }
    if (body.startsWith("<!--", lt)) { skipTo("-->"); continue; }
    if (body.startsWith("<?", lt)) { skipTo("?>"); continue; }
    if (!/[A-Za-z_/]/.test(body[lt + 1] ?? "")) { if (kid) kid.text += "<"; i = lt + 1; continue; }
    const gt = tagEnd(body, lt);
    if (gt < 0) break;
    const raw = body.slice(lt + 1, gt).trim();
    i = gt + 1;
    if (raw.startsWith("/")) { close(raw.slice(1).trim()); continue; }
    const selfClosing = raw.endsWith("/");
    const inner = selfClosing ? raw.slice(0, -1) : raw;
    const tag = inner.split(/\s/, 1)[0] ?? "";
    open(tag, attrsOf(inner.slice(tag.length)));
    if (selfClosing) close(tag);
  }
  if (!sawSuite && !out.length) throw new Error("the result does not read as junit: it has no testsuite");
  return out;
}

const VITEST: Record<string, ParsedResult["outcome"]> = { passed: "passed", failed: "failed", skipped: "skipped", pending: "skipped", todo: "skipped", disabled: "skipped" };

/** The JSON reporter of Vitest, which keeps the shape Jest gave it: files under `testResults`, cases under `assertionResults`. */
function parseVitest(data: unknown): ParsedResult[] {
  const files = rec(data)["testResults"];
  if (!Array.isArray(files)) throw new Error("the result does not read as vitest-json: it has no testResults");
  const out: ParsedResult[] = [];
  for (const f of files.map(rec)) {
    const file = text(f["name"]);
    const cases = list(f["assertionResults"]).map(rec);
    // a file that fails to load reports no case: it is told as the file itself, errored, so its tests can say why they did not run
    if (!cases.length && f["status"] === "failed" && file) out.push(parsed(file, "errored", file, text(f["message"]) ?? text(f["failureMessage"]) ?? "the test file did not load"));
    for (const c of cases) {
      const title = text(c["fullName"]) ?? [...list(c["ancestorTitles"]), c["title"]].filter((x): x is string => typeof x === "string" && x.length > 0).join(" ");
      const outcome = VITEST[String(c["status"])] ?? "errored";
      out.push(parsed(title, outcome, file, outcome === "failed" || outcome === "errored" ? list(c["failureMessages"]).filter((x): x is string => typeof x === "string").join("\n") : undefined, num(c["duration"])));
    }
  }
  return out;
}

/** The JSON reporter of Playwright: suites nest (the outermost is the file), a spec holds one test per project, a test holds one result per attempt. */
function parsePlaywright(data: unknown): ParsedResult[] {
  const root = rec(data);
  if (!Array.isArray(root["suites"])) throw new Error("the result does not read as playwright-json: it has no suites");
  const out: ParsedResult[] = [];
  const walk = (suite: Record<string, unknown>, path: string[], file: string | undefined) => {
    const here = text(suite["file"]) ?? file;
    for (const spec of list(suite["specs"]).map(rec)) {
      const title = [...path, text(spec["title"]) ?? ""].filter(Boolean).join(" > ");
      for (const t of list(spec["tests"]).map(rec)) {
        const last = rec(list(t["results"]).at(-1));
        const status = text(t["status"]), ran = text(last["status"]);
        const outcome: ParsedResult["outcome"] =
          status === "skipped" || (!status && (ran === "skipped" || !ran)) ? "skipped"
          : status === "expected" || status === "flaky" || (!status && ran === "passed") ? "passed"
          : ran === "interrupted" ? "errored" : "failed";
        const project = text(t["projectName"]);
        const why = outcome === "passed" ? (status === "flaky" ? "passed on a retry" : undefined)
          : outcome === "skipped" ? undefined
          : text(rec(last["error"])["message"]) ?? text(rec(list(last["errors"])[0])["message"]) ?? (ran === "timedOut" ? "the test timed out" : ran === "interrupted" ? "the run was interrupted" : "the test failed");
        out.push(parsed(title, outcome, text(spec["file"]) ?? here, why && project && outcome !== "passed" ? `${project}: ${why}` : why, num(last["duration"])));
      }
    }
    for (const child of list(suite["suites"]).map(rec)) walk(child, [...path, text(child["title"]) ?? ""], here);
  };
  for (const s of list(root["suites"]).map(rec)) walk(s, [], undefined);
  return out;
}

const PLAIN: Record<string, ParsedResult["outcome"]> = { passed: "passed", pass: "passed", ok: "passed", failed: "failed", fail: "failed", errored: "errored", error: "errored", skipped: "skipped", skip: "skipped" };

/** The shape any script can write, which is how an eval reports: `{ "tests": [ { "title", "file", "outcome", "message", "ms" } ] }`. */
function parsePlain(data: unknown): ParsedResult[] {
  const tests = Array.isArray(data) ? data : rec(data)["tests"];
  if (!Array.isArray(tests)) throw new Error('the result does not read as headcanon-json: it has no "tests" list');
  return tests.map(rec).filter((t) => text(t["title"])).map((t) => {
    const outcome = PLAIN[String(t["outcome"]).toLowerCase()];
    const message = text(t["message"]);
    return parsed(text(t["title"])!, outcome ?? "errored", text(t["file"]), outcome ? message : `unknown outcome "${String(t["outcome"])}"${message ? `: ${message}` : ""}`, num(t["ms"]));
  });
}

/** Read a runner's result. Throws when the text is not a result of that format at all; a result with no test is an empty list. */
export function parseResults(format: RunnerFormat, body: string): ParsedResult[] {
  const t = body.replace(/^\uFEFF/, "");
  if (format === "junit") return parseJunit(t);
  if (format === "vitest-json") return parseVitest(jsonIn(t, format));
  if (format === "playwright-json") return parsePlaywright(jsonIn(t, format));
  if (format === "headcanon-json") return parsePlain(jsonIn(t, format));
  throw new Error(`unknown result format "${String(format)}"`);
}

// ---- running ----

const EXT: Record<RunnerFormat, string> = { junit: ".xml", "vitest-json": ".json", "playwright-json": ".json", "headcanon-json": ".json" };
const DEFAULT_TIMEOUT_SEC = 900;
// cmd.exe refuses a line above 8191 characters; the files are split over several calls before that
const COMMAND_LIMIT = process.platform === "win32" ? 7000 : 100_000;

/**
 * Runs one command through the shell from a process of its own, so that a runner that never returns is ended with
 * everything it started. Killing only the shell would leave its children holding the run open.
 */
const SUPERVISOR = [
  'const { spawn, spawnSync } = require("node:child_process");',
  'const { openSync } = require("node:fs");',
  "const [command, cwd, ms, outLog, errLog] = process.argv.slice(1);",
  "let timedOut = false, said = false, timer;",
  "const say = (exit, error) => { if (said) return; said = true; clearTimeout(timer); process.stdout.write(JSON.stringify({ exit, timedOut, error })); };",
  'const child = spawn(command, { shell: true, cwd, stdio: ["ignore", openSync(outLog, "w"), openSync(errLog, "w")], windowsHide: true, detached: process.platform !== "win32" });',
  "timer = setTimeout(() => {",
  "  timedOut = true;",
  '  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });',
  '  else { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } }',
  "}, Number(ms));",
  'child.on("error", (e) => say(null, e.message));',
  'child.on("exit", (code) => say(code, undefined));',
].join("\n");

function shell(command: string, cwd: string, timeoutMs: number, outLog: string, errLog: string): { exit: number | null; timedOut: boolean; error?: string } {
  const r = spawnSync(process.execPath, ["-e", SUPERVISOR, "--", command, cwd, String(timeoutMs), outLog, errLog], { encoding: "utf8", windowsHide: true, timeout: timeoutMs + 60_000 });
  try {
    const said = JSON.parse(r.stdout) as { exit: number | null; timedOut: boolean; error?: string };
    return { exit: said.timedOut ? null : said.exit, timedOut: said.timedOut, ...(said.error ? { error: said.error } : {}) };
  } catch { return { exit: null, timedOut: false, error: `the command could not be started${r.error ? `: ${r.error.message}` : r.stderr ? `: ${r.stderr.trim().slice(-300)}` : ""}` }; }
}

/** One argument as the platform's shell takes it whole: a path with a space, a pattern with a bar. */
const quote = (v: string): string => (process.platform === "win32" ? `"${v}"` : `'${v.split("'").join("'\\''")}'`);

/** Put `value` where `{key}` stands; each part is quoted for the shell unless the command's author already quoted the placeholder. */
function fill(command: string, key: string, value: string[]): string {
  return command.replace(new RegExp(`(["']?)\\{${key}\\}(["']?)`, "g"), (_whole, a: string, b: string) => (a && a === b ? `${a}${value.join(" ")}${b}` : `${a}${value.map(quote).join(" ")}${b}`));
}

function commandFor(runner: Runner, repo: string, cwd: string, files: string[], out: string, titles: string): string {
  const here = (f: string) => posix(relative(cwd, join(repo, f))) || ".";
  return fill(fill(fill(runner.command, "files", files.map(here)), "out", [out]), "titles", [titles]);
}

/** A folder for result files that is never inside the work tree. */
function scratchRoot(repo: string, gitDir: string | undefined): string {
  const inside = (p: string) => { const r = relative(repo, p); return !r.startsWith("..") && !isAbsolute(r); };
  if (!inside(tmpdir())) return tmpdir();
  if (gitDir && !inside(gitDir)) return gitDir;
  return dirname(resolve(repo));
}

const tail = (file: string): string => { try { return readFileSync(file, "utf8").trim().slice(-400); } catch { return ""; } };
const readOr = (file: string): string => { try { return readFileSync(file, "utf8"); } catch { return ""; } };

/** What the runner wrote at `{out}`: one file, or every file of a folder it made there, as some runners write one report per class. */
function writtenAt(out: string): string[] {
  try {
    if (!statSync(out).isDirectory()) return [readOr(out)].filter((s) => s.trim());
    return (readdirSync(out, { recursive: true }) as string[]).sort().map((f) => join(out, f)).filter((f) => statSync(f).isFile()).map(readOr).filter((s) => s.trim());
  } catch { return []; }
}

function runRunner(repo: string, gitDir: string | undefined, name: string, runner: Runner, tests: TestEntry[], titles: string): { run: TestResults["runs"][number]; parsed: ParsedResult[] } {
  const started = Date.now();
  const cwd = resolve(repo, runner.cwd ?? ".");
  if (!existsSync(cwd)) return { run: { runner: name, exit: null, ms: 0, error: `the runner's folder ${runner.cwd} is not in the repository` }, parsed: [] };
  const files = [...new Set(tests.map((t) => t.file))];
  const sec = runner.timeoutSec ?? DEFAULT_TIMEOUT_SEC;
  const errors: string[] = [];
  const found: ParsedResult[] = [];
  let exit: number | null = 0;
  const before = dirtyFiles(repo);
  const scratch = mkdtempSync(join(scratchRoot(repo, gitDir), "headcanon-run-"));
  try {
    const run = (batch: string[], n: number): number => {
      const out = join(scratch, `result-${n}${EXT[runner.format]}`), outLog = join(scratch, `out-${n}.log`), errLog = join(scratch, `err-${n}.log`);
      const command = commandFor(runner, repo, cwd, batch, out, titles);
      if (command.length > COMMAND_LIMIT && batch.length > 1) { const half = Math.ceil(batch.length / 2); return run(batch.slice(half), run(batch.slice(0, half), n)); }
      const done = shell(command, cwd, sec * 1000, outLog, errLog);
      if (done.timedOut) errors.push(`the runner did not return within ${sec} seconds and was stopped`);
      else if (done.error) errors.push(done.error);
      if (exit !== null && done.exit !== 0) exit = exit === 0 || done.exit === null ? done.exit : exit;
      // the result at {out} when the command took it, else what the runner printed
      const written = writtenAt(out);
      if (!written.length) written.push(readOr(outLog));
      try { found.push(...written.flatMap((w) => parseResults(runner.format, w))); }
      catch (e) { if (!done.timedOut && !done.error) errors.push(`${written[0]!.trim() ? errorText(e) : "the runner wrote no result"} (exit ${done.exit})${tail(errLog) || tail(outLog) ? `: ${tail(errLog) || tail(outLog)}` : ""}`); }
      return n + 1;
    };
    run(files, 0);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
  const changed = changedBetween(before, dirtyFiles(repo));
  if (changed.length) errors.push(`the runner left the repository changed: ${changed.slice(0, 20).join(", ")}${changed.length > 20 ? ` and ${changed.length - 20} more` : ""}`);
  return { run: { runner: name, exit, ms: Date.now() - started, ...(errors.length ? { error: errors.join("; ") } : {}) }, parsed: found };
}

/** Why a test is not run at all, or undefined when it can run. */
function heldBack(t: TestEntry, node: ReqNode | undefined, repo: string): { outcome: Outcome; message: string } | undefined {
  if (!node) return { outcome: "stale", message: "Its node is no longer in the canon." };
  if (pinOf(node) !== t.pin) return { outcome: "stale", message: `${node.id} was reworded after this test was written. The test is written again before it runs.` };
  const now = fingerprintOf(repo, t.file);
  if (!now) return { outcome: "missing", message: `The test file ${t.file} is gone.` };
  if (t.fingerprint && now !== t.fingerprint) return { outcome: "changed", message: `The test file ${t.file} changed after the test was accepted.` };
  return undefined;
}

const loose = (s: string): string => squash(s.replace(/\s*[>›]\s*/g, " "));
const sameFile = (a: string, b: string): boolean => { const x = posix(a).toLowerCase().replace(/^\.\//, ""), y = posix(b).toLowerCase().replace(/^\.\//, ""); return x === y || x.endsWith(`/${y}`) || y.endsWith(`/${x}`); };
const RANK: Record<ParsedResult["outcome"], number> = { failed: 3, errored: 2, passed: 1, skipped: 0 };

/**
 * Give each test what the runner said of it. A result belongs to the node its title tags; among several tests of
 * one node, to the one whose title it carries. Several results for one test (one per project, one per case under a
 * tagged group) count as their worst. A test with no result whose file itself failed to load is errored with that reason.
 */
function matchResults(tests: TestEntry[], found: ParsedResult[], repo: string): Map<TestEntry, ParsedResult> {
  const got = new Map<TestEntry, ParsedResult[]>();
  for (const p of found) for (const uid of new Set(uidsIn(p.title))) {
    const mine = tests.filter((t) => t.node === uid);
    const named = mine.filter((t) => loose(p.title).includes(loose(t.title))).sort((a, b) => b.title.length - a.title.length);
    const to = named[0] ?? (mine.length === 1 ? mine[0] : undefined);
    if (to) got.set(to, [...(got.get(to) ?? []), p]);
  }
  const out = new Map<TestEntry, ParsedResult>();
  for (const [t, all] of got) {
    const worst = all.reduce((a, b) => (RANK[b.outcome] > RANK[a.outcome] ? b : a));
    const timed = all.filter((p) => p.ms !== undefined);
    out.set(t, { ...worst, ...(timed.length ? { ms: timed.reduce((s, p) => s + p.ms!, 0) } : {}) });
  }
  const broken = found.filter((p) => !uidsIn(p.title).length && RANK[p.outcome] >= RANK.errored);
  for (const t of tests) {
    if (out.has(t)) continue;
    const file = broken.find((p) => sameFile(p.title, join(repo, t.file)));
    if (file) out.set(t, { title: t.title, outcome: "errored", message: `The test file did not load${file.message ? `: ${file.message}` : "."}` });
  }
  return out;
}

const keyOf = (r: { node: string; file: string; title: string }): string => `${r.node}\n${r.file}\n${r.title}`;

/**
 * Run the accepted tests (with `all`, the proposed ones too) through their runners, one runner at a time, and
 * store what they said in `<git dir>/headcanon/results.json`. A run of some nodes or kinds keeps the stored results
 * of the others, each marked with the tree it was measured on when that is no longer this one.
 */
export function runTests(canonDir: string, opts: { nodes?: string[]; kinds?: TestKind[]; all?: boolean } = {}): TestResults {
  const dir = resolve(canonDir);
  const repo = repoOf(dir), gitDir = gitDirOf(dir);
  const canon = loadCanon(dir), m = loadManifest(dir), nodes = byUid(canon);
  const chosen = m.tests.filter((t) => (t.status === "accepted" || (opts.all === true && t.status === "proposed")) && (!opts.nodes || opts.nodes.includes(t.node)) && (!opts.kinds?.length || opts.kinds.includes(t.kind)));
  const fresh = new Map<TestEntry, TestResult>();
  const base = (t: TestEntry) => ({ node: t.node, title: t.title, file: t.file, runner: t.runner });
  const ready: TestEntry[] = [];
  for (const t of chosen) { const held = heldBack(t, nodes.get(t.node), repo); if (held) fresh.set(t, { ...base(t), ...held }); else ready.push(t); }
  const runs: TestResults["runs"] = [];
  for (const name of [...new Set([...Object.keys(m.runners), ...ready.map((t) => t.runner)])]) {
    const mine = ready.filter((t) => t.runner === name);
    if (!mine.length) continue;
    const runner = m.runners[name];
    const uids = [...new Set(mine.map((t) => t.node))];
    const whole = m.tests.filter((t) => t.runner === name).every((t) => mine.includes(t));
    const titles = whole || uids.length > 250 ? "hc:" : uids.length === 1 ? `hc:${uids[0]!}` : `hc:(${uids.join("|")})`;
    const { run, parsed: found } = runner ? runRunner(repo, gitDir, name, runner, mine, titles) : { run: { runner: name, exit: null, ms: 0, error: `no runner named ${name} is recorded; record it with: headcanon tests runner ${name} '<JSON>'` }, parsed: [] };
    runs.push(run);
    const said = matchResults(mine, found, repo);
    for (const t of mine) {
      const r = said.get(t);
      fresh.set(t, r ? { ...base(t), outcome: r.outcome, ...(r.message ? { message: r.message } : {}), ...(r.ms !== undefined ? { ms: r.ms } : {}) } : { ...base(t), outcome: "not-run", message: run.error ? `The runner did not report it: ${run.error}` : "The runner reported nothing under this title." });
    }
  }
  const tree = treeDigest(repo);
  const before = gitDir ? loadResults(gitDir) : undefined;
  const kept = new Map((before?.results ?? []).map((r) => [keyOf(r), r.tree || before!.tree === tree ? r : { ...r, tree: before!.tree }] as const));
  const results: TestResult[] = [];
  for (const t of m.tests) { const r = fresh.get(t) ?? (t.status === "rejected" ? undefined : kept.get(keyOf(t))); if (r) results.push(r); }
  const all: TestResults = { at: new Date().toISOString(), tree, results, runs };
  if (gitDir) writeWhole(resultsPath(gitDir), JSON.stringify(all, null, 1) + "\n");
  return all;
}

// ---- saying it ----

const WORDS: Record<Outcome, string> = { passed: "passed", failed: "failed", errored: "errored", skipped: "skipped", missing: "missing", changed: "changed", stale: "stale", "not-run": "not run" };
const ORDER: readonly Outcome[] = ["passed", "failed", "errored", "missing", "changed", "stale", "not-run", "skipped"];

/** The results in plain lines: the counts, then each node, with every test that did not pass and what it said. */
export function describeResults(r: TestResults, canon: Canon): string {
  if (!r.results.length && !r.runs.length) return "No recorded test ran.";
  const nodes = byUid(canon);
  const lines = [`${r.results.length} test${r.results.length === 1 ? "" : "s"}, measured ${r.at}: ${ORDER.map((o) => [o, r.results.filter((x) => x.outcome === o).length] as const).filter(([, n]) => n).map(([o, n]) => `${n} ${WORDS[o]}`).join(", ") || "none"}.`];
  for (const uid of [...new Set(r.results.map((x) => x.node))]) {
    const mine = r.results.filter((x) => x.node === uid), node = nodes.get(uid);
    const name = node ? `${node.id} ${node.title}` : `${tagOf(uid)} (no longer in the canon)`;
    const rest = mine.filter((x) => x.outcome !== "passed");
    if (!rest.length) { lines.push(`${name}: ${mine.length} passed`); continue; }
    lines.push(`${name}:${mine.length > rest.length ? ` ${mine.length - rest.length} passed` : ""}`);
    for (const x of rest) {
      lines.push(`  ${WORDS[x.outcome]}: ${x.title} (${x.file})${x.tree ? ", measured before the last change" : ""}`);
      for (const l of (x.message ?? "").split(/\r?\n/).filter((s) => s.trim()).slice(0, 8)) lines.push(`    ${l}`);
    }
  }
  for (const run of r.runs) if (run.error) lines.push(`Runner ${run.runner}: ${run.error}`);
  return lines.join("\n");
}

// ---- the commands ----

function flagsOf(rest: string[], valued: string[]): { pos: string[]; opt: Record<string, string[]> } {
  const pos: string[] = [], opt: Record<string, string[]> = {};
  for (let i = 0; i < rest.length; i++) {
    const x = rest[i]!;
    if (!x.startsWith("--") || x === "--") { pos.push(x); continue; }
    const eq = x.indexOf("="), key = x.slice(2, eq < 0 ? undefined : eq);
    const value = eq >= 0 ? x.slice(eq + 1) : valued.includes(key) ? rest[++i] ?? "" : "";
    (opt[key] ??= []).push(value);
  }
  return { pos, opt };
}

/** JSON given on the line, in a file as `@file`, or on stdin as `-`, which spares a shell its quoting. */
function jsonArg(raw: string | undefined, ctx: CliCtx): unknown {
  if (!raw) throw new Error("the JSON is missing: give it on the line, as @<file>, or as - to read stdin");
  const body = raw === "-" ? ctx.stdin() : raw.startsWith("@") ? readFileSync(resolve(raw.slice(1)), "utf8") : raw;
  try { return JSON.parse(body.replace(/^\uFEFF/, "")); } catch (e) { throw new Error(`not valid JSON: ${errorText(e)}`); }
}

const USAGE = `usage: headcanon tests <command>
  runner <name> '<JSON>'     record how a kind of test runs: {"kind","command","format","cwd"?,"timeoutSec"?}; with no JSON, list the runners
  add @file|'<JSON>'|-       record tests as proposed: [{"node","runner","kind","file","title","description","journey"?}]
  review <uid|id> pass|fail [--note "<text>"]
  list [<id>] [--json]       the recorded tests, with what each last said
  run [<id>...] [--kind k] [--all] [--run <run id>] [--json]
  results [--json]           what the last run said
`;

// runs.ts is read only when a command names a run, so recording and running tests never wait on it
const RUNS_MODULE = "./runs.js";
type RunsModule = { loadRun: (gitDir: string, id: string) => { slices: Array<{ owes: string[] }>; firstRun?: { passing: string[] } } | undefined };

/** The nodes a run answers for: what its slices owe, and every node whose test passed in its first run, so a regression shows. */
async function nodesOfRun(gitDir: string, runId: string, m: TestManifest): Promise<string[]> {
  const { loadRun } = (await import(/* @vite-ignore */ RUNS_MODULE)) as RunsModule;
  const run = loadRun(gitDir, runId);
  if (!run) throw new Error(`no run ${runId} is recorded`);
  const passing = new Set(run.firstRun?.passing ?? []);
  return [...new Set([...run.slices.flatMap((s) => s.owes), ...m.tests.filter((t) => passing.has(t.title)).map((t) => t.node)])];
}

export async function testsCli(rest: string[], ctx: CliCtx): Promise<number> {
  const [cmd, ...more] = rest;
  const { pos, opt } = flagsOf(more, ["note", "kind", "run", "by"]);
  const json = ctx.json || opt["json"] !== undefined;
  const by = opt["by"]?.[0] || ctx.by;
  const say = (v: unknown, words: string) => ctx.out(json ? JSON.stringify(v, null, 2) + "\n" : words + "\n");
  try {
    const canon = loadCanon(ctx.canonDir);
    const nodes = byUid(canon);
    /** A node named by id or by uid, as its uid. */
    const uidOf = (name: string): string => { const uid = canon.nodes[name]?.uid ?? (nodes.has(name) ? name : undefined); if (!uid) throw new Error(`${name} is not a node with a uid in the canon`); return uid; };
    /** A node named by id or uid, with everything below it, as uids. */
    const below = (name: string): string[] => { const id = canon.nodes[name]?.id ?? nodes.get(name)?.id; if (!id) throw new Error(`${name} is not in the canon`); return [id, ...descendants(canon, id)].map((x) => canon.nodes[x]?.uid).filter((u): u is string => Boolean(u)); };
    const label = (uid: string): string => nodes.get(uid)?.id ?? tagOf(uid);
    switch (cmd) {
      case "runner": {
        if (!pos[0] || !pos[1]) {
          const runners = loadManifest(ctx.canonDir).runners;
          say(runners, Object.entries(runners).map(([name, r]) => `${name} (${r.kind}, ${r.format}${r.cwd ? `, in ${r.cwd}` : ""}): ${r.command}`).join("\n") || "No runner is recorded.");
          return 0;
        }
        setRunner(ctx.canonDir, pos[0], jsonArg(pos[1], ctx) as Runner);
        say({ ok: true, runner: pos[0] }, `Runner ${pos[0]} is recorded.`);
        return 0;
      }
      case "add": {
        const body = jsonArg(pos[0], ctx);
        const entries = (Array.isArray(body) ? body : Array.isArray(rec(body)["tests"]) ? rec(body)["tests"] : [body]) as Parameters<typeof addTests>[1];
        const r = addTests(ctx.canonDir, entries, by);
        say(r, [`${r.added} test${r.added === 1 ? "" : "s"} recorded as proposed.`, ...r.errors.map((e) => `Refused: ${e}`)].join("\n"));
        return r.errors.length ? 1 : 0;
      }
      case "review": {
        const verdict = pos[1], note = opt["note"]?.[0];
        if (!pos[0] || (verdict !== "pass" && verdict !== "fail")) { ctx.err(USAGE); return 2; }
        if (verdict === "fail" && !note) throw new Error('a fail needs --note "<what fails and what would pass>"');
        const uid = uidOf(pos[0]);
        const n = reviewTests(ctx.canonDir, uid, verdict, note);
        say({ ok: n > 0, node: uid, changed: n }, n ? `${n} test${n === 1 ? "" : "s"} of ${label(uid)} ${verdict === "pass" ? "accepted" : "rejected"}.` : `${label(uid)} has no proposed test whose file exists.`);
        return n ? 0 : 1;
      }
      case "list": {
        const m = loadManifest(ctx.canonDir);
        const only = pos[0] ? new Set(below(pos[0])) : undefined;
        const last = new Map((ctx.gitDir ? loadResults(ctx.gitDir)?.results ?? [] : []).map((r) => [keyOf(r), r] as const));
        const rows = m.tests.filter((t) => !only || only.has(t.node)).map((t) => ({ ...t, id: label(t.node), outcome: last.get(keyOf(t))?.outcome }));
        say({ runners: m.runners, tests: rows }, rows.map((t) => `${t.id} ${t.kind}, ${t.status}${t.outcome ? `, ${WORDS[t.outcome]}` : ""}: ${t.description} (${t.file})${t.review ? `\n  review: ${t.review}` : ""}`).join("\n") || "No test is recorded.");
        return 0;
      }
      case "run": {
        const kinds = (opt["kind"] ?? []).flatMap((k) => k.split(",")).filter(Boolean);
        const unknown = kinds.find((k) => !(TEST_KINDS as readonly string[]).includes(k));
        if (unknown) throw new Error(`--kind is one of ${TEST_KINDS.join(", ")}; got ${unknown}`);
        const runId = opt["run"]?.[0];
        if (runId && !ctx.gitDir) throw new Error("a run lives in a git repository; this folder has none");
        const named = pos.length ? pos.flatMap(below) : undefined;
        const owed = runId ? await nodesOfRun(ctx.gitDir!, runId, loadManifest(ctx.canonDir)) : undefined;
        const nodes = named && owed ? named.filter((u) => owed.includes(u)) : named ?? owed;
        const r = runTests(ctx.canonDir, { ...(nodes ? { nodes: [...new Set(nodes)] } : {}), ...(kinds.length ? { kinds: kinds as TestKind[] } : {}), ...(opt["all"] ? { all: true } : {}) });
        say(r, describeResults(r, loadCanon(ctx.canonDir)));
        return r.runs.some((x) => x.error) || r.results.some((x) => (!nodes || nodes.includes(x.node)) && !x.tree && (isFailing(x.outcome) || x.outcome === "not-run")) ? 1 : 0;
      }
      case "results": {
        const r = ctx.gitDir ? loadResults(ctx.gitDir) : undefined;
        say(r ?? null, r ? describeResults(r, canon) : "No test has run yet.");
        return 0;
      }
      default:
        ctx.err(USAGE);
        return 2;
    }
  } catch (e) {
    ctx.err(`tests${cmd ? ` ${cmd}` : ""}: ${errorText(e)}\n`);
    return 1;
  }
}
