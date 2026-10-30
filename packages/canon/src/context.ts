import { FIT_CODES, FORMAT_VERSION, canonFormatVersion, changesSince } from "./format.js";
import { describeNext, refinementOrder } from "./next.js";
import { RULES } from "./rules.js";
import type { Snapshot } from "./snapshot.js";
import { renderTextTree } from "./tree.js";

export interface ContextOptions {
  /** Claude Code caps hook context at 10,000 characters; stay under it with room for the wrapper. */
  maxChars?: number;
}

/**
 * The context HeadCanon injects at session start: rules, state of the canon, what waits on the
 * human, the glossary, and as much of the tree as fits. Everything but the tree is fixed; the
 * tree degrades from full, to two levels, to one, to a cut, so the rules never get dropped.
 */
export function sessionContext(snap: Snapshot | undefined, canonDir: string, opts: ContextOptions = {}): string {
  const maxChars = opts.maxChars ?? 9500;

  if (!snap) {
    return [
      "# HeadCanon",
      "",
      `This project has no canon yet (expected at ${canonDir}).`,
      "",
      "Before doing any implementation work, run `/headcanon:adopt`. It reads the repository silently, drafts the premise, the principles and the domains as guesses, opens the canvas, and keeps cutting the layers below while the human approves, rewrites or deletes boxes there; their time goes to the premise, the principles and every red box. Nothing from existing documents enters the canon as stated; documents the agent did not watch the human write are assumed until the human confirms each item.",
      "",
      RULES,
    ].join("\n");
  }

  const { stats, canon, git } = snap;
  const c = stats.counts;
  const head = [
    "# HeadCanon",
    "",
    `Canon: ${canonDir}`,
    `${stats.nodes} nodes in ${canon.roots.length} branches; ${c.stated} stated, ${c.resolved} resolved, ${c.assumed} assumed, ${c.open} open, ${c.contested} contested. ${canon.principles.length} principles, ${stats.journeys} journeys, ${stats.decisions} decisions, ${stats.terms} glossary terms. Check: ${stats.errors} errors, ${stats.warnings} warnings. ${stats.unrefined} leaves still to cut.`,
    "",
  ];

  const waiting: string[] = [];
  if (git.pending.length) waiting.push(`${git.pending.length} commit(s) awaiting approval (Approved-By: pending)`);
  if (git.unmerged.length) waiting.push(`${git.unmerged.length} unmerged commit(s) with intent changes`);
  if (git.uncommitted.length) waiting.push(`${git.uncommitted.length} uncommitted canon edit(s)`);
  if (stats.errors) waiting.push(`${stats.errors} structural error(s); run \`headcanon check\``);
  if (c.contested) waiting.push(`${c.contested} contested item(s)`);
  if (c.open) waiting.push(`${c.open} open question(s)`);
  const unconfirmedDecisions = canon.decisions.filter((d) => d.state === "assumed").length;
  if (unconfirmedDecisions) waiting.push(`${unconfirmedDecisions} decision(s) not yet confirmed`);
  const fit = new Set(snap.findings.filter((f) => FIT_CODES.has(f.code)).map((f) => f.id ?? f.file)).size;
  if (fit) waiting.push(`${fit} entr(ies) that do not fit the format; the start sequence (headcanon format) brings them in`);
  if (c.assumed) waiting.push(`${c.assumed} assumed requirement(s); \`/headcanon:review\` walks them`);
  head.push("## Waiting on the human", "", waiting.length ? waiting.map((w) => `- ${w}`).join("\n") : "- nothing", "");
  // A canon written under an older format is brought up first, by the start sequence; a newer one stops canon work.
  const written = canonFormatVersion(canon);
  if (written > FORMAT_VERSION) head.push("## Format", "", `This canon was written under format ${written}; this HeadCanon knows ${FORMAT_VERSION}. Update HeadCanon before touching the canon.`, "");
  else if (written < FORMAT_VERSION) head.push("## Format", "", `Written under format ${written}; the current is ${FORMAT_VERSION}. Before other canon work, run the start sequence (\`headcanon format\` prints it): ${changesSince(written).flatMap((x) => x.broughtUp).join(" ")}`, "");
  // The next node to refine, so the agent follows the dependency order without computing it (REQ-3.15).
  const order = refinementOrder(canon);
  const nextLines = describeNext(order, canon).split("\n").filter((l) => /^(Cycle|Next to refine|Nothing within reach|Deadlock|For the human)/.test(l));
  if (nextLines.length) head.push(nextLines.join(" "), "");

  if (canon.principles.length) {
    const first = (s: string) => (/^(.*?[.!?])(\s|$)/.exec(s)?.[1] ?? s).slice(0, 160);
    head.push("## Principles", "", ...canon.principles.map((p) => `- **${p.id} ${p.title}**${p.state === "stated" ? "" : ` [${p.state}]`}: ${first(p.statement)}`), "");
  }
  if (canon.terms.length) {
    const def = (d: string) => (d.length > 110 ? d.slice(0, 109) + "…" : d);
    head.push("## Glossary", "", ...canon.terms.map((t) => `- **${t.term}**${t.state === "stated" ? "" : ` [${t.state}]`}: ${def(t.definition)}`), "");
  }

  const fixed = head.join("\n").length + RULES.length + 60;
  const budget = maxChars - fixed;
  const fence = (lines: string[], note?: string) => ["## Requirement tree", "", "```", ...lines, ...(note ? [note] : []), "```", ""];

  let treeBlock: string[] | undefined;
  for (const maxDepth of [Infinity, 1, 0]) {
    const lines = renderTextTree(canon, snap.findings, { maxDepth }).split("\n");
    const block = fence(lines, maxDepth === Infinity ? undefined : `(levels deeper than ${maxDepth + 1} hidden; run \`headcanon summary\` for the full tree)`);
    if (block.join("\n").length <= budget) {
      treeBlock = block;
      break;
    }
  }
  if (!treeBlock) {
    const lines = renderTextTree(canon, snap.findings, { maxDepth: 0 }).split("\n");
    const kept: string[] = [];
    let used = 0;
    for (const l of lines) {
      if (used + l.length + 1 > budget - 120) break;
      kept.push(l);
      used += l.length + 1;
    }
    treeBlock = fence(kept, `… ${lines.length - kept.length} more top-level lines; run \`headcanon summary\``);
  }

  return [...head, ...treeBlock, RULES].join("\n");
}
