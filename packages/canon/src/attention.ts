import { execFileSync } from "node:child_process";

export interface CommitInfo {
  sha: string;
  short: string;
  subject: string;
  refs: string[];
  trailers: Record<string, string[]>;
  onMain: boolean;
}

export interface GitAttention {
  available: boolean;
  error: string | undefined;
  repoRoot: string | undefined;
  branch: string | undefined;
  /** Commits whose Approved-By says pending. */
  pending: CommitInfo[];
  /** Commits not on main that carry Intent-Change trailers. */
  unmerged: CommitInfo[];
  /** Canon paths with uncommitted changes, as `XY path`. */
  uncommitted: string[];
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
}

function parseTrailers(block: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const line of block.split(/\r?\n/)) {
    const m = /^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/.exec(line);
    if (!m) continue;
    (out[m[1]!] ??= []).push((m[2] ?? "").trim());
  }
  return out;
}

/** What git knows that needs a human: pending approvals, unmerged intent changes, uncommitted canon edits. */
export function gitAttention(canonDir: string): GitAttention {
  const empty: GitAttention = { available: false, error: undefined, repoRoot: undefined, branch: undefined, pending: [], unmerged: [], uncommitted: [] };
  let repoRoot: string;
  try {
    repoRoot = git(canonDir, ["rev-parse", "--show-toplevel"]).trim();
  } catch (e) {
    return { ...empty, error: `not a git repository: ${e instanceof Error ? e.message : String(e)}` };
  }
  try {
    const branch = git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
    let onMain = new Set<string>();
    for (const main of ["main", "master"]) {
      try {
        onMain = new Set(git(repoRoot, ["rev-list", main]).split(/\r?\n/).filter(Boolean));
        break;
      } catch {
        /* no such branch */
      }
    }
    const raw = git(repoRoot, ["log", "--all", "--format=%H%x1f%h%x1f%s%x1f%D%x1f%(trailers:unfold)%x1e"]);
    const commits: CommitInfo[] = [];
    for (const rec of raw.split("\x1e")) {
      const [sha, short, subject, refs, trailers] = rec.replace(/^\s+/, "").split("\x1f");
      if (!sha) continue;
      commits.push({
        sha,
        short: short ?? sha.slice(0, 7),
        subject: subject ?? "",
        refs: (refs ?? "").split(",").map((s) => s.trim()).filter(Boolean),
        trailers: parseTrailers(trailers ?? ""),
        onMain: onMain.has(sha),
      });
    }
    const pending = commits.filter((c) => (c.trailers["Approved-By"] ?? []).some((v) => /^pending\b/i.test(v)));
    const unmerged = commits.filter((c) => !c.onMain && (c.trailers["Intent-Change"]?.length ?? 0) > 0);
    const rel = canonDir.startsWith(repoRoot) ? canonDir.slice(repoRoot.length).replace(/^[\\/]/, "") : canonDir;
    const uncommitted = git(repoRoot, ["status", "--porcelain", "--", rel || "."]).split(/\r?\n/).filter(Boolean);
    return { available: true, error: undefined, repoRoot, branch, pending, unmerged, uncommitted };
  } catch (e) {
    return { ...empty, repoRoot, error: e instanceof Error ? e.message : String(e) };
  }
}
