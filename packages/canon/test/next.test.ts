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

  it("orders by depth, then by how many nodes require it, and lists what is blocked", () => {
    const dir = mkdtempSync(join(tmpdir(), "headcanon-next-"));
    dirs.push(dir);
    node(dir, "REQ-1", "");
    node(dir, "REQ-2", "");
    node(dir, "REQ-3", "requires: [REQ-2]\n");
    node(dir, "REQ-4", "requires: [REQ-2]\n");
    const canon = loadCanon(dir);
    const order = refinementOrder(canon);
    expect(order.next?.id).toBe("REQ-2");
    expect(order.ready.map((p) => p.id)).toEqual(["REQ-2", "REQ-1"]);
    expect(order.blocked.map((b) => `${b.id}<${b.waitingOn.join("+")}`)).toEqual(["REQ-3<REQ-2", "REQ-4<REQ-2"]);
    expect(checkCanon(canon).some((f) => f.code === "requires-cycle" || f.code === "refine-deadlock")).toBe(false);
  });

  it("never waits for an approval: a deep chain of guesses is cut to the leaves, boxes under approved parents first [DEC-024]", () => {
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
    expect(describeNext(order, canon)).toContain("Next to refine: REQ-1.1.1.1 REQ-1.1.1.1 (depth 3; nothing requires it yet; prerequisites met; under an approved box)");
    expect(checkCanon(canon).some((f) => f.code === "refine-deadlock")).toBe(false);
  });

  it("ranks what the human can do by impact: the premise first, then the frontier by what hangs below it, red boxes by what they hide [DEC-024]", () => {
    const dir = mkdtempSync(join(tmpdir(), "headcanon-human-"));
    dirs.push(dir);
    readme(dir, "assumed");
    file(dir, "REQ-1-a/README.md", "REQ-1", "assumed");
    file(dir, "REQ-1-a/REQ-1.1-b/README.md", "REQ-1.1", "assumed", "REQ-1");
    file(dir, "REQ-1-a/REQ-1.1-b/REQ-1.1.1-c.md", "REQ-1.1.1", "assumed", "REQ-1.1", "kind: binary\n");
    file(dir, "REQ-1-a/REQ-1.1-b/REQ-1.1.2-d.md", "REQ-1.1.2", "assumed", "REQ-1.1", "kind: binary\n");
    file(dir, "REQ-1-a/REQ-1.2-e.md", "REQ-1.2", "open", "REQ-1");
    file(dir, "REQ-2-f/README.md", "REQ-2", "assumed");
    file(dir, "REQ-2-f/REQ-2.1-g.md", "REQ-2.1", "assumed", "REQ-2", "kind: binary\n");
    file(dir, "REQ-2-f/REQ-2.2-h.md", "REQ-2.2", "assumed", "REQ-2", "kind: binary\n");
    file(dir, "REQ-3-i.md", "REQ-3", "contested");
    file(dir, "REQ-4-j.md", "REQ-4", "assumed", undefined, "requires: [REQ-3]\n");
    let canon = loadCanon(dir);
    let order = refinementOrder(canon);
    // while the premise is a guess, it is the only approval offered: everything hangs on it; the red boxes stand beside it
    expect(order.human.map((h) => `${h.action} ${h.id}`)).toEqual(["approve ROOT", "settle REQ-3", "settle REQ-1.2"]);
    expect(order.human[0]).toMatchObject({ below: 10, redBelow: 2, score: 11, why: "validates the path for 10 boxes below it, 2 of them red" });
    // REQ-3 is a red leaf at depth 0, where a refined box holds 3 below on average (REQ-1: 4, REQ-2: 2); REQ-4 waits on it
    expect(order.human[1]).toMatchObject({ state: "contested", hidden: 3, unblocks: ["REQ-4"], score: 5, why: "contested; hides about 3 boxes; 1 wait on it" });
    // REQ-1.2 is a draft at depth 1, where the refined boxes (REQ-1.1 with 2 below, two leaves with none) hold 1 below on average
    expect(order.human[2]).toMatchObject({ state: "open", hidden: 1, score: 2, why: "open; hides about 1 box" });
    expect(describeNext(order, canon)).toContain("For the human: approve ROOT (validates the path for 10 boxes below it, 2 of them red); settle REQ-3 (contested; hides about 3 boxes; 1 wait on it); settle REQ-1.2 (open; hides about 1 box).");
    // the premise approved: the frontier is the top level, ranked with the red boxes by impact, a red box first on a tie
    readme(dir, "resolved");
    canon = loadCanon(dir);
    order = refinementOrder(canon);
    expect(order.human.map((h) => `${h.action} ${h.id} ${h.score}`)).toEqual(["settle REQ-3 5", "approve REQ-1 5", "approve REQ-2 3", "settle REQ-1.2 2", "approve REQ-4 1"]);
    expect(order.human[1]?.why).toBe("validates the path for 4 boxes below it, 1 of them red");
    expect(order.human[4]?.why).toBe("nothing below it");
    // REQ-1 approved: its children join the frontier; REQ-1.1 validates two leaves, and the shallower box wins a tie
    file(dir, "REQ-1-a/README.md", "REQ-1", "stated");
    order = refinementOrder(loadCanon(dir));
    expect(order.human.map((h) => `${h.action} ${h.id}`)).toEqual(["settle REQ-3", "approve REQ-2", "approve REQ-1.1", "settle REQ-1.2", "approve REQ-4"]);
    expect(order.human[2]).toMatchObject({ below: 2, score: 3 });
  });

  it("names the path to validate above a box: the unapproved ancestors, the premise first [DEC-024]", () => {
    const dir = mkdtempSync(join(tmpdir(), "headcanon-path-"));
    dirs.push(dir);
    readme(dir, "assumed");
    file(dir, "REQ-1-a/README.md", "REQ-1", "stated");
    file(dir, "REQ-1-a/REQ-1.1-b/README.md", "REQ-1.1", "assumed", "REQ-1");
    file(dir, "REQ-1-a/REQ-1.1-b/REQ-1.1.1-c.md", "REQ-1.1.1", "assumed", "REQ-1.1", "kind: binary\n");
    const canon = loadCanon(dir);
    expect(pathToValidate(canon, "REQ-1.1.1")?.map((h) => `${h.action} ${h.id}`)).toEqual(["approve ROOT", "approve REQ-1.1", "approve REQ-1.1.1"]);
    expect(describePath("REQ-1.1.1", pathToValidate(canon, "REQ-1.1.1"))).toBe("To validate the path to REQ-1.1.1: approve ROOT (validates the path for 3 boxes below it); approve REQ-1.1 (validates the path for 1 box below it); approve REQ-1.1.1 (nothing below it).");
    expect(pathToValidate(canon, "REQ-9")).toBeUndefined();
    expect(describePath("REQ-9", undefined)).toBe("REQ-9 is not in the canon.");
    readme(dir, "resolved");
    file(dir, "REQ-1-a/REQ-1.1-b/README.md", "REQ-1.1", "resolved", "REQ-1");
    file(dir, "REQ-1-a/REQ-1.1-b/REQ-1.1.1-c.md", "REQ-1.1.1", "stated", "REQ-1.1", "kind: binary\n");
    expect(describePath("REQ-1.1.1", pathToValidate(loadCanon(dir), "REQ-1.1.1"))).toContain("is approved");
  });

  it("a box that waits on an unrefined prerequisite is blocked, not a deadlock, while anything is ready", () => {
    const dir = mkdtempSync(join(tmpdir(), "headcanon-blocked-"));
    dirs.push(dir);
    writeFileSync(join(dir, "README.md"), "---\nid: ROOT\ntitle: \"R\"\nstate: resolved\n---\n\n# R\n");
    node(dir, "REQ-1", "");
    node(dir, "REQ-2", "requires: [REQ-1]\n");
    const canon = loadCanon(dir);
    const order = refinementOrder(canon);
    expect(order.ready.map((r) => r.id)).toEqual(["REQ-1"]);
    expect(order.blocked.map((b) => `${b.id}<${b.waitingOn.join("+")}`)).toEqual(["REQ-2<REQ-1"]);
    expect(order.deadlock).toBe(false);
    expect(checkCanon(canon).some((f) => f.code === "refine-deadlock")).toBe(false);
  });

  it("reports a cycle as an error and a deadlock as a warning", () => {
    const dir = mkdtempSync(join(tmpdir(), "headcanon-cycle-"));
    dirs.push(dir);
    node(dir, "REQ-1", "requires: [REQ-2]\n");
    node(dir, "REQ-2", "requires: [REQ-1]\n");
    const canon = loadCanon(dir);
    const order = refinementOrder(canon);
    expect(order.cycles).toEqual([["REQ-1", "REQ-2", "REQ-1"]]);
    expect(order.deadlock).toBe(true);
    expect(order.next).toBeUndefined();
    const codes = checkCanon(canon).map((f) => `${f.level}:${f.code}`);
    expect(codes).toContain("error:requires-cycle");
    expect(codes).toContain("warn:refine-deadlock");
    expect(describeNext(order, canon)).toContain("Cycle in requires: REQ-1 > REQ-2 > REQ-1");
  });
});
