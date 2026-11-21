import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

// the build branch and the commit check belong to another module and are not part of a brief
vi.mock("../src/approve.js", () => ({ prepareBuild: vi.fn(() => ({ ok: true, branch: "headcanon/build", base: "main" })), sliceCommits: vi.fn(() => []) }));

import { briefCli, briefText, sharedText } from "../src/brief.js";
import { loadCanon } from "../src/load.js";
import { createRun, markerOf, saveRun, updateSlice, type CliCtx, type Run } from "../src/runs.js";
import { treeDigest } from "../src/testing.js";

const roots: string[] = [];
afterAll(() => roots.forEach((d) => rmSync(d, { recursive: true, force: true })));

interface Repo { repo: string; canonDir: string; gitDir: string }

/**
 * Ledgerline, a bookkeeping tool. REQ-1.1.1 is not built, requires REQ-2.1.1, and has a node below it (REQ-1.1.1.1)
 * and a draft below it (REQ-1.1.1.2); REQ-1.1.2 is built; REQ-2.1.2 relates to REQ-1.1.1.
 */
function ledgerline(): Repo {
  const repo = mkdtempSync(join(tmpdir(), "headcanon-brief-"));
  roots.push(repo);
  execFileSync("git", ["init", "-q"], { cwd: repo, stdio: "ignore" });
  const canonDir = join(repo, "canon");
  const file = (rel: string, text: string) => { mkdirSync(dirname(join(canonDir, rel)), { recursive: true }); writeFileSync(join(canonDir, rel), text); };
  const node = (id: string, title: string, front: string, intent: string, body = "") => `---\nid: ${id}\n${id.includes(".") ? `parent: ${id.slice(0, id.lastIndexOf("."))}\n` : ""}title: "${title}"\n${front}---\n\n# ${title}\n\n## Intent\n\n${intent}\n${body}`;
  const leaf = (uid: string, state = "assumed", more = "") => `state: ${state}\nlayer: requirement\nkind: binary\nuid: ${uid}\n${more}`;
  file("README.md", [
    "---", "id: ROOT", 'title: "Ledgerline"', "state: resolved", "format: 4", "---", "",
    "# Ledgerline", "",
    "## Intent", "", "Ledgerline keeps the books of a small business: every entry, month by month.", "",
    "## Not this", "", "- A tool that files taxes.", "- A bank.", "",
    "## Principles", "", "**PRN-1 The books are never rewritten**", "A closed month stays as it was closed. A correction is a new entry.", "",
    "## Glossary [assumed]", "",
    "**entry** (`TERM-entry`) [assumed]: One dated amount recorded in the books.",
    "**closed month** (`TERM-closed-month`) [assumed]: A month whose totals are fixed.",
    "**statement** (`TERM-statement`) [assumed]: The list of a month's entries with its totals.",
    "",
  ].join("\n"));
  file("REQ-1-entries/README.md", node("REQ-1", "Entries", "state: assumed\nlayer: domain\n", "The books hold every entry of the business."));
  file("REQ-1-entries/REQ-1.1-recording/README.md", node("REQ-1.1", "Recording entries", "state: assumed\nlayer: capability\npartition: what an entry must carry\n", "An entry is recorded once, with what makes it whole.", "\n## Deferred\n\n- how an entry is corrected (docs/corrections.md:4)\n"));
  file("REQ-1-entries/REQ-1.1-recording/REQ-1.1.1-date-and-amount/README.md", node("REQ-1.1.1", "An entry carries a date and an amount", leaf("aaaaa2", "assumed", "requires: [REQ-2.1.1]\n"), "An entry carries a date and an amount; one without either is refused, also in a closed month.", "\n## Check\n\nAn entry without a date is refused with the reason shown.\n\n## Implemented by\n\n- not built: entries are typed into a sheet today\n"));
  file("REQ-1-entries/REQ-1.1-recording/REQ-1.1.1-date-and-amount/REQ-1.1.1.1-cents.md", node("REQ-1.1.1.1", "An amount is kept in cents", leaf("fffff2"), "An amount is kept as a whole number of cents.", "\n## Check\n\nAn amount of 10.50 reads back as 1050 cents.\n\n## Implemented by\n\n- not built\n"));
  file("REQ-1-entries/REQ-1.1-recording/REQ-1.1.1-date-and-amount/REQ-1.1.1.2-currency.md", node("REQ-1.1.1.2", "An amount names its currency", leaf("ggggg2", "draft"), "An amount names its currency.", "\n## Check\n\nAn amount shows its currency.\n\n## Implemented by\n\n- not built\n"));
  file("REQ-1-entries/REQ-1.1-recording/REQ-1.1.2-listing.md", node("REQ-1.1.2", "Entries are listed by date", leaf("bbbbb2", "resolved", 'binds: ["implements src/list.ts#listEntries", "contributes src/sort.ts#byDate"]\n'), "Entries are listed by date, the oldest first.", "\n## Check\n\nThe list shows the oldest entry first.\n"));
  file("REQ-2-months/README.md", node("REQ-2", "Months", "state: assumed\nlayer: domain\n", "The books are kept month by month."));
  file("REQ-2-months/REQ-2.1-closing/README.md", node("REQ-2.1", "Closing a month", "state: assumed\nlayer: capability\n", "A month is closed once and its totals stay."));
  file("REQ-2-months/REQ-2.1-closing/REQ-2.1.1-totals.md", node("REQ-2.1.1", "A closed month keeps its totals", leaf("eeeee2"), "A closed month keeps the totals it was closed with.", "\n## Check\n\nThe totals of a closed month read the same a day later.\n\n## Implemented by\n\n- not built\n"));
  file("REQ-2-months/REQ-2.1-closing/REQ-2.1.2-statement.md", node("REQ-2.1.2", "A statement lists a month's entries", leaf("hhhhh2", "assumed", "relates: [REQ-1.1.1]\n"), "A statement lists each entry of its month.", "\n## Check\n\nThe statement of a month lists each of its entries.\n\n## Implemented by\n\n- not built\n"));
  const gitDir = execFileSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: repo, encoding: "utf8" }).trim();
  return { repo, canonDir, gitDir };
}

