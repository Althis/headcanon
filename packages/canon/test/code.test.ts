import { describe, expect, it, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCodeTree, describeTodo, expandUnit } from "../src/code.js";
import { coverageFindings, parcelText, reflexion } from "../src/parcel.js";
import { loadCanon } from "../src/load.js";

const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "headcanon-code-"));
  dirs.push(dir);
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src", "ledger.ts"), [
    "export function closeMonth(period: string) { const total = sumPeriod(period); return formatTotal(total); }",
    "function sumPeriod(period: string) { return toCents(period).length; }",
    "function toCents(s: string) { return s.split(''); }",
    "export const formatTotal = (n: number) => `${n}`;",
    "function orphanHelper() { return 1; }",
    "export class Vault { open(key: string) { return this.check(key); } check(key: string) { return key.length > 0; } }",
    "export const vault = new Vault();",
    "export class Books { private vault: Vault = new Vault(); audit() { return this.vault.open('a'); } }",
    "",
  ].join("\n"));
  writeFileSync(join(dir, "src", "main.ts"), [
    "import { closeMonth, Vault, vault } from './ledger';",
    "import { useStore } from './store';",
    "export function main() { const v = new Vault(); v.open('k'); vault.open('x'); useStore.getState().reset(); return closeMonth('2026-01'); }",
    "",
  ].join("\n"));
  // a store built by a factory: its actions are units, and the getter inside reaches them
  writeFileSync(join(dir, "src", "store.ts"), [
    "import { create } from 'zustand';",
    "import { periodOf } from './dates';",
    "export const useStore = create<{ count: number }>()((set, get) => ({",
    "  count: 0,",
    "  bump: () => set({ count: get().count + 1 }),",
    "  reset: () => { get().bump(); return periodOf(new Date()); },",
    "}));",
    "",
  ].join("\n"));
  writeFileSync(join(dir, "src", "dates.ts"), "export function periodOf(d: Date) { return d.toISOString().slice(0, 7); }\nexport function parsePeriod(s: string) { return s; }\n");
  return dir;
}

