/**
 * Lookups: what an agent asks the canon for instead of being handed a wide brief. `contextText` is one box with
 * what surrounds it, in a fixed order and within a budget of characters; `findBoxes` and `findUnits` answer a
 * few words with the boxes or the code units that carry them; `documentParts` splits the repository's documents
 * into groups of like size, one per reader. Everything here reads; nothing writes.
 */
import { statSync } from "node:fs";
import { join, relative } from "node:path";
import { STOP, sectionText } from "./check.js";
import { loadCodeTree, loadDescriptions } from "./code.js";
import { coherenceClusters, type Cluster } from "./coherence.js";
import { branchOf, compareIds, loadCanon } from "./load.js";
import { loadClaims } from "./parcel.js";
import { markdownFiles } from "./reading.js";
import type { Bind, Canon, ReqNode } from "./types.js";

/** The shape every module's `cli` function receives; declared here as well so this file stands without `cli.ts`. */
export interface CliCtx { canonDir: string; repo: string; gitDir: string | undefined; port: number; by: string | undefined; json: boolean; out: (s: string) => void; err: (s: string) => void; stdin: () => string }

export type Where = "title" | "intent" | "check" | "journey" | "decision" | "term";
export interface BoxHit { id: string; title: string; where: Where; line: string }
export interface UnitHit { id: string; file?: string; lines?: [number, number]; text?: string }

const DEFAULT_BUDGET = 12_000;
const DEFAULT_LIMIT = 20;
const RELATIVES_CAP = 12;
const BINDS_CAP = 12;
/** Characters kept free for the last line, which names what was left out. */
const TAIL_ROOM = 280;
/** Characters kept free in a list for its own "and n more" line. */
const MORE_ROOM = 24;
const LINE_MAX = 200;

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const unix = (s: string): string => s.replace(/\r\n/g, "\n");
const clip = (s: string, max = LINE_MAX): string => { const t = s.replace(/\s+/g, " ").trim(); return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t; };

