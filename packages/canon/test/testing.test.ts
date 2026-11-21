import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { loadCanon } from "../src/load.js";
import { gitDirOf } from "../src/ops.js";
import { addTests, describeResults, fingerprintOf, isFailing, loadManifest, loadResults, manifestPath, parseResults, pinOf, resultsPath, reviewTests, runTests, saveManifest, setRunner, tagOf, testsCli, testsOf, treeDigest, uidsIn, type CliCtx, type Outcome, type TestResults } from "../src/testing.js";

const fixture = (name: string) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", "results", name), "utf8");
const byTag = <T extends { title: string }>(rows: T[], uid: string) => rows.filter((r) => r.title.includes(tagOf(uid)));

const NODES: Array<[id: string, uid: string, title: string, check: string]> = [
  ["REQ-1.1.1", "k3m9pq", "A closed month refuses entries", "An entry dated inside a closed month is refused."],
  ["REQ-1.1.2", "w7x2ab", "A statement totals its entries", "The total of a statement equals the sum of its entries, in cents."],
  ["REQ-1.1.3", "r5t8yz", "Only the owner reopens a month", "A user who is not the owner cannot reopen a closed month."],
  ["REQ-1.1.4", "n4h6cd", "An entry has a numeric amount", "An entry whose amount is text is refused."],
  ["REQ-1.1.5", "j8v3ef", "A statement lists the month's entries", "Every entry of the month is on its statement."],
  ["REQ-1.1.6", "q2q2q2", "A month closes once", "Closing a month that is closed changes nothing."],
];

/** One case file per node: what the product must answer and what it answered. The last is one the runner never reports. */
const CASES: Record<string, { title: string; expect: unknown; got: unknown; silent?: boolean }> = {
  k3m9pq: { title: "an entry dated inside a closed month is refused [hc:k3m9pq]", expect: "refused", got: "refused" },
  w7x2ab: { title: 'the statement\'s "total" is the sum of its entries [hc:w7x2ab]', expect: 1400, got: 1300 },
  r5t8yz: { title: "only the owner reopens a month [hc:r5t8yz]", expect: 1, got: 1 },
  n4h6cd: { title: "an entry whose amount is text is refused [hc:n4h6cd]", expect: 1, got: 1 },
  j8v3ef: { title: "every entry of the month is on its statement [hc:j8v3ef]", expect: 1, got: 1 },
  q2q2q2: { title: "closing a closed month changes nothing [hc:q2q2q2]", expect: 1, got: 1, silent: true },
};

/** The runner of the end-to-end tests: a script any project could write. It reads case files and reports in headcanon-json, last case first. */
const RUN_CASES = `import { readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const out = args[args.indexOf("--out") + 1];
const titles = args[args.indexOf("--titles") + 1];
const tests = [];
for (const file of args.slice(args.indexOf("--out") + 2)) {
  const c = JSON.parse(readFileSync(file, "utf8"));
  if (c.silent) continue;
  const ok = c.got === c.expect;
  tests.push({ title: c.title, file, outcome: ok ? "passed" : "failed", message: ok ? "asked for " + titles : "expected " + c.expect + ", got " + c.got, ms: 3 });
}
writeFileSync(out, JSON.stringify({ tests: tests.reverse() }));
process.exit(tests.some((t) => t.outcome === "failed") ? 1 : 0);
`;
const PRINT_CASES = `import { readFileSync } from "node:fs";
console.log("reading " + (process.argv.length - 2) + " case files");
const tests = process.argv.slice(2).map((file) => { const c = JSON.parse(readFileSync(file, "utf8")); return { title: c.title, outcome: c.got === c.expect ? "pass" : "fail" }; });
console.log(JSON.stringify({ tests }));
console.log("done");
`;
const MESSY = `import { writeFileSync } from "node:fs";
const args = process.argv.slice(2);
writeFileSync("left behind.txt", "a runner forgot this");
writeFileSync(args[args.indexOf("--out") + 1], JSON.stringify({ tests: [] }));
`;
const STUCK = `import { writeFileSync } from "node:fs";
writeFileSync(process.argv[2], String(process.pid));
setInterval(() => {}, 1000);
`;

interface Project { repo: string; canon: string; git: (...args: string[]) => string; write: (rel: string, text: string) => void; commit: (message: string) => void }

const made: string[] = [];
afterAll(() => made.forEach((d) => rmSync(d, { recursive: true, force: true, maxRetries: 3 })));

/** A git repository of the invented product Ledgerline, in a folder whose name has a space, with a canon of six requirements and one journey. */
function project(): Project {
  const repo = mkdtempSync(join(tmpdir(), "headcanon tests "));
  made.push(repo);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const write = (rel: string, text: string) => { mkdirSync(dirname(join(repo, rel)), { recursive: true }); writeFileSync(join(repo, rel), text); };
  const commit = (message: string) => { git("add", "-A"); git("commit", "-q", "-m", message); };
  git("init", "-q");
  for (const [k, v] of [["user.email", "tester@example.test"], ["user.name", "Tester"], ["core.autocrlf", "false"], ["commit.gpgsign", "false"], ["core.hooksPath", ".git/no-hooks"]]) git("config", k!, v!);
  const node = (id: string, title: string, extra: string, body = "") => `---\nid: ${id}\n${id.includes(".") ? `parent: ${id.slice(0, id.lastIndexOf("."))}\n` : ""}title: "${title}"\nstate: assumed\n${extra}---\n\n# ${title}\n\n## Intent\n\n${title}.\n${body}`;
  write("canon/README.md", `---\nid: ROOT\ntitle: "Ledgerline"\nstate: resolved\nformat: 4\n---\n\n# Ledgerline\n\n## Intent\n\nA bookkeeping tool: entries, months, statements.\n`);
  write("canon/REQ-1-months/README.md", node("REQ-1", "Months", "layer: domain\n"));
  write("canon/REQ-1-months/REQ-1.1-closing/README.md", node("REQ-1.1", "Closing a month", "layer: capability\n"));
  for (const [id, uid, title, check] of NODES) write(`canon/REQ-1-months/REQ-1.1-closing/${id}-node.md`, node(id, title, `layer: requirement\nkind: binary\nuid: ${uid}\n`, `\n## Check\n\n${check}\n`));
  write("canon/journeys/JRN-1-close.md", `---\nid: JRN-1\ntitle: "Closing a month"\nstate: assumed\n---\n\n# Closing a month\n\n| Step | Requirements |\n|---|---|\n| S1 Close the month | REQ-1.1.1 |\n| S2 Read the statement | REQ-1.1.5 |\n`);
  write(".gitignore", "ignored/\n");
  write("tools/run-cases.mjs", RUN_CASES);
  write("tools/print-cases.mjs", PRINT_CASES);
  write("tools/messy.mjs", MESSY);
  write("tools/stuck.mjs", STUCK);
  for (const [uid, c] of Object.entries(CASES)) write(`cases/${uid}.case.json`, JSON.stringify(c));
  commit("start");
  return { repo, canon: join(repo, "canon"), git, write, commit };
}

const caseEntry = (uid: string, runner = "cases") => ({ node: uid, runner, kind: "eval" as const, file: `cases/${uid}.case.json`, title: CASES[uid]!.title, description: "Runs the sample case and compares what the product answered with what the node says it must answer." });

