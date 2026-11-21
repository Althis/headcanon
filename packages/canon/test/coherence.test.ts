import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { coherenceClusters, describeCoherence } from "../src/coherence.js";
import { loadCanon } from "../src/load.js";

/**
 * Three branches. Import and Reporting both read src/parse.ts and src/store.ts, both require Storage, both say
 * "statement" and both title a box "... parsing"; inside Import, REQ-1.2 and REQ-1.3 share everything a pair can
 * share (the term and title word "ledger", src/ledger.ts, a requires on REQ-1.1) and must never cluster alone.
 */
function canon(): string {
  const root = mkdtempSync(join(tmpdir(), "headcanon-coherence-"));
  const dir = join(root, "canon");
  const file = (rel: string, text: string) => { mkdirSync(join(dir, rel, ".."), { recursive: true }); writeFileSync(join(dir, rel), text); };
  const node = (id: string, title: string, extra = "", body = "") => `---\nid: ${id}\n${id.includes(".") ? `parent: ${id.slice(0, id.lastIndexOf("."))}\n` : ""}title: "${title}"\nstate: assumed\n${extra}---\n\n# ${title}\n\n${body}`;
  file("README.md", `---\nid: ROOT\ntitle: "Ledger canon"\nstate: resolved\nformat: 2\n---\n\n# Ledger canon\n\n## Intent\n\nA ledger.\n\n## Glossary [assumed]\n\n**statement** (\`TERM-statement\`) [assumed]: a bank's list of transactions.\n**ledger** (\`TERM-ledger\`) [stated]: the book of record.\n`);
  file("REQ-1-import/README.md", node("REQ-1", "Import", "layer: domain\n", "## Intent\n\nStatements come in.\n"));
  file("REQ-1-import/REQ-1.1-csv.md", node("REQ-1.1", "CSV parsing", "kind: binary\n", "## Intent\n\nA CSV statement becomes transactions, one per line.\n\n## Check\n\nOne row, one transaction.\n\n## Implemented by\n\n- CSV is read line by line (src/parse.ts:10-40)\n"));
  file("REQ-1-import/REQ-1.2-posting.md", node("REQ-1.2", "Ledger posting", "requires: [REQ-1.1, REQ-3]\n", "## Intent\n\nEach transaction is posted to the ledger.\n\n## Implemented by\n\n- Posting appends to the book (src/ledger.ts:5)\n- Rows are written through the store (src/store.ts:12-20)\n"));
  file("REQ-1-import/REQ-1.3-yearly.md", node("REQ-1.3", "Yearly ledger parsing", "requires: [REQ-1.1]\n", "## Intent\n\nA whole year is parsed into the ledger at once.\n\n## Implemented by\n\n- The year loop reads twelve files (./src/parse.ts:50-60)\n- Each file is posted (src/ledger.ts:30)\n"));
  file("REQ-1-import/REQ-1.10-archive.md", node("REQ-1.10", "Archive parsing", "", "## Intent\n\nThe archive keeps every file read.\n"));
  file("REQ-2-reporting/README.md", node("REQ-2", "Reporting", "layer: domain\n", "## Intent\n\nReports go out.\n"));
  file("REQ-2-reporting/REQ-2.1-parsing.md", node("REQ-2.1", "Report parsing", "kind: binary\nrequires: [REQ-3]\n", "## Intent\n\nThe report reads the parsed statement.\n\n## Check\n\nA report lists every total.\n\n## Implemented by\n\n- Reads the parser's output (src/parse.ts:88)\n- Totals come from the store (src/store.ts:40)\n"));
  file("REQ-2-reporting/REQ-2.2-exports.md", node("REQ-2.2", "Exports for every report", "", "## Intent\n\nAn understatement of the totals is never shown; reports export to PDF.\n"));
  file("REQ-3-storage.md", node("REQ-3", "Storage for every statement", "kind: binary\n", "## Intent\n\nTransactions are stored.\n\n## Check\n\nEvery Statement is kept for seven years.\n"));
  return dir;
}

