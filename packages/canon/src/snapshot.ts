import { statSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";
import { gitAttention, type GitAttention } from "./attention.js";
import { branchHealth, checkCanon, countStates, type BranchHealth, type StateCounts } from "./check.js";
import { loadCanon } from "./load.js";
import { isUnrefined, refinementOrder, type RefinementOrder } from "./next.js";
import { renderTextTree } from "./tree.js";
import type { Canon, Finding } from "./types.js";

/** How long after its last write a node's file counts as being cut; the viewer ages its copy by the same rule. */
const ACTIVE_SECONDS = 120;

export interface Snapshot {
  generatedAt: string;
  canon: Canon;
  /** Rendered HTML per object id (nodes, journeys, decisions, ROOT). */
  html: Record<string, string>;
  findings: Finding[];
  health: BranchHealth[];
  git: GitAttention;
  /** The refinement order, with what the human can do ranked by what it releases. */
  next: RefinementOrder;
  /** Boxes being cut right now (DEC-024): node id, or ROOT for the premise, → seconds since its own file was written,
   *  for files written in the last two minutes. Read from disk, not from what a session says: several agents write at
   *  once and none of them reports every move. */
  activity: Record<string, number>;
  stats: {
    nodes: number;
    counts: StateCounts;
    /** Leaves still to cut: no children, no kind, and not waiting on a human (REQ-3.3). */
    unrefined: number;
    /** Leaves that carry a kind, and so a check. */
    measurable: number;
    journeys: number;
    steps: number;
    decisions: number;
    terms: number;
    errors: number;
    warnings: number;
    infos: number;
  };
  textTree: string;
}

/** Everything the viewer and the CLI need, computed from the files on disk right now. */
export function buildSnapshot(canonDir: string): Snapshot {
  const canon = loadCanon(canonDir);
  const findings = checkCanon(canon);
  const health = branchHealth(canon, findings);
  const git = gitAttention(canon.dir);
  const ids = Object.keys(canon.nodes);
  const counts = countStates(canon, ids);

  const html: Record<string, string> = {};
  const render = (md: string) => marked.parse(stripTitle(md), { async: false }) as string;
  // The root's Glossary has its own page; the purpose text should not repeat it.
  if (canon.root) html["ROOT"] = render(stripSection(canon.root.body, "Glossary"));
  for (const n of Object.values(canon.nodes)) html[n.id] = render(n.body);
  for (const j of canon.journeys) html[j.id] = render(j.body.replace(/```mermaid[\s\S]*?```/, ""));
  for (const d of canon.decisions) html[d.id] = render(d.body);

  // The file's mtime is the one trace every writer leaves. One stat per node and one for the root README, by the same
  // rule; a file gone between the read and the stat is simply not active.
  const activity: Record<string, number> = {};
  const now = Date.now();
  const note = (id: string, file: string) => {
    const st = statSync(join(canon.dir, file), { throwIfNoEntry: false });
    const age = st ? (now - st.mtimeMs) / 1000 : Infinity;
    if (age <= ACTIVE_SECONDS) activity[id] = Math.max(0, Math.round(age));
  };
  for (const n of Object.values(canon.nodes)) note(n.id, n.file);
  if (canon.root) note("ROOT", canon.root.file);

  return {
    generatedAt: new Date().toISOString(),
    canon,
    html,
    findings,
    health,
    git,
    next: refinementOrder(canon),
    activity,
    stats: {
      nodes: ids.length,
      counts,
      unrefined: ids.filter((id) => isUnrefined(canon.nodes[id]!)).length,
      measurable: ids.filter((id) => Boolean(canon.nodes[id]?.kind)).length,
      journeys: canon.journeys.length,
      steps: canon.journeys.reduce((a, j) => a + j.steps.length, 0),
      decisions: canon.decisions.length,
      terms: canon.terms.length,
      errors: findings.filter((f) => f.level === "error").length,
      warnings: findings.filter((f) => f.level === "warn").length,
      infos: findings.filter((f) => f.level === "info").length,
    },
    textTree: renderTextTree(canon, findings),
  };
}

/** Remove one `## Heading [marker]` section, up to the next H2 or the end. */
function stripSection(md: string, heading: string): string {
  const re = new RegExp(`^##\\s+${heading}\\b[^\\n]*\\n[\\s\\S]*?(?=^##\\s|(?![\\s\\S]))`, "m");
  return md.replace(re, "");
}

/** The body's H1 repeats the title; the viewer shows the title itself. */
function stripTitle(md: string): string {
  return md.replace(/^\s*#\s+.+\r?\n/, "");
}
