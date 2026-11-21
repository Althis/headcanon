import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// the commit check belongs to another module; here it answers what the test says
const approve = vi.hoisted(() => ({
  prepareBuild: vi.fn(() => ({ ok: true, branch: "headcanon/build", base: "main" })),
  sliceCommits: vi.fn((): Array<{ sha: string; subject: string; ok: boolean; errors: string[] }> => []),
}));
vi.mock("../src/approve.js", () => approve);

import { checkSlice, dirtyFiles, failingOf, failingSet, gateCli, isFresh, nextAttempt, regressedOf, stopDecision, type StopInput } from "../src/gate.js";
import { loadCanon } from "../src/load.js";
import { RETRY_BUDGET } from "../src/ops.js";
import { createRun, loadRun, saveRun, updateSlice, type CliCtx, type Run, type Slice } from "../src/runs.js";
import { treeDigest, type TestEntry, type TestResult, type TestResults } from "../src/testing.js";

const TREE = "tree-now";
const title = (uid: string, words: string) => `${words} [hc:${uid}]`;
const res = (uid: string, words: string, outcome: TestResult["outcome"], message?: string): TestResult => ({ node: uid, title: title(uid, words), file: `tests/${uid}.test.js`, runner: "unit", outcome, ...(message ? { message } : {}) });
const resultsOf = (results: TestResult[], tree = TREE): TestResults => ({ at: "2026-11-18T10:00:00Z", tree, results, runs: [] });

const DATE = title("aaaaa2", "refuses an entry without a date");
const AMOUNT = title("aaaaa2", "refuses an entry without an amount");
const STORED = title("fffff2", "writes the totals at closing");
const LISTED = title("ddddd2", "lists the oldest entry first");

/** A slice for REQ-1.1.1 that also owes the node with uid fffff2. */
const sliceOf = (patch: Partial<Slice> = {}): Slice => ({ node: "REQ-1.1.1", uid: "aaaaa2", title: "An entry carries a date and an amount", status: "building", agentName: "implementer-REQ-1.1.1", owes: ["aaaaa2", "fffff2"], attempts: 0, lastFailing: [], commits: [], issues: [], ...patch });
const runOf = (slice: Slice, patch: Partial<Run> = {}): Run => ({ id: "run-1", startedAt: "2026-11-18T09:00:00Z", scope: ["REQ-1.1.1"], single: true, branch: "headcanon/build", base: "main", status: "running", steps: [], slices: [slice], ...patch });
/** Everything passing on a clean tree with sound commits; each test changes what it is about. */
function input(patch: Partial<StopInput> & { slicePatch?: Partial<Slice> } = {}): StopInput {
  const { slicePatch, ...rest } = patch;
  const slice = sliceOf(slicePatch);
  return { run: runOf(slice), slice, results: resultsOf([res("aaaaa2", "refuses an entry without a date", "passed"), res("fffff2", "writes the totals at closing", "passed")]), tree: TREE, dirty: false, badCommits: [], openIssuesByNode: {}, regressed: [], ...rest };
}
const failingDate = resultsOf([res("aaaaa2", "refuses an entry without a date", "failed", "the entry was accepted"), res("fffff2", "writes the totals at closing", "passed")]);
const failingBoth = resultsOf([res("aaaaa2", "refuses an entry without a date", "failed", "the entry was accepted"), res("fffff2", "writes the totals at closing", "errored", "closeMonth is not a function")]);

