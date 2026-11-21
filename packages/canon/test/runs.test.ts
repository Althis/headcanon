import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// the build branch and the commit check belong to another module; here they answer what the test says
const approve = vi.hoisted(() => ({
  prepareBuild: vi.fn((): { ok: boolean; branch: string; base: string; canonCommit?: string; error?: string } => ({ ok: true, branch: "headcanon/build", base: "main", canonCommit: "abc1234def" })),
  sliceCommits: vi.fn((): Array<{ sha: string; subject: string; ok: boolean; errors: string[] }> => []),
}));
vi.mock("../src/approve.js", () => approve);
const ran = vi.hoisted(() => ({ runTests: vi.fn() }));
vi.mock("../src/testing.js", async (original) => ({ ...(await original<typeof import("../src/testing.js")>()), runTests: ran.runTests }));

import { loadCanon } from "../src/load.js";
import { BRIEF_MARKER, activeRun, afterFirstRun, boxesInScope, createRun, flagsOf, latestRun, loadRun, markerOf, runCli, runsDir, saveRun, setStep, sliceOfAgent, updateSlice, type CliCtx, type Run } from "../src/runs.js";
import { treeDigest, type TestEntry, type TestResult } from "../src/testing.js";

const roots: string[] = [];
afterAll(() => roots.forEach((d) => rmSync(d, { recursive: true, force: true })));

interface Repo { repo: string; canonDir: string; gitDir: string }

/**
 * Ledgerline, a bookkeeping tool: two domains, a capability each. Not built: REQ-1.1.1, REQ-1.1.2 (which requires
 * REQ-2.1.1), REQ-2.1.1 and its child REQ-2.1.1.1. Built: REQ-1.1.4. Red: REQ-1.1.3 (a draft), REQ-2.1.1.2 and
 * REQ-2.1.2 (contested).
 */
function ledgerline(): Repo {
  const repo = mkdtempSync(join(tmpdir(), "headcanon-runs-"));
  roots.push(repo);
  execFileSync("git", ["init", "-q"], { cwd: repo, stdio: "ignore" });
  const canonDir = join(repo, "canon");
  const file = (rel: string, text: string) => { mkdirSync(dirname(join(canonDir, rel)), { recursive: true }); writeFileSync(join(canonDir, rel), text); };
  const node = (id: string, title: string, front: string, body: string) => `---\nid: ${id}\n${id.includes(".") ? `parent: ${id.slice(0, id.lastIndexOf("."))}\n` : ""}title: "${title}"\n${front}---\n\n# ${title}\n\n## Intent\n\n${title}.\n${body}`;
  const leaf = (uid: string, state = "assumed", more = "") => `state: ${state}\nlayer: requirement\nkind: binary\nuid: ${uid}\n${more}`;
  const check = (text: string, built: string) => `\n## Check\n\n${text}\n\n## Implemented by\n\n${built}\n`;
  file("README.md", `---\nid: ROOT\ntitle: "Ledgerline"\nstate: resolved\nformat: 4\n---\n\n# Ledgerline\n\n## Intent\n\nLedgerline keeps the books of a small business.\n`);
  file("REQ-1-entries/README.md", node("REQ-1", "Entries", "state: assumed\nlayer: domain\n", ""));
  file("REQ-1-entries/REQ-1.1-recording/README.md", node("REQ-1.1", "Recording entries", "state: assumed\nlayer: capability\n", ""));
  file("REQ-1-entries/REQ-1.1-recording/REQ-1.1.1-date-and-amount.md", node("REQ-1.1.1", "An entry carries a date and an amount", leaf("aaaaa2"), check("An entry without a date is refused.", "- not built: entries are typed into a sheet today")));
  file("REQ-1-entries/REQ-1.1-recording/REQ-1.1.2-closed-month.md", node("REQ-1.1.2", "An entry in a closed month is refused", leaf("bbbbb2", "assumed", "requires: [REQ-2.1.1]\n"), check("An entry dated in a closed month is refused.", "- not built")));
  file("REQ-1-entries/REQ-1.1-recording/REQ-1.1.3-reversal.md", node("REQ-1.1.3", "An entry can be reversed", leaf("ccccc2", "draft"), check("A reversed entry leaves the total as it was.", "- not built")));
  file("REQ-1-entries/REQ-1.1-recording/REQ-1.1.4-listing.md", node("REQ-1.1.4", "Entries are listed by date", leaf("ddddd2", "assumed", 'binds: ["implements src/list.ts#listEntries"]\n'), "\n## Check\n\nThe list shows the oldest entry first.\n"));
  file("REQ-2-months/README.md", node("REQ-2", "Months", "state: assumed\nlayer: domain\n", ""));
  file("REQ-2-months/REQ-2.1-closing/README.md", node("REQ-2.1", "Closing a month", "state: assumed\nlayer: capability\n", ""));
  file("REQ-2-months/REQ-2.1-closing/REQ-2.1.1-totals/README.md", node("REQ-2.1.1", "A closed month keeps its totals", leaf("eeeee2"), check("The totals of a closed month read the same a day later.", "- not built")));
  file("REQ-2-months/REQ-2.1-closing/REQ-2.1.1-totals/REQ-2.1.1.1-stored.md", node("REQ-2.1.1.1", "The totals are stored at closing", leaf("fffff2"), check("Closing a month writes its totals.", "- not built")));
  file("REQ-2-months/REQ-2.1-closing/REQ-2.1.1-totals/REQ-2.1.1.2-rounding.md", node("REQ-2.1.1.2", "The totals are rounded to cents", leaf("ggggg2", "contested"), check("A total shows two decimals.", "- not built")));
  file("REQ-2-months/REQ-2.1-closing/REQ-2.1.2-statement.md", node("REQ-2.1.2", "A statement lists a month's entries", leaf("hhhhh2", "contested"), check("The statement of a month lists each of its entries.", "- not built")));
  const gitDir = execFileSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: repo, encoding: "utf8" }).trim();
  return { repo, canonDir, gitDir };
}

