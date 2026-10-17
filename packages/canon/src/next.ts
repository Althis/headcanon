import { compareIds } from "./load.js";
import type { Canon, ReqNode } from "./types.js";

/**
 * Which node to refine next (REQ-3.15). A node requires the nodes whose concepts its definition
 * uses; refinement follows that order. Among the nodes whose prerequisites are all refined, the
 * shallowest comes first, so no branch is drilled while a sibling above it waits, then the one
 * most other nodes require, then the lowest id. Nothing refinable while unrefined nodes remain
 * is a deadlock, which a human breaks.
 */

export interface NextPick {
  id: string;
  title: string;
  depth: number;
  /** Nodes that require this one, directly. */
  dependents: number;
}

export interface Blocked {
  id: string;
  title: string;
  /** Prerequisites that are not refined yet. */
  waitingOn: string[];
}

export interface RefinementOrder {
  next: NextPick | undefined;
  ready: NextPick[];
  blocked: Blocked[];
  /** True when unrefined nodes remain and none is ready. */
  deadlock: boolean;
  cycles: string[][];
}

/** A node is refined when it has children or is a measurable leaf (`kind` set). */
export function isRefined(n: ReqNode): boolean {
  return n.children.length > 0 || Boolean(n.kind);
}

/** A node that can still be cut: no children, no kind, and not waiting on a human (open, contested). */
export function isUnrefined(n: ReqNode): boolean {
  return !isRefined(n) && n.state !== "open" && n.state !== "contested";
}

/** Every cycle among `requires` edges, each as the ids along it. */
export function requiresCycles(canon: Canon): string[][] {
  const WHITE = 0, GREY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    color.set(id, GREY);
    stack.push(id);
    for (const t of canon.nodes[id]?.requires ?? []) {
      if (!canon.nodes[t]) continue;
      const c = color.get(t) ?? WHITE;
      if (c === GREY) {
        const cycle = stack.slice(stack.indexOf(t));
        const key = [...cycle].sort().join(">");
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push([...cycle, t]);
        }
      } else if (c === WHITE) visit(t);
    }
    stack.pop();
    color.set(id, BLACK);
  };
  for (const id of Object.keys(canon.nodes).sort(compareIds)) if ((color.get(id) ?? WHITE) === WHITE) visit(id);
  return cycles;
}

export function refinementOrder(canon: Canon): RefinementOrder {
  const dependents = new Map<string, number>();
  for (const n of Object.values(canon.nodes)) for (const t of n.requires) dependents.set(t, (dependents.get(t) ?? 0) + 1);
  const pick = (n: ReqNode): NextPick => ({ id: n.id, title: n.title, depth: n.depth, dependents: dependents.get(n.id) ?? 0 });

  const ready: NextPick[] = [];
  const blocked: Blocked[] = [];
  for (const n of Object.values(canon.nodes)) {
    if (!isUnrefined(n)) continue;
    const waitingOn = n.requires.filter((t) => canon.nodes[t] && !isRefined(canon.nodes[t]!));
    if (waitingOn.length) blocked.push({ id: n.id, title: n.title, waitingOn: waitingOn.sort(compareIds) });
    else ready.push(pick(n));
  }
  ready.sort((a, b) => a.depth - b.depth || b.dependents - a.dependents || compareIds(a.id, b.id));
  blocked.sort((a, b) => compareIds(a.id, b.id));
  return { next: ready[0], ready, blocked, deadlock: ready.length === 0 && blocked.length > 0, cycles: requiresCycles(canon) };
}

/** One paragraph for the terminal and the session context. */
export function describeNext(order: RefinementOrder, canon: Canon): string {
  const lines: string[] = [];
  if (order.cycles.length) lines.push(`Cycle in requires: ${order.cycles.map((c) => c.join(" > ")).join("; ")}. A concept both need belongs at their common ancestor: lift it, or ask which direction stands.`);
  if (order.next) {
    const why = [`depth ${order.next.depth}`, order.next.dependents ? `${order.next.dependents} node(s) require it` : "nothing requires it yet", "prerequisites met"];
    lines.push(`Next to refine: ${order.next.id} ${order.next.title} (${why.join("; ")}).`);
    const rest = order.ready.slice(1, 4).map((p) => p.id);
    if (rest.length) lines.push(`Then: ${rest.join(", ")}${order.ready.length > 4 ? `, and ${order.ready.length - 4} more` : ""}.`);
  } else if (order.deadlock) {
    lines.push("Deadlock: every unrefined node waits on an unrefined prerequisite. Ask the human which prerequisite to refine first, or which edge to drop.");
  } else lines.push("Nothing left to refine: every node has children or a kind, or waits on a human.");
  for (const b of order.blocked.slice(0, 5)) lines.push(`Blocked: ${b.id} waits on ${b.waitingOn.map((w) => `${w}${canon.nodes[w]?.state === "open" ? " (open)" : ""}`).join(", ")}.`);
  if (order.blocked.length > 5) lines.push(`… ${order.blocked.length - 5} more blocked.`);
  return lines.join("\n");
}
