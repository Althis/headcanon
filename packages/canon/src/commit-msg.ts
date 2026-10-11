import { execFileSync } from "node:child_process";
import type { IntentDiff, ReviewRecord } from "./review.js";
import type { Canon } from "./types.js";

export const COMMIT_TYPES = ["feat", "fix", "docs", "chore", "refactor", "test", "build", "ci", "perf", "style", "revert"] as const;

export interface CommitCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
  header: string | undefined;
  trailers: Record<string, string[]>;
}

export interface CommitCheckOptions {
  /** Modified watched files whose staged diff only added lines; each needs a Consolidated trailer. */
  appendOnly?: AppendOnlyFile[];
  /** The staged canon diff and the review record found for it, when the canon is part of the commit. */
  review?: ReviewState;
}

export interface ReviewState {
  diff: IntentDiff;
  record: ReviewRecord | undefined;
  /** Why the record cannot be accepted; empty when it is valid or absent. */
  recordErrors: string[];
}

export interface AppendOnlyFile {
  path: string;
  added: number;
}

/** Files whose growth by appending is the failure mode: rules, skills, and the canon. */
export const APPEND_WATCH: RegExp[] = [/^canon\//, /^skills\//, /(^|\/)rules\.ts$/];

/** Pure: from `git diff --cached --numstat` and `--name-status`, the modified watched files that only gained lines. */
export function findAppendOnlyFiles(numstat: string, nameStatus: string, watch: RegExp[] = APPEND_WATCH, minAdded = 8): AppendOnlyFile[] {
  const modified = new Set<string>();
  for (const line of nameStatus.split(/\r?\n/)) {
    const [status, ...rest] = line.split("\t");
    if (status === "M" && rest[0]) modified.add(rest[0]);
  }
  const out: AppendOnlyFile[] = [];
  for (const line of numstat.split(/\r?\n/)) {
    const [a, d, path] = line.split("\t");
    if (!path || !modified.has(path)) continue;
    if (!watch.some((re) => re.test(path))) continue;
    const added = Number(a);
    const deleted = Number(d);
    if (Number.isFinite(added) && deleted === 0 && added >= minAdded) out.push({ path, added });
  }
  return out;
}

/** Runs git in the repository and applies the pure check; an empty list when git is unavailable. */
export function gitAppendOnlyFiles(repoDir: string, watch: RegExp[] = APPEND_WATCH, minAdded = 8): AppendOnlyFile[] {
  try {
    const run = (args: string[]) => execFileSync("git", args, { cwd: repoDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return findAppendOnlyFiles(run(["diff", "--cached", "--numstat"]), run(["diff", "--cached", "--name-status"]), watch, minAdded);
  } catch {
    return [];
  }
}

const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<bang>!)?: (?<subject>\S.*)$/;
const TRAILER = /^(?<key>[A-Za-z][A-Za-z0-9-]*): (?<value>.*)$/;
const INTENT_ID = /^(REQ|JRN|DEC)-[0-9][0-9.]*(?:\/S[0-9]+)?$/;
const CHANGE = /^(?<op>create|update|delete) (?<id>ROOT|(?:REQ|JRN|DEC|TERM)-\S+)$/;

/** Strip git's comment lines and anything after a scissors line. */
export function cleanMessage(raw: string): string {
  const lines: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (/^# -{8,} >8 -{8,}$/.test(line)) break;
    if (line.startsWith("#")) continue;
    lines.push(line);
  }
  return lines.join("\n").trim();
}

/** The final paragraph, when every line is `Key: value`, is the trailer block. */
export function parseTrailers(message: string): Record<string, string[]> {
  const paragraphs = message.split(/\n\s*\n/);
  const last = paragraphs[paragraphs.length - 1] ?? "";
  const lines = last.split("\n").filter((l) => l.trim());
  if (lines.length === 0 || !lines.every((l) => TRAILER.test(l))) return {};
  const out: Record<string, string[]> = {};
  for (const l of lines) {
    const m = TRAILER.exec(l)!;
    (out[m.groups!["key"]!] ??= []).push(m.groups!["value"]!.trim());
  }
  return out;
}

/**
 * Validate a commit message against the commit format (REQ-8.5, REQ-8.5.1).
 * With a canon, every referenced ID must exist. Merge, fixup and squash messages pass untouched.
 */
export function checkCommitMessage(raw: string, canon?: Canon, opts: CommitCheckOptions = {}): CommitCheck {
  const message = cleanMessage(raw);
  const errors: string[] = [];
  const warnings: string[] = [];
  const header = message.split("\n")[0];
  const result = (trailers: Record<string, string[]>): CommitCheck => ({ ok: errors.length === 0, errors, warnings, header, trailers });

  if (!header) {
    errors.push("empty commit message");
    return result({});
  }
  if (/^(Merge |fixup! |squash! )/.test(header)) return result({});

  const h = HEADER.exec(header);
  if (!h) errors.push(`header must follow Conventional Commits, e.g. "feat(scope): subject"; got "${header}"`);
  else if (!(COMMIT_TYPES as readonly string[]).includes(h.groups!["type"]!))
    errors.push(`unknown commit type "${h.groups!["type"]}"; use one of ${COMMIT_TYPES.join(", ")}`);
  if (header.length > 100) warnings.push("header is longer than 100 characters");

  const trailers = parseTrailers(message);
  const known = (id: string) => {
    if (!canon) return true;
    const base = id.split("/")[0]!;
    if (base === "ROOT") return canon.root !== undefined;
    if (base.startsWith("REQ-")) return base in canon.nodes;
    if (base.startsWith("JRN-")) {
      const j = canon.journeys.find((x) => x.id === base);
      if (!j) return false;
      const step = id.split("/")[1];
      return !step || j.steps.some((s) => s.id === step);
    }
    if (base.startsWith("DEC-")) return canon.decisions.some((d) => d.id === base);
    if (base.startsWith("TERM-")) return canon.terms.some((t) => t.id === base);
    return false;
  };

  const intent = trailers["Intent"];
  if (!intent || intent.length === 0) {
    errors.push('missing "Intent:" trailer; list the requirement or journey IDs this commit serves, or "none (reason)"');
  } else {
    for (const value of intent) {
      if (/^none\b/.test(value)) {
        if (!/^none\s*[(:-]\s*\S/.test(value) && value.trim() !== "none") warnings.push(`Intent: none should carry a reason, e.g. "none (tooling only)"`);
        if (value.trim() === "none") errors.push('"Intent: none" needs a reason in parentheses');
        continue;
      }
      for (const id of value.split(/[,\s]+/).filter(Boolean)) {
        if (!INTENT_ID.test(id)) errors.push(`Intent value "${id}" is not a REQ, JRN or DEC id`);
        else if (!known(id)) errors.push(`Intent ${id} does not exist in the canon`);
      }
    }
  }

  const changes = trailers["Intent-Change"] ?? [];
  for (const value of changes) {
    const m = CHANGE.exec(value);
    if (!m) {
      errors.push(`Intent-Change "${value}" must be "create|update|delete <ID>", one per trailer`);
      continue;
    }
    if (!known(m.groups!["id"]!)) {
      const op = m.groups!["op"];
      errors.push(op === "delete"
        ? `Intent-Change deletes ${m.groups!["id"]}, which is not in the canon (a delete retires the node; keep its file)`
        : `Intent-Change ${op}s ${m.groups!["id"]}, but no canon file carries that id`);
    }
  }
  for (const value of trailers["Decision"] ?? []) {
    if (!/^DEC-\d+$/.test(value)) errors.push(`Decision "${value}" is not a DEC id`);
    else if (!known(value)) errors.push(`Decision ${value} does not exist in the canon`);
  }
  for (const value of trailers["Test-Change"] ?? []) {
    if (!value.trim()) errors.push("Test-Change trailer is empty; cite the test and the intent change it relies on");
  }

  const appendOnly = opts.appendOnly ?? [];
  const consolidated = (trailers["Consolidated"] ?? []).filter((v) => v.trim());
  if (appendOnly.length > 0 && consolidated.length === 0) {
    const list = appendOnly.map((f) => `${f.path} (+${f.added}, -0)`).join(", ");
    errors.push(`${list}: a rules, skill or canon file only gained lines. Re-read the file and merge the addition into what is there, then add a "Consolidated:" trailer saying what you compared or merged, e.g. "Consolidated: merged the new rule into Certainty" or "Consolidated: reviewed Asking and Entries, nothing overlaps"`);
  }
  for (const value of consolidated) if (value.trim().length < 12) warnings.push(`Consolidated trailer "${value}" is too short to say what was compared or merged`);

  // Semantic review: a canon change needs a resolved review record pinned to this exact staged diff.
  const review = opts.review;
  if (review?.diff.required) {
    const { diff, record, recordErrors } = review;
    const where = `${diff.files.length} canon file(s), ${diff.changedLines} changed line(s), diff ${diff.hash}`;
    if (!record) {
      errors.push(`${where}: no intent review is recorded for this change. Run /headcanon:commit, which has the verifier review the staged canon diff for contradictions, reiterations and drift, or record a finished review with "headcanon review-record <file>"`);
    } else if (recordErrors.length) {
      for (const e of recordErrors) errors.push(`intent review: ${e}`);
    }
    const ir = trailers["Intent-Review"]?.[0] ?? "";
    if (!ir.startsWith(diff.hash)) errors.push(`missing "Intent-Review: ${diff.hash} …" trailer naming the reviewed diff and its outcome, e.g. "Intent-Review: ${diff.hash}, 2 findings, 1 merged, 1 kept"`);
  }

  const needsApproval = changes.length > 0 || (trailers["Test-Change"]?.length ?? 0) > 0;
  const approved = trailers["Approved-By"] ?? [];
  if (needsApproval && approved.length === 0)
    errors.push('an Intent-Change or Test-Change needs an "Approved-By:" trailer: the approving human, or "pending (how approval is being sought)"');
  for (const value of approved) if (!value.trim()) errors.push("Approved-By trailer is empty");

  return result(trailers);
}
