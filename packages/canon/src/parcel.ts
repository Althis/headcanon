/**
 * Parcels, claims and coverage (DEC-025). A node's parcel is the evidence bound to it, expanded one level down
 * the code tree, with the claims bound to it: what its refiner sees. Coverage is the invariant the tool checks
 * with no model: every element of a parent's expanded parcel is bound by some child, and every child that carries
 * a requirement says where it is built or that it is not, or the set is refused.
 * The reflexion outcomes per node, convergence, divergence and absence, come from the same bindings.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { Canon, ReqNode } from "./types.js";
import { codeDir, expandUnit, type CodeTree, type Descriptions } from "./code.js";
import { descendants } from "./load.js";
import { builtOf } from "./built.js";

export interface Claim { id: string; statement: string; sources: string[]; date: string; kind: "document" | "content"; file?: string }

export function loadClaims(gitDir: string): Claim[] {
  const file = join(gitDir, "headcanon", "claims.json");
  if (!existsSync(file)) return [];
  try { return JSON.parse(readFileSync(file, "utf8")) as Claim[]; } catch { return []; }
}

/** Add claims, keyed by their statement so a rerun adds nothing twice. */
export function addClaims(gitDir: string, incoming: Array<Omit<Claim, "id">>): { added: number; total: number } {
  const have = loadClaims(gitDir);
  const seen = new Set(have.map((c) => c.id));
  let added = 0;
  for (const c of incoming) {
    if (!c.statement?.trim() || !c.sources?.length) continue;
    const id = `claim:${createHash("sha1").update(c.statement.trim().toLowerCase()).digest("hex").slice(0, 10)}`;
    if (seen.has(id)) continue;
    seen.add(id); added++;
    have.push({ id, statement: c.statement.trim(), sources: c.sources, date: c.date ?? "unknown", kind: c.kind === "content" ? "content" : "document", ...(c.file ? { file: c.file } : {}) });
  }
  mkdirSync(join(gitDir, "headcanon"), { recursive: true });
  writeFileSync(join(gitDir, "headcanon", "claims.json"), JSON.stringify(have, null, 1));
  return { added, total: have.length };
}

const approxTokens = (s: string) => Math.ceil(s.length / 4);

/**
 * The parcel of a node as Markdown, within a token budget: the bound clusters with their descriptions and their
 * children one level down, the bound functions, the bound claims. Stable order, so the text caches across agents.
 */
export function parcelText(canon: Canon, id: string, tree: CodeTree | undefined, d: Descriptions, claims: Claim[], budget = 20_000): { text: string; units: number; claims: number; truncated: boolean } {
  const isRoot = id === "ROOT";
  const binds = isRoot ? [] : canon.nodes[id]?.binds ?? [];
  const lines: string[] = [];
  let used = 0, truncated = false, units = 0, nClaims = 0;
  const push = (l: string) => { const t = approxTokens(l); if (used + t > budget) { truncated = true; return false; } used += t; lines.push(l); return true; };
  const claimById = new Map(claims.map((c) => [c.id, c]));
  const unitBinds = binds.filter((b) => !b.unit.startsWith("claim:")).sort((a, b) => a.unit.localeCompare(b.unit));
  const claimBinds = binds.filter((b) => b.unit.startsWith("claim:")).sort((a, b) => a.unit.localeCompare(b.unit));
  if (isRoot && tree) {
    push(`# Parcel of the premise: the whole program, its top clusters\n`);
    for (const r of tree.roots) { const u = expandUnit(tree, d, r); if (!u) continue; units++; if (!push(`- [${u.id}] (cluster, ${u.size} functions${u.reachable === false ? ", unreachable" : ""}) ${u.text ?? "(no description yet)"}`)) break; for (const ch of u.children) if (!push(`  - [${ch.id}]${ch.size ? ` (${ch.size})` : ""} ${ch.text ?? "(no description yet)"}`)) break; }
    push(`\n# Claims from the documents and content (${claims.length}); cite them by id\n`);
    for (const c of claims) { nClaims++; if (!push(`- [${c.id}] (${c.kind}, ${c.date}) ${c.statement} — ${c.sources.join("; ")}`)) break; }
    return { text: lines.join("\n") + "\n", units, claims: nClaims, truncated };
  }
  push(`# Parcel of ${id}: evidence bound to this node, expanded one level\n`);
  for (const b of unitBinds) {
    const u = tree ? expandUnit(tree, d, b.unit) : undefined;
    units++;
    if (!u) { push(`- [${b.unit}] (${b.relation}) (not in the code tree)`); continue; }
    if (!push(`- [${u.id}] (${b.relation}; ${u.kind}${u.size ? `, ${u.size} functions` : ""}${u.file ? `, ${u.file}:${u.lines?.[0]}-${u.lines?.[1]}` : ""}${u.reachable === false ? ", unreachable" : ""}) ${u.text ?? "(no description yet)"}`)) break;
    for (const ch of u.children) if (!push(`  - [${ch.id}]${ch.size ? ` (${ch.size})` : ""} ${ch.text ?? "(no description yet)"}`)) break;
  }
  if (claimBinds.length) push(`\n# Claims bound to this node; cite them by id\n`);
  for (const b of claimBinds) { const c = claimById.get(b.unit); nClaims++; if (!push(c ? `- [${c.id}] (${b.relation}; ${c.kind}, ${c.date}) ${c.statement} — ${c.sources.join("; ")}` : `- [${b.unit}] (${b.relation}) (claim not found)`)) break; }
  if (!binds.length) push("(nothing is bound to this node yet)");
  return { text: lines.join("\n") + "\n", units, claims: nClaims, truncated };
}

