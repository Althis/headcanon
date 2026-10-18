import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSnapshot } from "../src/index.js";

// A leaf's contract (REQ-3.3): `kind` says how it is measured and `## Check` what is observed. A node with
// neither children nor a kind is a leaf still to cut, and the count of those is the completeness measure.
function canonWith(files: Record<string, string>): string {
  const dir = join(mkdtempSync(join(tmpdir(), "headcanon-leaves-")), "canon");
  for (const [rel, text] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
  return dir;
}
const node = (id: string, parent: string | undefined, state: string, extra: string, body: string) =>
  `---\nid: ${id}\n${parent ? `parent: ${parent}\n` : ""}title: "${id}"\nstate: ${state}\n${extra}---\n\n# ${id}\n\n${body}`;

describe("leaf contracts [REQ-3.3]", () => {
  const dir = canonWith({
    "README.md": '---\nid: ROOT\ntitle: "Leaves canon"\nstate: assumed\n---\n\n# Leaves canon\n\n## Intent\n\nA canon.\n',
    "REQ-1-a/README.md": node("REQ-1", undefined, "assumed", "", "## Intent\n\nA parent.\n"),
    "REQ-1-a/REQ-1.1-done.md": node("REQ-1.1", "REQ-1", "assumed", "kind: binary\n", "## Intent\n\nA leaf.\n\n## Check\n\nThe thing is present.\n"),
    "REQ-1-a/REQ-1.2-no-check.md": node("REQ-1.2", "REQ-1", "assumed", "kind: binary\n", "## Intent\n\nA leaf without a check.\n"),
    "REQ-1-a/REQ-1.3-to-cut.md": node("REQ-1.3", "REQ-1", "assumed", "", "## Intent\n\nNot a leaf yet.\n"),
    "REQ-1-a/REQ-1.4-open.md": node("REQ-1.4", "REQ-1", "open", "", "## Open\n\n- 2026-10-18: nothing in the project says.\n"),
    "REQ-1-a/REQ-1.5-check-only.md": node("REQ-1.5", "REQ-1", "assumed", "", "## Intent\n\nA check without a kind.\n\n## Check\n\nIt is there.\n"),
  });
  const snap = buildSnapshot(dir);

  it("counts leaves still to cut and leaves with a check, never parents or red boxes", () => {
    expect(snap.stats.unrefined).toBe(2); // REQ-1.3 and REQ-1.5
    expect(snap.stats.measurable).toBe(2); // REQ-1.1 and REQ-1.2
    expect(snap.health[0]?.unrefined).toBe(2);
  });

  it("flags a kind without a Check and a Check without a kind", () => {
    const codes = snap.findings.map((f) => `${f.code}:${f.id}`);
    expect(codes).toContain("check-missing:REQ-1.2");
    expect(codes).toContain("kind-missing:REQ-1.5");
    expect(codes).not.toContain("check-missing:REQ-1.1");
  });

  it("marks only leaves without a kind as unrefined in the text tree", () => {
    expect(snap.textTree).toMatch(/REQ-1\.3.*unrefined/);
    expect(snap.textTree).not.toMatch(/REQ-1 .*unrefined/);
    expect(snap.textTree).not.toMatch(/REQ-1\.4.*unrefined/);
  });
});
