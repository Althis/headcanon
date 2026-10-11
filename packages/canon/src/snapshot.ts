import { marked } from "marked";
import { gitAttention, type GitAttention } from "./attention.js";
import { branchHealth, checkCanon, countStates, type BranchHealth, type StateCounts } from "./check.js";
import { loadCanon } from "./load.js";
import { renderTextTree } from "./tree.js";
import type { Canon, Finding } from "./types.js";

export interface Snapshot {
  generatedAt: string;
  canon: Canon;
  /** Rendered HTML per object id (nodes, journeys, decisions, ROOT). */
  html: Record<string, string>;
  findings: Finding[];
  health: BranchHealth[];
  git: GitAttention;
  stats: {
    nodes: number;
    counts: StateCounts;
    unrefined: number;
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
  if (canon.root) html["ROOT"] = render(canon.root.body);
  for (const n of Object.values(canon.nodes)) html[n.id] = render(n.body);
  for (const j of canon.journeys) html[j.id] = render(j.body.replace(/```mermaid[\s\S]*?```/, ""));
  for (const d of canon.decisions) html[d.id] = render(d.body);

  return {
    generatedAt: new Date().toISOString(),
    canon,
    html,
    findings,
    health,
    git,
    stats: {
      nodes: ids.length,
      counts,
      unrefined: ids.filter((id) => !canon.nodes[id]?.kind).length,
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

/** The body's H1 repeats the title; the viewer shows the title itself. */
function stripTitle(md: string): string {
  return md.replace(/^\s*#\s+.+\r?\n/, "");
}
