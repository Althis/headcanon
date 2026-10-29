import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildSnapshot, checkCanon, loadCanon, parseFrontMatter, parseSections, parseStepTable, renderTextTree } from "../src/index.js";

const MINI = fileURLToPath(new URL("./fixtures/mini/", import.meta.url));

describe("parse [REQ-6.1]", () => {
  it("splits front-matter from the body and tolerates files without it", () => {
    const p = parseFrontMatter("---\nid: REQ-1\nsteps: [JRN-1/S1]\n---\n\n# Title\n\nbody");
    expect(p.data["id"]).toBe("REQ-1");
    expect(p.data["steps"]).toEqual(["JRN-1/S1"]);
    expect(p.body).toContain("# Title");
    expect(parseFrontMatter("no front matter").data).toEqual({});
  });

  it("reads section markers like `## Not this [assumed]` [REQ-5.3.3]", () => {
    const s = parseSections("## Stated\n\n> x\n\n## Not this [assumed]\n\ntext\n\n## Weird [bogus]\n");
    expect(s).toEqual([
      { heading: "Stated", marker: undefined },
      { heading: "Not this", marker: "assumed" },
      { heading: "Weird", marker: undefined },
    ]);
  });

  it("reads a journey step table with or without a state column [REQ-4.3]", () => {
    const three = parseStepTable("| Step | State | Linked |\n| --- | --- | --- |\n| S1 Open | stated | REQ-1, REQ-2.1 (note) |");
    expect(three[0]).toEqual({ id: "S1", label: "Open", state: "stated", requirements: ["REQ-1", "REQ-2.1"] });
    const two = parseStepTable("| Step | Linked |\n| --- | --- |\n| S4 Log in | REQ-9 |");
    expect(two[0]).toEqual({ id: "S4", label: "Log in", state: "assumed", requirements: ["REQ-9"] });
  });
});

describe("load [REQ-6.1, REQ-6.3]", () => {
  const canon = loadCanon(MINI);

  it("builds the tree, journeys, decisions and glossary from the folder", () => {
    expect(canon.root?.title).toBe("Mini canon");
    expect(canon.terms.map((t) => t.id)).toEqual(["TERM-widget", "TERM-skip"]);
    expect(canon.terms.map((t) => t.state)).toEqual(["assumed", "assumed"]);
    expect(canon.nodes["REQ-1"]?.children).toEqual(["REQ-1.1"]);
    expect(canon.nodes["REQ-1.1"]?.depth).toBe(1);
    expect(canon.journeys[0]?.steps).toHaveLength(2);
    expect(canon.journeys[0]?.mermaid).toContain("flowchart");
    expect(canon.decisions[0]?.intents).toEqual(["REQ-1.1"]);
  });

  it("keeps an orphan visible as a root, reads parent ROOT as no parent, and reports the stray file", () => {
    expect(canon.roots).toEqual(["REQ-1", "REQ-1.2", "REQ-2"]);
    expect(canon.nodes["REQ-2"]?.parent).toBeUndefined();
    expect(canon.unparsed).toEqual(["notes.md"]);
  });
});

describe("layers and principles [REQ-6.7, REQ-3.7]", () => {
  const canon = loadCanon(MINI);

  it("reads explicit layers and infers the rest from depth", () => {
    expect(canon.nodes["REQ-1"]?.layer).toBe("domain");
    expect(canon.nodes["REQ-1"]?.layerExplicit).toBe(true);
    expect(canon.nodes["REQ-1.1"]?.layer).toBe("capability");
    expect(canon.nodes["REQ-1.2"]?.layer).toBe("domain");
    expect(canon.nodes["REQ-1.2"]?.layerExplicit).toBe(false);
  });

  it("parses principles in both the paragraph and the one-line form", () => {
    expect(canon.principles.map((p) => p.id)).toEqual(["PRN-1", "PRN-2"]);
    expect(canon.principles[0]).toEqual({ id: "PRN-1", title: "Keep the original", state: "stated", statement: "Every imported file is kept beside what was made from it. A reader can always go back to the source.", source: "docs/design.md:12-15" });
    expect(canon.principles[1]?.state).toBe("assumed");
    expect(canon.principles[1]?.statement).toBe("a figure in a report links to the transactions behind it.");
    expect(canon.principles[1]?.source).toBe("conversation, 2026-01-01");
  });

  it("flags an explicit capability with nothing under it, and counts inferred layers once", () => {
    const codes = checkCanon(canon).map((f) => `${f.level}:${f.code}:${f.id ?? ""}`);
    expect(codes).toContain("warn:uncovered-capability:REQ-1.1");
    expect(codes.filter((c) => c.startsWith("info:layer-inferred"))).toHaveLength(1);
  });
});