describe("cross-branch coherence candidates [DEC-024]", () => {
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(join(d, ".."), { recursive: true, force: true })));
  const fresh = () => { const d = canon(); dirs.push(d); return loadCanon(d); };
  const all = coherenceClusters(fresh());
  const byKey = (key: string) => all.clusters.find((c) => c.key === key);

  it("finds every kind once, term then file then requires then title, alphabetical within a kind, and drops nothing by default", () => {
    expect(all.clusters.map((c) => c.key)).toEqual(["term:statement", "file:src/parse.ts", "file:src/store.ts", "title:parsing"]);
    expect(all.dropped).toEqual([]);
  });

  it("term: a glossary word in Intent or Check, any case, as a whole word; the nodes and their branches in id order", () => {
    // REQ-3 says "Statement" in its Check; REQ-2.2's "understatement" is another word
    expect(byKey("term:statement")).toEqual({
      key: "term:statement",
      kind: "term",
      shared: "statement",
      nodes: ["REQ-1.1", "REQ-2.1", "REQ-3"],
      branches: ["REQ-1", "REQ-2", "REQ-3"],
      why: 'REQ-1.1, REQ-2.1 and REQ-3 all use the glossary term "statement"',
    });
  });

  it("file: the path before the colon of an Implemented by citation, with or without a range or a leading ./", () => {
    expect(byKey("file:src/parse.ts")).toMatchObject({ kind: "file", shared: "src/parse.ts", nodes: ["REQ-1.1", "REQ-1.3", "REQ-2.1"], branches: ["REQ-1", "REQ-2"] });
    expect(byKey("file:src/parse.ts")?.why).toBe("REQ-1.1, REQ-1.3 and REQ-2.1 all cite src/parse.ts under Implemented by");
  });

  it("requires: nodes that require the same target; when the set is one a file finder already made, the reason joins that cluster", () => {
    expect(byKey("requires:REQ-3")).toBeUndefined();
    expect(byKey("file:src/store.ts")).toMatchObject({ nodes: ["REQ-1.2", "REQ-2.1"], why: "REQ-1.2 and REQ-2.1 both cite src/store.ts under Implemented by; also both require REQ-3" });
  });

  it("title: a rare word of four letters or more, not a stop word, in titles across branches; ids sorted numerically", () => {
    expect(byKey("title:parsing")).toMatchObject({ shared: "parsing", nodes: ["REQ-1.1", "REQ-1.3", "REQ-1.10", "REQ-2.1"], branches: ["REQ-1", "REQ-2"] });
    expect(byKey("title:parsing")?.why).toBe('REQ-1.1, REQ-1.3, REQ-1.10 and REQ-2.1 all have "parsing" in their titles');
    // "every" sits in two branches' titles and is a stop word; "report" and "ledger" are one branch's own
    expect(all.clusters.some((c) => c.kind === "title" && c.shared !== "parsing")).toBe(false);
  });

  it("never clusters what one branch shares with itself: REQ-1.2 and REQ-1.3 agree on a term, a file, a target and a title word", () => {
    const keys = all.clusters.map((c) => c.key);
    expect(keys).not.toContain("term:ledger");
    expect(keys).not.toContain("file:src/ledger.ts");
    expect(keys).not.toContain("requires:REQ-1.1");
    expect(keys).not.toContain("title:ledger");
    expect(all.clusters.every((c) => c.branches.length >= 2)).toBe(true);
  });

  it("a word in more titles than rareWordMax is vocabulary, not a candidate", () => {
    const c = coherenceClusters(fresh(), { rareWordMax: 3 });
    expect(c.clusters.map((x) => x.key)).toEqual(["term:statement", "file:src/parse.ts", "file:src/store.ts"]);
  });

  it("a cluster wider than maxSize is dropped and listed with its size, in the order it would have had", () => {
    const c = coherenceClusters(fresh(), { maxSize: 2 });
    expect(c.clusters.map((x) => x.key)).toEqual(["file:src/store.ts"]);
    expect(c.dropped).toEqual([{ key: "term:statement", size: 3 }, { key: "file:src/parse.ts", size: 3 }, { key: "title:parsing", size: 4 }]);
  });

  it("describes one line per cluster and one for the dropped, or says there is nothing", () => {
    expect(describeCoherence(all).split("\n")).toEqual([
      'REQ-1.1, REQ-2.1 and REQ-3 all use the glossary term "statement" [term:statement]',
      "REQ-1.1, REQ-1.3 and REQ-2.1 all cite src/parse.ts under Implemented by [file:src/parse.ts]",
      "REQ-1.2 and REQ-2.1 both cite src/store.ts under Implemented by; also both require REQ-3 [file:src/store.ts]",
      'REQ-1.1, REQ-1.3, REQ-1.10 and REQ-2.1 all have "parsing" in their titles [title:parsing]',
    ]);
    const narrow = describeCoherence(coherenceClusters(fresh(), { maxSize: 2 }));
    expect(narrow.split("\n")[1]).toBe("Too wide to read as one: term:statement (3 nodes), file:src/parse.ts (3 nodes), title:parsing (4 nodes)");
    expect(describeCoherence({ clusters: [], dropped: [] })).toBe("No cross-branch candidates.");
  });

  it("a canon of one branch has no candidates", () => {
    const dir = canon();
    dirs.push(dir);
    rmSync(join(dir, "REQ-2-reporting"), { recursive: true, force: true });
    rmSync(join(dir, "REQ-3-storage.md"));
    const c = coherenceClusters(loadCanon(dir));
    expect(c).toEqual({ clusters: [], dropped: [] });
    expect(describeCoherence(c)).toBe("No cross-branch candidates.");
  });
});