/** The term as a whole word or phrase, any case: the pattern `coherence.ts` matches with, which it keeps to itself. */
function termPattern(term: string): RegExp {
  const words = term.trim().split(/\s+/).map(escapeRe).join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}_])${words}(?![\\p{L}\\p{N}_])`, "iu");
}

/** An id as a whole reference: `REQ-1.1` is cited neither by `REQ-1.10` nor by `REQ-1.1.2`. */
function idPattern(id: string): RegExp {
  return new RegExp(`(?<![\\w.-])${escapeRe(id)}(?![\\w-]|\\.\\d)`);
}

/** The body without its `# Title` line, which the heading above it already says. */
const withoutTitle = (body: string): string => unix(body).replace(/^\s*#[ \t]+[^\n]*\n?/, "").trim();

/** The body without one `## Heading` and what is under it. */
function withoutSection(body: string, heading: string): string {
  const lines = unix(body).split("\n");
  const name = (l: string) => l.replace(/^##\s+/, "").replace(/\s*\[[a-z]+\]\s*$/, "").trim().toLowerCase();
  const start = lines.findIndex((l) => /^##\s+/.test(l) && name(l) === heading.toLowerCase());
  if (start < 0) return body;
  const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  return [...lines.slice(0, start), ...(end < 0 ? [] : lines.slice(end))].join("\n").trim();
}

/** What an entry is for: its Intent, or the person's own words where no Intent was written yet. */
function intentOf(body: string): string {
  return unix(sectionText(body, "Intent")) || unix(sectionText(body, "Stated")).replace(/^>\s?/gm, "").trim() || "(no Intent written yet)";
}

interface Part {
  head: string;
  /** The box as one block, an ancestor per block, or a line per entry of a list. */
  items: string[];
  sep: "\n" | "\n\n";
  /** What one item and several items are called when some are left out. */
  noun: [string, string];
  /** Set on the box: it is cut at a line, and the cut names this file. */
  file?: string;
}

/** The parts in order, whole when they fit the budget; otherwise the first parts whole, the rest cut, and a last line naming what is missing. */
function fit(parts: Part[], budget: number): string {
  const block = (p: Part, items = p.items) => `${p.head}\n\n${items.length ? items.join(p.sep) : "none"}`;
  const full = parts.map((p) => block(p)).join("\n\n") + "\n";
  if (full.length <= budget) return full;
  // a part with nothing under it always prints its "none", so a heading that is absent was cut, never empty
  const empties = parts.filter((p) => !p.items.length).reduce((a, p) => a + block(p).length + 2, 0);
  let room = budget - TAIL_ROOM - empties;
  const out: string[] = [];
  const left: string[] = [];
  let used = 0;
  const take = (text: string) => { used += (out.length ? 2 : 0) + text.length; out.push(text); };
  for (const p of parts) {
    const whole = block(p);
    const gap = out.length ? 2 : 0;
    if (!p.items.length) { room += whole.length + 2; take(whole); continue; }
    if (used + gap + whole.length <= room) { take(whole); continue; }
    const free = room - used - gap - p.head.length - 2;
    if (p.file !== undefined) {
      const note = `\n\n(cut here to stay within the budget; the whole box is in ${p.file})`;
      const kept: string[] = [];
      let n = 0;
      for (const l of (p.items[0] ?? "").split("\n")) { if (n + l.length + 1 > free - note.length) break; kept.push(l); n += l.length + 1; }
      const text = kept.join("\n").trimEnd();
      if (text) take(`${p.head}\n\n${text}${note}`);
      left.push(text ? "the rest of the box" : "the box");
      continue;
    }
    const kept: string[] = [];
    let n = 0;
    for (const item of p.items) {
      const cost = (kept.length ? p.sep.length : 0) + item.length;
      if (n + cost + p.sep.length + MORE_ROOM > free) break;
      kept.push(item);
      n += cost;
    }
    const rest = p.items.length - kept.length;
    left.push(`${rest} ${p.noun[rest === 1 ? 0 : 1]}`);
    if (kept.length) take(block(p, [...kept, p.sep === "\n" ? `- and ${rest} more` : `(and ${rest} more)`]));
  }
  const tail = `Left out to stay within ${budget} characters: ${left.join(", ")}. A larger --budget shows them; a heading not named here is whole.`;
  const text = `${out.join("\n\n")}${out.length ? "\n\n" : ""}${tail}\n`;
  return text.length <= budget ? text : text.slice(0, Math.max(0, budget));
}

/** The evidence bound to a box, one line each: contradictions, then what implements it, then what contributes, code before claims; past the cap, the count and where the rest is. */
function bindLines(node: ReqNode, gitDir: string | undefined): string[] {
  if (!node.binds.length) return [];
  const rank: Record<Bind["relation"], number> = { contradicts: 0, implements: 1, contributes: 2 };
  const late = (b: Bind) => (b.unit.startsWith("claim:") ? 1 : 0);
  const binds = node.binds.map((b, i) => ({ b, i })).sort((x, y) => rank[x.b.relation] - rank[y.b.relation] || late(x.b) - late(y.b) || x.i - y.i).map((x) => x.b);
  const shown = binds.slice(0, BINDS_CAP);
  const tree = gitDir && shown.some((b) => !b.unit.startsWith("claim:")) ? loadCodeTree(gitDir) : undefined;
  const d = tree && gitDir ? loadDescriptions(gitDir) : {};
  const claims = new Map((gitDir && shown.some((b) => b.unit.startsWith("claim:")) ? loadClaims(gitDir) : []).map((c) => [c.id, c]));
  const line = (b: Bind): string => {
    const head = `- ${b.relation} ${b.unit}`;
    const claim = claims.get(b.unit);
    if (claim) return `${head} (${claim.kind}, ${claim.date}): ${clip(claim.statement)} (${claim.sources.join("; ")})`;
    const f = tree?.functions[b.unit];
    const c = tree?.clusters[b.unit];
    const text = d[b.unit]?.text;
    if (f) return `${head} (${f.file}:${f.lines[0]}-${f.lines[1]})${text ? `: ${clip(text)}` : ""}`;
    if (c) return `${head} (cluster of ${c.size} functions)${text ? `: ${clip(text)}` : ""}`;
    return head;
  };
  const lines = shown.map(line);
  const rest = binds.slice(BINDS_CAP);
  if (rest.length) {
    const count = (r: Bind["relation"]) => rest.filter((b) => b.relation === r).length;
    const kinds = (["contradicts", "implements", "contributes"] as const).filter((r) => count(r)).map((r) => `${count(r)} ${r}`).join(", ");
    lines.push(`- and ${rest.length} more (${kinds}); \`headcanon parcel ${node.id}\` lists them all`);
  }
  return lines;
}

/** The box as its file has it: the fields of its front matter that say something, its sections, then what is bound to it. */
function boxBlock(node: ReqNode, gitDir: string | undefined): string {
  const fields: Array<[string, string | undefined]> = [
    ["file", node.file], ["state", node.state], ["layer", node.layer], ["kind", node.kind], ["uid", node.uid], ["source", node.source],
    ["partition", node.partition], ["baseline", node.baseline], ["files", node.files.length ? node.files.join(", ") : undefined],
  ];
  const out = [fields.filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${k}: ${v}`).join("\n"), withoutTitle(node.body)];
  const binds = bindLines(node, gitDir);
  if (binds.length) out.push(`## Bound evidence\n\n${binds.join("\n")}`);
  return out.filter(Boolean).join("\n\n");
}

/** The nodes of other branches that share something rare with this one, the closest first: the clusters `coherence.ts` finds, wide ones dropped. */
function relativesOf(canon: Canon, node: ReqNode, linked: Set<string>): string[] {
  const own = branchOf(canon, node.id);
  const found = new Map<string, { clusters: Cluster[]; smallest: number }>();
  for (const c of coherenceClusters(canon).clusters) {
    if (!c.nodes.includes(node.id)) continue;
    for (const other of c.nodes) {
      if (other === node.id || linked.has(other) || branchOf(canon, other) === own) continue;
      const have = found.get(other);
      if (have) { have.clusters.push(c); have.smallest = Math.min(have.smallest, c.nodes.length); }
      else found.set(other, { clusters: [c], smallest: c.nodes.length });
    }
  }
  const shares = (c: Cluster): string => {
    switch (c.kind) {
      case "term": return `the term "${c.shared}"`;
      case "file": return `the file ${c.shared}`;
      case "requires": return `a need for ${c.shared}`;
      case "title": return `the title word "${c.shared}"`;
    }
  };
  const ranked = [...found.entries()].sort(([a, x], [b, y]) => y.clusters.length - x.clusters.length || x.smallest - y.smallest || compareIds(a, b));
  const lines = ranked.slice(0, RELATIVES_CAP).map(([id, r]) => `- ${id} ${canon.nodes[id]?.title ?? ""} (shares ${r.clusters.slice(0, 2).map(shares).join(" and ")})`);
  if (ranked.length > RELATIVES_CAP) lines.push(`- and ${ranked.length - RELATIVES_CAP} more that share less`);
  return lines;
}

/** The glossary's terms found in a text as whole words, in the glossary's order, each once. */
function termsUsed(canon: Canon, text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of canon.terms) {
    const term = t.term.trim();
    if (!term || seen.has(term.toLowerCase())) continue;
    seen.add(term.toLowerCase());
    if (termPattern(term).test(text)) out.push(`- ${term}: ${t.definition}`);
  }
  return out;
}

/** The journeys and decisions that name the box: a step's requirements, the box's own `steps`, a decision's intents, or the id in their text. */
function citesOf(canon: Canon, id: string, ownSteps: string[]): string[] {
  const re = idPattern(id);
  const out: string[] = [];
  for (const j of canon.journeys) {
    const steps = j.steps.filter((s) => s.requirements.includes(id) || ownSteps.includes(`${j.id}/${s.id}`));
    if (steps.length) out.push(`- ${j.id} ${j.title}, ${steps.length === 1 ? "step" : "steps"} ${steps.map((s) => `${s.id} ${s.label}`).join("; ")}`);
    else if (re.test(j.body) || ownSteps.some((s) => s === j.id || s.startsWith(`${j.id}/`))) out.push(`- ${j.id} ${j.title}`);
  }
  for (const d of canon.decisions) if (d.intents.includes(id) || re.test(d.body)) out.push(`- ${d.id} ${d.title}${d.date ? ` (${d.date})` : ""}`);
  return out;
}

/**
 * One box and what surrounds it, for an agent that has never seen the tree. In this order: the box whole, its
 * path from the premise with each Intent, its siblings and children, its links in both directions, the journeys
 * and decisions that cite it, its relatives in other branches, and the glossary terms its text uses. `ROOT` is
 * the premise. The id may also be a box's `uid`. Undefined when no box answers to the id.
 */
export function contextText(canon: Canon, id: string, opts: { budget?: number; gitDir?: string } = {}): string | undefined {
  const budget = opts.budget ?? DEFAULT_BUDGET;
  const ref = (x: string): string => (canon.nodes[x] ? `${x} ${canon.nodes[x].title}` : x === "ROOT" && canon.root ? `ROOT ${canon.root.title}` : `${x} (not in the canon)`);
  const list = (ids: string[]): string[] => ids.map((x) => `- ${ref(x)}`);

  if (id === "ROOT") {
    const root = canon.root;
    if (!root) return undefined;
    const body = withoutSection(withoutTitle(root.body), "Glossary");
    const fields = [`file: ${root.file}`, `state: ${root.state}`, ...(root.partition ? [`partition: ${root.partition}`] : [])].join("\n");
    const note = canon.terms.length ? "\n\n(The glossary is left out here; the terms this text uses are under the last heading.)" : "";
    return fit([
      { head: `# Box ROOT: ${root.title} (the premise)`, items: [`${fields}\n\n${body}${note}`], sep: "\n\n", noun: ["box", "boxes"], file: root.file },
      { head: "# Children", items: list(canon.roots), sep: "\n", noun: ["child", "children"] },
      { head: "# Journeys and decisions that cite it", items: citesOf(canon, "ROOT", []), sep: "\n", noun: ["journey or decision", "journeys and decisions"] },
      { head: "# Glossary terms its text uses", items: termsUsed(canon, `${root.title}\n${body}`), sep: "\n", noun: ["glossary term", "glossary terms"] },
    ], budget);
  }

  const node = canon.nodes[id] ?? Object.values(canon.nodes).find((n) => n.uid !== undefined && n.uid === id);
  if (!node) return undefined;

  const path: string[] = [];
  const seen = new Set<string>([node.id]);
  for (let p = node.parent ? canon.nodes[node.parent] : undefined; p && !seen.has(p.id); p = p.parent ? canon.nodes[p.parent] : undefined) {
    seen.add(p.id);
    path.unshift(`## ${p.id} ${p.title} (${p.layer})\n\n${intentOf(p.body)}`);
  }
  if (canon.root) path.unshift(`## ROOT ${canon.root.title} (the premise)\n\n${intentOf(canon.root.body)}`);

  const parent = node.parent ? canon.nodes[node.parent] : undefined;
  const siblings = (parent ? parent.children : canon.roots).filter((x) => x !== node.id);

  const others = Object.values(canon.nodes).filter((n) => n.id !== node.id).sort((a, b) => compareIds(a.id, b.id));
  const incoming = (field: "requires" | "relates" | "conflicts") => others.filter((n) => n[field].includes(node.id)).map((n) => n.id);
  const links: string[] = [];
  const link = (verb: string, ids: string[]) => { for (const x of new Set(ids)) links.push(`- ${verb} ${ref(x)}`); };
  link("requires", node.requires);
  link("required by", incoming("requires"));
  link("relates to", node.relates);
  link("related from", incoming("relates"));
  link("conflicts with", node.conflicts);
  link("conflicted by", incoming("conflicts"));
  const linked = new Set([...node.requires, ...node.relates, ...node.conflicts, ...incoming("requires"), ...incoming("relates"), ...incoming("conflicts")]);

  return fit([
    { head: `# Box ${node.id}: ${node.title}`, items: [boxBlock(node, opts.gitDir)], sep: "\n\n", noun: ["box", "boxes"], file: node.file },
    { head: "# Path from the premise", items: path, sep: "\n\n", noun: ["ancestor", "ancestors"] },
    { head: "# Siblings", items: list(siblings), sep: "\n", noun: ["sibling", "siblings"] },
    { head: "# Children", items: list(node.children), sep: "\n", noun: ["child", "children"] },
    { head: "# Links", items: links, sep: "\n", noun: ["link", "links"] },
    { head: "# Journeys and decisions that cite it", items: citesOf(canon, node.id, node.steps), sep: "\n", noun: ["journey or decision", "journeys and decisions"] },
    { head: "# Relatives in other branches", items: relativesOf(canon, node, linked), sep: "\n", noun: ["relative", "relatives"] },
    { head: "# Glossary terms its text uses", items: termsUsed(canon, `${node.title}\n${unix(node.body)}`), sep: "\n", noun: ["glossary term", "glossary terms"] },
  ], budget);
}

// --- finding by words ---

/** Words too common to search by, beside the check's own list. */
const SMALL = new Set(["a", "an", "of", "to", "in", "on", "is", "be", "or", "it", "as", "at", "by"]);

const wordsOf = (s: string): string[] => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** A word cut to what its forms share, so "closing" finds "closed" and "entries" finds "entry"; short words stay whole. */
function stem(w: string): string {
  if (w.length <= 4 || !/^\p{L}+$/u.test(w)) return w;
  for (const end of ["ies", "ing", "ed", "es", "s", "e", "y"]) if (w.endsWith(end) && w.length - end.length >= 3) return w.slice(0, -end.length);
  return w;
}

/** The words of a query worth matching, stemmed, each once; the common ones go unless nothing else was asked. */
function queryOf(words: string): string[] {
  const all = [...new Set(wordsOf(words))];
  const kept = all.filter((w) => !STOP.has(w) && !SMALL.has(w));
  return [...new Set((kept.length ? kept : all).map(stem))];
}

/** A query word is found where a word of the text starts with it; a word of one or two letters must be the whole word. */
const has = (tokens: string[], q: string): boolean => tokens.some((t) => (q.length <= 2 ? t === q : t.startsWith(q)));
const matched = (text: string, query: string[]): Set<string> => { const t = wordsOf(text); return new Set(query.filter((q) => has(t, q))); };

/** The line of a text that carries the most of the query; a long line gives its best sentence. */
function bestLine(text: string, query: string[]): string {
  let best = "";
  let score = 0;
  for (const raw of unix(text).split("\n")) {
    for (const s of raw.length > LINE_MAX ? raw.split(/(?<=[.!?])\s+/) : [raw]) {
      const n = matched(s, query).size;
      if (n > score) { best = s; score = n; }
    }
  }
  return clip(best.replace(/^\s*(?:[-*>]|\|)\s*/, "").replace(/\s*\|\s*$/, ""));
}

const WHERE: Where[] = ["title", "intent", "check", "journey", "decision", "term"];

/**
 * The boxes, journeys, decisions and glossary terms that carry the words, the ones carrying most of them first,
 * a title before an Intent before a Check. One hit per object, with the line the words were found in. A word
 * that is an id or a box's uid finds that object first.
 */
export function findBoxes(canon: Canon, words: string, limit = DEFAULT_LIMIT): BoxHit[] {
  const raw = words.trim().split(/\s+/).filter(Boolean);
  const nodes = Object.values(canon.nodes).sort((a, b) => compareIds(a.id, b.id));
  const direct: BoxHit[] = [];
  const rest: string[] = [];
  for (const w of raw) {
    const bare = w.replace(/^[("'`[]+|[)"'`\],.;:]+$/g, "");
    const node = nodes.find((n) => n.id.toLowerCase() === bare.toLowerCase() || (n.uid !== undefined && n.uid === bare));
    const journey = canon.journeys.find((j) => j.id.toLowerCase() === bare.toLowerCase());
    const decision = canon.decisions.find((d) => d.id.toLowerCase() === bare.toLowerCase());
    const term = canon.terms.find((t) => t.id.toLowerCase() === bare.toLowerCase());
    if (node) direct.push({ id: node.id, title: node.title, where: "title", line: node.title });
    else if (journey) direct.push({ id: journey.id, title: journey.title, where: "journey", line: journey.title });
    else if (decision) direct.push({ id: decision.id, title: decision.title, where: "decision", line: decision.title });
    else if (term) direct.push({ id: term.id, title: term.term, where: "term", line: clip(term.definition) });
    else rest.push(w);
  }
  const query = rest.length ? queryOf(rest.join(" ")) : [];
  const taken = new Set(direct.map((h) => h.id));
  const scored: Array<{ hit: BoxHit; total: number; own: number }> = [];
  const add = (id: string, title: string, fields: Array<{ where: Where; text: string; line?: string }>) => {
    if (taken.has(id) || !query.length) return;
    const all = new Set<string>();
    let best: { where: Where; text: string; line?: string } | undefined;
    let own = 0;
    for (const f of fields) {
      const m = matched(f.text, query);
      for (const q of m) all.add(q);
      if (m.size > own) { best = f; own = m.size; }
    }
    if (!best) return;
    scored.push({ hit: { id, title, where: best.where, line: best.line ?? bestLine(best.text, query) }, total: all.size, own });
  };
  for (const n of nodes) add(n.id, n.title, [{ where: "title", text: n.title, line: n.title }, { where: "intent", text: sectionText(n.body, "Intent") }, { where: "check", text: sectionText(n.body, "Check") }]);
  for (const j of canon.journeys) add(j.id, j.title, [{ where: "journey", text: `${j.title}\n${j.steps.map((s) => `${s.id} ${s.label}`).join("\n")}\n${withoutTitle(j.body)}` }]);
  for (const d of canon.decisions) add(d.id, d.title, [{ where: "decision", text: `${d.title}\n${withoutTitle(d.body)}` }]);
  for (const t of canon.terms) add(t.id, t.term, [{ where: "term", text: `${t.term}\n${t.definition}`, line: clip(t.definition) }]);
  scored.sort((a, b) => b.total - a.total || b.own - a.own || WHERE.indexOf(a.hit.where) - WHERE.indexOf(b.hit.where) || compareIds(a.hit.id, b.hit.id));
  return [...direct, ...scored.map((s) => s.hit)].slice(0, Math.max(0, limit));
}

/** The words inside a code name: `MonthBook.isClosed` gives month, book, is, closed, and the two names whole. */
function codeWords(s: string): string[] {
  return [...wordsOf(s.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")), ...s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)];
}

/**
 * Code units of the stored tree by id, file or description: functions and clusters, the ones carrying most of
 * the words first, a name before a file before a description. A word with a path in it (`src/months.ts`) is
 * looked for inside the id as written. Empty when no tree was built.
 */
export function findUnits(gitDir: string, words: string, limit = DEFAULT_LIMIT): UnitHit[] {
  const tree = loadCodeTree(gitDir);
  if (!tree) return [];
  const d = loadDescriptions(gitDir);
  const raw = words.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const paths = raw.filter((w) => /[\/.#:]/.test(w));
  const query = queryOf(raw.filter((w) => !paths.includes(w)).join(" "));
  if (!paths.length && !query.length) return [];
  const scored: Array<{ hit: UnitHit; exact: number; total: number; strength: number }> = [];
  const add = (hit: UnitHit, name: string, file: string, loose: string) => {
    const id = hit.id.toLowerCase();
    const inName = codeWords(name), inFile = codeWords(file), inLoose = wordsOf(loose);
    let total = 0, strength = 0;
    for (const p of paths) if (id.includes(p)) { total++; strength += 3; }
    for (const q of query) {
      const s = has(inName, q) ? 3 : has(inFile, q) ? 2 : has(inLoose, q) ? 1 : 0;
      if (s) { total++; strength += s; }
    }
    if (total) scored.push({ hit, exact: raw.includes(id) ? 1 : 0, total, strength });
  };
  for (const f of Object.values(tree.functions)) {
    const text = d[f.id]?.text;
    add({ id: f.id, file: f.file, lines: f.lines, ...(text ? { text } : {}) }, f.name, f.file, text ?? "");
  }
  for (const c of Object.values(tree.clusters)) {
    const text = d[c.id]?.text;
    add({ id: c.id, ...(text ? { text } : {}) }, c.id, "", `${text ?? ""} ${(c.vocabulary ?? []).join(" ")}`);
  }
  scored.sort((a, b) => b.exact - a.exact || b.total - a.total || b.strength - a.strength || a.hit.id.localeCompare(b.hit.id));
  return scored.slice(0, Math.max(0, limit)).map((s) => s.hit);
}

/**
 * The repository's document files in `parts` groups of like size, for one reader each: the largest file first,
 * each into the group that is lightest so far. Never an empty group, so fewer files than parts give fewer
 * groups. The same files `readingProgress` counts, each group in path order.
 */
export function documentParts(repo: string, parts: number, skipRel: string[] = []): string[][] {
  const files = markdownFiles(repo, skipRel).map((rel) => {
    let size = 0;
    try { size = statSync(join(repo, rel)).size; } catch { /* a file gone since the walk weighs nothing */ }
    return { rel, size };
  });
  const count = Math.min(Math.max(1, Math.floor(parts) || 1), files.length);
  const groups = Array.from({ length: count }, () => ({ size: 0, files: [] as string[] }));
  for (const f of [...files].sort((a, b) => b.size - a.size || a.rel.localeCompare(b.rel))) {
    const lightest = groups.reduce((min, g) => (g.size < min.size ? g : min));
    lightest.files.push(f.rel);
    lightest.size += f.size;
  }
  return groups.map((g) => g.files.sort());
}

// --- the commands ---

/** Positional words and `--name value` pairs; `--json` alone takes no value. */
function parseRest(rest: string[]): { pos: string[]; flags: Record<string, string>; json: boolean } {
  const pos: string[] = [];
  const flags: Record<string, string> = {};
  let json = false;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] ?? "";
    if (a === "--json") { json = true; continue; }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 0) flags[a.slice(2, eq)] = a.slice(eq + 1);
      else { const next = rest[i + 1]; if (next !== undefined && !next.startsWith("--")) { flags[a.slice(2)] = next; i++; } else flags[a.slice(2)] = ""; }
      continue;
    }
    pos.push(a);
  }
  return { pos, flags, json };
}

/** A whole number above zero from a flag, undefined when the flag is absent, NaN when it is not such a number. */
const countOf = (v: string | undefined): number | undefined => (v === undefined ? undefined : /^\d+$/.test(v.trim()) && Number(v) > 0 ? Number(v) : Number.NaN);

/**
 * `context <id> [--budget n]`, `find "<words>" [--limit n]`, `code find "<words>" [--limit n]` and
 * `reading parts <n>`. `rest` is what follows the command's own words; a leading `find` or `parts` left in by
 * the caller is dropped. Returns the exit code: 0, 1 when the thing asked for is not there, 2 on a wrong call.
 */
export async function lookupCli(cmd: "context" | "find" | "code-find" | "reading-parts", rest: string[], ctx: CliCtx): Promise<number> {
  const { pos, flags, json: jsonFlag } = parseRest(rest);
  const json = ctx.json || jsonFlag;
  const limit = countOf(flags["limit"]);
  if (limit !== undefined && Number.isNaN(limit)) { ctx.err("--limit takes a whole number above zero\n"); return 2; }

  if (cmd === "context") {
    const id = pos[0];
    const budget = countOf(flags["budget"]);
    if (!id || (budget !== undefined && Number.isNaN(budget))) { ctx.err("usage: headcanon context <id> [--budget <characters>]\n"); return 2; }
    const text = contextText(loadCanon(ctx.canonDir), id, { ...(budget !== undefined ? { budget } : {}), ...(ctx.gitDir ? { gitDir: ctx.gitDir } : {}) });
    if (text === undefined) { ctx.err(`no box ${id} in the canon at ${ctx.canonDir}; \`headcanon find "<words>"\` looks one up\n`); return 1; }
    ctx.out(json ? JSON.stringify({ id, text }) + "\n" : text);
    return 0;
  }

  if (cmd === "find") {
    const words = pos.join(" ").trim();
    if (!words) { ctx.err('usage: headcanon find "<words>" [--limit n] [--json]\n'); return 2; }
    const hits = findBoxes(loadCanon(ctx.canonDir), words, limit ?? DEFAULT_LIMIT);
    if (json) ctx.out(JSON.stringify(hits) + "\n");
    else ctx.out(hits.length ? hits.map((h) => `${h.id}  ${h.title}  [${h.where}]${h.line && h.line !== h.title ? `  ${h.line}` : ""}`).join("\n") + "\n" : `No hit for "${words}".\n`);
    return 0;
  }

  if (cmd === "code-find") {
    const words = (pos[0] === "find" && pos.length > 1 ? pos.slice(1) : pos).join(" ").trim();
    if (!words) { ctx.err('usage: headcanon code find "<words>" [--limit n] [--json]\n'); return 2; }
    if (!ctx.gitDir) { ctx.err("no git repository above the canon; the code tree lives in its .git/headcanon/code\n"); return 1; }
    if (!loadCodeTree(ctx.gitDir)) { ctx.err("no code tree yet: run `headcanon code build`\n"); return 1; }
    const hits = findUnits(ctx.gitDir, words, limit ?? DEFAULT_LIMIT);
    if (json) ctx.out(JSON.stringify(hits) + "\n");
    else ctx.out(hits.length ? hits.map((h) => `${h.id}  ${h.file ? `${h.file}:${h.lines?.[0]}-${h.lines?.[1]}` : "cluster"}  ${h.text ? h.text.replace(/\s+/g, " ").trim() : "(no description yet)"}`).join("\n") + "\n" : `No hit for "${words}".\n`);
    return 0;
  }

  const n = countOf((pos[0] === "parts" ? pos.slice(1) : pos)[0]);
  if (n === undefined || Number.isNaN(n)) { ctx.err("usage: headcanon reading parts <n>\n"); return 2; }
  const canonRel = relative(ctx.repo, ctx.canonDir).split("\\").join("/");
  const groups = documentParts(ctx.repo, n, canonRel && !canonRel.startsWith("..") ? [canonRel] : []);
  ctx.out(groups.length ? `[\n${groups.map((g) => ` ${JSON.stringify(g)}`).join(",\n")}\n]\n` : "[]\n");
  return 0;
}