/** Six accepted tests, one per node, run by the case runner; everything committed. */
function accepted(): Project {
  const p = project();
  setRunner(p.canon, "cases", { kind: "eval", command: "node tools/run-cases.mjs --titles {titles} --out {out} {files}", format: "headcanon-json" });
  expect(addTests(p.canon, NODES.map(([, uid]) => caseEntry(uid)), "tester-REQ-1.1")).toEqual({ added: 6, errors: [] });
  for (const [, uid] of NODES) expect(reviewTests(p.canon, uid, "pass")).toBe(1);
  p.commit("tests");
  return p;
}

const outcomes = (r: TestResults): Record<string, Outcome> => Object.fromEntries(r.results.map((x) => [x.node, x.outcome]));
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.name === ".git" ? [] : e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const runFolders = () => readdirSync(tmpdir()).filter((n) => n.startsWith("headcanon-run-")).sort();

describe("reading what a runner wrote [DEC-026]", () => {
  it("reads JUnit XML as Vitest writes it: outcomes, names with brackets and quotes, a file that did not load", () => {
    const rows = parseResults("junit", fixture("vitest-junit.xml"));
    expect(rows.map((r) => r.outcome)).toEqual(["passed", "failed", "skipped", "failed", "passed", "failed"]);
    expect(byTag(rows, "k3m9pq")[0]).toMatchObject({ title: "closing a month > refuses an entry dated inside a closed month [hc:k3m9pq]", outcome: "passed", file: "test/closing.test.js", ms: 1 });
    expect(byTag(rows, "w7x2ab")[0]?.title).toBe('closing a month > keeps the statement\'s "total" equal to the sum of its entries <in cents & whole> [hc:w7x2ab]');
    expect(byTag(rows, "w7x2ab")[0]?.message).toContain("expected 1300 to be 1400");
    expect(byTag(rows, "w7x2ab")[0]?.message).toContain("- 1400");
    expect(byTag(rows, "r5t8yz")[0]).toMatchObject({ outcome: "skipped" });
    expect(byTag(rows, "n4h6cd")[0]).toMatchObject({ title: "closing a month > reads an entry [with brackets] before the tag [hc:n4h6cd]", outcome: "failed" });
    expect(byTag(rows, "n4h6cd")[0]?.message).toContain("TypeError: entry.amount is not a number");
    // the file that imports what does not exist is reported under its own name, with no tag
    expect(rows[5]).toMatchObject({ title: "test/statement.test.js", outcome: "failed", file: "test/statement.test.js" });
    expect(rows[5]?.message).toContain("Cannot find module '../src/statement.js'");
  });

  it("reads JUnit XML in the shapes other runners use: a root testsuite, nested suites, error, CDATA, entities, a tag on the suite", () => {
    const rows = parseResults("junit", fixture("junit-mixed.xml"));
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.outcome)).toEqual(["passed", "failed", "skipped", "errored", "passed", "failed", "passed"]);
    expect(rows[0]).toMatchObject({ title: "test_close[[hc:k3m9pq] an entry dated inside a closed month is refused]", file: "tests/test_months.py", ms: 12 });
    expect(rows[1]?.title).toBe('test_total[[hc:w7x2ab] the statement\'s "total" is the sum <in cents>]');
    // CDATA is taken as written, and what a test printed is never read as a result
    expect(rows[1]?.message).toContain("E        +  where 1300 = total([<Entry 1050>, <Entry 250>])");
    expect(rows[1]?.message?.startsWith("def test_total(case):\n>       assert total(entries) == 1400")).toBe(true);
    expect(rows[1]?.message?.endsWith("tests/test_months.py:41: AssertionError")).toBe(true);
    expect(rows[2]).toMatchObject({ outcome: "skipped", message: "tests/test_months.py:55: needs the owner fixture" });
    expect(rows[3]?.message).toContain('File "tests/test_months.py", line 63');
    expect(rows[3]?.message).toContain("read(entry) > 0 && done");
    // a case under a suite that carries the tag belongs to that node
    expect(rows[4]?.title).toBe("closing a month [hc:j8v3ef] > lists every entry of the month");
    expect(rows[5]).toMatchObject({ title: "closing a month [hc:j8v3ef] > shows the closing balance > 0", outcome: "failed", message: "balance was -4", ms: 300 });
    expect(rows[6]).toEqual({ title: "a case that names no node", outcome: "passed" });
    expect(rows.some((r) => r.title.includes("zz9zz9") || r.title.includes("not a case"))).toBe(false);
  });

  it("reads Vitest's JSON reporter, and tells a file that did not load as the file itself", () => {
    const rows = parseResults("vitest-json", fixture("vitest.json"));
    expect(rows.map((r) => r.outcome)).toEqual(["passed", "failed", "skipped", "failed", "passed", "errored"]);
    expect(byTag(rows, "k3m9pq")[0]).toMatchObject({ title: "closing a month refuses an entry dated inside a closed month [hc:k3m9pq]", file: "C:/work/ledgerline/test/closing.test.js", ms: 1 });
    expect(byTag(rows, "w7x2ab")[0]?.title).toContain('the statement\'s "total" equal');
    expect(byTag(rows, "w7x2ab")[0]?.message).toContain("AssertionError: expected 1300 to be 1400");
    expect(byTag(rows, "r5t8yz")[0]).toEqual({ title: "closing a month reopens a month only for its owner [hc:r5t8yz]", outcome: "skipped", file: "C:/work/ledgerline/test/closing.test.js" });
    expect(rows[5]).toMatchObject({ title: "C:/work/ledgerline/test/statement.test.js", outcome: "errored" });
    expect(rows[5]?.message).toContain("Cannot find module '../src/statement.js'");
  });

  it("reads Playwright's JSON reporter: nested suites, one test per project, the last attempt decides", () => {
    const rows = parseResults("playwright-json", fixture("playwright.json"));
    expect(rows.map((r) => [uidsIn(r.title)[0], r.outcome])).toEqual([["j8v3ef", "passed"], ["j8v3ef", "passed"], ["k3m9pq", "passed"], ["k3m9pq", "failed"], ["r5t8yz", "skipped"], ["w7x2ab", "failed"], ["n4h6cd", "passed"]]);
    expect(rows[0]).toEqual({ title: "a user adds an entry and sees it on the month's statement [hc:j8v3ef]", outcome: "passed", file: "closing.spec.ts", ms: 812 });
    // the titles of the groups a test sits in come before its own, and the terminal's colour codes are gone
    expect(rows[3]?.title).toBe("closing a month > a closed month refuses a new entry and says why [hc:k3m9pq]");
    expect(rows[3]?.message?.startsWith("firefox: Error: expect(locator).toBeVisible()\n\nLocator: getByText('This month is closed')")).toBe(true);
    expect(rows[3]?.ms).toBe(5187);
    expect(rows[5]).toMatchObject({ title: "closing a month > with a slow bank > the statement still totals its entries [hc:w7x2ab]", message: "chromium: the test timed out" });
    expect(rows[6]).toMatchObject({ outcome: "passed", message: "passed on a retry", ms: 1930 });
  });

  it("reads the plain shape any script can write, which is how an eval reports", () => {
    const rows = parseResults("headcanon-json", fixture("headcanon.json"));
    expect(rows.map((r) => r.outcome)).toEqual(["passed", "failed", "skipped", "errored", "errored"]);
    expect(rows[0]).toEqual({ title: "the suggested category matches the bookkeeper's on at least 9 of 10 sample entries [hc:k3m9pq]", outcome: "passed", file: "evals/categories.eval.json", message: "19 of 20 matched; the threshold is 18", ms: 8421 });
    expect(rows[1]?.ms).toBe(15231);
    expect(rows[4]?.message).toBe('unknown outcome "maybe"');
    // a bare list, lines printed around the JSON and a byte order mark are all read
    expect(parseResults("headcanon-json", '\uFEFFstarting\n[{"title":"x [hc:aaa]","outcome":"ok"}]\nbye')).toEqual([{ title: "x [hc:aaa]", outcome: "passed" }]);
  });

  it("refuses text that is not a result of the format, and reads a result with no test as empty", () => {
    expect(() => parseResults("vitest-json", "Error: cannot start")).toThrow(/not JSON/);
    expect(() => parseResults("vitest-json", "{}")).toThrow(/no testResults/);
    expect(() => parseResults("playwright-json", '{"tests":[]}')).toThrow(/no suites/);
    expect(() => parseResults("headcanon-json", '{"suites":[]}')).toThrow(/no "tests" list/);
    expect(() => parseResults("junit", "command not found")).toThrow(/no testsuite/);
    expect(parseResults("junit", '<testsuites><testsuite name="empty" tests="0"/></testsuites>')).toEqual([]);
    expect(parseResults("headcanon-json", '{"tests":[]}')).toEqual([]);
  });
});