describe("stopDecision", () => {
  it("has a budget to count against", () => {
    expect(RETRY_BUDGET).toBeGreaterThan(0);
  });

  it("blocks when no result is stored: run the tests first", () => {
    const d = stopDecision(input({ results: undefined }));
    expect(d.decision).toBe("block");
    expect(d.reason).toContain("Run the tests first: `HC tests run --run run-1`");
    expect(d.fileIssues).toBeUndefined();
  });

  it("blocks when the stored result was measured on other files", () => {
    const d = stopDecision(input({ results: resultsOf([res("aaaaa2", "refuses an entry without a date", "passed")], "tree-before") }));
    expect(d).toMatchObject({ decision: "block" });
    expect(d.reason).toContain("Run the tests first");
  });

  it("blocks when one owed test's result was kept from an earlier tree, and ignores such a result of a node it does not owe", () => {
    const kept = (uid: string) => ({ ...res(uid, "kept from before", "passed"), tree: "tree-before" });
    expect(stopDecision(input({ results: resultsOf([res("aaaaa2", "refuses an entry without a date", "passed"), kept("fffff2")]) })).reason).toContain("Run the tests first");
    expect(stopDecision(input({ results: resultsOf([res("aaaaa2", "refuses an entry without a date", "passed"), kept("ddddd2")]) })).decision).toBe("allow");
  });

  it("blocks on a commit that fails the commit check, naming it, before it looks at the tests", () => {
    const d = stopDecision(input({ badCommits: ['bad0000 wip: missing "Intent:" trailer'], results: failingDate }));
    expect(d.decision).toBe("block");
    expect(d.reason).toContain("These commits are not in the intent format:");
    expect(d.reason).toContain('- bad0000 wip: missing "Intent:" trailer');
    expect(d.reason).toContain("Intent: REQ-1.1.1");
    expect(d.reason).not.toContain("do not pass yet");
  });

  it("blocks while a test that passed in the first run fails now, even when its own nodes pass", () => {
    const d = stopDecision(input({ regressed: [LISTED], results: resultsOf([res("aaaaa2", "refuses an entry without a date", "passed"), res("ddddd2", "lists the oldest entry first", "failed", "2 March came first")]) }));
    expect(d.decision).toBe("block");
    expect(d.reason).toContain("passed before you started and fail now");
    expect(d.reason).toContain(`- ${LISTED} (tests/ddddd2.test.js): failed: 2 March came first`);
  });

  it("allows when every owed node passes and the tree is clean", () => {
    expect(stopDecision(input())).toEqual({ decision: "allow", reason: "every test of its nodes passes and the tree is clean" });
  });

  it("does not count a failing test of a node the slice does not owe", () => {
    const d = stopDecision(input({ results: resultsOf([res("aaaaa2", "refuses an entry without a date", "passed"), res("ddddd2", "lists the oldest entry first", "failed")]) }));
    expect(d.decision).toBe("allow");
  });

  it("allows a slice whose nodes carry no test at all, on a clean tree", () => {
    expect(stopDecision(input({ results: resultsOf([]) })).decision).toBe("allow");
  });

  it("blocks when the tests pass but the tree is not clean: commit your work", () => {
    const d = stopDecision(input({ dirty: true }));
    expect(d.decision).toBe("block");
    expect(d.reason).toMatch(/^Commit your work: the tests pass but the tree is not clean/);
  });

  it("blocks on an unclean tree before it weighs issues or the budget", () => {
    const d = stopDecision(input({ dirty: true, results: failingDate, openIssuesByNode: { aaaaa2: 1 }, slicePatch: { attempts: RETRY_BUDGET, lastFailing: [DATE] } }));
    expect(d.decision).toBe("block");
    expect(d.reason).toMatch(/^Commit your work: the tree is not clean/);
  });

  it("allows when every failing owed node has an open issue of this slice", () => {
    const d = stopDecision(input({ results: failingBoth, openIssuesByNode: { aaaaa2: 1, fffff2: 2 } }));
    expect(d).toEqual({ decision: "allow", reason: "every node still failing has an issue waiting on the user" });
  });

  it("blocks when one failing node has an issue and another has none", () => {
    const d = stopDecision(input({ results: failingBoth, openIssuesByNode: { aaaaa2: 1 } }));
    expect(d.decision).toBe("block");
    expect(d.reason).toContain("Nodes that already have your issue need no second one.");
  });

  it("blocks with the failing tests, their messages and both exits named", () => {
    const d = stopDecision(input({ results: failingBoth }));
    expect(d.decision).toBe("block");
    expect(d.reason).toContain("These tests of your nodes do not pass yet:");
    expect(d.reason).toContain(`- ${DATE} (tests/aaaaa2.test.js): failed: the entry was accepted`);
    expect(d.reason).toContain(`- ${STORED} (tests/fffff2.test.js): broke before it could finish: closeMonth is not a function`);
    expect(d.reason).toContain("One: make them pass, run `HC tests run --run run-1` again, commit, then stop.");
    expect(d.reason).toContain("Two: for each node you cannot make pass, file an issue that blocks it");
    expect(d.reason).toContain('`by` "implementer-REQ-1.1.1", `blocks` true, and `kind` "impossible"');
    expect(d.fileIssues).toBeUndefined();
  });

  it("counts only a pass: a test skipped, stale, not run, changed or missing holds the stop", () => {
    for (const outcome of ["skipped", "stale", "not-run", "changed", "missing", "errored"] as const) {
      const d = stopDecision(input({ results: resultsOf([res("aaaaa2", "refuses an entry without a date", outcome)]) }));
      expect(d.decision, outcome).toBe("block");
      expect(d.reason, outcome).toContain(DATE);
    }
  });

  it("blocks while the same tests fail and the budget is not reached", () => {
    const d = stopDecision(input({ results: failingDate, slicePatch: { attempts: RETRY_BUDGET - 1, lastFailing: [DATE] } }));
    expect(d.decision).toBe("block");
  });

  it("blocks when the budget is reached but other tests fail now", () => {
    const d = stopDecision(input({ results: failingDate, slicePatch: { attempts: RETRY_BUDGET, lastFailing: [AMOUNT] } }));
    expect(d.decision).toBe("block");
    expect(d.fileIssues).toBeUndefined();
  });

  it("allows when the same tests fail again and the budget is reached, with an impossible issue to file for each failing node", () => {
    const d = stopDecision(input({ results: failingBoth, slicePatch: { attempts: RETRY_BUDGET, lastFailing: [STORED, DATE] } }));
    expect(d.decision).toBe("allow");
    expect(d.reason).toContain("filed for the user as impossible");
    expect(d.fileIssues?.map((i) => i.node)).toEqual(["aaaaa2", "fffff2"]);
    expect(d.fileIssues?.[0]?.text).toContain("could not make this node pass");
    expect(d.fileIssues?.[0]?.text).toContain(`- ${DATE} (tests/aaaaa2.test.js): failed: the entry was accepted`);
    expect(d.fileIssues?.[0]?.text).not.toContain(STORED);
    expect(d.fileIssues?.[1]?.text).toContain(STORED);
  });

  it("files no second issue for a failing node that already has one when the budget is reached", () => {
    const d = stopDecision(input({ results: failingBoth, openIssuesByNode: { fffff2: 1 }, slicePatch: { attempts: RETRY_BUDGET, lastFailing: [DATE, STORED] } }));
    expect(d.decision).toBe("allow");
    expect(d.fileIssues?.map((i) => i.node)).toEqual(["aaaaa2"]);
  });

  it("lets go of a break it could not undo once the budget is reached, with an issue on the slice's node", () => {
    const results = resultsOf([res("aaaaa2", "refuses an entry without a date", "passed"), res("ddddd2", "lists the oldest entry first", "failed")]);
    const blocked = stopDecision(input({ regressed: [LISTED], results, slicePatch: { attempts: RETRY_BUDGET - 1, lastFailing: [LISTED] } }));
    expect(blocked.decision).toBe("block");
    const d = stopDecision(input({ regressed: [LISTED], results, slicePatch: { attempts: RETRY_BUDGET, lastFailing: [LISTED] } }));
    expect(d.decision).toBe("allow");
    expect(d.fileIssues).toHaveLength(1);
    expect(d.fileIssues?.[0]).toMatchObject({ node: "aaaaa2" });
    expect(d.fileIssues?.[0]?.text).toContain(`- ${LISTED}`);
    // an issue on the failing node does not excuse the break before the budget is reached
    expect(stopDecision(input({ regressed: [LISTED], results: failingDate, openIssuesByNode: { aaaaa2: 1 } })).decision).toBe("block");
  });
});

