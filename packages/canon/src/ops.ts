import { execSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { checkCanon } from "./check.js";
import { setField, upsertSection } from "./edits.js";
import { termId } from "./glossary.js";
import { descendants, loadCanon } from "./load.js";
import { requiresCycles } from "./next.js";
import { parseFrontMatter, parseGlossary } from "./parse.js";
import { isLayer, type Canon, type Layer, type ReqNode } from "./types.js";

/**
 * The operations on a canon that cross a writer's own files (DEC-024, the branch model): a refiner writes the
 * files of its own children and nothing else; everything that touches another node, the glossary or the shape of
 * the tree is an operation, passed up to the agent that owns the wider scope and applied here, deterministically,
 * checked, and logged. Every attempt is appended to the log with its outcome, so a retried correction, a refused
 * write and a review verdict all leave the same trace, and `headcanon op --stats` reads the retries per check.
 *
 * An operation is applied as a plan of file writes and removals; the canon is reloaded and checked afterwards,
 * and a plan that introduces a structural error is rolled back and refused with the errors as its reason.
 */

export type LinkKind = "relates" | "requires" | "conflicts";

export type Op =
  | { op: "link"; from: string; to: string; kind: LinkKind; why?: string }
  | { op: "unlink"; from: string; to: string; kind: LinkKind; why?: string }
  /** Dependency descent: on node `on`, the `requires` edge to `from` now points at `to`, a descendant of `from`. */
  | { op: "move-edge"; on: string; from: string; to: string; why?: string }
  | { op: "create"; under: string; title: string; intent: string; layer?: Layer; source?: string; state?: "assumed" | "open"; kind?: string; check?: string; asBuilt?: string[]; deferred?: string[]; open?: string[]; why?: string }
  /** Re-parent a subtree; ids mirror paths, so the subtree is renumbered and every reference follows. */
  | { op: "move"; id: string; under: string; layer?: Layer; why?: string }
  /** `from` says what `to` already says: `to` absorbs its evidence and edges, every reference follows, `from` goes. */
  | { op: "merge"; from: string; to: string; why?: string }
  | { op: "contest"; id: string; other?: string; summary: string; statements: Array<{ text: string; source: string }>; why?: string }
  | { op: "term"; term: string; definition: string; why?: string }
  | { op: "reword"; id: string; from: string; to: string; why?: string }
  | { op: "delete"; id: string; subtree?: boolean; why?: string }
  /** A guess the review could not get right becomes a draft: `state: open`, the diagnosis under Open; its question is filed apart. */
  | { op: "draft"; id: string; why: string }
  /** Record only: a review verdict on a node, so retries are counted and the budget is enforced. */
  | { op: "review"; id: string; verdict: "pass" | "fail"; findings?: Array<{ check: string; text: string }>; why?: string };

export interface OpResult {
  ok: boolean;
  /** Files written or removed, relative to the canon directory. */
  changes: string[];
  error?: string;
  /** Errors the plan would have introduced; the plan was rolled back. */
  newErrors?: string[];
  /** The id created, or the new id of a moved node. */
  id?: string;
  /** For a move: every renamed id. */
  renamed?: Record<string, string>;
  /** For a review: the count of failures since the last pass, and whether the budget is spent. */
  attempt?: number;
  exhausted?: boolean;
}

export interface OpRecord extends OpResult {
  at: string;
  by: string | undefined;
  request: Op;
}

/** How many failed reviews a node may take before it becomes a draft whose issue carries the diagnosis. */
export const RETRY_BUDGET = 2;

interface Plan {
  writes: Map<string, string>;
  removes: Set<string>;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rel = (canonDir: string, abs: string) => relative(canonDir, abs).split(sep).join("/");
const today = () => new Date().toISOString().slice(0, 10);

function slugOf(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "node";
}

function walkMd(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkMd(p, out);
    else if (e.isFile() && p.endsWith(".md")) out.push(p);
  }
  return out;
}

/** The next free child id under a parent, or the next top-level id for ROOT. */
function nextChildId(canon: Canon, parentId: string | undefined): string {
  if (parentId) {
    const used = (canon.nodes[parentId]?.children ?? []).map((c) => Number(c.slice(parentId.length + 1).split(".")[0])).filter(Number.isFinite);
    return `${parentId}.${(used.length ? Math.max(...used) : 0) + 1}`;
  }
  const used = canon.roots.map((r) => Number(r.replace(/^REQ-/, "").split(".")[0])).filter(Number.isFinite);
  return `REQ-${(used.length ? Math.max(...used) : 0) + 1}`;
}

/** Set a front-matter list, inline; an older block-form list under the key is removed first. An empty list removes the key. */
export function setListField(text: string, key: string, values: string[]): string {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return values.length ? `---\n${key}: [${values.join(", ")}]\n---\n\n${text}` : text;
  const lines = m[1]!.split(/\r?\n/);
  const i = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (i >= 0) {
    let end = i + 1;
    while (end < lines.length && /^\s+-\s/.test(lines[end] ?? "")) end++;
    lines.splice(i, end - i, ...(values.length ? [`${key}: [${values.join(", ")}]`] : []));
  } else if (values.length) lines.push(`${key}: [${values.join(", ")}]`);
  return `---\n${lines.join("\n")}\n---\n` + text.slice(m[0].length);
}

/** Replace node ids by a map, longest first, never inside a longer id (REQ-1 is not REQ-10 nor REQ-1.2). */
export function rewriteIds(text: string, map: Map<string, string>): string {
  let out = text;
  for (const old of [...map.keys()].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(`(?<![A-Za-z])${escapeRe(old)}(?![\\d]|\\.\\d)`, "g"), map.get(old)!);
  }
  return out;
}

