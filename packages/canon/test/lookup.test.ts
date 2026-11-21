import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { loadCanon } from "../src/load.js";
import { contextText, documentParts, findNodes, findUnits, lookupCli, type CliCtx } from "../src/lookup.js";

/**
 * The fixture is Ledgerline, a bookkeeping tool: three domains (entries, months, statements), one capability
 * refined to requirements in each, one journey, two decisions, four glossary terms, and beside it a store with a
 * code tree of six functions, their descriptions and one claim.
 */
const FIX = fileURLToPath(new URL("./fixtures/lookup/", import.meta.url));
const CANON = join(FIX, "canon");
const GIT = join(FIX, "git");
const MINI = fileURLToPath(new URL("./fixtures/mini/", import.meta.url));

const tmp: string[] = [];
afterAll(() => tmp.forEach((d) => rmSync(d, { recursive: true, force: true })));
function scratch(): string { const d = mkdtempSync(join(tmpdir(), "headcanon-lookup-")); tmp.push(d); return d; }
function write(root: string, rel: string, text: string): void { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); }

/** The headings of a context, in the order printed. */
const heads = (text: string): string[] => text.split("\n").filter((l) => l.startsWith("# "));
/** The lines under one heading, up to the next. */
function under(text: string, head: string): string[] {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l === head);
  if (start < 0) return [];
  const end = lines.findIndex((l, i) => i > start && l.startsWith("# "));
  return lines.slice(start + 1, end < 0 ? undefined : end).filter((l) => l.trim());
}

/**
 * A canon made to be wide: twenty pages under Books that all say "ledger", seven audits that say "ledger" and
 * "seal", seven reports that say "stamp", and one node, REQ-4, with a long body and fifteen bound units.
 */
function wideCanon(): string {
  const root = scratch();
  const node = (id: string, title: string, extra: string, body: string) => `---\nid: ${id}\n${id.includes(".") ? `parent: ${id.slice(0, id.lastIndexOf("."))}\n` : ""}title: "${title}"\nstate: assumed\n${extra}---\n\n# ${title}\n\n${body}`;
  write(root, "canon/README.md", "---\nid: ROOT\ntitle: \"Wide canon\"\nstate: resolved\nformat: 4\n---\n\n# Wide canon\n\n## Intent\n\nA ledger with its audits and reports.\n\n## Glossary [assumed]\n\n**ledger** (`TERM-ledger`): the book of record.\n**seal** (`TERM-seal`): the mark that closes a page.\n**stamp** (`TERM-stamp`): the mark a report carries.\n");
  write(root, "canon/REQ-1-books/README.md", node("REQ-1", "Books", "layer: domain\n", "## Intent\n\nThe pages are kept.\n"));
  for (let k = 1; k <= 20; k++) write(root, `canon/REQ-1-books/REQ-1.${k}-page.md`, node(`REQ-1.${k}`, `Page ${k}`, "kind: binary\n", `## Intent\n\nThe ledger keeps page ${k}${k === 1 ? " under its seal and its stamp" : ""}.\n\n## Check\n\nPage ${k} reads back as written.\n`));
  write(root, "canon/REQ-2-audits/README.md", node("REQ-2", "Audits", "layer: domain\n", "## Intent\n\nThe pages are read by someone else.\n"));
  for (let k = 1; k <= 7; k++) write(root, `canon/REQ-2-audits/REQ-2.${k}-audit.md`, node(`REQ-2.${k}`, `Audit ${k}`, "kind: binary\n", `## Intent\n\nAudit ${k} reads the ledger and breaks no seal.\n\n## Check\n\nAfter audit ${k} every page is as it was.\n`));
  write(root, "canon/REQ-3-reports/README.md", node("REQ-3", "Reports", "layer: domain\n", "## Intent\n\nWhat was found is written down.\n"));
  for (let k = 1; k <= 7; k++) write(root, `canon/REQ-3-reports/REQ-3.${k}-report.md`, node(`REQ-3.${k}`, `Report ${k}`, "kind: binary\n", `## Intent\n\nReport ${k} carries the stamp.\n\n## Check\n\nReport ${k} shows its mark.\n`));
  const binds = ["contributes claim:0000000001", "implements src/a.ts#one", "contradicts src/a.ts#two", "implements src/a.ts#three", ...Array.from({ length: 11 }, (_, i) => `contributes claim:00000000${String(i + 10)}`)];
  const long = Array.from({ length: 400 }, (_, i) => `Line ${i + 1} of a long note about what the archive holds.`).join("\n");
  write(root, "canon/REQ-4-archive.md", node("REQ-4", "Archive", `layer: domain\nbinds: [${binds.map((b) => `"${b}"`).join(", ")}]\n`, `## Intent\n\nEverything is kept.\n\n## Open\n\n${long}\n`));
  return join(root, "canon");
}

