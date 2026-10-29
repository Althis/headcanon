import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { branchOf, descendants } from "./load.js";
import { isUnrefined, refinementOrder } from "./next.js";
import { STATES, type Canon, type Finding, type Level, type State } from "./types.js";

function finding(level: Level, code: string, message: string, extra: Partial<Finding> = {}): Finding {
  return { level, code, message, id: undefined, file: undefined, branch: undefined, ...extra };
}

/** Deterministic checks: structure, links, files, and certainty states that need a human. */
export function checkCanon(canon: Canon): Finding[] {
  const out: Finding[] = [];
  const repoRoot = dirname(canon.dir);
  const journeySteps = new Set<string>();
  for (const j of canon.journeys) for (const s of j.steps) journeySteps.add(`${j.id}/${s.id}`);
  const journeyIds = new Set(canon.journeys.map((j) => j.id));
  const mockIds = new Set(canon.mocks.map((m) => m.id));
  const mockElements = new Set<string>();
  for (const m of canon.mocks) for (const e of m.elements) mockElements.add(`${m.id}#${e.id}`);
  const decisionsByIntent = new Map<string, string[]>();
  for (const d of canon.decisions) for (const i of d.intents) (decisionsByIntent.get(i) ?? decisionsByIntent.set(i, []).get(i))!.push(d.id);

  for (const f of canon.unparsed) out.push(finding("warn", "no-id", `${f} has no usable id in its front-matter`, { file: f }));
  for (const [id, files] of Object.entries(canon.duplicates))
    out.push(finding("error", "duplicate-id", `${id} is claimed by ${files.join(", ")}`, { id, file: files[0] }));

  for (const n of Object.values(canon.nodes)) {
    const branch = branchOf(canon, n.id);
    const at = { id: n.id, file: n.file, branch };

    if (n.parent && !canon.nodes[n.parent])
      out.push(finding("error", "parent-missing", `${n.id} names parent ${n.parent}, which does not exist`, at));
    const expectedParent = n.id.includes(".") ? n.id.slice(0, n.id.lastIndexOf(".")) : undefined;
    if (expectedParent && n.parent && n.parent !== expectedParent)
      out.push(finding("warn", "parent-mismatch", `${n.id} should sit under ${expectedParent} by its id, but names ${n.parent}`, at));
    if (expectedParent && !n.parent)
      out.push(finding("warn", "parent-mismatch", `${n.id} has a dotted id but no parent`, at));

    for (const s of n.steps) {
      if (journeyIds.has(s) || journeySteps.has(s)) continue;
      out.push(finding("error", "link-unknown", `${n.id} links to step ${s}, which does not exist`, at));
    }
    for (const s of n.mocks) {
      if (mockIds.has(s) || mockElements.has(s)) continue;
      out.push(finding("error", "link-unknown", `${n.id} is bound to ${s}, which does not exist`, at));
    }
    for (const f of n.files) {
      if (!existsSync(join(repoRoot, f)))
        out.push(finding("warn", "file-missing", `${n.id} lists ${f}, which is not in the repository`, at));
    }
    // Typed links (DEC-014) point at nodes; a dangling one is as broken as a missing parent.
    for (const [field, targets] of [["relates", n.relates], ["conflicts", n.conflicts], ["requires", n.requires]] as const)
      for (const t of targets)
        if (!canon.nodes[t]) out.push(finding("error", "link-unknown", `${n.id} ${field} ${t}, which does not exist`, at));
    if (n.state === "contested") out.push(finding("warn", "contested", `${n.id} is contested: ${n.title}`, at));
    if (n.state === "open") out.push(finding("info", "open", `${n.id} is an open question: ${n.title}`, at));

    const deps = decisionsByIntent.get(n.id) ?? [];
    if (n.state === "assumed" && deps.length >= 2)
      out.push(finding("warn", "assumption-load", `${n.id} is assumed but ${deps.length} decisions rest on it (${deps.join(", ")})`, at));

    for (const s of n.sections)
      if (/^(Not this|Intent)$/i.test(s.heading) && s.marker === "contested")
        out.push(finding("warn", "contested", `${n.id} has a contested section: ${s.heading}`, at));

    // Layers (REQ-6.7): explicit layers are checked; inferred ones are display only.
    const parent = n.parent ? canon.nodes[n.parent] : undefined;
    const rank: Record<string, number> = { domain: 0, capability: 1, requirement: 2 };
    if (n.layerExplicit && parent?.layerExplicit && rank[n.layer]! < rank[parent.layer]!)
      out.push(finding("error", "layer-order", `${n.id} is a ${n.layer} under ${parent.id}, a ${parent.layer}`, at));
    if (n.layerExplicit && n.layer === "capability" && n.children.length === 0 && n.state !== "open")
      out.push(finding("warn", "uncovered-capability", `${n.id} is a capability with no requirements under it`, at));

    // Consolidation signals (PRN-1): a child that restates its parent, a parent that has grown wide.
    if (parent && titleOverlap(n.title, parent.title) >= 0.6)
      out.push(finding("warn", "restates-parent", `${n.id} restates its parent ${parent.id}: the titles share most of their words`, at));
    if (n.children.length > 8)
      out.push(finding("info", "many-children", `${n.id} has ${n.children.length} children; consider splitting it`, at));
    // A set of one usually restates its parent or hides its siblings (REQ-3.14).
    if (n.children.length === 1)
      out.push(finding("info", "single-child", `${n.id} has one child, ${n.children[0]}; a set of one usually restates its parent or hides siblings`, at));
    // A leaf's contract (REQ-3.3): `kind` says how it is measured and `## Check` what is observed.
    const hasCheck = n.sections.some((s) => /^Check$/i.test(s.heading));
    if (n.kind && !hasCheck)
      out.push(finding("warn", "check-missing", `${n.id} has kind ${n.kind} but no ## Check section saying what is observed`, at));
    if (hasCheck && !n.kind)
      out.push(finding("warn", "kind-missing", `${n.id} has a ## Check section but no kind (binary, numeric or open-ended)`, at));
  }
  const inferred = Object.values(canon.nodes).filter((n) => !n.layerExplicit).length;
  if (inferred > 0)
    out.push(finding("info", "layer-inferred", `${inferred} node(s) have no layer field; their layer is inferred from depth (domain, capability, requirement)`));
  // Refinement order (REQ-3.15): a cycle in requires can never be refined; a deadlock needs a human.
  const refine = refinementOrder(canon);
  for (const c of refine.cycles)
    out.push(finding("error", "requires-cycle", `${c.join(" requires ")}: a concept both need belongs at their common ancestor; lift it or ask which direction stands`, { id: c[0], file: canon.nodes[c[0]!]?.file, branch: branchOf(canon, c[0]!) }));
  if (refine.deadlock)
    out.push(finding("warn", "refine-deadlock", `nothing can be refined: ${refine.blocked.map((b) => `${b.id} waits on ${b.waitingOn.join(", ")}`).join("; ")}`));
  const unpartitioned = Object.values(canon.nodes).filter((n) => n.children.length >= 2 && !n.partition).length;
  if (unpartitioned > 0)
    out.push(finding("info", "no-partition", `${unpartitioned} parent(s) record no partition, the question their children answer; refine writes one when it cuts a node`));

  for (const j of canon.journeys) {
    const at = { id: j.id, file: j.file };
    if (j.steps.length === 0) out.push(finding("warn", "journey-no-steps", `${j.id} has no step table`, at));
    if (!j.mermaid) out.push(finding("info", "journey-no-graph", `${j.id} has no Mermaid flowchart`, at));
    for (const s of j.steps) {
      if (s.requirements.length === 0)
        out.push(finding("warn", "step-unlinked", `${j.id}/${s.id} links to no requirement`, { ...at, id: `${j.id}/${s.id}` }));
      for (const r of s.requirements)
        if (!canon.nodes[r])
          out.push(finding("error", "link-unknown", `${j.id}/${s.id} links to ${r}, which does not exist`, { ...at, id: `${j.id}/${s.id}` }));
    }
  }

  // Mocks (REQ-6.8): the picture exists, every row names requirements that exist, and an element nothing asks for is noted.
  for (const m of canon.mocks) {
    const at = { id: m.id, file: m.file };
    if (!existsSync(join(canon.dir, m.image))) out.push(finding("error", "file-missing", `${m.id} names picture ${m.image}, which is not in the canon folder`, at));
    if (m.elements.length === 0) out.push(finding("warn", "mock-no-elements", `${m.id} has no element table`, at));
    for (const e of m.elements) {
      const here = { ...at, id: `${m.id}#${e.id}` };
      if (e.requirements.length === 0 && e.state !== "open") out.push(finding("info", "unbound-element", `${m.id}#${e.id} (${e.label}) carries no requirement`, here));
      for (const r of e.requirements)
        if (!canon.nodes[r]) out.push(finding("error", "link-unknown", `${m.id}#${e.id} links to ${r}, which does not exist`, here));
    }
    if (m.state === "contested") out.push(finding("warn", "contested", `${m.id} is contested: ${m.title}`, at));
    if (m.state === "open") out.push(finding("info", "open", `${m.id} is an open question: ${m.title}`, at));
  }

  for (const d of canon.decisions) {
    const at = { id: d.id, file: d.file };
    if (d.intents.length === 0) out.push(finding("warn", "decision-unlinked", `${d.id} serves no intent`, at));
    for (const i of d.intents)
      if (!canon.nodes[i] && !journeyIds.has(i) && !mockIds.has(i))
        out.push(finding("error", "link-unknown", `${d.id} links to ${i}, which does not exist`, at));
    if (d.state === "assumed") out.push(finding("info", "decision-unconfirmed", `${d.id} is not yet confirmed: ${d.title}`, at));
    if (d.origin && !["misread", "obstacle", "side-effect"].includes(d.origin))
      out.push(finding("warn", "origin-unknown", `${d.id} has origin "${d.origin}"; expected misread, obstacle or side-effect`, at));
  }

  // Branch-level: a branch where unconfirmed outweighs confirmed needs the human's eyes.
  // Branches of one or two nodes are still being written; flagging them is noise.
  for (const r of canon.roots) {
    const ids = [r, ...descendants(canon, r)];
    if (ids.length < 3) continue;
    const c = countStates(canon, ids);
    const unconfirmed = c.assumed + c.open + c.contested;
    const confirmed = c.stated + c.resolved;
    if (unconfirmed > confirmed)
      out.push(finding("warn", "branch-unconfirmed", `${r} is mostly unconfirmed: ${unconfirmed} of ${ids.length} nodes are assumed, open or contested`, { id: r, file: canon.nodes[r]?.file, branch: r }));
  }

  const order: Record<Level, number> = { error: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level] || (a.id ?? "").localeCompare(b.id ?? ""));
}

