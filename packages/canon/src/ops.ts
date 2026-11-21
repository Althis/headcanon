import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { journalRecord, readTextOrNull } from "./journal.js";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { checkCanon } from "./check.js";
import { setField, upsertSection } from "./edits.js";
import { termId } from "./glossary.js";
import { descendants, loadCanon } from "./load.js";
import { requiresCycles } from "./next.js";
import { parseFrontMatter, parseGlossary, strList } from "./parse.js";
import { isLayer, type Canon, type Layer, type ReqNode } from "./types.js";

/**
 * The operations on a canon that cross a writer's own files (DEC-024, the branch model): a refiner writes the
 * files of its own children and nothing else; everything that touches another node, the glossary or the shape of
 * the tree is an operation, passed up to the agent that owns the wider scope and applied here, deterministically,
 * checked, and logged. Every attempt is appended to the log with its outcome, so a retried correction, a refused
 * write and a review verdict all leave the same trace, and `headcanon op --stats` reads the retries per check.
 *
 * The operations: `link`, `unlink` and `move-edge` on the typed edges; `create`, `move`, `merge` and `delete` on the
 * shape of the tree; `contest`, `reword`, `draft` and `note` on one node's text and state; `bind` and `unbind` on its
 * evidence; `term` on the glossary; `journey` on a guessed journey's file; and three that write nothing and only leave
 * their trace: `review`, the verdict counted against the retry budget, and `dispatch` and `returned`, which nodes a
 * running agent holds, so a session that compacts reads them back.
 *
 * An operation is applied as a plan of file writes and removals; the canon is reloaded and checked afterwards,
 * and a plan that introduces a structural error is rolled back and refused with the errors as its reason.
 *
 * The name an operation arrives under (`by`) is its border: a refiner and a tester write inside their capability, an
 * implementation agent adds guessed nodes and nothing else (`scopeOp`). What falls outside is refused here and
 * recorded as a proposal (`proposals.ts`) for the session to apply.
 */

export type LinkKind = "relates" | "requires" | "conflicts";

/** One step of a journey as an operation carries it: what the user does, the nodes it exercises, and what is given, done and seen. */
export interface JourneyStepInput { label: string; requirements: string[]; given?: string; does?: string; sees?: string }

export type Op =
  | { op: "link"; from: string; to: string; kind: LinkKind; why?: string }
  | { op: "unlink"; from: string; to: string; kind: LinkKind; why?: string }
  /** Dependency descent: on node `on`, the `requires` edge to `from` now points at `to`, a descendant of `from`. */
  | { op: "move-edge"; on: string; from: string; to: string; why?: string }
  | { op: "create"; under: string; title: string; intent: string; layer?: Layer; source?: string; state?: "assumed" | "draft"; kind?: string; check?: string; implementedBy?: string[]; binds?: string[]; deferred?: string[]; open?: string[]; why?: string }
  /** Bind evidence to a node: a code unit, a cluster or a claim, with how it relates (DEC-025). */
  | { op: "bind"; id: string; unit: string; relation: "implements" | "contributes" | "contradicts"; why?: string }
  | { op: "unbind"; id: string; unit: string; why?: string }
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
  /** A dated observation under Open on a guess, its state unchanged; an approved node's drift is an issue, never a note. */
  | { op: "note"; id: string; text: string; why?: string }
  /** A guessed journey: a new `journeys/JRN-n-<slug>.md`, or with `id` the steps of an assumed one rewritten; an approved journey is never rewritten. */
  | { op: "journey"; id?: string; title: string; steps: JourneyStepInput[]; source?: string; state?: "assumed"; why?: string }
  /** Record only: a review verdict on a node, so retries are counted and the budget is enforced. */
  | { op: "review"; id: string; verdict: "pass" | "fail"; findings?: Array<{ check: string; text: string }>; why?: string }
  /** Record only: a node handed to a running agent, and its return, so a session that compacts reads back what is held. */
  | { op: "dispatch"; id: string; agent?: string; why?: string }
  | { op: "returned"; id: string; why?: string };

