import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyOp, checkCanon, loadCanon, opStats, readOps, rewriteIds, setListField, type Op } from "../src/index.js";

/** A small canon: a premise, two domains, one with a capability holding two leaves, a decision and a journey naming them. */
function canon(): { dir: string; log: string; queue: string } {
  const root = mkdtempSync(join(tmpdir(), "headcanon-ops-"));
  const dir = join(root, "canon");
  const file = (rel: string, text: string) => { mkdirSync(join(dir, rel, ".."), { recursive: true }); writeFileSync(join(dir, rel), text); };
  const node = (id: string, title: string, extra = "", body = "") => `---\nid: ${id}\n${id.includes(".") ? `parent: ${id.slice(0, id.lastIndexOf("."))}\n` : ""}title: "${title}"\nstate: assumed\n${extra}---\n\n# ${title}\n\n## Intent\n\n${title} holds.\n${body}`;
  file("README.md", `---\nid: ROOT\ntitle: "Ledger canon"\nstate: resolved\nformat: 3\n---\n\n# Ledger canon\n\n## Intent\n\nA ledger.\n\n## Glossary [assumed]\n\n**statement** (\`TERM-statement\`) [assumed]: a bank's list of transactions.\n**ledger** (\`TERM-ledger\`) [stated]: the book of record.\n`);
  file("REQ-1-import/README.md", node("REQ-1", "Import", "layer: domain\npartition: stage\n"));
  file("REQ-1-import/REQ-1.1-parsing/README.md", node("REQ-1.1", "Parsing", "layer: capability\npartition: format\n", "\n## As built\n\n- CSV is read line by line (src/parse.ts:10-40)\n"));
  file("REQ-1-import/REQ-1.1-parsing/REQ-1.1.1-csv.md", node("REQ-1.1.1", "CSV parsing", "layer: requirement\nkind: binary\n", "\n## Check\n\nA CSV statement yields one transaction per line.\n"));
  file("REQ-1-import/REQ-1.1-parsing/REQ-1.1.2-ofx.md", node("REQ-1.1.2", "OFX parsing", "layer: requirement\nkind: binary\nrequires: [REQ-1.1.1]\n", "\n## Check\n\nAn OFX statement yields its transactions.\n\n## As built\n\n- OFX amounts are read in cents (src/ofx.ts:8)\n"));
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
    const r = applyOp(c.dir, { op: "create", under: "REQ-2", title: "Yearly report", intent: "A year of transactions becomes one report.", layer: "requirement", source: "docs/report.md:3", kind: "binary", check: "The report lists every category's total.", asBuilt: ["The report renders from a template (src/report.ts:1-30)"], deferred: ["the PDF export (docs/report.md:9)"] }, opts(c));
    expect(r).toMatchObject({ ok: true, id: "REQ-2.1" });
    const canon2 = loadCanon(c.dir);
    expect(canon2.nodes["REQ-2"]?.file).toBe("REQ-2-reporting/README.md");
    expect(canon2.nodes["REQ-2.1"]).toMatchObject({ parent: "REQ-2", layer: "requirement", kind: "binary", state: "assumed" });
    // without a layer the child takes the one its depth implies, here a capability under a domain
    expect(applyOp(c.dir, { op: "create", under: "REQ-1", title: "Matching", intent: "Transactions are matched across statements." }, opts(c))).toMatchObject({ ok: true, id: "REQ-1.2" });
    expect(loadCanon(c.dir).nodes["REQ-1.2"]?.layer).toBe("capability");
    const text = readFileSync(join(c.dir, canon2.nodes["REQ-2.1"]!.file), "utf8");
    expect(text).toContain("## Check\n\nThe report lists every category's total.");
    expect(text).toContain("## As built\n\n- The report renders from a template (src/report.ts:1-30)");
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
    expect(n.state).toBe("open");
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
    expect(text).toContain("## As built\n\n- OFX amounts are read in cents (src/ofx.ts:8)");
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
