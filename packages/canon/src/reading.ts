import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { loadCodeTree, loadDescriptions } from "./code.js";
import { loadClaims } from "./parcel.js";

/**
 * How far the reading of the repository has come, counted from what the readers write to disk (DEC-025): code
 * functions described against the tree, and document files that have at least one claim against the Markdown
 * files of the repository. A fraction the page can draw; the session's own progress line stays the words.
 */
export interface ReadingPart { done: number; total: number }
export interface Reading { code: ReadingPart | undefined; documents: ReadingPart | undefined }

const SKIP_DIR = new Set(["node_modules", ".git", "dist", "build", "coverage", "out", ".next", ".turbo", "legacy", "test-results", "playwright-report", "worktrees"]);

const slash = (s: string): string => s.split("\\").join("/");

export function markdownFiles(repo: string, skipRel: string[] = []): string[] {
  const out: string[] = [];
  const skip = new Set(skipRel.map((s) => slash(s).replace(/\/$/, "")));
  const walk = (dir: string) => {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e);
      const rel = slash(relative(repo, p));
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) { if (SKIP_DIR.has(e) || skip.has(rel)) continue; walk(p); }
      else if (extname(e).toLowerCase() === ".md") out.push(rel);
    }
  };
  walk(repo);
  return out.sort();
}

export function readingProgress(gitDir: string, canonDir: string): Reading {
  const repo = dirname(gitDir);
  let code: ReadingPart | undefined;
  const tree = loadCodeTree(gitDir);
  if (tree) {
    const d = loadDescriptions(gitDir);
    const ids = Object.keys(tree.functions);
    code = { done: ids.filter((id) => d[id] !== undefined).length, total: ids.length };
  }
  let documents: ReadingPart | undefined;
  if (existsSync(join(gitDir, "headcanon", "claims.json"))) {
    const files = new Set(markdownFiles(repo, [relative(repo, canonDir)]));
    const done = new Set<string>();
    for (const c of loadClaims(gitDir)) {
      if (c.kind !== "document") continue;
      for (const s of c.sources) { const f = slash(s.split(":")[0] ?? ""); if (files.has(f)) done.add(f); }
    }
    documents = { done: done.size, total: files.size };
  }
  return { code, documents };
}
