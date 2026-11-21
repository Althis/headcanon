import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { checkCanon, describeNext, describePath, loadCanon, pathToValidate, refinementOrder } from "../src/index.js";

const MINI = fileURLToPath(new URL("./fixtures/mini/", import.meta.url));

function node(dir: string, id: string, extra: string, body = "") {
  const parent = id.includes(".") ? `parent: ${id.slice(0, id.lastIndexOf("."))}\n` : "";
  const folder = id.includes(".") ? join(dir, `REQ-${id.slice(4, id.lastIndexOf("."))}-x`) : dir;
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, id.includes(".") ? `${id}-x.md` : `${id}-x.md`), `---\nid: ${id}\n${parent}title: "${id} title"\nstate: assumed\n${extra}---\n\n# ${id}\n\n${body}`);
}

/** A node file at its path, so that children nest under it. */
function file(dir: string, rel: string, id: string, state: string, parent?: string, extra = "") {
  mkdirSync(join(dir, rel, ".."), { recursive: true });
  writeFileSync(join(dir, rel), `---\nid: ${id}\n${parent ? `parent: ${parent}\n` : ""}title: "${id}"\nstate: ${state}\n${extra}---\n\n# ${id}\n\n## Intent\n\nKnown.\n`);
}
const readme = (dir: string, state: string) => writeFileSync(join(dir, "README.md"), `---\nid: ROOT\ntitle: "Rank canon"\nstate: ${state}\n---\n\n# Rank canon\n`);

/** The gate fixture: two domains and three capabilities, one cut (REQ-2.1), one waiting on REQ-1.1. */
function gateCanon(dir: string) {
  readme(dir, "resolved");
  file(dir, "REQ-1-a/README.md", "REQ-1", "assumed", undefined, "layer: domain\n");
  file(dir, "REQ-1-a/REQ-1.1-b.md", "REQ-1.1", "assumed", "REQ-1", "layer: capability\n");
  file(dir, "REQ-1-a/REQ-1.2-c.md", "REQ-1.2", "assumed", "REQ-1", "layer: capability\nrequires: [REQ-1.1]\n");
  file(dir, "REQ-2-d/README.md", "REQ-2", "assumed", undefined, "layer: domain\n");
  file(dir, "REQ-2-d/REQ-2.1-e.md", "REQ-2.1", "assumed", "REQ-2", "layer: capability\nkind: binary\n");
}

