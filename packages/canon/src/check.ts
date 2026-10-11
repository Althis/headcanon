import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { branchOf, descendants } from "./load.js";
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
    for (const f of n.files) {
      if (!existsSync(join(repoRoot, f)))
        out.push(finding("warn", "file-missing", `${n.id} lists ${f}, which is not in the repository`, at));
    }
    if (n.state === "contested") out.push(finding("warn", "contested", `${n.id} is contested: ${n.title}`, at));
    if (n.state === "open") out.push(finding("info", "open", `${n.id} is an open question: ${n.title}`, at));

    const deps = decisionsByIntent.get(n.id) ?? [];
    if (n.state === "assumed" && deps.length >= 2)
      out.push(finding("warn", "assumption-load", `${n.id} is assumed but ${deps.length} decisions rest on it (${deps.join(", ")})`, at));

    for (const s of n.sections)
      if (/^(Not this|Intent)$/i.test(s.heading) && s.marker === "contested")
        out.push(finding("warn", "contested", `${n.id} has a contested section: ${s.heading}`, at));
  }

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

  for (const d of canon.decisions) {
    const at = { id: d.id, file: d.file };
    if (d.intents.length === 0) out.push(finding("warn", "decision-unlinked", `${d.id} serves no intent`, at));
    for (const i of d.intents)
      if (!canon.nodes[i] && !journeyIds.has(i))
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
    const unrefined = ids.filter((id) => !canon.nodes[id]?.kind).length;
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
