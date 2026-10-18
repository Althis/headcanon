import { describe, expect, it } from "vitest";
import { approveNode, clearMarkers, editNode, setField, upsertSection, deletePrinciple, editPrinciple, setPrincipleState } from "../src/edits.js";
import { parsePrinciples } from "../src/parse.js";

const NODE = `---
id: REQ-1.2
parent: REQ-1
title: "Old title"
state: assumed
layer: capability
---

# Old title

## Intent [assumed]

The old reading.

## Deferred

- a rung (docs/x.md:3)
`;

describe("node edits from the page [REQ-12.1.8]", () => {
  it("sets a front-matter field in place or adds it", () => {
    expect(setField(NODE, "state", "resolved")).toContain("\nstate: resolved\n");
    expect(setField(NODE, "partition", '"stage"')).toContain('\npartition: "stage"\n---');
  });

  it("replaces a section body and keeps the others, or appends a missing section", () => {
    const t = upsertSection(NODE, "Intent", "A new reading.");
    expect(t).toContain("## Intent [assumed]\n\nA new reading.\n\n## Deferred");
    expect(t).toContain("- a rung (docs/x.md:3)");
    expect(upsertSection(NODE, "Resolution", "Yes.")).toMatch(/## Resolution\n\nYes\.\n$/);
  });

  it("approving makes an assumed node resolved with a Resolution line, and keeps stated as stated", () => {
    const a = approveNode(NODE, "2026-10-17");
    expect(a).toContain("state: resolved");
    expect(a).toContain("## Intent\n\nThe old reading.");
    expect(a).toContain("## Resolution\n\nApproved in the viewer, 2026-10-17.");
    expect(approveNode(NODE.replace("state: assumed", "state: stated"), "2026-10-17")).toContain("state: stated");
  });

  it("editing records the typed text as stated and as the entry, with the new title", () => {
    const e = editNode(NODE, { title: "New title", intent: "What it is now." }, "2026-10-17");
    expect(e).toContain('title: "New title"');
    expect(e).toContain("# New title\n");
    expect(e).toContain("state: stated");
    expect(e).toContain("## Stated\n\n> What it is now.\n\nSource: typed by the human in the viewer, 2026-10-17");
    expect(e).toContain("## Intent\n\nWhat it is now.");
    expect(e).toContain("## Deferred");
    expect(clearMarkers("## Not this [assumed]\n")).toBe("## Not this\n");
  });
  it("a principle keeps its own marker in the root README: approving marks it resolved, rewriting makes it stated, deleting removes its block", () => {
    const readme = "# X canon\n\n## Principles\n\n**PRN-1 Keep it** [assumed]\nEverything stays.\nSource: a\n\n**PRN-2 Say it** [assumed]: short. Source: b\n\n## Glossary [assumed]\n";
    const approved = setPrincipleState(readme, "PRN-1", "resolved");
    expect(approved).toContain("**PRN-1 Keep it** [resolved]\n");
    expect(parsePrinciples(approved).map((p) => [p.id, p.state])).toEqual([["PRN-1", "resolved"], ["PRN-2", "assumed"]]);
    expect(setPrincipleState(readme, "PRN-2", "stated")).toContain("**PRN-2 Say it**: short.");
    const edited = editPrinciple(readme, "PRN-1", { title: "Keep everything", statement: "Nothing is thrown away." }, "2026-10-18");
    const p = parsePrinciples(edited)[0]!;
    expect([p.title, p.state, p.statement, p.source]).toEqual(["Keep everything", "stated", "Nothing is thrown away.", "typed by the human in the viewer, 2026-10-18"]);
    const gone = deletePrinciple(readme, "PRN-1");
    expect(parsePrinciples(gone).map((x) => x.id)).toEqual(["PRN-2"]);
    expect(gone).toContain("## Principles\n\n**PRN-2");
  });
});