const title = (uid: string, words: string) => `${words} [hc:${uid}]`;
const entry = (uid: string, words: string, file: string): TestEntry => ({ box: uid, id: "", runner: "unit", kind: "unit", file, title: title(uid, words), description: `${words}.`, pin: "pin", status: "accepted", at: "2026-11-18T00:00:00Z" });
const result = (uid: string, words: string, file: string, outcome: TestResult["outcome"], message?: string): TestResult => ({ box: uid, title: title(uid, words), file, runner: "unit", outcome, ...(message ? { message } : {}) });
function record(r: Repo, tests: TestEntry[], results: TestResult[]): void {
  writeFileSync(join(r.canonDir, "tests.json"), JSON.stringify({ runners: {}, tests }));
  mkdirSync(join(r.gitDir, "headcanon"), { recursive: true });
  writeFileSync(join(r.gitDir, "headcanon", "results.json"), JSON.stringify({ at: "2026-11-18T00:00:00Z", tree: treeDigest(r.repo), results, runs: [] }));
}

function ctxOf(r: Repo, stdin = ""): { ctx: CliCtx; out: string[]; err: string[] } {
  const out: string[] = [], err: string[] = [];
  return { ctx: { canonDir: r.canonDir, repo: r.repo, gitDir: r.gitDir, port: 4317, by: undefined, json: false, out: (s) => out.push(s), err: (s) => err.push(s), stdin: () => stdin }, out, err };
}

const boxes = (run: Run) => run.slices.map((s) => s.box);
const stepOf = (run: Run, name: string) => run.steps.find((s) => s.name === name)!;
/** Every step before the build done, the way a session reports them. */
function prepared(r: Repo, run: Run): Run {
  let last = run;
  for (const name of ["prepare", "readiness", "tests", "first-run"] as const) last = setStep(r.gitDir, run.id, name, "done");
  return last;
}

beforeEach(() => {
  approve.prepareBuild.mockReset().mockImplementation(() => ({ ok: true, branch: "headcanon/build", base: "main", canonCommit: "abc1234def" }));
  approve.sliceCommits.mockReset().mockImplementation(() => []);
  ran.runTests.mockReset();
});