export const OP_NAMES: readonly Op["op"][] = ["link", "unlink", "move-edge", "create", "bind", "unbind", "move", "merge", "contest", "term", "reword", "delete", "draft", "note", "journey", "review", "dispatch", "returned"];

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
    // as the loader walks: a `.MD` file is a node, so it must move and go with the rest
    else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) out.push(p);
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

/** The text under one `## Heading`, up to the next; empty when the section is absent. */
function sectionOf(body: string, heading: string): string {
  const re = new RegExp(`^##[ \\t]+${escapeRe(heading)}\\b[^\\n]*\\n([\\s\\S]*?)(?=^##[ \\t]|(?![\\s\\S]))`, "m");
  return re.exec(body)?.[1] ?? "";
}

const isBullet = (l: string) => /^\s*-\s+/.test(l);

/** Bullets under one `## Heading`. */
function bulletsOf(body: string, heading: string): string[] {
  return sectionOf(body, heading).split(/\r?\n/).filter(isBullet).map((l) => l.replace(/^\s*-\s+/, "").trim());
}

/** The prose under one `## Heading`, its bullets left out, as one paragraph. */
function proseOf(body: string, heading: string): string {
  return sectionOf(body, heading).split(/\r?\n/).filter((l) => !isBullet(l)).join(" ").replace(/\s+/g, " ").trim();
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
  const folder = abs.replace(/\.md$/i, "");
  plan.writes.set(join(folder, "README.md"), plan.writes.get(abs) ?? readFileSync(abs, "utf8"));
  plan.removes.add(abs);
  return folder;
}

/** A stable id for a node: six characters that survive a move (DEC-025). */
export function newUid(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (const b of randomBytes(6)) out += alphabet[b % alphabet.length];
  return out;
}

/** A front-matter value in double quotes that YAML reads back as written: a backslash there starts an escape, so a path like `src\ops.ts` is doubled. */
const quoted = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, "'")}"`;

function nodeTemplate(o: Extract<Op, { op: "create" }>, id: string, parentId: string | undefined, layer: Layer): string {
  const fm = [`id: ${id}`, ...(parentId ? [`parent: ${parentId}`] : []), `title: ${quoted(o.title)}`, `state: ${o.state ?? "assumed"}`, `layer: ${layer}`, ...(o.source ? [`source: ${quoted(o.source)}`] : []), ...(o.kind ? [`kind: ${o.kind}`] : []), `uid: ${newUid()}`, ...(o.binds?.length ? [`binds: [${o.binds.map(quoted).join(", ")}]`] : [])];
  const parts = [`---\n${fm.join("\n")}\n---`, `# ${o.title}`, `## Intent\n\n${o.intent.trim()}`];
  if (o.check) parts.push(`## Check\n\n${o.check.trim()}`);
  if (o.implementedBy?.length) parts.push(`## Implemented by\n\n${o.implementedBy.map((b) => `- ${b}`).join("\n")}`);
  if (o.deferred?.length) parts.push(`## Deferred\n\n${o.deferred.map((b) => `- ${b}`).join("\n")}`);
  if (o.open?.length) parts.push(`## Open\n\n${o.open.map((b) => `- ${today()}: ${b}`).join("\n")}`);
  return parts.join("\n\n") + "\n";
}

const approvedState = (n: { state: string } | undefined) => n?.state === "stated" || n?.state === "resolved";

const FRONT = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
/** One line of prose that fits a table cell: a bar would end the cell, a line break the row. */
const cellText = (s: string | undefined) => (typeof s === "string" ? s : "").replace(/\s+/g, " ").replace(/\|/g, "/").trim();

