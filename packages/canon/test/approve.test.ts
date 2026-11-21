import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approveCli, approveSlice, bindFromCommits, BUILD_BRANCH, commitTests, discardSlice, dropNotBuilt, prepareBuild, sliceCommits } from "../src/approve.js";
import { builtOf } from "../src/built.js";
import { parseTrailers } from "../src/commit-msg.js";
import { initCanon } from "../src/init.js";
import { loadCanon } from "../src/load.js";
import { applyOp } from "../src/ops.js";
import { loadReviewRecord, reviewDir, validateReviewRecord } from "../src/review.js";
import { loadRun, saveRun, type CliCtx, type Run, type Slice } from "../src/runs.js";
import { saveManifest, type TestEntry } from "../src/testing.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const TSX = [join(HERE, "../node_modules/tsx/dist/cli.mjs"), join(HERE, "../../../node_modules/tsx/dist/cli.mjs")].find((p) => existsSync(p))!;
const CHECK_SOURCE = pathToFileURL(join(HERE, "../src/commit-msg.ts")).href;
const CLI_SOURCE = join(HERE, "../src/cli.ts");

const sh = (cwd: string, args: string[], input?: string): string => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...(input !== undefined ? { input } : {}) });
const head = (repo: string) => sh(repo, ["rev-parse", "HEAD"]).trim();
const branch = (repo: string) => sh(repo, ["symbolic-ref", "--short", "HEAD"]).trim();
const status = (repo: string) => sh(repo, ["status", "--porcelain", "--untracked-files=all"]);
const staged = (repo: string) => sh(repo, ["diff", "--cached", "--name-only"]).trim();
const lastMessage = (repo: string, rev = "HEAD") => sh(repo, ["log", "-1", "--format=%B", rev]).trim();
const filesOf = (repo: string, rev = "HEAD") => sh(repo, ["show", "--no-renames", "--name-only", "--format=", rev]).trim().split("\n").filter(Boolean).sort();
/** A commit the way an agent makes one: through the hook. */
const commit = (repo: string, paths: string[], message: string): string => { sh(repo, ["add", "--", ...paths]); sh(repo, ["commit", "-q", "-F", "-"], message); return head(repo); };

interface Project { root: string; repo: string; canon: string; hookLog: string; hookPath: string }
const roots: string[] = [];
afterAll(() => roots.forEach((d) => rmSync(d, { recursive: true, force: true })));

/**
 * A repository with Ledgerline's code committed and its canon untracked, as adoption leaves it. The commit-msg hook
 * is the one `initCanon` installs; its launcher runs the check from this checkout's source and notes each verdict.
 */