describe("a run and its slices", () => {
  it("gives one slice to each box with a kind that is not red and is not built, in the order the requires links give", () => {
    const r = ledgerline();
    const run = createRun(r.gitDir, loadCanon(r.canonDir), [], false, "headcanon/build", "main");
    // REQ-1.1.2 requires REQ-2.1.1, so it waits for it; REQ-2.1.1 waits for its own box below
    expect(boxes(run)).toEqual(["REQ-1.1.1", "REQ-2.1.1.1", "REQ-2.1.1", "REQ-1.1.2"]);
    expect(run.slices.every((s) => s.status === "queued" && s.attempts === 0 && s.lastFailing.length === 0 && s.commits.length === 0 && s.issues.length === 0)).toBe(true);
    expect(run.status).toBe("running");
    expect(run.steps.map((s) => `${s.name}:${s.status}`)).toEqual(["prepare:waiting", "readiness:waiting", "tests:waiting", "first-run:waiting", "build:waiting", "review:waiting"]);
    expect(run).toMatchObject({ scope: [], single: false, branch: "headcanon/build", base: "main" });
    expect(run.id).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
  });

  it("records what each slice owes by stable id: its own box and the boxes below it, the red ones left out", () => {
    const r = ledgerline();
    const run = createRun(r.gitDir, loadCanon(r.canonDir), [], false, "headcanon/build", "main");
    const slice = (box: string) => run.slices.find((s) => s.box === box)!;
    expect(slice("REQ-1.1.1")).toMatchObject({ uid: "aaaaa2", title: "An entry carries a date and an amount", owes: ["aaaaa2"] });
    expect(slice("REQ-2.1.1").owes).toEqual(["eeeee2", "fffff2"]);
  });

  it("leaves out a red box, a built box with nothing failing, and a box without a kind", () => {
    const r = ledgerline();
    const run = createRun(r.gitDir, loadCanon(r.canonDir), [], false, "headcanon/build", "main");
    for (const left of ["REQ-1.1.3", "REQ-2.1.1.2", "REQ-2.1.2", "REQ-1.1.4", "REQ-1.1", "REQ-2"]) expect(boxes(run)).not.toContain(left);
  });

  it("keeps to the scope: the boxes named and what is under them; ROOT or nothing is everything", () => {
    const r = ledgerline();
    const canon = loadCanon(r.canonDir);
    expect(boxes(createRun(r.gitDir, canon, ["REQ-1"], false, "b", "m"))).toEqual(["REQ-1.1.1", "REQ-1.1.2"]);
    expect(boxes(createRun(r.gitDir, canon, ["REQ-2.1.1.1"], true, "b", "m"))).toEqual(["REQ-2.1.1.1"]);
    expect(boxes(createRun(r.gitDir, canon, ["ROOT"], false, "b", "m"))).toHaveLength(4);
    expect(boxesInScope(canon, ["REQ-2.1.1"])).toEqual(["REQ-2.1.1", "REQ-2.1.1.1", "REQ-2.1.1.2"]);
    expect(boxesInScope(canon, ["REQ-9"])).toEqual([]);
  });

  it("takes out of sync from the stored results: a built box with a failing accepted test gets a slice, a not built box whose test passes gets none", () => {
    const r = ledgerline();
    record(r, [entry("ddddd2", "lists the oldest entry first", "tests/list.test.js"), entry("aaaaa2", "refuses an entry without a date", "tests/entry.test.js")],
      [result("ddddd2", "lists the oldest entry first", "tests/list.test.js", "failed", "expected 1 March before 2 March"), result("aaaaa2", "refuses an entry without a date", "tests/entry.test.js", "passed")]);
    const run = createRun(r.gitDir, loadCanon(r.canonDir), ["REQ-1"], false, "b", "m");
    expect(boxes(run)).toEqual(["REQ-1.1.2", "REQ-1.1.4"]);
  });

  it("stores the run under the git directory and reads it back; the active run is the newest not done or stopped", () => {
    const r = ledgerline();
    expect(activeRun(r.gitDir)).toBeUndefined();
    expect(latestRun(r.gitDir)).toBeUndefined();
    const first = createRun(r.gitDir, loadCanon(r.canonDir), ["REQ-1"], false, "b", "m");
    expect(existsSync(join(runsDir(r.gitDir), `${first.id}.json`))).toBe(true);
    expect(runsDir(r.gitDir)).toBe(join(r.gitDir, "headcanon", "runs"));
    expect(loadRun(r.gitDir, first.id)).toEqual(first);
    const second: Run = { ...first, id: "later-run", startedAt: "2999-01-01T00:00:00.000Z", status: "stopped" };
    saveRun(r.gitDir, second);
    expect(latestRun(r.gitDir)?.id).toBe("later-run");
    expect(activeRun(r.gitDir)?.id).toBe(first.id);
    saveRun(r.gitDir, { ...first, status: "done" });
    expect(activeRun(r.gitDir)).toBeUndefined();
  });

  it("reads no run from an id that is not a plain name, a missing file or a torn one", () => {
    const r = ledgerline();
    mkdirSync(runsDir(r.gitDir), { recursive: true });
    writeFileSync(join(runsDir(r.gitDir), "torn.json"), "{ not json");
    expect(loadRun(r.gitDir, "torn")).toBeUndefined();
    expect(loadRun(r.gitDir, "absent")).toBeUndefined();
    expect(loadRun(r.gitDir, "../results")).toBeUndefined();
    expect(latestRun(r.gitDir)).toBeUndefined();
  });
});