describe("what a stop records", () => {
  it("leaves the count alone when the stop was refused for stale results, a commit message or an unclean tree", () => {
    const slicePatch = { attempts: 1, lastFailing: [DATE] };
    expect(nextAttempt(input({ results: undefined, slicePatch }))).toEqual({ attempts: 1, lastFailing: [DATE] });
    expect(nextAttempt(input({ results: failingDate, badCommits: ["bad0000 wip: no Intent"], slicePatch }))).toEqual({ attempts: 1, lastFailing: [DATE] });
    expect(nextAttempt(input({ results: failingDate, dirty: true, slicePatch }))).toEqual({ attempts: 1, lastFailing: [DATE] });
  });

  it("counts a stop sent back with failing tests: one more for the same tests, one for a new set", () => {
    expect(nextAttempt(input({ results: failingDate }))).toEqual({ attempts: 1, lastFailing: [DATE] });
    expect(nextAttempt(input({ results: failingDate, slicePatch: { attempts: 1, lastFailing: [DATE] } }))).toEqual({ attempts: 2, lastFailing: [DATE] });
    expect(nextAttempt(input({ results: failingBoth, slicePatch: { attempts: 2, lastFailing: [DATE] } }))).toEqual({ attempts: 1, lastFailing: [DATE, STORED].sort() });
    expect(nextAttempt(input({ regressed: [LISTED] }))).toEqual({ attempts: 1, lastFailing: [LISTED] });
  });

  it("starts over when everything passes, and keeps the count when the agent is let go with tests failing", () => {
    expect(nextAttempt(input({ slicePatch: { attempts: 2, lastFailing: [DATE] } }))).toEqual({ attempts: 0, lastFailing: [] });
    expect(nextAttempt(input({ results: failingDate, openIssuesByNode: { aaaaa2: 1 }, slicePatch: { attempts: 1, lastFailing: [AMOUNT] } }))).toEqual({ attempts: 1, lastFailing: [DATE] });
  });

  it("reaches the budget after as many stops sent back with the same tests", () => {
    let slice = sliceOf();
    for (let stop = 1; stop <= RETRY_BUDGET; stop++) {
      const at = input({ results: failingDate, slicePatch: slice });
      expect(stopDecision(at).decision, `stop ${stop}`).toBe("block");
      slice = { ...slice, ...nextAttempt(at) };
    }
    expect(slice.attempts).toBe(RETRY_BUDGET);
    expect(stopDecision(input({ results: failingDate, slicePatch: slice })).decision).toBe("allow");
  });
});

describe("the facts the rule weighs", () => {
  it("failingOf keeps the owed results that did not pass", () => {
    expect(failingOf(sliceOf(), failingBoth).map((r) => r.title)).toEqual([DATE, STORED]);
    expect(failingOf(sliceOf({ owes: ["fffff2"] }), failingBoth).map((r) => r.title)).toEqual([STORED]);
    expect(failingOf(sliceOf(), undefined)).toEqual([]);
  });

  it("regressedOf names what passed in the first run and is broken now, by what a builder can break", () => {
    const run = runOf(sliceOf(), { firstRun: { passing: [LISTED, DATE, STORED] } });
    const results = resultsOf([res("ddddd2", "lists the oldest entry first", "failed"), res("aaaaa2", "refuses an entry without a date", "stale"), res("fffff2", "writes the totals at closing", "passed"), { ...res("ddddd2", "lists the oldest entry first", "failed"), title: "never passed before [hc:ddddd2]" }]);
    expect(regressedOf(run, results)).toEqual([LISTED]);
    expect(regressedOf(runOf(sliceOf()), results)).toEqual([]);
    expect(regressedOf(run, undefined)).toEqual([]);
    // a result kept from an earlier tree says nothing about now
    expect(regressedOf(run, resultsOf([{ ...res("ddddd2", "lists the oldest entry first", "failed"), tree: "tree-before" } as TestResult]))).toEqual([]);
  });

  it("failingSet is the owed failures and the breaks together, sorted, each once", () => {
    expect(failingSet({ slice: sliceOf(), results: failingBoth, regressed: [LISTED, DATE] })).toEqual([LISTED, DATE, STORED].sort());
  });

  it("isFresh holds only for a result of this tree", () => {
    expect(isFresh({ slice: sliceOf(), results: failingDate, tree: TREE })).toBe(true);
    expect(isFresh({ slice: sliceOf(), results: failingDate, tree: "another" })).toBe(false);
    expect(isFresh({ slice: sliceOf(), results: undefined, tree: TREE })).toBe(false);
  });
});

