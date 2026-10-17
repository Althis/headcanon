import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkCommitMessage, cleanMessage, findAppendOnlyFiles, loadCanon, parseTrailers, renderMermaidIndex } from "../src/index.js";

const MINI = fileURLToPath(new URL("./fixtures/mini/", import.meta.url));
const canon = loadCanon(MINI);

const GOOD = `feat(onboarding): defer team setup to first invite

New users reach their first project without creating a team.

Intent: REQ-1.1
Intent-Change: update REQ-1.1
Decision: DEC-001
Approved-By: Someone
`;

describe("commit-msg [REQ-8.5, REQ-8.5.1]", () => {
  it("accepts the brief's example shape", () => {
    const r = checkCommitMessage(GOOD, canon);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.trailers["Intent-Change"]).toEqual(["update REQ-1.1"]);
  });

  it("rejects a free-form header and a missing Intent trailer", () => {
    const r = checkCommitMessage("fixed stuff\n\nno trailers here\n");
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toMatch(/Conventional Commits/);
    expect(r.errors.join("\n")).toMatch(/missing "Intent:"/);
  });

  it("requires Approved-By when intent or tests change", () => {
    const r = checkCommitMessage("docs(canon): add a node\n\nIntent: REQ-1\nIntent-Change: create REQ-1.1\n", canon);
    expect(r.errors.join("\n")).toMatch(/Approved-By/);
    const ok = checkCommitMessage("docs(canon): add a node\n\nIntent: REQ-1\nIntent-Change: create REQ-1.1\nApproved-By: pending (review in PR)\n", canon);
    expect(ok.ok).toBe(true);
  });

  it("checks referenced ids against the canon", () => {
    const r = checkCommitMessage("fix: x\n\nIntent: REQ-404, JRN-1/S9\nDecision: DEC-002\n", canon);
    expect(r.errors).toContain("Intent REQ-404 does not exist in the canon");
    expect(r.errors).toContain("Intent JRN-1/S9 does not exist in the canon");
    expect(r.errors).toContain("Decision DEC-002 does not exist in the canon");
  });

  it("accepts a principle as an Intent and as a created object", () => {
    const r = checkCommitMessage("docs(canon): add a principle\n\nIntent: PRN-1\nIntent-Change: create PRN-1\nApproved-By: Someone\n", canon);
    expect(r.errors).toEqual([]);
    const unknown = checkCommitMessage("docs(canon): x\n\nIntent: PRN-9\n", canon);
    expect(unknown.errors).toContain("Intent PRN-9 does not exist in the canon");
  });

  it("accepts update ROOT for the root README", () => {
    const r = checkCommitMessage("docs(canon): state the purpose\n\nIntent: none (seeding)\nIntent-Change: update ROOT\nApproved-By: Someone\n", canon);
    expect(r.errors).toEqual([]);
  });

  it("allows Intent: none only with a reason, and skips merge commits", () => {
    expect(checkCommitMessage("chore: bootstrap\n\nIntent: none\n").ok).toBe(false);
    expect(checkCommitMessage("chore: bootstrap\n\nIntent: none (tooling only)\n").ok).toBe(true);
    expect(checkCommitMessage("Merge branch 'x' into main\n").ok).toBe(true);
  });

  it("detects modified rules, skill and canon files that only gained lines [REQ-8.5.3]", () => {
    const numstat = "12\t0\tskills/adopt/SKILL.md\n30\t0\tcanon/REQ-1-x/README.md\n5\t0\tcanon/README.md\n9\t3\tpackages/canon/src/rules.ts\n40\t0\tsrc/app.ts\n";
    const nameStatus = "M\tskills/adopt/SKILL.md\nA\tcanon/REQ-1-x/README.md\nM\tcanon/README.md\nM\tpackages/canon/src/rules.ts\nM\tsrc/app.ts\n";
    const found = findAppendOnlyFiles(numstat, nameStatus);
    expect(found).toEqual([{ path: "skills/adopt/SKILL.md", added: 12 }]);
  });

  it("requires a Consolidated trailer when an append-only file is staged", () => {
    const appendOnly = [{ path: "skills/adopt/SKILL.md", added: 12 }];
    const r = checkCommitMessage("fix: tweak\n\nIntent: none (tooling)\n", undefined, { appendOnly });
    expect(r.errors.join("\n")).toMatch(/Consolidated/);
    const ok = checkCommitMessage("fix: tweak\n\nIntent: none (tooling)\nConsolidated: reviewed Asking and Entries, nothing overlaps\n", undefined, { appendOnly });
    expect(ok.ok).toBe(true);
    const short = checkCommitMessage("fix: tweak\n\nIntent: none (tooling)\nConsolidated: yes\n", undefined, { appendOnly });
    expect(short.warnings.join("\n")).toMatch(/too short/);
  });

  it("ignores git comment lines and reads only the last paragraph as trailers", () => {
    const msg = cleanMessage("feat: a\n# Please enter the commit message\n\nIntent: REQ-1\n# comment\n");
    expect(parseTrailers(msg)).toEqual({ Intent: ["REQ-1"] });
    expect(parseTrailers("feat: a\n\nNote: this is prose, not a trailer\n\nmore prose")).toEqual({});
  });
});

describe("render [REQ-6.2, REQ-6.5]", () => {
  it("renders one diagram for a small canon, colored by state", () => {
    const md = renderMermaidIndex(canon);
    expect(md).toContain("```mermaid");
    expect(md).toContain('REQ_1_1["REQ-1.1<br/>Sign-up takes under 60 seconds"]:::assumed');
    expect(md).toContain("REQ_1 --> REQ_1_1");
    expect(md).toContain("classDef contested");
    expect(md.match(/```mermaid/g)).toHaveLength(1);
  });

  it("splits into top levels plus one diagram per branch past the limit", () => {
    const md = renderMermaidIndex(canon, [], 1);
    expect(md).toContain("## Top levels");
    expect(md).toContain("## REQ-1 New users get productive without help");
    expect(md.match(/```mermaid/g)!.length).toBeGreaterThan(1);
  });
});
