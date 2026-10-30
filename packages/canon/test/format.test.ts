import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FORMAT, FORMAT_VERSION, HISTORY, changesSince, describeFormat } from "../src/index.js";

const DOC = fileURLToPath(new URL("../../../docs/format.md", import.meta.url));

describe("the canon format [REQ-6]", () => {
  it("docs/format.md is the format as the code prints it", () => {
    // regenerate with: node packages/canon/dist/cli.js format --out docs/format.md
    const doc = readFileSync(DOC, "utf8").replace(/\r\n/g, "\n");
    expect(doc.trimEnd()).toBe(describeFormat().trimEnd());
  });

  it("the history's head is the current version, newest first, and a node's needed sections are not listed twice", () => {
    expect(HISTORY[0]?.version).toBe(FORMAT_VERSION);
    expect(HISTORY.map((h) => h.version)).toEqual([...HISTORY.map((h) => h.version)].sort((a, b) => b - a));
    expect(changesSince(1).map((c) => c.version)).toEqual([2]);
    expect(changesSince(FORMAT_VERSION)).toEqual([]);
    for (const t of Object.values(FORMAT)) for (const s of t.needsOneOf) expect(t.sections).not.toContain(s);
    expect(FORMAT.root.required).toContain("format");
  });
});
