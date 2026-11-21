import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readOps, type OpRecord } from "./ops.js";
import { parseFrontMatter, str } from "./parse.js";

/**
 * The semantic review of a canon change (REQ-8.5.4) and the uptake of child changes by their
 * parents (REQ-8.5.5). A model, the reviewer agent, reads the staged canon diff and reports
 * contradictions, reiterations, drift and uptake; the user resolves each finding; the result is
 * stored as a record pinned to the hash of the staged diff. The commit-msg check refuses a canon
 * commit whose diff has no resolved record, or whose record is silent about a parent the change
 * left untouched.
 *
 * A canon HeadCanon commits itself (the adoption's draft, a slice's canon changes) was reviewed set
 * by set while it was written, each verdict in the operations log. `adoptionReviewRecord` writes the
 * record from those verdicts and says of every set in the change what the log says: passed, failed
 * with its findings, changed after it passed, or never reviewed.
 */

export const REVIEW_KINDS = ["contradiction", "reiteration", "drift", "uptake", "quality", "unreviewed"] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];

export interface ReviewFinding {
  kind: ReviewKind;
  /** The entries involved: node, principle or term IDs, e.g. ["REQ-1.4", "REQ-2.1"] or ["REQ-1.4", "PRN-2"]. */
  nodes: string[];
  /** Both texts, quoted, and why they collide. */
  summary: string;
  /** What the user decided, or for a record made from adoption's reviews, what was left as it is. Required before the commit. */
  resolution?: string;
}

/** A parent the change leaves untouched, and why it still describes its children. */
export interface ParentUptake {
  id: string;
  reason: string;
}

/** How many sets of children the change holds, by what the operations log says of each. */
export interface AdoptionSets {
  passed: number;
  failed: number;
  /** Passed, then changed by operations no review followed. */
  changed: number;
  unreviewed: number;
}

export interface ReviewRecord {
  hash: string;
  at: string;
  reviewer: string;
  findings: ReviewFinding[];
  parents?: ParentUptake[];
  /** Present when the record was made from adoption's reviews in the operations log. */
  adoption?: AdoptionSets;
}

export interface StagedEntry {
  status: "A" | "M" | "D";
  path: string;
  id: string | undefined;
  parent: string | undefined;
}

export interface IntentDiff {
  hash: string;
  files: string[];
  newFiles: string[];
  changedLines: number;
  /** A review is required for any new canon file, or for five or more changed lines. */
  required: boolean;
  /** Parents of changed nodes whose own file is not part of the change. */
  affectedParents: string[];
}

/** A canon diff is larger than Node's default buffer of 1 MiB once a whole canon is staged. */
const MAX_BUFFER = 1024 * 1024 * 1024;

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: MAX_BUFFER });
}

export function hashDiff(diff: string): string {
  return createHash("sha256").update(diff.replace(/\r\n/g, "\n")).digest("hex").slice(0, 12);
}

/** The canon's entries as a pathspec: its Markdown files. A record kept in the folder, like tests.json, is no entry. */
export function entryPathspec(canonPath: string): string {
  return `:(glob,icase)${canonPath.replace(/\\/g, "/").replace(/\/+$/, "").replace(/[*?[\]\\]/g, "\\$&")}/**/*.md`;
}

/** The staged texts of many paths in one git process; a path git cannot read is left out. */
function stagedTexts(repoDir: string, names: string[]): Map<string, string> {
  const out = new Map<string, string>();
  if (!names.length) return out;
  const raw = execFileSync("git", ["cat-file", "--batch"], { cwd: repoDir, input: names.join("\n") + "\n", stdio: ["pipe", "pipe", "ignore"], maxBuffer: MAX_BUFFER });
  let at = 0;
  for (const name of names) {
    const eol = raw.indexOf(10, at);
    if (eol < 0) break;
    const header = raw.subarray(at, eol).toString("utf8");
    at = eol + 1;
    const size = / (\d+)$/.exec(header);
    if (!size || / (?:missing|ambiguous)$/.test(header)) continue;
    const n = Number(size[1]);
    out.set(name, raw.subarray(at, at + n).toString("utf8"));
    at += n + 1;
  }
  return out;
}

/** Pure: the entries of a `--name-status` listing, each with the id and parent its front matter states. */
function entriesFrom(nameStatus: string, textOf: (status: StagedEntry["status"], path: string) => string | undefined): StagedEntry[] {
  const entries: StagedEntry[] = [];
  for (const line of nameStatus.split(/\r?\n/)) {
    const [status, path] = line.split("\t");
    if (!path || (status !== "A" && status !== "M" && status !== "D")) continue;
    let id: string | undefined;
    let parent: string | undefined;
    try {
      const text = textOf(status, path);
      if (text !== undefined) {
        const { data } = parseFrontMatter(text);
        id = str(data["id"])?.trim();
        parent = str(data["parent"])?.trim();
      }
    } catch {
      /* unreadable staged content; treated as a file without an id */
    }
    entries.push({ status, path, id, parent });
  }
  return entries;
}

