import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { affectedParentsFrom, checkCommitMessage, hashDiff, intentDiffFrom, loadReviewRecord, stagedIntentDiff, storeReviewRecord, validateReviewRecord } from "../src/index.js";

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
