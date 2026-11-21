import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { checkCanon } from "../src/check.js";
import { readJournal, revertTo } from "../src/journal.js";
import { loadCanon } from "../src/load.js";
import { applyOp, opStats, readOps, rewriteIds, scopeOp, setListField, type Op } from "../src/ops.js";

/** A small canon: a premise, two domains, one with a capability holding two leaves, a decision and a journey naming them. */
function canon(): { dir: string; log: string; queue: string } {
  const root = mkdtempSync(join(tmpdir(), "headcanon-ops-"));
  const dir = join(root, "canon");
  const file = (rel: string, text: string) => { mkdirSync(join(dir, rel, ".."), { recursive: true }); writeFileSync(join(dir, rel), text); };
  const node = (id: string, title: string, extra = "", body = "") => `---\nid: ${id}\n${id.includes(".") ? `parent: ${id.slice(0, id.lastIndexOf("."))}\n` : ""}title: "${title}"\nstate: assumed\n${extra}---\n\n# ${title}\n\n## Intent\n\n${title} holds.\n${body}`;
  file("README.md", `---\nid: ROOT\ntitle: "Ledger canon"\nstate: resolved\nformat: 3\n---\n\n# Ledger canon\n\n## Intent\n\nA ledger.\n\n## Glossary [assumed]\n\n**statement** (\`TERM-statement\`) [assumed]: a bank's list of transactions.\n**ledger** (\`TERM-ledger\`) [stated]: the book of record.\n`);
  file("REQ-1-import/README.md", node("REQ-1", "Import", "layer: domain\npartition: stage\n"));
  file("REQ-1-import/REQ-1.1-parsing/README.md", node("REQ-1.1", "Parsing", "layer: capability\npartition: format\n", "\n## Implemented by\n\n- CSV is read line by line (src/parse.ts:10-40)\n"));
  file("REQ-1-import/REQ-1.1-parsing/REQ-1.1.1-csv.md", node("REQ-1.1.1", "CSV parsing", "layer: requirement\nkind: binary\n", "\n## Check\n\nA CSV statement yields one transaction per line.\n"));
  file("REQ-1-import/REQ-1.1-parsing/REQ-1.1.2-ofx.md", node("REQ-1.1.2", "OFX parsing", "layer: requirement\nkind: binary\nrequires: [REQ-1.1.1]\n", "\n## Check\n\nAn OFX statement yields its transactions.\n\n## Implemented by\n\n- OFX amounts are read in cents (src/ofx.ts:8)\n"));
  file("REQ-2-reporting.md", node("REQ-2", "Reporting", "layer: domain\nrequires: [REQ-1.1]\n", "\nReporting reads what REQ-1.1 produced.\n"));
  file("decisions/DEC-001-scope.md", `---\nid: DEC-001\ntitle: "Scope"\nstate: resolved\nintents: [REQ-1.1.2, REQ-2]\n---\n\n# Scope\n`);
  file("journeys/JRN-1-first.md", `---\nid: JRN-1\ntitle: "First import"\nstate: assumed\n---\n\n# First import\n\n| Step | Requirements |\n|---|---|\n| S1 Import a file | REQ-1.1.1 |\n| S2 Read the report | REQ-2 |\n`);
  const log = join(root, "ops.jsonl");
  const queue = join(root, "questions.json");
  writeFileSync(queue, JSON.stringify({ queue: [{ id: "q1", nodeId: "REQ-1.1.2", header: "Draft", question: "Which?", options: [], terms: [], askedAt: "2026-11-15T00:00:00Z" }] }, null, 2));
  return { dir, log, queue };
}

