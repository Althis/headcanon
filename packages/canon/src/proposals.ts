/**
 * Proposals: an operation an agent may not apply itself, recorded with its reason for the session to apply or
 * reject. A refiner writes inside its capability and the tool refuses the rest (`scopeOp` in ops.ts); what belongs
 * elsewhere, a move or a merge across the border above all, arrives here.
 *
 * The store is `<git dir>/headcanon/proposals.jsonl`, written by appending only: a proposal is one line, and a
 * change of its status is the whole proposal appended again, the last line of an id being its state. Several agents
 * propose at once from their own processes, and an append never loses another's line where a rewrite could.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { OP_NAMES, applyOp, gitDirOf, newUid, readOps, rewriteIds, type Op } from "./ops.js";

export interface CliCtx { canonDir: string; repo: string; gitDir: string | undefined; port: number; by: string | undefined; json: boolean; out: (s: string) => void; err: (s: string) => void; stdin: () => string }

export interface Proposal { id: string; at: string; by: string | undefined; op: Op; why: string; status: "open" | "applied" | "rejected"; result?: string }

const NO_STORE = "the canon is not in a git repository: proposals are kept in its git directory";

function storePath(canonDir: string): string | undefined {
  const git = gitDirOf(resolve(canonDir));
  return git ? join(git, "headcanon", "proposals.jsonl") : undefined;
}

/** Every proposal in its latest state, in the order they were first recorded. */
function readStore(path: string | undefined): Proposal[] {
  if (!path || !existsSync(path)) return [];
  const byId = new Map<string, Proposal>();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { const p = JSON.parse(line) as Proposal; if (typeof p?.id === "string") byId.set(p.id, p); } catch { /* a torn line is skipped */ }
  }
  return [...byId.values()];
}

function append(path: string, p: Proposal): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(p) + "\n");
}

/** The operation in one line: what it does and to which boxes. */
export function describeOp(op: Op): string {
  switch (op.op) {
    case "move": return `move ${op.id} under ${op.under}`;
    case "merge": return `merge ${op.from} into ${op.to}`;
    case "create": return `create "${op.title}" under ${op.under}`;
    case "link": case "unlink": return `${op.op} ${op.from} ${op.kind} ${op.to}`;
    case "move-edge": return `move-edge on ${op.on} from ${op.from} to ${op.to}`;
    case "bind": return `bind ${op.id} ${op.relation} ${op.unit}`;
    case "unbind": return `unbind ${op.id} from ${op.unit}`;
    case "contest": return `contest ${op.id}${op.other ? ` against ${op.other}` : ""}`;
    case "term": return `term ${op.term}`;
    case "journey": return `journey ${op.id ?? `"${op.title}"`}`;
    default: return `${op.op} ${op.id}`;
  }
}

/** Record an operation for the session to decide. Throws when the operation is not one, the reason is missing, or there is no git directory to keep it in. */
export function propose(canonDir: string, op: Op, why: string, by?: string): Proposal {
  if (!op || typeof op !== "object" || !(OP_NAMES as readonly string[]).includes(op.op)) throw new Error(`a proposal carries one operation; ${JSON.stringify((op as { op?: unknown } | null)?.op)} is not one of ${OP_NAMES.join(", ")}`);
  const reason = (typeof why === "string" && why.trim()) || (typeof op.why === "string" && op.why.trim()) || "";
  if (!reason) throw new Error("a proposal needs its reason: why the operation should be applied");
  const path = storePath(canonDir);
  if (!path) throw new Error(NO_STORE);
  const p: Proposal = { id: `P-${newUid()}`, at: new Date().toISOString(), by: by?.trim() || undefined, op, why: reason.replace(/\s+/g, " "), status: "open" };
  append(path, p);
  return p;
}

/** The proposals, oldest first; with a status, only those in it. */
export function listProposals(canonDir: string, status?: Proposal["status"]): Proposal[] {
  const all = readStore(storePath(canonDir));
  return status ? all.filter((p) => p.status === status) : all;
}

/**
 * The proposal's operation under today's ids: a move or a merge applied since it was recorded renamed boxes, and
 * the operations log holds each renaming, so the ids the proposer wrote are followed to where their boxes are now.
 */
function currentOp(canonDir: string, p: Proposal): Op {
  const git = gitDirOf(resolve(canonDir));
  if (!git) return p.op;
  let text = JSON.stringify(p.op);
  for (const e of readOps(join(git, "headcanon", "ops.jsonl"))) {
    if (!e.ok || !(e.at > p.at)) continue;
    const map = e.request.op === "merge" ? new Map([[e.request.from, e.request.to]]) : new Map(Object.entries(e.renamed ?? {}));
    if (map.size) text = rewriteIds(text, map);
  }
  return JSON.parse(text) as Op;
}

/**
 * Apply an open proposal as `by` (the session; a name that carries a border is held to it like any operation).
 * Applied, it is closed with the id the operation gave; refused, it stays open with the refusal as its result, so
 * the next listing says why it waits.
 */
