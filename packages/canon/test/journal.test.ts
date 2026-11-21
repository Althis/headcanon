import { describe, expect, it, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { journalChange, readJournal, revertTo } from "../src/journal.js";
import { applyOp } from "../src/ops.js";
import { loadCanon } from "../src/load.js";
import { describeNext, refinementOrder } from "../src/next.js";

const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function repo(): { root: string; canon: string } {
  const root = mkdtempSync(join(tmpdir(), "headcanon-journal-"));
  dirs.push(root);
  execSync("git init -q", { cwd: root });
  const canon = join(root, "canon");
  mkdirSync(canon);
  writeFileSync(join(canon, "README.md"), "---\nid: ROOT\ntitle: \"Ledgerline\"\nstate: resolved\nformat: 4\n---\n\n# Ledgerline\n\n## Intent\n\nBooks for a club.\n");
  mkdirSync(join(canon, "REQ-1-money"));
  writeFileSync(join(canon, "REQ-1-money", "README.md"), "---\nid: REQ-1\ntitle: \"Money\"\nstate: resolved\n---\n\n# Money\n\n## Intent\n\nMoney is tracked.\n");
  writeFileSync(join(canon, "REQ-1-money", "REQ-1.1-dues.md"), "---\nid: REQ-1.1\nparent: REQ-1\ntitle: \"Dues\"\nstate: assumed\n---\n\n# Dues\n\n## Intent\n\nDues are collected.\n");
  return { root, canon };
}

describe("the journal and the revert [DEC-025]", () => {
  it("records page edits with their texts before and after, and reverts to before a point", () => {
    const { canon } = repo();
    const file = join(canon, "REQ-1-money", "REQ-1.1-dues.md");
    const original = readFileSync(file, "utf8");
    const e1 = journalChange(canon, { kind: "page", summary: "REQ-1.1 rewritten", id: "REQ-1.1" }, [file], () => writeFileSync(file, original.replace("Dues are collected.", "Dues are collected monthly.")));
    expect(e1?.seq).toBe(1);
    expect(e1?.files[0]).toMatchObject({ path: "REQ-1-money/REQ-1.1-dues.md" });
    expect(journalChange(canon, { kind: "page", summary: "nothing" }, [file], () => {})).toBeUndefined();
    const e2 = journalChange(canon, { kind: "page", summary: "REQ-1.1 deleted", id: "REQ-1.1" }, [file], () => rmSync(file));
    expect(e2?.seq).toBe(2);
    expect(e2?.files[0]?.after).toBeNull();
    const r = revertTo(canon, 1);
    expect(r.entries).toBe(2);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, "utf8")).toBe(original);
    const log = readJournal(canon);
    expect(log.map((e) => e.kind)).toEqual(["page", "page", "revert"]);
    expect(log[2]!.files.some((f) => f.path === "REQ-1-money/REQ-1.1-dues.md" && f.after === original)).toBe(true);
  });

  it("journals an operation when it commits, so History shows it beside the page's edits", () => {
    const { canon } = repo();
    const r = applyOp(canon, { op: "create", under: "REQ-1", title: "Refunds", intent: "A refund returns dues paid in error." });
    expect(r.ok).toBe(true);
    const log = readJournal(canon);
    expect(log.length).toBe(1);
    expect(log[0]!.kind).toBe("op");
    expect(log[0]!.summary).toContain("create");
    expect(log[0]!.files.some((f) => f.before === null && /REQ-1\.2/.test(f.path))).toBe(true);
    revertTo(canon, 1);
    expect(loadCanon(canon).nodes["REQ-1.2"]).toBeUndefined();
  });

  it("Guided mode gates a ready node that is not approved, whatever its parent is [DEC-025]", () => {
    const { canon } = repo();
    const dues = (state: string) => writeFileSync(join(canon, "REQ-1-money", "REQ-1.1-dues.md"), `---\nid: REQ-1.1\nparent: REQ-1\ntitle: "Dues"\nstate: ${state}\n---\n\n# Dues\n\n## Intent\n\nDues are collected.\n`);
    dues("assumed");
    mkdirSync(join(canon, "REQ-2-members"));
    writeFileSync(join(canon, "REQ-2-members", "README.md"), "---\nid: REQ-2\ntitle: \"Members\"\nstate: assumed\n---\n\n# Members\n\n## Intent\n\nMembers are known.\n");
    writeFileSync(join(canon, "REQ-2-members", "REQ-2.1-join.md"), "---\nid: REQ-2.1\nparent: REQ-2\ntitle: \"Joining\"\nstate: assumed\n---\n\n# Joining\n\n## Intent\n\nA person joins.\n");
    const c = loadCanon(canon);
    const auto = refinementOrder(c);
    expect(auto.ready.map((p) => p.id).sort()).toEqual(["REQ-1.1", "REQ-2.1"]);
    expect(auto.gated).toEqual([]);
    // REQ-1.1 hangs under an approved node and is a guess itself: refining it would draft under a node nobody approved
    const guided = refinementOrder(c, undefined, { guided: true });
    expect(guided.ready).toEqual([]);
    expect(guided.next).toBeUndefined();
    expect(guided.gated.map((p) => p.id)).toEqual(["REQ-1.1", "REQ-2.1"]);
    expect(guided.deadlock).toBe(false);
    // a pause is never printed as the end: the Guided line carries the wait alone
    const paused = describeNext(guided, c);
    expect(paused).not.toContain("Nothing left to refine");
    expect(paused).not.toContain("Next to refine");
    expect(paused).toContain("Guided: 2 node(s) wait for the user's approval, and nothing is drafted under one before it: REQ-1.1, REQ-2.1.");
    expect(describeNext(auto, c)).not.toContain("Guided");
    // the user approves REQ-1.1: it alone opens, and a scope keeps the gate of its own nodes
    dues("stated");
    const c2 = loadCanon(canon);
    const after = refinementOrder(c2, undefined, { guided: true });
    expect(after.ready.map((p) => p.id)).toEqual(["REQ-1.1"]);
    expect(after.gated.map((p) => p.id)).toEqual(["REQ-2.1"]);
    expect(describeNext(after, c2)).toContain("Next to refine: REQ-1.1");
    expect(refinementOrder(c2, "REQ-2", { guided: true })).toMatchObject({ ready: [], gated: [{ id: "REQ-2.1" }] });
  });
});
