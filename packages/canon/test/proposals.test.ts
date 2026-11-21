import { execSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadCanon } from "../src/load.js";
import { applyOp, readOps, type Op } from "../src/ops.js";
import { applyProposal, describeOp, listProposals, proposalsCli, propose, rejectProposal, type CliCtx } from "../src/proposals.js";

const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

/** Ledgerline in a git repository: one domain, two capabilities, entries with two requirements and closing a month with one. */
function repo(git = true): { root: string; canon: string; store: string } {
  const root = mkdtempSync(join(tmpdir(), "headcanon-proposals-"));
  dirs.push(root);
  if (git) execSync("git init -q", { cwd: root });
  const canon = join(root, "canon");
  const file = (rel: string, text: string) => { mkdirSync(join(canon, rel, ".."), { recursive: true }); writeFileSync(join(canon, rel), text); };
  const node = (id: string, title: string, extra = "") => `---\nid: ${id}\n${id.includes(".") ? `parent: ${id.slice(0, id.lastIndexOf("."))}\n` : ""}title: "${title}"\nstate: assumed\n${extra}---\n\n# ${title}\n\n## Intent\n\n${title} holds.\n`;
  file("README.md", `---\nid: ROOT\ntitle: "Ledgerline"\nstate: resolved\nformat: 4\n---\n\n# Ledgerline\n\n## Intent\n\nBooks for a club.\n`);
  file("REQ-1-books/README.md", node("REQ-1", "Books", "layer: domain\npartition: stage\n"));
  file("REQ-1-books/REQ-1.1-entries/README.md", node("REQ-1.1", "Entries", "layer: capability\npartition: kind\n"));
  file("REQ-1-books/REQ-1.1-entries/REQ-1.1.1-dated.md", node("REQ-1.1.1", "An entry carries its date", "layer: requirement\nkind: binary\n"));
  file("REQ-1-books/REQ-1.1-entries/REQ-1.1.2-locked.md", node("REQ-1.1.2", "An entry of a closed month is locked", "layer: requirement\nkind: binary\n"));
  file("REQ-1-books/REQ-1.2-closing/README.md", node("REQ-1.2", "Closing a month", "layer: capability\n"));
  file("REQ-1-books/REQ-1.2-closing/REQ-1.2.1-balanced.md", node("REQ-1.2.1", "A month closes only when it balances", "layer: requirement\nkind: binary\n"));
  return { root, canon, store: join(root, ".git", "headcanon", "proposals.jsonl") };
}

/** Wait for the clock's next millisecond, so what is recorded next is later than what was recorded before. */
const tick = () => { const t = Date.now(); while (Date.now() === t) { /* spin */ } };

const refiner = "refiner-REQ-1.1";
const move: Op = { op: "move", id: "REQ-1.1.2", under: "REQ-1.2" };