export function applyProposal(canonDir: string, id: string, by?: string): { ok: boolean; error?: string; proposal?: Proposal } {
  const path = storePath(canonDir);
  if (!path) return { ok: false, error: NO_STORE };
  const p = readStore(path).find((x) => x.id === id);
  if (!p) return { ok: false, error: `${id} is not a proposal` };
  if (p.status !== "open") return { ok: false, error: `${id} was ${p.status} already`, proposal: p };
  const op = currentOp(canonDir, p);
  const r = applyOp(canonDir, op, by ? { by } : {});
  const next: Proposal = r.ok ? { ...p, op, status: "applied", result: r.id ?? "applied" } : { ...p, result: r.error ?? "refused" };
  append(path, next);
  return r.ok ? { ok: true, proposal: next } : { ok: false, error: r.error ?? "refused", proposal: next };
}

/** Close an open proposal without applying it, the reason kept as its result; undefined when there is no open proposal of that id. */
export function rejectProposal(canonDir: string, id: string, why: string): Proposal | undefined {
  const path = storePath(canonDir);
  const p = readStore(path).find((x) => x.id === id);
  if (!path || !p || p.status !== "open") return undefined;
  const next: Proposal = { ...p, status: "rejected", result: (why ?? "").trim().replace(/\s+/g, " ") || "rejected" };
  append(path, next);
  return next;
}

const VALUED = new Set(["--why", "--by", "--canon", "--port", "--repo"]);

/** The command's own arguments; the options every command shares may still be among them and are read past. */
function parseRest(rest: string[]): { pos: string[]; why: string | undefined; by: string | undefined; open: boolean; json: boolean } {
  const a: { pos: string[]; why: string | undefined; by: string | undefined; open: boolean; json: boolean } = { pos: [], why: undefined, by: undefined, open: false, json: false };
  for (let i = 0; i < rest.length; i++) {
    const x = rest[i]!;
    const eq = x.startsWith("--") ? x.indexOf("=") : -1;
    const name = eq > 0 ? x.slice(0, eq) : x;
    const value = () => (eq > 0 ? x.slice(eq + 1) : rest[++i]);
    if (VALUED.has(name)) { const v = value(); if (name === "--why") a.why = v; else if (name === "--by") a.by = v; }
    else if (x === "--open") a.open = true;
    else if (x === "--json") a.json = true;
    else if (x.startsWith("--")) continue;
    else a.pos.push(x);
  }
  return a;
}

function lineOf(p: Proposal): string {
  return `${p.id}  ${p.status}  ${p.by ?? "-"}  ${describeOp(p.op)}  why: ${p.why}${p.result ? `  ${p.status === "open" ? "refused" : "result"}: ${p.result}` : ""}`;
}

const USAGE = [
  "usage: headcanon propose '<op JSON>' | - | @<file>  --why \"<reason>\" --by <name>",
  "       headcanon proposals [--open] [--json]",
  "       headcanon proposals apply <id> [--by <name>]",
  "       headcanon proposals reject <id> --why \"<reason>\"",
].join("\n") + "\n";

export async function proposalsCli(cmd: "propose" | "proposals", rest: string[], ctx: CliCtx): Promise<number> {
  const a = parseRest(rest);
  const by = ctx.by ?? a.by;
  const json = ctx.json || a.json;
  const print = (value: unknown, text: string) => ctx.out(json ? JSON.stringify(value, null, 2) + "\n" : text + "\n");

  if (cmd === "propose") {
    const raw = a.pos[0];
    if (!raw) { ctx.err(USAGE); return 2; }
    let op: Op;
    try { op = JSON.parse(raw === "-" ? ctx.stdin() : raw.startsWith("@") ? readFileSync(resolve(raw.slice(1)), "utf8") : raw) as Op; }
    catch (e) { ctx.err(`propose: the operation is not valid JSON: ${(e as Error).message}\n`); return 2; }
    try {
      const p = propose(ctx.canonDir, op, a.why ?? "", by);
      print(p, `Recorded ${p.id}: ${describeOp(p.op)}. The session applies it or rejects it; go on with your own boxes.`);
      return 0;
    } catch (e) { ctx.err(`propose: ${(e as Error).message}\n`); return 2; }
  }

  const sub = a.pos[0];
  if (sub === "apply") {
    const id = a.pos[1];
    if (!id) { ctx.err(USAGE); return 2; }
    const r = applyProposal(ctx.canonDir, id, by);
    if (json) ctx.out(JSON.stringify(r, null, 2) + "\n");
    else if (r.ok) ctx.out(`Applied ${id}: ${describeOp(r.proposal!.op)}${r.proposal!.result && r.proposal!.result !== "applied" ? ` (${r.proposal!.result})` : ""}.\n`);
    else ctx.err(`${id} was not applied: ${r.error}\n`);
    return r.ok ? 0 : 1;
  }
  if (sub === "reject") {
    const id = a.pos[1];
    if (!id) { ctx.err(USAGE); return 2; }
    if (!a.why?.trim()) { ctx.err("proposals reject needs --why \"<reason>\": the proposer reads it\n"); return 2; }
    const p = rejectProposal(ctx.canonDir, id, a.why);
    if (!p) { ctx.err(`${id} is not an open proposal\n`); return 1; }
    print(p, `Rejected ${id}: ${p.result}.`);
    return 0;
  }
  if (sub) { ctx.err(USAGE); return 2; }
  const list = listProposals(ctx.canonDir, a.open ? "open" : undefined);
  print(list, list.length ? list.map(lineOf).join("\n") : a.open ? "No open proposals." : "No proposals.");
  return 0;
}
