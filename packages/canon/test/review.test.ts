import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { affectedParentsFrom, checkCommitMessage, hashDiff, intentDiffFrom, loadReviewRecord, stagedIntentDiff, storeReviewRecord, validateReviewRecord } from "../src/index.js";
import type { Op, OpRecord } from "../src/ops.js";
import { adoptionReviewFrom, adoptionReviewRecord, entryPathspec, setReviews, stagedCanonEntries, type StagedEntry } from "../src/review.js";

/** A line of the operations log as `applyOp` writes it. */
const logged = (request: Op, extra: Partial<OpRecord> = {}): OpRecord => ({ at: "2026-11-18T10:00:00.000Z", by: undefined, request, ok: true, changes: request.op === "review" ? [] : ["a-file.md"], ...extra });
const added = (id: string, parent?: string): StagedEntry => ({ status: "A", path: `canon/${id}.md`, id, parent });

describe("a review record made from adoption's own reviews [REQ-8.5.4]", () => {
  const ops: OpRecord[] = [
    logged({ op: "review", id: "REQ-1", verdict: "pass" }, { by: "reviewer-REQ-1" }),
    logged({ op: "create", under: "REQ-1", title: "t", intent: "i" }),
    logged({ op: "review", id: "REQ-2", verdict: "fail", findings: [{ test: "one-concept", child: "REQ-2.1", text: "two rules in one node" } as unknown as { check: string; text: string }] }, { by: "reviewer-REQ-2" }),
    logged({ op: "reword", id: "REQ-2.1", from: "a", to: "b" }, { ok: false, changes: [] }),
    logged({ op: "move", id: "REQ-2", under: "REQ-1" }, { renamed: { "REQ-2": "REQ-1.5", "REQ-2.1": "REQ-1.5.1" } }),
    logged({ op: "review", id: "REQ-3", verdict: "fail" }),
    logged({ op: "review", id: "REQ-3", verdict: "pass" }, { at: "2026-11-18T11:00:00.000Z", by: "reviewer-REQ-3" }),
    logged({ op: "term", term: "entry", definition: "a line" }),
  ];

  it("reads the last verdict of each set, what was written there since, and follows a move's new ids", () => {
    const sets = setReviews(ops);
    expect([...sets.keys()].sort()).toEqual(["REQ-1", "REQ-1.5", "REQ-3"]);
    expect(sets.get("REQ-1")).toMatchObject({ verdict: "pass", opsSince: 2, by: "reviewer-REQ-1" });
    expect(sets.get("REQ-1.5")).toMatchObject({ parent: "REQ-1.5", verdict: "fail", opsSince: 0, findings: [{ test: "one-concept", child: "REQ-1.5.1", text: "two rules in one node" }] });
    expect(sets.get("REQ-3")).toMatchObject({ verdict: "pass", opsSince: 0 });
  });

  it("says of every set in the change what the log holds, and resolves nothing as decided", () => {
    const diff = { hash: "abc123abc123", affectedParents: ["REQ-1", "REQ-1.5", "REQ-3", "REQ-4"] };
    const entries = [added("REQ-1.1", "REQ-1"), added("REQ-1.5.1", "REQ-1.5"), added("REQ-3.1", "REQ-3"), added("REQ-3.2", "REQ-3"), added("REQ-4.1", "REQ-4"), added("REQ-9"), added("JRN-2"), { ...added("ROOT"), status: "M" as const }];
    const made = adoptionReviewFrom(diff, entries, ops, "2026-11-18T12:00:00.000Z");
    expect(made.sets).toEqual({ passed: 1, failed: 1, changed: 1, unreviewed: 2 });
    expect(made.outcome).toBe("adoption reviews: 1 set passed, 1 failed, 1 changed after passing, 2 not reviewed, 2 entries outside the sets");
    expect(made.record.findings.map((f) => [f.kind, f.nodes])).toEqual([
      ["quality", ["REQ-1.5", "REQ-1.5.1"]],
      ["unreviewed", ["REQ-1"]],
      ["unreviewed", ["REQ-4", "ROOT"]],
      ["unreviewed", ["JRN-2", "ROOT"]],
    ]);
    expect(made.record.findings[0]).toMatchObject({ summary: "one-concept: two rules in one node", resolution: expect.stringMatching(/^not changed since the review; left as written/) });
    expect(made.record.findings.every((f) => !/approved|decided/.test(f.resolution ?? ""))).toBe(true);
    expect(made.record.parents?.map((p) => `${p.id}: ${p.reason.split(/[,;]/)[0]}`)).toEqual([
      "REQ-1: its children passed the review of 2026-11-18 and were changed afterwards",
      "REQ-1.5: its children failed the review of 2026-11-18",
      "REQ-3: its children passed the review of 2026-11-18 by reviewer-REQ-3",
      "REQ-4: no review of its children is on record",
    ]);
    expect(made.record).toMatchObject({ hash: "abc123abc123", at: "2026-11-18T12:00:00.000Z", adoption: made.sets });
    expect(made.record.reviewer).toBe("headcanon:reviewer, the verdicts in the operations log (reviewer-REQ-1, reviewer-REQ-2, reviewer-REQ-3)");
    expect(validateReviewRecord(made.record, diff)).toEqual([]);

    const clean = adoptionReviewFrom({ hash: "h", affectedParents: [] }, [added("REQ-3.1", "REQ-3")], ops);
    expect(clean.record.findings).toEqual([]);
    expect(clean.outcome).toBe("adoption reviews: 1 set passed");
  });

  it("the record's two kinds are kinds a record may carry, each still with what was done about it", () => {
    const diff = { hash: "abc", affectedParents: [] as string[] };
    const base = { hash: "abc", at: "t", reviewer: "v" };
    expect(validateReviewRecord({ ...base, findings: [{ kind: "quality", nodes: ["REQ-1"], summary: "s", resolution: "left as written for the owner" }, { kind: "unreviewed", nodes: ["REQ-2"], summary: "s", resolution: "left as written for the owner" }] }, diff)).toEqual([]);
    expect(validateReviewRecord({ ...base, findings: [{ kind: "unreviewed", nodes: ["REQ-2"], summary: "s" }] }, diff).join("\n")).toMatch(/no resolution/);
  });
});

