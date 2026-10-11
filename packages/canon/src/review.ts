import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * The semantic review of a canon change (REQ-8.5.4). A model, the verifier agent, reads the
 * staged canon diff and reports contradictions, reiterations and drift; the human resolves each
 * finding; the result is stored as a record pinned to the hash of the staged diff, and the
 * commit-msg check refuses a canon commit whose diff has no resolved record.
 */

export const REVIEW_KINDS = ["contradiction", "reiteration", "drift"] as const;
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

export interface ReviewRecord {
  hash: string;
  at: string;
  reviewer: string;
  findings: ReviewFinding[];
}

export interface IntentDiff {
  hash: string;
  files: string[];
  newFiles: string[];
  changedLines: number;
  /** A review is required for any new canon file, or for five or more changed lines. */
  required: boolean;
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
  try {
    diff = git(repoDir, ["diff", "--cached", "--", canonPath]);
    numstat = git(repoDir, ["diff", "--cached", "--numstat", "--", canonPath]);
    nameStatus = git(repoDir, ["diff", "--cached", "--name-status", "--", canonPath]);
  } catch {
    /* not a repository: nothing is staged */
  }
  return intentDiffFrom(diff, numstat, nameStatus, minLines);
}

/** Pure: assemble the diff summary from git's outputs. */
export function intentDiffFrom(diff: string, numstat: string, nameStatus: string, minLines = 5): IntentDiff {
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
  };
}

/** Errors that make a record unusable for the given diff hash; empty when it is valid. */
export function validateReviewRecord(rec: unknown, expectedHash: string): string[] {
  const errors: string[] = [];
  if (!rec || typeof rec !== "object") return ["the review record is not an object"];
  const r = rec as Partial<ReviewRecord>;
  if (r.hash !== expectedHash) errors.push(`the record is for diff ${r.hash ?? "(none)"}, but the staged canon diff is ${expectedHash}; the canon changed after the review, so review it again`);
  if (!r.reviewer || typeof r.reviewer !== "string") errors.push("the record names no reviewer");
  if (!Array.isArray(r.findings)) {
    errors.push("the record has no findings array (use [] when the review found nothing)");
    return errors;
  }
  r.findings.forEach((f, i) => {
    const at = `finding ${i + 1}`;
    if (!f || typeof f !== "object") return errors.push(`${at} is not an object`);
    if (!(REVIEW_KINDS as readonly string[]).includes(String(f.kind))) errors.push(`${at}: kind must be contradiction, reiteration or drift`);
    if (!Array.isArray(f.nodes) || f.nodes.length === 0) errors.push(`${at}: names no entries`);
    if (!f.summary || typeof f.summary !== "string") errors.push(`${at}: has no summary`);
    if (!f.resolution || typeof f.resolution !== "string" || f.resolution.trim().length < 8) errors.push(`${at} (${f.kind} on ${(f.nodes ?? []).join(", ")}): has no resolution; the human decides every finding before the commit`);
  });
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
