import { STOP, sectionText } from "./check.js";
import { branchOf, compareIds } from "./load.js";
import type { Canon, ReqNode } from "./types.js";

/**
 * Candidates for the cross-branch coherence pass (DEC-024). A refiner reads its own branch, so two nodes in
 * different top-level branches can say one thing twice, or contradict each other, and nobody is placed to notice.
 * Nothing is judged from a summary here: this finds the clusters of nodes across branches that visibly share
 * something, a glossary term in their Intent or Check, a code file cited under As built, a node they both require,
 * a rare word in their titles, and a reader agent gets the full text of each cluster and judges. Deterministic:
 * the same canon gives the same clusters in the same order.
 */

export interface Cluster {
  /** `kind:shared`, stable across runs, so a cluster can be named in a log or handed to a reader. */
  key: string;
  kind: "term" | "file" | "requires" | "title";
  /** The term, the file path, the required node's id, or the title word. */
  shared: string;
  /** In id order. */
  nodes: string[];
  /** The top-level branches the nodes fall in, at least two, in id order. */
  branches: string[];
  /** One sentence naming the nodes and what they share; a second finder that lands on the same set adds its reason. */
  why: string;
}

export interface Coherence {
  clusters: Cluster[];
  /** Clusters wider than `maxSize`, too many texts to read as one; named so the pass knows what it skipped. */
  dropped: Array<{ key: string; size: number }>;
}

const KINDS: Array<Cluster["kind"]> = ["term", "file", "requires", "title"];

/** A code citation as As built writes it: `path:line` or `path:from-to`. */
const CITATION = /[A-Za-z0-9_.\/-]+\.[A-Za-z0-9]+:\d+(?:-\d+)?/g;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The term as a whole word or phrase, any case. `\b` would miss a term that starts or ends in a symbol. */
function termPattern(term: string): RegExp {
  const words = term.trim().split(/\s+/).map(escapeRe).join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}_])${words}(?![\\p{L}\\p{N}_])`, "iu");
}

/** The files an entry's As built cites, each once, without the line part; a leading `./` names the same file. */
function citedFiles(n: ReqNode): string[] {
  const out = new Set<string>();
  for (const m of (sectionText(n.body, "Implemented by") + "\n" + sectionText(n.body, "As built")).matchAll(CITATION)) out.add(m[0].replace(/:\d+(?:-\d+)?$/, "").replace(/^\.\//, ""));
  return [...out];
}

/** The words of a title that could name a shared subject: four letters or more, not a stop word, lowercase. */
function titleWords(title: string): Set<string> {
  const out = new Set<string>();
  for (const w of title.toLowerCase().split(/[^\p{L}\p{N}]+/u)) if (/^\p{L}{4,}$/u.test(w) && !STOP.has(w)) out.add(w);
  return out;
}

/** "REQ-1.2 and REQ-5.1", or "REQ-1.2, REQ-2.1 and REQ-5.1". */
const names = (ids: string[]) => (ids.length <= 2 ? ids.join(" and ") : `${ids.slice(0, -1).join(", ")} and ${ids[ids.length - 1]}`);

/** What the nodes share, as the tail of a sentence about them. */
function reason(kind: Cluster["kind"], shared: string, count: number): string {
  const q = count === 2 ? "both" : "all";
  switch (kind) {
    case "term": return `${q} use the glossary term "${shared}"`;
    case "file": return `${q} cite ${shared} under Implemented by`;
    case "requires": return `${q} require ${shared}`;
    case "title": return `${q} have "${shared}" in their titles`;
  }
}

export function coherenceClusters(canon: Canon, opts: { maxSize?: number; rareWordMax?: number } = {}): Coherence {
  const maxSize = opts.maxSize ?? 12;
  const rareWordMax = opts.rareWordMax ?? 4;
  const nodes = Object.values(canon.nodes).sort((a, b) => compareIds(a.id, b.id));
  const groups: Record<Cluster["kind"], Map<string, Set<string>>> = { term: new Map(), file: new Map(), requires: new Map(), title: new Map() };
  const add = (kind: Cluster["kind"], shared: string, id: string) => {
    const set = groups[kind].get(shared);
    if (set) set.add(id);
    else groups[kind].set(shared, new Set([id]));
  };

  // term: the glossary's words in the entry's own text, Intent and Check, where the check looks for candidates too
  const seen = new Set<string>();
  for (const t of canon.terms) {
    const term = t.term.trim();
    if (!term || seen.has(term.toLowerCase())) continue;
    seen.add(term.toLowerCase());
    const re = termPattern(term);
    for (const n of nodes) if (re.test(`${sectionText(n.body, "Intent")}\n${sectionText(n.body, "Check")}`)) add("term", term, n.id);
  }
  for (const n of nodes) {
    // file: two entries read off the same code describe the same code
    for (const path of citedFiles(n)) add("file", path, n.id);
    // requires: a concept both need, which may belong at their common ancestor (REQ-3.15)
    for (const target of new Set(n.requires)) add("requires", target, n.id);
    for (const w of titleWords(n.title)) add("title", w, n.id);
  }

  const found: Cluster[] = [];
  for (const kind of KINDS) {
    const entries = [...groups[kind].entries()].sort(([a], [b]) => (kind === "requires" ? compareIds(a, b) : a.localeCompare(b)));
    for (const [shared, set] of entries) {
      // a word in many titles is the project's vocabulary, not a shared subject
      if (kind === "title" && set.size > rareWordMax) continue;
      const ids = [...set].sort(compareIds);
      const branches = [...new Set(ids.map((id) => branchOf(canon, id) ?? id))].sort(compareIds);
      // one branch's own repetitions are its refiner's business
      if (ids.length < 2 || branches.length < 2) continue;
      found.push({ key: `${kind}:${shared}`, kind, shared, nodes: ids, branches, why: `${names(ids)} ${reason(kind, shared, ids.length)}` });
    }
  }

  // the same set found twice is one reading with two reasons, not two readings
  const bySet = new Map<string, Cluster>();
  for (const c of found) {
    const prev = bySet.get(c.nodes.join(" "));
    if (prev) prev.why += `; also ${reason(c.kind, c.shared, c.nodes.length)}`;
    else bySet.set(c.nodes.join(" "), c);
  }
  const out: Coherence = { clusters: [], dropped: [] };
  for (const c of bySet.values()) {
    if (c.nodes.length > maxSize) out.dropped.push({ key: c.key, size: c.nodes.length });
    else out.clusters.push(c);
  }
  return out;
}

/** One line per cluster, its sentence and its key, then one line for what was too wide to read as one. */
export function describeCoherence(c: Coherence): string {
  const lines = c.clusters.map((x) => `${x.why} [${x.key}]`);
  if (c.dropped.length) lines.push(`Too wide to read as one: ${c.dropped.map((d) => `${d.key} (${d.size} nodes)`).join(", ")}`);
  return lines.length ? lines.join("\n") : "No cross-branch candidates.";
}
