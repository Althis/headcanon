/**
 * The canon format, as data: what each kind of entry carries, the start sequence a session runs on an existing
 * canon, and the versions the format has had with what each changed. The check enforces the rules named here,
 * the root README records the version a canon was written under, and the start sequence brings an older canon
 * up instead of letting it break. `HC format` prints this; docs/format.md is that print, kept in step by a test.
 */
import type { Canon } from "./types.js";

/** The version of the format this HeadCanon writes and checks. */
export const FORMAT_VERSION = 2;

export interface TypeRule {
  /** The entry, in a sentence. */
  what: string;
  /** Where it lives. */
  where: string;
  /** Front-matter fields it must carry. */
  required: string[];
  /** Fields it may carry. */
  optional: string[];
  /** The states it may be in. */
  states: string[];
  /** Sections it must carry, any one of; empty when it has no sections. */
  needsOneOf: string[];
  /** Sections it may carry besides. */
  sections: string[];
  /** The rules in words; a code in brackets names the check finding that enforces one. */
  rules: string[];
}

const NODE_STATES = ["stated", "resolved", "assumed", "open", "contested"];

export const FORMAT: Record<"root" | "node" | "journey" | "decision" | "principle" | "term", TypeRule> = {
  root: {
    what: "The premise: what the project is and for whom, what it is not, its principles and its glossary.",
    where: "`canon/README.md`, front matter `id: ROOT`.",
    required: ["id", "title", "state", "format"],
    optional: ["partition", "source"],
    states: ["stated", "resolved", "assumed", "open"],
    needsOneOf: ["Intent", "Purpose"],
    sections: ["Stated", "Resolution", "Not this", "Principles", "Glossary"],
    rules: [
      "`format` is the version of this format the canon was written under; an older one is brought up by the start sequence [format-version], a newer one needs a newer HeadCanon [format-newer].",
      "`partition` is the question the top-level nodes answer, written when the premise is cut.",
      "Approving the root clears the markers on its own sections and leaves the Glossary heading's marker alone: terms are approved one by one.",
    ],
  },
  node: {
    what: "One entry of the tree, in one or two sentences that read as an encyclopedia entry. There is one node type; its layer, domain, capability or requirement, is a field on it, not a type of its own.",
    where: "`canon/REQ-1-<slug>/README.md` when it has children, `canon/REQ-1-<slug>/REQ-1.1-<slug>.md` when it is a leaf; the id mirrors the path.",
    required: ["id", "title", "state"],
    optional: ["parent", "layer", "source", "kind", "partition", "relates", "conflicts", "requires", "steps", "files", "baseline"],
    states: NODE_STATES,
    needsOneOf: ["Intent", "Stated"],
    sections: ["Resolution", "Check", "Not this", "Contested", "Deferred", "Assumptions", "Open"],
    rules: [
      "The title names a thing, never a question [title-question]; the ids are unique [duplicate-id], the parent exists [parent-missing], and the id's path matches its parent's [parent-mismatch].",
      "An Intent, or the human's Stated words, is never missing [intent-missing]; a draft (`state: open`) keeps one line of what is known, and its question is an issue, never a section.",
      "Only the sections named here [section-unknown]: `## Open` holds a dated note of a gap between the artifacts and the intent and what would settle it; `## Deferred` what the node will hold once refined, one line each with its origin; `## Contested` a one-paragraph summary and one bullet per statement with its sources; `## Assumptions` what the session decided alone.",
      "`layer` is one of three, never above the parent's [layer-order]. A domain is an area the product must have to operate: the top level under the premise, drawn from the premise and from what every software project needs (documentation, verification), never from artifacts alone. A capability is what a domain must be able to do, drawn from what every system of its kind needs; it has requirements under it [uncovered-capability] and never a check of its own. A requirement is a thing that must hold, drawn mostly from artifacts, nested as deep as the thing needs. A project with fewer than about eight areas has no domain layer: its top level is capabilities. Without the field the layer is inferred from depth, for display only [layer-inferred].",
      "A node with children or a `kind` is refined; every other node is a leaf still to cut, which the check counts. Cutting ends at a requirement that carries `kind` (binary, numeric or open-ended) and a one-sentence `## Check` of what is observed and what counts as yes [kind-missing, check-missing].",
      "`relates`, `conflicts` and `requires` name existing nodes [link-unknown]; `requires` has no cycle [requires-cycle]; a node with two or more children records `partition` [no-partition].",
      "`source` names where the entry came from: `path:lines`, `conversation, <date>`, or `archetype`; a human's typed words are `stated` and quoted under `## Stated`.",
    ],
  },
  journey: {
    what: "A user journey: the steps a person takes, each bound to the requirements it exercises.",
    where: "`canon/journeys/JRN-n-<slug>.md`.",
    required: ["id", "title", "state"],
    optional: ["source"],
    states: NODE_STATES,
    needsOneOf: [],
    sections: [],
    rules: [
      "The body holds a Mermaid graph of the steps [journey-no-graph] and a table of steps, each with its requirement ids [journey-no-steps, step-unlinked].",
    ],
  },
  decision: {
    what: "A decision record: a short-term choice, linked to the intent it serves; one with an origin is a caught divergence.",
    where: "`canon/decisions/DEC-n-<slug>.md`; DEC-001 is the adoption scope and marks an adoption as finished.",
    required: ["id", "title", "state"],
    optional: ["date", "intents", "origin"],
    states: NODE_STATES,
    needsOneOf: [],
    sections: [],
    rules: [
      "`intents` name existing nodes [decision-unlinked]; `origin` names a known cause [origin-unknown]; an assumed decision awaits the human [decision-unconfirmed].",
    ],
  },
  principle: {
    what: "A principle: a direction the project holds, a title and a paragraph of two to four sentences; the main alignment point.",
    where: "A line of the root README's `## Principles`: `**PRN-n Title** [state]`, then its paragraph, then an optional Source line.",
    required: [],
    optional: [],
    states: NODE_STATES,
    needsOneOf: [],
    sections: [],
    rules: ["No marker on the title line means the human's own words (stated); each principle is approved, rewritten or deleted on its own, never through the root."],
  },
  term: {
    what: "A glossary term: one concept, defined as a dictionary entry does.",
    where: "A line of the root README's `## Glossary`: `**term** (`TERM-slug`) [state]: definition`.",
    required: [],
    optional: [],
    states: NODE_STATES,
    needsOneOf: [],
    sections: [],
    rules: ["A term's own marker, after its id or at the end of its line, is its state; without one it takes the heading's marker, and `stated` when the heading has none [glossary-inherited]."],
  },
};