describe("steps, slices and what the run's status follows", () => {
  it("sets a step with its note and time, and drops the note when the next report has none", () => {
    const r = ledgerline();
    const run = createRun(r.gitDir, loadCanon(r.canonDir), ["REQ-1"], false, "b", "m");
    const noted = setStep(r.gitDir, run.id, "readiness", "running", "the tester reads REQ-1.1");
    expect(stepOf(noted, "readiness")).toMatchObject({ status: "running", note: "the tester reads REQ-1.1" });
    expect(stepOf(noted, "readiness").at).toBeTruthy();
    expect(stepOf(setStep(r.gitDir, run.id, "readiness", "done"), "readiness").note).toBeUndefined();
    expect(stepOf(loadRun(r.gitDir, run.id)!, "readiness").status).toBe("done");
    expect(() => setStep(r.gitDir, "no-such-run", "tests", "done")).toThrow(/no run/);
  });

  it("waits while a step is blocked and runs again when it is not", () => {
    const r = ledgerline();
    const run = createRun(r.gitDir, loadCanon(r.canonDir), ["REQ-1"], false, "b", "m");
    expect(setStep(r.gitDir, run.id, "tests", "blocked", "two corrections failed").status).toBe("waiting");
    expect(setStep(r.gitDir, run.id, "tests", "running").status).toBe("running");
  });

  it("changes a slice by box id or stable id, with its start and end times", () => {
    const r = ledgerline();
    const run = createRun(r.gitDir, loadCanon(r.canonDir), ["REQ-1"], false, "b", "m");
    const building = updateSlice(r.gitDir, run.id, "REQ-1.1.1", { status: "building", agent: "agent-7" });
    expect(building.slices[0]).toMatchObject({ status: "building", agent: "agent-7" });
    expect(building.slices[0]!.startedAt).toBeTruthy();
    expect(building.slices[0]!.endedAt).toBeUndefined();
    const passed = updateSlice(r.gitDir, run.id, "aaaaa2", { status: "passed", attempts: 1, lastFailing: [] });
    expect(passed.slices[0]).toMatchObject({ status: "passed", attempts: 1 });
    expect(passed.slices[0]!.endedAt).toBeTruthy();
    expect(() => updateSlice(r.gitDir, run.id, "REQ-9.9", { status: "building" })).toThrow(/no slice/);
    expect(() => updateSlice(r.gitDir, "no-such-run", "REQ-1.1.1", { status: "building" })).toThrow(/no run/);
  });

  it("follows the slices: build runs while one builds, the run is in review when a decision is all that is left, done when every slice is decided", () => {
    const r = ledgerline();
    const run = prepared(r, createRun(r.gitDir, loadCanon(r.canonDir), ["REQ-1"], false, "b", "m"));
    expect(run.status).toBe("running");
    let now = updateSlice(r.gitDir, run.id, "REQ-1.1.1", { status: "building" });
    expect(stepOf(now, "build").status).toBe("running");
    now = updateSlice(r.gitDir, run.id, "REQ-1.1.1", { status: "review" });
    expect(now.status).toBe("running"); // REQ-1.1.2 is still queued
    now = updateSlice(r.gitDir, run.id, "REQ-1.1.2", { status: "building" });
    now = updateSlice(r.gitDir, run.id, "REQ-1.1.2", { status: "review" });
    expect(now.status).toBe("review");
    expect(stepOf(now, "build").status).toBe("done");
    expect(stepOf(now, "review").status).toBe("running");
    now = updateSlice(r.gitDir, run.id, "REQ-1.1.1", { status: "approved" });
    expect(now.status).toBe("review");
    now = updateSlice(r.gitDir, run.id, "REQ-1.1.2", { status: "discarded" });
    expect(now.status).toBe("done");
    expect(now.endedAt).toBeTruthy();
    expect(stepOf(now, "review").status).toBe("done");
    expect(activeRun(r.gitDir)).toBeUndefined();
  });

  it("waits on the person when what is left is blocked behind issues, and runs again when a slice is sent back", () => {
    const r = ledgerline();
    const run = prepared(r, createRun(r.gitDir, loadCanon(r.canonDir), ["REQ-1"], false, "b", "m"));
    updateSlice(r.gitDir, run.id, "REQ-1.1.1", { status: "approved" });
    let now = updateSlice(r.gitDir, run.id, "REQ-1.1.2", { status: "blocked", issues: ["q1"] });
    expect(now.status).toBe("waiting");
    expect(stepOf(now, "build").status).toBe("done");
    now = updateSlice(r.gitDir, run.id, "REQ-1.1.2", { status: "sent-back", note: "use the month's last day" });
    expect(now.status).toBe("running");
    expect(stepOf(now, "build").status).toBe("running");
    expect(now.slices.find((s) => s.box === "REQ-1.1.2")).toMatchObject({ note: "use the month's last day" });
  });

  it("follows the slices even when the session skipped a step report", () => {
    const r = ledgerline();
    const run = createRun(r.gitDir, loadCanon(r.canonDir), ["REQ-1"], false, "b", "m");
    updateSlice(r.gitDir, run.id, "REQ-1.1.1", { status: "review" });
    const now = updateSlice(r.gitDir, run.id, "REQ-1.1.2", { status: "review" });
    expect(now.status).toBe("review");
    expect(stepOf(now, "build").status).toBe("done");
    expect(stepOf(now, "readiness").status).toBe("waiting");
  });

  it("ends a run with nothing to build once the steps before the build are done", () => {
    const r = ledgerline();
    const run = createRun(r.gitDir, loadCanon(r.canonDir), ["REQ-1.1.4"], true, "b", "m");
    expect(run.slices).toEqual([]);
    expect(setStep(r.gitDir, run.id, "tests", "done").status).toBe("running");
    const done = prepared(r, run);
    expect(done.status).toBe("done");
    expect(done.steps.map((s) => s.status)).toEqual(["done", "done", "done", "done", "done", "done"]);
  });

  it("never revives a run that was stopped", () => {
    const r = ledgerline();
    const run = createRun(r.gitDir, loadCanon(r.canonDir), ["REQ-1"], false, "b", "m");
    saveRun(r.gitDir, { ...run, status: "stopped" });
    expect(updateSlice(r.gitDir, run.id, "REQ-1.1.1", { status: "building" }).status).toBe("stopped");
  });

  it("after the first run keeps the titles that pass and makes the slices follow the marks", () => {
    const r = ledgerline();
    const run = createRun(r.gitDir, loadCanon(r.canonDir), ["REQ-1"], false, "b", "m");
    expect(boxes(run)).toEqual(["REQ-1.1.1", "REQ-1.1.2"]);
    updateSlice(r.gitDir, run.id, "REQ-1.1.2", { status: "building" });
    record(r, [entry("ddddd2", "lists the oldest entry first", "tests/list.test.js"), entry("aaaaa2", "refuses an entry without a date", "tests/entry.test.js")],
      [result("ddddd2", "lists the oldest entry first", "tests/list.test.js", "failed"), result("aaaaa2", "refuses an entry without a date", "tests/entry.test.js", "passed")]);
    const after = afterFirstRun(r.gitDir, run.id, loadCanon(r.canonDir));
    expect(after.firstRun).toEqual({ passing: [title("aaaaa2", "refuses an entry without a date")] });
    // REQ-1.1.1 passes although it said not built: its queued slice goes; REQ-1.1.4 turned out of sync: it gets one;
    // REQ-1.1.2 is no longer queued, so it stays whatever the marks say
    expect(boxes(after).sort()).toEqual(["REQ-1.1.2", "REQ-1.1.4"]);
    expect(loadRun(r.gitDir, run.id)).toEqual(after);
  });
});