// ---- the hook, on a real repository ----

const roots: string[] = [];
const servers: Server[] = [];
afterAll(() => { roots.forEach((d) => rmSync(d, { recursive: true, force: true })); servers.forEach((s) => s.close()); });

interface Repo { repo: string; canonDir: string; gitDir: string }

/** Ledgerline with one capability: REQ-1.1.1 not built, REQ-1.1.2 not built. One commit, so the tree has a HEAD. */
function ledgerline(): Repo {
  const repo = mkdtempSync(join(tmpdir(), "headcanon-gate-"));
  roots.push(repo);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
  git("init", "-q");
  writeFileSync(join(repo, ".gitattributes"), "* -text\n");
  writeFileSync(join(repo, "ledger.txt"), "entries\n");
  git("add", ".gitattributes", "ledger.txt");
  git("-c", "user.name=T", "-c", "user.email=t@example.com", "commit", "-q", "-m", "seed");
  const canonDir = join(repo, "canon");
  const file = (rel: string, text: string) => { mkdirSync(dirname(join(canonDir, rel)), { recursive: true }); writeFileSync(join(canonDir, rel), text); };
  const node = (id: string, name: string, front: string, body: string) => `---\nid: ${id}\n${id.includes(".") ? `parent: ${id.slice(0, id.lastIndexOf("."))}\n` : ""}title: "${name}"\n${front}---\n\n# ${name}\n\n## Intent\n\n${name}.\n${body}`;
  const leaf = (uid: string) => `state: assumed\nlayer: requirement\nkind: binary\nuid: ${uid}\n`;
  file("README.md", `---\nid: ROOT\ntitle: "Ledgerline"\nstate: resolved\nformat: 4\n---\n\n# Ledgerline\n\n## Intent\n\nLedgerline keeps the books of a small business.\n`);
  file("REQ-1-entries/README.md", node("REQ-1", "Entries", "state: assumed\nlayer: domain\n", ""));
  file("REQ-1-entries/REQ-1.1-recording/README.md", node("REQ-1.1", "Recording entries", "state: assumed\nlayer: capability\n", ""));
  file("REQ-1-entries/REQ-1.1-recording/REQ-1.1.1-date-and-amount.md", node("REQ-1.1.1", "An entry carries a date and an amount", leaf("aaaaa2"), "\n## Check\n\nAn entry without a date is refused.\n\n## Implemented by\n\n- not built\n"));
  file("REQ-1-entries/REQ-1.1-recording/REQ-1.1.2-closed-month.md", node("REQ-1.1.2", "An entry in a closed month is refused", leaf("bbbbb2"), "\n## Check\n\nAn entry dated in a closed month is refused.\n\n## Implemented by\n\n- not built\n"));
  const gitDir = execFileSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: repo, encoding: "utf8" }).trim();
  return { repo, canonDir, gitDir };
}

const entry = (uid: string, words: string): TestEntry => ({ node: uid, id: "", runner: "unit", kind: "unit", file: `tests/${uid}.test.js`, title: title(uid, words), description: `${words}.`, pin: "pin", status: "accepted", at: "2026-11-18T00:00:00Z" });
/** Record the accepted tests and what the last run said, measured on the files as they are now. */
function record(r: Repo, tests: TestEntry[], results: TestResult[]): void {
  // the record of tests is a file of the tree, so it is written before the tree is measured
  writeFileSync(join(r.canonDir, "tests.json"), JSON.stringify({ runners: {}, tests }));
  mkdirSync(join(r.gitDir, "headcanon"), { recursive: true });
  writeFileSync(join(r.gitDir, "headcanon", "results.json"), JSON.stringify({ at: "2026-11-18T00:00:00Z", tree: treeDigest(r.repo), results, runs: [] }));
}
const DATE_TEST = entry("aaaaa2", "refuses an entry without a date");

/** A run with a building slice for REQ-1.1.1, and the transcript of its agent, kept outside the repository. */
function building(r: Repo): { run: Run; transcript: string; hook: string } {
  const run = createRun(r.gitDir, loadCanon(r.canonDir), ["REQ-1.1.1"], true, "headcanon/build", "main");
  updateSlice(r.gitDir, run.id, "REQ-1.1.1", { status: "building", agentName: "implementer-REQ-1.1.1", baseSha: "base000" });
  const dir = mkdtempSync(join(tmpdir(), "headcanon-transcript-"));
  roots.push(dir);
  const transcript = join(dir, "agent-a1.jsonl");
  writeFileSync(transcript, JSON.stringify({ parentUuid: null, isSidechain: true, agentId: "a1", type: "user", message: { role: "user", content: `headcanon-run: ${run.id} slice: REQ-1.1.1\n\n# Ledgerline\n` }, uuid: "u1" }) + "\n");
  return { run, transcript, hook: JSON.stringify({ agent_id: "a1", agent_type: "headcanon:implementer", agent_transcript_path: transcript, last_assistant_message: "Done.", stop_hook_active: false, cwd: r.repo }) };
}