export interface CoverageFinding { level: "warn"; code: "parcel-uncovered" | "built-unstated"; id: string; message: string }

/** True when `unit` is bound by `n` directly, through an ancestor cluster (passed whole) or through a descendant (in part). */
function boundBy(n: ReqNode, unit: string, tree: CodeTree | undefined): boolean {
  const bound = new Set(n.binds.filter((b) => b.relation !== "contradicts").map((b) => b.unit));
  if (bound.has(unit)) return true;
  if (!tree) return false;
  for (let p = tree.clusters[unit]?.parent ?? tree.functions[unit]?.cluster["1"]; p; p = tree.clusters[p]?.parent) if (bound.has(p)) return true;
  const stack = [...(tree.clusters[unit]?.members ?? [])];
  while (stack.length) { const m = stack.pop()!; if (bound.has(m)) return true; stack.push(...(tree.clusters[m]?.members ?? [])); }
  return false;
}

/**
 * Every element of a parent's parcel, expanded one level, must be bound by some child; and every child that carries
 * a requirement must say where it is built or that it is not, whatever is bound above it. A draft is its question
 * and says neither.
 */
export function coverageFindings(canon: Canon, tree: CodeTree | undefined): CoverageFinding[] {
  const out: CoverageFinding[] = [];
  for (const n of Object.values(canon.nodes)) {
    if (!n.children.length) continue;
    const kids = n.children.map((c) => canon.nodes[c]).filter((k): k is ReqNode => Boolean(k));
    if (n.binds.length) {
      const expanded: string[] = [];
      for (const b of n.binds) { if (b.relation === "contradicts") continue; const c = tree?.clusters[b.unit]; if (c && c.members.length) expanded.push(...c.members); else expanded.push(b.unit); }
      const uncovered = expanded.filter((u) => !kids.some((k) => boundBy(k, u, tree)));
      if (uncovered.length) out.push({ level: "warn", code: "parcel-uncovered", id: n.id, message: `${n.id}'s children leave ${uncovered.length} of ${expanded.length} evidence units unbound: ${uncovered.slice(0, 5).join(", ")}${uncovered.length > 5 ? ", …" : ""}` });
    }
    for (const k of kids)
      if (k.kind && k.state !== "draft" && builtOf(k).built === "unstated")
        out.push({ level: "warn", code: "built-unstated", id: k.id, message: `${k.id} says neither where it is built nor that it is not: bind the functions that implement it, or write "not built: <what exists instead>" under Implemented by` });
  }
  return out;
}

/** Reflexion outcomes per node (Murphy, Notkin and Sullivan): what the bindings say. */
export function reflexion(canon: Canon): Record<string, { implements: number; contributes: number; contradicts: number; absent: boolean }> {
  const out: Record<string, { implements: number; contributes: number; contradicts: number; absent: boolean }> = {};
  for (const n of Object.values(canon.nodes)) {
    const count = (r: string) => n.binds.filter((b) => b.relation === r).length;
    const below = descendants(canon, n.id).some((d) => (canon.nodes[d]?.binds.length ?? 0) > 0);
    out[n.id] = { implements: count("implements"), contributes: count("contributes"), contradicts: count("contradicts"), absent: n.binds.length === 0 && !below };
  }
  return out;
}

export { codeDir };
