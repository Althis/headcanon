/**
 * The journal of every change to the canon's files (DEC-025: everything is an operation, so History can show and
 * undo it): one entry per change with the files it touched and their text before and after. Operations append here
 * when they commit, the page appends when the human edits through it, and a revert restores the "before" texts of
 * every entry after a point, as a new entry that can itself be reverted. Lives beside the ops log in the git dir.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { gitDirOf } from "./ops.js";

export interface JournalFile { path: string; before: string | null; after: string | null }
export interface JournalEntry { seq: number; at: string; kind: "op" | "page" | "revert"; summary: string; id?: string | undefined; files: JournalFile[] }

export function journalPath(canonDir: string): string | undefined {
  const git = gitDirOf(resolve(canonDir));
  return git ? join(git, "headcanon", "edits.jsonl") : undefined;
}

export function readJournal(canonDir: string): JournalEntry[] {
  const p = journalPath(canonDir);
  if (!p || !existsSync(p)) return [];
  return readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l) as JournalEntry; } catch { return undefined; } }).filter((e): e is JournalEntry => Boolean(e));
}

const rel = (canonDir: string, abs: string) => relative(resolve(canonDir), abs).replace(/\\/g, "/");
const readOrNull = (abs: string): string | null => { try { return existsSync(abs) && statSync(abs).isFile() ? readFileSync(abs, "utf8") : null; } catch { return null; } };

/** Every file under a path, or the path itself when it is a file. */
export function filesUnder(abs: string): string[] {
  if (!existsSync(abs)) return [abs];
  if (statSync(abs).isFile()) return [abs];
  const out: string[] = [];
  const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else out.push(p); } };
  walk(abs);
  return out;
}

/** Record a change: the texts of `absPaths` before `apply` runs and after; nothing is written when nothing changed. */
export function journalChange(canonDir: string, meta: { kind: JournalEntry["kind"]; summary: string; id?: string | undefined }, absPaths: string[], apply: () => void): JournalEntry | undefined {
  const paths = [...new Set(absPaths.flatMap(filesUnder))];
  const before = new Map(paths.map((p) => [p, readOrNull(p)] as const));
  apply();
  const after = new Map([...before.keys(), ...absPaths.flatMap(filesUnder)].map((p) => [p, readOrNull(p)] as const));
  const files: JournalFile[] = [];
  for (const [p, b] of after) { const a = b; const prev = before.get(p) ?? null; if (prev !== a) files.push({ path: rel(canonDir, p), before: prev, after: a }); }
  if (!files.length) return undefined;
  return append(canonDir, { ...meta, files });
}

/** Record an operation's change from the texts read before it committed; the "after" texts are read now. */
export function journalRecord(canonDir: string, meta: { kind: JournalEntry["kind"]; summary: string; id?: string | undefined }, before: Map<string, string | null>): JournalEntry | undefined {
  const files: JournalFile[] = [];
  for (const [p, b] of before) { const a = readOrNull(p); if (a !== b) files.push({ path: rel(canonDir, p), before: b, after: a }); }
  return files.length ? append(canonDir, { ...meta, files }) : undefined;
}
export const readTextOrNull = readOrNull;

function append(canonDir: string, e: Omit<JournalEntry, "seq" | "at">): JournalEntry | undefined {
  const p = journalPath(canonDir);
  if (!p) return undefined;
  const seq = (readJournal(canonDir).at(-1)?.seq ?? 0) + 1;
  const entry: JournalEntry = { seq, at: new Date().toISOString(), ...e };
  try { mkdirSync(dirname(p), { recursive: true }); appendFileSync(p, JSON.stringify(entry) + "\n"); } catch { return undefined; }
  return entry;
}

/** Restore the canon to how it was before entry `seq`: every entry from the newest down to `seq` is undone, in that order. */
export function revertTo(canonDir: string, seq: number): { restored: number; entries: number; entry: JournalEntry | undefined } {
  const all = readJournal(canonDir).filter((e) => e.seq >= seq).sort((a, b) => b.seq - a.seq);
  const dir = resolve(canonDir);
  const changed: JournalFile[] = [];
  for (const e of all) for (const f of e.files) {
    const abs = join(dir, f.path);
    const current = readOrNull(abs);
    if (f.before === null) { if (current !== null) { rmSync(abs, { force: true }); changed.push({ path: f.path, before: current, after: null }); } }
    else { mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, f.before); if (current !== f.before) changed.push({ path: f.path, before: current, after: f.before }); }
  }
  // folders left empty by the restores go
  for (const f of changed) { if (f.after !== null) continue; let d = dirname(join(dir, f.path)); while (d !== dir && existsSync(d) && readdirSync(d).length === 0) { rmSync(d, { recursive: true, force: true }); d = dirname(d); } }
  const entry = changed.length ? append(canonDir, { kind: "revert", summary: `reverted to before #${seq}: ${all.length} change(s) undone`, files: changed }) : undefined;
  return { restored: changed.length, entries: all.length, entry };
}