/** A journey's steps in the two forms its file holds: the Mermaid graph, and the table the loader reads (`parseStepTable`). */
function journeySteps(steps: JourneyStepInput[]): { graph: string; table: string } {
  const labels = steps.map((s) => cellText(s.label));
  const node = (i: number) => `S${i + 1}["${labels[i]!.replace(/"/g, "'")}"]`;
  const edges = steps.length > 1 ? steps.slice(1).map((_s, i) => `    ${i === 0 ? node(0) : `S${i + 1}`} --> ${node(i + 1)}`) : [`    ${node(0)}`];
  const detail = steps.some((s) => cellText(s.given) || cellText(s.does) || cellText(s.sees));
  const head = ["Step", "State", "Linked requirements", ...(detail ? ["Given", "Does", "Sees"] : [])];
  const rows = steps.map((s, i) => [`S${i + 1} ${labels[i]}`, "assumed", uniq(s.requirements.map((r) => r.trim())).join(", "), ...(detail ? [cellText(s.given), cellText(s.does), cellText(s.sees)] : [])]);
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return { graph: ["```mermaid", "flowchart TD", ...edges, "```"].join("\n"), table: [line(head), line(head.map(() => "---")), ...rows.map(line)].join("\n") };
}

/** A journey file with its graph and its step table replaced where they stand; the prose around them is kept. */
function replaceJourneySteps(text: string, graph: string, table: string): string {
  const lines = text.split("\n");
  const first = lines.findIndex((l) => /^\|\s*S\d+\b/.test(l));
  let out: string;
  if (first < 0) out = text.replace(/\s*$/, "\n\n") + table + "\n";
  else {
    let start = first, end = first;
    while (start > 0 && lines[start - 1]!.startsWith("|")) start--;
    while (end + 1 < lines.length && lines[end + 1]!.startsWith("|")) end++;
    lines.splice(start, end - start + 1, ...table.split("\n"));
    out = lines.join("\n");
  }
  const fence = /```mermaid\n[\s\S]*?```/;
  if (fence.test(out)) return out.replace(fence, () => graph);
  const at = out.indexOf(table);
  return `${out.slice(0, at)}${graph}\n\n${out.slice(at)}`;
}

