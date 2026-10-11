import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseFrontMatter, str } from "./parse.js";

/**
 * The semantic review of a canon change (REQ-8.5.4) and the uptake of child changes by their
 * parents (REQ-8.5.5). A model, the verifier agent, reads the staged canon diff and reports
 * contradictions, reiterations, drift and uptake; the human resolves each finding; the result is
 * stored as a record pinned to the hash of the staged diff. The commit-msg check refuses a canon
 * commit whose diff has no resolved record, or whose record is silent about a parent the change
 * left untouched.
 */

export const REVIEW_KINDS = ["contradiction", "reiteration", "drift", "uptake"] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];

export interface ReviewFinding {
  kind: ReviewKind;
  /** The entries involved: node, principle or term IDs, e.g. ["REQ-1.4", "REQ-2.1"] or ["REQ-1.4", "PRN-2"]. */
  nodes: string[];
  /** Both texts, quoted, and why they collide. */
  summary: string;
  /** What the human decided. Required before the commit. */
  resolution?: string;
}

/** A parent the change leaves untouched, and why it still describes its children. */
export interface ParentUptake {
  id: string;
  reason: string;
}

export interface ReviewRecord {
  hash: string;
  at: string;
  reviewer: string;
  findings: ReviewFinding[];
  parents?: ParentUptake[];
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

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

export function hashDiff(diff: string): string {
  return createHash("sha256").update(diff.replace(/\r\n/g, "\n")).digest("hex").slice(0, 12);
}

/** The staged change under the canon path, hashed so a review can be pinned to it. */
export function stagedIntentDiff(repoDir: string, canonPath = "canon", minLines = 5): IntentDiff {
  let diff = "";
  let numstat = "";
  let nameStatus = "";
  const entries: StagedEntry[] = [];
  try {
    diff = git(repoDir, ["diff", "--cached", "--", canonPath]);
    numstat = git(repoDir, ["diff", "--cached", "--numstat", "--", canonPath]);
    nameStatus = git(repoDir, ["diff", "--cached", "--name-status", "--", canonPath]);
    for (const line of nameStatus.split(/\r?\n/)) {
      const [status, path] = line.split("\t");
      if (!path || (status !== "A" && status !== "M" && status !== "D")) continue;
      let id: string | undefined;
      let parent: string | undefined;
      try {
        const text = git(repoDir, ["show", status === "D" ? `HEAD:${path}` : `:${path}`]);
        const { data } = parseFrontMatter(text);
        id = str(data["id"])?.trim();
        parent = str(data["parent"])?.trim();
      } catch {
        /* unreadable staged content; treated as a file without an id */
      }
      entries.push({ status, path, id, parent });
    }
  } catch {
    /* not a repository: nothing is staged */
  }
  return intentDiffFrom(diff, numstat, nameStatus, minLines, entries);
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
      if (!(REVIEW_KINDS as readonly string[]).includes(String(f.kind))) errors.push(`${at}: kind must be contradiction, reiteration, drift or uptake`);
      if (!Array.isArray(f.nodes) || f.nodes.length === 0) errors.push(`${at}: names no entries`);
      if (!f.summary || typeof f.summary !== "string") errors.push(`${at}: has no summary`);
      if (!f.resolution || typeof f.resolution !== "string" || f.resolution.trim().length < 8) errors.push(`${at} (${f.kind} on ${(f.nodes ?? []).join(", ")}): has no resolution; the human decides every finding before the commit`);
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