describe("the record of tests [DEC-026]", () => {
  it("is empty when the file is absent, and is written inside the canon folder", () => {
    const p = project();
    expect(loadManifest(p.canon)).toEqual({ runners: {}, tests: [] });
    expect(manifestPath(p.canon)).toBe(join(p.canon, "tests.json"));
    saveManifest(p.canon, { runners: { unit: { kind: "unit", command: "run {files}", format: "junit" } }, tests: [] });
    expect(loadManifest(p.canon).runners["unit"]?.format).toBe("junit");
    // the canon still loads with the record beside its files
    expect(Object.keys(loadCanon(p.canon).nodes)).toHaveLength(8);
  });

  it("records a runner, and refuses one that could not run", () => {
    const p = project();
    setRunner(p.canon, "unit", { kind: "unit", command: " run-tests --report {out} {files} ", format: "junit", cwd: "packages\\ledger", timeoutSec: 120 });
    expect(loadManifest(p.canon).runners).toEqual({ unit: { kind: "unit", command: "run-tests --report {out} {files}", format: "junit", cwd: "packages/ledger", timeoutSec: 120 } });
    expect(() => setRunner(p.canon, "unit", { kind: "unit", command: "", format: "junit" })).toThrow(/command/);
    expect(() => setRunner(p.canon, "unit", { kind: "unit", command: "x", format: "tap" as "junit" })).toThrow(/format/);
    expect(() => setRunner(p.canon, "unit", { kind: "fast" as "unit", command: "x", format: "junit" })).toThrow(/kind/);
    expect(() => setRunner(p.canon, "unit", { kind: "unit", command: "x", format: "junit", cwd: "../elsewhere" })).toThrow(/inside the repository/);
    expect(() => setRunner(p.canon, "my runner", { kind: "unit", command: "x", format: "junit" })).toThrow(/name/);
  });

  it("records a test only when it names a node, carries the tag, points at a file and says in plain words what it checks", () => {
    const p = project();
    const good = caseEntry("k3m9pq");
    const r = addTests(p.canon, [
      good,
      { ...good, node: "nobody" },
      { ...good, title: "an entry dated inside a closed month is refused" },
      { ...good, title: "tagged for another node [hc:w7x2ab]" },
      { ...good, file: "cases/absent.case.json" },
      { ...good, file: "../outside.json" },
      { ...good, description: "closes it" },
      { ...good, description: "Calls closeMonth(entry) and expects the result to be refused." },
      { ...good, description: "Checks that `refused` comes back for an entry in a closed month." },
      { ...good, kind: "e2e" },
      { ...good, kind: "e2e", journey: "JRN-9" },
      { ...good, kind: "smoke" as "unit" },
    ], "tester-REQ-1.1");
    expect(r.added).toBe(1);
    expect(r.errors.map((e) => e.replace(/^test \d+ "[^\n]*?": /, ""))).toEqual([
      'node "nobody" is not the uid of a node in the canon',
      "the title must carry [hc:k3m9pq]",
      "the title must carry [hc:k3m9pq]",
      "the file cases/absent.case.json does not exist",
      "the file ../outside.json is outside the repository",
      "the description must say in plain words what is checked and how",
      'the description must be plain words a user who cannot read code understands; it holds code ("closeMonth(")',
      'the description must be plain words a user who cannot read code understands; it holds code ("`")',
      "an e2e test names the journey it plays; record the journey first",
      'journey "JRN-9" is not in the canon',
      "kind must be one of unit, integration, e2e, eval, other",
    ]);
    expect(r.errors[1]?.startsWith('test 3 "an entry dated inside a closed month is refused": ')).toBe(true);
    const [t] = loadManifest(p.canon).tests;
    expect(t).toMatchObject({ node: "k3m9pq", id: "REQ-1.1.1", runner: "cases", kind: "eval", file: "cases/k3m9pq.case.json", status: "proposed", by: "tester-REQ-1.1", pin: pinOf(loadCanon(p.canon).nodes["REQ-1.1.1"]!) });
    expect(t?.fingerprint).toBeUndefined();
    expect(Number.isNaN(Date.parse(t!.at))).toBe(false);
    // an e2e test with its journey is recorded, a file given whole is kept from the repository's root, and a description may use a plural in brackets
    expect(addTests(p.canon, [{ ...good, node: "j8v3ef", title: "a user closes the month and reads the statement [hc:j8v3ef]", kind: "e2e", journey: "JRN-1", file: join(p.repo, "cases", "j8v3ef.case.json"), description: "Plays the journey step by step: closes the month, opens the statement and looks for the entry(s) of that month; a second line follows." }])).toEqual({ added: 1, errors: [] });
    expect(testsOf(loadManifest(p.canon), "j8v3ef")[0]).toMatchObject({ id: "REQ-1.1.5", journey: "JRN-1", file: "cases/j8v3ef.case.json" });
    expect(testsOf(loadManifest(p.canon), "j8v3ef")[0]?.by).toBeUndefined();
  });

  it("accepts with the file's fingerprint on a pass, rejects with the note on a fail, and a test recorded again waits for review again", () => {
    const p = project();
    addTests(p.canon, [caseEntry("k3m9pq"), caseEntry("w7x2ab")]);
    expect(reviewTests(p.canon, "w7x2ab", "fail", "The expected total is taken from the code. Take it from the node.")).toBe(1);
    expect(reviewTests(p.canon, "k3m9pq", "pass")).toBe(1);
    expect(reviewTests(p.canon, "k3m9pq", "pass")).toBe(0);
    expect(reviewTests(p.canon, "nobody", "pass")).toBe(0);
    let m = loadManifest(p.canon);
    expect(testsOf(m, "k3m9pq")[0]).toMatchObject({ status: "accepted", fingerprint: fingerprintOf(p.repo, "cases/k3m9pq.case.json") });
    expect(testsOf(m, "w7x2ab")[0]).toMatchObject({ status: "rejected", review: "The expected total is taken from the code. Take it from the node." });
    expect(testsOf(m, "w7x2ab")[0]?.fingerprint).toBeUndefined();
    // the corrected test replaces the rejected entry instead of standing beside it
    expect(addTests(p.canon, [caseEntry("w7x2ab")]).added).toBe(1);
    m = loadManifest(p.canon);
    expect(m.tests).toHaveLength(2);
    expect(testsOf(m, "w7x2ab")[0]?.status).toBe("proposed");
    expect(testsOf(m, "w7x2ab")[0]?.review).toBeUndefined();
    // a proposed test whose file is gone cannot be accepted
    rmSync(join(p.repo, "cases", "w7x2ab.case.json"));
    expect(reviewTests(p.canon, "w7x2ab", "pass")).toBe(0);
  });

  it("never replaces a record it could not read", () => {
    const p = project();
    writeFileSync(manifestPath(p.canon), "<<<<<<< HEAD\n{}");
    expect(loadManifest(p.canon)).toEqual({ runners: {}, tests: [] });
    expect(addTests(p.canon, [caseEntry("k3m9pq")])).toMatchObject({ added: 0 });
    expect(addTests(p.canon, [caseEntry("k3m9pq")]).errors[0]).toContain("cannot be read");
    expect(() => setRunner(p.canon, "unit", { kind: "unit", command: "x", format: "junit" })).toThrow(/cannot be read/);
    expect(readFileSync(manifestPath(p.canon), "utf8")).toBe("<<<<<<< HEAD\n{}");
  });

  it("takes over a lock a dead process left, and leaves none behind", () => {
    const p = project();
    const lock = join(gitDirOf(p.canon)!, "headcanon", `tests-${createHash("sha256").update(p.canon).digest("hex").slice(0, 12)}.lock`);
    mkdirSync(lock, { recursive: true });
    utimesSync(lock, new Date(Date.now() - 120_000), new Date(Date.now() - 120_000));
    const t0 = Date.now();
    setRunner(p.canon, "unit", { kind: "unit", command: "run {files}", format: "junit" });
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(existsSync(lock)).toBe(false);
    expect(addTests(p.canon, [caseEntry("k3m9pq")]).added).toBe(1);
    expect(reviewTests(p.canon, "k3m9pq", "pass")).toBe(1);
    expect(existsSync(lock)).toBe(false);
    expect(readdirSync(p.canon).filter((n) => n.startsWith("tests.json"))).toEqual(["tests.json"]);
  });

  it("pins a test to the node's Intent and Check, and fingerprints a file the same under either line ending", () => {
    const p = project();
    const file = join(p.canon, "REQ-1-months", "REQ-1.1-closing", "REQ-1.1.1-node.md");
    const before = pinOf(loadCanon(p.canon).nodes["REQ-1.1.1"]!);
    const text = readFileSync(file, "utf8");
    // a reflow, a new title and a new section change nothing a test depends on
    writeFileSync(file, text.replace("An entry dated inside a closed month is refused.", "An entry dated inside\na closed   month is refused.").replace('title: "A closed month refuses entries"', 'title: "Closed months"') + "\n## Implemented by\n\n- not built\n");
    expect(pinOf(loadCanon(p.canon).nodes["REQ-1.1.1"]!)).toBe(before);
    writeFileSync(file, text.replace("is refused.", "is refused with the reason shown."));
    expect(pinOf(loadCanon(p.canon).nodes["REQ-1.1.1"]!)).not.toBe(before);
    p.write("a.txt", "one\ntwo\n");
    p.write("b.txt", "one\r\ntwo\r\n");
    expect(fingerprintOf(p.repo, "a.txt")).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprintOf(p.repo, "b.txt")).toBe(fingerprintOf(p.repo, "a.txt"));
    expect(fingerprintOf(p.repo, join(p.repo, "a.txt"))).toBe(fingerprintOf(p.repo, "a.txt"));
    expect(fingerprintOf(p.repo, "absent.txt")).toBeUndefined();
    expect(fingerprintOf(p.repo, "canon")).toBeUndefined();
  });
});