/** The requires cycle that `id` holding `requires` would close, probed on a copy before anything is written. */
function cycleWith(canon: Canon, id: string, requires: string[]): string[] | undefined {
  const n = canon.nodes[id];
  if (!n) return undefined;
  const cycles = requiresCycles({ ...canon, nodes: { ...canon.nodes, [id]: { ...n, requires } } });
  return cycles.find((c) => c.includes(id)) ?? cycles[0];
}

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
        const cycle = cycleWith(canon, op.from, next);
        if (cycle) return { error: `${op.from} requires ${op.to} would close a cycle: ${cycle.join(" > ")}; lift the shared concept to their common ancestor instead` };
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
      const next = uniq(n.requires.map((x) => (x === op.from ? op.to : x)));
      // the child may require `on` back where its parent did not: the descent would close a cycle the check refuses after the write
      const cycle = cycleWith(canon, op.on, next);
      if (cycle) return { error: `${op.on} requires ${op.to} would close a cycle: ${cycle.join(" > ")}; lift the shared concept to their common ancestor instead` };
      write(n, setListField(current(n), "requires", next));
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
      // the layer follows what the node is and where it hangs, never its depth: a node with a kind is a requirement, and a
      // project with no domain layer has capabilities at the top whose children are requirements all the same
      const below: Record<Layer, Layer> = { domain: "capability", capability: "requirement", requirement: "requirement" };
      const layer: Layer = op.layer ?? (op.kind ? "requirement" : parent ? below[parent.layer] : "domain");
      const dir = childDirFor(canon, plan, parent);
      plan.writes.set(join(dir, `${id}-${slugOf(op.title)}.md`), nodeTemplate(op, id, parentId, layer));
      return { plan, result: { id } };
    }
    case "move": {
      const err = must(op.id);
      if (err) return { error: err };
      const parentId = op.under === "ROOT" ? undefined : op.under;
      if (parentId && !node(parentId)) return { error: `${op.under} is not in the canon` };
      if (op.layer && !isLayer(op.layer)) return { error: `unknown layer ${String(op.layer)}` };
      const n = node(op.id)!;
      if (parentId === op.id || (parentId && descendants(canon, op.id).includes(parentId))) return { error: `${op.under} is under ${op.id}; a node cannot move into itself` };
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
        const segs = relative(base, f).split(sep).map((seg) => seg.replace(/^(REQ-[\d.]+)(?=-|\.md$|$)/i, (m) => idMap.get(m) ?? m));
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
      if (approvedState(from)) return { error: `${op.from} is the user's; a merge of an approved node is asked, never applied` };
      const idMap = new Map([[op.from, op.to]]);
      let text = current(to);
      for (const kind of ["relates", "requires", "conflicts"] as const) {
        const union = uniq([...to[kind], ...from[kind]]).filter((x) => x !== op.to && x !== op.from);
        if (union.length !== to[kind].length || union.some((x) => !to[kind].includes(x))) text = setListField(text, kind, union);
      }
      const built = bulletsOf(from.body, "Implemented by"), toBuilt = bulletsOf(to.body, "Implemented by");
      if (built.some((b) => !toBuilt.includes(b))) text = upsertSection(text, "Implemented by", uniq([...toBuilt, ...built]).map((b) => `- ${b}`).join("\n"));
      const bound = uniq([...to.binds, ...from.binds].map((b) => `${b.relation} ${b.unit}`));
      if (bound.length !== to.binds.length) text = setListField(text, "binds", bound);
      const deferred = bulletsOf(from.body, "Deferred"), toDeferred = bulletsOf(to.body, "Deferred");
      if (deferred.some((b) => !toDeferred.includes(b))) text = upsertSection(text, "Deferred", uniq([...toDeferred, ...deferred]).map((b) => `- ${b}`).join("\n"));
      if (from.source && from.source !== to.source) text = setField(text, "source", quoted([to.source, from.source].filter(Boolean).join("; ")));
      // the absorbing node's own prose, and the bullets it just took, name the gone id too
      write(to, rewriteIds(text, idMap));
      const fromAbs = resolve(canon.dir, from.file);
      for (const f of walkMd(canon.dir)) {
        if (f === fromAbs || f === resolve(canon.dir, to.file)) continue;
        const t = readFileSync(f, "utf8");
        const nx = rewriteIds(t, idMap);
        if (nx !== t) plan.writes.set(f, nx);
      }
      // a node that both related to and now requires itself through the merge is cleaned above; others may now name `to`
      // twice: an edge list, a decision's intents, a journey step's requirement cell
      for (const [abs, t] of plan.writes) {
        if (abs === resolve(canon.dir, to.file) || abs.endsWith(".json")) continue;
        const { data } = parseFrontMatter(t);
        let out = t;
        for (const kind of ["relates", "requires", "conflicts", "intents"] as const) {
          const list = strList(data[kind]);
          const clean = uniq(list).filter((x) => x !== String(data["id"]));
          if (clean.length !== list.length) out = setListField(out, kind, clean);
        }
        if (String(data["id"]).startsWith("JRN-")) out = dedupeStepRows(out);
        if (out !== t) plan.writes.set(abs, out);
      }
      plan.removes.add(fromAbs);
      if (queuePath && existsSync(queuePath)) plan.writes.set(queuePath, rewriteQueue(readFileSync(queuePath, "utf8"), idMap));
      return { plan, result: { id: op.to } };
    }
    case "contest": {
      const err = must(op.id) ?? (op.other ? must(op.other) : undefined);
      if (err) return { error: err };
      if (op.other === op.id) return { error: `${op.id} cannot be contested against itself; name the other node, or leave other out when both readings are its own` };
      if (!op.summary?.trim() || !Array.isArray(op.statements) || op.statements.length < 2) return { error: "a contest needs a summary and at least two statements with their sources" };
      const summary = op.summary.trim().replace(/\s+/g, " ");
      const statements = op.statements.map((s) => `${s.text.trim()} (${s.source.trim()})`);
      for (const id of [op.id, ...(op.other ? [op.other] : [])]) {
        const n = node(id)!;
        // a second contest adds to the first: one paragraph of both summaries, the union of the statements
        const prior = proseOf(n.body, "Contested");
        const paragraph = prior && !prior.includes(summary) ? `${prior} ${summary}` : prior || summary;
        const body = `${paragraph}\n\n${uniq([...bulletsOf(n.body, "Contested"), ...statements]).map((b) => `- ${b}`).join("\n")}`;
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
      if (existing && (existing.state === "stated" || existing.state === "resolved")) return { error: `${existing.term} is the user's term; a change to it is asked, never applied` };
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
      if (approvedState(n)) return { error: `${op.id} is the user's words; a rewording is asked, never applied` };
      if (!op.from?.trim() || typeof op.to !== "string") return { error: "a reword needs the phrase to replace and its replacement" };
      const re = new RegExp(`(?<![A-Za-z0-9])${escapeRe(op.from.trim())}(?![A-Za-z0-9])`, "g");
      const text = current(n);
      let count = 0;
      const swap = (s: string) => s.replace(re, () => { count++; return op.to; });
      // the front matter is metadata, not prose: `kind: binary` and the `state` key must survive a rewording of those
      // words; the title is the writer's, with the body and its H1
      const head = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)?.[0] ?? "";
      const out = head.replace(/^(title:[ \t]*)(.*)$/m, (_m, key: string, value: string) => key + swap(value)) + swap(text.slice(head.length));
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
      if ([...gone].some((x) => approvedState(node(x)))) return { error: `${op.id} or a node under it is the user's; a deletion of an approved node is asked, never applied` };
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
    case "bind": {
      const err = must(op.id);
      if (err) return { error: err };
      if (!["implements", "contributes", "contradicts"].includes(op.relation)) return { error: `unknown relation ${String(op.relation)}; one of implements, contributes, contradicts` };
      if (!op.unit?.trim()) return { error: "a unit is required: a code unit, a cluster or a claim id" };
      const n = node(op.id)!;
      const unit = op.unit.trim();
      const next = uniq([...n.binds.filter((b) => b.unit !== unit).map((b) => `${b.relation} ${b.unit}`), `${op.relation} ${unit}`]);
      write(n, setListField(current(n), "binds", next));
      return { plan, result: { id: op.id } };
    }
    case "unbind": {
      const err = must(op.id);
      if (err) return { error: err };
      const n = node(op.id)!;
      const unit = (op.unit ?? "").trim();
      if (!n.binds.some((b) => b.unit === unit)) return { error: `${op.id} is not bound to ${unit}` };
      write(n, setListField(current(n), "binds", n.binds.filter((b) => b.unit !== unit).map((b) => `${b.relation} ${b.unit}`)));
      return { plan, result: { id: op.id } };
    }
    case "draft": {
      const err = must(op.id);
      if (err) return { error: err };
      const n = node(op.id)!;
      if (approvedState(n)) return { error: `${op.id} is the user's; it is never made a draft, its problem is an issue` };
      if (!op.why?.trim()) return { error: "a draft needs the diagnosis: why the guess could not be made right" };
      let text = setField(current(n), "state", "draft");
      text = upsertSection(text, "Open", [...bulletsOf(n.body, "Open"), `${today()}: made a draft by review: ${op.why.trim()}`].map((b) => `- ${b}`).join("\n"));
      write(n, text);
      return { plan, result: { id: op.id } };
    }
    case "note": {
      const err = must(op.id);
      if (err) return { error: err };
      const n = node(op.id)!;
      if (approvedState(n)) return { error: `${op.id} is the user's; its drift is an issue, never a note` };
      if (!op.text?.trim()) return { error: "a note needs its text: what was seen, in a line" };
      write(n, upsertSection(current(n), "Open", [...bulletsOf(n.body, "Open"), `${today()}: ${op.text.trim()}`].map((b) => `- ${b}`).join("\n")));
      return { plan, result: { id: op.id } };
    }
    case "journey": {
      if (typeof op.title !== "string" || !op.title.trim()) return { error: "a journey needs a title: who does what, to what end" };
      if (!Array.isArray(op.steps) || !op.steps.length) return { error: "a journey needs its steps, each with a label and the nodes it exercises" };
      if (op.state && op.state !== "assumed") return { error: "a journey written by an operation is assumed; the user approves it on the page" };
      for (const [i, s] of op.steps.entries()) {
        if (typeof s?.label !== "string" || !cellText(s.label)) return { error: `step ${i + 1} needs a label: what the user does, in a few words` };
        if (!Array.isArray(s.requirements) || !s.requirements.length || s.requirements.some((r) => typeof r !== "string")) return { error: `step ${i + 1} cites no node: name the requirements it exercises` };
        const missing = s.requirements.find((r) => !node(r.trim()));
        if (missing) return { error: `step ${i + 1} cites ${missing}, which is not in the canon` };
      }
      const title = op.title.trim().replace(/\s+/g, " ");
      const { graph, table } = journeySteps(op.steps);
      if (!op.id) {
        const used = canon.journeys.map((j) => Number(/^JRN-(\d+)$/.exec(j.id)?.[1])).filter(Number.isFinite);
        const id = `JRN-${(used.length ? Math.max(...used) : 0) + 1}`;
        const fm = [`id: ${id}`, `title: ${quoted(title)}`, "state: assumed", ...(op.source?.trim() ? [`source: ${quoted(op.source.trim())}`] : [])];
        plan.writes.set(join(canon.dir, "journeys", `${id}-${slugOf(title)}.md`), `---\n${fm.join("\n")}\n---\n\n# ${title}\n\n${graph}\n\n${table}\n`);
        return { plan, result: { id } };
      }
      const j = canon.journeys.find((x) => x.id === op.id);
      if (!j) return { error: `${op.id} is not in the canon` };
      if (approvedState(j)) return { error: `${op.id} is the user's; a change to an approved journey is asked, never applied` };
      if (j.state !== "assumed") return { error: `${op.id} is ${j.state}; only an assumed journey is rewritten` };
      const abs = resolve(canon.dir, j.file);
      let text = readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
      if (title !== j.title) {
        text = setField(text, "title", quoted(title));
        const head = FRONT.exec(text)?.[0] ?? "";
        text = head + text.slice(head.length).replace(/^#[ \t]+.*$/m, () => `# ${title}`);
      }
      if (op.source?.trim()) text = setField(text, "source", quoted(op.source.trim()));
      plan.writes.set(abs, replaceJourneySteps(text, graph, table));
      return { plan, result: { id: j.id } };
    }
    case "review": {
      // ROOT names the set of top-level nodes, the premise's children: it is reviewed like any other set
      const err = op.id === "ROOT" ? undefined : must(op.id);
      if (err) return { error: err };
      if (op.verdict !== "pass" && op.verdict !== "fail") return { error: "a review's verdict is pass or fail" };
      return { plan, result: { id: op.id } };
    }
    case "dispatch":
    case "returned": {
      const err = op.id === "ROOT" ? undefined : must(op.id);
      if (err) return { error: err };
      return { plan, result: { id: op.id } };
    }
    default:
      return { error: `unknown operation ${String((op as { op?: unknown }).op)}` };
  }
}