const STOP = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "are", "its", "not", "all", "any", "one", "each", "every", "has", "have", "can", "than", "then", "when", "what", "how", "under", "over"]);

/** Jaccard overlap of the meaningful words of two titles, 0 to 1. */
export function titleOverlap(a: string, b: string): number {
  const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let both = 0;
  for (const w of wa) if (wb.has(w)) both++;
  return both / (wa.size + wb.size - both);
}

export type StateCounts = Record<State, number>;

export function countStates(canon: Canon, ids: Iterable<string>): StateCounts {
  const c = Object.fromEntries(STATES.map((s) => [s, 0])) as StateCounts;
  for (const id of ids) {
    const n = canon.nodes[id];
    if (n) c[n.state]++;
  }
  return c;
}

export interface BranchHealth {
  id: string;
  title: string;
  state: State;
  size: number;
  counts: StateCounts;
  unrefined: number;
  errors: number;
  warnings: number;
  infos: number;
  /** 0..1 share of nodes that are assumed, open or contested. */
  unconfirmedShare: number;
}

export function branchHealth(canon: Canon, findings: Finding[]): BranchHealth[] {
  return canon.roots.map((r) => {
    const ids = [r, ...descendants(canon, r)];
    const counts = countStates(canon, ids);
    const mine = findings.filter((f) => f.branch === r);
    const unrefined = ids.filter((id) => isUnrefined(canon.nodes[id]!)).length;
    const root = canon.nodes[r]!;
    return {
      id: r,
      title: root.title,
      state: root.state,
      size: ids.length,
      counts,
      unrefined,
      errors: mine.filter((f) => f.level === "error").length,
      warnings: mine.filter((f) => f.level === "warn").length,
      infos: mine.filter((f) => f.level === "info").length,
      unconfirmedShare: (counts.assumed + counts.open + counts.contested) / ids.length,
    };
  });
}
