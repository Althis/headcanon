import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { checkCanon, describeNext, LOOKAHEAD, loadCanon, reachOf, refinementOrder } from "../src/index.js";

const MINI = fileURLToPath(new URL("./fixtures/mini/", import.meta.url));

function node(dir: string, id: string, extra: string, body = "") {
  const parent = id.includes(".") ? `parent: ${id.slice(0, id.lastIndexOf("."))}\n` : "";
  const folder = id.includes(".") ? join(dir, `REQ-${id.slice(4, id.lastIndexOf("."))}-x`) : dir;
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, id.includes(".") ? `${id}-x.md` : `${id}-x.md`), `---\nid: ${id}\n${parent}title: "${id} title"\nstate: assumed\n${extra}---\n\n# ${id}\n\n${body}`);
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

  it("drafts no deeper than four levels below the deepest approved box, and says what would release the rest [REQ-3.4, DEC-018, DEC-023]", () => {
    const dir = mkdtempSync(join(tmpdir(), "headcanon-reach-"));
    dirs.push(dir);
    const file = (rel: string, text: string) => { mkdirSync(join(dir, rel, ".."), { recursive: true }); writeFileSync(join(dir, rel), text); };
    const fm = (id: string, state: string, parent?: string) => `---\nid: ${id}\n${parent ? `parent: ${parent}\n` : ""}title: "${id}"\nstate: ${state}\n---\n\n# ${id}\n`;
    const readme = (state: string) => file("README.md", `---\nid: ROOT\ntitle: "Reach canon"\nstate: ${state}\n---\n\n# Reach canon\n`);
    readme("assumed");
    file("REQ-1-a/README.md", fm("REQ-1", "assumed"));
    file("REQ-1-a/REQ-1.1-b/README.md", fm("REQ-1.1", "assumed", "REQ-1"));
    file("REQ-1-a/REQ-1.1-b/REQ-1.1.1-c/README.md", fm("REQ-1.1.1", "assumed", "REQ-1.1"));
    file("REQ-1-a/REQ-1.1-b/REQ-1.1.1-c/REQ-1.1.1.1-d.md", fm("REQ-1.1.1.1", "assumed", "REQ-1.1.1"));
    file("REQ-2-e.md", fm("REQ-2", "assumed"));
    // the premise is a guess: the reach counts from above it, so level 3 and deeper wait
    let order = refinementOrder(loadCanon(dir));
    expect(order.ready.map((p) => p.id)).toEqual(["REQ-2"]);
    expect(order.deadlock).toBe(false);
    expect(order.waiting.map((w) => `${w.id}:${w.level}>${w.reach}:${w.approveOneOf.join("|")}`)).toEqual(["REQ-1.1.1.1:4>3:REQ-1.1.1|REQ-1.1.1.1"]);
    expect(describeNext(order, loadCanon(dir))).toContain("REQ-1.1.1.1 once REQ-1.1.1 or REQ-1.1.1.1 is approved");
    // the premise approved: four levels below it are within reach, the fifth waits
    readme("resolved");
    order = refinementOrder(loadCanon(dir));
    expect(order.ready.map((p) => p.id)).toEqual(["REQ-2"]);
    expect(order.waiting.map((w) => w.id)).toEqual(["REQ-1.1.1.1"]);
    // a deeper approval moves the anchor down
    file("REQ-1-a/REQ-1.1-b/REQ-1.1.1-c/README.md", fm("REQ-1.1.1", "stated", "REQ-1.1"));
    order = refinementOrder(loadCanon(dir));
    expect(order.ready.map((p) => p.id)).toEqual(["REQ-2", "REQ-1.1.1.1"]);
    expect(order.waiting).toEqual([]);
    expect(reachOf(loadCanon(dir), loadCanon(dir).nodes["REQ-1.1.1.1"]!)).toEqual({ level: 4, anchor: "REQ-1.1.1", reach: 3 + LOOKAHEAD });
  });

  it("a canon that only waits for an approval is not a deadlock", () => {
    const dir = mkdtempSync(join(tmpdir(), "headcanon-waiting-"));
    dirs.push(dir);
    // the premise approved: a box four levels down is the last within reach; the one that needs it is blocked, not deadlocked
    writeFileSync(join(dir, "README.md"), "---\nid: ROOT\ntitle: \"R\"\nstate: resolved\n---\n\n# R\n");
    node(dir, "REQ-1", "");
    node(dir, "REQ-1.1", "");
    node(dir, "REQ-1.1.1", "");
    node(dir, "REQ-1.1.1.1", "");
    node(dir, "REQ-2", "requires: [REQ-1.1.1.1]\n");
    const canon = loadCanon(dir);
    const order = refinementOrder(canon);
    expect(order.ready).toEqual([]);
    expect(order.blocked.map((b) => `${b.id}<${b.waitingOn.join("+")}`)).toEqual(["REQ-2<REQ-1.1.1.1"]);
    expect(order.waiting.map((w) => w.id)).toEqual(["REQ-1.1.1.1"]);
    expect(order.deadlock).toBe(false);
    expect(checkCanon(canon).some((f) => f.code === "refine-deadlock")).toBe(false);
    expect(describeNext(order, canon)).toContain("Nothing within reach");
  });

  it("ranks what the human can do by what it releases: an approval that frees waiting boxes first, then a red box others wait on", () => {
    const dir = mkdtempSync(join(tmpdir(), "headcanon-human-"));
    dirs.push(dir);
    writeFileSync(join(dir, "README.md"), "---\nid: ROOT\ntitle: \"R\"\nstate: resolved\n---\n\n# R\n");
    node(dir, "REQ-1", "");
    node(dir, "REQ-1.1", "");
    node(dir, "REQ-1.1.1", "");
    node(dir, "REQ-1.1.1.1", "");
    node(dir, "REQ-1.1.1.2", "");
    node(dir, "REQ-2", "requires: [REQ-1.1.1.1, REQ-1.1.1.2]\n");
    writeFileSync(join(dir, "REQ-3-x.md"), "---\nid: REQ-3\ntitle: \"Draft\"\nstate: open\n---\n\n# Draft\n\n## Intent\n\nKnown so far.\n");
    node(dir, "REQ-4", "requires: [REQ-3]\n");
    const canon = loadCanon(dir);
    const order = refinementOrder(canon);
    expect(order.human.map((h) => `${h.action} ${h.id}`)).toEqual(["approve REQ-1.1.1", "settle REQ-3", "approve REQ-1.1.1.1", "approve REQ-1.1.1.2"]);
    expect(order.human[0]).toMatchObject({ releases: ["REQ-1.1.1.1", "REQ-1.1.1.2"], unblocks: ["REQ-2"], score: 3 });
    expect(order.human[1]).toMatchObject({ state: "open", unblocks: ["REQ-4"], frozen: 0, score: 2 });
    expect(describeNext(order, canon)).toContain("For the human: approve REQ-1.1.1 (releases 2 boxes, then 1 more can be cut); settle REQ-3 (open; 1 wait on it)");
  });

  it("lifts the reach once the adoption is finished: nothing waits, the cutting runs to the leaves", () => {
    const dir = mkdtempSync(join(tmpdir(), "headcanon-finished-"));
    dirs.push(dir);
    writeFileSync(join(dir, "README.md"), "---\nid: ROOT\ntitle: \"R\"\nstate: assumed\n---\n\n# R\n");
    node(dir, "REQ-1", "");
    node(dir, "REQ-1.1", "");
    node(dir, "REQ-1.1.1", "");
    expect(refinementOrder(loadCanon(dir)).waiting.map((w) => w.id)).toEqual(["REQ-1.1.1"]);
    mkdirSync(join(dir, "decisions"), { recursive: true });
    writeFileSync(join(dir, "decisions", "DEC-001-adoption-scope.md"), "---\nid: DEC-001\ntitle: \"Adoption scope\"\nstate: resolved\n---\n\n# Adoption scope\n");
    const order = refinementOrder(loadCanon(dir));
    expect(order.waiting).toEqual([]);
    expect(order.ready.map((r) => r.id)).toEqual(["REQ-1.1.1"]);
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
