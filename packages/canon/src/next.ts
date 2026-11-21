import { compareIds, descendants } from "./load.js";
import type { Canon, ReqNode, State } from "./types.js";

/**
 * Which node to refine next (REQ-3.15), and what the human should look at (DEC-024). A node requires the nodes
 * whose concepts its definition uses; refinement follows that order. Among the nodes whose prerequisites are all
 * refined, one under an approved parent comes first, then the shallowest, so no branch is drilled while a sibling
 * above it waits, then the one most other nodes require, then the lowest id. Nothing refinable while unrefined
 * nodes remain is a deadlock, which a human breaks. The drafting never waits for an approval: it runs to the
 * leaves, and a red box, a draft or a contested one, is the only thing that holds its subtree back.
 */

export interface NextPick {
  id: string;
  title: string;
  depth: number;
  /** Nodes that require this one, directly. */
  dependents: number;
  /** Its parent is approved, the premise for a top-level node: the human validated the path down to it. */
  parentApproved: boolean;
}

export interface Blocked {
  id: string;
  title: string;
  /** Prerequisites that are not refined yet. */
  waitingOn: string[];
}

const approved = (state: State | undefined): boolean => state === "stated" || state === "resolved";
const red = (state: State | undefined): boolean => state === "draft" || state === "contested";

/**
 * The adoption is finished when the tree is whole (DEC-026): a premise, boxes under it, and every branch ending in a
 * requirement with its check. A red leaf, a draft or a contested one, waits on the human and holds nothing else.
 * A canon written by hand or adopted before format 4 says it with its scope record instead, DEC-001.
 */
export function adoptionFinished(canon: Canon): boolean {
  if (canon.decisions.some((d) => d.id === "DEC-001" || /adoption-scope/.test(d.file))) return true;
  if (!canon.root || !canon.roots.length) return false;
  return !Object.values(canon.nodes).some((n) => n.children.length === 0 && !n.kind && !red(n.state));
}

/**
 * Something the human can do, ranked by impact: what their answer validates or frees (DEC-024). An approval is
 * offered at the frontier only, a guessed box whose parent is approved, the premise before anything, since an
 * approval under a guess validates nothing; its impact is the boxes below it, whose path it validates and which a
 * rewrite would invalidate. A red box, a draft or a contested one, is the session's explicit ask wherever it
 * stands: its impact is what waits on it and what it hides, counted as what a refined box at its depth usually
 * holds. The first entry is the next box for the human wherever a skill or the page names one, so no reader keeps
 * a ranking of its own; the list stands after adoption, so the human validates the canon by it whenever they return.
 */
export interface HumanPick {
  id: string;
  title: string;
  state: State;
  action: "approve" | "settle";
  /** Boxes below it: their path is validated by an approval and invalidated by a rewrite. */
  below: number;
  /** Red boxes among those below. */
  redBelow: number;
  /** Blocked boxes that can be refined once it is settled or approved: they require it. */
  unblocks: string[];
  /** What a red box with nothing refined under it hides: the boxes a refined box at its depth usually holds. */
  hidden: number;
  depth: number;
  score: number;
  /** The reason in words, for the page and the chat. */
  why: string;
}

/**
 * When the human's list opens (DEC-024): the ranking rests on what hangs below each box, so it is shown once
 * every domain and capability is refined, red or approved; until then the page shows this gate as progress and
 * withholds the list, while every question is still filed to disk the moment it arises. A finished adoption opens
 * it for good, and a canon with no domain or capability, one whose top level is explicit requirements, has nothing
 * to wait for.
 */
export interface ListGate {
  open: boolean;
  /** Domains and capabilities that are refined, red or approved. */
  refined: number;
  /** Domains and capabilities in the canon. */
  total: number;
  what: string;
}

export interface RefinementOrder {
  next: NextPick | undefined;
  ready: NextPick[];
  blocked: Blocked[];
  /** Guided mode (DEC-025): ready boxes the human has not approved yet; nothing is drafted under one before its approval. */
  gated: NextPick[];
  /** Unrefined boxes under a red box, waiting for the human: nothing is refined under a draft or a contested box. */
  frozen: number;
  /** What the human can do, ranked by impact; the first is the next box for them. */
  human: HumanPick[];
  gate: ListGate;
  /** True when unrefined nodes remain and none is ready. */
  deadlock: boolean;
  cycles: string[][];
}

