import { describe, expect, it } from "vitest";
import { approveNode, clearMarkers, editNode, setField, upsertSection } from "../src/edits.js";

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
});