/** The sequence a session runs on an existing canon before any other work; the attend skill's Start step. */
export const START_SEQUENCE: string[] = [
  "`HC check --json`. A `format-newer` finding stops here: this HeadCanon is older than the canon; update it.",
  "Bring every entry the check says does not fit the format into it, as the current version's notes say: a node titled as a question or without an Intent becomes a draft with its question filed as an issue; a section the format does not define is folded into the one that holds its content, or an issue; a glossary heading whose terms inherited the root's approval is marked `[assumed]` again. Every issue goes through `headcanon_ask`, all in one call.",
  "Fix every error the check reports.",
  "When no finding about fit remains, write `format: <current version>` on the root README.",
  "Say the counts in one line, drafts made, issues filed, sections folded, and the next box for the human: the first entry of `headcanon next`'s `human` list, ranked by what approving or settling it releases.",
];

/** The check codes that say an entry does not fit the format; the start sequence brings each in. */
export const FIT_CODES = new Set(["title-question", "intent-missing", "section-unknown", "glossary-inherited"]);

export interface FormatChange {
  version: number;
  date: string;
  /** What this version changed, one line each. */
  changes: string[];
  /** How the start sequence brings a canon of the version before up to this one; the check codes that catch the older form in brackets. */
  broughtUp: string[];
}