describe("the code tree [DEC-025]", () => {
  it("finds every function, resolves calls through imports, classes and this, and marks the unreachable", () => {
    const tree = buildCodeTree(repo());
    const ids = Object.keys(tree.functions).sort();
    expect(ids).toEqual(["src/dates.ts#parsePeriod", "src/dates.ts#periodOf", "src/ledger.ts#<module>", "src/ledger.ts#Books.audit", "src/ledger.ts#Vault.check", "src/ledger.ts#Vault.open", "src/ledger.ts#closeMonth", "src/ledger.ts#formatTotal", "src/ledger.ts#orphanHelper", "src/ledger.ts#sumPeriod", "src/ledger.ts#toCents", "src/main.ts#main", "src/store.ts#<module>", "src/store.ts#useStore.bump", "src/store.ts#useStore.reset"]);
    expect(tree.functions["src/ledger.ts#closeMonth"]!.calls.sort()).toEqual(["src/ledger.ts#formatTotal", "src/ledger.ts#sumPeriod"]);
    expect(tree.functions["src/ledger.ts#sumPeriod"]!.calls).toEqual(["src/ledger.ts#toCents"]);
    expect(tree.functions["src/main.ts#main"]!.calls).toContain("src/ledger.ts#closeMonth");
    expect(tree.functions["src/ledger.ts#Vault.open"]!.calls).toEqual(["src/ledger.ts#Vault.check"]);
    // a method called on a local instance resolves by name when the name is unique, as a possible call
    expect(tree.functions["src/main.ts#main"]!.possible).toContain("src/ledger.ts#Vault.open");
    // a method called on an exported instance, or on a typed field, is a sure call to the class's method
    expect(tree.functions["src/main.ts#main"]!.calls).toContain("src/ledger.ts#Vault.open");
    expect(tree.functions["src/ledger.ts#Books.audit"]!.calls).toEqual(["src/ledger.ts#Vault.open"]);
    // a store's actions are units; `get().bump` inside it and `useStore.getState().reset()` outside it reach them
    expect(tree.functions["src/store.ts#useStore.reset"]!.calls.sort()).toEqual(["src/dates.ts#periodOf", "src/store.ts#useStore.bump"]);
    expect(tree.functions["src/main.ts#main"]!.calls).toContain("src/store.ts#useStore.reset");
    // the store's module unit does not read the actions again: its only call is the factory
    expect(tree.functions["src/store.ts#<module>"]!.unresolved).toEqual(["create"]);
    // unreachable: the orphan helper, the exported date parser nothing calls now that dates.ts is imported, and the
    // audit method of a class nobody instantiates; the module units of imported files are reached by the import itself
    expect(tree.stats.unreachable).toBe(3);
    expect(tree.functions["src/ledger.ts#orphanHelper"]!.exported).toBe(false);
    expect(tree.levels).toBeGreaterThanOrEqual(1);
    const top = tree.roots.map((r) => tree.clusters[r]!);
    expect(top.reduce((x, c) => x + c.size, 0)).toBe(15);
    for (const c of Object.values(tree.clusters)) { expect(c.key).toHaveLength(10); expect(c.cohesion).toBeGreaterThanOrEqual(0); if (c.level > 1) for (const m of c.members) expect(tree.clusters[m]!.parent).toBe(c.id); }
  });

  it("lists what is left to describe, bottom up, and expands a unit one level", () => {
    const tree = buildCodeTree(repo());
    const todo0 = describeTodo(tree, {}, 0);
    expect(todo0.length).toBe(15);
    expect(todo0[0]!.file).toBe("src/dates.ts");
    const d = { "src/ledger.ts#closeMonth": { text: "closes a month's books and shows the total", at: "now" } };
    const level1 = describeTodo(tree, d, 1);
    expect(level1.length).toBe(tree.stats.clustersByLevel[0]);
    const u = expandUnit(tree, d, "src/ledger.ts#closeMonth");
    expect(u?.kind).toBe("function");
    expect(u?.text).toContain("closes a month");
    const c = expandUnit(tree, d, tree.roots[0]!);
    expect(c?.kind).toBe("cluster");
    expect(c?.children.length).toBeGreaterThan(0);
  });

  it("parcels bind evidence to nodes; coverage refuses a split that leaves a bound unit unbound [DEC-025]", () => {
    const tree = buildCodeTree(repo());
    const root = tree.roots[0]!;
    const members = tree.clusters[root]!.members;
    const canonDir = mkdtempSync(join(tmpdir(), "headcanon-parcel-"));
    dirs.push(canonDir);
    const write = (rel: string, id: string, parent: string | undefined, binds: string[]) => { const p = join(canonDir, rel); mkdirSync(join(p, ".."), { recursive: true }); writeFileSync(p, `---\nid: ${id}\n${parent ? `parent: ${parent}\n` : ""}title: "${id}"\nstate: assumed\nbinds: [${binds.map((b) => `"${b}"`).join(", ")}]\n---\n\n# ${id}\n\n## Intent\n\nSomething.\n`); };
    writeFileSync(join(canonDir, "README.md"), "---\nid: ROOT\ntitle: \"Ledgerline\"\nstate: resolved\nformat: 4\n---\n\n# Ledgerline\n\n## Intent\n\nBooks.\n");
    write("REQ-1-a/README.md", "REQ-1", undefined, [`implements ${root}`]);
    write("REQ-1-a/REQ-1.1-b.md", "REQ-1.1", "REQ-1", members.slice(0, Math.max(1, members.length - 1)).map((m) => `contributes ${m}`));
    write("REQ-1-a/REQ-1.2-c.md", "REQ-1.2", "REQ-1", []);
    const canon = loadCanon(canonDir);
    expect(canon.nodes["REQ-1"]!.binds).toEqual([{ relation: "implements", unit: root }]);
    const p = parcelText(canon, "REQ-1", tree, {}, [], 20000);
    expect(p.text).toContain(`[${root}]`);
    expect(p.units).toBe(1);
    const findings = coverageFindings(canon, tree);
    if (members.length > 1) { expect(findings.map((f) => f.id)).toEqual(["REQ-1"]); expect(findings[0]!.message).toContain("1 of"); } else expect(findings).toEqual([]);
    const r = reflexion(canon);
    expect(r["REQ-1"]!.implements).toBe(1);
    expect(r["REQ-1.2"]!.absent).toBe(true);
    expect(r["REQ-1.1"]!.absent).toBe(false);
  });
});
