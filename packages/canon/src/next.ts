import { compareIds } from "./load.js";
import type { Canon, ReqNode, State } from "./types.js";

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

/**
 * How far a draft runs ahead of the human (REQ-3.4, DEC-018). A box's level counts the premise as 0. The
 * anchor is the deepest approved box on the path from the premise to the box, the premise itself when it is
 * approved and none before. A draft may reach LOOKAHEAD levels below the anchor, so a box is cut only when its
 * children would lie within that reach: before the premise is approved only the domains are drafted, with it
 * the capabilities, and every approval below moves the frontier down under that box and nowhere else.
 */
export const LOOKAHEAD = 2;
const approved = (state: State | undefined): boolean => state === "stated" || state === "resolved";

export interface Reach {
  /** The box's level; the premise is 0, a domain 1. */
  level: number;
  /** The deepest approved box on the path, ROOT for the premise; none when nothing above is approved. */
  anchor: string | undefined;
  /** The deepest level a draft may reach on this path. */
  reach: number;
}

export function reachOf(canon: Canon, n: ReqNode): Reach {
  // a canon without a root README has nothing above the domains to approve
  let anchorLevel = !canon.root || approved(canon.root.state) ? 0 : -1;
  let anchor: string | undefined = canon.root && approved(canon.root.state) ? "ROOT" : undefined;
  for (let p: ReqNode | undefined = n; p; p = p.parent ? canon.nodes[p.parent] : undefined) {
    if (approved(p.state) && p.depth + 1 > anchorLevel) { anchorLevel = p.depth + 1; anchor = p.id; }
  }
  return { level: n.depth + 1, anchor, reach: anchorLevel + LOOKAHEAD };
}

/** The box may be cut now: its children would lie within reach. */
export function withinReach(canon: Canon, n: ReqNode): boolean {
  const r = reachOf(canon, n);
  return r.level + 1 <= r.reach;
}

export interface Waiting {
  id: string;
  title: string;
  level: number;
  anchor: string | undefined;
  reach: number;
  /** Boxes whose approval would let it be cut: its parent, or itself. */
  approveOneOf: string[];
}

export interface RefinementOrder {
  next: NextPick | undefined;
  ready: NextPick[];
  blocked: Blocked[];
  /** Unrefined boxes beyond reach: they wait for an approval above them, not for a prerequisite. */
  waiting: Waiting[];
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
  const waiting: Waiting[] = [];
  for (const n of Object.values(canon.nodes)) {
    if (!isUnrefined(n)) continue;
    const r = reachOf(canon, n);
    if (r.level + 1 > r.reach) {
      const parent = n.parent && canon.nodes[n.parent] ? n.parent : canon.root ? "ROOT" : undefined;
      waiting.push({ id: n.id, title: n.title, level: r.level, anchor: r.anchor, reach: r.reach, approveOneOf: [...(parent ? [parent] : []), n.id] });
      continue;
    }
    const waitingOn = n.requires.filter((t) => canon.nodes[t] && !isRefined(canon.nodes[t]!));
    if (waitingOn.length) blocked.push({ id: n.id, title: n.title, waitingOn: waitingOn.sort(compareIds) });
    else ready.push(pick(n));
  }
  ready.sort((a, b) => a.depth - b.depth || b.dependents - a.dependents || compareIds(a.id, b.id));
  blocked.sort((a, b) => compareIds(a.id, b.id));
  waiting.sort((a, b) => compareIds(a.id, b.id));
  return { next: ready[0], ready, blocked, waiting, deadlock: ready.length === 0 && blocked.length > 0 && waiting.length === 0, cycles: requiresCycles(canon) };
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
  } else if (order.waiting.length) lines.push(`Nothing within reach: ${order.waiting.length} node(s) wait for an approval above them.`);
  else lines.push("Nothing left to refine: every node has children or a kind, or waits on a human.");
  if (order.waiting.length) lines.push(`Reach: a draft goes no deeper than ${LOOKAHEAD} levels below the deepest approved box on its path. ${order.waiting.slice(0, 3).map((w) => `${w.id} once ${w.approveOneOf.join(" or ")} is approved`).join("; ")}${order.waiting.length > 3 ? `; … ${order.waiting.length - 3} more` : ""}.`);
  for (const b of order.blocked.slice(0, 5)) lines.push(`Blocked: ${b.id} waits on ${b.waitingOn.map((w) => `${w}${canon.nodes[w]?.state === "open" ? " (open)" : ""}`).join(", ")}.`);
  if (order.blocked.length > 5) lines.push(`… ${order.blocked.length - 5} more blocked.`);
  return lines.join("\n");
}