interface Staged { diff: string; numstat: string; nameStatus: string; entries: StagedEntry[] }

function readStaged(repoDir: string, canonPath: string): Staged {
  const spec = entryPathspec(canonPath);
  try {
    // a move is a file removed and a file added, so each side is read with its own id and parent
    const diff = git(repoDir, ["diff", "--cached", "--no-renames", "--", spec]);
    const numstat = git(repoDir, ["diff", "--cached", "--no-renames", "--numstat", "--", spec]);
    const nameStatus = git(repoDir, ["diff", "--cached", "--no-renames", "--name-status", "--", spec]);
    const objectOf = (status: string, path: string) => (status === "D" ? `HEAD:${path}` : `:${path}`);
    const names = nameStatus.split(/\r?\n/).map((l) => l.split("\t")).filter((c) => c[1]).map((c) => objectOf(c[0]!, c[1]!));
    let texts: Map<string, string> | undefined;
    try { texts = stagedTexts(repoDir, names); } catch { texts = undefined; }
    const entries = entriesFrom(nameStatus, (status, path) => (texts ? texts.get(objectOf(status, path)) : git(repoDir, ["show", objectOf(status, path)])));
    return { diff, numstat, nameStatus, entries };
  } catch {
    /* not a repository: nothing is staged */
    return { diff: "", numstat: "", nameStatus: "", entries: [] };
  }
}

/** The staged canon entries: each added, modified or removed Markdown file under the canon path, with its id and parent. */
export function stagedCanonEntries(repoDir: string, canonPath = "canon"): StagedEntry[] {
  return readStaged(repoDir, canonPath).entries;
}

/** The staged change to the entries under the canon path, hashed so a review can be pinned to it. */
export function stagedIntentDiff(repoDir: string, canonPath = "canon", minLines = 5): IntentDiff {
  const s = readStaged(repoDir, canonPath);
  return intentDiffFrom(s.diff, s.numstat, s.nameStatus, minLines, s.entries);
}

/** Pure: assemble the diff summary from git's outputs and the staged entries. */
export function intentDiffFrom(diff: string, numstat: string, nameStatus: string, minLines = 5, entries: StagedEntry[] = []): IntentDiff {
  const files: string[] = [];
  let changedLines = 0;
  for (const line of numstat.split(/\r?\n/)) {
    const [a, d, path] = line.split("\t");
    if (!path) continue;
    files.push(path);
    changedLines += (Number(a) || 0) + (Number(d) || 0);
  }
  const newFiles: string[] = [];
  for (const line of nameStatus.split(/\r?\n/)) {
    const [status, path] = line.split("\t");
    if (status === "A" && path) newFiles.push(path);
  }
  return {
    hash: hashDiff(diff),
    files,
    newFiles,
    changedLines,
    required: files.length > 0 && (changedLines >= minLines || newFiles.length > 0),
    affectedParents: affectedParentsFrom(entries),
  };
}

/** Pure: the parents of created, changed or deleted nodes that the change itself does not touch. */
export function affectedParentsFrom(entries: StagedEntry[]): string[] {
  const touched = new Set(entries.map((e) => e.id).filter((id): id is string => Boolean(id)));
  const out = new Set<string>();
  for (const e of entries) if (e.parent && !touched.has(e.parent)) out.add(e.parent);
  return [...out].sort();
}

/** Errors that make a record unusable for the given diff; empty when it is valid. */
export function validateReviewRecord(rec: unknown, diff: Pick<IntentDiff, "hash" | "affectedParents">): string[] {
  const errors: string[] = [];
  if (!rec || typeof rec !== "object") return ["the review record is not an object"];
  const r = rec as Partial<ReviewRecord>;
  if (r.hash !== diff.hash) errors.push(`the record is for diff ${r.hash ?? "(none)"}, but the staged canon diff is ${diff.hash}; the canon changed after the review, so review it again`);
  if (!r.reviewer || typeof r.reviewer !== "string") errors.push("the record names no reviewer");
  if (!Array.isArray(r.findings)) {
    errors.push("the record has no findings array (use [] when the review found nothing)");
  } else {
    r.findings.forEach((f, i) => {
      const at = `finding ${i + 1}`;
      if (!f || typeof f !== "object") return errors.push(`${at} is not an object`);
      if (!(REVIEW_KINDS as readonly string[]).includes(String(f.kind))) errors.push(`${at}: kind must be one of ${REVIEW_KINDS.join(", ")}`);
      if (!Array.isArray(f.nodes) || f.nodes.length === 0) errors.push(`${at}: names no entries`);
      if (!f.summary || typeof f.summary !== "string") errors.push(`${at}: has no summary`);
      if (!f.resolution || typeof f.resolution !== "string" || f.resolution.trim().length < 8) errors.push(`${at} (${f.kind} on ${(f.nodes ?? []).join(", ")}): has no resolution; the user decides every finding before the commit`);
    });
  }
  const parents = Array.isArray(r.parents) ? r.parents : [];
  for (const id of diff.affectedParents) {
    const p = parents.find((x) => x && typeof x === "object" && (x as ParentUptake).id === id) as ParentUptake | undefined;
    if (!p || typeof p.reason !== "string" || p.reason.trim().length < 8)
      errors.push(`${id} is the parent of a changed node and is left unchanged; the record must say under "parents" why it still describes its children (or change it and it leaves this list)`);
  }
  return errors;
}