describe("proposals [alpha contract 3.3]", () => {
  it("what a refiner may not write is refused with the way out, recorded as a proposal, and applied by the session", () => {
    const { canon, store } = repo();
    expect(applyOp(canon, move, { by: refiner }).error).toBe("outside refiner-REQ-1.1's capability (REQ-1.1): record it with HC propose");
    const p = propose(canon, move, "locking is a rule of closing, not of entries", refiner);
    expect(p).toMatchObject({ by: refiner, op: move, why: "locking is a rule of closing, not of entries", status: "open" });
    expect(p.id).toMatch(/^P-[a-z0-9]{6}$/);
    expect(p.result).toBeUndefined();
    expect(Number.isNaN(Date.parse(p.at))).toBe(false);
    expect(listProposals(canon)).toEqual([p]);
    expect(listProposals(canon, "open")).toEqual([p]);
    expect(listProposals(canon, "applied")).toEqual([]);
    expect(readFileSync(store, "utf8").trim().split("\n").map((l) => JSON.parse(l).id)).toEqual([p.id]);

    const r = applyProposal(canon, p.id, "session");
    expect(r).toMatchObject({ ok: true, proposal: { id: p.id, status: "applied", result: "REQ-1.2.2", by: refiner } });
    expect(r.error).toBeUndefined();
    const nodes = loadCanon(canon).nodes;
    expect(nodes["REQ-1.1.2"]).toBeUndefined();
    expect(nodes["REQ-1.2.2"]).toMatchObject({ parent: "REQ-1.2", title: "An entry of a closed month is locked" });
    expect(listProposals(canon, "open")).toEqual([]);
    expect(listProposals(canon, "applied").map((x) => x.id)).toEqual([p.id]);
    // the operation is in the log under the name that applied it
    expect(readOps(join(store, "..", "ops.jsonl")).at(-1)).toMatchObject({ ok: true, by: "session", request: move });
    // a proposal is decided once
    expect(applyProposal(canon, p.id, "session")).toMatchObject({ ok: false, error: `${p.id} was applied already`, proposal: { status: "applied" } });
    expect(rejectProposal(canon, p.id, "too late")).toBeUndefined();
  });

  it("a rejected proposal keeps the reason and is never applied", () => {
    const { canon } = repo();
    const p = propose(canon, move, "locking is a rule of closing", refiner);
    expect(rejectProposal(canon, p.id, "  entries own the lock;\n closing only triggers it ")).toMatchObject({ id: p.id, status: "rejected", result: "entries own the lock; closing only triggers it" });
    expect(listProposals(canon, "rejected").map((x) => x.id)).toEqual([p.id]);
    expect(listProposals(canon, "open")).toEqual([]);
    expect(applyProposal(canon, p.id)).toMatchObject({ ok: false, error: `${p.id} was rejected already` });
    expect(rejectProposal(canon, p.id, "again")).toBeUndefined();
    expect(rejectProposal(canon, "P-nobody", "x")).toBeUndefined();
    expect(applyProposal(canon, "P-nobody")).toEqual({ ok: false, error: "P-nobody is not a proposal" });
    expect(loadCanon(canon).nodes["REQ-1.1.2"]).toBeDefined();
  });

  it("an operation the canon refuses leaves its proposal open with the refusal, for the session to ask the user", () => {
    const { canon } = repo();
    const locked = join(canon, "REQ-1-books/REQ-1.1-entries/REQ-1.1.2-locked.md");
    writeFileSync(locked, readFileSync(locked, "utf8").replace("state: assumed", "state: stated"));
    const p = propose(canon, { op: "merge", from: "REQ-1.1.2", to: "REQ-1.2.1" }, "both say a closed month does not change", "refiner-REQ-1.2");
    const r = applyProposal(canon, p.id, "session");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("is the user's");
    expect(r.proposal).toMatchObject({ status: "open", result: r.error });
    expect(listProposals(canon, "open")).toEqual([r.proposal]);
    expect(loadCanon(canon).nodes["REQ-1.1.2"]).toBeDefined();
    // once the user has decided, the same proposal can still be closed either way
    expect(rejectProposal(canon, p.id, "the user keeps both")).toMatchObject({ status: "rejected", result: "the user keeps both" });
  });

  it("a name that carries a border is held to it when it applies a proposal", () => {
    const { canon } = repo();
    const p = propose(canon, move, "locking is a rule of closing", refiner);
    expect(applyProposal(canon, p.id, refiner)).toMatchObject({ ok: false, error: "outside refiner-REQ-1.1's capability (REQ-1.1): record it with HC propose", proposal: { status: "open" } });
    expect(loadCanon(canon).nodes["REQ-1.1.2"]).toBeDefined();
  });

  it("an open proposal follows the nodes it names through a move and a merge applied after it was recorded", () => {
    const { canon } = repo();
    const link = propose(canon, { op: "link", from: "REQ-1.1.2", to: "REQ-1.2.1", kind: "requires", why: "a lock needs a closed month" }, "", refiner);
    const note = propose(canon, { op: "note", id: "REQ-1.1.1", text: "REQ-1.1.1 and REQ-1.1.2 share the date field" }, "seen from closing", "refiner-REQ-1.2");
    const moved = propose(canon, move, "locking is a rule of closing", refiner);
    tick();
    expect(applyProposal(canon, moved.id, "session")).toMatchObject({ ok: true, proposal: { result: "REQ-1.2.2" } });
    // REQ-1.1.2 is REQ-1.2.2 now; the link proposed on the old id lands on the node it meant
    const r = applyProposal(canon, link.id, "session");
    expect(r).toMatchObject({ ok: true, proposal: { status: "applied", op: { op: "link", from: "REQ-1.2.2", to: "REQ-1.2.1", kind: "requires" } } });
    expect(loadCanon(canon).nodes["REQ-1.2.2"]?.requires).toEqual(["REQ-1.2.1"]);
    // a merge takes the id away: what named it names the node that absorbed it, in the prose too
    tick();
    expect(applyOp(canon, { op: "unlink", from: "REQ-1.2.2", to: "REQ-1.2.1", kind: "requires" }, { by: "session" }).ok).toBe(true);
    expect(applyOp(canon, { op: "merge", from: "REQ-1.2.2", to: "REQ-1.2.1" }, { by: "session" }).ok).toBe(true);
    expect(applyProposal(canon, note.id, "session")).toMatchObject({ ok: true, proposal: { op: { op: "note", id: "REQ-1.1.1", text: "REQ-1.1.1 and REQ-1.2.1 share the date field" } } });
    expect(readFileSync(join(canon, "REQ-1-books/REQ-1.1-entries/REQ-1.1.1-dated.md"), "utf8")).toContain("REQ-1.1.1 and REQ-1.2.1 share the date field");
    // a renaming older than the proposal is not applied to it: the proposer already wrote today's ids
    tick();
    const late = propose(canon, { op: "note", id: "REQ-1.1.1", text: "REQ-1.1.2 is free again" }, "the number was given up by the move", refiner);
    expect(applyProposal(canon, late.id, "session")).toMatchObject({ ok: true, proposal: { op: { text: "REQ-1.1.2 is free again" } } });
  });

  it("the store is appended to, never rewritten: a change of status is a new line, a torn line is skipped, the order is the order of arrival", () => {
    const { canon, store } = repo();
    const a = propose(canon, move, "first", refiner);
    const b = propose(canon, { op: "term", term: "closed month", definition: "a month whose entries no longer change" }, "second", "refiner-REQ-1.2");
    appendFileSync(store, '{"id":"P-torn","at":"2026-11-1\n\n');
    const c = propose(canon, { op: "note", id: "REQ-1.2.1", text: "the balance is checked to the cent" }, "third");
    expect(c.by).toBeUndefined();
    expect(rejectProposal(canon, a.id, "no")).toBeDefined();
    expect(applyProposal(canon, b.id).ok).toBe(true);
    const lines = readFileSync(store, "utf8").split("\n").filter(Boolean);
    expect(lines).toHaveLength(6);
    expect(listProposals(canon).map((p) => `${p.id}:${p.status}`)).toEqual([`${a.id}:rejected`, `${b.id}:applied`, `${c.id}:open`]);
    expect(listProposals(canon, "applied")[0]).toMatchObject({ result: "TERM-closed-month" });
  });

  it("refuses to record what is not an operation, what has no reason, and anything where there is no git directory", () => {
    const { canon } = repo();
    expect(() => propose(canon, { op: "rename", id: "REQ-1" } as unknown as Op, "x")).toThrow(/"rename" is not one of link, unlink/);
    expect(() => propose(canon, null as unknown as Op, "x")).toThrow(/carries one operation/);
    expect(() => propose(canon, move, "   ")).toThrow(/needs its reason/);
    // the operation's own why is the reason when none is given beside it
    expect(propose(canon, { ...move, why: "locking belongs to closing" }, "").why).toBe("locking belongs to closing");
    expect(listProposals(canon)).toHaveLength(1);
    const bare = repo(false);
    expect(listProposals(bare.canon)).toEqual([]);
    expect(() => propose(bare.canon, move, "x")).toThrow(/not in a git repository/);
    expect(applyProposal(bare.canon, "P-x").ok).toBe(false);
    expect(rejectProposal(bare.canon, "P-x", "y")).toBeUndefined();
  });

  it("says each operation in one line", () => {
    expect(describeOp(move)).toBe("move REQ-1.1.2 under REQ-1.2");
    expect(describeOp({ op: "merge", from: "REQ-1.1.2", to: "REQ-1.2.1" })).toBe("merge REQ-1.1.2 into REQ-1.2.1");
    expect(describeOp({ op: "create", under: "REQ-1.2", title: "Reopening", intent: "x" })).toBe('create "Reopening" under REQ-1.2');
    expect(describeOp({ op: "link", from: "REQ-1.1.2", to: "REQ-1.2.1", kind: "requires" })).toBe("link REQ-1.1.2 requires REQ-1.2.1");
    expect(describeOp({ op: "journey", title: "Closing a month", steps: [] })).toBe('journey "Closing a month"');
    expect(describeOp({ op: "reword", id: "REQ-1.2.1", from: "a", to: "b" })).toBe("reword REQ-1.2.1");
  });
});