function ctxOf(r: Repo, stdin: string, port = 1): { ctx: CliCtx; out: string[]; err: string[] } {
  const out: string[] = [], err: string[] = [];
  return { ctx: { canonDir: r.canonDir, repo: r.repo, gitDir: r.gitDir, port, by: undefined, json: false, out: (s) => out.push(s), err: (s) => err.push(s), stdin: () => stdin }, out, err };
}
const sliceNow = (r: Repo, run: Run): Slice => loadRun(r.gitDir, run.id)!.slices[0]!;
const questions = (r: Repo): Array<Record<string, unknown>> => {
  const store = join(r.gitDir, "headcanon", "questions.json");
  return existsSync(store) ? (JSON.parse(readFileSync(store, "utf8")) as { queue: Array<Record<string, unknown>> }).queue : [];
};

// the hook reads the project from the environment when the command line points nowhere: these tests give it none
const projectDir = process.env["CLAUDE_PROJECT_DIR"];
beforeEach(() => { approve.sliceCommits.mockReset().mockImplementation(() => []); delete process.env["CLAUDE_PROJECT_DIR"]; });
afterEach(() => { if (projectDir !== undefined) process.env["CLAUDE_PROJECT_DIR"] = projectDir; });

describe("gate subagent-stop", () => {
  it("answers a usage line for any other command", async () => {
    const r = ledgerline();
    const { ctx, err } = ctxOf(r, "{}");
    expect(await gateCli(["commit"], ctx)).toBe(2);
    expect(await gateCli([], ctx)).toBe(2);
    expect(err.join("")).toContain("usage: headcanon gate subagent-stop");
  });

  it("says nothing and exits 0 for an agent that is not an implementation agent of a run", async () => {
    const r = ledgerline();
    const { run } = building(r);
    const before = readFileSync(join(r.gitDir, "headcanon", "runs", `${run.id}.json`), "utf8");
    const other = join(r.repo, "..", `reviewer-${Date.now()}.jsonl`);
    roots.push(other);
    writeFileSync(other, JSON.stringify({ type: "user", message: { role: "user", content: "Review the set under REQ-1.1." } }) + "\n");
    for (const stdin of [JSON.stringify({ agent_id: "b2", agent_type: "headcanon:reviewer", agent_transcript_path: other, cwd: r.repo }), JSON.stringify({ agent_id: "b3" }), "{}", ""]) {
      const { ctx, out, err } = ctxOf(r, stdin);
      expect(await gateCli(["subagent-stop"], ctx)).toBe(0);
      expect(out).toEqual([]);
      expect(err).toEqual([]);
    }
    expect(readFileSync(join(r.gitDir, "headcanon", "runs", `${run.id}.json`), "utf8")).toBe(before);
    expect(approve.sliceCommits).not.toHaveBeenCalled();
  });

  it("says nothing when there is no run at all, or no git repository", async () => {
    const r = ledgerline();
    const a = ctxOf(r, JSON.stringify({ agent_id: "a1", cwd: r.repo }));
    expect(await gateCli(["subagent-stop"], a.ctx)).toBe(0);
    expect(a.out).toEqual([]);
    const bare = mkdtempSync(join(tmpdir(), "headcanon-bare-"));
    roots.push(bare);
    const b = ctxOf({ repo: bare, canonDir: join(bare, "canon"), gitDir: "" }, JSON.stringify({ agent_id: "a1", cwd: bare }));
    expect(await gateCli(["subagent-stop"], { ...b.ctx, gitDir: undefined })).toBe(0);
    expect(b.out).toEqual([]);
    expect(b.err).toEqual([]);
  });

  it("lets an agent go whose run was stopped or whose slice the user already decided", async () => {
    const r = ledgerline();
    const { run, hook } = building(r);
    record(r, [DATE_TEST], [res("aaaaa2", "refuses an entry without a date", "failed")]);
    updateSlice(r.gitDir, run.id, "REQ-1.1.1", { status: "discarded" });
    const a = ctxOf(r, hook);
    expect(await gateCli(["subagent-stop"], a.ctx)).toBe(0);
    expect(a.out).toEqual([]);
    updateSlice(r.gitDir, run.id, "REQ-1.1.1", { status: "building" });
    saveRun(r.gitDir, { ...loadRun(r.gitDir, run.id)!, status: "stopped" });
    const b = ctxOf(r, hook);
    expect(await gateCli(["subagent-stop"], b.ctx)).toBe(0);
    expect(b.out).toEqual([]);
    expect(sliceNow(r, run).attempts).toBe(0);
  });

  it("never throws: input that is not JSON, or a check that breaks, exits 0 with the error on stderr", async () => {
    const r = ledgerline();
    const a = ctxOf(r, "not json");
    expect(await gateCli(["subagent-stop"], a.ctx)).toBe(0);
    expect(a.out).toEqual([]);
    expect(a.err.join("")).toMatch(/^gate: /);
    const { hook } = building(r);
    record(r, [DATE_TEST], [res("aaaaa2", "refuses an entry without a date", "failed")]);
    approve.sliceCommits.mockImplementation(() => { throw new Error("git is not here"); });
    const b = ctxOf(r, hook);
    expect(await gateCli(["subagent-stop"], b.ctx)).toBe(0);
    expect(b.out).toEqual([]);
    expect(b.err.join("")).toBe("gate: git is not here\n");
    const c = ctxOf(r, hook);
    expect(await gateCli(["subagent-stop"], { ...c.ctx, err: () => { throw new Error("stderr is closed"); } })).toBe(0);
  });

  it("blocks an implementation agent that never ran the tests, in the hook's JSON", async () => {
    const r = ledgerline();
    const { run, hook } = building(r);
    const { ctx, out, err } = ctxOf(r, hook);
    expect(await gateCli(["subagent-stop"], ctx)).toBe(0);
    expect(err).toEqual([]);
    expect(out).toHaveLength(1);
    const answer = JSON.parse(out[0]!) as { decision: string; reason: string };
    expect(Object.keys(answer).sort()).toEqual(["decision", "reason"]);
    expect(answer.decision).toBe("block");
    expect(answer.reason).toContain(`Run the tests first: \`HC tests run --run ${run.id}\``);
    expect(sliceNow(r, run)).toMatchObject({ status: "building", attempts: 0, agent: "a1" });
  });

  it("blocks when an accepted test of an owed node has no stored result", async () => {
    const r = ledgerline();
    const { hook } = building(r);
    record(r, [DATE_TEST], []);
    const { ctx, out } = ctxOf(r, hook);
    expect(await gateCli(["subagent-stop"], ctx)).toBe(0);
    expect((JSON.parse(out[0]!) as { reason: string }).reason).toContain(`- ${DATE} (tests/aaaaa2.test.js): was not run`);
  });

  it("blocks with the failing tests and counts the stop; lets go when they pass on a clean tree", async () => {
    const r = ledgerline();
    const { run, hook } = building(r);
    record(r, [DATE_TEST], [res("aaaaa2", "refuses an entry without a date", "failed", "the entry was accepted")]);
    const a = ctxOf(r, hook);
    expect(await gateCli(["subagent-stop"], a.ctx)).toBe(0);
    const answer = JSON.parse(a.out[0]!) as { decision: string; reason: string };
    expect(answer.decision).toBe("block");
    expect(answer.reason).toContain(`- ${DATE} (tests/aaaaa2.test.js): failed: the entry was accepted`);
    expect(sliceNow(r, run)).toMatchObject({ status: "building", attempts: 1, lastFailing: [DATE] });
    expect(approve.sliceCommits).toHaveBeenCalledWith(r.repo, "base000");

    record(r, [DATE_TEST], [res("aaaaa2", "refuses an entry without a date", "passed")]);
    const b = ctxOf(r, hook);
    expect(await gateCli(["subagent-stop"], b.ctx)).toBe(0);
    expect(b.out).toEqual([]);
    expect(b.err).toEqual([]);
    expect(sliceNow(r, run)).toMatchObject({ status: "passed", attempts: 0, lastFailing: [] });
    expect(questions(r)).toEqual([]);
  });

  it("blocks on an unclean tree, but never for what changed inside the canon folder", async () => {
    const r = ledgerline();
    const { hook } = building(r);
    writeFileSync(join(r.repo, "scratch.txt"), "left behind\n");
    record(r, [DATE_TEST], [res("aaaaa2", "refuses an entry without a date", "passed")]);
    expect(dirtyFiles(r.repo, r.canonDir)).toEqual(["scratch.txt"]);
    const a = ctxOf(r, hook);
    expect(await gateCli(["subagent-stop"], a.ctx)).toBe(0);
    expect((JSON.parse(a.out[0]!) as { reason: string }).reason).toMatch(/^Commit your work/);
    rmSync(join(r.repo, "scratch.txt"));
    writeFileSync(join(r.canonDir, "REQ-1-entries", "REQ-1.1-recording", "REQ-1.1.3-assumed.md"), "---\nid: REQ-1.1.3\nparent: REQ-1.1\ntitle: \"Amounts are kept in cents\"\nstate: assumed\n---\n\n# Amounts are kept in cents\n\n## Intent\n\nAmounts are kept in cents.\n");
    record(r, [DATE_TEST], [res("aaaaa2", "refuses an entry without a date", "passed")]);
    expect(dirtyFiles(r.repo, r.canonDir)).toEqual([]);
    const b = ctxOf(r, hook);
    expect(await gateCli(["subagent-stop"], b.ctx)).toBe(0);
    expect(b.out).toEqual([]);
  });

  it("blocks on a commit that is not in the intent format", async () => {
    const r = ledgerline();
    const { hook } = building(r);
    record(r, [DATE_TEST], [res("aaaaa2", "refuses an entry without a date", "passed")]);
    approve.sliceCommits.mockImplementation(() => [{ sha: "bad0000aaaaaa", subject: "wip", ok: false, errors: ['missing "Intent:" trailer'] }]);
    const { ctx, out } = ctxOf(r, hook);
    expect(await gateCli(["subagent-stop"], ctx)).toBe(0);
    expect((JSON.parse(out[0]!) as { reason: string }).reason).toContain('- bad0000 wip: missing "Intent:" trailer');
  });

  it("lets go when the failing node has the slice's own blocking issue, and holds for an issue someone else filed", async () => {
    const r = ledgerline();
    const { run, hook } = building(r);
    record(r, [DATE_TEST], [res("aaaaa2", "refuses an entry without a date", "failed")]);
    const store = join(r.gitDir, "headcanon", "questions.json");
    const question = (by: string, blocks: boolean) => ({ id: `q-${by}`, askedAt: "2026-11-18T10:00:00Z", kind: "contradiction", question: "Which holds?", header: "Contradiction", options: [], multiSelect: false, nodeId: "REQ-1.1.1", terms: [], by, ...(blocks ? { blocks: true } : {}) });
    writeFileSync(store, JSON.stringify({ queue: [question("session", true), question("implementer-REQ-1.1.2", true)] }));
    const a = ctxOf(r, hook);
    expect(await gateCli(["subagent-stop"], a.ctx)).toBe(0);
    expect((JSON.parse(a.out[0]!) as { decision: string }).decision).toBe("block");
    writeFileSync(store, JSON.stringify({ queue: [question("implementer-REQ-1.1.1", false)] }));
    const b = ctxOf(r, hook);
    expect(await gateCli(["subagent-stop"], b.ctx)).toBe(0);
    expect((JSON.parse(b.out[0]!) as { decision: string }).decision).toBe("block");
    writeFileSync(store, JSON.stringify({ queue: [question("implementer-REQ-1.1.1", true)] }));
    const c = ctxOf(r, hook);
    expect(await gateCli(["subagent-stop"], c.ctx)).toBe(0);
    expect(c.out).toEqual([]);
    expect(sliceNow(r, run)).toMatchObject({ status: "blocked", issues: ["q-implementer-REQ-1.1.1"], lastFailing: [DATE] });
  });

  it("after the budget of stops with the same tests failing, files the node as impossible in the question store and lets the agent go", async () => {
    const r = ledgerline();
    const { run, hook } = building(r);
    record(r, [DATE_TEST], [res("aaaaa2", "refuses an entry without a date", "failed", "the entry was accepted")]);
    for (let stop = 1; stop <= RETRY_BUDGET; stop++) {
      const { ctx, out } = ctxOf(r, hook);
      expect(await gateCli(["subagent-stop"], ctx)).toBe(0);
      expect((JSON.parse(out[0]!) as { decision: string }).decision, `stop ${stop}`).toBe("block");
      expect(sliceNow(r, run).attempts).toBe(stop);
    }
    expect(questions(r)).toEqual([]);
    const { ctx, out, err } = ctxOf(r, hook);
    expect(await gateCli(["subagent-stop"], ctx)).toBe(0);
    expect(out).toEqual([]);
    expect(err).toEqual([]);
    const filed = questions(r);
    expect(filed).toHaveLength(1);
    expect(filed[0]).toMatchObject({ kind: "impossible", nodeId: "REQ-1.1.1", by: "implementer-REQ-1.1.1", blocks: true });
    expect(filed[0]!["question"]).toBe('"An entry carries a date and an amount" could not be built. How do you want to handle it?');
    expect(String(filed[0]!["why"])).toContain(`- ${DATE} (tests/aaaaa2.test.js): failed: the entry was accepted`);
    expect((filed[0]!["options"] as Array<{ label: string }>).map((o) => o.label)).toEqual(["Try again", "Change the requirement", "Leave it for now"]);
    expect(sliceNow(r, run)).toMatchObject({ status: "blocked", issues: [filed[0]!["id"]] });
    // the issue now stands for the node: a later stop is let go without a second one
    const again = ctxOf(r, hook);
    expect(await gateCli(["subagent-stop"], again.ctx)).toBe(0);
    expect(again.out).toEqual([]);
    expect(questions(r)).toHaveLength(1);
  });

  it("files through the viewer when one answers for this canon on the port in the session marker", async () => {
    const r = ledgerline();
    const { run, hook } = building(r);
    record(r, [DATE_TEST], [res("aaaaa2", "refuses an entry without a date", "failed")]);
    updateSlice(r.gitDir, run.id, "REQ-1.1.1", { attempts: RETRY_BUDGET, lastFailing: [DATE] });
    const asked: Array<Record<string, unknown>> = [];
    const serve = (canon: string) => new Promise<number>((ok) => {
      const server = createServer((req, res2) => {
        if (req.url === "/api/health") { res2.setHeader("content-type", "application/json"); res2.end(JSON.stringify({ ok: true, canon })); return; }
        let body = "";
        req.on("data", (c) => (body += c)).on("end", () => { asked.push({ url: req.url, ...(JSON.parse(body) as Record<string, unknown>) }); res2.setHeader("content-type", "application/json"); res2.end(JSON.stringify({ questionId: "from-viewer" })); });
      });
      servers.push(server);
      server.listen(0, "127.0.0.1", () => ok((server.address() as AddressInfo).port));
    });
    // a viewer of another canon answers on the port the command line gives: it must not receive the issue
    const foreign = await serve(join(r.repo, "..", "another-canon"));
    const own = await serve(r.canonDir);
    writeFileSync(join(r.gitDir, "headcanon", "waiting"), JSON.stringify({ pid: 1, since: 0, port: own }));
    const { ctx, out, err } = ctxOf(r, hook, foreign);
    expect(await gateCli(["subagent-stop"], ctx)).toBe(0);
    expect(out).toEqual([]);
    expect(err).toEqual([]);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ url: "/api/ask", kind: "impossible", nodeId: "REQ-1.1.1", by: "implementer-REQ-1.1.1", blocks: true });
    expect(questions(r)).toEqual([]);
    expect(sliceNow(r, run)).toMatchObject({ status: "blocked", issues: ["from-viewer"] });

    // with no marker the port of the command line is asked; a viewer of another canon there is passed over for the store
    rmSync(join(r.gitDir, "headcanon", "waiting"));
    updateSlice(r.gitDir, run.id, "REQ-1.1.1", { status: "building", attempts: RETRY_BUDGET, lastFailing: [DATE], issues: [] });
    const b = ctxOf(r, hook, foreign);
    expect(await gateCli(["subagent-stop"], b.ctx)).toBe(0);
    expect(asked).toHaveLength(1);
    expect(questions(r)).toHaveLength(1);
  });

  it("finds the canon under the project the hook runs for when the command line points nowhere", async () => {
    const r = ledgerline();
    const { run, hook } = building(r);
    record(r, [DATE_TEST], [res("aaaaa2", "refuses an entry without a date", "failed")]);
    const elsewhere = mkdtempSync(join(tmpdir(), "headcanon-elsewhere-"));
    roots.push(elsewhere);
    const { ctx, out } = ctxOf({ repo: elsewhere, canonDir: join(elsewhere, "canon"), gitDir: "" }, hook);
    expect(await gateCli(["subagent-stop"], { ...ctx, gitDir: undefined })).toBe(0);
    expect((JSON.parse(out[0]!) as { decision: string }).decision).toBe("block");
    expect(sliceNow(r, run).attempts).toBe(1);
  });
});