describe("refinement order [REQ-3.15]", () => {
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

  it("reads requires, and puts a node whose prerequisites are refined before deeper ones", () => {
    const canon = loadCanon(MINI);
    expect(canon.nodes["REQ-2"]?.requires).toEqual(["REQ-1.1"]);
    const order = refinementOrder(canon);
    // REQ-1 has a child and REQ-1.1 has a kind, so both are refined; REQ-1.2 is open; REQ-2 waits on nothing unrefined.
    expect(order.next?.id).toBe("REQ-2");
    expect(order.blocked).toEqual([]);
    expect(order.deadlock).toBe(false);
    expect(describeNext(order, canon)).toContain("Next to refine: REQ-2");
  });

  it("orders by depth, then by how many nodes require it; an unrefined prerequisite orders the work and does not block it [DEC-025]", () => {
    const dir = mkdtempSync(join(tmpdir(), "headcanon-next-"));
    dirs.push(dir);
    node(dir, "REQ-1", "");
    node(dir, "REQ-2", "");
    node(dir, "REQ-3", "requires: [REQ-2]\n");
    node(dir, "REQ-4", "requires: [REQ-2]\n");
    const canon = loadCanon(dir);
    const order = refinementOrder(canon);
    expect(order.next?.id).toBe("REQ-2");
    expect(order.ready.map((p) => p.id)).toEqual(["REQ-2", "REQ-1", "REQ-3", "REQ-4"]);
    expect(order.blocked).toEqual([]);
    expect(checkCanon(canon).some((f) => f.code === "requires-cycle" || f.code === "refine-deadlock")).toBe(false);
  });

  it("never waits for an approval: a deep chain of guesses is refined to the leaves, nodes under approved parents first [DEC-024]", () => {
    const dir = mkdtempSync(join(tmpdir(), "headcanon-deep-"));
    dirs.push(dir);
    readme(dir, "assumed");
    file(dir, "REQ-1-a/README.md", "REQ-1", "assumed");
    file(dir, "REQ-1-a/REQ-1.1-b/README.md", "REQ-1.1", "assumed", "REQ-1");
    file(dir, "REQ-1-a/REQ-1.1-b/REQ-1.1.1-c/README.md", "REQ-1.1.1", "stated", "REQ-1.1");
    file(dir, "REQ-1-a/REQ-1.1-b/REQ-1.1.1-c/REQ-1.1.1.1-d.md", "REQ-1.1.1.1", "assumed", "REQ-1.1.1");
    file(dir, "REQ-1-a/REQ-1.1-b/REQ-1.1.2-e.md", "REQ-1.1.2", "assumed", "REQ-1.1");
    file(dir, "REQ-2-f.md", "REQ-2", "assumed");
    const canon = loadCanon(dir);
    const order = refinementOrder(canon);
    // the premise is a guess, and still every leaf without a kind is ready: the one under the approved REQ-1.1.1 first
    expect(order.ready.map((p) => `${p.id}${p.parentApproved ? "*" : ""}`)).toEqual(["REQ-1.1.1.1*", "REQ-2", "REQ-1.1.2"]);
    expect(order.deadlock).toBe(false);
    expect(describeNext(order, canon)).toContain("Next to refine: REQ-1.1.1.1 REQ-1.1.1.1 (depth 3; nothing requires it yet; prerequisites met; under an approved node)");
    expect(checkCanon(canon).some((f) => f.code === "refine-deadlock")).toBe(false);
  });

  it("ranks what the user can do by impact: the premise first, then the frontier by what hangs below it, red nodes by what they hide [DEC-024]", () => {
    const dir = mkdtempSync(join(tmpdir(), "headcanon-user-"));
    dirs.push(dir);
    readme(dir, "assumed");
    file(dir, "REQ-1-a/README.md", "REQ-1", "assumed");
    file(dir, "REQ-1-a/REQ-1.1-b/README.md", "REQ-1.1", "assumed", "REQ-1");
    file(dir, "REQ-1-a/REQ-1.1-b/REQ-1.1.1-c.md", "REQ-1.1.1", "assumed", "REQ-1.1", "kind: binary\n");
    file(dir, "REQ-1-a/REQ-1.1-b/REQ-1.1.2-d.md", "REQ-1.1.2", "assumed", "REQ-1.1", "kind: binary\n");
    file(dir, "REQ-1-a/REQ-1.2-e.md", "REQ-1.2", "draft", "REQ-1");
    file(dir, "REQ-2-f/README.md", "REQ-2", "assumed");
    file(dir, "REQ-2-f/REQ-2.1-g.md", "REQ-2.1", "assumed", "REQ-2", "kind: binary\n");
    file(dir, "REQ-2-f/REQ-2.2-h.md", "REQ-2.2", "assumed", "REQ-2", "kind: binary\n");
    file(dir, "REQ-3-i.md", "REQ-3", "contested");
    file(dir, "REQ-4-j.md", "REQ-4", "assumed", undefined, "requires: [REQ-3]\n");
    let canon = loadCanon(dir);
    let order = refinementOrder(canon);
    // while the premise is a guess, it is the only approval offered: everything hangs on it; the red nodes stand beside it
    expect(order.user.map((h) => `${h.action} ${h.id}`)).toEqual(["approve ROOT", "settle REQ-3", "settle REQ-1.2"]);
    expect(order.user[0]).toMatchObject({ below: 10, redBelow: 2, score: 11, why: "validates the path for 10 nodes below it, 2 of them red" });
    // REQ-3 is a red leaf at depth 0, where a refined node holds 3 below on average (REQ-1: 4, REQ-2: 2); REQ-4 waits on it
    expect(order.user[1]).toMatchObject({ state: "contested", undrafted: 3, unblocks: ["REQ-4"], score: 5, why: "contested; about 3 nodes not drafted yet; 1 wait on it" });
    // REQ-1.2 is a draft at depth 1, where the refined nodes (REQ-1.1 with 2 below, two leaves with none) hold 1 below on average
    expect(order.user[2]).toMatchObject({ state: "draft", undrafted: 1, score: 2, why: "draft; about 1 node not drafted yet" });
    expect(describeNext(order, canon)).toContain("For the user: approve ROOT (validates the path for 10 nodes below it, 2 of them red); settle REQ-3 (contested; about 3 nodes not drafted yet; 1 wait on it); settle REQ-1.2 (draft; about 1 node not drafted yet).");
    // the premise approved: the frontier is the top level, ranked with the red nodes by impact, a red node first on a tie
    readme(dir, "resolved");
    canon = loadCanon(dir);
    order = refinementOrder(canon);
    expect(order.user.map((h) => `${h.action} ${h.id} ${h.score}`)).toEqual(["settle REQ-3 5", "approve REQ-1 5", "approve REQ-2 3", "settle REQ-1.2 2", "approve REQ-4 1"]);
    expect(order.user[1]?.why).toBe("validates the path for 4 nodes below it, 1 of them red");
    expect(order.user[4]?.why).toBe("nothing below it");
    // REQ-1 approved: its children join the frontier; REQ-1.1 validates two leaves, and the shallower node wins a tie
    file(dir, "REQ-1-a/README.md", "REQ-1", "stated");
    order = refinementOrder(loadCanon(dir));
    expect(order.user.map((h) => `${h.action} ${h.id}`)).toEqual(["settle REQ-3", "approve REQ-2", "approve REQ-1.1", "settle REQ-1.2", "approve REQ-4"]);
    expect(order.user[2]).toMatchObject({ below: 2, score: 3 });
  });

  it("names the path to validate above a node: the unapproved ancestors, the premise first [DEC-024]", () => {
    const dir = mkdtempSync(join(tmpdir(), "headcanon-path-"));
    dirs.push(dir);
    readme(dir, "assumed");
    file(dir, "REQ-1-a/README.md", "REQ-1", "stated");
    file(dir, "REQ-1-a/REQ-1.1-b/README.md", "REQ-1.1", "assumed", "REQ-1");
    file(dir, "REQ-1-a/REQ-1.1-b/REQ-1.1.1-c.md", "REQ-1.1.1", "assumed", "REQ-1.1", "kind: binary\n");
    const canon = loadCanon(dir);
    expect(pathToValidate(canon, "REQ-1.1.1")?.map((h) => `${h.action} ${h.id}`)).toEqual(["approve ROOT", "approve REQ-1.1", "approve REQ-1.1.1"]);
    expect(describePath("REQ-1.1.1", pathToValidate(canon, "REQ-1.1.1"))).toBe("To validate the path to REQ-1.1.1: approve ROOT (validates the path for 3 nodes below it); approve REQ-1.1 (validates the path for 1 node below it); approve REQ-1.1.1 (nothing below it).");
    expect(pathToValidate(canon, "REQ-9")).toBeUndefined();
    expect(describePath("REQ-9", undefined)).toBe("REQ-9 is not in the canon.");
    readme(dir, "resolved");
    file(dir, "REQ-1-a/REQ-1.1-b/README.md", "REQ-1.1", "resolved", "REQ-1");
    file(dir, "REQ-1-a/REQ-1.1-b/REQ-1.1.1-c.md", "REQ-1.1.1", "stated", "REQ-1.1", "kind: binary\n");
    expect(describePath("REQ-1.1.1", pathToValidate(loadCanon(dir), "REQ-1.1.1"))).toContain("is approved");
  });

  it("scopes the order to one subtree for a branch agent, and reports the list gate [DEC-024]", () => {
    const dir = mkdtempSync(join(tmpdir(), "headcanon-under-"));
    dirs.push(dir);
    gateCanon(dir);
    const canon = loadCanon(dir);
    const whole = refinementOrder(canon);
    expect(whole.ready.map((p) => p.id)).toEqual(["REQ-1.1", "REQ-1.2"]);
    expect(whole.gate).toEqual({ open: false, refined: 3, total: 5, what: "every domain and capability" });
    expect(describeNext(whole, canon)).toContain("Refined: 3 of 5 (every domain and capability).");
    const under = refinementOrder(canon, "REQ-2");
    expect(under.ready).toEqual([]);
    expect(under.blocked).toEqual([]);
    expect(under.deadlock).toBe(false);
    expect(under.user.map((h) => h.id)).toEqual(["REQ-2"]);
    expect(under.gate).toEqual(whole.gate);
    const one = refinementOrder(canon, "REQ-1");
    expect(one.ready.map((p) => p.id)).toEqual(["REQ-1.1", "REQ-1.2"]);
    expect(one.blocked).toEqual([]);
  });

  it("opens the list for good once adoption is finished, counts an approved node as refined, and has no gate without domains or capabilities [DEC-024]", () => {
    // the adoption's end opens the list whatever is still uncut: the user validates the canon by it when they return
    const dir = mkdtempSync(join(tmpdir(), "headcanon-gate-"));
    dirs.push(dir);
    gateCanon(dir);
    mkdirSync(join(dir, "decisions"));
    writeFileSync(join(dir, "decisions", "DEC-001-adoption-scope.md"), '---\nid: DEC-001\ntitle: "Adoption scope"\nstate: resolved\nintents: [REQ-1]\n---\n\n# Adoption scope\n');
    expect(refinementOrder(loadCanon(dir)).gate).toEqual({ open: true, refined: 3, total: 5, what: "every domain and capability" });
    // a stated capability is the user's: cut whether or not anything hangs under it; REQ-1.1 still holds the gate
    const two = mkdtempSync(join(tmpdir(), "headcanon-gate-"));
    dirs.push(two);
    gateCanon(two);
    file(two, "REQ-1-a/REQ-1.2-c.md", "REQ-1.2", "stated", "REQ-1", "layer: capability\nrequires: [REQ-1.1]\n");
    expect(refinementOrder(loadCanon(two)).gate).toEqual({ open: false, refined: 4, total: 5, what: "every domain and capability" });
    file(two, "REQ-1-a/REQ-1.1-b.md", "REQ-1.1", "stated", "REQ-1", "layer: capability\n");
    expect(refinementOrder(loadCanon(two)).gate).toMatchObject({ open: true, refined: 5 });
    // a canon whose top level is explicit requirements has nothing to wait for; an empty one has nothing to show
    const flat = mkdtempSync(join(tmpdir(), "headcanon-flat-"));
    dirs.push(flat);
    readme(flat, "assumed");
    file(flat, "REQ-1-a.md", "REQ-1", "assumed", undefined, "layer: requirement\n");
    expect(refinementOrder(loadCanon(flat)).gate).toEqual({ open: true, refined: 0, total: 0, what: "every capability" });
    const empty = mkdtempSync(join(tmpdir(), "headcanon-empty-"));
    dirs.push(empty);
    expect(refinementOrder(loadCanon(empty)).gate.open).toBe(false);
  });

  it("freezes what hangs under a red node: nothing there is ready or blocked until the user settles it [DEC-024]", () => {
    const dir = mkdtempSync(join(tmpdir(), "headcanon-frozen-"));
    dirs.push(dir);
    readme(dir, "resolved");
    file(dir, "REQ-1-a/README.md", "REQ-1", "contested");
    file(dir, "REQ-1-a/REQ-1.1-b/README.md", "REQ-1.1", "assumed", "REQ-1");
    file(dir, "REQ-1-a/REQ-1.1-b/REQ-1.1.1-c.md", "REQ-1.1.1", "assumed", "REQ-1.1");
    file(dir, "REQ-2-d.md", "REQ-2", "assumed");
    const canon = loadCanon(dir);
    const order = refinementOrder(canon);
    // REQ-1.1 is refined, so only its unrefined child is frozen; the node beside the red branch is refined as usual
    expect(order.ready.map((p) => p.id)).toEqual(["REQ-2"]);
    expect(order.blocked).toEqual([]);
    expect(order.frozen).toBe(1);
    expect(order.deadlock).toBe(false);
    expect(describeNext(order, canon)).toContain("1 node(s) are frozen under red nodes.");
    expect(checkCanon(canon).some((f) => f.code === "refine-deadlock")).toBe(false);
    // the red branch's own order: nothing to cut, nothing waiting, no deadlock
    const under = refinementOrder(canon, "REQ-1");
    expect([under.ready, under.blocked, under.frozen, under.deadlock]).toEqual([[], [], 1, false]);
    expect(describeNext(under, canon)).toContain("Nothing left to refine");
    expect(refinementOrder(canon, "REQ-2").frozen).toBe(0);
  });

  it("a branch whose blocked nodes wait on a red node in another branch is waiting, not deadlocked [DEC-024, DEC-025]", () => {
    const dir = mkdtempSync(join(tmpdir(), "headcanon-wait-"));
    dirs.push(dir);
    readme(dir, "resolved");
    file(dir, "REQ-1-a/README.md", "REQ-1", "assumed");
    file(dir, "REQ-1-a/REQ-1.1-b.md", "REQ-1.1", "contested", "REQ-1"); // a red prerequisite is what blocks (DEC-025)
    file(dir, "REQ-2-c/README.md", "REQ-2", "assumed");
    file(dir, "REQ-2-c/REQ-2.1-d.md", "REQ-2.1", "assumed", "REQ-2", "requires: [REQ-1.1]\n");
    const canon = loadCanon(dir);
    const under = refinementOrder(canon, "REQ-2");
    expect(under.next).toBeUndefined();
    expect(under.blocked.map((b) => `${b.id}<${b.waitingOn.join("+")}`)).toEqual(["REQ-2.1<REQ-1.1"]);
    expect(under.deadlock).toBe(false);
    expect(describeNext(under, canon)).toContain("Nothing ready here: 1 node(s) wait on nodes outside this scope.");
    expect(refinementOrder(canon).deadlock).toBe(true); // nothing ready and one node waiting on a red one: waiting on the user (DEC-025)
    // when every unrefined node waits on a red one, the whole canon waits on the user; a branch waiting outside itself does not
    file(dir, "REQ-1-a/REQ-1.1-b.md", "REQ-1.1", "contested", "REQ-1", "requires: [REQ-2.1]\n");
    const stuck = loadCanon(dir);
    expect(refinementOrder(stuck).deadlock).toBe(true);
    expect(refinementOrder(stuck, "REQ-2").deadlock).toBe(false); // its wait is on the other branch's red node
  });

  it("a node whose prerequisite is unrefined is ready after it, not blocked [DEC-025]", () => {
    const dir = mkdtempSync(join(tmpdir(), "headcanon-blocked-"));
    dirs.push(dir);
    writeFileSync(join(dir, "README.md"), "---\nid: ROOT\ntitle: \"R\"\nstate: resolved\n---\n\n# R\n");
    node(dir, "REQ-1", "");
    node(dir, "REQ-2", "requires: [REQ-1]\n");
    const canon = loadCanon(dir);
    const order = refinementOrder(canon);
    expect(order.ready.map((r) => r.id)).toEqual(["REQ-1", "REQ-2"]);
    expect(order.blocked).toEqual([]);
    expect(order.deadlock).toBe(false);
    expect(checkCanon(canon).some((f) => f.code === "refine-deadlock")).toBe(false);
  });

  it("Guided opens a node on its own approval, one rung at a time, and never prints a pause as the end [DEC-025]", () => {
    const dir = mkdtempSync(join(tmpdir(), "headcanon-guided-"));
    dirs.push(dir);
    readme(dir, "resolved");
    for (const id of ["REQ-1", "REQ-2", "REQ-3"]) file(dir, `${id}-x/README.md`, id, "assumed");
    // the domains are drafted under the approved premise and none is approved: Full-Auto goes on, Guided waits
    const drafted = loadCanon(dir);
    expect(describeNext(refinementOrder(drafted), drafted)).toContain("Next to refine: REQ-1 REQ-1 (depth 0; nothing requires it yet; prerequisites met; under an approved node).\nThen: REQ-2, REQ-3.");
    const pause = refinementOrder(drafted, undefined, { guided: true });
    expect([pause.next, pause.ready, pause.deadlock]).toEqual([undefined, [], false]);
    expect(pause.gated.map((p) => p.id)).toEqual(["REQ-1", "REQ-2", "REQ-3"]);
    expect(describeNext(pause, drafted).split("\n")[0]).toBe("Guided: 3 node(s) wait for the user's approval, and nothing is drafted under one before it: REQ-1, REQ-2, REQ-3.");
    // the user approves the second domain: it alone is next, whatever the id order says
    file(dir, "REQ-2-x/README.md", "REQ-2", "stated");
    const approved = loadCanon(dir);
    const one = refinementOrder(approved, undefined, { guided: true });
    expect(one.ready.map((p) => p.id)).toEqual(["REQ-2"]);
    expect(one.gated.map((p) => p.id)).toEqual(["REQ-1", "REQ-3"]);
    expect(describeNext(one, approved)).toContain("Next to refine: REQ-2");
    // its capabilities are drafted: they wait in their turn, and the approved domain above them opens nothing below them
    file(dir, "REQ-2-x/REQ-2.1-y.md", "REQ-2.1", "assumed", "REQ-2");
    file(dir, "REQ-2-x/REQ-2.2-z.md", "REQ-2.2", "resolved", "REQ-2");
    const rung = loadCanon(dir);
    const two = refinementOrder(rung, undefined, { guided: true });
    expect(two.ready.map((p) => p.id)).toEqual(["REQ-2.2"]);
    expect(two.gated.map((p) => p.id)).toEqual(["REQ-1", "REQ-3", "REQ-2.1"]);
    expect(refinementOrder(rung, "REQ-2", { guided: true })).toMatchObject({ next: { id: "REQ-2.2" }, gated: [{ id: "REQ-2.1" }] });
    // without the mode nothing is gated
    expect(refinementOrder(rung).gated).toEqual([]);
    expect(refinementOrder(rung).ready.map((p) => p.id)).toEqual(["REQ-1", "REQ-3", "REQ-2.1", "REQ-2.2"]);
  });

  it("reports a cycle as an error; unrefined nodes in a cycle still order [DEC-025]", () => {
    const dir = mkdtempSync(join(tmpdir(), "headcanon-cycle-"));
    dirs.push(dir);
    node(dir, "REQ-1", "requires: [REQ-2]\n");
    node(dir, "REQ-2", "requires: [REQ-1]\n");
    const canon = loadCanon(dir);
    const order = refinementOrder(canon);
    expect(order.cycles).toEqual([["REQ-1", "REQ-2", "REQ-1"]]);
    expect(order.deadlock).toBe(false); // a cycle between unrefined nodes is an error, not a wait (DEC-025)
    expect(order.next?.id).toBe("REQ-1");
    const codes = checkCanon(canon).map((f) => `${f.level}:${f.code}`);
    expect(codes).toContain("error:requires-cycle");
    expect(codes).not.toContain("warn:refine-deadlock");
    expect(describeNext(order, canon)).toContain("Cycle in requires: REQ-1 > REQ-2 > REQ-1");
  });
});