function project(opts: { reviews?: boolean; cli?: boolean } = {}): Project {
  const root = mkdtempSync(join(tmpdir(), "headcanon-approve-"));
  roots.push(root);
  const repo = join(root, "ledgerline");
  const tools = join(root, "tools");
  mkdirSync(repo);
  mkdirSync(tools);
  sh(root, ["init", "-q", "-b", "main", repo]);
  for (const [k, v] of [["user.name", "Test Owner"], ["user.email", "owner@example.com"], ["core.autocrlf", "false"], ["commit.gpgsign", "false"]]) sh(repo, ["config", k!, v!]);

  const hookLog = join(tools, "hook.log");
  const entry = join(tools, "hook.mts");
  writeFileSync(entry, [
    `import { execFileSync } from "node:child_process";`,
    `import { appendFileSync, readFileSync } from "node:fs";`,
    `import { checkStagedCommit } from ${JSON.stringify(CHECK_SOURCE)};`,
    `const [, , command, file, , canonDir] = process.argv;`,
    `if (command !== "commit-msg") process.exit(2);`,
    `const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();`,
    `const r = checkStagedCommit(top, canonDir, readFileSync(file, "utf8"));`,
    `appendFileSync(${JSON.stringify(hookLog)}, JSON.stringify({ ok: r.ok, header: r.header, errors: r.errors }) + "\\n");`,
    `for (const e of r.errors) console.error("  - " + e);`,
    `process.exit(r.ok ? 0 : 1);`,
  ].join("\n"));
  const launcher = join(tools, "headcanon.mjs");
  writeFileSync(launcher, [
    `import { spawnSync } from "node:child_process";`,
    `const r = spawnSync(process.execPath, [${JSON.stringify(TSX)}, ${JSON.stringify(opts.cli ? CLI_SOURCE : entry)}, ...process.argv.slice(2)], { stdio: "inherit" });`,
    `process.exit(r.status ?? 1);`,
  ].join("\n"));

  const file = (rel: string, text: string) => { mkdirSync(dirname(join(repo, rel)), { recursive: true }); writeFileSync(join(repo, rel), text); };
  file("src/months.ts", "export function addEntry(month: string, amount: number): number {\n  return amount;\n}\n");
  file("package.json", JSON.stringify({ name: "ledgerline" }) + "\n");

  const init = initCanon({ repoDir: repo, cliPath: launcher });
  expect(init.hookInstalled).toBe(true);
  const node = (id: string, title: string, extra = "", body = "") => `---\nid: ${id}\n${id.includes(".") ? `parent: ${id.slice(0, id.lastIndexOf("."))}\n` : ""}title: "${title}"\nstate: assumed\n${extra}---\n\n# ${title}\n\n## Intent\n\n${title}.\n${body}`;
  const leaf = (id: string, title: string, uid: string, check: string, instead: string) => node(id, title, `layer: requirement\nkind: binary\nuid: ${uid}\n`, `\n## Check\n\n${check}\n\n## Implemented by\n\n- not built: ${instead}\n`);
  file("canon/README.md", `---\nid: ROOT\ntitle: "Ledgerline canon"\nstate: resolved\nformat: 3\n---\n\n# Ledgerline canon\n\n## Intent\n\nLedgerline keeps a small firm's books month by month.\n\n## Glossary [assumed]\n\n**entry** (\`TERM-entry\`) [assumed]: one dated line of money in or out.\n`);
  file("canon/REQ-1-books/README.md", node("REQ-1", "The books are kept by month", "layer: domain\n"));
  file("canon/REQ-1-books/REQ-1.1-closing/README.md", node("REQ-1.1", "A month can be closed", "layer: capability\n"));
  file("canon/REQ-1-books/REQ-1.1-closing/REQ-1.1.1-refuse.md", leaf("REQ-1.1.1", "A closed month refuses new entries", "aaaaaa", "An entry dated in a closed month is refused.", "entries are accepted in any month"));
  file("canon/REQ-1-books/REQ-1.1-closing/REQ-1.1.2-total.md", leaf("REQ-1.1.2", "Closing a month totals its entries", "bbbbbb", "The total of a closed month equals the sum of its entries.", "no total is kept"));
  file("canon/REQ-1-books/REQ-1.1-closing/REQ-1.1.3-reopen.md", leaf("REQ-1.1.3", "A closed month can be reopened", "cccccc", "A reopened month accepts entries again.", "a month cannot be closed yet"));
  file("canon/REQ-2-statements.md", node("REQ-2", "Statements are printed per month", "layer: domain\n"));
  file("canon/journeys/JRN-1-close.md", `---\nid: JRN-1\ntitle: "Closing March"\nstate: assumed\n---\n\n# Closing March\n\n| Step | Requirements |\n|---|---|\n| S1 Close the month | REQ-1.1.2 |\n| S2 Try a late entry | REQ-1.1.1 |\n`);

  const hookPath = init.hookPath!;
  commit(repo, ["src", "package.json"], "chore: start Ledgerline\n\nIntent: none (the project before its canon)\n");
  if (opts.reviews !== false) {
    // adoption's reviews as the reviewer records them: one set passes, one fails and is corrected without a second review
    expect(applyOp(join(repo, "canon"), { op: "review", id: "REQ-1", verdict: "pass" }, { by: "reviewer-REQ-1" }).ok).toBe(true);
    expect(applyOp(join(repo, "canon"), { op: "review", id: "REQ-1.1", verdict: "fail", findings: [{ check: "decidable", child: "REQ-1.1.2", text: "the check names no way to observe the total" } as { check: string; text: string }] }, { by: "reviewer-REQ-1.1" }).ok).toBe(true);
    expect(applyOp(join(repo, "canon"), { op: "reword", id: "REQ-1.1.2", from: "equals the sum of its entries", to: "shown on the month's page equals the sum of its entries" }, { by: "refiner-REQ-1.1" }).ok).toBe(true);
  }
  return { root, repo, canon: join(repo, "canon"), hookLog, hookPath };
}