describe("the session's own check of a slice", () => {
  it("is blocked, not failed, when what fails waits on the user", () => {
    const r = ledgerline();
    const { run } = building(r);
    record(r, [DATE_TEST], []);
    writeFileSync(join(r.gitDir, "headcanon", "questions.json"), JSON.stringify({ queue: [{ id: "q9", askedAt: "2026-11-18T10:00:00Z", kind: "impossible", question: "How?", header: "Could not be built", options: [], multiSelect: false, nodeId: "REQ-1.1.1", terms: [], by: "implementer-REQ-1.1.1", blocks: true }] }));
    const at = { canonDir: r.canonDir, repo: r.repo, gitDir: r.gitDir, run: loadRun(r.gitDir, run.id)!, slice: sliceNow(r, run) };
    const blocked = checkSlice({ ...at, results: resultsOf([res("aaaaa2", "refuses an entry without a date", "failed")], treeDigest(r.repo)) });
    expect(blocked).toMatchObject({ node: "REQ-1.1.1", verdict: "blocked", passing: 0, issues: ["q9"] });
    expect(blocked.text).toContain("blocked: what fails waits on the user");
    const passing = checkSlice({ ...at, results: resultsOf([res("aaaaa2", "refuses an entry without a date", "passed")], treeDigest(r.repo)) });
    expect(passing).toMatchObject({ verdict: "pass", passing: 1, failing: [] });
  });

  it("fails on a break of what passed before, and tells a commit of this slice from one that names another node", () => {
    const r = ledgerline();
    const { run } = building(r);
    record(r, [DATE_TEST], []);
    execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.com", "commit", "-q", "--allow-empty", "-m", "feat(entries): an entry needs a date\n\nIntent: REQ-1.1.1"], { cwd: r.repo, stdio: "ignore" });
    const mine = execFileSync("git", ["rev-parse", "HEAD"], { cwd: r.repo, encoding: "utf8" }).trim();
    execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.com", "commit", "-q", "--allow-empty", "-m", "feat(months): totals are stored\n\nIntent: REQ-1.1.2"], { cwd: r.repo, stdio: "ignore" });
    const other = execFileSync("git", ["rev-parse", "HEAD"], { cwd: r.repo, encoding: "utf8" }).trim();
    approve.sliceCommits.mockImplementation(() => [{ sha: mine, subject: "feat(entries): an entry needs a date", ok: true, errors: [] }, { sha: other, subject: "feat(months): totals are stored", ok: true, errors: [] }]);
    saveRun(r.gitDir, { ...loadRun(r.gitDir, run.id)!, firstRun: { passing: [LISTED] } });
    const report = checkSlice({ canonDir: r.canonDir, repo: r.repo, gitDir: r.gitDir, run: loadRun(r.gitDir, run.id)!, slice: sliceNow(r, run), results: resultsOf([res("aaaaa2", "refuses an entry without a date", "passed"), res("ddddd2", "lists the oldest entry first", "failed")], treeDigest(r.repo)) });
    expect(report.verdict).toBe("fail");
    expect(report.regressed).toEqual([LISTED]);
    expect(report.commits.map((c) => ({ names: c.names, mine: c.mine }))).toEqual([{ names: ["REQ-1.1.1"], mine: true }, { names: ["REQ-1.1.2"], mine: false }]);
    expect(report.text).toContain("names REQ-1.1.2, no node of this slice");
    expect(report.text).toContain("Passed in the first run and fail now:");
  });
});