describe("a project before init [REQ-11.6]", () => {
  it("loads a missing canon folder as an empty canon and still builds a snapshot", () => {
    const missing = join(mkdtempSync(join(tmpdir(), "headcanon-missing-")), "canon");
    const canon = loadCanon(missing);
    expect(canon.roots).toEqual([]);
    expect(canon.root).toBeUndefined();
    expect(checkCanon(canon)).toEqual([]);
    const snap = buildSnapshot(missing);
    expect(snap.stats.nodes).toBe(0);
    expect(snap.textTree).toBe("(no requirements yet)");
  });
});

describe("partition and typed links [REQ-3.14, DEC-014]", () => {
  const canon = loadCanon(MINI);
  const codes = checkCanon(canon).map((f) => `${f.level}:${f.code}:${f.id ?? ""}`);

  it("reads the partition a refined node records and the relates and conflicts lists", () => {
    expect(canon.nodes["REQ-1"]?.partition).toBe("step of onboarding");
    expect(canon.nodes["REQ-1.1"]?.relates).toEqual(["REQ-2"]);
    expect(canon.nodes["REQ-1.1"]?.conflicts).toEqual(["REQ-9"]);
    expect(canon.nodes["REQ-2"]?.partition).toBeUndefined();
    expect(canon.nodes["REQ-2"]?.relates).toEqual([]);
  });

  it("reports a link to a node that does not exist, and a set of one child", () => {
    expect(codes).toContain("error:link-unknown:REQ-1.1");
    expect(codes).toContain("info:single-child:REQ-1");
    expect(codes.filter((c) => c.startsWith("info:no-partition"))).toHaveLength(0);
  });
});

describe("check [REQ-2.6]", () => {
  const canon = loadCanon(MINI);
  const findings = checkCanon(canon);
  const codes = (level?: string) => findings.filter((f) => !level || f.level === level).map((f) => `${f.code}:${f.id ?? ""}`);

  it("flags broken links and missing parents as errors", () => {
    expect(codes("error")).toContain("parent-missing:REQ-1.2");
    expect(codes("error")).toContain("link-unknown:JRN-1/S2");
  });

  it("warns about missing files, contested sections and stray files", () => {
    expect(codes("warn")).toContain("file-missing:REQ-1.1");
    expect(codes("warn")).toContain("contested:REQ-1.1");
    expect(codes("warn")).toContain("no-id:");
  });

  it("surfaces open questions and unconfirmed decisions as notes", () => {
    expect(codes("info")).toContain("open:REQ-1.2");
    expect(codes("info")).toContain("decision-unconfirmed:DEC-001");
  });
});

describe("summary [REQ-6.2]", () => {
  it("renders the text tree with ids, states and finding counts", () => {
    const canon = loadCanon(MINI);
    const text = renderTextTree(canon, checkCanon(canon));
    expect(text).toMatch(/^REQ-1\s+New users get productive without help\s+stated/m);
    expect(text).toMatch(/└─ REQ-1\.1\s+Sign-up takes under 60 seconds\s+assumed\s+capability\s+numeric\s+! \d finding/m);
    expect(text).toContain("JRN-1");
    expect(text).toContain("origin: obstacle");
  });
});

describe("open boxes", () => {
  it("warns when a title is a question", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "headcanon-title-")), "canon");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "README.md"), "---\nid: ROOT\ntitle: \"T canon\"\nstate: assumed\n---\n\n# T canon\n");
    writeFileSync(join(dir, "REQ-1-x.md"), "---\nid: REQ-1\ntitle: \"Which readers see the computed value?\"\nstate: open\n---\n\n# Which readers see the computed value?\n");
    const codes = checkCanon(loadCanon(dir)).map((f) => `${f.level}:${f.code}:${f.id}`);
    expect(codes).toContain("warn:title-question:REQ-1");
  });
});