/** A journey's step rows with each requirement cell's repeats dropped: a merge can leave `REQ-1, REQ-1`. */
function dedupeStepRows(text: string): string {
  let changed = false;
  const lines = text.split(/\r?\n/).map((line) => {
    if (!/^\|\s*S\d+\b/.test(line)) return line;
    // the requirement cell is the last one, after the step and an optional state column, as parseStepTable reads it
    const cells = line.split("|");
    const i = cells.length >= 5 ? 3 : 2;
    if (i >= cells.length - 1) return line;
    const reqs = (cells[i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const clean = uniq(reqs);
    if (clean.length === reqs.length) return line;
    changed = true;
    return [...cells.slice(0, i), ` ${clean.join(", ")} `, ...cells.slice(i + 1)].join("|");
  });
  return changed ? lines.join("\n") : text;
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

/** Apply a plan, keeping what it overwrote and which folders it made, so it can be undone whole. */
function commit(plan: Plan): () => void {
  const originals = new Map<string, string | null>();
  const remember = (p: string) => { if (!originals.has(p)) originals.set(p, existsSync(p) ? readFileSync(p, "utf8") : null); };
  for (const p of plan.removes) remember(p);
  for (const p of plan.writes.keys()) remember(p);
  // the folders the writes will make, so a rolled-back plan leaves none behind
  const made: string[] = [];
  for (const p of plan.writes.keys()) for (let d = dirname(p); !existsSync(d) && !made.includes(d); d = dirname(d)) made.push(d);
  for (const p of plan.removes) if (!plan.writes.has(p)) rmSync(p, { force: true });
  for (const [p, text] of plan.writes) { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); }
  return () => {
    for (const [p, text] of originals) {
      if (text === null) rmSync(p, { force: true });
      else { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); }
    }
    for (const d of made.sort((a, b) => b.length - a.length)) if (existsSync(d) && readdirSync(d).length === 0) rmdirSync(d);
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

/** An id is below a node when it is that node or sits under it: ids mirror paths. */
const below = (id: unknown, top: string) => typeof id === "string" && (id === top || id.startsWith(`${top}.`));

/**
 * The border a name carries: `refiner-<capability id>` and `tester-<capability id>` write inside that capability,
 * `implementer-<node id>` adds guessed nodes and nothing else; every other name, and none, writes anywhere. Returns the
 * operation to apply, a tester's or an implementation agent's `create` made a guess, or the reason it is refused.
 * Ids alone decide, so a move or a merge with one end outside the capability is refused whichever end it is.
 */
export function scopeOp(op: Op, by: string | undefined): { op: Op } | { error: string } {
  const m = /^(refiner|tester|implementer)-(.+)$/.exec(by?.trim() ?? "");
  // an operation no one knows is refused by the plan, under its own name
  if (!m || !(OP_NAMES as readonly string[]).includes(op?.op)) return { op };
  const role = m[1]!, top = m[2]!;
  const outside = { error: `outside ${by!.trim()}'s capability (${top}): record it with HC propose` };
  if (role === "implementer") {
    if (op.op !== "create") return { error: "an implementation agent adds assumptions and issues only" };
    if (op.under === "ROOT") return { error: "an implementation agent adds an assumption under a node, never at the top level" };
    const given = op.source?.trim();
    const source = given && /^builder\b/i.test(given) ? given : `builder ${by!.trim()}${given ? `: ${given}` : ""}`;
    return { op: { ...op, state: "assumed", source } };
  }
  if (role === "tester") {
    if (op.op === "journey") return { op };
    if (op.op === "note") return below(op.id, top) ? { op } : outside;
    if (op.op === "create") return below(op.under, top) ? { op: { ...op, state: "assumed" } } : outside;
    return { error: "a tester records journeys, notes and assumptions only: record anything else with HC propose" };
  }
  const inside = ((): boolean => {
    switch (op.op) {
      case "term": case "review": case "dispatch": case "returned": return true;
      case "create": return below(op.under, top);
      case "bind": case "unbind": case "reword": case "note": case "draft": case "delete": return below(op.id, top);
      // a contest writes both nodes
      case "contest": return below(op.id, top) && (!op.other || below(op.other, top));
      case "move": return below(op.id, top) && below(op.under, top);
      case "merge": return below(op.from, top) && below(op.to, top);
      case "link": case "unlink": return below(op.from, top);
      case "move-edge": return below(op.on, top);
      case "journey": return false;
    }
  })();
  return inside ? { op } : outside;
}

export interface ApplyOptions {
  /** Who asked: an agent or node id, for the log; `refiner-`, `tester-` and `implementer-` names carry a border (`scopeOp`). */
  by?: string;
  /** The log file; by default `<git dir>/headcanon/ops.jsonl`; false for none. */
  log?: string | false;
  /** The question queue file whose node ids follow a move or a merge; by default beside the log. */
  queue?: string;
}

/** Apply one operation to the canon at `canonDir`: plan, write, reload, check, keep or roll back, log. */
export function applyOp(canonDir: string, request: Op, opts: ApplyOptions = {}): OpResult {
  const scoped = scopeOp(request, opts.by);
  // the log keeps what was applied: a create made a guess by its border is logged as written
  const op = "error" in scoped ? request : scoped.op;
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
  if ("error" in scoped) return record({ ok: false, changes: [], error: scoped.error });
  const canon = loadCanon(dir);
  // Guided (DEC-025): `top` and a refiner draft nothing under a node the user has not approved. A draft is a question
  // and stands anywhere; a tester's and an implementation agent's guesses are not the drafting. The mode is read here
  // from the file the page writes, since the settings module reads its folder through this one; no file is Full-Auto.
  if (op.op === "create" && op.state !== "draft" && /^(top|refiner-.+)$/.test(opts.by?.trim() ?? "") && git) {
    let guided = false;
    try { guided = (JSON.parse(readFileSync(join(git, "headcanon", "settings.json"), "utf8")) as { mode?: string }).mode === "guided"; } catch { /* no settings: Full-Auto */ }
    const under = op.under === "ROOT" ? canon.root : canon.nodes[op.under];
    if (guided && under && !approvedState(under)) return record({ ok: false, changes: [], error: `Guided: ${op.under} waits for the user's approval and nothing is drafted under it before that; name it in your report` });
  }
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
  // an error that was there before follows a renamed id (a dangling edge on a moved leaf, or one `to` takes over from
  // `from`), so the keys the plan started from are read under their new names
  const renamed: Record<string, string> = op.op === "merge" ? { [op.from]: op.to } : result.renamed ?? {};
  const follow = (k: string) => { const i = k.indexOf(":") + 1; const id = k.slice(i); return k.slice(0, i) + (renamed[id] ?? id); };
  const before = new Set([...errorKeys(canon)].map(follow));
  const beforeTexts = new Map([...plan.writes.keys(), ...plan.removes].map((p) => [p, readTextOrNull(p)] as const));
  const undo = commit(plan);
  let after: Set<string>;
  // a write the loader cannot read back (front matter that is no longer YAML) is undone like any refused plan
  try { after = errorKeys(loadCanon(dir)); }
  catch (e) { undo(); return record({ ok: false, changes: [], error: `refused: the operation would leave a file the canon cannot be read from: ${(e as Error).message.split(/\r?\n/)[0]}` }); }
  const newErrors = [...after].filter((k) => !before.has(k));
  if (newErrors.length) {
    undo();
    return record({ ok: false, changes: [], error: `refused: the operation would introduce ${newErrors.length} error(s): ${newErrors.join(", ")}`, newErrors });
  }
  pruneEmpty(dir, plan);
  journalRecord(dir, { kind: "op", summary: `${op.op}${op.op === "journey" ? ` ${result.id}` : "id" in op && op.id ? " " + op.id : "on" in op ? " " + op.on : "from" in op ? ` ${op.from}` : ""}${op.why ? ": " + op.why : ""}`.slice(0, 160), id: (op.op === "journey" ? result.id : "id" in op ? op.id : "on" in op ? op.on : "under" in op ? result.id : undefined) as string | undefined }, beforeTexts);
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