describe("the state of the tree [DEC-026]", () => {
  it("is the same after a commit of the files as they are, under either line-ending setting", () => {
    for (const autocrlf of ["false", "true"]) {
      const p = project();
      p.git("config", "core.autocrlf", autocrlf);
      const clean = treeDigest(p.repo);
      p.write("tools/messy.mjs", "// rewritten\nexport {};\n");
      p.write("src/total.mjs", "export const total = 1400;\n");
      p.write("src/windows.txt", "one\r\ntwo\r\n");
      rmSync(join(p.repo, "cases", "q2q2q2.case.json"));
      const measured = treeDigest(p.repo);
      expect(measured).not.toBe(clean);
      p.git("add", "src/total.mjs");
      expect(treeDigest(p.repo)).toBe(measured);
      p.commit("the work");
      expect(p.git("status", "--porcelain")).toBe("");
      expect(treeDigest(p.repo)).toBe(measured);
      // and it follows the files back when the commit is left
      p.git("checkout", "-q", "HEAD~1");
      expect(treeDigest(p.repo)).toBe(clean);
    }
  });

  it("changes with a tracked file, an untracked file and a commit, and with nothing else", () => {
    const p = project();
    const clean = treeDigest(p.repo);
    expect(clean).toMatch(/^[0-9a-f]{64}$/);
    expect(treeDigest(p.repo)).toBe(clean);
    const original = readFileSync(join(p.repo, "tools", "messy.mjs"), "utf8");
    p.write("tools/messy.mjs", original + "// changed\n");
    const edited = treeDigest(p.repo);
    expect(edited).not.toBe(clean);
    p.write("tools/messy.mjs", original + "// changed again\n");
    expect(treeDigest(p.repo)).not.toBe(edited);
    p.write("tools/messy.mjs", original);
    expect(treeDigest(p.repo)).toBe(clean);
    // an ignored file is no change; an untracked one is, by what it holds and not by when it was written
    p.write("ignored/cache.bin", "x");
    expect(treeDigest(p.repo)).toBe(clean);
    p.write("notes.txt", "a");
    const untracked = treeDigest(p.repo);
    expect(untracked).not.toBe(clean);
    utimesSync(join(p.repo, "notes.txt"), new Date(), new Date(Date.now() + 5000));
    utimesSync(join(p.repo, "tools", "messy.mjs"), new Date(), new Date(Date.now() + 5000));
    expect(treeDigest(p.repo)).toBe(untracked);
    p.write("notes.txt", "b");
    expect(treeDigest(p.repo)).not.toBe(untracked);
    rmSync(join(p.repo, "notes.txt"));
    expect(treeDigest(p.repo)).toBe(clean);
    // a tracked file that goes is a change, and so is the commit of a new one
    rmSync(join(p.repo, "tools", "stuck.mjs"));
    expect(treeDigest(p.repo)).not.toBe(clean);
    p.write("tools/stuck.mjs", STUCK);
    expect(treeDigest(p.repo)).toBe(clean);
    p.write("notes.txt", "a");
    p.commit("notes");
    expect(treeDigest(p.repo)).toBe(untracked);
  });

  it("is empty outside a git repository and works before the first commit", () => {
    const bare = mkdtempSync(join(tmpdir(), "headcanon-nogit-"));
    made.push(bare);
    // the temporary folder may itself sit in no repository; only then is the digest empty
    const inRepo = (() => { try { execFileSync("git", ["rev-parse", "--git-dir"], { cwd: bare, stdio: "ignore" }); return true; } catch { return false; } })();
    if (!inRepo) expect(treeDigest(bare)).toBe("");
    execFileSync("git", ["init", "-q"], { cwd: bare });
    writeFileSync(join(bare, "a.txt"), "a");
    const first = treeDigest(bare);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    execFileSync("git", ["add", "a.txt"], { cwd: bare });
    writeFileSync(join(bare, "a.txt"), "b");
    expect(treeDigest(bare)).not.toBe(first);
  });

  it("stays fast on a repository of thousands of files", () => {
    const p = project();
    for (let d = 0; d < 25; d++) { mkdirSync(join(p.repo, "src", `part-${d}`), { recursive: true }); for (let f = 0; f < 100; f++) writeFileSync(join(p.repo, "src", `part-${d}`, `file-${f}.txt`), `entry ${d} ${f}\n`); }
    p.commit("thousands of files");
    for (let f = 0; f < 200; f++) p.write(`scratch/new-${f}.txt`, "x");
    p.write("src/part-7/file-7.txt", "changed\n");
    treeDigest(p.repo);
    const t0 = Date.now();
    const a = treeDigest(p.repo);
    const ms = Date.now() - t0;
    expect(treeDigest(p.repo)).toBe(a);
    console.log(`treeDigest: ${ms} ms on 2,500 tracked files, 200 untracked, 1 changed`);
    expect(ms).toBeLessThan(3000);
  }, 120_000);
});