/** Bullets under one `## Heading`. */
function bulletsOf(body: string, heading: string): string[] {
  const re = new RegExp(`^##[ \\t]+${escapeRe(heading)}\\b[^\\n]*\\n([\\s\\S]*?)(?=^##[ \\t]|(?![\\s\\S]))`, "m");
  const sec = re.exec(body)?.[1] ?? "";
  return sec.split(/\r?\n/).filter((l) => /^\s*-\s+/.test(l)).map((l) => l.replace(/^\s*-\s+/, "").trim());
}

/** The front matter and body of a node file, with the body's leading newline trimmed. */
function readNode(canon: Canon, n: ReqNode): string {
  return readFileSync(resolve(canon.dir, n.file), "utf8");
}

const uniq = (xs: string[]) => [...new Set(xs)];

/** The directory a parent's children live in; a leaf parent becomes a folder with a README in the plan. */
function childDirFor(canon: Canon, plan: Plan, parent: ReqNode | undefined): string {
  if (!parent) return canon.dir;
  const abs = resolve(canon.dir, parent.file);
  if (basename(abs) === "README.md") return dirname(abs);
  const folder = abs.replace(/\.md$/, "");
  plan.writes.set(join(folder, "README.md"), plan.writes.get(abs) ?? readFileSync(abs, "utf8"));
  plan.removes.add(abs);
  return folder;
}

function nodeTemplate(o: Extract<Op, { op: "create" }>, id: string, parentId: string | undefined, layer: Layer): string {
  const fm = [`id: ${id}`, ...(parentId ? [`parent: ${parentId}`] : []), `title: "${o.title.replace(/"/g, "'")}"`, `state: ${o.state ?? "assumed"}`, `layer: ${layer}`, ...(o.source ? [`source: "${o.source.replace(/"/g, "'")}"`] : []), ...(o.kind ? [`kind: ${o.kind}`] : [])];
  const parts = [`---\n${fm.join("\n")}\n---`, `# ${o.title}`, `## Intent\n\n${o.intent.trim()}`];
  if (o.check) parts.push(`## Check\n\n${o.check.trim()}`);
  if (o.asBuilt?.length) parts.push(`## As built\n\n${o.asBuilt.map((b) => `- ${b}`).join("\n")}`);
  if (o.deferred?.length) parts.push(`## Deferred\n\n${o.deferred.map((b) => `- ${b}`).join("\n")}`);
  if (o.open?.length) parts.push(`## Open\n\n${o.open.map((b) => `- ${today()}: ${b}`).join("\n")}`);
  return parts.join("\n\n") + "\n";
}

const approvedState = (n: ReqNode | undefined) => n?.state === "stated" || n?.state === "resolved";

