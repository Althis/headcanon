import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bareNumber, checkCanon, loadCanon, pronounStart, scanText, sentenceCount } from "../src/index.js";

describe("the language checks of the quality list [DEC-024]", () => {
  it("finds the families' words whole, plural or not, and leaves a glossary term alone", () => {
    const hits = scanText("The importer is user-friendly and handles statements quickly, etc. It should process files.", []);
    const byCode = Object.fromEntries(hits.map((h) => [h.code, h.words]));
    expect(byCode["subjective"]).toEqual(["user-friendly"]);
    expect(byCode["vague"]).toEqual(["quickly"]);
    expect(byCode["open-ended"]).toEqual(["etc"]);
    expect(byCode["vague-verb"]).toEqual(["handles", "process"]);
    expect(byCode["intent-modal"]).toEqual(["should"]);
    // "process" defined by the project is the project's word, not a vague verb
    const defined = scanText("The importer handles statements and runs the process.", [{ id: "TERM-process", term: "process", definition: "a run of the pipeline", state: "assumed" }]);
    expect(defined.find((h) => h.code === "vague-verb")?.words).toEqual(["handles"]);
    // whole words: "sometimes" is vague, "some" inside "handsome" is not
    expect(scanText("A handsome report.", []).find((h) => h.code === "vague")).toBeUndefined();
    expect(scanText("The report sometimes fails.", []).find((h) => h.code === "vague")?.words).toEqual(["sometimes"]);
  });

  it("counts sentences, catches a pronoun start and a bare number", () => {
    expect(sentenceCount("One. Two sentences here. And a third?")).toBe(3);
    expect(sentenceCount("Amounts are read to 2.5 cents.")).toBe(1);
    expect(sentenceCount("")).toBe(0);
    expect(pronounStart("The parser reads lines. It is fast.")).toBe("It is");
    expect(pronounStart("The parser reads lines.")).toBeUndefined();
    expect(bareNumber("The export finishes within 2.")).toBe("2");
    expect(bareNumber("The export finishes within 2 seconds.")).toBeUndefined();
    expect(bareNumber("One transaction per line.")).toBeUndefined();
  });

  it("reports them on a canon: warnings on the session's words, notes on the user's, the layer rule for design terms", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "headcanon-lex-")), "canon");
    mkdirSync(join(dir, "REQ-1-a"), { recursive: true });
    writeFileSync(join(dir, "README.md"), "---\nid: ROOT\ntitle: \"Ledger canon\"\nstate: resolved\nformat: 3\n---\n\n# Ledger canon\n\n## Intent\n\nA ledger.\n\n## Glossary [assumed]\n\n**statement** (`TERM-statement`) [assumed]: a bank's list; it shall be dated.\n");
    writeFileSync(join(dir, "REQ-1-a/README.md"), "---\nid: REQ-1\ntitle: \"Import\"\nstate: assumed\nlayer: domain\npartition: stage\nsource: \"docs/a.md:1\"\n---\n\n# Import\n\n## Intent\n\nThe import reads statements from the database table. It is user-friendly where possible, in order to help, and/or fast.\n");
    writeFileSync(join(dir, "REQ-1-a/REQ-1.1-b.md"), "---\nid: REQ-1.1\nparent: REQ-1\ntitle: \"Parsing\"\nstate: assumed\nlayer: requirement\nkind: numeric\n---\n\n# Parsing\n\n## Intent\n\nA statement in CSV becomes transactions. One per line. The rule always holds.\n\n## Check\n\nThe parse of a thousand lines finishes within 2. The log says so.\n");
    writeFileSync(join(dir, "REQ-1-a/REQ-1.2-c.md"), "---\nid: REQ-1.2\nparent: REQ-1\ntitle: \"Export\"\nstate: stated\nlayer: requirement\nkind: binary\n---\n\n# Export\n\n## Stated\n\n> Exports should be fast and user-friendly.\n\n## Check\n\nAn export produces a file.\n");
    const findings = checkCanon(loadCanon(dir));
    const of = (id: string, code: string) => findings.filter((f) => f.id === id && f.code === code);
    expect(of("REQ-1", "subjective").map((f) => f.level)).toEqual(["warn"]);
    expect(of("REQ-1", "escape-clause")).toHaveLength(1);
    expect(of("REQ-1", "purpose-clause")).toHaveLength(1);
    expect(of("REQ-1", "and-or")).toHaveLength(1);
    expect(of("REQ-1", "design-term")[0]?.message).toContain("database");
    expect(of("REQ-1", "pronoun-start")).toHaveLength(1);
    // a requirement may name a mechanism; the design-term note is for the layers above
    expect(of("REQ-1.1", "design-term")).toHaveLength(0);
    expect(of("REQ-1.1", "intent-long")).toHaveLength(1);
    expect(of("REQ-1.1", "check-long")).toHaveLength(1);
    expect(of("REQ-1.1", "number-unit")[0]?.message).toContain("\"2\"");
    expect(of("REQ-1.1", "absolute")).toHaveLength(1);
    expect(of("REQ-1.1", "source-missing")).toHaveLength(1);
    // the user's words are flagged as notes only, never as a warning to correct
    expect(of("REQ-1.2", "subjective").map((f) => f.level)).toEqual(["info"]);
    expect(of("REQ-1.2", "subjective")[0]?.message).toContain("Stated words");
    expect(findings.find((f) => f.code === "glossary-prescriptive")?.message).toContain("statement");
  });
});