describe("running the tests [DEC-026]", () => {
  it("runs accepted tests through their runner in a real repository and stores each outcome beside the canon", () => {
    const p = accepted();
    const gitDir = gitDirOf(p.canon)!;
    // after acceptance: one test file is deleted, one is edited, one node is reworded, and one case the runner never reports
    rmSync(join(p.repo, "cases", "r5t8yz.case.json"));
    p.write("cases/n4h6cd.case.json", JSON.stringify({ title: "an entry whose amount is text is refused [hc:n4h6cd]", expect: 1, got: 1, loosened: true }));
    const node = join(p.canon, "REQ-1-months", "REQ-1.1-closing", "REQ-1.1.5-node.md");
    writeFileSync(node, readFileSync(node, "utf8").replace("Every entry of the month is on its statement.", "Every entry of the month is on its statement, oldest first."));
    const status = p.git("status", "--porcelain");
    const folders = runFolders();

    const r = runTests(p.canon);

    expect(outcomes(r)).toEqual({ k3m9pq: "passed", w7x2ab: "failed", r5t8yz: "missing", n4h6cd: "changed", j8v3ef: "stale", q2q2q2: "not-run" });
    // the runner reported its cases last first: each result found its node by the tag
    expect(r.results.map((x) => x.node)).toEqual(NODES.map(([, uid]) => uid));
    expect(r.results[0]).toEqual({ node: "k3m9pq", title: "an entry dated inside a closed month is refused [hc:k3m9pq]", file: "cases/k3m9pq.case.json", runner: "cases", outcome: "passed", message: "asked for hc:(k3m9pq|w7x2ab|q2q2q2)", ms: 3 });
    expect(r.results[1]).toMatchObject({ outcome: "failed", message: "expected 1400, got 1300" });
    expect(r.results[2]?.message).toBe("The test file cases/r5t8yz.case.json is gone.");
    expect(r.results[3]?.message).toBe("The test file cases/n4h6cd.case.json changed after the test was accepted.");
    expect(r.results[4]?.message).toContain("REQ-1.1.5 was reworded");
    expect(r.results[5]?.message).toBe("The runner reported nothing under this title.");
    expect(r.results.filter((x) => isFailing(x.outcome)).map((x) => x.node)).toEqual(["w7x2ab", "r5t8yz", "n4h6cd", "j8v3ef"]);
    expect(r.runs).toHaveLength(1);
    expect(r.runs[0]).toMatchObject({ runner: "cases", exit: 1 });
    expect(r.runs[0]?.error).toBeUndefined();
    expect(r.tree).toBe(treeDigest(p.repo));
    // stored in the git directory, and nothing of the run left in the repository or in the temporary folder
    expect(resultsPath(gitDir)).toBe(join(gitDir, "headcanon", "results.json"));
    expect(loadResults(gitDir)).toEqual(r);
    expect(p.git("status", "--porcelain")).toBe(status);
    expect(walk(p.repo).filter((f) => /result-\d|\.log$|results\.json$/.test(f))).toEqual([]);
    expect(runFolders()).toEqual(folders);
  }, 60_000);

  it("runs some nodes and keeps what the others last said, marked with the tree they were measured on", () => {
    const p = accepted();
    const whole = runTests(p.canon);
    expect(outcomes(whole)).toEqual({ k3m9pq: "passed", w7x2ab: "failed", r5t8yz: "passed", n4h6cd: "passed", j8v3ef: "passed", q2q2q2: "not-run" });
    // every test of the runner is in the run: the pattern is the tag's start alone
    expect(whole.results[0]?.message).toBe("asked for hc:");
    p.write("src/total.mjs", "export const total = 1400;\n");
    const part = runTests(p.canon, { nodes: ["w7x2ab", "k3m9pq"] });
    expect(part.tree).not.toBe(whole.tree);
    expect(part.results.map((x) => [x.node, x.outcome, x.tree])).toEqual([["k3m9pq", "passed", undefined], ["w7x2ab", "failed", undefined], ["r5t8yz", "passed", whole.tree], ["n4h6cd", "passed", whole.tree], ["j8v3ef", "passed", whole.tree], ["q2q2q2", "not-run", whole.tree]]);
    // the runner was asked for the titles of those two nodes only, the pattern whole through the shell
    expect(part.results[0]?.message).toBe("asked for hc:(k3m9pq|w7x2ab)");
    expect(runTests(p.canon, { nodes: ["k3m9pq"] }).results[0]?.message).toBe("asked for hc:k3m9pq");
    // a run of nothing runs nothing and keeps everything; a run by kind takes only that kind
    expect(runTests(p.canon, { nodes: [] }).runs).toEqual([]);
    expect(runTests(p.canon, { kinds: ["unit"] }).runs).toEqual([]);
    expect(runTests(p.canon, { kinds: ["eval"] }).results.every((x) => x.tree === undefined)).toBe(true);
    expect(loadResults(gitDirOf(p.canon)!)?.results).toHaveLength(6);
  }, 60_000);

  it("runs a proposed test only when asked for all, and a rejected one never", () => {
    const p = project();
    setRunner(p.canon, "cases", { kind: "eval", command: "node tools/run-cases.mjs --titles {titles} --out {out} {files}", format: "headcanon-json" });
    addTests(p.canon, [caseEntry("k3m9pq"), caseEntry("w7x2ab"), caseEntry("r5t8yz")]);
    reviewTests(p.canon, "k3m9pq", "pass");
    reviewTests(p.canon, "w7x2ab", "fail", "The case does not check what the node says.");
    expect(outcomes(runTests(p.canon))).toEqual({ k3m9pq: "passed" });
    expect(outcomes(runTests(p.canon, { all: true }))).toEqual({ k3m9pq: "passed", r5t8yz: "passed" });
  }, 60_000);

  it("reads what the runner printed when its command takes no result file", () => {
    const p = project();
    setRunner(p.canon, "printed", { kind: "integration", command: "node tools/print-cases.mjs {files}", format: "headcanon-json" });
    addTests(p.canon, [{ ...caseEntry("k3m9pq", "printed"), kind: "integration" }, { ...caseEntry("w7x2ab", "printed"), kind: "integration" }]);
    const r = runTests(p.canon, { all: true });
    expect(outcomes(r)).toEqual({ k3m9pq: "passed", w7x2ab: "failed" });
    expect(r.runs[0]).toMatchObject({ runner: "printed", exit: 0 });
  }, 60_000);

  it("names the files a runner left changed in the repository", () => {
    const p = project();
    setRunner(p.canon, "messy", { kind: "unit", command: "node tools/messy.mjs --out {out} {files}", format: "headcanon-json" });
    addTests(p.canon, [{ ...caseEntry("k3m9pq", "messy"), kind: "unit" }]);
    const r = runTests(p.canon, { all: true });
    expect(r.runs[0]?.error).toBe("the runner left the repository changed: left behind.txt");
    expect(r.results[0]).toMatchObject({ outcome: "not-run", message: "The runner did not report it: the runner left the repository changed: left behind.txt" });
  }, 60_000);

  it("says why when a runner is not recorded, cannot start, or writes nothing that reads as a result", () => {
    const p = project();
    setRunner(p.canon, "absent-tool", { kind: "unit", command: "headcanon-no-such-tool --out {out} {files}", format: "junit" });
    setRunner(p.canon, "elsewhere", { kind: "unit", command: "node tools/run-cases.mjs --out {out} {files}", format: "headcanon-json", cwd: "no-such-folder" });
    addTests(p.canon, [{ ...caseEntry("k3m9pq", "absent-tool"), kind: "unit" }, { ...caseEntry("w7x2ab", "elsewhere"), kind: "unit" }, { ...caseEntry("r5t8yz", "never-recorded"), kind: "unit" }]);
    const r = runTests(p.canon, { all: true });
    expect(r.runs.map((x) => x.runner)).toEqual(["absent-tool", "elsewhere", "never-recorded"]);
    expect(r.runs[0]?.exit).not.toBe(0);
    expect(r.runs[0]?.error).toMatch(/^the runner wrote no result \(exit \d+\): .*headcanon-no-such-tool/s);
    expect(r.runs[1]?.error).toBe("the runner's folder no-such-folder is not in the repository");
    expect(r.runs[2]?.error).toContain("no runner named never-recorded is recorded");
    expect(r.results.map((x) => x.outcome)).toEqual(["not-run", "not-run", "not-run"]);
  }, 60_000);

  it("reads every report of a folder the runner made where its result was to go", () => {
    const p = project();
    // some runners write one report per class into a folder
    p.write("tools/per-class.mjs", `import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const out = process.argv[2];
mkdirSync(join(out, "nested"), { recursive: true });
writeFileSync(join(out, "TEST-months.xml"), '<testsuite name="months"><testcase classname="months" name="a closed month refuses [hc:k3m9pq]" time="0.25"/></testsuite>');
writeFileSync(join(out, "nested", "TEST-statements.xml"), '<testsuite name="statements"><testcase classname="statements" name="the total [hc:w7x2ab]"><failure message="1300 is not 1400"/></testcase></testsuite>');
`);
    setRunner(p.canon, "per-class", { kind: "integration", command: "node tools/per-class.mjs {out}", format: "junit" });
    addTests(p.canon, [{ ...caseEntry("k3m9pq", "per-class"), kind: "integration" }, { ...caseEntry("w7x2ab", "per-class"), kind: "integration" }]);
    const r = runTests(p.canon, { all: true });
    expect(r.runs[0]?.error).toBeUndefined();
    expect(r.results.map((x) => [x.outcome, x.message, x.ms])).toEqual([["passed", undefined, 250], ["failed", "1300 is not 1400", undefined]]);
  }, 60_000);

  it("splits a command too long for the shell over several calls and reads them as one run", () => {
    const p = project();
    p.write("tools/by-file.mjs", `import { readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
writeFileSync(args[0], JSON.stringify({ tests: args.slice(1).map((file) => ({ title: JSON.parse(readFileSync(file, "utf8")).title, outcome: "passed", message: String(process.pid) })) }));
`);
    const names = Array.from({ length: 300 }, (_, i) => String(i).padStart(3, "0"));
    for (const n of names) p.write(`cases/many/a-case-file-with-a-long-name-${n}.case.json`, JSON.stringify({ title: `case ${n} [hc:k3m9pq]` }));
    setRunner(p.canon, "by-file", { kind: "unit", command: "node tools/by-file.mjs {out} {files}", format: "headcanon-json" });
    expect(addTests(p.canon, names.map((n) => ({ ...caseEntry("k3m9pq", "by-file"), kind: "unit" as const, file: `cases/many/a-case-file-with-a-long-name-${n}.case.json`, title: `case ${n} [hc:k3m9pq]` })))).toEqual({ added: 300, errors: [] });
    const r = runTests(p.canon, { all: true });
    expect(r.runs).toHaveLength(1);
    expect(r.runs[0]).toMatchObject({ runner: "by-file", exit: 0 });
    expect(r.runs[0]?.error).toBeUndefined();
    expect(r.results).toHaveLength(300);
    expect(r.results.every((x) => x.outcome === "passed")).toBe(true);
    // cmd.exe takes 8191 characters; these files alone are more
    const calls = new Set(r.results.map((x) => x.message)).size;
    if (process.platform === "win32") expect(calls).toBeGreaterThan(1); else expect(calls).toBe(1);
  }, 120_000);

  it("stops a runner that never returns, with everything it started", async () => {
    const p = project();
    const pidDir = mkdtempSync(join(tmpdir(), "headcanon-pid-"));
    made.push(pidDir);
    const pidFile = join(pidDir, "pid").split("\\").join("/");
    setRunner(p.canon, "stuck", { kind: "e2e", command: `node tools/stuck.mjs "${pidFile}"`, format: "junit", timeoutSec: 2 });
    addTests(p.canon, [{ ...caseEntry("k3m9pq", "stuck"), kind: "e2e", journey: "JRN-1" }]);
    const t0 = Date.now();
    const r = runTests(p.canon, { all: true });
    expect(Date.now() - t0).toBeLessThan(30_000);
    expect(r.runs[0]).toMatchObject({ runner: "stuck", exit: null, error: "the runner did not return within 2 seconds and was stopped" });
    expect(r.results[0]?.outcome).toBe("not-run");
    const pid = Number(readFileSync(pidFile, "utf8"));
    const alive = () => { try { process.kill(pid, 0); return true; } catch { return false; } };
    for (let i = 0; i < 50 && alive(); i++) await new Promise((ok) => setTimeout(ok, 100));
    expect(alive()).toBe(false);
  }, 60_000);

  it("gives a test with no result the reason its file did not load, and counts several results for one test as their worst", () => {
    const p = project();
    // a runner that reports the way Vitest does: one failing case under a tagged group, and a file that failed to load
    p.write("tools/report.mjs", `import { writeFileSync } from "node:fs";
const args = process.argv.slice(2);
writeFileSync(args[args.indexOf("--out") + 1], JSON.stringify({ testResults: [
  { name: process.cwd().split(String.fromCharCode(92)).join("/") + "/cases/k3m9pq.case.json", status: "failed", message: "Cannot find module '../src/months.js'", assertionResults: [] },
  { name: "cases/w7x2ab.case.json", status: "failed", assertionResults: [
    { fullName: "the statement's total [hc:w7x2ab] with one entry", status: "passed", duration: 2, failureMessages: [] },
    { fullName: "the statement's total [hc:w7x2ab] with two entries", status: "failed", duration: 5, failureMessages: ["expected 1300 to be 1400"] },
    { fullName: "the owner reopens [hc:r5t8yz] first case", status: "passed", duration: 1, failureMessages: [] },
    { fullName: "a case of no recorded test [hc:r5t8yz]", status: "failed", duration: 1, failureMessages: ["not mine"] } ] } ] }));
`);
    setRunner(p.canon, "report", { kind: "unit", command: "node tools/report.mjs --out {out}", format: "vitest-json" });
    const unit = (uid: string, title: string) => ({ ...caseEntry(uid, "report"), kind: "unit" as const, title });
    expect(addTests(p.canon, [unit("k3m9pq", "a closed month refuses [hc:k3m9pq]"), unit("w7x2ab", "the statement's total [hc:w7x2ab]"), unit("r5t8yz", "the owner reopens [hc:r5t8yz] first case"), unit("r5t8yz", "the owner reopens [hc:r5t8yz] second case")]).errors).toEqual([]);
    const r = runTests(p.canon, { all: true });
    expect(r.results.map((x) => x.outcome)).toEqual(["errored", "failed", "passed", "not-run"]);
    expect(r.results[0]?.message).toBe("The test file did not load: Cannot find module '../src/months.js'");
    expect(r.results[1]).toMatchObject({ message: "expected 1300 to be 1400", ms: 7 });
  }, 60_000);
});