/** Build the plan for one operation, or return the reason it cannot be built. */
function planOp(canon: Canon, op: Op, queuePath: string | undefined): { plan: Plan; result: Partial<OpResult> } | { error: string } {
  const plan: Plan = { writes: new Map(), removes: new Set() };
  const node = (id: string) => canon.nodes[id];
  const must = (id: string) => (node(id) ? undefined : `${id} is not in the canon`);
  const write = (n: ReqNode, text: string) => plan.writes.set(resolve(canon.dir, n.file), text);
  const current = (n: ReqNode) => plan.writes.get(resolve(canon.dir, n.file)) ?? readNode(canon, n);

  switch (op.op) {
    case "link":
    case "unlink": {
      const err = must(op.from) ?? must(op.to);
      if (err) return { error: err };
      if (op.from === op.to) return { error: `${op.from} cannot ${op.kind} itself` };
      if (!["relates", "requires", "conflicts"].includes(op.kind)) return { error: `unknown link kind ${String(op.kind)}` };
      const n = node(op.from)!;
      const have = n[op.kind];
      const next = op.op === "link" ? uniq([...have, op.to]) : have.filter((x) => x !== op.to);
      if (next.length === have.length && op.op === "link" && have.includes(op.to)) return { plan, result: { id: op.from } };
      if (op.op === "link" && op.kind === "requires") {
        const probe: Canon = { ...canon, nodes: { ...canon.nodes, [op.from]: { ...n, requires: next } } };
        const cycles = requiresCycles(probe);
        if (cycles.length) return { error: `${op.from} requires ${op.to} would close a cycle: ${cycles[0]!.join(" > ")}; lift the shared concept to their common ancestor instead` };
      }
      write(n, setListField(current(n), op.kind, next));
      return { plan, result: { id: op.from } };
    }
    case "move-edge": {
      const err = must(op.on) ?? must(op.from) ?? must(op.to);
      if (err) return { error: err };
      const n = node(op.on)!;
      if (!n.requires.includes(op.from)) return { error: `${op.on} does not require ${op.from}` };
      if (!descendants(canon, op.from).includes(op.to)) return { error: `${op.to} is not under ${op.from}: an edge descends to the child that holds the concept, never elsewhere` };
      write(n, setListField(current(n), "requires", uniq(n.requires.map((x) => (x === op.from ? op.to : x)))));
      return { plan, result: { id: op.on } };
    }
    case "create": {
      const parentId = op.under === "ROOT" ? undefined : op.under;
      if (parentId && !node(parentId)) return { error: `${op.under} is not in the canon` };
      if (!op.title?.trim()) return { error: "a title is required" };
      if (!op.intent?.trim()) return { error: "an Intent is required: one line of what is known, at least" };
      if (op.layer && !isLayer(op.layer)) return { error: `unknown layer ${String(op.layer)}` };
      const parent = parentId ? node(parentId) : undefined;
      const id = nextChildId(canon, parentId);
      const depth = parent ? parent.depth + 1 : 0;
      const layer: Layer = op.layer ?? (["domain", "capability", "requirement"][Math.min(depth, 2)] as Layer);
      const dir = childDirFor(canon, plan, parent);
      plan.writes.set(join(dir, `${id}-${slugOf(op.title)}.md`), nodeTemplate(op, id, parentId, layer));
      return { plan, result: { id } };
    }
    case "move": {
      const err = must(op.id);
      if (err) return { error: err };
      const parentId = op.under === "ROOT" ? undefined : op.under;
      if (parentId && !node(parentId)) return { error: `${op.under} is not in the canon` };
      const n = node(op.id)!;
      if (parentId === op.id || (parentId && descendants(canon, op.id).includes(parentId))) return { error: `${op.under} is under ${op.id}; a box cannot move into itself` };
      if ((n.parent ?? undefined) === parentId) return { plan, result: { id: op.id } };
      const parent = parentId ? node(parentId) : undefined;
      const layer = op.layer ?? (n.layerExplicit ? n.layer : undefined);
      const rank: Record<Layer, number> = { domain: 0, capability: 1, requirement: 2 };
      if (layer && parent?.layerExplicit && rank[layer] < rank[parent.layer]) return { error: `${op.id} is a ${layer}; it cannot sit under ${parent.id}, a ${parent.layer}; give it a layer at or below its new parent's` };
      const newId = nextChildId(canon, parentId);
      const sub = [op.id, ...descendants(canon, op.id)];
      const idMap = new Map(sub.map((x) => [x, newId + x.slice(op.id.length)]));
      const rootAbs = resolve(canon.dir, n.file);
      const folder = basename(rootAbs) === "README.md" ? dirname(rootAbs) : undefined;
      const files = folder ? walkMd(folder) : [rootAbs];
      const base = folder ? dirname(folder) : dirname(rootAbs);
      const newDir = childDirFor(canon, plan, parent);
      for (const f of files) {
        const segs = relative(base, f).split(sep).map((seg) => seg.replace(/^(REQ-[\d.]+)(?=-|\.md$|$)/, (m) => idMap.get(m) ?? m));
        let text = rewriteIds(readFileSync(f, "utf8"), idMap);
        if (f === rootAbs) {
          text = parentId ? setField(text, "parent", parentId) : text.replace(/^parent:.*\r?\n/m, "");
          if (op.layer) text = setField(text, "layer", op.layer);
        }
        plan.writes.set(join(newDir, ...segs), text);
        plan.removes.add(f);
      }
      // every other file that names a moved id follows: edges, journeys, decisions, prose; a file the plan already
      // rewrites (the new parent's README) is rewritten in the plan, never read back from disk
      for (const f of walkMd(canon.dir)) {
        if (files.includes(f) || plan.removes.has(f) || plan.writes.has(f)) continue;
        const text = readFileSync(f, "utf8");
        const next = rewriteIds(text, idMap);
        if (next !== text) plan.writes.set(f, next);
      }
      for (const [abs, text] of plan.writes) if (!abs.endsWith(".json")) plan.writes.set(abs, rewriteIds(text, idMap));
      if (queuePath && existsSync(queuePath)) plan.writes.set(queuePath, rewriteQueue(readFileSync(queuePath, "utf8"), idMap));
      return { plan, result: { id: newId, renamed: Object.fromEntries(idMap) } };
    }
    case "merge": {
      const err = must(op.from) ?? must(op.to);
      if (err) return { error: err };
      if (op.from === op.to) return { error: `${op.from} cannot absorb itself` };
      const from = node(op.from)!, to = node(op.to)!;
      if (from.children.length) return { error: `${op.from} has children; move or merge them first` };
      if (approvedState(from)) return { error: `${op.from} is the human's; a merge of an approved box is asked, never applied` };
      let text = current(to);
      for (const kind of ["relates", "requires", "conflicts"] as const) {
        const union = uniq([...to[kind], ...from[kind]]).filter((x) => x !== op.to && x !== op.from);
        if (union.length !== to[kind].length || union.some((x) => !to[kind].includes(x))) text = setListField(text, kind, union);
      }
      const built = bulletsOf(from.body, "As built"), toBuilt = bulletsOf(to.body, "As built");
      if (built.some((b) => !toBuilt.includes(b))) text = upsertSection(text, "As built", uniq([...toBuilt, ...built]).map((b) => `- ${b}`).join("\n"));
      const deferred = bulletsOf(from.body, "Deferred"), toDeferred = bulletsOf(to.body, "Deferred");
      if (deferred.some((b) => !toDeferred.includes(b))) text = upsertSection(text, "Deferred", uniq([...toDeferred, ...deferred]).map((b) => `- ${b}`).join("\n"));
      if (from.source && from.source !== to.source) text = setField(text, "source", `"${[to.source, from.source].filter(Boolean).join("; ").replace(/"/g, "'")}"`);
      write(to, text);
      const idMap = new Map([[op.from, op.to]]);
      const fromAbs = resolve(canon.dir, from.file);
      for (const f of walkMd(canon.dir)) {
        if (f === fromAbs || f === resolve(canon.dir, to.file)) continue;
        const t = readFileSync(f, "utf8");
        const nx = rewriteIds(t, idMap);
        if (nx !== t) plan.writes.set(f, nx);
      }
      // a node that both related to and now requires itself through the merge is cleaned above; others may now list `to` twice
      for (const [abs, t] of plan.writes) {
        if (abs === resolve(canon.dir, to.file) || abs.endsWith(".json")) continue;
        const { data } = parseFrontMatter(t);
        let out = t;
        for (const kind of ["relates", "requires", "conflicts"] as const) {
          const list = Array.isArray(data[kind]) ? (data[kind] as unknown[]).map(String) : typeof data[kind] === "string" ? String(data[kind]).split(",").map((s) => s.trim()).filter(Boolean) : [];
          const clean = uniq(list).filter((x) => x !== String(data["id"]));
          if (clean.length !== list.length) out = setListField(out, kind, clean);
        }
        if (out !== t) plan.writes.set(abs, out);
      }
      plan.removes.add(fromAbs);
      if (queuePath && existsSync(queuePath)) plan.writes.set(queuePath, rewriteQueue(readFileSync(queuePath, "utf8"), idMap));
      return { plan, result: { id: op.to } };
    }
    case "contest": {
      const err = must(op.id) ?? (op.other ? must(op.other) : undefined);
      if (err) return { error: err };
      if (!op.summary?.trim() || !Array.isArray(op.statements) || op.statements.length < 2) return { error: "a contest needs a summary and at least two statements with their sources" };
      const body = `${op.summary.trim()}\n\n${op.statements.map((s) => `- ${s.text.trim()} (${s.source.trim()})`).join("\n")}`;
      for (const id of uniq([op.id, ...(op.other ? [op.other] : [])])) {
        const n = node(id)!;
        let text = setField(current(n), "state", "contested");
        text = upsertSection(text, "Contested", body);
        if (op.other) text = setListField(text, "conflicts", uniq([...n.conflicts, id === op.id ? op.other : op.id]));
        write(n, text);
      }
      return { plan, result: { id: op.id } };
    }
    case "term": {
      if (!canon.root) return { error: "no root README to hold the glossary" };
      if (!op.term?.trim() || !op.definition?.trim()) return { error: "a term needs the word and its definition" };
      const term = op.term.trim(), def = op.definition.trim().replace(/\s+/g, " ");
      const existing = parseGlossary(canon.root.body).find((t) => t.term.toLowerCase() === term.toLowerCase() || t.id === termId(term));
      if (existing && (existing.state === "stated" || existing.state === "resolved")) return { error: `${existing.term} is the human's term; a change to it is asked, never applied` };
      const abs = resolve(canon.dir, canon.root.file);
      const text = plan.writes.get(abs) ?? readFileSync(abs, "utf8");
      const line = `**${existing?.term ?? term}** (\`${existing?.id ?? termId(term)}\`) [assumed]: ${def}`;
      const lines = text.split(/\r?\n/);
      if (existing) {
        const i = lines.findIndex((l) => l.includes(`(\`${existing.id}\`)`));
        if (i < 0) return { error: `${existing.id} was read but not found in the file` };
        lines[i] = line;
      } else {
        const head = lines.findIndex((l) => /^##\s+Glossary\b/.test(l));
        if (head < 0) lines.push("", "## Glossary [assumed]", "", line);
        else {
          let end = lines.findIndex((l, i) => i > head && /^##\s/.test(l));
          if (end < 0) end = lines.length;
          while (end > head + 1 && !(lines[end - 1] ?? "").trim()) end--;
          lines.splice(end, 0, line);
        }
      }
      plan.writes.set(abs, lines.join("\n").replace(/\n{3,}/g, "\n\n"));
      return { plan, result: { id: existing?.id ?? termId(term) } };
    }
    case "reword": {
      const err = must(op.id);
      if (err) return { error: err };
      const n = node(op.id)!;
      if (approvedState(n)) return { error: `${op.id} is the human's words; a rewording is asked, never applied` };
      if (!op.from?.trim() || typeof op.to !== "string") return { error: "a reword needs the phrase to replace and its replacement" };
      const re = new RegExp(`(?<![A-Za-z0-9])${escapeRe(op.from.trim())}(?![A-Za-z0-9])`, "g");
      const text = current(n);
      let count = 0;
      const out = text.replace(re, () => { count++; return op.to; });
      if (!count) return { error: `"${op.from}" does not occur in ${op.id}` };
      write(n, out);
      return { plan, result: { id: op.id } };
    }
    case "delete": {
      const err = must(op.id);
      if (err) return { error: err };
      const n = node(op.id)!;
      if (n.children.length && !op.subtree) return { error: `${op.id} has children; pass subtree: true to remove them too` };
      const gone = new Set([op.id, ...descendants(canon, op.id)]);
      if ([...gone].some((x) => approvedState(node(x)))) return { error: `${op.id} or a box under it is the human's; a deletion of an approved box is asked, never applied` };
      const abs = resolve(canon.dir, n.file);
      for (const f of basename(abs) === "README.md" ? walkMd(dirname(abs)) : [abs]) plan.removes.add(f);
      for (const other of Object.values(canon.nodes)) {
        if (gone.has(other.id)) continue;
        let text: string | undefined;
        for (const kind of ["relates", "requires", "conflicts"] as const) {
          if (!other[kind].some((x) => gone.has(x))) continue;
          text = setListField(text ?? current(other), kind, other[kind].filter((x) => !gone.has(x)));
        }
        if (text) write(other, text);
      }
      for (const d of canon.decisions) {
        if (!d.intents.some((x) => gone.has(x))) continue;
        const abs2 = resolve(canon.dir, d.file);
        plan.writes.set(abs2, setListField(readFileSync(abs2, "utf8"), "intents", d.intents.filter((x) => !gone.has(x))));
      }
      return { plan, result: { id: op.id } };
    }
    case "draft": {
      const err = must(op.id);
      if (err) return { error: err };
      const n = node(op.id)!;
      if (approvedState(n)) return { error: `${op.id} is the human's; it is never made a draft, its problem is an issue` };
      if (!op.why?.trim()) return { error: "a draft needs the diagnosis: why the guess could not be made right" };
      let text = setField(current(n), "state", "open");
      text = upsertSection(text, "Open", [...bulletsOf(n.body, "Open"), `${today()}: made a draft by review: ${op.why.trim()}`].map((b) => `- ${b}`).join("\n"));
      write(n, text);
      return { plan, result: { id: op.id } };
    }
    case "review": {
      const err = must(op.id);
      if (err) return { error: err };
      if (op.verdict !== "pass" && op.verdict !== "fail") return { error: "a review's verdict is pass or fail" };
      return { plan, result: { id: op.id } };
    }
    default:
      return { error: `unknown operation ${String((op as { op?: unknown }).op)}` };
  }
}

/** The queue file with its node ids mapped. */
function rewriteQueue(text: string, map: Map<string, string>): string {
  try {
    const data = JSON.parse(text) as { queue?: Array<{ nodeId?: string }> };
    for (const q of data.queue ?? []) if (q.nodeId && map.has(q.nodeId)) q.nodeId = map.get(q.nodeId)!;
    return JSON.stringify(data, null, 2);
  } catch {
    return text;
  }
}

/** Apply a plan, keeping what it overwrote so it can be undone. */
function commit(plan: Plan): () => void {
  const originals = new Map<string, string | null>();
  const remember = (p: string) => { if (!originals.has(p)) originals.set(p, existsSync(p) ? readFileSync(p, "utf8") : null); };
  for (const p of plan.removes) remember(p);
  for (const p of plan.writes.keys()) remember(p);
  for (const p of plan.removes) if (!plan.writes.has(p)) rmSync(p, { force: true });
  for (const [p, text] of plan.writes) { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); }
  return () => {
    for (const [p, text] of originals) {
      if (text === null) rmSync(p, { force: true });
      else { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); }
    }
  };
}