describe("intent review [REQ-8.5.4]", () => {
  it("summarizes a staged canon diff and decides whether a review is required", () => {
    const small = intentDiffFrom("diff a", "2\t1\tcanon/README.md\n", "M\tcanon/README.md\n");
    expect(small.required).toBe(false);
    const big = intentDiffFrom("diff b", "9\t0\tcanon/README.md\n", "M\tcanon/README.md\n");
    expect(big.required).toBe(true);
    const created = intentDiffFrom("diff c", "3\t0\tcanon/REQ-1-x/README.md\n", "A\tcanon/REQ-1-x/README.md\n");
    expect(created.required).toBe(true);
    expect(created.newFiles).toEqual(["canon/REQ-1-x/README.md"]);
    expect(intentDiffFrom("", "", "").required).toBe(false);
    expect(hashDiff("x\r\ny")).toBe(hashDiff("x\ny"));
  });

  it("rejects a record for another diff, with a bad kind, or with an unresolved finding", () => {
    const diff = { hash: "abc", affectedParents: [] as string[] };
    const base = { hash: "abc", at: "t", reviewer: "v" };
    expect(validateReviewRecord({ ...base, findings: [] }, diff)).toEqual([]);
    expect(validateReviewRecord({ ...base, findings: [] }, { hash: "def", affectedParents: [] }).join("\n")).toMatch(/changed after the review/);
    expect(validateReviewRecord({ ...base, findings: [{ kind: "nitpick", nodes: ["REQ-1"], summary: "s", resolution: "kept as is" }] }, diff).join("\n")).toMatch(/kind must be/);
    expect(validateReviewRecord({ ...base, findings: [{ kind: "reiteration", nodes: ["REQ-1", "REQ-2"], summary: "s" }] }, diff).join("\n")).toMatch(/no resolution/);
  });

  it("the commit check demands a resolved record and an Intent-Review trailer for a canon change", () => {
    const diff = intentDiffFrom("d", "20\t0\tcanon/REQ-1-x.md\n", "A\tcanon/REQ-1-x.md\n");
    const msg = "docs(canon): add a node\n\nIntent: none (seed)\nIntent-Change: create REQ-1\nApproved-By: Someone\n";
    const none = checkCommitMessage(msg, undefined, { review: { diff, record: undefined, recordErrors: [] } });
    expect(none.errors.join("\n")).toMatch(/no intent review is recorded/);
    const record = { hash: diff.hash, at: "t", reviewer: "v", findings: [] };
    const noTrailer = checkCommitMessage(msg, undefined, { review: { diff, record, recordErrors: [] } });
    expect(noTrailer.errors.join("\n")).toMatch(/Intent-Review/);
    const ok = checkCommitMessage(msg + `Intent-Review: ${diff.hash}, 0 findings\n`, undefined, { review: { diff, record, recordErrors: [] } });
    expect(ok.ok).toBe(true);
    const notRequired = checkCommitMessage(msg, undefined, { review: { diff: intentDiffFrom("", "", ""), record: undefined, recordErrors: [] } });
    expect(notRequired.ok).toBe(true);
  });

  describe("uptake of child changes by untouched parents [REQ-8.5.5]", () => {
    it("lists the parents a change leaves untouched", () => {
      const parents = affectedParentsFrom([
        { status: "A", path: "canon/REQ-1-a/REQ-1.3-c.md", id: "REQ-1.3", parent: "REQ-1" },
        { status: "M", path: "canon/REQ-2-b/REQ-2.1-d.md", id: "REQ-2.1", parent: "REQ-2" },
        { status: "M", path: "canon/REQ-2-b/README.md", id: "REQ-2", parent: undefined },
        { status: "D", path: "canon/REQ-3-e/REQ-3.2-f.md", id: "REQ-3.2", parent: "REQ-3" },
        { status: "M", path: "canon/README.md", id: "ROOT", parent: undefined },
      ]);
      expect(parents).toEqual(["REQ-1", "REQ-3"]);
    });

    it("rejects a record that is silent about an untouched parent", () => {
      const diff = { hash: "abc", affectedParents: ["REQ-1"] };
      const base = { hash: "abc", at: "t", reviewer: "v", findings: [] };
      expect(validateReviewRecord(base, diff).join("\n")).toMatch(/REQ-1 is the parent of a changed node/);
      expect(validateReviewRecord({ ...base, parents: [{ id: "REQ-1", reason: "still lists all its areas" }] }, diff)).toEqual([]);
      expect(validateReviewRecord({ ...base, findings: [{ kind: "uptake", nodes: ["REQ-1", "REQ-1.3"], summary: "s", resolution: "parent updated to name the new area" }], parents: [{ id: "REQ-1", reason: "see finding 1" }] }, diff)).toEqual([]);
    });
  });

  describe("against a real repository", () => {
    let repo: string;
    beforeAll(() => {
      repo = mkdtempSync(join(tmpdir(), "headcanon-review-"));
      execFileSync("git", ["init", "-q", repo]);
      execFileSync("git", ["-C", repo, "config", "user.email", "t@example.com"]);
      execFileSync("git", ["-C", repo, "config", "user.name", "T"]);
      mkdirSync(join(repo, "canon", "REQ-1-a"), { recursive: true });
      writeFileSync(join(repo, "canon", "README.md"), "---\nid: ROOT\ntitle: x\n---\n# x\n");
      writeFileSync(join(repo, "canon", "REQ-1-a", "README.md"), "---\nid: REQ-1\ntitle: a\nstate: assumed\n---\n# a\n");
      execFileSync("git", ["add", "canon"], { cwd: repo });
      execFileSync("git", ["commit", "-q", "-m", "seed"], { cwd: repo });
      writeFileSync(join(repo, "canon", "REQ-1-a", "REQ-1.1-b.md"), "---\nid: REQ-1.1\nparent: REQ-1\ntitle: b\nstate: assumed\n---\n# b\n");
      execFileSync("git", ["add", "canon"], { cwd: repo });
    });
    afterAll(() => rmSync(repo, { recursive: true, force: true }));

    it("hashes the staged canon diff, names the untouched parent, and stores a record the hook can find", () => {
      const diff = stagedIntentDiff(repo);
      expect(diff.required).toBe(true);
      expect(diff.newFiles).toEqual(["canon/REQ-1-a/REQ-1.1-b.md"]);
      expect(diff.affectedParents).toEqual(["REQ-1"]);
      const path = storeReviewRecord(repo, { hash: diff.hash, at: "t", reviewer: "v", findings: [], parents: [{ id: "REQ-1", reason: "still describes b" }] });
      expect(path).toMatch(/headcanon[\\/]reviews[\\/]/);
      expect(loadReviewRecord(repo, diff.hash)?.reviewer).toBe("v");
      expect(loadReviewRecord(repo, "nope")).toBeUndefined();
    });
  });
});