describe("contextText: one node and what surrounds it", () => {
  const canon = loadCanon(CANON);

  it("prints the node whole, then its surroundings, each under its heading and each node as id and title", () => {
    expect(contextText(canon, "REQ-2.1.1", { gitDir: GIT })).toBe(`# Node REQ-2.1.1: A closed month accepts no new entry

file: REQ-2-months/REQ-2.1-closing-a-month/REQ-2.1.1-no-new-entry.md
state: assumed
layer: requirement
kind: binary
uid: mo0211
source: docs/rules.md:4

## Intent

A closed month takes no new entry and its totals stay as they were.

## Check

After March is closed, recording an entry dated 14 March is refused and the March total is unchanged.

## Implemented by

- The closed flag is read before an entry is kept (src/months.ts:30-33)

## Bound evidence

- implements src/months.ts#MonthBook.isClosed (src/months.ts:30-33): Says whether a month is closed.
- contributes src/entries.ts#refuseClosed (src/entries.ts:34-41): Refuses an entry whose month is closed.
- contributes claim:aaaaaaaaaa (document, 2026-03-01): A closed month is never reopened. (docs/rules.md:4)

# Path from the premise

## ROOT Ledgerline canon (the premise)

Ledgerline is a bookkeeping tool for a small business: every movement of money is recorded as it happens, each month is closed once, and a statement is produced for every closed month.

## REQ-2 Months (domain)

The books are kept month by month.

## REQ-2.1 Closing a month (capability)

The owner closes a month once all of its entries are in.

# Siblings

- REQ-2.1.2 Closing a month totals its entries

# Children

none

# Links

- requires REQ-1.1.1 An entry keeps its date and amount
- required by REQ-1.1.2 An entry in a closed month is refused
- relates to REQ-3.1.1 A statement lists every entry of its month

# Journeys and decisions that cite it

- JRN-1 Closing March, step S2 Close the month
- DEC-001 A closed month stays closed (2026-03-02)

# Relatives in other branches

- REQ-3.1 Monthly statement (shares the term "closed month")

# Glossary terms its text uses

- closed month: a month whose entries were totalled and which takes no more.
`);
  });

  it("keeps the order the contract gives and carries no decoration", () => {
    const text = contextText(canon, "REQ-1.1")!;
    expect(heads(text)).toEqual(["# Node REQ-1.1: Recording entries", "# Path from the premise", "# Siblings", "# Children", "# Links", "# Journeys and decisions that cite it", "# Relatives in other branches", "# Glossary terms its text uses"]);
    expect(under(text, "# Children")).toEqual(["- REQ-1.1.1 An entry keeps its date and amount", "- REQ-1.1.2 An entry in a closed month is refused", "- REQ-1.1.3 Rounding keeps an entry's amount to the cent"]);
    expect(under(text, "# Siblings")).toEqual(["- REQ-1.2 Correcting entries"]);
    expect(under(text, "# Glossary terms its text uses")).toEqual(["- account: the heading money is recorded under, such as rent or sales."]);
    // plain characters only: no node drawing, no emphasis marks, no table
    expect(/[│├└─•→]|\*\*|^\|/m.test(text)).toBe(false);
  });

  it("answers undefined for an id nobody has, and takes a node's uid for its id", () => {
    expect(contextText(canon, "REQ-9")).toBeUndefined();
    expect(contextText(canon, "en0113")).toBe(contextText(canon, "REQ-1.1.3"));
    expect(contextText(loadCanon(join(FIX, "no-such-canon")), "ROOT")).toBeUndefined();
  });

  it("ROOT is the premise: its text without the glossary, the domains as children, and only the terms its text uses", () => {
    const text = contextText(canon, "ROOT")!;
    expect(heads(text)).toEqual(["# Node ROOT: Ledgerline canon (the premise)", "# Children", "# Journeys and decisions that cite it", "# Glossary terms its text uses"]);
    expect(text).toContain("## Intent\n\nLedgerline is a bookkeeping tool");
    expect(text).toContain("**PRN-1 What is closed stays closed**");
    expect(text).not.toContain("## Glossary");
    expect(text).not.toContain("TERM-account");
    expect(under(text, "# Children")).toEqual(["- REQ-1 Entries", "- REQ-2 Months", "- REQ-3 Statements"]);
    expect(under(text, "# Glossary terms its text uses")).toEqual([
      "- closed month: a month whose entries were totalled and which takes no more.",
      "- statement: the page that shows one month: what it opened with, its entries and its totals.",
    ]);
  });

  it("gives every ancestor its Intent, or the user's own words where no Intent was written", () => {
    const text = contextText(canon, "REQ-2.1")!;
    expect(under(text, "# Path from the premise")).toEqual([
      "## ROOT Ledgerline canon (the premise)",
      "Ledgerline is a bookkeeping tool for a small business: every movement of money is recorded as it happens, each month is closed once, and a statement is produced for every closed month.",
      "## REQ-2 Months (domain)",
      "The books are kept month by month.",
    ]);
    // a domain's siblings are the other domains
    expect(under(contextText(canon, "REQ-2")!, "# Siblings")).toEqual(["- REQ-1 Entries", "- REQ-3 Statements"]);
  });

  it("lists links in both directions, each with the node's title", () => {
    expect(under(contextText(canon, "REQ-1.1.1")!, "# Links")).toEqual(["- required by REQ-2.1.1 A closed month accepts no new entry"]);
    expect(under(contextText(canon, "REQ-1.1.3")!, "# Links")).toEqual(["- conflicted by REQ-3.1.2 Rounding happens once, on a statement's totals"]);
    expect(under(contextText(canon, "REQ-3.1.2")!, "# Links")).toEqual(["- conflicts with REQ-1.1.3 Rounding keeps an entry's amount to the cent"]);
    expect(under(contextText(canon, "REQ-3.1.1")!, "# Links")).toEqual(["- related from REQ-2.1.1 A closed month accepts no new entry"]);
  });

  it("finds a journey by its step table or the node's own steps, a decision by its intents or by the id in its text", () => {
    expect(under(contextText(canon, "REQ-1.1.1")!, "# Journeys and decisions that cite it")).toEqual(["- JRN-1 Closing March, step S1 Record the entries"]);
    expect(under(contextText(canon, "REQ-1.1.3")!, "# Journeys and decisions that cite it")).toEqual(["- DEC-002 Where rounding happens is still open (2026-03-05)"]);
    // DEC-002 names REQ-1.1.3, which cites neither REQ-1.1 nor REQ-1
    expect(under(contextText(canon, "REQ-1.1")!, "# Journeys and decisions that cite it")).toEqual(["none"]);
    expect(under(contextText(canon, "REQ-1")!, "# Journeys and decisions that cite it")).toEqual(["none"]);
  });

  it("names relatives in other branches by what they share, the smallest shared set first, never one of its own branch", () => {
    expect(under(contextText(canon, "REQ-2.1.2")!, "# Relatives in other branches")).toEqual([
      '- REQ-3.1.1 A statement lists every entry of its month (shares the term "carry-over")',
      `- REQ-3.1.2 Rounding happens once, on a statement's totals (shares the title word "totals")`,
      '- REQ-1 Entries (shares the title word "entries")',
      '- REQ-1.1 Recording entries (shares the title word "entries")',
      '- REQ-1.2 Correcting entries (shares the title word "entries")',
    ]);
  });

  it("leaves out of the relatives a node already shown under Links", () => {
    // REQ-1.1.3 and REQ-3.1.2 share "rounding" in their titles, and REQ-3.1.2 conflicts with REQ-1.1.3
    expect(under(contextText(canon, "REQ-1.1.3")!, "# Relatives in other branches")).toEqual(["none"]);
    // REQ-1.1.2 shares "closed month" with REQ-2.1.1, which it requires, and with REQ-3.1
    expect(under(contextText(canon, "REQ-1.1.2")!, "# Relatives in other branches")).toEqual(['- REQ-3.1 Monthly statement (shares the term "closed month")']);
  });

  it("without a store the bound units are named by id alone", () => {
    expect(under(contextText(canon, "REQ-2.1.1")!, "## Bound evidence")).toEqual([
      "- implements src/months.ts#MonthBook.isClosed",
      "- contributes src/entries.ts#refuseClosed",
      "- contributes claim:aaaaaaaaaa",
    ]);
  });

  it("reads a canon with broken references without failing and says what is missing", () => {
    const text = contextText(loadCanon(MINI), "REQ-1.1")!;
    expect(under(text, "# Links")).toEqual(["- required by REQ-2 Billing works", "- relates to REQ-2 Billing works", "- conflicts with REQ-9 (not in the canon)"]);
    expect(under(text, "# Journeys and decisions that cite it")).toEqual(["- JRN-1 First project, steps S1 Open app; S2 Sign up", "- DEC-001 Use magic links instead of passwords (2026-01-01)"]);
    expect(under(text, "# Path from the premise")).toEqual(["## ROOT Mini canon (the premise)", "A tiny canon for tests.", "## REQ-1 New users get productive without help (domain)", "Onboarding needs no documentation."]);
  });
});