const DATE = "refuses an entry without a date [hc:aaaaa2]";
/** One accepted test of REQ-1.1.1 that failed in the last run, one rejected test, one accepted test of the node below never run. */
function recordTests(r: Repo): void {
  const base = { id: "", runner: "unit", kind: "unit", pin: "pin", at: "2026-11-18T00:00:00Z" };
  writeFileSync(join(r.canonDir, "tests.json"), JSON.stringify({ runners: {}, tests: [
    { ...base, node: "aaaaa2", file: "tests/entry-date.test.js", title: DATE, description: "Records an entry with no date and checks that it is refused and the reason is shown", status: "accepted" },
    { ...base, node: "aaaaa2", file: "tests/entry-old.test.js", title: "an older try [hc:aaaaa2]", description: "A test the reviewer turned down", status: "rejected" },
    { ...base, kind: "integration", node: "fffff2", file: "tests/cents.test.js", title: "keeps cents [hc:fffff2]", description: "Records 10.50 and reads the stored amount back", status: "accepted" },
  ] }));
  mkdirSync(join(r.gitDir, "headcanon"), { recursive: true });
  writeFileSync(join(r.gitDir, "headcanon", "results.json"), JSON.stringify({ at: "2026-11-18T00:00:00Z", tree: treeDigest(r.repo), runs: [], results: [
    { node: "aaaaa2", title: DATE, file: "tests/entry-date.test.js", runner: "unit", outcome: "failed", message: "the entry was accepted\n  at record (src/entries.js:12)" },
  ] }));
}

function started(r: Repo): Run {
  const run = createRun(r.gitDir, loadCanon(r.canonDir), ["REQ-1.1.1"], true, "headcanon/build", "main");
  expect(run.slices.map((s) => s.node)).toEqual(["REQ-1.1.1.1", "REQ-1.1.1"]);
  return run;
}

function ctxOf(r: Repo, port = 4317): { ctx: CliCtx; out: string[]; err: string[] } {
  const out: string[] = [], err: string[] = [];
  return { ctx: { canonDir: r.canonDir, repo: r.repo, gitDir: r.gitDir, port, by: undefined, json: false, out: (s) => out.push(s), err: (s) => err.push(s), stdin: () => "" }, out, err };
}