/** Remove the directories a plan emptied, up to the canon directory. */
function pruneEmpty(canonDir: string, plan: Plan): void {
  const dirs = new Set([...plan.removes].map((p) => dirname(p)));
  for (let d of dirs) {
    while (d.startsWith(canonDir) && d !== canonDir && existsSync(d) && readdirSync(d).length === 0) { rmdirSync(d); d = dirname(d); }
  }
}

const errorKeys = (canon: Canon) => new Set(checkCanon(canon).filter((f) => f.level === "error").map((f) => `${f.code}:${f.id ?? f.file ?? ""}`));

const gitDirs = new Map<string, string | undefined>();
/** The repository's git directory, where the question queue and the operations log live beside each other. */
export function gitDirOf(canonDir: string): string | undefined {
  if (!gitDirs.has(canonDir)) {
    try { gitDirs.set(canonDir, execSync("git rev-parse --absolute-git-dir", { cwd: dirname(canonDir), stdio: ["ignore", "pipe", "ignore"] }).toString().trim()); }
    catch { gitDirs.set(canonDir, undefined); }
  }
  return gitDirs.get(canonDir);
}

export interface ApplyOptions {
  /** Who asked: an agent or node id, for the log. */
  by?: string;
  /** The log file; by default `<git dir>/headcanon/ops.jsonl`; false for none. */
  log?: string | false;
  /** The question queue file whose node ids follow a move or a merge; by default beside the log. */
  queue?: string;
}