describe("saying the results and the commands [DEC-026]", () => {
  const io = (p: Project, over: Partial<CliCtx> = {}) => {
    const out: string[] = [], err: string[] = [];
    const ctx: CliCtx = { canonDir: p.canon, repo: p.repo, gitDir: gitDirOf(p.canon), port: 0, by: "tester-REQ-1.1", json: false, out: (s) => out.push(s), err: (s) => err.push(s), stdin: () => "", ...over };
    return { ctx, out, err, text: () => out.join("") };
  };

  it("describes a run in plain lines: the counts, each node, and what every test that did not pass said", () => {
    const p = accepted();
    rmSync(join(p.repo, "cases", "r5t8yz.case.json"));
    const r = runTests(p.canon);
    const lines = describeResults(r, loadCanon(p.canon)).split("\n");
    expect(lines[0]).toBe(`6 tests, measured ${r.at}: 3 passed, 1 failed, 1 missing, 1 not run.`);
    expect(lines.slice(1)).toEqual([
      "REQ-1.1.1 A closed month refuses entries: 1 passed",
      "REQ-1.1.2 A statement totals its entries:",
      '  failed: the statement\'s "total" is the sum of its entries [hc:w7x2ab] (cases/w7x2ab.case.json)',
      "    expected 1400, got 1300",
      "REQ-1.1.3 Only the owner reopens a month:",
      "  missing: only the owner reopens a month [hc:r5t8yz] (cases/r5t8yz.case.json)",
      "    The test file cases/r5t8yz.case.json is gone.",
      "REQ-1.1.4 An entry has a numeric amount: 1 passed",
      "REQ-1.1.5 A statement lists the month's entries: 1 passed",
      "REQ-1.1.6 A month closes once:",
      "  not run: closing a closed month changes nothing [hc:q2q2q2] (cases/q2q2q2.case.json)",
      "    The runner reported nothing under this title.",
    ]);
    expect(describeResults({ at: r.at, tree: r.tree, results: [], runs: [] }, loadCanon(p.canon))).toBe("No recorded test ran.");
    expect(describeResults({ ...r, results: [{ node: "gone99", title: "t [hc:gone99]", file: "f", runner: "cases", outcome: "passed" }], runs: [{ runner: "cases", exit: null, ms: 1, error: "the runner did not return within 2 seconds and was stopped" }] }, loadCanon(p.canon)).split("\n").slice(1)).toEqual(["[hc:gone99] (no longer in the canon): 1 passed", "Runner cases: the runner did not return within 2 seconds and was stopped"]);
  }, 60_000);

  it("records a runner, adds, reviews, lists, runs and shows results from the command line", async () => {
    const p = project();
    const runner = JSON.stringify({ kind: "eval", command: "node tools/run-cases.mjs --titles {titles} --out {out} {files}", format: "headcanon-json" });
    let c = io(p, { stdin: () => runner });
    expect(await testsCli(["runner", "cases", "-"], c.ctx)).toBe(0);
    expect(c.text()).toBe("Runner cases is recorded.\n");
    c = io(p);
    expect(await testsCli(["runner"], c.ctx)).toBe(0);
    expect(c.text()).toBe("cases (eval, headcanon-json): node tools/run-cases.mjs --titles {titles} --out {out} {files}\n");
    c = io(p);
    expect(await testsCli(["runner", "cases", '{"kind":"eval"}'], c.ctx)).toBe(1);
    expect(c.err.join("")).toBe("tests runner: format must be one of junit, vitest-json, playwright-json, headcanon-json\n");

    // the entries come from a file, from stdin, or on the line; who recorded them comes from --by
    const side = mkdtempSync(join(tmpdir(), "headcanon-side-"));
    made.push(side);
    writeFileSync(join(side, "entries.json"), JSON.stringify({ tests: [caseEntry("k3m9pq"), caseEntry("w7x2ab")] }));
    c = io(p);
    expect(await testsCli(["add", "@" + join(side, "entries.json")], c.ctx)).toBe(0);
    expect(c.text()).toBe("2 tests recorded as proposed.\n");
    c = io(p, { stdin: () => JSON.stringify([caseEntry("r5t8yz"), { ...caseEntry("n4h6cd"), node: "nobody" }]) });
    expect(await testsCli(["add", "-", "--by", "tester-REQ-1"], c.ctx)).toBe(1);
    expect(c.text()).toBe('1 test recorded as proposed.\nRefused: test 2 "an entry whose amount is text is refused [hc:n4h6cd]": node "nobody" is not the uid of a node in the canon\n');
    expect(loadManifest(p.canon).tests.map((t) => t.by)).toEqual(["tester-REQ-1.1", "tester-REQ-1.1", "tester-REQ-1"]);
    c = io(p);
    expect(await testsCli(["add", "{not json"], c.ctx)).toBe(1);
    expect(c.err.join("")).toContain("tests add: not valid JSON");

    // a review names the node by its id or its uid; a fail needs its note
    c = io(p);
    expect(await testsCli(["review", "REQ-1.1.1", "pass"], c.ctx)).toBe(0);
    expect(c.text()).toBe("1 test of REQ-1.1.1 accepted.\n");
    c = io(p);
    expect(await testsCli(["review", "w7x2ab", "fail"], c.ctx)).toBe(1);
    expect(c.err.join("")).toContain("a fail needs --note");
    c = io(p);
    expect(await testsCli(["review", "w7x2ab", "fail", "--note", "The expected total comes from the code."], c.ctx)).toBe(0);
    expect(c.text()).toBe("1 test of REQ-1.1.2 rejected.\n");
    c = io(p);
    expect(await testsCli(["review", "REQ-1.1.3", "pass", "--json"], c.ctx)).toBe(0);
    expect(JSON.parse(c.text())).toEqual({ ok: true, node: "r5t8yz", changed: 1 });
    c = io(p);
    expect(await testsCli(["review", "REQ-1.1.3", "pass"], c.ctx)).toBe(1);
    c = io(p);
    expect(await testsCli(["review", "REQ-7", "pass"], c.ctx)).toBe(1);
    expect(c.err.join("")).toBe("tests review: REQ-7 is not a node with a uid in the canon\n");

    c = io(p);
    expect(await testsCli(["results"], c.ctx)).toBe(0);
    expect(c.text()).toBe("No test has run yet.\n");

    // a run of a capability takes the nodes below it; it exits 0 only when nothing fails
    c = io(p);
    expect(await testsCli(["run", "REQ-1.1"], c.ctx)).toBe(0);
    expect(c.text().split("\n").slice(1)).toEqual(["REQ-1.1.1 A closed month refuses entries: 1 passed", "REQ-1.1.3 Only the owner reopens a month: 1 passed", ""]);
    expect(await testsCli(["add", "-"], io(p, { stdin: () => JSON.stringify(caseEntry("w7x2ab")) }).ctx)).toBe(0);
    expect(await testsCli(["review", "REQ-1.1.2", "pass"], io(p).ctx)).toBe(0);
    c = io(p, { json: true });
    expect(await testsCli(["run", "REQ-1.1.2", "REQ-1.1.1", "--kind", "eval"], c.ctx)).toBe(1);
    expect((JSON.parse(c.text()) as TestResults).results.map((x) => [x.node, x.outcome])).toEqual([["k3m9pq", "passed"], ["w7x2ab", "failed"], ["r5t8yz", "passed"]]);
    c = io(p);
    expect(await testsCli(["run", "--kind", "smoke"], c.ctx)).toBe(1);
    expect(c.err.join("")).toBe("tests run: --kind is one of unit, integration, e2e, eval, other; got smoke\n");
    c = io(p);
    expect(await testsCli(["run", "REQ-9"], c.ctx)).toBe(1);
    expect(c.err.join("")).toBe("tests run: REQ-9 is not in the canon\n");
    // a run that is not recorded is an error, never a run of everything
    c = io(p);
    expect(await testsCli(["run", "--run", "no-such-run"], c.ctx)).toBe(1);
    expect(c.err.join("")).toMatch(/^tests run: /);
    expect(c.text()).toBe("");

    c = io(p);
    expect(await testsCli(["list", "REQ-1.1.2"], c.ctx)).toBe(0);
    expect(c.text()).toBe("REQ-1.1.2 eval, accepted, failed: Runs the sample case and compares what the product answered with what the node says it must answer. (cases/w7x2ab.case.json)\n");
    c = io(p, { json: true });
    expect(await testsCli(["list"], c.ctx)).toBe(0);
    const listed = JSON.parse(c.text()) as { runners: Record<string, unknown>; tests: Array<{ id: string; status: string; outcome?: string }> };
    expect(Object.keys(listed.runners)).toEqual(["cases"]);
    expect(listed.tests.map((t) => [t.id, t.status, t.outcome])).toEqual([["REQ-1.1.1", "accepted", "passed"], ["REQ-1.1.2", "accepted", "failed"], ["REQ-1.1.3", "accepted", "passed"]]);
    c = io(p);
    expect(await testsCli(["results"], c.ctx)).toBe(0);
    expect(c.text()).toContain("3 tests, measured ");
    expect(c.text()).toContain("    expected 1400, got 1300\n");

    c = io(p);
    expect(await testsCli(["frobnicate"], c.ctx)).toBe(2);
    expect(c.err.join("")).toContain("usage: headcanon tests <command>");
    expect(await testsCli([], io(p).ctx)).toBe(2);
  }, 120_000);

  it("runs, for a run, what its slices owe and what passed in its first run", async () => {
    const p = accepted();
    // the run as runs.ts stores it: <git dir>/headcanon/runs/<run id>.json
    const runs = join(gitDirOf(p.canon)!, "headcanon", "runs");
    mkdirSync(runs, { recursive: true });
    writeFileSync(join(runs, "run-1.json"), JSON.stringify({ id: "run-1", startedAt: "2026-11-18T00:00:00Z", scope: ["REQ-1.1.2"], single: true, branch: "headcanon/build", base: "main", status: "running", steps: [], slices: [{ node: "REQ-1.1.2", uid: "w7x2ab", title: "A statement totals its entries", status: "building", owes: ["w7x2ab"], attempts: 0, lastFailing: [], commits: [], issues: [] }], firstRun: { passing: [CASES["k3m9pq"]!.title] } }));
    let c = io(p, { json: true });
    expect(await testsCli(["run", "--run", "run-1"], c.ctx)).toBe(1);
    expect(c.err.join("")).toBe("");
    expect((JSON.parse(c.text()) as TestResults).results.map((x) => [x.node, x.outcome, x.message])).toEqual([["k3m9pq", "passed", "asked for hc:(k3m9pq|w7x2ab)"], ["w7x2ab", "failed", "expected 1400, got 1300"]]);
    // a node named with the run narrows it further
    c = io(p);
    expect(await testsCli(["run", "REQ-1.1.1", "--run=run-1"], c.ctx)).toBe(0);
    expect(c.text()).toContain("REQ-1.1.1 A closed month refuses entries: 1 passed");
  }, 60_000);

  it("keeps the fixtures free of the machine they were made on", () => {
    for (const name of ["vitest.json", "vitest-junit.xml", "junit-mixed.xml", "playwright.json", "headcanon.json"]) {
      expect(statSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", "results", name)).size).toBeGreaterThan(100);
      expect(/Users[\\/]|AppData|DESKTOP-/.test(fixture(name))).toBe(false);
    }
    expect(existsSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", "results", "vitest.json"))).toBe(true);
  });
});
