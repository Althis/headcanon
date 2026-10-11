import type { Canon, Finding } from "./types.js";

/** Plain-text tree for the agent and the terminal, in the brief's shape. */
export function renderTextTree(canon: Canon, findings: Finding[] = []): string {
  const flagged = new Map<string, number>();
  for (const f of findings) if (f.id && f.level !== "info") flagged.set(f.id, (flagged.get(f.id) ?? 0) + 1);

  const rows: { prefix: string; id: string; title: string; state: string; note: string }[] = [];
  const visit = (id: string, prefix: string, isLast: boolean, isRoot: boolean) => {
    const n = canon.nodes[id];
    if (!n) return;
    const branch = isRoot ? "" : `${prefix}${isLast ? "└─ " : "├─ "}`;
    const flags = flagged.get(id);
    const note = [n.kind ? n.kind : "· unrefined", flags ? `! ${flags} finding${flags > 1 ? "s" : ""}` : ""].filter(Boolean).join("  ");
    rows.push({ prefix: branch, id: n.id, title: n.title, state: n.state, note });
    const childPrefix = isRoot ? "" : `${prefix}${isLast ? "   " : "│  "}`;
    n.children.forEach((c, i) => visit(c, childPrefix, i === n.children.length - 1, false));
  };
  canon.roots.forEach((r) => visit(r, "", true, true));

  const idW = Math.max(...rows.map((r) => r.prefix.length + r.id.length), 8);
  const titleW = Math.min(Math.max(...rows.map((r) => r.title.length), 10), 72);
  const lines = rows.map((r) => {
    const left = (r.prefix + r.id).padEnd(idW + 2);
    const title = r.title.length > titleW ? r.title.slice(0, titleW - 1) + "…" : r.title.padEnd(titleW);
    return `${left}${title}  ${r.state.padEnd(9)} ${r.note}`.trimEnd();
  });
  if (canon.journeys.length) {
    lines.push("", "Journeys");
    for (const j of canon.journeys) lines.push(`  ${j.id.padEnd(idW)}${j.title}  ${j.state}  ${j.steps.length} steps`);
  }
  if (canon.decisions.length) {
    lines.push("", "Decisions");
    for (const d of canon.decisions) lines.push(`  ${d.id.padEnd(idW)}${d.title}  ${d.state}${d.origin ? `  origin: ${d.origin}` : ""}`);
  }
  return lines.join("\n");
}