/** Apply one operation to the canon at `canonDir`: plan, write, reload, check, keep or roll back, log. */
export function applyOp(canonDir: string, op: Op, opts: ApplyOptions = {}): OpResult {
  const dir = resolve(canonDir);
  const git = gitDirOf(dir);
  const logPath = opts.log === false ? undefined : opts.log ?? (git ? join(git, "headcanon", "ops.jsonl") : undefined);
  const queuePath = opts.queue ?? (git ? join(git, "headcanon", "questions.json") : undefined);
  const record = (r: OpResult): OpResult => {
    if (logPath) {
      const entry: OpRecord = { at: new Date().toISOString(), by: opts.by, request: op, ...r };
      try { mkdirSync(dirname(logPath), { recursive: true }); appendFileSync(logPath, JSON.stringify(entry) + "\n"); } catch { /* the operation stands without its log line */ }
    }
    return r;
  };
  const canon = loadCanon(dir);
  if (op.op === "review") {
    const prior = logPath ? readOps(logPath).filter((e) => e.request.op === "review" && e.request.id === op.id) : [];
    const sinceLastPass = prior.slice(prior.map((e) => (e.request as { verdict?: string }).verdict).lastIndexOf("pass") + 1);
    const fails = sinceLastPass.filter((e) => (e.request as { verdict?: string }).verdict === "fail").length + (op.verdict === "fail" ? 1 : 0);
    const planned = planOp(canon, op, queuePath);
    if ("error" in planned) return record({ ok: false, changes: [], error: planned.error });
    const attempt = op.verdict === "fail" ? fails : 0;
    return record({ ok: true, changes: [], id: op.id, attempt, exhausted: attempt > RETRY_BUDGET });
  }
  const planned = planOp(canon, op, queuePath);
  if ("error" in planned) return record({ ok: false, changes: [], error: planned.error });
  const { plan, result } = planned;
  const touched = uniq([...plan.writes.keys(), ...plan.removes]).filter((p) => p.startsWith(dir)).map((p) => rel(dir, p)).sort();
  if (!touched.length && !plan.writes.size) return record({ ok: true, changes: [], ...result });
  const before = errorKeys(canon);
  const undo = commit(plan);
  const after = errorKeys(loadCanon(dir));
  const newErrors = [...after].filter((k) => !before.has(k));
  if (newErrors.length) {
    undo();
    return record({ ok: false, changes: [], error: `refused: the operation would introduce ${newErrors.length} error(s): ${newErrors.join(", ")}`, newErrors });
  }
  pruneEmpty(dir, plan);
  return record({ ok: true, changes: touched, ...result });
}