const headings = (text: string): string[] => text.split("\n").filter((l) => /^#{1,2} /.test(l));

describe("the shared text", () => {
  it("holds the premise, what the product is not, the principles and the map, in that order", () => {
    const r = ledgerline();
    const shared = sharedText(loadCanon(r.canonDir));
    expect(headings(shared)).toEqual(["# Ledgerline", "## Premise", "## Not this", "## Principles", "## The map"]);
    expect(shared).toContain("Ledgerline keeps the books of a small business: every entry, month by month.");
    expect(shared).toContain("- A tool that files taxes.\n- A bank.");
    expect(shared).toContain("PRN-1 The books are never rewritten: A closed month stays as it was closed. A correction is a new entry.");
    expect(shared).toContain("REQ-1 Entries\n  REQ-1.1 Recording entries\nREQ-2 Months\n  REQ-2.1 Closing a month\n");
    // the map stops at the capabilities
    expect(shared).not.toContain("REQ-1.1.1");
    expect(shared).not.toContain("Glossary");
  });

  it("is the same text, byte for byte, at the start of every brief of the canon, whatever the node or the role", () => {
    const r = ledgerline();
    recordTests(r);
    const run = started(r);
    const shared = sharedText(loadCanon(r.canonDir));
    expect(briefText(r.canonDir, "REQ-1.1", { for: "tester", canonOnly: true }).startsWith(shared)).toBe(true);
    expect(briefText(r.canonDir, "REQ-2.1", { for: "tester" }).startsWith(shared)).toBe(true);
    expect(briefText(r.canonDir, "REQ-1.1", { for: "refiner" }).startsWith(shared)).toBe(true);
    expect(briefText(r.canonDir, "REQ-2.1", { for: "refiner", budget: 50 }).startsWith(shared)).toBe(true);
    for (const node of ["REQ-1.1.1", "REQ-1.1.1.1"]) {
      const brief = briefText(r.canonDir, node, { for: "implementer", runId: run.id });
      // an implementer's brief carries its marker first; the shared text follows it whole
      expect(brief.slice(brief.indexOf("\n\n") + 2).startsWith(shared)).toBe(true);
    }
    expect(sharedText(loadCanon(r.canonDir))).toBe(shared);
  });
});

describe("an implementer's brief", () => {
  it("begins with the run marker, which names the run and the slice", () => {
    const r = ledgerline();
    const run = started(r);
    const brief = briefText(r.canonDir, "REQ-1.1.1", { for: "implementer", runId: run.id });
    expect(brief.split("\n")[0]).toBe(`headcanon-run: ${run.id} slice: REQ-1.1.1`);
    expect(markerOf(brief)).toEqual({ run: run.id, node: "REQ-1.1.1" });
  });

  it("gives the path, its nodes with Intent and Check, their tests in plain words with the last outcome, and where each is built", () => {
    const r = ledgerline();
    recordTests(r);
    const run = started(r);
    const brief = briefText(r.canonDir, "REQ-1.1.1", { for: "implementer", runId: run.id });
    expect(headings(brief).slice(5)).toEqual(["## The path to REQ-1.1.1", "## Your nodes", "## Linked nodes", "## Terms", "## How you work"]);
    expect(brief).toContain("REQ-1 Entries (domain): The books hold every entry of the business.\nREQ-1.1 Recording entries (capability): An entry is recorded once, with what makes it whole.");
    expect(brief).toContain([
      "### REQ-1.1.1 An entry carries a date and an amount [hc:aaaaa2]",
      "Intent: An entry carries a date and an amount; one without either is refused, also in a closed month.",
      "Check (binary): An entry without a date is refused with the reason shown.",
      "Where it is built: not built yet: entries are typed into a sheet today.",
      "Tests:",
      "- Records an entry with no date and checks that it is refused and the reason is shown (unit test, tests/entry-date.test.js). Last run: failed: the entry was accepted at record (src/entries.js:12)",
    ].join("\n"));
    // the node below it that the slice owes, with its test that never ran; the draft below it is not its to build
    expect(brief).toContain([
      "### REQ-1.1.1.1 An amount is kept in cents [hc:fffff2]",
      "Intent: An amount is kept as a whole number of cents.",
      "Check (binary): An amount of 10.50 reads back as 1050 cents.",
      "Where it is built: not built yet.",
      "Tests:",
      "- Records 10.50 and reads the stored amount back (integration test, tests/cents.test.js). Last run: not run yet",
    ].join("\n"));
    expect(brief).not.toContain("REQ-1.1.1.2");
    expect(brief).not.toContain("A test the reviewer turned down");
  });

  it("lists the linked nodes one line each, in both directions, and only the glossary terms its nodes use", () => {
    const r = ledgerline();
    const run = started(r);
    const brief = briefText(r.canonDir, "REQ-1.1.1", { for: "implementer", runId: run.id });
    expect(brief).toContain("## Linked nodes\n\nREQ-2.1.1 A closed month keeps its totals (REQ-1.1.1 requires it): A closed month keeps the totals it was closed with.\nREQ-2.1.2 A statement lists a month's entries (it relates to REQ-1.1.1): A statement lists each entry of its month.\n");
    expect(brief).toContain("## Terms\n\nclosed month: A month whose totals are fixed.\nentry: One dated amount recorded in the books.\n");
    expect(brief).not.toContain("statement: The list");
  });

  it("ends with the rules: its test command, when it may stop, how it commits, assumptions, issues, lookups and the report", () => {
    const r = ledgerline();
    const run = started(r);
    const brief = briefText(r.canonDir, "REQ-1.1.1", { for: "implementer", runId: run.id });
    const rules = brief.slice(brief.indexOf("## How you work"));
    expect(rules).toMatch(/`HC` below stands for: node "[^"\\]+\/bin\/headcanon\.js"\n/);
    expect(rules).toContain("You are free in how you build");
    expect(rules).toContain(`Your test command is \`HC tests run --run ${run.id}\`.`);
    expect(rules).toContain("You may stop when the tests of your nodes pass, or when each node still failing has an issue you filed.");
    expect(rules).toContain("`Intent: <node id>`");
    expect(rules).toContain("One commit per node. Leave the tree clean");
    expect(rules).toContain("| HC op - --by implementer-REQ-1.1.1");
    expect(rules).toContain('"by":"implementer-REQ-1.1.1","blocks":true}\' | HC ask -');
    for (const kind of ["contradiction", "apocrypha", "undefined", "disambiguation", "impossible"]) expect(rules).toContain(`\`${kind}\``);
    expect(rules).toContain("Never change a canon file or a recorded test by hand.");
    for (const lookup of ["`HC context <node id>`", '`HC find "<words>"`', '`HC code find "<words>"`']) expect(rules).toContain(lookup);
    expect(rules).toContain("End with a report in plain words");
    // the commands are examples to fill in, and each parses as JSON once filled
    for (const line of rules.split("\n").filter((l) => l.trimStart().startsWith("echo '"))) expect(() => JSON.parse(line.slice(line.indexOf("'") + 1, line.lastIndexOf("'")))).not.toThrow();
  });

  it("uses the name the slice was started under, and the viewer's port when it is not the usual one", () => {
    const r = ledgerline();
    const run = started(r);
    updateSlice(r.gitDir, run.id, "REQ-1.1.1", { agentName: "implementer-entries" });
    const brief = briefText(r.canonDir, "REQ-1.1.1", { for: "implementer", runId: run.id, port: 4400 });
    expect(brief).toContain("| HC op - --by implementer-entries");
    expect(brief).toMatch(/`HC` below stands for: node "[^"]+" --port 4400\n/);
    expect(briefText(r.canonDir, "REQ-1.1.1", { for: "implementer", runId: run.id, port: 4317 })).not.toContain("--port");
  });

  it("follows what the slice owes by stable id, so a node that moved since is still found and one deleted is not invented", () => {
    const r = ledgerline();
    const run = started(r);
    saveRun(r.gitDir, { ...run, slices: run.slices.map((s) => (s.node === "REQ-1.1.1" ? { ...s, owes: ["aaaaa2", "eeeee2", "gone00"] } : s)) });
    const brief = briefText(r.canonDir, "REQ-1.1.1", { for: "implementer", runId: run.id });
    expect(brief).toContain("### REQ-2.1.1 A closed month keeps its totals [hc:eeeee2]");
    expect(brief).not.toContain("### REQ-1.1.1.1");
    expect(brief).not.toContain("gone00");
  });

  it("finds the active run by itself; with no run it carries no marker and names the node in its test command", () => {
    const r = ledgerline();
    const before = briefText(r.canonDir, "REQ-1.1.1", { for: "implementer" });
    expect(before.startsWith("# Ledgerline")).toBe(true);
    expect(markerOf(before)).toBeUndefined();
    expect(before).toContain("Your test command is `HC tests run REQ-1.1.1`.");
    expect(before).toContain("### REQ-1.1.1.1 An amount is kept in cents [hc:fffff2]");
    const run = started(r);
    expect(markerOf(briefText(r.canonDir, "REQ-1.1.1", { for: "implementer" }))).toEqual({ run: run.id, node: "REQ-1.1.1" });
  });

  it("refuses a node, a run or a slice that does not exist", () => {
    const r = ledgerline();
    const run = started(r);
    expect(() => briefText(r.canonDir, "REQ-9", { for: "implementer" })).toThrow(/no node REQ-9/);
    expect(() => briefText(r.canonDir, "REQ-1.1.1", { for: "implementer", runId: "no-such-run" })).toThrow(/no run no-such-run/);
    expect(() => briefText(r.canonDir, "REQ-2.1.1", { for: "implementer", runId: run.id })).toThrow(/has no slice for REQ-2.1.1/);
  });

  it("keeps its nodes and its rules whole under a small budget, and says how many linked nodes and terms it left out", () => {
    const r = ledgerline();
    const run = started(r);
    const brief = briefText(r.canonDir, "REQ-1.1.1", { for: "implementer", runId: run.id, budget: 100 });
    expect(brief).toContain("Check (binary): An amount of 10.50 reads back as 1050 cents.");
    expect(brief).toContain("End with a report in plain words");
    expect(brief).toContain("## Linked nodes\n\n(2 more left out for length: `HC context REQ-1.1.1` shows them)\n");
    expect(brief).toContain("## Terms\n\n(2 more left out for length: `HC context REQ-1.1.1` shows them)\n");
    expect(brief).not.toContain("REQ-2.1.2 A statement lists a month's entries (it relates");
  });
});

describe("a tester's brief", () => {
  it("with canon only: the capability and every node below with Intent and Check, the linked nodes, the terms, and nothing from the repository", () => {
    const r = ledgerline();
    recordTests(r);
    const brief = briefText(r.canonDir, "REQ-1.1", { for: "tester", canonOnly: true });
    expect(headings(brief).slice(5)).toEqual(["## The path to REQ-1.1", "## The capability", "## The nodes below it", "## Linked nodes", "## Terms"]);
    expect(brief).toContain("### REQ-1.1 Recording entries (a guess)\nIntent: An entry is recorded once, with what makes it whole.");
    expect(brief).toContain("### REQ-1.1.1 An entry carries a date and an amount (a guess)\nIntent: An entry carries a date and an amount; one without either is refused, also in a closed month.\nCheck (binary): An entry without a date is refused with the reason shown.");
    expect(brief).toContain("### REQ-1.1.1.2 An amount names its currency (waits on the user)");
    expect(brief).toContain("### REQ-1.1.2 Entries are listed by date (approved)");
    expect(brief).toContain("REQ-2.1.1 A closed month keeps its totals (REQ-1.1.1 requires it)");
    expect(brief).toContain("closed month: A month whose totals are fixed.");
    for (const fromRepository of ["tests/", "src/", "Where it is built", "Last run", "[hc:", "HC ", "headcanon.js", "docs/corrections.md"]) expect(brief, fromRepository).not.toContain(fromRepository);
  });

  it("without it: the stable ids, where each node is built, the tests already recorded, and the lookups", () => {
    const r = ledgerline();
    recordTests(r);
    const brief = briefText(r.canonDir, "REQ-1.1", { for: "tester" });
    expect(headings(brief).slice(5)).toEqual(["## The path to REQ-1.1", "## The capability", "## The nodes below it", "## Linked nodes", "## Terms", "## Lookups"]);
    expect(brief).toContain("### REQ-1.1.2 Entries are listed by date [hc:bbbbb2] (approved)");
    expect(brief).toContain("Where it is built: built in src/list.ts#listEntries, src/sort.ts#byDate (contributes).");
    expect(brief).toContain("Tests: none recorded.");
    expect(brief).toContain("(unit test, tests/entry-date.test.js). Last run: failed");
    expect(brief).toContain("Your name, for `--by`, is tester-REQ-1.1.");
    expect(brief).toContain("`HC context <node id>`");
    expect(markerOf(brief)).toBeUndefined();
  });
});

describe("a refiner's brief", () => {
  it("gives the capability whole, what is already written below it, and the lookups", () => {
    const r = ledgerline();
    const brief = briefText(r.canonDir, "REQ-1.1", { for: "refiner" });
    expect(headings(brief).slice(5)).toEqual(["## The path to REQ-1.1", "## Your capability", "## Already written below it", "## Lookups"]);
    expect(brief).toContain("### REQ-1.1 Recording entries (capability, a guess; its children answer: what an entry must carry)\nIntent:\n\nAn entry is recorded once, with what makes it whole.\n\nDeferred:\n\n- how an entry is corrected (docs/corrections.md:4)");
    expect(brief).toContain("REQ-1.1.1 An entry carries a date and an amount (requirement, a guess, binary, not built): An entry carries a date and an amount; one without either is refused, also in a closed month. Check: An entry without a date is refused with the reason shown.");
    expect(brief).toContain("REQ-1.1.1.2 An amount names its currency (requirement, waits on the user, binary, not built)");
    expect(brief).toContain("REQ-1.1.2 Entries are listed by date (requirement, approved, binary, built)");
    expect(brief).toContain("Your name, for `--by`, is refiner-REQ-1.1.");
    for (const lookup of ["`HC context <node id>`", '`HC find "<words>"`', '`HC code find "<words>"`']) expect(brief).toContain(lookup);
    expect(brief).not.toContain("How you work");
  });

  it("says so when nothing is written below yet, and cuts a long list to the budget", () => {
    const r = ledgerline();
    expect(briefText(r.canonDir, "REQ-2.1.1", { for: "refiner" })).toContain("## Already written below it\n\nNothing yet.\n");
    const cut = briefText(r.canonDir, "REQ-1.1", { for: "refiner", budget: 900 });
    expect(cut).toMatch(/\(\d more left out for length: `HC context REQ-1\.1` shows them\)/);
    expect(cut).toContain("Your name, for `--by`, is refiner-REQ-1.1.");
  });

  it("says a node directly under the premise has no path above it", () => {
    const r = ledgerline();
    expect(briefText(r.canonDir, "REQ-1", { for: "refiner" })).toContain("## The path to REQ-1\n\nIt sits directly under the premise.\n");
  });
});

describe("headcanon brief", () => {
  it("prints the brief for a role", async () => {
    const r = ledgerline();
    const { ctx, out, err } = ctxOf(r);
    expect(await briefCli(["REQ-1.1", "--for", "tester", "--canon-only"], ctx)).toBe(0);
    expect(err).toEqual([]);
    expect(out.join("")).toBe(briefText(r.canonDir, "REQ-1.1", { for: "tester", canonOnly: true }));
    const b = ctxOf(r);
    expect(await briefCli(["REQ-1.1", "--for=refiner", "--budget", "900", "--json"], b.ctx)).toBe(0);
    expect(JSON.parse(b.out.join(""))).toEqual({ id: "REQ-1.1", for: "refiner", text: briefText(r.canonDir, "REQ-1.1", { for: "refiner", budget: 900 }) });
  });

  it("gives an implementer the brief of its run, with the viewer's port from the command line", async () => {
    const r = ledgerline();
    const noRun = ctxOf(r);
    expect(await briefCli(["REQ-1.1.1", "--for", "implementer"], noRun.ctx)).toBe(1);
    expect(noRun.out).toEqual([]);
    expect(noRun.err.join("")).toContain("no active run holds REQ-1.1.1");
    const run = started(r);
    const { ctx, out } = ctxOf(r, 4400);
    expect(await briefCli(["REQ-1.1.1", "--for", "implementer", "--run", run.id], ctx)).toBe(0);
    expect(out.join("")).toBe(briefText(r.canonDir, "REQ-1.1.1", { for: "implementer", runId: run.id, port: 4400 }));
    const active = ctxOf(r);
    expect(await briefCli(["REQ-1.1.1.1", "--for", "implementer"], active.ctx)).toBe(0);
    expect(markerOf(active.out.join(""))).toEqual({ run: run.id, node: "REQ-1.1.1.1" });
  });

  it("answers a usage line without a node or a role, and an error for what does not exist", async () => {
    const r = ledgerline();
    const { ctx, out, err } = ctxOf(r);
    expect(await briefCli([], ctx)).toBe(2);
    expect(await briefCli(["REQ-1.1"], ctx)).toBe(2);
    expect(await briefCli(["REQ-1.1", "--for", "reviewer"], ctx)).toBe(2);
    expect(err.join("")).toContain("usage: headcanon brief <node id> --for implementer|tester|refiner");
    expect(await briefCli(["REQ-9", "--for", "refiner"], ctx)).toBe(1);
    expect(await briefCli(["REQ-1.1.1", "--for", "implementer", "--run", "no-such-run"], ctx)).toBe(1);
    expect(err.join("")).toContain("brief: no run no-such-run");
    expect(out).toEqual([]);
  });
});