export function listGate(canon: Canon): ListGate {
  const upper = Object.values(canon.nodes).filter((n) => n.layer === "domain" || n.layer === "capability");
  // an approved box is the human's and stands whether or not it is refined, as a refined or a red one does
  const refined = upper.filter((n) => isRefined(n) || red(n.state) || approved(n.state)).length;
  const hasDomains = upper.some((n) => n.layer === "domain");
  // the list stands for good once adoption is finished; without domains or capabilities there is nothing to wait for
  const open = adoptionFinished(canon) || (upper.length === 0 ? Object.keys(canon.nodes).length > 0 : refined === upper.length);
  return { open, refined, total: upper.length, what: hasDomains ? "every domain and capability" : "every capability" };
}

/** A node is refined when it has children or is a measurable leaf (`kind` set). */
export function isRefined(n: ReqNode): boolean {
  return n.children.length > 0 || Boolean(n.kind);
}

/** A node that can still be refined: no children, no kind, and not waiting on a human (open, contested). */
export function isUnrefined(n: ReqNode): boolean {
  return !isRefined(n) && !red(n.state);
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

const plural = (n: number, one: string, many = `${one}es`) => `${n} ${n === 1 ? one : many}`;

/** The impact of one box for the human, approve or settle, from what hangs on it. */
function humanPick(canon: Canon, id: string, blocked: Blocked[], usual: Map<number, number>): HumanPick | undefined {
  const isRoot = id === "ROOT";
  const node = isRoot ? undefined : canon.nodes[id];
  const state = isRoot ? canon.root?.state : node?.state;
  if (!state || approved(state)) return undefined;
  const belowIds = isRoot ? Object.keys(canon.nodes) : descendants(canon, id);
  const below = belowIds.length;
  const redBelow = belowIds.filter((d) => red(canon.nodes[d]?.state)).length;
  const unblocks = blocked.filter((b) => b.waitingOn.includes(id)).map((b) => b.id).sort(compareIds);
  const depth = node ? node.depth : -1;
  const settle = red(state);
  const hidden = settle && below === 0 ? usual.get(depth) ?? 0 : 0;
  const parts: string[] = [];
  if (settle) {
    parts.push(state);
    if (below) parts.push(`${plural(below, "box")} below it${redBelow ? `, ${redBelow} red` : ""}`);
    else if (hidden) parts.push(`hides about ${plural(hidden, "box")}`);
    if (unblocks.length) parts.push(`${unblocks.length} wait on it`);
  } else {
    parts.push(below ? `validates the path for ${plural(below, "box")} below it${redBelow ? `, ${redBelow} of them red` : ""}` : "nothing below it");
    if (unblocks.length) parts.push(`frees ${unblocks.length}`);
  }
  return {
    id,
    title: isRoot ? canon.root?.title ?? "the premise" : node!.title,
    state,
    action: settle ? "settle" : "approve",
    below,
    redBelow,
    unblocks,
    hidden,
    depth,
    score: 1 + below + hidden + unblocks.length,
    why: parts.join("; "),
  };
}

const byImpact = (a: HumanPick, b: HumanPick) => b.score - a.score || Number(b.action === "settle") - Number(a.action === "settle") || a.depth - b.depth || compareIds(a.id, b.id);

/** What a refined, non-red box at each depth usually holds below it: the measure of what a red box there hides. */
function usualBelow(canon: Canon): Map<number, number> {
  const sums = new Map<number, { n: number; total: number }>();
  for (const n of Object.values(canon.nodes)) {
    if (!isRefined(n) || red(n.state)) continue;
    const s = sums.get(n.depth) ?? { n: 0, total: 0 };
    s.n += 1;
    s.total += descendants(canon, n.id).length;
    sums.set(n.depth, s);
  }
  return new Map([...sums].map(([d, s]) => [d, Math.round(s.total / s.n)]));
}

/** Under a red box: an ancestor is a draft or contested, so nothing below it is refined until the human settles it. */
function underRed(canon: Canon, n: ReqNode): boolean {
  for (let p = n.parent ? canon.nodes[n.parent] : undefined; p; p = p.parent ? canon.nodes[p.parent] : undefined) if (red(p.state)) return true;
  return false;
}

/**
 * The order, whole or scoped to one subtree (`under`): a branch agent asks only about the boxes it owns, so its
 * ready and blocked lists, its frozen count, its deadlock and its human picks are those under its node; the gate
 * stays the canon's. A branch whose blocked boxes wait on another branch is waiting, not deadlocked.
 */
export interface OrderOptions { guided?: boolean | undefined }

export function refinementOrder(canon: Canon, under?: string, opts: OrderOptions = {}): RefinementOrder {
  const whole = orderOf(canon, opts);
  if (!under || under === "ROOT") return whole;
  const scope = new Set([under, ...descendants(canon, under)]);
  const ready = whole.ready.filter((p) => scope.has(p.id));
  const blocked = whole.blocked.filter((b) => scope.has(b.id));
  const frozen = [...scope].filter((id) => { const n = canon.nodes[id]; return n !== undefined && isUnrefined(n) && underRed(canon, n); }).length;
  // a deadlock here only when every blocked box waits inside the scope; a wait on another branch ends with that branch
  // the branch waits on its own red boxes; a wait on another branch's red box is that branch's, not a deadlock here (DEC-025)
  const deadlock = ready.length === 0 && blocked.length > 0 && blocked.every((b) => b.waitingOn.every((w) => scope.has(w)));
  return { ...whole, next: ready[0], ready, gated: whole.gated.filter((p) => scope.has(p.id)), blocked, frozen, human: whole.human.filter((h) => scope.has(h.id)), deadlock };
}

function orderOf(canon: Canon, opts: OrderOptions): RefinementOrder {
  const dependents = new Map<string, number>();
  for (const n of Object.values(canon.nodes)) for (const t of n.requires) dependents.set(t, (dependents.get(t) ?? 0) + 1);
  const parentState = (n: ReqNode): State | undefined => (n.parent ? canon.nodes[n.parent]?.state : canon.root ? canon.root.state : "stated");
  const pick = (n: ReqNode): NextPick => ({ id: n.id, title: n.title, depth: n.depth, dependents: dependents.get(n.id) ?? 0, parentApproved: approved(parentState(n)) });

  const ready: NextPick[] = [];
  const blocked: Blocked[] = [];
  let frozen = 0;
  for (const n of Object.values(canon.nodes)) {
    if (!isUnrefined(n)) continue;
    // nothing is refined under a red box: its unrefined descendants wait for the human with it, in neither list
    if (underRed(canon, n)) { frozen++; continue; }
    const waitingOn = n.requires.filter((t) => canon.nodes[t] && red(canon.nodes[t]!.state)); // only a red prerequisite blocks (DEC-025); an unrefined one orders the work
    if (waitingOn.length) blocked.push({ id: n.id, title: n.title, waitingOn: waitingOn.sort(compareIds) });
    else ready.push(pick(n));
  }
  // The frontier: the premise while it is a guess; then every guessed box whose parent is approved. Every red box
  // besides, wherever it stands, since the session asked for the human there.
  const usual = usualBelow(canon);
  const human: HumanPick[] = [];
  const add = (id: string) => { const h = humanPick(canon, id, blocked, usual); if (h) human.push(h); };
  if (canon.root && !approved(canon.root.state)) add("ROOT");
  for (const n of Object.values(canon.nodes)) {
    if (red(n.state)) add(n.id);
    else if (!approved(n.state) && approved(parentState(n))) add(n.id);
  }
  human.sort(byImpact);
  ready.sort((a, b) => Number(b.parentApproved) - Number(a.parentApproved) || a.depth - b.depth || b.dependents - a.dependents || compareIds(a.id, b.id));
  blocked.sort((a, b) => compareIds(a.id, b.id));
  // Guided gates a box on its own approval: refining it drafts its children, one level below the last approved box
  const own = (p: NextPick) => approved(canon.nodes[p.id]?.state);
  const gated = opts.guided ? ready.filter((p) => !own(p)) : [];
  const open = opts.guided ? ready.filter(own) : ready;
  return { next: open[0], ready: open, gated, blocked, frozen, human, gate: listGate(canon), deadlock: open.length === 0 && blocked.length > 0, cycles: requiresCycles(canon) };
}

/**
 * The unapproved boxes on the path from the premise down to `id`, top first, each with its impact: what the human
 * validates before work starts under that box, so that new work hangs from an approved path (DEC-024). Empty when
 * the path is approved; undefined when the node does not exist.
 */
export function pathToValidate(canon: Canon, id: string): HumanPick[] | undefined {
  const target = id === "ROOT" ? undefined : canon.nodes[id];
  if (id !== "ROOT" && !target) return undefined;
  const order = refinementOrder(canon);
  const usual = usualBelow(canon);
  const chain: string[] = [];
  for (let n: ReqNode | undefined = target; n; n = n.parent ? canon.nodes[n.parent] : undefined) chain.unshift(n.id);
  if (canon.root) chain.unshift("ROOT");
  return chain.map((x) => humanPick(canon, x, order.blocked, usual)).filter((h): h is HumanPick => Boolean(h));
}

/** One paragraph for the terminal and the session context. */
export function describeNext(order: RefinementOrder, canon: Canon): string {
  const lines: string[] = [];
  if (order.cycles.length) lines.push(`Cycle in requires: ${order.cycles.map((c) => c.join(" > ")).join("; ")}. A concept both need belongs at their common ancestor: lift it, or ask which direction stands.`);
  if (order.next) {
    const why = [`depth ${order.next.depth}`, order.next.dependents ? `${order.next.dependents} node(s) require it` : "nothing requires it yet", "prerequisites met", order.next.parentApproved ? "under an approved box" : "under a guess"];
    lines.push(`Next to refine: ${order.next.id} ${order.next.title} (${why.join("; ")}).`);
    const rest = order.ready.slice(1, 4).map((p) => p.id);
    if (rest.length) lines.push(`Then: ${rest.join(", ")}${order.ready.length > 4 ? `, and ${order.ready.length - 4} more` : ""}.`);
  } else if (order.deadlock) {
    lines.push("Waiting on the human: every unrefined node waits on a red box. Nothing to refine until one is settled.");
  } else if (order.blocked.length) lines.push(`Nothing ready here: ${order.blocked.length} box(es) wait on boxes outside this scope.`);
  // a Guided pause is not the end: while boxes are gated, the Guided line below carries the wait alone
  else if (!order.gated.length) lines.push("Nothing left to refine: every node has children or a kind, or waits on a human.");
  if (order.frozen) lines.push(`${order.frozen} box(es) are frozen under red boxes.`);
  if (order.gated.length) lines.push(`Guided: ${order.gated.length} box(es) wait for the human's approval, and nothing is drafted under one before it: ${order.gated.slice(0, 5).map((p) => p.id).join(", ")}${order.gated.length > 5 ? ", …" : ""}.`);
  if (!order.gate.open && order.gate.total) lines.push(`Refined: ${order.gate.refined} of ${order.gate.total} (${order.gate.what}).`);
  if (order.human.length) lines.push(`For the human: ${order.human.slice(0, 3).map((h) => `${h.action} ${h.id} (${h.why})`).join("; ")}${order.human.length > 3 ? `; … ${order.human.length - 3} more` : ""}.`);
  for (const b of order.blocked.slice(0, 5)) lines.push(`Blocked: ${b.id} waits on ${b.waitingOn.map((w) => `${w} (${canon.nodes[w]?.state})`).join(", ")}.`);
  if (order.blocked.length > 5) lines.push(`… ${order.blocked.length - 5} more blocked.`);
  return lines.join("\n");
}

/** The path line for the terminal: what to validate before working under `id`. */
export function describePath(id: string, path: HumanPick[] | undefined): string {
  if (!path) return `${id} is not in the canon.`;
  if (!path.length) return `The path to ${id} is approved: work under it hangs from the human's words.`;
  return `To validate the path to ${id}: ${path.map((h) => `${h.action} ${h.id} (${h.why})`).join("; ")}.`;
}