/** The log, oldest first; a missing log is empty. */
export function readOps(logPath: string, nodeId?: string): OpRecord[] {
  if (!existsSync(logPath)) return [];
  const out: OpRecord[] = [];
  for (const line of readFileSync(logPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line) as OpRecord); } catch { /* a torn line is skipped */ }
  }
  return nodeId ? out.filter((e) => JSON.stringify(e.request).includes(`"${nodeId}"`)) : out;
}

export interface OpStats {
  byOp: Record<string, { ok: number; failed: number }>;
  /** Review failures per check name, the retries each rule costs. */
  byCheck: Record<string, number>;
  /** Nodes with their failed reviews since the last pass, most first. */
  retries: Array<{ id: string; fails: number; exhausted: boolean }>;
}

/** What the log says about how the process behaves: which operations fail, which checks cause retries, which nodes exhaust the budget. */
export function opStats(records: OpRecord[]): OpStats {
  const byOp: OpStats["byOp"] = {};
  const byCheck: OpStats["byCheck"] = {};
  const fails = new Map<string, number>();
  for (const e of records) {
    const s = (byOp[e.request.op] ??= { ok: 0, failed: 0 });
    if (e.ok) s.ok++; else s.failed++;
    if (e.request.op === "review") {
      if (e.request.verdict === "pass") fails.set(e.request.id, 0);
      else {
        fails.set(e.request.id, (fails.get(e.request.id) ?? 0) + 1);
        for (const f of e.request.findings ?? []) byCheck[f.check] = (byCheck[f.check] ?? 0) + 1;
      }
    }
  }
  const retries = [...fails].filter(([, n]) => n > 0).map(([id, n]) => ({ id, fails: n, exhausted: n > RETRY_BUDGET })).sort((a, b) => b.fails - a.fails || a.id.localeCompare(b.id));
  return { byOp, byCheck, retries };
}

/** The operation's file state check helper for callers that only need the mtime of a path. */
export function mtimeOf(p: string): number {
  try { return statSync(p).mtimeMs; } catch { return 0; }
}