describe("operations [DEC-024]", () => {
  const roots: string[] = [];
  afterAll(() => roots.forEach((d) => rmSync(d, { recursive: true, force: true })));
  const fresh = () => { const c = canon(); roots.push(join(c.dir, "..")); return c; };
  const opts = (c: { log: string; queue: string }) => ({ log: c.log, queue: c.queue, by: "test" });

  it("links and unlinks, refuses a cycle, and logs every attempt", () => {
    const c = fresh();
    expect(applyOp(c.dir, { op: "link", from: "REQ-1.1.1", to: "REQ-2", kind: "relates" }, opts(c))).toMatchObject({ ok: true, changes: ["REQ-1-import/REQ-1.1-parsing/REQ-1.1.1-csv.md"] });
    expect(loadCanon(c.dir).nodes["REQ-1.1.1"]?.relates).toEqual(["REQ-2"]);
    // REQ-2 requires REQ-1.1; REQ-1.1.1 requiring REQ-2 is fine, but REQ-1.1.1 requiring REQ-1.1.2 closes a cycle with REQ-1.1.2 requires REQ-1.1.1
    const cycle = applyOp(c.dir, { op: "link", from: "REQ-1.1.1", to: "REQ-1.1.2", kind: "requires" }, opts(c));
    expect(cycle.ok).toBe(false);
    expect(cycle.error).toContain("cycle");
    expect(applyOp(c.dir, { op: "unlink", from: "REQ-1.1.1", to: "REQ-2", kind: "relates" }, opts(c)).ok).toBe(true);
    expect(loadCanon(c.dir).nodes["REQ-1.1.1"]?.relates).toEqual([]);
    const log = readOps(c.log);
    expect(log.map((e) => `${e.request.op}:${e.ok}`)).toEqual(["link:true", "link:false", "unlink:true"]);
    expect(log[0]?.by).toBe("test");
  });

  it("descends an edge to the child that holds the concept, and nowhere else", () => {
    const c = fresh();
    expect(applyOp(c.dir, { op: "move-edge", on: "REQ-2", from: "REQ-1.1", to: "REQ-1.1.1" }, opts(c)).ok).toBe(true);
    expect(loadCanon(c.dir).nodes["REQ-2"]?.requires).toEqual(["REQ-1.1.1"]);
    expect(applyOp(c.dir, { op: "move-edge", on: "REQ-2", from: "REQ-1.1.1", to: "REQ-1.1.2" }, opts(c)).error).toContain("is not under");
  });

  it("creates a node under a leaf parent, which becomes a folder, with its sections", () => {
    const c = fresh();
    const r = applyOp(c.dir, { op: "create", under: "REQ-2", title: "Yearly report", intent: "A year of transactions becomes one report.", layer: "requirement", source: "docs/report.md:3", kind: "binary", check: "The report lists every category's total.", implementedBy: ["The report renders from a template (src/report.ts:1-30)"], deferred: ["the PDF export (docs/report.md:9)"] }, opts(c));
    expect(r).toMatchObject({ ok: true, id: "REQ-2.1" });
    const canon2 = loadCanon(c.dir);
    expect(canon2.nodes["REQ-2"]?.file).toBe("REQ-2-reporting/README.md");
    expect(canon2.nodes["REQ-2.1"]).toMatchObject({ parent: "REQ-2", layer: "requirement", kind: "binary", state: "assumed" });
    // without a layer the child takes the one its depth implies, here a capability under a domain
    expect(applyOp(c.dir, { op: "create", under: "REQ-1", title: "Matching", intent: "Transactions are matched across statements." }, opts(c))).toMatchObject({ ok: true, id: "REQ-1.2" });
    expect(loadCanon(c.dir).nodes["REQ-1.2"]?.layer).toBe("capability");
    const text = readFileSync(join(c.dir, canon2.nodes["REQ-2.1"]!.file), "utf8");
    expect(text).toContain("## Check\n\nThe report lists every category's total.");
    expect(text).toContain("## Implemented by\n\n- The report renders from a template (src/report.ts:1-30)");
    expect(checkCanon(canon2).some((f) => f.level === "error")).toBe(false);
    expect(applyOp(c.dir, { op: "create", under: "REQ-9", title: "x", intent: "y" }, opts(c)).error).toContain("not in the canon");
  });

  it("moves a subtree: ids are renumbered, files relocated, and every reference follows, the queue included", () => {
    const c = fresh();
    const r = applyOp(c.dir, { op: "move", id: "REQ-1.1", under: "REQ-2" }, opts(c));
    expect(r).toMatchObject({ ok: true, id: "REQ-2.1", renamed: { "REQ-1.1": "REQ-2.1", "REQ-1.1.1": "REQ-2.1.1", "REQ-1.1.2": "REQ-2.1.2" } });
    const canon2 = loadCanon(c.dir);
    expect(Object.keys(canon2.nodes).sort()).toEqual(["REQ-1", "REQ-2", "REQ-2.1", "REQ-2.1.1", "REQ-2.1.2"]);
    expect(canon2.nodes["REQ-2.1"]).toMatchObject({ parent: "REQ-2", file: "REQ-2-reporting/REQ-2.1-parsing/README.md", children: ["REQ-2.1.1", "REQ-2.1.2"] });
    expect(canon2.nodes["REQ-2.1.2"]?.requires).toEqual(["REQ-2.1.1"]);
    expect(canon2.nodes["REQ-2"]?.requires).toEqual(["REQ-2.1"]);
    expect(readFileSync(join(c.dir, canon2.nodes["REQ-2"]!.file), "utf8")).toContain("what REQ-2.1 produced");
    expect(canon2.decisions[0]?.intents).toEqual(["REQ-2.1.2", "REQ-2"]);
    expect(canon2.journeys[0]?.steps[0]?.requirements).toEqual(["REQ-2.1.1"]);
    expect(JSON.parse(readFileSync(c.queue, "utf8")).queue[0].nodeId).toBe("REQ-2.1.2");
    expect(existsSync(join(c.dir, "REQ-1-import/REQ-1.1-parsing"))).toBe(false);
    expect(checkCanon(canon2).some((f) => f.level === "error")).toBe(false);
    // a box cannot move into itself, and a layer above its new parent's is refused before anything is written
    expect(applyOp(c.dir, { op: "move", id: "REQ-2", under: "REQ-2.1" }, opts(c)).error).toContain("into itself");
    expect(applyOp(c.dir, { op: "move", id: "REQ-1", under: "REQ-2.1" }, opts(c)).error).toContain("domain");
  });

  it("merges a node into another: edges and evidence carried, references rewritten, the file gone; an approved box is never merged", () => {
    const c = fresh();
    applyOp(c.dir, { op: "link", from: "REQ-1.1.1", to: "REQ-2", kind: "relates" }, opts(c));
    const r = applyOp(c.dir, { op: "merge", from: "REQ-1.1.2", to: "REQ-1.1.1", why: "both say a statement becomes transactions" }, opts(c));
    expect(r.ok).toBe(true);
    const canon2 = loadCanon(c.dir);
    expect(canon2.nodes["REQ-1.1.2"]).toBeUndefined();
    const to = canon2.nodes["REQ-1.1.1"]!;
    expect(to.requires).toEqual([]); // REQ-1.1.2 required REQ-1.1.1 itself: dropped, never a self-edge
    expect(to.relates).toEqual(["REQ-2"]);
    expect(readFileSync(join(c.dir, to.file), "utf8")).toContain("- OFX amounts are read in cents (src/ofx.ts:8)");
    expect(canon2.decisions[0]?.intents).toEqual(["REQ-1.1.1", "REQ-2"]);
    expect(JSON.parse(readFileSync(c.queue, "utf8")).queue[0].nodeId).toBe("REQ-1.1.1");
    expect(checkCanon(canon2).some((f) => f.level === "error")).toBe(false);
    writeFileSync(join(c.dir, "REQ-2-reporting.md"), readFileSync(join(c.dir, "REQ-2-reporting.md"), "utf8").replace("state: assumed", "state: stated"));
    expect(applyOp(c.dir, { op: "merge", from: "REQ-2", to: "REQ-1" }, opts(c)).error).toContain("human's");
  });

  it("contests two boxes with both statements, links them, and leaves the issue to the caller", () => {
    const c = fresh();
    const r = applyOp(c.dir, { op: "contest", id: "REQ-1.1.1", other: "REQ-2", summary: "They cannot both hold.", statements: [{ text: "one transaction per line", source: "docs/a.md:3" }, { text: "one per block", source: "src/parse.ts:12" }] }, opts(c));
    expect(r.ok).toBe(true);
    const canon2 = loadCanon(c.dir);
    expect(canon2.nodes["REQ-1.1.1"]).toMatchObject({ state: "contested", conflicts: ["REQ-2"] });
    expect(canon2.nodes["REQ-2"]).toMatchObject({ state: "contested", conflicts: ["REQ-1.1.1"] });
    expect(readFileSync(join(c.dir, canon2.nodes["REQ-2"]!.file), "utf8")).toContain("## Contested\n\nThey cannot both hold.\n\n- one transaction per line (docs/a.md:3)\n- one per block (src/parse.ts:12)");
  });

  it("writes an assumed glossary term, updates an assumed one, and refuses the human's", () => {
    const c = fresh();
    expect(applyOp(c.dir, { op: "term", term: "transaction", definition: "one movement of money on a statement" }, opts(c))).toMatchObject({ ok: true, id: "TERM-transaction" });
    let terms = loadCanon(c.dir).terms;
    expect(terms.find((t) => t.id === "TERM-transaction")).toMatchObject({ state: "assumed", definition: "one movement of money on a statement" });
    expect(applyOp(c.dir, { op: "term", term: "Statement", definition: "a bank's dated list of transactions" }, opts(c)).ok).toBe(true);
    terms = loadCanon(c.dir).terms;
    expect(terms.filter((t) => t.id === "TERM-statement")).toHaveLength(1);
    expect(terms.find((t) => t.id === "TERM-statement")?.definition).toBe("a bank's dated list of transactions");
    expect(applyOp(c.dir, { op: "term", term: "ledger", definition: "something else" }, opts(c)).error).toContain("human's term");
  });

  it("rewords a guess, never the human's words", () => {
    const c = fresh();
    expect(applyOp(c.dir, { op: "reword", id: "REQ-1.1.1", from: "CSV parsing", to: "CSV reading" }, opts(c)).ok).toBe(true);
    expect(loadCanon(c.dir).nodes["REQ-1.1.1"]?.title).toBe("CSV reading");
    expect(applyOp(c.dir, { op: "reword", id: "REQ-1.1.1", from: "nowhere", to: "x" }, opts(c)).error).toContain("does not occur");
    writeFileSync(join(c.dir, "REQ-2-reporting.md"), readFileSync(join(c.dir, "REQ-2-reporting.md"), "utf8").replace("state: assumed", "state: resolved"));
    expect(applyOp(c.dir, { op: "reword", id: "REQ-2", from: "Reporting", to: "Reports" }, opts(c)).error).toContain("human's words");
  });

  it("deletes a leaf and cleans the edges and decisions that named it; a parent needs subtree; a journey step still naming it refuses the plan", () => {
    const c = fresh();
    expect(applyOp(c.dir, { op: "delete", id: "REQ-1.1" }, opts(c)).error).toContain("has children");
    expect(applyOp(c.dir, { op: "delete", id: "REQ-1.1.2" }, opts(c)).ok).toBe(true);
    const canon2 = loadCanon(c.dir);
    expect(canon2.nodes["REQ-1.1.2"]).toBeUndefined();
    expect(canon2.decisions[0]?.intents).toEqual(["REQ-2"]);
    // REQ-1.1.1 is named by the journey's first step: removing it would leave a dangling link, so the plan is rolled back
    const refused = applyOp(c.dir, { op: "delete", id: "REQ-1.1.1" }, opts(c));
    expect(refused.ok).toBe(false);
    expect(refused.newErrors?.some((e) => e.startsWith("link-unknown"))).toBe(true);
    expect(loadCanon(c.dir).nodes["REQ-1.1.1"]).toBeDefined();
  });

  it("makes a guess a draft with its diagnosis, never the human's box", () => {
    const c = fresh();
    expect(applyOp(c.dir, { op: "draft", id: "REQ-1.1.2", why: "two readings of 'its transactions' survived two corrections" }, opts(c)).ok).toBe(true);
    const n = loadCanon(c.dir).nodes["REQ-1.1.2"]!;
    expect(n.state).toBe("draft");
    expect(readFileSync(join(c.dir, n.file), "utf8")).toMatch(/## Open\n\n- \d{4}-\d{2}-\d{2}: made a draft by review: two readings/);
    writeFileSync(join(c.dir, "REQ-2-reporting.md"), readFileSync(join(c.dir, "REQ-2-reporting.md"), "utf8").replace("state: assumed", "state: stated"));
    expect(applyOp(c.dir, { op: "draft", id: "REQ-2", why: "x" }, opts(c)).error).toContain("human's");
  });

  it("counts review failures per node and per check, and says when the budget is spent", () => {
    const c = fresh();
    const fail = (check: string) => applyOp(c.dir, { op: "review", id: "REQ-1.1.1", verdict: "fail", findings: [{ check, text: "x" }] }, opts(c));
    expect(fail("singular")).toMatchObject({ ok: true, attempt: 1, exhausted: false });
    expect(fail("singular")).toMatchObject({ attempt: 2, exhausted: false });
    expect(fail("vague-term")).toMatchObject({ attempt: 3, exhausted: true });
    expect(applyOp(c.dir, { op: "review", id: "REQ-1.1.1", verdict: "pass" }, opts(c))).toMatchObject({ attempt: 0, exhausted: false });
    expect(fail("singular")).toMatchObject({ attempt: 1 });
    const stats = opStats(readOps(c.log));
    expect(stats.byCheck).toEqual({ singular: 3, "vague-term": 1 });
    expect(stats.retries).toEqual([{ id: "REQ-1.1.1", fails: 1, exhausted: false }]);
    expect(stats.byOp["review"]).toEqual({ ok: 5, failed: 0 });
  });

  it("notes a guess under Open, keeping earlier notes and the state; the human's box takes an issue instead", () => {
    const c = fresh();
    expect(applyOp(c.dir, { op: "note", id: "REQ-1.1.2", text: "the OFX sample carries no dates" }, opts(c))).toMatchObject({ ok: true, id: "REQ-1.1.2", changes: ["REQ-1-import/REQ-1.1-parsing/REQ-1.1.2-ofx.md"] });
    expect(applyOp(c.dir, { op: "note", id: "REQ-1.1.2", text: "amounts come in cents" }, opts(c)).ok).toBe(true);
    const n = loadCanon(c.dir).nodes["REQ-1.1.2"]!;
    expect(n).toMatchObject({ state: "assumed", requires: ["REQ-1.1.1"], kind: "binary" });
    const text = readFileSync(join(c.dir, n.file), "utf8");
    expect(text).toMatch(/## Open\n\n- \d{4}-\d{2}-\d{2}: the OFX sample carries no dates\n- \d{4}-\d{2}-\d{2}: amounts come in cents\n/);
    expect(text).toContain("## Implemented by\n\n- OFX amounts are read in cents (src/ofx.ts:8)");
    expect(applyOp(c.dir, { op: "note", id: "REQ-1.1.2", text: "  " }, opts(c)).error).toContain("needs its text");
    writeFileSync(join(c.dir, "REQ-2-reporting.md"), readFileSync(join(c.dir, "REQ-2-reporting.md"), "utf8").replace("state: assumed", "state: stated"));
    expect(applyOp(c.dir, { op: "note", id: "REQ-2", text: "x" }, opts(c)).error).toBe("REQ-2 is the human's; its drift is an issue, never a note");
  });

  it("records a dispatch and a return without writing, so a compacted session reads back what is held", () => {
    const c = fresh();
    const file = join(c.dir, "REQ-1-import/REQ-1.1-parsing/README.md");
    const before = readFileSync(file, "utf8");
    expect(applyOp(c.dir, { op: "dispatch", id: "REQ-1.1", agent: "refiner-2" }, opts(c))).toMatchObject({ ok: true, id: "REQ-1.1", changes: [] });
    expect(applyOp(c.dir, { op: "returned", id: "REQ-1.1", why: "three leaves written" }, opts(c))).toMatchObject({ ok: true, id: "REQ-1.1", changes: [] });
    expect(applyOp(c.dir, { op: "dispatch", id: "REQ-9" }, opts(c)).error).toContain("not in the canon");
    expect(readFileSync(file, "utf8")).toBe(before);
    const log = readOps(c.log);
    expect(log.map((e) => `${e.request.op}:${e.ok}`)).toEqual(["dispatch:true", "returned:true", "dispatch:false"]);
    expect(log[0]?.request).toMatchObject({ op: "dispatch", id: "REQ-1.1", agent: "refiner-2" });
    expect(readOps(c.log, "REQ-1.1").map((e) => e.request.op)).toEqual(["dispatch", "returned"]);
    const stats = opStats(log);
    expect(stats.byOp["dispatch"]).toEqual({ ok: 1, failed: 1 });
    expect(stats.byOp["returned"]).toEqual({ ok: 1, failed: 0 });
  });

  it("an error that was there before follows a move or a merge: a dangling edge on the moved leaf is not counted as new", () => {
    const c = fresh();
    const ofx = join(c.dir, "REQ-1-import/REQ-1.1-parsing/REQ-1.1.2-ofx.md");
    writeFileSync(ofx, readFileSync(ofx, "utf8").replace("requires: [REQ-1.1.1]", "requires: [REQ-1.1.1, REQ-9]"));
    expect(checkCanon(loadCanon(c.dir)).filter((f) => f.level === "error").map((f) => `${f.code}:${f.id}`)).toEqual(["link-unknown:REQ-1.1.2"]);
    expect(applyOp(c.dir, { op: "move", id: "REQ-1.1", under: "REQ-2" }, opts(c))).toMatchObject({ ok: true, id: "REQ-2.1" });
    expect(loadCanon(c.dir).nodes["REQ-2.1.2"]?.requires).toEqual(["REQ-2.1.1", "REQ-9"]);
    // the same edge, carried onto the absorbing box by a merge
    const d = fresh();
    const ofx2 = join(d.dir, "REQ-1-import/REQ-1.1-parsing/REQ-1.1.2-ofx.md");
    writeFileSync(ofx2, readFileSync(ofx2, "utf8").replace("requires: [REQ-1.1.1]", "requires: [REQ-1.1.1, REQ-9]"));
    expect(applyOp(d.dir, { op: "merge", from: "REQ-1.1.2", to: "REQ-1.1.1" }, opts(d)).ok).toBe(true);
    expect(loadCanon(d.dir).nodes["REQ-1.1.1"]?.requires).toEqual(["REQ-9"]);
  });

  it("a merge rewrites the absorbing box's own text: its prose and the bullets it took no longer name the gone id", () => {
    const c = fresh();
    const csv = join(c.dir, "REQ-1-import/REQ-1.1-parsing/REQ-1.1.1-csv.md");
    writeFileSync(csv, readFileSync(csv, "utf8").replace("one transaction per line.", "one transaction per line, as REQ-1.1.2 does for OFX."));
    const ofx = join(c.dir, "REQ-1-import/REQ-1.1-parsing/REQ-1.1.2-ofx.md");
    writeFileSync(ofx, readFileSync(ofx, "utf8").replace("(src/ofx.ts:8)", "(src/ofx.ts:8, the reader REQ-1.1.2 shares)"));
    expect(applyOp(c.dir, { op: "merge", from: "REQ-1.1.2", to: "REQ-1.1.1" }, opts(c)).ok).toBe(true);
    const text = readFileSync(csv, "utf8");
    expect(text).not.toContain("REQ-1.1.2");
    expect(text).toContain("one transaction per line, as REQ-1.1.1 does for OFX.");
    expect(text).toContain("- OFX amounts are read in cents (src/ofx.ts:8, the reader REQ-1.1.1 shares)");
  });

  it("rewords the body and the title only: a word that is also a front-matter key or value stays metadata", () => {
    const c = fresh();
    expect(applyOp(c.dir, { op: "reword", id: "REQ-1.1.1", from: "binary", to: "yes-or-no" }, opts(c)).error).toContain("does not occur");
    expect(readFileSync(join(c.dir, "REQ-1-import/REQ-1.1-parsing/REQ-1.1.1-csv.md"), "utf8")).toContain("kind: binary");
    const rep = join(c.dir, "REQ-2-reporting.md");
    writeFileSync(rep, readFileSync(rep, "utf8").replace("Reporting reads what REQ-1.1 produced.", "Reporting reads the state REQ-1.1 produced."));
    expect(applyOp(c.dir, { op: "reword", id: "REQ-2", from: "state", to: "status" }, opts(c)).ok).toBe(true);
    const text = readFileSync(rep, "utf8");
    expect(text).toContain("\nstate: assumed\n");
    expect(text).not.toContain("status:");
    expect(text).toContain("Reporting reads the status REQ-1.1 produced.");
    expect(loadCanon(c.dir).nodes["REQ-2"]?.state).toBe("assumed");
  });

  it("a second contest on a box adds to the first: one paragraph, the union of the statements, both conflicts; never against itself", () => {
    const c = fresh();
    const st = (a: string, b: string) => [{ text: a, source: "docs/a.md:3" }, { text: b, source: "src/parse.ts:12" }];
    expect(applyOp(c.dir, { op: "contest", id: "REQ-1.1.1", other: "REQ-2", summary: "They cannot both hold.", statements: st("one transaction per line", "one per block") }, opts(c)).ok).toBe(true);
    const second: Op = { op: "contest", id: "REQ-1.1.1", other: "REQ-1.1.2", summary: "Nor can these.", statements: st("a header line is skipped", "every line counts") };
    expect(applyOp(c.dir, second, opts(c)).ok).toBe(true);
    const canon2 = loadCanon(c.dir);
    expect(canon2.nodes["REQ-1.1.1"]).toMatchObject({ state: "contested", conflicts: ["REQ-2", "REQ-1.1.2"] });
    expect(canon2.nodes["REQ-1.1.2"]).toMatchObject({ state: "contested", conflicts: ["REQ-1.1.1"] });
    const file = join(c.dir, canon2.nodes["REQ-1.1.1"]!.file);
    const text = readFileSync(file, "utf8");
    expect(text).toContain("## Contested\n\nThey cannot both hold. Nor can these.\n\n- one transaction per line (docs/a.md:3)\n- one per block (src/parse.ts:12)\n- a header line is skipped (docs/a.md:3)\n- every line counts (src/parse.ts:12)\n");
    // the same contest again changes nothing
    expect(applyOp(c.dir, second, opts(c)).ok).toBe(true);
    expect(readFileSync(file, "utf8")).toBe(text);
    expect(applyOp(c.dir, { op: "contest", id: "REQ-1.1.1", other: "REQ-1.1.1", summary: "x", statements: st("a", "b") }, opts(c)).error).toContain("itself");
  });

  it("after a merge a decision's intents and a journey step name the surviving id once", () => {
    const c = fresh();
    const dec = join(c.dir, "decisions/DEC-001-scope.md");
    writeFileSync(dec, readFileSync(dec, "utf8").replace("intents: [REQ-1.1.2, REQ-2]", "intents: [REQ-1.1.2, REQ-1.1.1]"));
    const jrn = join(c.dir, "journeys/JRN-1-first.md");
    writeFileSync(jrn, readFileSync(jrn, "utf8").replace("| S1 Import a file | REQ-1.1.1 |", "| S1 Import a file | REQ-1.1.2, REQ-1.1.1 |"));
    expect(applyOp(c.dir, { op: "merge", from: "REQ-1.1.2", to: "REQ-1.1.1" }, opts(c)).ok).toBe(true);
    const canon2 = loadCanon(c.dir);
    expect(canon2.decisions[0]?.intents).toEqual(["REQ-1.1.1"]);
    expect(canon2.journeys[0]?.steps[0]?.requirements).toEqual(["REQ-1.1.1"]);
    expect(readFileSync(dec, "utf8")).toContain("intents: [REQ-1.1.1]");
    expect(readFileSync(jrn, "utf8")).toContain("| S1 Import a file | REQ-1.1.1 |\n| S2 Read the report | REQ-2 |");
  });

  it("a refused plan leaves no folder behind: a create the check refuses after the write is rolled back whole", () => {
    const c = fresh();
    // the create itself knows only the layer names; a domain under a requirement is a layer-order error, found after the write
    const r = applyOp(c.dir, { op: "create", under: "REQ-1.1.1", title: "Misplaced", intent: "A domain under a leaf.", layer: "domain" }, opts(c));
    expect(r.ok).toBe(false);
    expect(r.newErrors?.some((e) => e.startsWith("layer-order"))).toBe(true);
    expect(existsSync(join(c.dir, "REQ-1-import/REQ-1.1-parsing/REQ-1.1.1-csv"))).toBe(false);
    expect(loadCanon(c.dir).nodes["REQ-1.1.1"]?.file).toBe("REQ-1-import/REQ-1.1-parsing/REQ-1.1.1-csv.md");
    expect(checkCanon(loadCanon(c.dir)).some((f) => f.level === "error")).toBe(false);
  });

  it("a descent that would close a requires cycle is refused before anything is written, naming the cycle", () => {
    const c = fresh();
    expect(applyOp(c.dir, { op: "link", from: "REQ-1.1.1", to: "REQ-2", kind: "requires" }, opts(c)).ok).toBe(true);
    // REQ-2 requires REQ-1.1; descending to REQ-1.1.1, which now requires REQ-2, closes the loop
    const r = applyOp(c.dir, { op: "move-edge", on: "REQ-2", from: "REQ-1.1", to: "REQ-1.1.1" }, opts(c));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("REQ-2 requires REQ-1.1.1 would close a cycle: REQ-1.1.1 > REQ-2 > REQ-1.1.1");
    expect(r.newErrors).toBeUndefined();
    expect(loadCanon(c.dir).nodes["REQ-2"]?.requires).toEqual(["REQ-1.1"]);
  });

  it("a node written as .MD moves with its subtree, as the loader reads it; an unknown layer is refused", () => {
    const c = fresh();
    const dir = join(c.dir, "REQ-1-import/REQ-1.1-parsing");
    renameSync(join(dir, "REQ-1.1.2-ofx.md"), join(dir, "REQ-1.1.2-ofx.MD"));
    expect(loadCanon(c.dir).nodes["REQ-1.1.2"]?.file).toBe("REQ-1-import/REQ-1.1-parsing/REQ-1.1.2-ofx.MD");
    // an op arrives as JSON from an agent: a layer the type does not admit is refused by name
    expect(applyOp(c.dir, { op: "move", id: "REQ-1.1", under: "REQ-2", layer: "feature" } as unknown as Op, opts(c)).error).toBe("unknown layer feature");
    expect(applyOp(c.dir, { op: "move", id: "REQ-1.1", under: "REQ-2" }, opts(c)).ok).toBe(true);
    const canon2 = loadCanon(c.dir);
    expect(canon2.nodes["REQ-2.1.2"]).toMatchObject({ parent: "REQ-2.1", file: "REQ-2-reporting/REQ-2.1-parsing/REQ-2.1.2-ofx.MD", requires: ["REQ-2.1.1"] });
    expect(existsSync(join(c.dir, "REQ-1-import/REQ-1.1-parsing"))).toBe(false);
    expect(checkCanon(canon2).some((f) => f.level === "error")).toBe(false);
  });

  it("rewrites ids without touching longer ids, and sets list fields in either form", () => {
    const map = new Map([["REQ-1", "REQ-7"], ["REQ-1.2", "REQ-7.2"]]);
    // only the ids in the map move; a descendant is renamed only when it is in the map itself, which a move guarantees
    expect(rewriteIds("REQ-1, REQ-10, REQ-1.2, REQ-1.20, REQ-1.2.3 and XREQ-1", map)).toBe("REQ-7, REQ-10, REQ-7.2, REQ-1.20, REQ-1.2.3 and XREQ-1");
    expect(setListField("---\nid: X\nrequires:\n  - A\n  - B\n---\n\nbody", "requires", ["C"])).toBe("---\nid: X\nrequires: [C]\n---\n\nbody");
    expect(setListField("---\nid: X\nrequires: [A]\n---\n\nbody", "requires", [])).toBe("---\nid: X\n---\n\nbody");
  });
});

describe("the border a name carries [alpha contract 3.4]", () => {
  const roots: string[] = [];
  afterAll(() => roots.forEach((d) => rmSync(d, { recursive: true, force: true })));
  const fresh = () => { const c = canon(); roots.push(join(c.dir, "..")); return c; };
  const as = (c: { log: string; queue: string }, by?: string) => ({ log: c.log, queue: c.queue, ...(by ? { by } : {}) });
  const refiner = "refiner-REQ-1.1";
  const outside = "outside refiner-REQ-1.1's capability (REQ-1.1): record it with HC propose";
  /** Every file of the canon with its text, so "nothing was written" is one comparison. */
  const texts = (dir: string): Record<string, string> => Object.fromEntries(readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => { const p = join(e.parentPath, e.name); return [p.slice(dir.length), readFileSync(p, "utf8")]; }));

  it("an id is below a capability when it is the capability or starts with it and a dot, never a longer number", () => {
    const note = (id: string): Op => ({ op: "note", id, text: "x" });
    expect(scopeOp(note("REQ-1.1"), refiner)).toEqual({ op: note("REQ-1.1") });
    expect(scopeOp(note("REQ-1.1.2"), refiner)).toEqual({ op: note("REQ-1.1.2") });
    expect(scopeOp(note("REQ-1.1.2.7"), refiner)).toEqual({ op: note("REQ-1.1.2.7") });
    for (const id of ["REQ-1.10", "REQ-1.11.1", "REQ-1", "REQ-1.2", "REQ-2", "REQ-11.1", "ROOT"]) expect(scopeOp(note(id), refiner)).toEqual({ error: outside });
  });

  it("a refiner writes inside its capability: every operation on a box below it is applied", () => {
    const c = fresh();
    const o = as(c, refiner);
    expect(applyOp(c.dir, { op: "create", under: "REQ-1.1", title: "QIF parsing", intent: "A QIF statement yields its transactions." }, o)).toMatchObject({ ok: true, id: "REQ-1.1.3" });
    expect(applyOp(c.dir, { op: "create", under: "REQ-1.1.1", title: "Quoted fields", intent: "A quoted field keeps its commas." }, o)).toMatchObject({ ok: true, id: "REQ-1.1.1.1" });
    expect(applyOp(c.dir, { op: "note", id: "REQ-1.1.2", text: "the sample carries no dates" }, o).ok).toBe(true);
    expect(applyOp(c.dir, { op: "reword", id: "REQ-1.1.2", from: "OFX parsing", to: "OFX reading" }, o).ok).toBe(true);
    expect(applyOp(c.dir, { op: "bind", id: "REQ-1.1.2", unit: "src/ofx.ts#read", relation: "implements" }, o).ok).toBe(true);
    expect(applyOp(c.dir, { op: "unbind", id: "REQ-1.1.2", unit: "src/ofx.ts#read" }, o).ok).toBe(true);
    // the box written is its own; the box named may be anywhere
    expect(applyOp(c.dir, { op: "link", from: "REQ-1.1.3", to: "REQ-2", kind: "relates" }, o).ok).toBe(true);
    expect(applyOp(c.dir, { op: "unlink", from: "REQ-1.1.3", to: "REQ-2", kind: "relates" }, o).ok).toBe(true);
    expect(applyOp(c.dir, { op: "link", from: "REQ-1.1.3", to: "REQ-1.1", kind: "requires" }, o).ok).toBe(true);
    expect(applyOp(c.dir, { op: "move-edge", on: "REQ-1.1.3", from: "REQ-1.1", to: "REQ-1.1.1" }, o).ok).toBe(true);
    expect(applyOp(c.dir, { op: "contest", id: "REQ-1.1.3", summary: "Two readings.", statements: [{ text: "a", source: "docs/a.md:1" }, { text: "b", source: "docs/b.md:1" }] }, o).ok).toBe(true);
    expect(applyOp(c.dir, { op: "draft", id: "REQ-1.1.1.1", why: "the sample settles nothing" }, o).ok).toBe(true);
    expect(applyOp(c.dir, { op: "delete", id: "REQ-1.1.1.1" }, o).ok).toBe(true);
    expect(applyOp(c.dir, { op: "move", id: "REQ-1.1.3", under: "REQ-1.1.2" }, o)).toMatchObject({ ok: true, id: "REQ-1.1.2.1" });
    expect(applyOp(c.dir, { op: "merge", from: "REQ-1.1.2.1", to: "REQ-1.1.2" }, o).ok).toBe(true);
    const canon2 = loadCanon(c.dir);
    expect(Object.keys(canon2.nodes).sort()).toEqual(["REQ-1", "REQ-1.1", "REQ-1.1.1", "REQ-1.1.2", "REQ-2"]);
    expect(checkCanon(canon2).some((f) => f.level === "error")).toBe(false);
    expect(readOps(c.log).every((e) => e.ok && e.by === refiner)).toBe(true);
  });

  it("a refiner is refused everything that writes outside, a move or a merge across the border in either direction included, and nothing is written", () => {
    const c = fresh();
    const o = as(c, refiner);
    const before = texts(c.dir);
    const st = [{ text: "a", source: "docs/a.md:1" }, { text: "b", source: "docs/b.md:1" }];
    const refused: Op[] = [
      { op: "create", under: "REQ-2", title: "Yearly report", intent: "A year becomes one report." },
      { op: "create", under: "REQ-1", title: "Matching", intent: "Transactions are matched." },
      { op: "create", under: "ROOT", title: "Export", intent: "Books leave the product." },
      { op: "note", id: "REQ-2", text: "x" },
      { op: "reword", id: "REQ-2", from: "Reporting", to: "Reports" },
      { op: "bind", id: "REQ-2", unit: "src/report.ts#render", relation: "implements" },
      { op: "unbind", id: "REQ-2", unit: "src/report.ts#render" },
      { op: "draft", id: "REQ-2", why: "x" },
      { op: "delete", id: "REQ-2" },
      { op: "delete", id: "REQ-1", subtree: true },
      { op: "contest", id: "REQ-2", summary: "x", statements: st },
      // a contest writes both boxes: the other one is outside
      { op: "contest", id: "REQ-1.1.1", other: "REQ-2", summary: "x", statements: st },
      { op: "link", from: "REQ-2", to: "REQ-1.1.1", kind: "relates" },
      { op: "unlink", from: "REQ-2", to: "REQ-1.1", kind: "requires" },
      { op: "move-edge", on: "REQ-2", from: "REQ-1.1", to: "REQ-1.1.1" },
      { op: "move", id: "REQ-1.1.2", under: "REQ-2" },
      { op: "move", id: "REQ-1.1.2", under: "ROOT" },
      { op: "move", id: "REQ-2", under: "REQ-1.1" },
      { op: "move", id: "REQ-1.1", under: "REQ-2" },
      { op: "merge", from: "REQ-1.1.2", to: "REQ-2" },
      { op: "merge", from: "REQ-2", to: "REQ-1.1.2" },
      { op: "journey", title: "First import", steps: [{ label: "Import a file", requirements: ["REQ-1.1.1"] }] },
    ];
    for (const op of refused) expect(applyOp(c.dir, op, o), JSON.stringify(op)).toEqual({ ok: false, changes: [], error: outside });
    expect(texts(c.dir)).toEqual(before);
    // every refusal is in the log under the refiner's name, with the operation as it was asked
    const log = readOps(c.log);
    expect(log).toHaveLength(refused.length);
    expect(log.every((e) => !e.ok && e.by === refiner && e.error === outside)).toBe(true);
    expect(log[15]?.request).toEqual({ op: "move", id: "REQ-1.1.2", under: "REQ-2" });
    // an operation no one knows keeps its own refusal
    expect(applyOp(c.dir, { op: "rename", id: "REQ-2" } as unknown as Op, o).error).toBe("unknown operation rename");
  });

  it("a refiner writes a term and leaves its record-only traces wherever they point", () => {
    const c = fresh();
    const o = as(c, refiner);
    expect(applyOp(c.dir, { op: "term", term: "transaction", definition: "one movement of money on a statement" }, o)).toMatchObject({ ok: true, id: "TERM-transaction" });
    expect(applyOp(c.dir, { op: "review", id: "REQ-2", verdict: "fail", findings: [{ check: "singular", text: "x" }] }, o)).toMatchObject({ ok: true, attempt: 1 });
    expect(applyOp(c.dir, { op: "dispatch", id: "REQ-2" }, o).ok).toBe(true);
    expect(applyOp(c.dir, { op: "returned", id: "REQ-2" }, o).ok).toBe(true);
  });

  it("top, the session, a reviewer and no name at all carry no border", () => {
    const move: Op = { op: "move", id: "REQ-1.1.2", under: "REQ-2" };
    for (const by of ["top", "session", "reviewer-REQ-1.1", "test", "REQ-1.1", undefined]) expect(scopeOp(move, by)).toEqual({ op: move });
    const c = fresh();
    expect(applyOp(c.dir, move, as(c, "reviewer-REQ-1.1"))).toMatchObject({ ok: true, id: "REQ-2.1" });
    const d = fresh();
    expect(applyOp(d.dir, move, as(d))).toMatchObject({ ok: true, id: "REQ-2.1" });
    expect(readOps(d.log)[0]?.by).toBeUndefined();
  });

  it("an implementation agent adds a guessed box under any box, marked as the builder's, and nothing else", () => {
    const c = fresh();
    const o = as(c, "implementer-REQ-1.1.1");
    const only = "an implementation agent adds assumptions and issues only";
    const r = applyOp(c.dir, { op: "create", under: "REQ-2", title: "Totals round to cents", intent: "A total is rounded to the cent.", state: "draft", source: "src/report.ts:12", kind: "binary", check: "A total of 0.005 prints as 0.01." }, o);
    expect(r).toMatchObject({ ok: true, id: "REQ-2.1" });
    expect(loadCanon(c.dir).nodes["REQ-2.1"]).toMatchObject({ state: "assumed", source: "builder implementer-REQ-1.1.1: src/report.ts:12", kind: "binary" });
    expect(applyOp(c.dir, { op: "create", under: "REQ-1.1.1", title: "Empty lines are skipped", intent: "An empty line yields no transaction." }, o)).toMatchObject({ ok: true, id: "REQ-1.1.1.1" });
    expect(loadCanon(c.dir).nodes["REQ-1.1.1.1"]).toMatchObject({ state: "assumed", source: "builder implementer-REQ-1.1.1" });
    // the log keeps the operation as it was written, a guess
    expect(readOps(c.log)[0]?.request).toMatchObject({ op: "create", state: "assumed", source: "builder implementer-REQ-1.1.1: src/report.ts:12" });
    const before = texts(c.dir);
    const refused: Op[] = [
      { op: "note", id: "REQ-1.1.1", text: "x" },
      { op: "reword", id: "REQ-1.1.1", from: "CSV", to: "TSV" },
      { op: "bind", id: "REQ-1.1.1", unit: "src/parse.ts#csv", relation: "implements" },
      { op: "delete", id: "REQ-1.1.1.1" },
      { op: "move", id: "REQ-1.1.1.1", under: "REQ-1.1.2" },
      { op: "term", term: "cent", definition: "a hundredth" },
      { op: "review", id: "REQ-1.1.1", verdict: "pass" },
      { op: "journey", title: "First import", steps: [{ label: "Import a file", requirements: ["REQ-1.1.1"] }] },
    ];
    for (const op of refused) expect(applyOp(c.dir, op, o), JSON.stringify(op)).toEqual({ ok: false, changes: [], error: only });
    expect(applyOp(c.dir, { op: "create", under: "ROOT", title: "Export", intent: "Books leave the product." }, o).error).toBe("an implementation agent adds an assumption under a box, never at the top level");
    expect(texts(c.dir)).toEqual(before);
  });

  it("a tester records journeys, notes inside its capability, and guessed boxes there; the rest is refused", () => {
    const c = fresh();
    const o = as(c, "tester-REQ-1.1");
    const out = "outside tester-REQ-1.1's capability (REQ-1.1): record it with HC propose";
    expect(applyOp(c.dir, { op: "journey", title: "Reading a report after an import", steps: [{ label: "Import a file", requirements: ["REQ-1.1.1"] }, { label: "Read the report", requirements: ["REQ-2"] }] }, o)).toMatchObject({ ok: true, id: "JRN-2" });
    expect(applyOp(c.dir, { op: "note", id: "REQ-1.1.2", text: "the amount 1050 is taken from src/ofx.ts:8" }, o).ok).toBe(true);
    expect(applyOp(c.dir, { op: "create", under: "REQ-1.1.1", title: "A header line is skipped", intent: "The first line names the columns.", state: "draft" }, o)).toMatchObject({ ok: true, id: "REQ-1.1.1.1" });
    expect(loadCanon(c.dir).nodes["REQ-1.1.1.1"]).toMatchObject({ state: "assumed", source: undefined });
    expect(applyOp(c.dir, { op: "note", id: "REQ-2", text: "x" }, o)).toEqual({ ok: false, changes: [], error: out });
    expect(applyOp(c.dir, { op: "create", under: "REQ-2", title: "x", intent: "y" }, o)).toEqual({ ok: false, changes: [], error: out });
    for (const op of [{ op: "reword", id: "REQ-1.1.1", from: "CSV", to: "TSV" }, { op: "delete", id: "REQ-1.1.2" }, { op: "term", term: "cent", definition: "a hundredth" }, { op: "move", id: "REQ-1.1.2", under: "REQ-1.1.1" }] as Op[])
      expect(applyOp(c.dir, op, o).error).toBe("a tester records journeys, notes and assumptions only: record anything else with HC propose");
    expect(loadCanon(c.dir).nodes["REQ-1.1.1"]?.title).toBe("CSV parsing");
  });

  it("in Guided, top and a refiner draft nothing under a box the human has not approved; a question, a tester, an implementation agent and the session still write [DEC-025]", () => {
    const c = fresh();
    const root = join(c.dir, "..");
    execSync("git init -q", { cwd: root });
    const settings = join(root, ".git", "headcanon", "settings.json");
    mkdirSync(join(settings, ".."), { recursive: true });
    const mode = (text: string) => writeFileSync(settings, text);
    const under = (id: string, title: string): Extract<Op, { op: "create" }> => ({ op: "create", under: id, title, intent: `${title} holds.` });
    const waits = (id: string) => ({ ok: false, changes: [], error: `Guided: ${id} waits for the human's approval and nothing is drafted under it before that; name it in your report` });
    mode(JSON.stringify({ mode: "guided" }));
    const before = texts(c.dir);
    // the domain REQ-2 and the capability REQ-1.1 are guesses: nothing hangs under them yet
    expect(applyOp(c.dir, under("REQ-2", "Monthly report"), as(c, "top"))).toEqual(waits("REQ-2"));
    expect(applyOp(c.dir, under("REQ-1.1", "A header line is skipped"), as(c, refiner))).toEqual(waits("REQ-1.1"));
    expect(texts(c.dir)).toEqual(before);
    expect(readOps(c.log).map((e) => [e.by, e.ok])).toEqual([["top", false], [refiner, false]]);
    // the premise is approved, so the domains are drafted under it; a box that is not in the canon keeps its own refusal
    expect(applyOp(c.dir, under("ROOT", "Export"), as(c, "top"))).toMatchObject({ ok: true, id: "REQ-3" });
    expect(applyOp(c.dir, under("REQ-9", "Nowhere"), as(c, "top")).error).toBe("REQ-9 is not in the canon");
    // a draft is a question for the human and stands anywhere; the other names are not the drafting
    expect(applyOp(c.dir, { ...under("REQ-1.1", "Which separator"), state: "draft" }, as(c, refiner))).toMatchObject({ ok: true, id: "REQ-1.1.3" });
    expect(applyOp(c.dir, under("REQ-1.1", "A blank line is skipped"), as(c, "tester-REQ-1.1")).ok).toBe(true);
    expect(applyOp(c.dir, under("REQ-1.1", "A quoted field keeps its comma"), as(c, "implementer-REQ-1.1")).ok).toBe(true);
    expect(applyOp(c.dir, under("REQ-2", "Yearly report"), as(c, "session")).ok).toBe(true);
    // the human approves the capability: its refiner writes the rung under it, and not the one below
    const capability = join(c.dir, "REQ-1-import/REQ-1.1-parsing/README.md");
    writeFileSync(capability, readFileSync(capability, "utf8").replace("state: assumed", "state: stated"));
    const rung = applyOp(c.dir, under("REQ-1.1", "A header line is skipped"), as(c, refiner));
    expect(rung.ok).toBe(true);
    expect(applyOp(c.dir, under(rung.id!, "The header names the columns"), as(c, refiner))).toEqual(waits(rung.id!));
    // Full-Auto, and a settings file that cannot be read, gate nothing
    mode(JSON.stringify({ mode: "full-auto" }));
    expect(applyOp(c.dir, under(rung.id!, "The header names the columns"), as(c, refiner)).ok).toBe(true);
    mode("{");
    expect(applyOp(c.dir, under("REQ-2", "Quarterly report"), as(c, "top")).ok).toBe(true);
  });
});

describe("the journey operation [alpha contract 3.4]", () => {
  const roots: string[] = [];
  afterAll(() => roots.forEach((d) => rmSync(d, { recursive: true, force: true })));
  const fresh = () => { const c = canon(); roots.push(join(c.dir, "..")); return c; };
  const opts = (c: { log: string; queue: string }) => ({ log: c.log, queue: c.queue, by: "top" });
  const steps = [
    { label: "Import a file", requirements: ["REQ-1.1.1", "REQ-1.1.2"], given: "a statement on disk", does: "the person picks the file", sees: "one line per transaction" },
    { label: "Read the report", requirements: ["REQ-2"], does: "the person opens the report", sees: "the month's totals" },
    { label: "Close", requirements: ["REQ-2"] },
  ];

  it("writes a new assumed journey in the format the loader reads: front matter, a graph, a table of steps with their boxes", () => {
    const c = fresh();
    const r = applyOp(c.dir, { op: "journey", title: "Reading a report after an import", steps, source: "docs/guide.md:3-20", why: "the guide walks this path" }, opts(c));
    expect(r).toEqual({ ok: true, changes: ["journeys/JRN-2-reading-a-report-after-an-import.md"], id: "JRN-2" });
    const canon2 = loadCanon(c.dir);
    const j = canon2.journeys.find((x) => x.id === "JRN-2")!;
    expect(j).toMatchObject({ title: "Reading a report after an import", state: "assumed", source: "docs/guide.md:3-20", file: "journeys/JRN-2-reading-a-report-after-an-import.md" });
    expect(j.steps).toEqual([
      { id: "S1", label: "Import a file", state: "assumed", requirements: ["REQ-1.1.1", "REQ-1.1.2"] },
      { id: "S2", label: "Read the report", state: "assumed", requirements: ["REQ-2"] },
      { id: "S3", label: "Close", state: "assumed", requirements: ["REQ-2"] },
    ]);
    expect(j.mermaid).toBe('flowchart TD\n    S1["Import a file"] --> S2["Read the report"]\n    S2 --> S3["Close"]');
    expect(readFileSync(join(c.dir, j.file), "utf8")).toBe([
      "---", "id: JRN-2", 'title: "Reading a report after an import"', "state: assumed", 'source: "docs/guide.md:3-20"', "---", "",
      "# Reading a report after an import", "",
      "```mermaid", "flowchart TD", '    S1["Import a file"] --> S2["Read the report"]', '    S2 --> S3["Close"]', "```", "",
      "| Step | State | Linked requirements | Given | Does | Sees |",
      "| --- | --- | --- | --- | --- | --- |",
      "| S1 Import a file | assumed | REQ-1.1.1, REQ-1.1.2 | a statement on disk | the person picks the file | one line per transaction |",
      "| S2 Read the report | assumed | REQ-2 |  | the person opens the report | the month's totals |",
      "| S3 Close | assumed | REQ-2 |  |  |  |", "",
    ].join("\n"));
    // it raises no finding of its own: not an error, not an unlinked step, not a missing graph
    expect(checkCanon(canon2).filter((f) => f.id?.startsWith("JRN-2"))).toEqual([]);
    expect(readOps(c.log).at(-1)).toMatchObject({ ok: true, by: "top", id: "JRN-2", request: { op: "journey" } });
    // the next one takes the next number
    expect(applyOp(c.dir, { op: "journey", title: "Closing", steps: [{ label: "Close", requirements: ["REQ-2"] }] }, opts(c))).toMatchObject({ ok: true, id: "JRN-3", changes: ["journeys/JRN-3-closing.md"] });
    const one = loadCanon(c.dir).journeys.find((x) => x.id === "JRN-3")!;
    expect(one.mermaid).toBe('flowchart TD\n    S1["Close"]');
    // without given, does and sees the table keeps the three columns
    expect(readFileSync(join(c.dir, one.file), "utf8")).toContain("| Step | State | Linked requirements |\n| --- | --- | --- |\n| S1 Close | assumed | REQ-2 |\n");
  });

  it("keeps a step's words inside its cell: a bar, a quote and a line break cannot break the row or the graph", () => {
    const c = fresh();
    const r = applyOp(c.dir, { op: "journey", title: 'The "first" import: a\\b', steps: [{ label: 'Pick "CSV | OFX"', requirements: [" REQ-1.1.1 ", "REQ-1.1.1"], sees: "a list\nof lines | totals" }, { label: "Read", requirements: ["REQ-2"] }] }, opts(c));
    expect(r).toMatchObject({ ok: true, id: "JRN-2" });
    const canon2 = loadCanon(c.dir);
    const j = canon2.journeys.find((x) => x.id === "JRN-2")!;
    expect(j.title).toBe("The 'first' import: a\\b");
    expect(j.steps).toEqual([{ id: "S1", label: 'Pick "CSV / OFX"', state: "assumed", requirements: ["REQ-1.1.1"] }, { id: "S2", label: "Read", state: "assumed", requirements: ["REQ-2"] }]);
    expect(j.mermaid).toContain(`S1["Pick 'CSV / OFX'"] --> S2["Read"]`);
    expect(readFileSync(join(c.dir, j.file), "utf8")).toContain("| S1 Pick \"CSV / OFX\" | assumed | REQ-1.1.1 |  |  | a list of lines / totals |");
    expect(checkCanon(canon2).some((f) => f.level === "error")).toBe(false);
  });

  it("refuses a journey without a title, without steps, with a step that has no label or cites no box or an unknown one, and any state but assumed", () => {
    const c = fresh();
    const j = (extra: object) => applyOp(c.dir, { op: "journey", title: "First import", steps: [{ label: "Import a file", requirements: ["REQ-1.1.1"] }], ...extra } as Op, opts(c));
    expect(j({ title: "  " }).error).toContain("needs a title");
    expect(j({ steps: [] }).error).toContain("needs its steps");
    expect(j({ steps: undefined }).error).toContain("needs its steps");
    expect(j({ steps: [{ label: "Import a file", requirements: ["REQ-1.1.1"] }, { label: " ", requirements: ["REQ-2"] }] }).error).toBe("step 2 needs a label: what the person does, in a few words");
    expect(j({ steps: [{ label: "Import a file", requirements: [] }] }).error).toBe("step 1 cites no box: name the requirements it exercises");
    expect(j({ steps: [{ label: "Import a file" }] }).error).toBe("step 1 cites no box: name the requirements it exercises");
    expect(j({ steps: [{ label: "Import a file", requirements: ["REQ-1.1.1", "REQ-9"] }] }).error).toBe("step 1 cites REQ-9, which is not in the canon");
    expect(j({ state: "stated" }).error).toContain("is assumed");
    expect(j({ id: "JRN-7" }).error).toBe("JRN-7 is not in the canon");
    expect(loadCanon(c.dir).journeys.map((x) => x.id)).toEqual(["JRN-1"]);
    expect(existsSync(join(c.dir, "journeys/JRN-2-first-import.md"))).toBe(false);
    expect(readOps(c.log).every((e) => !e.ok)).toBe(true);
  });

  it("rewrites the steps of an assumed journey where they stand: the prose around them stays, the graph is added, the title follows", () => {
    const c = fresh();
    const file = join(c.dir, "journeys/JRN-1-first.md");
    writeFileSync(file, readFileSync(file, "utf8").replace("# First import\n", "# First import\n\nHow a person gets a first statement in.\n") + "\nMinutes in total: 2.\n");
    const r = applyOp(c.dir, { op: "journey", id: "JRN-1", title: "First import and report", steps, source: "docs/guide.md:3-20" }, opts(c));
    expect(r).toEqual({ ok: true, changes: ["journeys/JRN-1-first.md"], id: "JRN-1" });
    expect(readFileSync(file, "utf8")).toBe([
      "---", "id: JRN-1", 'title: "First import and report"', "state: assumed", 'source: "docs/guide.md:3-20"', "---", "",
      "# First import and report", "", "How a person gets a first statement in.", "",
      "```mermaid", "flowchart TD", '    S1["Import a file"] --> S2["Read the report"]', '    S2 --> S3["Close"]', "```", "",
      "| Step | State | Linked requirements | Given | Does | Sees |",
      "| --- | --- | --- | --- | --- | --- |",
      "| S1 Import a file | assumed | REQ-1.1.1, REQ-1.1.2 | a statement on disk | the person picks the file | one line per transaction |",
      "| S2 Read the report | assumed | REQ-2 |  | the person opens the report | the month's totals |",
      "| S3 Close | assumed | REQ-2 |  |  |  |", "",
      "Minutes in total: 2.", "",
    ].join("\n"));
    // a second rewrite replaces the graph and the table once more, never beside the old ones
    expect(applyOp(c.dir, { op: "journey", id: "JRN-1", title: "First import and report", steps: steps.slice(0, 2) }, opts(c)).ok).toBe(true);
    const text = readFileSync(file, "utf8");
    expect(text.match(/```mermaid/g)).toHaveLength(1);
    expect(text.match(/^\| S\d/gm)).toHaveLength(2);
    expect(text).toContain("How a person gets a first statement in.");
    expect(text).toContain("\nMinutes in total: 2.\n");
    const j = loadCanon(c.dir).journeys[0]!;
    expect(j).toMatchObject({ id: "JRN-1", title: "First import and report", state: "assumed", source: "docs/guide.md:3-20" });
    expect(j.steps.map((s) => s.id)).toEqual(["S1", "S2"]);
    expect(loadCanon(c.dir).journeys).toHaveLength(1);
  });

  it("never rewrites a journey the human approved, nor one that is a draft or contested", () => {
    const c = fresh();
    const file = join(c.dir, "journeys/JRN-1-first.md");
    const original = readFileSync(file, "utf8");
    for (const state of ["stated", "resolved"]) {
      writeFileSync(file, original.replace("state: assumed", `state: ${state}`));
      const before = readFileSync(file, "utf8");
      expect(applyOp(c.dir, { op: "journey", id: "JRN-1", title: "First import", steps }, opts(c))).toEqual({ ok: false, changes: [], error: "JRN-1 is the human's; a change to an approved journey is asked, never applied" });
      expect(readFileSync(file, "utf8")).toBe(before);
    }
    for (const state of ["draft", "contested"]) {
      writeFileSync(file, original.replace("state: assumed", `state: ${state}`));
      expect(applyOp(c.dir, { op: "journey", id: "JRN-1", title: "First import", steps }, opts(c)).error).toBe(`JRN-1 is ${state}; only an assumed journey is rewritten`);
    }
  });

  it("a journey it wrote follows a move and a merge like every other: its cells are renamed, and a box named twice is named once", () => {
    const c = fresh();
    expect(applyOp(c.dir, { op: "journey", title: "Reading a report after an import", steps }, opts(c)).ok).toBe(true);
    expect(applyOp(c.dir, { op: "merge", from: "REQ-1.1.2", to: "REQ-1.1.1" }, opts(c)).ok).toBe(true);
    const file = join(c.dir, "journeys/JRN-2-reading-a-report-after-an-import.md");
    expect(readFileSync(file, "utf8")).toContain("| S1 Import a file | assumed | REQ-1.1.1 | a statement on disk | the person picks the file | one line per transaction |");
    expect(applyOp(c.dir, { op: "move", id: "REQ-1.1", under: "REQ-2" }, opts(c)).ok).toBe(true);
    const canon2 = loadCanon(c.dir);
    expect(canon2.journeys.find((x) => x.id === "JRN-2")?.steps.map((s) => s.requirements)).toEqual([["REQ-2.1.1"], ["REQ-2"], ["REQ-2"]]);
    expect(checkCanon(canon2).some((f) => f.level === "error")).toBe(false);
  });

  it("is journalled and logged in the git directory like every operation, and a revert takes the file away", () => {
    const c = fresh();
    const root = join(c.dir, "..");
    execSync("git init -q", { cwd: root });
    expect(applyOp(c.dir, { op: "journey", title: "Closing", steps: [{ label: "Close", requirements: ["REQ-2"] }], why: "the guide ends here" }, { by: "top" })).toMatchObject({ ok: true, id: "JRN-2" });
    const entry = readJournal(c.dir).at(-1)!;
    expect(entry).toMatchObject({ kind: "op", summary: "journey JRN-2: the guide ends here", id: "JRN-2" });
    expect(entry.files).toHaveLength(1);
    expect(entry.files[0]).toMatchObject({ path: "journeys/JRN-2-closing.md", before: null });
    expect(readOps(join(root, ".git", "headcanon", "ops.jsonl")).at(-1)).toMatchObject({ ok: true, by: "top", id: "JRN-2", changes: ["journeys/JRN-2-closing.md"] });
    expect(applyOp(c.dir, { op: "journey", id: "JRN-2", title: "Closing", steps: [{ label: "Close the month", requirements: ["REQ-2"] }] }, { by: "top" }).ok).toBe(true);
    expect(readJournal(c.dir).at(-1)).toMatchObject({ summary: "journey JRN-2", id: "JRN-2" });
    revertTo(c.dir, entry.seq);
    expect(existsSync(join(c.dir, "journeys/JRN-2-closing.md"))).toBe(false);
    expect(loadCanon(c.dir).journeys.map((x) => x.id)).toEqual(["JRN-1"]);
  });
});

describe("front matter the loader reads back", () => {
  const roots: string[] = [];
  afterAll(() => roots.forEach((d) => rmSync(d, { recursive: true, force: true })));
  const fresh = () => { const c = canon(); roots.push(join(c.dir, "..")); return c; };
  const opts = (c: { log: string; queue: string }) => ({ log: c.log, queue: c.queue, by: "test" });

  it("a backslash in a title, a source or a bound unit is written so that it reads back as itself", () => {
    const c = fresh();
    const r = applyOp(c.dir, { op: "create", under: "REQ-2", title: "Exports go to C:\\data", intent: "A report is written to the export folder.", source: "src\\report.ts:3", binds: ["implements src\\report.ts#write"] }, opts(c));
    expect(r).toMatchObject({ ok: true, id: "REQ-2.1" });
    expect(loadCanon(c.dir).nodes["REQ-2.1"]).toMatchObject({ title: "Exports go to C:\\data", source: "src\\report.ts:3", binds: [{ relation: "implements", unit: "src\\report.ts#write" }] });
    // a merge joins the two sources in the same quoting
    expect(applyOp(c.dir, { op: "create", under: "REQ-2", title: "Exports are dated", intent: "An export carries its date.", source: "docs\\export.md:9" }, opts(c))).toMatchObject({ ok: true, id: "REQ-2.2" });
    expect(applyOp(c.dir, { op: "merge", from: "REQ-2.2", to: "REQ-2.1" }, opts(c)).ok).toBe(true);
    expect(loadCanon(c.dir).nodes["REQ-2.1"]?.source).toBe("src\\report.ts:3; docs\\export.md:9");
  });

  it("a write that leaves a file the loader cannot parse is rolled back and refused, never thrown", () => {
    const c = fresh();
    const file = join(c.dir, "REQ-1-import/REQ-1.1-parsing/REQ-1.1.1-csv.md");
    const before = readFileSync(file, "utf8");
    // the title sits in double quotes in the front matter, where `\d` is no escape YAML knows
    const r = applyOp(c.dir, { op: "reword", id: "REQ-1.1.1", from: "CSV parsing", to: "CSV \\d parsing" }, opts(c));
    expect(r.ok).toBe(false);
    // the loader no longer throws on such a file: it reads it as a file with no usable id, and the check refuses the plan
    expect(r.error).toContain("refused: the operation would");
    expect(readFileSync(file, "utf8")).toBe(before);
    expect(loadCanon(c.dir).nodes["REQ-1.1.1"]?.title).toBe("CSV parsing");
    expect(readOps(c.log).at(-1)).toMatchObject({ ok: false, request: { op: "reword" } });
  });
});