describe("the staged canon change, read whole [REQ-8.5.4]", () => {
  let repo: string;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
  const write = (rel: string, text: string) => { mkdirSync(join(repo, rel, ".."), { recursive: true }); writeFileSync(join(repo, rel), text); };
  const node = (id: string, parent: string | undefined, body = "") => `---\nid: ${id}\n${parent ? `parent: ${parent}\n` : ""}title: ${id}\nstate: assumed\n---\n# ${id}\n${body}`;
  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "headcanon-staged-"));
    execFileSync("git", ["init", "-q", repo]);
    for (const [k, v] of [["user.email", "t@example.com"], ["user.name", "T"], ["core.autocrlf", "false"]]) git("config", k!, v!);
    write("canon/README.md", "---\nid: ROOT\ntitle: x\n---\n# x\n");
    write("canon/REQ-1-a/README.md", node("REQ-1", undefined));
    write("canon/REQ-1-a/REQ-1.1-b.md", node("REQ-1.1", "REQ-1"));
    git("add", "canon");
    git("commit", "-q", "-m", "seed");
  });
  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  it("reads the canon's entries only: a record kept in the folder asks for no review", () => {
    expect(entryPathspec("docs/canon/")).toBe(":(glob,icase)docs/canon/**/*.md");
    write("canon/tests.json", JSON.stringify({ runners: {}, tests: Array.from({ length: 40 }, (_, i) => ({ node: `u${i}` })) }, null, 1));
    git("add", "canon");
    expect(stagedIntentDiff(repo)).toMatchObject({ files: [], required: false, changedLines: 0 });
    expect(adoptionReviewRecord(repo)).toBeUndefined();
    write("canon/REQ-1-a/NOTES.MD", node("REQ-1.2", "REQ-1"));
    git("add", "canon");
    expect(stagedIntentDiff(repo)).toMatchObject({ files: ["canon/REQ-1-a/NOTES.MD"], required: true });
    git("reset", "-q");
    rmSync(join(repo, "canon/tests.json"));
    rmSync(join(repo, "canon/REQ-1-a/NOTES.MD"));
  });

  it("a moved entry is read on both sides, so the parent it left and the one it joined are both named", () => {
    write("canon/REQ-2-c/README.md", node("REQ-2", undefined));
    git("add", "canon");
    git("commit", "-q", "-m", "second");
    git("mv", "canon/REQ-1-a/REQ-1.1-b.md", "canon/REQ-2-c/REQ-2.1-b.md");
    write("canon/REQ-2-c/REQ-2.1-b.md", node("REQ-2.1", "REQ-2"));
    git("add", "canon");
    expect(stagedCanonEntries(repo).map((e) => `${e.status} ${e.id} under ${e.parent}`)).toEqual(["D REQ-1.1 under REQ-1", "A REQ-2.1 under REQ-2"]);
    expect(stagedIntentDiff(repo).affectedParents).toEqual(["REQ-1", "REQ-2"]);
    git("reset", "-q", "--hard");
  });

  it("a change larger than a megabyte is still seen, each of its many files read, and its record written from the log", () => {
    const filler = "A month that is closed takes no entry.\n".repeat(120);
    for (let i = 1; i <= 300; i++) write(`canon/REQ-1-a/REQ-1.${i + 1}-n.md`, node(`REQ-1.${i + 1}`, "REQ-1", filler));
    git("add", "canon");
    const diff = stagedIntentDiff(repo);
    expect(git("diff", "--cached", "--", "canon").length).toBeGreaterThan(1024 * 1024);
    expect(diff.required).toBe(true);
    expect(diff.hash).not.toBe(hashDiff(""));
    expect(diff.newFiles.length).toBe(300);
    expect(diff.affectedParents).toEqual(["REQ-1"]);
    const entries = stagedCanonEntries(repo);
    expect(entries.length).toBe(300);
    expect(entries.every((e) => e.status === "A" && e.parent === "REQ-1" && /^REQ-1\.\d+$/.test(e.id ?? ""))).toBe(true);

    mkdirSync(join(repo, ".git/headcanon"), { recursive: true });
    writeFileSync(join(repo, ".git/headcanon/ops.jsonl"), JSON.stringify(logged({ op: "review", id: "REQ-1", verdict: "pass" }, { by: "reviewer-REQ-1" })) + "\n");
    const made = adoptionReviewRecord(repo)!;
    expect(made.diff.hash).toBe(diff.hash);
    expect(made.outcome).toBe("adoption reviews: 1 set passed");
    expect(made.record.parents).toEqual([{ id: "REQ-1", reason: "its children passed the review of 2026-11-18 by reviewer-REQ-1, and nothing was written among them since" }]);
    const stored = loadReviewRecord(repo, diff.hash)!;
    expect(stored).toEqual(made.record);
    expect(validateReviewRecord(stored, diff)).toEqual([]);
    const msg = `docs(canon): add the rest\n\nIntent: none (the canon itself)\nIntent-Change: update REQ-1\nApproved-By: pending (the owner reviews on the page)\nIntent-Review: ${diff.hash}, ${made.outcome}\n`;
    expect(checkCommitMessage(msg, undefined, { review: { diff, record: stored, recordErrors: validateReviewRecord(stored, diff) } }).errors).toEqual([]);
  }, 60_000);
});