export function reviewDir(repoDir: string): string {
  const gitDir = git(repoDir, ["rev-parse", "--git-dir"]).trim();
  return join(resolve(repoDir, gitDir), "headcanon", "reviews");
}

export function storeReviewRecord(repoDir: string, rec: ReviewRecord): string {
  const dir = reviewDir(repoDir);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${rec.hash}.json`);
  writeFileSync(path, JSON.stringify(rec, null, 2));
  return path;
}

export function loadReviewRecord(repoDir: string, hash: string): ReviewRecord | undefined {
  try {
    const path = join(reviewDir(repoDir), `${hash}.json`);
    if (!existsSync(path)) return undefined;
    return JSON.parse(readFileSync(path, "utf8")) as ReviewRecord;
  } catch {
    return undefined;
  }
}

/** What the operations log says of one set, the children of `parent`: its last verdict and what was written there since. */
export interface SetReview {
  parent: string;
  verdict: "pass" | "fail";
  at: string;
  by: string | undefined;
  findings: Array<{ test: string; child: string | undefined; text: string }>;
  /** Operations that changed a file of the set after the verdict. */
  opsSince: number;
}

const ROOT = "ROOT";
/** The set a node belongs to is named by its parent; ids mirror the tree, and the top nodes are the premise's set. */
const setOf = (id: string): string => (id.includes(".") ? id.slice(0, id.lastIndexOf(".")) : ROOT);

/** The sets an operation wrote in, by the ids of its request. */
function setsWritten(e: OpRecord): string[] {
  const r = e.request;
  switch (r.op) {
    case "create": return [r.under];
    case "move": return [setOf(r.id), r.under];
    case "merge": return [setOf(r.from), setOf(r.to)];
    case "link":
    case "unlink": return [setOf(r.from)];
    case "move-edge": return [setOf(r.on)];
    case "bind":
    case "unbind":
    case "contest":
    case "reword":
    case "delete":
    case "draft":
    case "note": return [setOf(r.id)];
    default: return [];
  }
}

/** Pure: the last review verdict of every set in the log, oldest entry first, following the ids a move renamed. */
export function setReviews(ops: OpRecord[]): Map<string, SetReview> {
  let sets = new Map<string, SetReview>();
  for (const e of ops) {
    if (!e.ok) continue;
    const r = e.request;
    if (r.op === "review") {
      const findings = (r.findings ?? []).map((f) => {
        const g = f as { check?: string; test?: string; child?: string; text?: string };
        return { test: String(g.test ?? g.check ?? "review"), child: g.child ? String(g.child) : undefined, text: String(g.text ?? "") };
      });
      sets.set(r.id, { parent: r.id, verdict: r.verdict, at: e.at, by: e.by, findings, opsSince: 0 });
      continue;
    }
    if (!e.changes?.length) continue;
    for (const s of new Set(setsWritten(e))) { const hit = sets.get(s); if (hit) hit.opsSince++; }
    if (e.renamed && Object.keys(e.renamed).length) {
      const map = e.renamed;
      sets = new Map([...sets].map(([k, v]) => [map[k] ?? k, { ...v, parent: map[k] ?? k, findings: v.findings.map((f) => ({ ...f, child: f.child && map[f.child] ? map[f.child] : f.child })) }] as const));
    }
  }
  return sets;
}

export interface AdoptionReview {
  record: ReviewRecord;
  sets: AdoptionSets;
  /** The words for the Intent-Review trailer after the hash. */
  outcome: string;
}

const LEFT = "left as written: each entry keeps its state, and a guess waits for the owner's review on the page";
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/**
 * Pure: the review record of a staged canon change, made from the verdicts in the operations log. Nothing is
 * claimed that the log does not hold: a set that failed carries its findings, a set changed after it passed or
 * never reviewed is named as such, and each is resolved as left for the owner, never as decided.
 */
export function adoptionReviewFrom(diff: Pick<IntentDiff, "hash" | "affectedParents">, entries: StagedEntry[], ops: OpRecord[], at = new Date().toISOString()): AdoptionReview {
  const reviews = setReviews(ops);
  const parents = new Set<string>();
  const outside = new Set<string>();
  for (const e of entries) {
    if (e.id?.startsWith("REQ-")) parents.add(e.parent ?? setOf(e.id));
    else outside.add(e.id ?? e.path);
  }
  const statusOf = (p: string): "passed" | "failed" | "changed" | "unreviewed" => {
    const r = reviews.get(p);
    return !r ? "unreviewed" : r.verdict === "fail" ? "failed" : r.opsSince > 0 ? "changed" : "passed";
  };
  const by: Record<ReturnType<typeof statusOf>, string[]> = { passed: [], failed: [], changed: [], unreviewed: [] };
  for (const p of [...parents].sort()) by[statusOf(p)].push(p);

  const findings: ReviewFinding[] = [];
  for (const p of by.failed) {
    const r = reviews.get(p)!;
    const after = r.opsSince > 0 ? `changed by ${plural(r.opsSince, "operation")} after the review and not reviewed again` : "not changed since the review";
    const list = r.findings.length ? r.findings : [{ test: "review", child: undefined, text: "the set failed its review and the verdict lists no finding" }];
    for (const f of list) findings.push({ kind: "quality", nodes: [...new Set([p, ...(f.child ? [f.child] : [])])], summary: `${f.test}: ${f.text}`.trim(), resolution: `${after}; ${LEFT}` });
  }
  if (by.changed.length) findings.push({ kind: "unreviewed", nodes: by.changed, summary: "the children of these nodes passed their review, and operations changed them afterwards with no review following", resolution: LEFT });
  if (by.unreviewed.length) findings.push({ kind: "unreviewed", nodes: by.unreviewed, summary: "the operations log holds no review verdict for the children of these nodes", resolution: LEFT });
  if (outside.size) findings.push({ kind: "unreviewed", nodes: [...outside].sort(), summary: "a review judges the children of one node; these entries (the premise file, journeys, decisions) are in no such set", resolution: LEFT });

  const reason = (p: string): string => {
    const r = reviews.get(p);
    const s = statusOf(p);
    if (s === "passed") return `its children passed the review of ${r!.at.slice(0, 10)}${r!.by ? ` by ${r!.by}` : ""}, and nothing was written among them since`;
    if (s === "changed") return `its children passed the review of ${r!.at.slice(0, 10)} and were changed afterwards; the parent is left as it is, see the findings`;
    if (s === "failed") return `its children failed the review of ${r!.at.slice(0, 10)}; the parent is left as it is, see the findings`;
    return "no review of its children is on record; the parent is left as it is, see the findings";
  };
  const sets: AdoptionSets = { passed: by.passed.length, failed: by.failed.length, changed: by.changed.length, unreviewed: by.unreviewed.length };
  const reviewers = [...new Set([...parents].map((p) => reviews.get(p)?.by).filter((x): x is string => Boolean(x)))].sort();
  const parts = [
    sets.passed ? `${plural(sets.passed, "set")} passed` : "",
    sets.failed ? `${sets.failed} failed` : "",
    sets.changed ? `${sets.changed} changed after passing` : "",
    sets.unreviewed ? `${sets.unreviewed} not reviewed` : "",
    outside.size ? `${plural(outside.size, "entry", "entries")} outside the sets` : "",
  ].filter(Boolean);
  const record: ReviewRecord = {
    hash: diff.hash,
    at,
    reviewer: `headcanon:reviewer, the verdicts in the operations log${reviewers.length ? ` (${reviewers.slice(0, 12).join(", ")}${reviewers.length > 12 ? ", and others" : ""})` : ""}`,
    findings,
    parents: diff.affectedParents.map((id) => ({ id, reason: reason(id) })),
    adoption: sets,
  };
  return { record, sets, outcome: `adoption reviews: ${parts.length ? parts.join(", ") : "nothing to review"}` };
}

/**
 * Writes the review record of the staged canon change from the operations log, so a canon HeadCanon commits
 * itself passes the commit check with what its own reviews found. Undefined when the staged change needs no review.
 */
export function adoptionReviewRecord(repoDir: string, canonPath = "canon", logPath?: string): (AdoptionReview & { diff: IntentDiff; path: string }) | undefined {
  const s = readStaged(repoDir, canonPath);
  const diff = intentDiffFrom(s.diff, s.numstat, s.nameStatus, 5, s.entries);
  if (!diff.required) return undefined;
  const log = logPath ?? join(resolve(repoDir, git(repoDir, ["rev-parse", "--git-dir"]).trim()), "headcanon", "ops.jsonl");
  const made = adoptionReviewFrom(diff, s.entries, readOps(log));
  return { ...made, diff, path: storeReviewRecord(repoDir, made.record) };
}
