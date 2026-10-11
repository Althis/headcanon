import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addGlossaryTerm, detectTerms, loadCanon, termId } from "../src/index.js";

describe("jargon detection [REQ-12.1.6]", () => {
  it("finds code tokens, quoted phrases, capitalized terms and camel case, minus the glossary", () => {
    const draft = "Statement import: reads CSV and OFX statements from a bank. [1] A Ledger Entry links to its `sourceFile`. The Reconciler uses \"fuzzy match\" and the autoCategorize step. Approve as written. Sources: [1] README.md:3";
    const found = detectTerms(draft, [{ id: "TERM-ledger-entry", term: "Ledger Entry", definition: "x" }]);
    expect(found).toContain("CSV");
    expect(found).toContain("OFX");
    expect(found).toContain("sourceFile");
    expect(found).toContain("Reconciler");
    expect(found).toContain("fuzzy match");
    expect(found).toContain("autoCategorize");
    expect(found).not.toContain("Ledger Entry");
    expect(found).not.toContain("Statement");
    expect(found).not.toContain("Approve");
    expect(found).not.toContain("README.md");
  });
});

describe("glossary writing [REQ-12.1.6]", () => {
  it("adds, updates, and creates the section when missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "headcanon-glossary-"));
    try {
      writeFileSync(join(dir, "README.md"), "---\nid: ROOT\ntitle: x\n---\n\n# x\n\n## Not this\n\n- a\n\n## Glossary [assumed]\n\n**alpha** (`TERM-alpha`): first.\n\n## After\n\ntext\n");
      const w = addGlossaryTerm(dir, "Beta Thing", "the second thing");
      expect(w.id).toBe("TERM-beta-thing");
      expect(w.created).toBe(true);
      let canon = loadCanon(dir);
      expect(canon.terms.map((t) => t.term)).toEqual(["alpha", "Beta Thing"]);
      expect(readFileSync(join(dir, "README.md"), "utf8")).toMatch(/\*\*Beta Thing\*\*[^\n]*\n\n## After/);

      const again = addGlossaryTerm(dir, "beta thing", "revised");
      expect(again.created).toBe(false);
      canon = loadCanon(dir);
      expect(canon.terms.find((t) => t.id === "TERM-beta-thing")?.definition).toBe("revised");

      writeFileSync(join(dir, "README.md"), "---\nid: ROOT\ntitle: y\n---\n\n# y\n");
      addGlossaryTerm(dir, "gamma", "third");
      expect(loadCanon(dir).terms.map((t) => t.id)).toEqual([termId("gamma")]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