describe("contextText: wide canons and the budget", () => {
  const canon = loadCanon(wideCanon());

  it("drops a shared term too wide to mean anything and caps the relatives", () => {
    // "ledger" is in twenty-seven nodes of two branches: no relative comes from it
    expect(under(contextText(canon, "REQ-1.2")!, "# Relatives in other branches")).toEqual(["none"]);
    const rel = under(contextText(canon, "REQ-1.1")!, "# Relatives in other branches");
    expect(rel).toHaveLength(13);
    expect(rel[0]).toBe('- REQ-2.1 Audit 1 (shares the term "seal")');
    expect(rel[11]).toBe('- REQ-3.5 Report 5 (shares the term "stamp")');
    expect(rel[12]).toBe("- and 2 more that share less");
  });

  it("shows the first bound units, contradictions first and code before claims, then counts the rest and says where they are", () => {
    const lines = under(contextText(canon, "REQ-4", { budget: 100_000 })!, "## Bound evidence");
    expect(lines).toHaveLength(13);
    expect(lines.slice(0, 4)).toEqual(["- contradicts src/a.ts#two", "- implements src/a.ts#one", "- implements src/a.ts#three", "- contributes claim:0000000001"]);
    expect(lines[12]).toBe("- and 3 more (3 contributes); `headcanon parcel REQ-4` lists them all");
  });

  it("stays within the default budget of 12000 characters and within any budget asked for", () => {
    const whole = contextText(canon, "REQ-4", { budget: 100_000 })!;
    expect(whole.length).toBeGreaterThan(12_000);
    expect(whole).not.toContain("Left out");
    const byDefault = contextText(canon, "REQ-4")!;
    expect(byDefault.length).toBeLessThanOrEqual(12_000);
    expect(byDefault.length).toBeGreaterThan(11_000);
    for (const budget of [100, 300, 600, 1200, 2500, 5000]) for (const id of ["ROOT", "REQ-1", "REQ-1.1", "REQ-4"]) expect(contextText(canon, id, { budget })!.length).toBeLessThanOrEqual(budget);
  });

  it("cuts a node longer than the budget at a line, names its file, and says on the last line what is missing", () => {
    const text = contextText(canon, "REQ-4")!;
    expect(text.startsWith("# Node REQ-4: Archive\n\nfile: REQ-4-archive.md\n")).toBe(true);
    expect(text).toContain("\n\n(cut here to stay within the budget; the whole node is in REQ-4-archive.md)\n");
    expect(text).toMatch(/\nLine \d+ of a long note about what the archive holds\.\n\n\(cut here/);
    expect(text.trimEnd().split("\n").pop()).toMatch(/^Left out to stay within 12000 characters: the rest of the node, .*\. A larger --budget shows them; a heading not named here is whole\.$/);
  });

  it("gives the budget to the parts in order: the node and the path whole, the list that no longer fits cut with a count", () => {
    const text = contextText(canon, "REQ-1.1", { budget: 900 })!;
    expect(text.length).toBeLessThanOrEqual(900);
    expect(text).toContain("## Intent\n\nThe ledger keeps page 1 under its seal and its stamp.");
    expect(text).toContain("# Path from the premise\n\n## ROOT Wide canon (the premise)\n\nA ledger with its audits and reports.\n\n## REQ-1 Books (domain)\n\nThe pages are kept.");
    const siblings = under(text, "# Siblings");
    expect(siblings[0]).toBe("- REQ-1.2 Page 2");
    expect(siblings.at(-1)).toMatch(/^- and \d+ more$/);
    const shown = siblings.length - 1;
    expect(siblings.at(-1)).toBe(`- and ${19 - shown} more`);
    const last = text.trimEnd().split("\n").pop();
    expect(last).toMatch(/^Left out to stay within 900 characters: .*\. A larger --budget shows them; a heading not named here is whole\.$/);
    expect(last).toContain(`${19 - shown} siblings`);
    // a part with nothing under it still says so, so an absent heading always means a cut
    expect(under(text, "# Children")).toEqual(["none"]);
    expect(under(text, "# Links")).toEqual(["none"]);
    // nothing is cut when the budget is enough
    expect(contextText(canon, "REQ-1.1", { budget: 4000 })).toBe(contextText(canon, "REQ-1.1"));
  });
});

describe("findNodes: nodes, journeys, decisions and terms by a few words", () => {
  const canon = loadCanon(CANON);
  const ids = (words: string, limit?: number) => findNodes(canon, words, limit).map((h) => h.id);

  it("puts first what carries every word, a title before an Intent, and gives the line the words are in", () => {
    const hits = findNodes(canon, "carry-over entries");
    expect(hits.slice(0, 2)).toEqual([
      { id: "REQ-2.1.2", title: "Closing a month totals its entries", where: "intent", line: "Closing a month adds up its entries and hands the carry-over to the next month." },
      { id: "REQ-3.1.1", title: "A statement lists every entry of its month", where: "intent", line: "A statement opens with the carry-over from the month before and lists every entry of its month." },
    ]);
    // the nodes with one of the two words follow, titles first
    expect(hits[2]).toEqual({ id: "REQ-1", title: "Entries", where: "title", line: "Entries" });
  });

  it("matches a word in its other forms and ignores the common words of a question", () => {
    expect(ids("closing a month").slice(0, 4)).toEqual(["REQ-1.1.2", "REQ-2.1", "REQ-2.1.1", "REQ-2.1.2"]);
    expect(ids("the rounding of an entry")[0]).toBe("REQ-1.1.3");
    expect(ids("refuse")).toEqual(["REQ-1.1.2", "REQ-2.1.1"]);
  });

  it("finds a Check, a journey step, a decision's text and a glossary term", () => {
    expect(findNodes(canon, "0.333")).toEqual([{ id: "REQ-3.1.2", title: "Rounding happens once, on a statement's totals", where: "check", line: "Three amounts of 0.333 give a statement total of 1.00." }]);
    expect(findNodes(canon, "read the statement").find((h) => h.where === "journey")).toEqual({ id: "JRN-1", title: "Closing March", where: "journey", line: "S3 Read the statement" });
    expect(findNodes(canon, "reopening")).toEqual([{ id: "DEC-001", title: "A closed month stays closed", where: "decision", line: "Reopening a month would change a statement the owner already sent." }]);
    expect(findNodes(canon, "rent")).toEqual([{ id: "TERM-account", title: "account", where: "term", line: "the heading money is recorded under, such as rent or sales." }]);
  });

  it("takes an id or a uid as the node itself, before anything found by words", () => {
    expect(ids("REQ-2.1.1")).toEqual(["REQ-2.1.1"]);
    expect(ids("st0312")).toEqual(["REQ-3.1.2"]);
    expect(ids("req-2.1.1 rounding")).toEqual(["REQ-2.1.1", "REQ-1.1.3", "REQ-3.1.2", "DEC-002"]);
    expect(ids("JRN-1 DEC-001 TERM-statement")).toEqual(["JRN-1", "DEC-001", "TERM-statement"]);
  });

  it("returns nothing for words nobody uses and no more than the limit", () => {
    expect(findNodes(canon, "payroll")).toEqual([]);
    expect(findNodes(canon, "   ")).toEqual([]);
    expect(ids("entry", 3)).toHaveLength(3);
    expect(ids("entry").length).toBeGreaterThan(3);
  });
});

describe("findUnits: code units by id, file or description", () => {
  const ids = (words: string, limit?: number) => findUnits(GIT, words, limit).map((h) => h.id);

  it("finds a function by the words inside its name, whole or in part, with its file, lines and description", () => {
    expect(findUnits(GIT, "isClosed")).toEqual([{ id: "src/months.ts#MonthBook.isClosed", file: "src/months.ts", lines: [30, 33], text: "Says whether a month is closed." }]);
    expect(ids("close month")[0]).toBe("src/months.ts#closeMonth");
    // a function nobody described yet has no text
    expect(findUnits(GIT, "roundTotal")).toEqual([{ id: "src/statements.ts#roundTotal", file: "src/statements.ts", lines: [42, 47] }]);
  });

  it("finds by file as written and by a unit's exact id", () => {
    expect(ids("src/months.ts")).toEqual(["src/months.ts#closeMonth", "src/months.ts#MonthBook.isClosed"]);
    expect(ids("src/entries.ts#refuseClosed")).toEqual(["src/entries.ts#refuseClosed"]);
    expect(findUnits(GIT, "c1-1")[0]).toEqual({ id: "c1-1", text: "Recording entries and refusing them when their month is closed." });
  });

  it("finds by description, a name ranking above a description", () => {
    expect(ids("carry-over")).toEqual(["src/statements.ts#buildStatement"]);
    // "statement" is in buildStatement's name and file, and in cluster c1-2's vocabulary
    expect(ids("statement")).toEqual(["src/statements.ts#buildStatement", "src/statements.ts#roundTotal", "c1-2"]);
    expect(ids("statement", 1)).toEqual(["src/statements.ts#buildStatement"]);
  });

  it("is empty where no tree was built or nothing matches", () => {
    expect(findUnits(scratch(), "month")).toEqual([]);
    expect(findUnits(GIT, "payroll")).toEqual([]);
    expect(findUnits(GIT, "")).toEqual([]);
  });
});

describe("documentParts: the documents in groups of like size", () => {
  function repo(): string {
    const root = scratch();
    const sizes: Record<string, number> = { "README.md": 900, "docs/rules.md": 500, "docs/months.md": 400, "docs/guide/start.md": 300, "notes.md": 200, "docs/changes.md": 100 };
    for (const [rel, size] of Object.entries(sizes)) write(root, rel, "x".repeat(size));
    write(root, "canon/README.md", "x".repeat(5000));
    write(root, "node_modules/pkg/README.md", "x".repeat(5000));
    write(root, "src/app.ts", "x".repeat(5000));
    return root;
  }
  const root = repo();
  const bytes: Record<string, number> = { "README.md": 900, "docs/rules.md": 500, "docs/months.md": 400, "docs/guide/start.md": 300, "notes.md": 200, "docs/changes.md": 100 };
  const weight = (g: string[]) => g.reduce((a, f) => a + (bytes[f] ?? 0), 0);

  it("balances the groups by size, each file once, skipping what readers never read and the folders named", () => {
    const groups = documentParts(root, 2, ["canon"]);
    expect(groups).toEqual([["README.md", "docs/guide/start.md"], ["docs/changes.md", "docs/months.md", "docs/rules.md", "notes.md"]]);
    expect(groups.map(weight)).toEqual([1200, 1200]);
    const three = documentParts(root, 3, ["canon"]);
    expect(three.flat().sort()).toEqual(Object.keys(bytes).sort());
    expect(Math.max(...three.map(weight)) - Math.min(...three.map(weight))).toBeLessThanOrEqual(200);
  });

  it("includes the canon folder unless it is named, as the reading count does", () => {
    expect(documentParts(root, 1).flat()).toContain("canon/README.md");
    expect(documentParts(root, 1, ["canon"]).flat()).not.toContain("canon/README.md");
  });

  it("never returns an empty group: one part holds all, more parts than files give one file each, no files give none", () => {
    expect(documentParts(root, 1, ["canon"])).toEqual([["README.md", "docs/changes.md", "docs/guide/start.md", "docs/months.md", "docs/rules.md", "notes.md"]]);
    expect(documentParts(root, 40, ["canon"]).map((g) => g.length)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(documentParts(root, 0, ["canon"])).toHaveLength(1);
    expect(documentParts(scratch(), 3)).toEqual([]);
  });
});

describe("lookupCli: the four commands", () => {
  function ctx(over: Partial<CliCtx> = {}): { c: CliCtx; got: { out: string; err: string } } {
    const got = { out: "", err: "" };
    const c: CliCtx = { canonDir: CANON, repo: FIX, gitDir: GIT, port: 0, by: undefined, json: false, out: (s) => { got.out += s; }, err: (s) => { got.err += s; }, stdin: () => "", ...over };
    return { c, got };
  }

  it("context prints the text contextText gives, with the store's descriptions, within --budget", async () => {
    const a = ctx();
    expect(await lookupCli("context", ["REQ-2.1.1"], a.c)).toBe(0);
    expect(a.got.out).toBe(contextText(loadCanon(CANON), "REQ-2.1.1", { gitDir: GIT }));
    expect(a.got.err).toBe("");
    const b = ctx();
    expect(await lookupCli("context", ["REQ-2.1.1", "--budget", "700"], b.c)).toBe(0);
    expect(b.got.out.length).toBeLessThanOrEqual(700);
    expect(b.got.out).toContain("Left out to stay within 700 characters");
    const j = ctx({ json: true });
    expect(await lookupCli("context", ["ROOT"], j.c)).toBe(0);
    expect(JSON.parse(j.got.out)).toEqual({ id: "ROOT", text: contextText(loadCanon(CANON), "ROOT", { gitDir: GIT }) });
  });

  it("context says so on stderr when the id is unknown or the call is wrong", async () => {
    const a = ctx();
    expect(await lookupCli("context", ["REQ-77"], a.c)).toBe(1);
    expect(a.got.out).toBe("");
    expect(a.got.err).toContain("no node REQ-77 in the canon");
    const b = ctx();
    expect(await lookupCli("context", [], b.c)).toBe(2);
    expect(b.got.err).toContain("usage: headcanon context <id>");
    const c = ctx();
    expect(await lookupCli("context", ["ROOT", "--budget", "lots"], c.c)).toBe(2);
  });

  it("find prints one line per hit: id, title, where, and the line when it is not the title", async () => {
    const a = ctx();
    expect(await lookupCli("find", ["carry-over entries", "--limit", "3"], a.c)).toBe(0);
    expect(a.got.out).toBe([
      "REQ-2.1.2  Closing a month totals its entries  [intent]  Closing a month adds up its entries and hands the carry-over to the next month.",
      "REQ-3.1.1  A statement lists every entry of its month  [intent]  A statement opens with the carry-over from the month before and lists every entry of its month.",
      "REQ-1  Entries  [title]",
      "",
    ].join("\n"));
    // the words may come unquoted, one argument each
    const b = ctx();
    expect(await lookupCli("find", ["carry-over", "entries", "--limit", "3"], b.c)).toBe(0);
    expect(b.got.out).toBe(a.got.out);
    const j = ctx();
    expect(await lookupCli("find", ["0.333", "--json"], j.c)).toBe(0);
    expect(JSON.parse(j.got.out)).toEqual(findNodes(loadCanon(CANON), "0.333"));
    const none = ctx();
    expect(await lookupCli("find", ["payroll"], none.c)).toBe(0);
    expect(none.got.out).toBe('No hit for "payroll".\n');
    const bad = ctx();
    expect(await lookupCli("find", [], bad.c)).toBe(2);
  });

  it("code find prints one line per unit: id, where it is, its description", async () => {
    const a = ctx();
    expect(await lookupCli("code-find", ["statement"], a.c)).toBe(0);
    expect(a.got.out).toBe([
      "src/statements.ts#buildStatement  src/statements.ts:8-40  Builds the statement of a month from its entries and the carry-over.",
      "src/statements.ts#roundTotal  src/statements.ts:42-47  (no description yet)",
      "c1-2  cluster  (no description yet)",
      "",
    ].join("\n"));
    // a caller that leaves the word "find" in is understood
    const b = ctx();
    expect(await lookupCli("code-find", ["find", "statement"], b.c)).toBe(0);
    expect(b.got.out).toBe(a.got.out);
    const j = ctx({ json: true });
    expect(await lookupCli("code-find", ["isClosed"], j.c)).toBe(0);
    expect(JSON.parse(j.got.out)).toEqual(findUnits(GIT, "isClosed"));
  });

  it("code find says what is missing when there is no repository or no tree", async () => {
    const a = ctx({ gitDir: undefined });
    expect(await lookupCli("code-find", ["month"], a.c)).toBe(1);
    expect(a.got.err).toContain("no git repository above the canon");
    const b = ctx({ gitDir: scratch() });
    expect(await lookupCli("code-find", ["month"], b.c)).toBe(1);
    expect(b.got.err).toContain("no code tree yet");
    const c = ctx();
    expect(await lookupCli("code-find", [], c.c)).toBe(2);
  });

  it("reading parts prints the groups as JSON, the canon folder left out", async () => {
    const root = scratch();
    write(root, "README.md", "x".repeat(300));
    write(root, "docs/a.md", "x".repeat(200));
    write(root, "docs/b.md", "x".repeat(100));
    write(root, "canon/README.md", "x".repeat(900));
    const a = ctx({ repo: root, canonDir: join(root, "canon"), gitDir: undefined });
    expect(await lookupCli("reading-parts", ["2"], a.c)).toBe(0);
    expect(JSON.parse(a.got.out)).toEqual([["README.md"], ["docs/a.md", "docs/b.md"]]);
    expect(a.got.out).toBe('[\n ["README.md"],\n ["docs/a.md","docs/b.md"]\n]\n');
    const b = ctx({ repo: root, canonDir: join(root, "canon"), gitDir: undefined });
    expect(await lookupCli("reading-parts", ["parts", "2"], b.c)).toBe(0);
    expect(b.got.out).toBe(a.got.out);
    const bad = ctx({ repo: root, canonDir: join(root, "canon") });
    expect(await lookupCli("reading-parts", ["many"], bad.c)).toBe(2);
    expect(bad.got.err).toContain("usage: headcanon reading parts <n>");
    const empty = scratch();
    const none = ctx({ repo: empty, canonDir: join(empty, "canon") });
    expect(await lookupCli("reading-parts", ["3"], none.c)).toBe(0);
    expect(none.got.out).toBe("[]\n");
  });
});