const hookVerdicts = (p: Project): Array<{ ok: boolean; header: string; errors: string[] }> => (existsSync(p.hookLog) ? readFileSync(p.hookLog, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const trailersOf = (repo: string, rev = "HEAD") => parseTrailers(lastMessage(repo, rev));

const slice = (node: string, uid: string, title: string, commits: string[], extra: Partial<Slice> = {}): Slice => ({ node, uid, title, status: "review", owes: [uid], attempts: 0, lastFailing: [], commits, issues: [], ...extra });
const runOf = (slices: Slice[]): Run => ({ id: "run-1", startedAt: new Date().toISOString(), scope: slices.map((s) => s.node), single: slices.length === 1, branch: BUILD_BRANCH, base: "main", status: "review", steps: [], slices });

describe("the commits HeadCanon makes itself [REQ-8.5]", { timeout: 180_000 }, () => {
  let p: Project;
  let first: string;
  beforeAll(() => { p = project(); first = head(p.repo); }, 120_000);

  it("the installed hook is in force: a canon commit without a review record is refused", () => {
    sh(p.repo, ["add", "canon"]);
    let refused = "";
    try { sh(p.repo, ["commit", "-q", "-F", "-"], "docs(canon): adopt\n\nIntent: none (the canon itself)\n"); } catch (e) { refused = String((e as { stderr?: string }).stderr); }
    expect(refused).toMatch(/no intent review is recorded/);
    sh(p.repo, ["reset", "-q"]);
    expect(head(p.repo)).toBe(first);
    expect(hookVerdicts(p).at(-1)).toMatchObject({ ok: false });
  });

  it("makes the build branch from a branch whose canon is untracked and commits the canon there, through the hook", () => {
    const checkedBefore = hookVerdicts(p).length;
    const r = prepareBuild(p.repo, p.canon);
    expect(r).toMatchObject({ ok: true, branch: "headcanon/build", base: "main" });
    expect(r.canonCommit).toBe(head(p.repo));
    expect(branch(p.repo)).toBe("headcanon/build");
    expect(sh(p.repo, ["rev-parse", "main"]).trim()).toBe(first);
    expect(status(p.repo)).toBe("");
    expect(filesOf(p.repo)).toContain("canon/REQ-1-books/REQ-1.1-closing/REQ-1.1.2-total.md");

    const t = trailersOf(p.repo);
    expect(lastMessage(p.repo).split("\n")[0]).toBe("docs(canon): record the canon as it stands");
    expect(t["Intent"]).toEqual(["none (the canon itself, no code)"]);
    expect(t["Intent-Change"]).toEqual(["create ROOT"]);
    expect(t["Approved-By"]?.[0]).toMatch(/^pending \(/);
    const [hash, ...outcome] = t["Intent-Review"]![0]!.split(", ");
    expect(outcome.join(", ")).toBe("adoption reviews: 1 set passed, 1 failed, 1 not reviewed, 2 entries outside the sets");

    // the record is what the operations log holds, and the hook accepted the commit on it
    const record = loadReviewRecord(p.repo, hash!)!;
    expect(record.adoption).toEqual({ passed: 1, failed: 1, changed: 0, unreviewed: 1 });
    expect(record.findings.map((f) => `${f.kind}:${f.nodes.join("+")}`)).toEqual(["quality:REQ-1.1+REQ-1.1.2", "unreviewed:ROOT", "unreviewed:JRN-1+ROOT"]);
    expect(record.findings[0]!.summary).toBe("decidable: the check names no way to observe the total");
    expect(record.findings[0]!.resolution).toMatch(/^changed by 1 operation after the review and not reviewed again; left as written/);
    expect(validateReviewRecord(record, { hash: hash!, affectedParents: [] })).toEqual([]);
    const verdicts = hookVerdicts(p);
    expect(verdicts.length).toBe(checkedBefore + 1);
    expect(verdicts.at(-1)).toEqual({ ok: true, header: "docs(canon): record the canon as it stands", errors: [] });
  });

  it("a second call finds the branch already there and has nothing to commit", () => {
    const at = head(p.repo);
    expect(prepareBuild(p.repo, p.canon)).toEqual({ ok: true, branch: "headcanon/build", base: "main" });
    expect(head(p.repo)).toBe(at);
    // from the base branch, with the build branch ahead of it: the call switches to the branch and keeps its base
    sh(p.repo, ["checkout", "-q", "main"]);
    expect(prepareBuild(p.repo, p.canon)).toEqual({ ok: true, branch: "headcanon/build", base: "main" });
    expect(branch(p.repo)).toBe("headcanon/build");
    expect(head(p.repo)).toBe(at);
  });

  it("commits the accepted tests with the record of tests, and names a rewritten test in a Test-Change", () => {
    const entry = (node: string, id: string, file: string, status: TestEntry["status"]): TestEntry => ({ node, id, runner: "unit", kind: "unit", file, title: `closing [hc:${node}]`, description: "Closes March and checks what the month then accepts.", pin: "pin", status, at: new Date().toISOString() });
    for (const f of ["tests/refuse.test.ts", "tests/total.test.ts", "tests/draft.test.ts"]) { mkdirSync(join(p.repo, "tests"), { recursive: true }); writeFileSync(join(p.repo, f), `// ${f}\n`); }
    saveManifest(p.canon, { runners: { unit: { kind: "unit", command: "node --test {files}", format: "junit" } }, tests: [entry("aaaaaa", "REQ-1.1.1", "tests/refuse.test.ts", "accepted"), entry("bbbbbb", "REQ-1.1.2", "tests/total.test.ts", "accepted"), entry("cccccc", "REQ-1.1.3", "tests/draft.test.ts", "proposed")] });

    const r = commitTests(p.repo, p.canon, []);
    expect(r.ok).toBe(true);
    expect(r.sha).toBe(head(p.repo));
    expect(filesOf(p.repo)).toEqual(["canon/tests.json", "tests/refuse.test.ts", "tests/total.test.ts"]);
    const t = trailersOf(p.repo);
    expect(lastMessage(p.repo).split("\n")[0]).toBe("test: record the accepted tests of 2 nodes");
    expect(t["Intent"]).toEqual(["REQ-1.1.1, REQ-1.1.2"]);
    expect(Object.keys(t).sort()).toEqual(["Intent"]);
    expect(status(p.repo)).toBe("?? tests/draft.test.ts\n");
    expect(commitTests(p.repo, p.canon, [])).toEqual({ ok: true });

    writeFileSync(join(p.repo, "tests/refuse.test.ts"), "// tests/refuse.test.ts, a second form\n");
    const again = commitTests(p.repo, p.canon, ["REQ-1.1.1"]);
    expect(again.ok).toBe(true);
    expect(filesOf(p.repo)).toEqual(["tests/refuse.test.ts"]);
    const t2 = trailersOf(p.repo);
    expect(t2["Intent"]).toEqual(["REQ-1.1.1"]);
    expect(t2["Test-Change"]?.[0]).toMatch(/^tests\/refuse\.test\.ts rewritten/);
    expect(t2["Approved-By"]?.[0]).toMatch(/^pending \(/);
    expect(hookVerdicts(p).slice(-2).every((v) => v.ok)).toBe(true);
    expect(commitTests(p.repo, p.canon, ["REQ-1.1.3"])).toMatchObject({ ok: false, error: "no accepted test is recorded for REQ-1.1.3" });
  });

  let base: string;
  let built: string;
  it("lists a slice's commits and flags the one without an Intent trailer", () => {
    base = head(p.repo);
    writeFileSync(join(p.repo, "src/months.ts"), readFileSync(join(p.repo, "src/months.ts"), "utf8") + "\nconst closed = new Set<string>();\n\nexport function closeMonth(month: string): void {\n  closed.add(month);\n}\n");
    built = commit(p.repo, ["src/months.ts"], "feat(months): close a month\n\nA closed month is remembered.\n\nIntent: REQ-1.1.1\n");
    // an agent that went around the hook: the gate reads this list to catch it
    writeFileSync(join(p.repo, "notes.txt"), "left over\n");
    sh(p.repo, ["add", "notes.txt"]);
    sh(p.repo, ["commit", "-q", "--no-verify", "-m", "wip"]);
    const stray = head(p.repo);

    const list = sliceCommits(p.repo, base);
    expect(list.map((c) => [c.sha, c.subject, c.ok])).toEqual([[built, "feat(months): close a month", true], [stray, "wip", false]]);
    expect(list[1]!.errors.join("\n")).toMatch(/missing "Intent:" trailer/);
    expect(sliceCommits(p.repo, "main").length).toBe(5);
    expect(sliceCommits(p.repo, "no-such-rev")).toEqual([]);
    sh(p.repo, ["commit", "-q", "--no-verify", "--allow-empty", "-m", "feat: x\n\nIntent: REQ-9.9"]);
    expect(sliceCommits(p.repo, stray)[0]).toMatchObject({ ok: true });
    expect(sliceCommits(p.repo, stray, p.canon)[0]).toMatchObject({ ok: false, errors: ["Intent REQ-9.9 does not exist in the canon"] });
  });

  const nodeFile = () => join(p.canon, "REQ-1-books/REQ-1.1-closing/REQ-1.1.1-refuse.md");
  it("a refused approval leaves the node, the index and the branch as they were", () => {
    const run = runOf([slice("REQ-1.1.1", "aaaaaa", "A closed month refuses new entries", [built])]);
    const text = readFileSync(nodeFile(), "utf8");
    const at = head(p.repo);
    const before = status(p.repo);
    expect(approveSlice(p.repo, p.canon, run, "REQ-1.1.1", " ")).toMatchObject({ ok: false, error: "an approval carries the name of the user who approves" });
    expect(approveSlice(p.repo, p.canon, run, "REQ-7", "Test Owner")).toMatchObject({ ok: false, error: "REQ-7 is not part of run run-1" });
    expect(approveSlice(p.repo, p.canon, { ...run, branch: "main" }, "REQ-1.1.1", "Test Owner").error).toMatch(/switch to main first/);

    // the hook says no after the node was bound: the bind and the dropped line are taken back
    const hook = readFileSync(p.hookPath, "utf8");
    writeFileSync(p.hookPath, "#!/bin/sh\necho 'the hook says no' >&2\nexit 1\n");
    const r = approveSlice(p.repo, p.canon, run, "REQ-1.1.1", "Test Owner");
    writeFileSync(p.hookPath, hook);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/the hook says no/);
    expect(readFileSync(nodeFile(), "utf8")).toBe(text);
    expect(staged(p.repo)).toBe("");
    expect(status(p.repo)).toBe(before);
    expect(head(p.repo)).toBe(at);
  });

  it("an approved slice binds what its commits wrote, drops the not-built line and commits the canon change with Approved-By", () => {
    const run = runOf([slice("REQ-1.1.1", "aaaaaa", "A closed month refuses new entries", [built], { summary: "Months can be closed,\nand a closed month is remembered." })]);
    expect(builtOf(loadCanon(p.canon).nodes["REQ-1.1.1"]!).built).toBe("not-built");
    const r = approveSlice(p.repo, p.canon, run, "aaaaaa", "Test Owner");
    expect(r.ok).toBe(true);
    expect(r.sha).toBe(head(p.repo));

    const node = loadCanon(p.canon).nodes["REQ-1.1.1"]!;
    expect(node.binds).toEqual([{ relation: "implements", unit: "src/months.ts#closeMonth" }]);
    expect(node.body).not.toMatch(/not built/);
    expect(node.body).not.toMatch(/Implemented by/);
    expect(builtOf(node)).toMatchObject({ built: "built", implements: ["src/months.ts#closeMonth"], note: undefined });

    expect(filesOf(p.repo)).toEqual(["canon/REQ-1-books/REQ-1.1-closing/REQ-1.1.1-refuse.md"]);
    const message = lastMessage(p.repo);
    expect(message.split("\n")[0]).toBe("docs(canon): record REQ-1.1.1 as built");
    expect(message).toContain("Months can be closed, and a closed month is remembered.");
    // the bind and the dropped section are five changed lines, so the hook asks for a review: the record says what the log holds of the node's set
    const t = trailersOf(p.repo);
    expect(t).toEqual({ Intent: ["REQ-1.1.1"], "Intent-Change": ["update REQ-1.1.1"], "Intent-Review": [expect.stringMatching(/^[0-9a-f]{12}, adoption reviews: 1 failed$/)], "Approved-By": ["Test Owner"] });
    const record = loadReviewRecord(p.repo, t["Intent-Review"]![0]!.slice(0, 12))!;
    expect(record.parents).toEqual([{ id: "REQ-1.1", reason: expect.stringMatching(/^its children failed the review of \d{4}-\d{2}-\d{2}; the parent is left as it is/) }]);
    expect(hookVerdicts(p).at(-1)).toMatchObject({ ok: true, header: "docs(canon): record REQ-1.1.1 as built" });
    expect(staged(p.repo)).toBe("");
    // approved again, there is nothing left to commit
    expect(approveSlice(p.repo, p.canon, run, "REQ-1.1.1", "Test Owner")).toEqual({ ok: true });
  });

  it("an approval carries the assumption the slice's own agent added, with a review record that says no review covers it", () => {
    mkdirSync(join(p.repo, "styles"), { recursive: true });
    writeFileSync(join(p.repo, "styles/month.css"), ".total { font-weight: bold; }\n");
    const css = commit(p.repo, ["styles/month.css"], "feat(months): show the total of a closed month\n\nIntent: REQ-1.1.2\n");
    const made = applyOp(p.canon, { op: "create", under: "REQ-1.1.2", title: "The total is shown in bold", intent: "The total of a closed month is set in bold on its page.", layer: "requirement", kind: "binary", check: "The total of a closed month is bold.", source: "builder" }, { by: "implementer-REQ-1.1.2" });
    expect(made.ok).toBe(true);
    // a change no slice made stays out of the approval
    writeFileSync(join(p.canon, "REQ-2-statements.md"), readFileSync(join(p.canon, "REQ-2-statements.md"), "utf8") + "\nA note the owner typed on the page.\n");

    const r = approveSlice(p.repo, p.canon, runOf([slice("REQ-1.1.2", "bbbbbb", "Closing a month totals its entries", [css])]), "REQ-1.1.2", "Test Owner");
    expect(r.ok).toBe(true);
    const canon = loadCanon(p.canon);
    // a stylesheet holds no unit the code tree knows: the file itself is where the node is built
    expect(canon.nodes["REQ-1.1.2"]!.binds).toEqual([{ relation: "implements", unit: "styles/month.css" }]);
    expect(canon.nodes[made.id!]!.state).toBe("assumed");
    const t = trailersOf(p.repo);
    expect(t["Intent"]).toEqual(["REQ-1.1.2"]);
    expect(t["Intent-Change"]!.sort()).toEqual(["create REQ-1.1.2.1", "update REQ-1.1.2"]);
    expect(t["Approved-By"]).toEqual(["Test Owner"]);
    expect(t["Intent-Review"]![0]).toMatch(/^[0-9a-f]{12}, adoption reviews: 1 failed, 1 not reviewed$/);
    const record = loadReviewRecord(p.repo, t["Intent-Review"]![0]!.slice(0, 12))!;
    expect(record.findings.find((f) => f.kind === "unreviewed")).toMatchObject({ nodes: ["REQ-1.1.2"], summary: "the operations log holds no review verdict for the children of these nodes" });
    expect(status(p.repo)).toBe(" M canon/REQ-2-statements.md\n?? tests/draft.test.ts\n");
    sh(p.repo, ["checkout", "-q", "--", "canon/REQ-2-statements.md"]);
  });

  it("a discarded slice has its two commits reverted, newest first, in one commit in the intent format", () => {
    const months = readFileSync(join(p.repo, "src/months.ts"), "utf8");
    writeFileSync(join(p.repo, "src/reopen.ts"), "export function reopenMonth(month: string): string {\n  return month;\n}\n");
    writeFileSync(join(p.repo, "src/calendar.ts"), "export const months = 12;\n");
    const one = commit(p.repo, ["src/reopen.ts", "src/calendar.ts"], "feat(months): reopen a month\n\nIntent: REQ-1.1.3\n");
    writeFileSync(join(p.repo, "src/months.ts"), months + "\nexport function isClosed(month: string): boolean {\n  return closed.has(month);\n}\n");
    writeFileSync(join(p.repo, "src/reopen.ts"), "export function reopenMonth(month: string): string {\n  return month.trim();\n}\n");
    const two = commit(p.repo, ["src/months.ts", "src/reopen.ts"], "feat(months): ask whether a month is closed\n\nIntent: REQ-1.1.3\n");
    const run = runOf([slice("REQ-1.1.3", "cccccc", "A closed month can be reopened", [one, two])]);

    // a file only the older commit touched has work not yet committed: the newer commit reverts, the older cannot,
    // and the revert that was begun is taken back whole
    const committed = { months: readFileSync(join(p.repo, "src/months.ts"), "utf8"), reopen: readFileSync(join(p.repo, "src/reopen.ts"), "utf8") };
    writeFileSync(join(p.repo, "src/calendar.ts"), "// someone is still typing here\n");
    const before = status(p.repo);
    const refused = discardSlice(p.repo, p.canon, run, "REQ-1.1.3");
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/calendar\.ts/);
    expect(head(p.repo)).toBe(two);
    expect(status(p.repo)).toBe(before);
    expect(staged(p.repo)).toBe("");
    expect(readFileSync(join(p.repo, "src/calendar.ts"), "utf8")).toBe("// someone is still typing here\n");
    expect(readFileSync(join(p.repo, "src/months.ts"), "utf8")).toBe(committed.months);
    expect(readFileSync(join(p.repo, "src/reopen.ts"), "utf8")).toBe(committed.reopen);
    expect(existsSync(join(p.repo, ".git/sequencer"))).toBe(false);
    sh(p.repo, ["checkout", "-q", "--", "src/calendar.ts"]);

    expect(discardSlice(p.repo, p.canon, run, "REQ-1.1.3")).toEqual({ ok: true });
    expect(existsSync(join(p.repo, "src/reopen.ts"))).toBe(false);
    expect(existsSync(join(p.repo, "src/calendar.ts"))).toBe(false);
    expect(readFileSync(join(p.repo, "src/months.ts"), "utf8")).toBe(months);
    expect(sh(p.repo, ["rev-list", "--count", `${two}..HEAD`]).trim()).toBe("1");
    const message = lastMessage(p.repo);
    expect(message.split("\n")[0]).toBe("revert: discard what was built for REQ-1.1.3");
    expect(message.indexOf(two.slice(0, 7))).toBeLessThan(message.indexOf(one.slice(0, 7)));
    expect(trailersOf(p.repo)).toEqual({ Intent: ["REQ-1.1.3"] });
    expect(hookVerdicts(p).at(-1)).toMatchObject({ ok: true, header: "revert: discard what was built for REQ-1.1.3" });
    expect(status(p.repo)).toBe("?? tests/draft.test.ts\n");
    expect(existsSync(join(p.repo, ".git/REVERT_HEAD"))).toBe(false);
    expect(existsSync(join(p.repo, ".git/sequencer"))).toBe(false);
    expect(discardSlice(p.repo, p.canon, runOf([slice("REQ-1.1.3", "cccccc", "A closed month can be reopened", [])]), "REQ-1.1.3")).toEqual({ ok: true });
  });

  it("every commit HeadCanon made here went through the hook and none was refused", () => {
    const made = sh(p.repo, ["log", "--format=%s", `${first}..HEAD`]).trim().split("\n");
    const ours = made.filter((s) => /^(docs\(canon\): record|test: record|revert: discard)/.test(s));
    expect(ours.length).toBe(6);
    const passed = hookVerdicts(p).filter((v) => v.ok).map((v) => v.header);
    for (const subject of ours) expect(passed).toContain(subject);
  });
});

describe("a build that cannot be prepared leaves the repository as it was", { timeout: 120_000 }, () => {
  const snapshot = (p: Project) => ({ head: head(p.repo), branch: branch(p.repo), status: status(p.repo), staged: staged(p.repo), branches: sh(p.repo, ["branch", "--list"]), base: (() => { try { return sh(p.repo, ["config", "--get", "branch.headcanon/build.headcanon-base"]); } catch { return ""; } })(), records: existsSync(reviewDir(p.repo)) });

  it("refuses a canon the operations log holds no review of", () => {
    const p = project({ reviews: false });
    const before = snapshot(p);
    const r = prepareBuild(p.repo, p.canon);
    expect(r).toMatchObject({ ok: false, branch: "headcanon/build", base: "main" });
    expect(r.error).toMatch(/holds no review of any node in this canon/);
    expect(snapshot(p)).toEqual(before);
    expect(hookVerdicts(p).length).toBe(1);
  });

  it("refuses when something outside the canon is already staged, and when no branch is checked out", () => {
    const p = project();
    writeFileSync(join(p.repo, "src/months.ts"), "export const nothing = 0;\n");
    sh(p.repo, ["add", "src/months.ts"]);
    const before = snapshot(p);
    expect(prepareBuild(p.repo, p.canon).error).toMatch(/1 file is already staged \(src\/months\.ts\)/);
    expect(snapshot(p)).toEqual(before);
    sh(p.repo, ["reset", "-q"]);
    sh(p.repo, ["checkout", "-q", "--", "src/months.ts"]);
    sh(p.repo, ["checkout", "-q", "--detach"]);
    expect(prepareBuild(p.repo, p.canon).error).toMatch(/no branch is checked out/);
    expect(prepareBuild(p.repo, join(p.root, "elsewhere")).error).toBe("the canon folder is not inside the repository");
  });

  it("refuses to vouch for a canon file that only gained lines, and stays on the build branch with nothing staged", () => {
    const p = project();
    expect(prepareBuild(p.repo, p.canon).ok).toBe(true);
    const file = join(p.canon, "REQ-2-statements.md");
    writeFileSync(file, readFileSync(file, "utf8") + "\n## Open\n\n" + Array.from({ length: 8 }, (_, i) => `- 2026-11-18: note ${i + 1}\n`).join(""));
    const before = snapshot(p);
    const r = prepareBuild(p.repo, p.canon);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/^canon\/REQ-2-statements\.md only gained lines since the last commit\./);
    expect(snapshot(p)).toEqual(before);
    expect(before.status).toBe(" M canon/REQ-2-statements.md\n");
  });

  it("starts the build again from the base branch once the build branch is merged into it, and lifts a private ignore", () => {
    const p = project();
    // the session kept the canon out of git's sight while it was written
    const exclude = join(p.repo, ".git/info/exclude");
    writeFileSync(exclude, readFileSync(exclude, "utf8") + "canon/\n");
    expect(status(p.repo)).toBe("");
    const r = prepareBuild(p.repo, p.canon);
    expect(r.ok).toBe(true);
    expect(readFileSync(exclude, "utf8")).not.toMatch(/^canon\/$/m);
    expect(filesOf(p.repo)).toContain("canon/README.md");

    sh(p.repo, ["checkout", "-q", "main"]);
    sh(p.repo, ["merge", "-q", "--ff-only", "headcanon/build"]);
    writeFileSync(join(p.repo, "src/later.ts"), "export const later = 1;\n");
    const later = commit(p.repo, ["src/later.ts"], "feat: later work\n\nIntent: none (the owner's own work on main)\n");
    expect(prepareBuild(p.repo, p.canon)).toEqual({ ok: true, branch: "headcanon/build", base: "main" });
    expect(branch(p.repo)).toBe("headcanon/build");
    expect(head(p.repo)).toBe(later);
  });
});

describe("with the CLI's own commit-msg command behind the hook", { timeout: 120_000 }, () => {
  it("the canon commit and an approval pass, and a canon commit without its record does not", () => {
    const p = project({ cli: true });
    sh(p.repo, ["add", "canon"]);
    expect(() => sh(p.repo, ["commit", "-q", "-F", "-"], "docs(canon): adopt\n\nIntent: none (the canon itself)\n")).toThrow(/no intent review is recorded/);
    sh(p.repo, ["reset", "-q"]);

    const r = prepareBuild(p.repo, p.canon);
    expect(r).toMatchObject({ ok: true, branch: "headcanon/build", base: "main" });
    expect(r.canonCommit).toBe(head(p.repo));
    writeFileSync(join(p.repo, "src/months.ts"), readFileSync(join(p.repo, "src/months.ts"), "utf8") + "\nexport function closeMonth(month: string): string {\n  return month;\n}\n");
    const built = commit(p.repo, ["src/months.ts"], "feat(months): close a month\n\nIntent: REQ-1.1.1\n");
    const approved = approveSlice(p.repo, p.canon, runOf([slice("REQ-1.1.1", "aaaaaa", "A closed month refuses new entries", [built])]), "REQ-1.1.1", "Test Owner");
    expect(approved).toEqual({ ok: true, sha: head(p.repo) });
    expect(trailersOf(p.repo)["Approved-By"]).toEqual(["Test Owner"]);
    expect(status(p.repo)).toBe("");
  });
});

describe("the commands: build prepare, build tests, slice approve, slice discard", { timeout: 120_000 }, () => {
  it("run from the command line, with the command word first as the CLI passes it, and settle the slice in the run", async () => {
    const p = project();
    const out: string[] = [];
    const err: string[] = [];
    const gitDir = join(p.repo, ".git");
    const ctx: CliCtx = { canonDir: p.canon, repo: p.repo, gitDir, port: 0, by: undefined, json: false, out: (s) => out.push(s), err: (s) => err.push(s), stdin: () => "" };
    expect(await approveCli(["frobnicate"], ctx)).toBe(2);
    expect(await approveCli(["slice", "prepare"], ctx)).toBe(2);
    expect(err.splice(0).join("")).toMatch(/^usage:\n {2}headcanon build prepare/);
    expect(await approveCli(["build", "prepare"], ctx)).toBe(0);
    expect(out.pop()).toMatch(/^On headcanon\/build, made from main\. The canon is committed in [0-9a-f]{7}\.\n$/);
    expect(await approveCli(["prepare"], ctx)).toBe(0);
    expect(out.pop()).toBe("On headcanon/build, made from main. The canon had nothing to commit.\n");
    expect(await approveCli(["build", "tests", "REQ-1.1.1"], ctx)).toBe(1);
    expect(err.pop()).toBe("build tests: no accepted test is recorded for REQ-1.1.1\n");
    expect(await approveCli(["slice", "approve", "REQ-1.1.1"], ctx)).toBe(1);
    expect(err.pop()).toBe("slice approve: there is no run to decide on\n");

    writeFileSync(join(p.repo, "src/months.ts"), readFileSync(join(p.repo, "src/months.ts"), "utf8") + "\nexport function closeMonth(month: string): string {\n  return month;\n}\n");
    const one = commit(p.repo, ["src/months.ts"], "feat(months): close a month\n\nIntent: REQ-1.1.1\n");
    writeFileSync(join(p.repo, "src/total.ts"), "export function total(amounts: number[]): number {\n  return amounts.length;\n}\n");
    const two = commit(p.repo, ["src/total.ts"], "feat(months): total a month\n\nIntent: REQ-1.1.2\n");
    saveRun(gitDir, runOf([slice("REQ-1.1.1", "aaaaaa", "A closed month refuses new entries", [one]), slice("REQ-1.1.2", "bbbbbb", "Closing a month totals its entries", [two])]));
    expect(await approveCli(["slice", "approve", "REQ-1.1.1", "--json"], ctx)).toBe(0);
    expect(JSON.parse(out.pop()!)).toEqual({ ok: true, sha: head(p.repo) });
    expect(trailersOf(p.repo)["Approved-By"]).toEqual(["Test Owner"]);
    expect(await approveCli(["slice", "discard", "REQ-1.1.2"], ctx)).toBe(0);
    expect(out.pop()).toBe("REQ-1.1.2 is discarded: its commits are reverted.\n");
    expect(existsSync(join(p.repo, "src/total.ts"))).toBe(false);
    expect(loadRun(gitDir, "run-1")!.slices.map((s) => `${s.node} ${s.status}`)).toEqual(["REQ-1.1.1 approved", "REQ-1.1.2 discarded"]);
    expect(err).toEqual([]);
  });
});

describe("binding from commits", () => {
  it("drops the not-built line and the section it leaves empty, and nothing else", () => {
    const node = "---\nid: REQ-1\n---\n\n# A\n\n## Intent\n\nNot built by hand: a sentence that only starts alike.\n\n## Implemented by\n\n- 2026-11-18: not built: nothing yet\n\n## Open\n\n- 2026-11-18: a note that stays\n- not built; the same thing said under Open\n";
    expect(dropNotBuilt(node)).toBe("---\nid: REQ-1\n---\n\n# A\n\n## Intent\n\nNot built by hand: a sentence that only starts alike.\n\n## Open\n\n- 2026-11-18: a note that stays\n");
    const kept = "## Implemented by\n\n- the import reads each line (src/a.ts:1-9)\n- not built: the export\n";
    expect(dropNotBuilt(kept)).toBe("## Implemented by\n\n- the import reads each line (src/a.ts:1-9)\n");
    expect(dropNotBuilt("## Intent\n\nBuilt.\n")).toBe("## Intent\n\nBuilt.\n");
  });

  it("binds nothing for a node the canon does not hold or a slice without commits", () => {
    const p = project();
    expect(bindFromCommits(p.repo, p.canon, "REQ-9", [head(p.repo)])).toEqual({ bound: [] });
    expect(bindFromCommits(p.repo, p.canon, "REQ-1.1.1", [])).toEqual({ bound: [] });
    expect(status(p.repo)).toMatch(/^\?\? canon\//);
  }, 60_000);
});