/** Newest first. The head is the current version. */
export const HISTORY: FormatChange[] = [
  {
    version: 2,
    date: "2026-10-30",
    changes: [
      "A thing the session cannot define is a draft node: `state: open`, a provisional plain title, one line of what is known as Intent, drawn dashed on the canvas; its question is an issue the human answers in the Issues panel. Before, the question was the node's title and the node had no Intent.",
      "The `## Options` section is gone; suggestions travel with the issue.",
      "`## Open` holds a dated note of a gap between the artifacts and the intent and what would settle it, never a question for the human.",
      "`## Deferred` is part of the format: what a node will hold once it is refined, one line each with its origin.",
      "A glossary term carries its own marker after its id; the heading's marker is the default for unmarked terms, and approving the root no longer clears it.",
      "The root README records the version it was written under, `format: 2`.",
    ],
    broughtUp: [
      "A node titled as a question, or without an Intent, becomes a draft with an issue [title-question, intent-missing].",
      "A section the format does not define is folded into the one that holds its content, or becomes an issue [section-unknown].",
      "The glossary heading is marked `[assumed]` when its terms inherited the root's approval [glossary-inherited].",
      "Then `format: 2` is written on the root [format-version].",
    ],
  },
  {
    version: 1,
    date: "2026-10-17",
    changes: [
      "Draft-then-review adoption: the canon is drafted from the repository as guesses marked `assumed` and reviewed on the canvas; a thing the session could not define was an `open` node titled as the question.",
      "Every node carries `layer`; a refined node records `partition`; links are `relates`, `conflicts` and `requires`; a leaf carries `kind` and a `## Check`.",
      "Principles carry their own marker on the title line; the root README holds the premise, the principles and the glossary.",
    ],
    broughtUp: [],
  },
];

/** The version a canon was written under: its root's `format` field; none recorded means the first. */
export function canonFormatVersion(canon: Canon): number {
  return canon.root?.format ?? 1;
}

/** The versions after `version`, oldest first: what a canon written under `version` has to be brought through. */
export function changesSince(version: number): FormatChange[] {
  return HISTORY.filter((h) => h.version > version).sort((a, b) => a.version - b.version);
}

const list = (items: string[]) => items.map((i) => `\`${i}\``).join(", ");

/** The format as a document; `HC format` prints it and docs/format.md holds it. */
export function describeFormat(): string {
  const out: string[] = [
    `# The canon format, version ${FORMAT_VERSION}`,
    "",
    "What every entry of a canon carries, the sequence a session runs on an existing canon, and what each version of the format changed. The check enforces the rules named with a code in brackets; the root README records the version a canon was written under; a canon written under an older version is brought up by the start sequence, never broken. This file is printed by `headcanon format` from `packages/canon/src/format.ts`; a test keeps the two the same.",
    "",
    "## Types",
    "",
  ];
  const names: Record<keyof typeof FORMAT, string> = { root: "Root README", node: "Node (domain, capability or requirement)", journey: "Journey", decision: "Decision record", principle: "Principle", term: "Glossary term" };
  for (const key of Object.keys(FORMAT) as Array<keyof typeof FORMAT>) {
    const t = FORMAT[key];
    out.push(`### ${names[key]}`, "", t.what, "", `Where: ${t.where}`, "");
    if (t.required.length || t.optional.length) out.push(`Fields: ${t.required.length ? `required ${list(t.required)}` : "none required"}${t.optional.length ? `; optional ${list(t.optional)}` : ""}.`, "");
    out.push(`States: ${t.states.join(", ")}.`, "");
    if (t.needsOneOf.length || t.sections.length) out.push(`Sections: ${t.needsOneOf.length ? `one of ${list(t.needsOneOf)}` : "none required"}${t.sections.length ? `; may carry ${list(t.sections)}` : ""}.`, "");
    out.push("Rules:", "", ...t.rules.map((r) => `- ${r}`), "");
  }
  out.push("## The start sequence", "", "On an existing canon, before any other work:", "", ...START_SEQUENCE.map((s, i) => `${i + 1}. ${s}`), "", "## Versions", "");
  for (const h of HISTORY) {
    out.push(`### ${h.version} (${h.date})${h.version === FORMAT_VERSION ? ", current" : ""}`, "", ...h.changes.map((c) => `- ${c}`), "");
    if (h.broughtUp.length) out.push(`Brought up from ${h.version - 1} by the start sequence:`, "", ...h.broughtUp.map((b) => `- ${b}`), "");
  }
  return out.join("\n");
}