describe("finding the slice an agent builds", () => {
  const transcript = (r: Repo, name: string, lines: unknown[]): string => {
    const p = join(r.repo, `${name}.jsonl`);
    writeFileSync(p, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
    return p;
  };
  /** A line as Claude Code writes the first message of a subagent's transcript. */
  const first = (content: unknown) => ({ parentUuid: null, isSidechain: true, promptId: "p1", agentId: "a20201b15cc707c2c", type: "user", message: { role: "user", content }, uuid: "u1", timestamp: "2026-11-18T10:00:00.000Z", userType: "external", entrypoint: "cli", cwd: "/work", sessionId: "s1", version: "2.1.0", gitBranch: "headcanon/build" });
  const answer = { parentUuid: "u1", isSidechain: true, agentId: "a20201b15cc707c2c", type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Reading the brief." }] }, uuid: "u2" };

  it("reads the marker line", () => {
    expect(BRIEF_MARKER).toBe("headcanon-run:");
    expect(markerOf("headcanon-run: 20261118T100000-ab12 slice: REQ-1.1.1\n\n# Ledgerline\n")).toEqual({ run: "20261118T100000-ab12", box: "REQ-1.1.1" });
    expect(markerOf("\n\n  headcanon-run: r1 slice: REQ-2\r\nmore")).toEqual({ run: "r1", box: "REQ-2" });
    expect(markerOf("# Ledgerline\nheadcanon-run: r1 slice: REQ-2\n")).toBeUndefined();
    expect(markerOf("headcanon-run: r1")).toBeUndefined();
    expect(markerOf("")).toBeUndefined();
  });

  it("finds it by the marker on the first line of the first user message, the content a string or blocks", () => {
    const r = ledgerline();
    const run = createRun(r.gitDir, loadCanon(r.canonDir), ["REQ-1"], false, "b", "m");
    const brief = `headcanon-run: ${run.id} slice: REQ-1.1.2\n\n# Ledgerline\n\nWhat the product is.\n`;
    const asString = sliceOfAgent(r.gitDir, "unknown-agent", transcript(r, "string", [first(brief), answer]));
    expect(asString?.run.id).toBe(run.id);
    expect(asString?.slice.box).toBe("REQ-1.1.2");
    const asBlocks = sliceOfAgent(r.gitDir, undefined, transcript(r, "blocks", [first([{ type: "text", text: brief }]), answer]));
    expect(asBlocks?.slice.box).toBe("REQ-1.1.2");
  });

  it("finds it by agent id in the active run, before any transcript is read", () => {
    const r = ledgerline();
    const run = createRun(r.gitDir, loadCanon(r.canonDir), ["REQ-1"], false, "b", "m");
    updateSlice(r.gitDir, run.id, "REQ-1.1.1", { status: "building", agent: "agent-7" });
    expect(sliceOfAgent(r.gitDir, "agent-7", undefined)?.slice.box).toBe("REQ-1.1.1");
    expect(sliceOfAgent(r.gitDir, "agent-7", join(r.repo, "no-such-file.jsonl"))?.slice.box).toBe("REQ-1.1.1");
    expect(sliceOfAgent(r.gitDir, "agent-8", undefined)).toBeUndefined();
  });

  it("finds nothing for an agent that is not an implementation agent of a run", () => {
    const r = ledgerline();
    const run = createRun(r.gitDir, loadCanon(r.canonDir), ["REQ-1"], false, "b", "m");
    const marker = `headcanon-run: ${run.id} slice: REQ-1.1.2`;
    expect(sliceOfAgent(r.gitDir, undefined, undefined)).toBeUndefined();
    expect(sliceOfAgent(r.gitDir, undefined, join(r.repo, "no-such-file.jsonl"))).toBeUndefined();
    expect(sliceOfAgent(r.gitDir, undefined, transcript(r, "reviewer", [first("Review the set under REQ-1.1 and record your verdict."), answer]))).toBeUndefined();
    // the marker quoted lower in the message, or in a later message, is not a brief
    expect(sliceOfAgent(r.gitDir, undefined, transcript(r, "quoted", [first(`Check this brief:\n${marker}\n`), answer]))).toBeUndefined();
    expect(sliceOfAgent(r.gitDir, undefined, transcript(r, "later", [first("Summarise the run."), answer, first(marker)]))).toBeUndefined();
    expect(sliceOfAgent(r.gitDir, undefined, transcript(r, "other-run", [first("headcanon-run: no-such-run slice: REQ-1.1.2\n")]))).toBeUndefined();
    expect(sliceOfAgent(r.gitDir, undefined, transcript(r, "other-box", [first(`headcanon-run: ${run.id} slice: REQ-2.1.1\n`)]))).toBeUndefined();
    writeFileSync(join(r.repo, "garbage.jsonl"), "not json at all\n{ torn\n");
    expect(sliceOfAgent(r.gitDir, undefined, join(r.repo, "garbage.jsonl"))).toBeUndefined();
  });
});

describe("headcanon run", () => {
  it("reads words and flags from a command line", () => {
    expect(flagsOf(["slice", "REQ-1.1.1", "review", "--summary", "Entries now need a date.", "--agent=a1", "--json", "--single"])).toEqual({ words: ["slice", "REQ-1.1.1", "review"], flags: { summary: "Entries now need a date.", agent: "a1", json: true, single: true } });
    expect(flagsOf(["-", "--note"])).toEqual({ words: ["-"], flags: { note: true } });
  });

  it("start prepares the build branch, creates the run and says what will run", async () => {
    const r = ledgerline();
    const { ctx, out, err } = ctxOf(r);
    expect(await runCli(["start", "REQ-1", "REQ-2"], ctx)).toBe(0);
    expect(err).toEqual([]);
    expect(approve.prepareBuild).toHaveBeenCalledWith(r.repo, r.canonDir);
    const run = activeRun(r.gitDir)!;
    expect(run).toMatchObject({ scope: ["REQ-1", "REQ-2"], single: false, branch: "headcanon/build", base: "main" });
    expect(stepOf(run, "prepare")).toMatchObject({ status: "done", note: "branch headcanon/build, canon committed in abc1234" });
    const said = out.join("");
    expect(said).toContain(`Run ${run.id}: running. Branch headcanon/build.`);
    expect(said).toContain("REQ-2.1.1 A closed month keeps its totals: queued");
    // eight boxes carry a check, three of them red; of the five left only REQ-1.1.4 is built
    expect(said).toContain("In scope: 5 box(es) with a check. To test: 5. To build: 4. To align: 0. Left out because they need the person: 3.");
  });

  it("start --single --json answers the run and the counts as JSON", async () => {
    const r = ledgerline();
    const { ctx, out } = ctxOf(r);
    expect(await runCli(["start", "REQ-1.1.1", "--single", "--json"], ctx)).toBe(0);
    const answer = JSON.parse(out.join("")) as { run: Run; counts: Record<string, number> };
    expect(answer.run.single).toBe(true);
    expect(boxes(answer.run)).toEqual(["REQ-1.1.1"]);
    expect(answer.counts).toEqual({ measurable: 1, toTest: 1, toBuild: 1, toAlign: 0, leftOut: 0 });
  });

  it("start refuses an unknown box, a scope with nothing to build, a second run, and a branch that could not be prepared", async () => {
    const r = ledgerline();
    const { ctx, err } = ctxOf(r);
    expect(await runCli(["start", "REQ-7"], ctx)).toBe(1);
    expect(err.join("")).toContain("no box REQ-7");
    expect(await runCli(["start", "REQ-2.1.2"], ctx)).toBe(1);
    expect(err.join("")).toContain("1 box(es) wait on the person");
    expect(approve.prepareBuild).not.toHaveBeenCalled();
    approve.prepareBuild.mockImplementationOnce(() => ({ ok: false, branch: "headcanon/build", base: "", error: "the tree has changes that are not committed" }));
    expect(await runCli(["start", "REQ-1"], ctx)).toBe(1);
    expect(err.join("")).toContain("the tree has changes that are not committed");
    expect(activeRun(r.gitDir)).toBeUndefined();
    expect(await runCli(["start", "REQ-1"], ctx)).toBe(0);
    expect(await runCli(["start", "REQ-2"], ctx)).toBe(1);
    expect(err.join("")).toMatch(/run \S+ is still running/);
  });

  it("needs a git repository, and answers a usage line for a command it does not know", async () => {
    const r = ledgerline();
    const { ctx, err } = ctxOf(r);
    expect(await runCli([], ctx)).toBe(2);
    expect(await runCli(["launch"], ctx)).toBe(2);
    expect(err.join("")).toContain("usage: headcanon run");
    expect(await runCli(["status"], { ...ctx, gitDir: undefined })).toBe(1);
    expect(await runCli(["step", "build", "running"], ctx)).toBe(1); // no run is active
  });

  it("status shows the active run, or the last one, or that there is none", async () => {
    const r = ledgerline();
    const a = ctxOf(r);
    expect(await runCli(["status"], a.ctx)).toBe(0);
    expect(a.out.join("")).toBe("No run yet.\n");
    const run = createRun(r.gitDir, loadCanon(r.canonDir), ["REQ-1"], false, "headcanon/build", "main");
    const b = ctxOf(r);
    expect(await runCli(["status", "--json"], b.ctx)).toBe(0);
    expect((JSON.parse(b.out.join("")) as { run: Run }).run.id).toBe(run.id);
    saveRun(r.gitDir, { ...run, status: "stopped" });
    const c = ctxOf(r);
    expect(await runCli(["status"], c.ctx)).toBe(0);
    expect(c.out.join("")).toContain(`Run ${run.id}: stopped.`);
  });

  it("step sets a step with its note; first-run done records what passes and refreshes the slices", async () => {
    const r = ledgerline();
    const run = createRun(r.gitDir, loadCanon(r.canonDir), ["REQ-1"], false, "b", "m");
    const { ctx, out, err } = ctxOf(r);
    expect(await runCli(["step", "tests", "running", "--note", "writing tests for REQ-1.1"], ctx)).toBe(0);
    expect(stepOf(loadRun(r.gitDir, run.id)!, "tests")).toMatchObject({ status: "running", note: "writing tests for REQ-1.1" });
    expect(out.join("")).toContain("tests: running (writing tests for REQ-1.1)");
    expect(await runCli(["step", "tests", "finished"], ctx)).toBe(2);
    expect(await runCli(["step", "polish", "done"], ctx)).toBe(2);
    expect(err.join("")).toContain("usage: headcanon run");
    record(r, [entry("ddddd2", "lists the oldest entry first", "tests/list.test.js")], [result("ddddd2", "lists the oldest entry first", "tests/list.test.js", "failed")]);
    expect(await runCli(["step", "first-run", "done"], ctx)).toBe(0);
    const after = loadRun(r.gitDir, run.id)!;
    expect(after.firstRun).toEqual({ passing: [] });
    expect(boxes(after)).toContain("REQ-1.1.4");
  });

  it("step first-run done gives a box the first run showed out of sync its slice before the run can end", async () => {
    const r = ledgerline();
    const run = createRun(r.gitDir, loadCanon(r.canonDir), ["REQ-1.1.4"], true, "b", "m");
    expect(run.slices).toEqual([]);
    for (const name of ["prepare", "readiness", "tests"] as const) setStep(r.gitDir, run.id, name, "done");
    record(r, [entry("ddddd2", "lists the oldest entry first", "tests/list.test.js")], [result("ddddd2", "lists the oldest entry first", "tests/list.test.js", "failed")]);
    const { ctx } = ctxOf(r);
    expect(await runCli(["step", "first-run", "done"], ctx)).toBe(0);
    const after = loadRun(r.gitDir, run.id)!;
    expect(after.status).toBe("running");
    expect(after.slices.map((s) => `${s.box}:${s.status}`)).toEqual(["REQ-1.1.4:queued"]);
    expect(stepOf(after, "first-run").status).toBe("done");
    expect(stepOf(after, "build").status).toBe("waiting");
  });

  it("slice building names the agent, fixes where its commits begin and gives a fresh start the whole budget", async () => {
    const r = ledgerline();
    writeFileSync(join(r.repo, "ledger.txt"), "entries\n");
    execFileSync("git", ["add", "ledger.txt"], { cwd: r.repo, stdio: "ignore" });
    execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.com", "commit", "-q", "-m", "seed"], { cwd: r.repo });
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: r.repo, encoding: "utf8" }).trim();
    const run = createRun(r.gitDir, loadCanon(r.canonDir), ["REQ-1"], false, "b", "m");
    updateSlice(r.gitDir, run.id, "REQ-1.1.1", { attempts: 2, lastFailing: ["an old failure"] });
    const { ctx, out } = ctxOf(r);
    expect(await runCli(["slice", "REQ-1.1.1", "building", "--agent", "agent-7"], ctx)).toBe(0);
    expect(loadRun(r.gitDir, run.id)!.slices[0]).toMatchObject({ status: "building", agent: "agent-7", agentName: "implementer-REQ-1.1.1", baseSha: head, attempts: 0, lastFailing: [] });
    expect(out.join("")).toContain("REQ-1.1.1 An entry carries a date and an amount: building");
    expect(await runCli(["slice", "REQ-1.1.1", "review", "--summary", "Entries now need a date and an amount."], ctx)).toBe(0);
    expect(loadRun(r.gitDir, run.id)!.slices[0]).toMatchObject({ status: "review", summary: "Entries now need a date and an amount.", baseSha: head });
    expect(await runCli(["slice", "REQ-1.1.1", "finished"], ctx)).toBe(2);
    expect(await runCli(["slice", "REQ-2.1.1", "building"], ctx)).toBe(1); // not a slice of this run
  });

  it("stop ends the run and the slices still being worked", async () => {
    const r = ledgerline();
    const run = createRun(r.gitDir, loadCanon(r.canonDir), ["REQ-1"], false, "b", "m");
    updateSlice(r.gitDir, run.id, "REQ-1.1.1", { status: "review" });
    const { ctx, out } = ctxOf(r);
    expect(await runCli(["stop"], ctx)).toBe(0);
    expect(out.join("")).toBe(`Run ${run.id} stopped.\n`);
    const after = loadRun(r.gitDir, run.id)!;
    expect(after.status).toBe("stopped");
    expect(after.endedAt).toBeTruthy();
    expect(after.slices.map((s) => s.status)).toEqual(["review", "stopped"]);
    expect(activeRun(r.gitDir)).toBeUndefined();
    expect(await runCli(["stop"], ctx)).toBe(1);
  });

  it("check reruns what the slice owes and what passed before, lists the commits, and marks a passing slice as passed, for the session to put before the person with its summary", async () => {
    const r = ledgerline();
    record(r, [entry("aaaaa2", "refuses an entry without a date", "tests/entry.test.js"), entry("ddddd2", "lists the oldest entry first", "tests/list.test.js")], []);
    const run = createRun(r.gitDir, loadCanon(r.canonDir), ["REQ-1.1.1"], true, "headcanon/build", "main");
    saveRun(r.gitDir, { ...loadRun(r.gitDir, run.id)!, firstRun: { passing: [title("ddddd2", "lists the oldest entry first")] } });
    updateSlice(r.gitDir, run.id, "REQ-1.1.1", { status: "building", baseSha: "base000" });
    ran.runTests.mockImplementation(() => ({ at: "now", tree: treeDigest(r.repo), runs: [], results: [result("aaaaa2", "refuses an entry without a date", "tests/entry.test.js", "passed"), result("ddddd2", "lists the oldest entry first", "tests/list.test.js", "passed")] }));
    approve.sliceCommits.mockImplementation(() => [{ sha: "c0ffee1234567", subject: "feat(entries): an entry needs a date", ok: true, errors: [] }]);
    const { ctx, out } = ctxOf(r);
    expect(await runCli(["check", "REQ-1.1.1"], ctx)).toBe(0);
    expect(ran.runTests).toHaveBeenCalledWith(r.canonDir, { boxes: ["aaaaa2", "ddddd2"] });
    expect(approve.sliceCommits).toHaveBeenCalledWith(r.repo, "base000");
    const said = out.join("");
    expect(said).toContain("REQ-1.1.1 An entry carries a date and an amount: pass");
    expect(said).toContain("Tests: 1 passing, 0 not passing.");
    expect(said).toContain("c0ffee1 feat(entries): an entry needs a date: in the intent format");
    expect(said).toContain("Tree: clean.");
    expect(loadRun(r.gitDir, run.id)!.slices[0]).toMatchObject({ status: "passed", lastFailing: [] });
  });

  it("check says what fails and leaves the slice as it was", async () => {
    const r = ledgerline();
    record(r, [entry("aaaaa2", "refuses an entry without a date", "tests/entry.test.js")], []);
    const run = createRun(r.gitDir, loadCanon(r.canonDir), ["REQ-1.1.1"], true, "headcanon/build", "main");
    updateSlice(r.gitDir, run.id, "REQ-1.1.1", { status: "building" });
    writeFileSync(join(r.repo, "scratch.txt"), "left behind\n");
    ran.runTests.mockImplementation(() => ({ at: "now", tree: treeDigest(r.repo), runs: [], results: [result("aaaaa2", "refuses an entry without a date", "tests/entry.test.js", "failed", "the entry was accepted")] }));
    approve.sliceCommits.mockImplementation(() => [{ sha: "bad0000aaaaaa", subject: "wip", ok: false, errors: ['missing "Intent:" trailer'] }]);
    const { ctx, out } = ctxOf(r);
    expect(await runCli(["check", "REQ-1.1.1", "--json"], ctx)).toBe(1);
    const report = JSON.parse(out.join("")) as { verdict: string; failing: Array<{ title: string; message?: string }>; dirty: string[]; commits: Array<{ ok: boolean }>; text: string };
    expect(report.verdict).toBe("fail");
    expect(report.failing).toMatchObject([{ title: title("aaaaa2", "refuses an entry without a date"), message: "the entry was accepted" }]);
    expect(report.dirty).toEqual(["scratch.txt"]);
    expect(report.commits[0]!.ok).toBe(false);
    expect(report.text).toContain("Tree: not clean (scratch.txt).");
    expect(report.text).toContain('bad0000 wip: not in the intent format (missing "Intent:" trailer)');
    expect(loadRun(r.gitDir, run.id)!.slices[0]).toMatchObject({ status: "building", lastFailing: [title("aaaaa2", "refuses an entry without a date")] });
  });

  it("check reports a test runner that breaks as an error, never as a pass", async () => {
    const r = ledgerline();
    createRun(r.gitDir, loadCanon(r.canonDir), ["REQ-1.1.1"], true, "headcanon/build", "main");
    ran.runTests.mockImplementation(() => { throw new Error("the runner did not start"); });
    const { ctx, err } = ctxOf(r);
    expect(await runCli(["check", "REQ-1.1.1"], ctx)).toBe(1);
    expect(err.join("")).toContain("run check: the runner did not start");
    expect(readFileSync(join(runsDir(r.gitDir), `${activeRun(r.gitDir)!.id}.json`), "utf8")).toContain('"queued"');
  });
});