describe("HC propose and HC proposals [alpha contract 3.3]", () => {
  function ctx(canon: string, over: Partial<CliCtx> = {}): CliCtx & { outText: () => string; errText: () => string } {
    const o: string[] = [], e: string[] = [];
    return { canonDir: canon, repo: join(canon, ".."), gitDir: join(canon, "..", ".git"), port: 4317, by: undefined, json: false, out: (s) => { o.push(s); }, err: (s) => { e.push(s); }, stdin: () => "", ...over, outText: () => o.join(""), errText: () => e.join("") };
  }

  it("propose records the operation from its argument, from stdin or from a file, with the reason and the name", async () => {
    const { root, canon } = repo();
    const a = ctx(canon, { by: refiner });
    expect(await proposalsCli("propose", [JSON.stringify(move), "--why", "locking is a rule of closing"], a)).toBe(0);
    expect(a.outText()).toMatch(/^Recorded P-[a-z0-9]{6}: move REQ-1\.1\.2 under REQ-1\.2\. /);
    // the shared options may still be among the arguments; stdin carries the operation when the argument is a dash
    const b = ctx(canon, { stdin: () => JSON.stringify({ op: "term", term: "closed month", definition: "a month whose entries no longer change" }) });
    expect(await proposalsCli("propose", ["--canon", canon, "-", "--by=refiner-REQ-1.2", "--why=the word is used by both capabilities", "--json"], b)).toBe(0);
    expect(JSON.parse(b.outText())).toMatchObject({ by: "refiner-REQ-1.2", status: "open", why: "the word is used by both capabilities", op: { op: "term" } });
    const opFile = join(root, "op.json");
    writeFileSync(opFile, JSON.stringify({ op: "note", id: "REQ-1.2.1", text: "checked to the cent", why: "seen in the entries" }));
    expect(await proposalsCli("propose", [`@${opFile}`], ctx(canon))).toBe(0);
    expect(listProposals(canon).map((p) => `${p.by}: ${p.why}`)).toEqual([`${refiner}: locking is a rule of closing`, "refiner-REQ-1.2: the word is used by both capabilities", "undefined: seen in the entries"]);

    for (const [rest, said] of [[[], "usage: headcanon propose"], [["{not json"], "not valid JSON"], [[JSON.stringify(move)], "needs its reason"], [['{"op":"rename"}', "--why", "x"], "is not one of"]] as Array<[string[], string]>) {
      const c = ctx(canon);
      expect(await proposalsCli("propose", rest, c), said).toBe(2);
      expect(c.errText()).toContain(said);
      expect(c.outText()).toBe("");
    }
    expect(listProposals(canon)).toHaveLength(3);
  });

  it("proposals lists, applies and rejects, and its exit code says whether it did", async () => {
    const { canon } = repo();
    const empty = ctx(canon);
    expect(await proposalsCli("proposals", ["--open"], empty)).toBe(0);
    expect(empty.outText()).toBe("No open proposals.\n");
    const p1 = propose(canon, move, "locking is a rule of closing", refiner);
    const p2 = propose(canon, { op: "merge", from: "REQ-1.1.1", to: "REQ-1.2.1" }, "x", "refiner-REQ-1.2");
    const p3 = propose(canon, { op: "note", id: "REQ-9", text: "x" }, "a node that is not there");

    const list = ctx(canon);
    expect(await proposalsCli("proposals", [], list)).toBe(0);
    expect(list.outText()).toBe([
      `${p1.id}  open  ${refiner}  move REQ-1.1.2 under REQ-1.2  why: locking is a rule of closing`,
      `${p2.id}  open  refiner-REQ-1.2  merge REQ-1.1.1 into REQ-1.2.1  why: x`,
      `${p3.id}  open  -  note REQ-9  why: a node that is not there`, "",
    ].join("\n"));

    const applied = ctx(canon, { by: "session" });
    expect(await proposalsCli("proposals", ["apply", p1.id], applied)).toBe(0);
    expect(applied.outText()).toBe(`Applied ${p1.id}: move REQ-1.1.2 under REQ-1.2 (REQ-1.2.2).\n`);
    expect(loadCanon(canon).nodes["REQ-1.2.2"]).toBeDefined();

    const refused = ctx(canon);
    expect(await proposalsCli("proposals", ["apply", p3.id], refused)).toBe(1);
    expect(refused.errText()).toBe(`${p3.id} was not applied: REQ-9 is not in the canon\n`);
    const unknown = ctx(canon);
    expect(await proposalsCli("proposals", ["apply", "P-nobody"], unknown)).toBe(1);
    expect(unknown.errText()).toBe("P-nobody was not applied: P-nobody is not a proposal\n");

    const noWhy = ctx(canon);
    expect(await proposalsCli("proposals", ["reject", p2.id], noWhy)).toBe(2);
    expect(noWhy.errText()).toContain("--why");
    const rejected = ctx(canon);
    expect(await proposalsCli("proposals", ["reject", p2.id, "--why", "a date and a balance are two things"], rejected)).toBe(0);
    expect(rejected.outText()).toBe(`Rejected ${p2.id}: a date and a balance are two things.\n`);
    const twice = ctx(canon);
    expect(await proposalsCli("proposals", ["reject", p2.id, "--why", "again"], twice)).toBe(1);
    expect(twice.errText()).toBe(`${p2.id} is not an open proposal\n`);

    // what is still open says why it waits; --json gives the records themselves
    const open = ctx(canon);
    expect(await proposalsCli("proposals", ["--open"], open)).toBe(0);
    expect(open.outText()).toBe(`${p3.id}  open  -  note REQ-9  why: a node that is not there  refused: REQ-9 is not in the canon\n`);
    const all = ctx(canon, { json: true });
    expect(await proposalsCli("proposals", [], all)).toBe(0);
    expect((JSON.parse(all.outText()) as Array<{ id: string; status: string }>).map((p) => `${p.id}:${p.status}`)).toEqual([`${p1.id}:applied`, `${p2.id}:rejected`, `${p3.id}:open`]);
    const applyJson = ctx(canon, { json: true });
    expect(await proposalsCli("proposals", ["apply", p3.id], applyJson)).toBe(1);
    expect(JSON.parse(applyJson.outText())).toMatchObject({ ok: false, error: "REQ-9 is not in the canon", proposal: { id: p3.id, status: "open" } });

    for (const rest of [["apply"], ["reject"], ["approve", p3.id]]) {
      const c = ctx(canon);
      expect(await proposalsCli("proposals", rest, c)).toBe(2);
      expect(c.errText()).toContain("usage: headcanon propose");
    }
  });
});
