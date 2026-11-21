/**
 * The canon format, as data: what each kind of entry carries, the start sequence a session runs on an existing
 * canon, and the versions the format has had with what each changed. The check enforces the rules named here,
 * the root README records the version a canon was written under, and the start sequence brings an older canon
 * up instead of letting it break. `HC format` prints this; docs/format.md is that print, kept in step by a test.
 */
import type { Canon } from "./types.js";

/** The version of the format this HeadCanon writes and checks. */
export const FORMAT_VERSION = 4;

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

const NODE_STATES = ["stated", "resolved", "assumed", "draft", "contested"];

export const FORMAT: Record<"root" | "node" | "journey" | "decision" | "principle" | "term", TypeRule> = {
  root: {
    what: "The premise: what the project is and for whom, what it is not, its principles and its glossary.",
    where: "`canon/README.md`, front matter `id: ROOT`.",
    required: ["id", "title", "state", "format"],
    optional: ["partition", "source"],
    states: ["stated", "resolved", "assumed", "draft"],
    needsOneOf: ["Intent", "Purpose"],
    sections: ["Stated", "Resolution", "Implemented by", "Not this", "Principles", "Glossary"],
    rules: [
      "`format` is the version of this format the canon was written under; an older one is brought up by the start sequence [format-version], a newer one needs a newer HeadCanon [format-newer].",
      "`## As built` on the root is the session's survey of what the repository is today: its entry points, modules, surfaces, data and tests, one line each with its path, written from the code so that a project without documents still yields a premise, and rewritten whenever the code is re-read; the Intent says what the project is for, and the two are never one sentence.",
      "`partition` is the question the top-level nodes answer, written when the premise is refined.",
      "Approving the root clears the markers on its own sections and leaves the Glossary heading's marker alone: terms are approved one by one.",
    ],
  },
  node: {
    what: "One entry of the tree, in one or two sentences that read as an encyclopedia entry. There is one node type; its layer, domain, capability or requirement, is a field on it, not a type of its own.",
    where: "`canon/REQ-1-<slug>/README.md` when it has children, `canon/REQ-1-<slug>/REQ-1.1-<slug>.md` when it is a leaf; the id mirrors the path.",
    required: ["id", "title", "state"],
    optional: ["parent", "layer", "source", "kind", "partition", "relates", "conflicts", "requires", "steps", "files", "baseline", "uid", "binds"],
    states: NODE_STATES,
    needsOneOf: ["Intent", "Stated"],
    sections: ["Resolution", "Check", "Implemented by", "Not this", "Contested", "Deferred", "Assumptions", "Open"],
    rules: [
      "`## As built` is the session's record of what the code does today for the entry, one to three lines each ending in its `path:lines`, apart from the Intent, which says what must hold; it is rewritten whenever the code is re-read and never approved, so a guess read off the code and the project's want never share a sentence. Where the code does otherwise than the Intent says, the node is contested and the contradiction is an issue; where the code does not implement the Intent yet, As built says `not built` with what exists instead, and no question is asked; neither case rewrites the Intent silently.",
      "The title names a thing, never a question [title-question]; the ids are unique [duplicate-id], the parent exists [parent-missing], and the id's path matches its parent's [parent-mismatch].",
      "An Intent, or the human's Stated words, is never missing [intent-missing]; a draft (`state: draft`) keeps one line of what is known, and its question is an issue, never a section.",
      "Only the sections named here [section-unknown]: `## Open` holds a dated note: a gap between the artifacts and the intent and what would settle it, or the choice a guess made and the alternatives it had; `## Deferred` what the node will hold once refined, one line each with its origin; `## Contested` a one-paragraph summary and one bullet per statement with its sources; `## Assumptions` what the session decided alone.",
      "`layer` is one of three, never above the parent's [layer-order]. A domain is an area the product must have to operate: the top level under the premise, drawn from the premise and from what every software project needs (documentation, verification), never from artifacts alone. A capability is what a domain must be able to do, drawn from what every system of its kind needs; it has requirements under it [uncovered-capability] and never a check of its own. A requirement is a thing that must hold, drawn mostly from artifacts, nested as deep as the thing needs. A project with fewer than about eight areas has no domain layer: its top level is capabilities. Without the field the layer is inferred from depth, for display only [layer-inferred].",
      "A node with children or a `kind` is refined; every other node is a leaf still to refine, which the check counts. Refinement ends at a requirement that carries `kind` (binary, numeric or open-ended) and a one-sentence `## Check` of what is observed and what counts as yes [kind-missing, check-missing]. A requirement is a requirement at every depth: a parent is verified at its own level, by its children when they entail it, by a `## Check` it keeps for itself when they do not, the integration check. An open-ended kind is a goal rather than a requirement, kept only when the human accepts it. A requirement's title reads as a claim; a capability's names a subject.",
      "`relates`, `conflicts` and `requires` name existing nodes [link-unknown]; `requires` has no cycle [requires-cycle]; a node with two or more children records `partition` [no-partition].",
      "`source` names where the entry came from: `path:lines`, `conversation, <date>`, or `archetype`; a human's typed words are `stated` and quoted under `## Stated`.",
      "What a good node is, beyond its shape, is the Quality list below: the check decides the deterministic tests under their codes, the reviewing agent reads and judges the rest, and a review finding names the test it failed.",
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
    where: "`canon/decisions/DEC-n-<slug>.md`. An adoption is finished when every branch ends in a requirement with its check; a canon adopted before format 4 says it with its scope record, DEC-001.",
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
  "Say the counts in one line, drafts made, issues filed, sections folded, and the next box for the human: the first entry of `headcanon next`'s `human` list, ranked by impact, the boxes an approval validates or a settled red box frees.",
];

/** The check codes that say an entry does not fit the format; the start sequence brings each in. */
export const FIT_CODES = new Set(["title-question", "intent-missing", "section-unknown", "glossary-inherited"]);

/**
 * What a good entry is, as yes-or-no tests (docs/research/2026-11-15-requirement-quality.md): the characteristics
 * the literature gives a requirement, a verification criterion, a decomposition, a set and a glossary, each with who
 * decides it. `check` is decided by `headcanon check` under the code named; `reviewer` is read and judged by the agent
 * that reviews a set, the branch agent, and by the refiner before it reports; `human` only the human can say, so a
 * failure there is an issue, never a correction. A review finding names one of these by its name.
 */
export interface QualityCheck {
  scope: "intent" | "check" | "hierarchy" | "set" | "glossary";
  name: string;
  /** The yes-or-no question. */
  test: string;
  how: "check" | "reviewer" | "human";
  /** A no here fails the set under review; a no on any other reviewer check is a note the refiner applies. */
  fatal?: boolean;
  /** The check code, for `how: check`. */
  code?: string;
  sources: string;
}

export const QUALITY: QualityCheck[] = [
  // the Intent: one requirement statement
  { scope: "intent", name: "present", test: "Has the node an Intent, or the human's Stated words?", how: "check", code: "intent-missing", sources: "ISO 29148 5.2.8; INCOSE GtWR R29" },
  { scope: "intent", name: "title-names", test: "Is the title a thing, never a question; a requirement's a claim, a capability's a subject, and does it describe what the Intent says?", how: "check", code: "title-question", sources: "Femmer 2017 S14; KAOS naming; the format" },
  { scope: "intent", name: "form", test: "Is the Intent one or two sentences?", how: "check", code: "intent-long", sources: "INCOSE GtWR R18; Genova 2013; the Entries rule" },
  { scope: "intent", name: "no-subjective", test: "Is it free of judgements the reader cannot measure (user-friendly, easy, efficient, robust, adequate, appropriate)?", how: "check", code: "subjective", sources: "ISO 29148 5.2.7; Femmer 2017 F1" },
  { scope: "intent", name: "no-escape", test: "Is it free of loopholes (if possible, as appropriate, as required, where feasible)?", how: "check", code: "escape-clause", sources: "ISO 29148 5.2.7; INCOSE GtWR R8; Femmer 2017 F3" },
  { scope: "intent", name: "no-open-end", test: "Is it free of open sets (including but not limited to, etc., and so on, as a minimum)?", how: "check", code: "open-ended", sources: "ISO 29148 5.2.7; INCOSE GtWR R9; Femmer 2017 F5" },
  { scope: "intent", name: "no-vague", test: "Is it free of unmeasured quantities and qualities (some, several, usually, significant, sufficient, timely, large, quickly)?", how: "check", code: "vague", sources: "ISO 29148 5.2.7; INCOSE GtWR R7; Femmer 2017 F2" },
  { scope: "intent", name: "no-placeholder", test: "Is it free of holes left to fill (TBD, TODO, to be determined)?", how: "check", code: "placeholder", sources: "ISO 29148 5.2.6; IEEE 830 4.3.3" },
  { scope: "intent", name: "no-hedge", test: "Is it free of doubt written as prose (probably, might, could, perhaps)? A doubtful entry is a draft with its question.", how: "check", code: "hedge", sources: "Berry, Kamsties and Krieger; Genova 2013" },
  { scope: "intent", name: "no-reason", test: "Is it free of reasons and purposes (in order to, so that, because)? Reasons live in decision records.", how: "check", code: "purpose-clause", sources: "INCOSE GtWR R20; the Entries rule" },
  { scope: "intent", name: "no-and-or", test: "Is it free of and/or?", how: "check", code: "and-or", sources: "ISO 29148 5.2.7; INCOSE GtWR R15" },
  { scope: "intent", name: "indicative", test: "Is it written as what is, without shall, should or must? The obligation is the slot, the Intent is indicative.", how: "check", code: "intent-modal", sources: "Zave and Jackson 1997; Gleich 2010; research note 3.4" },
  { scope: "intent", name: "names-the-thing", test: "Does no sentence start with a pronoun and a verb (This is, It has)?", how: "check", code: "pronoun-start", sources: "INCOSE GtWR R24; QuARS implicity" },
  { scope: "intent", name: "measured-comparison", test: "Is every comparative or superlative (faster, best, most) held to a number or a finite set?", how: "check", code: "comparative", sources: "ISO 29148 5.2.7; Femmer 2017 F6 to F9" },
  { scope: "intent", name: "bounded-universal", test: "Is every always, never or at all times backed by an enumerated set or a window?", how: "check", code: "absolute", sources: "ISO 29148 5.2.7; INCOSE GtWR R26" },
  { scope: "intent", name: "observable-verb", test: "Is the main verb an observable action, not support, handle, process or manage?", how: "check", code: "vague-verb", sources: "INCOSE GtWR R3; Paska P9" },
  { scope: "intent", name: "plain-words-above", test: "Is a domain or capability free of mechanisms (button, database, API, thread)?", how: "check", code: "design-term", sources: "Femmer 2017 T10; Genova 2013; the Entries rule" },
  { scope: "intent", name: "terms-defined", test: "Is every word that carries meaning here a glossary term, or proposed as one?", how: "check", code: "term-candidate", sources: "ISO 29148; INCOSE GtWR R4; Arora 2017" },
  { scope: "intent", name: "sourced", test: "Does a guess carry its chain and the thread it rests on in `source`?", how: "check", code: "source-missing", sources: "ISO 29148 traceability; INCOSE GtWR A2; the Guessing rule" },
  { scope: "intent", name: "one-reading", test: "Would an implementer and a verifier paraphrase it to the same subject, action, object, bound and condition?", how: "reviewer", fatal: true, sources: "ISO 29148 5.2.5; INCOSE GtWR C3; Davis 1993 Q1" },
  { scope: "intent", name: "complete-in-itself", test: "Can a reader understand it cold, glossary aside: the capability, how well, and under what conditions, none inferred?", how: "reviewer", sources: "ISO 29148 5.2.5; INCOSE GtWR C4, R27" },
  { scope: "intent", name: "singular", test: "Does it state one capability, under however many conditions; would any part be verified or placed apart?", how: "reviewer", sources: "ISO 29148 5.2.5 note 2; INCOSE GtWR C5; Honig et al." },
  { scope: "intent", name: "entity-subject", test: "Is the subject the entity at this level, named in the sentence, never a user or a role?", how: "reviewer", sources: "ISO 29148 5.2.4; INCOSE GtWR R3, R25; EARS one system name" },
  { scope: "intent", name: "encyclopedia-entry", test: "Does it say what the thing is, with no history, no exclusion, no count, no version, no status?", how: "reviewer", sources: "the Entries rule; INCOSE GtWR C2" },
  { scope: "intent", name: "implementation-free", test: "Could more than one design satisfy it; does it name no mechanism the need does not impose, or is it a constraint with its reason recorded?", how: "reviewer", sources: "ISO 29148 5.2.5; INCOSE GtWR R31; Davis 1993 Q10; Zave and Jackson" },
  { scope: "intent", name: "own-level", test: "Is every detail about this node's entity at this depth, nothing a child or the rationale holds?", how: "reviewer", sources: "ISO 29148 5.2.5; INCOSE GtWR C2; Femmer 2017 F19" },
  { scope: "intent", name: "prescriptive", test: "Could the software's behaviour make the sentence false? A sentence true whatever the software does is a domain fact; one that cannot be false is a definition, for the glossary.", how: "reviewer", sources: "KAOS; Zave and Jackson 1997; Kamsties 2001" },
  { scope: "intent", name: "faithful", test: "Does it say what the cited thread says, no more, no less?", how: "reviewer", fatal: true, sources: "ISO 29148 5.2.5; INCOSE GtWR C8; Porter 1995 incorrect fact" },
  { scope: "intent", name: "necessary", test: "If this node were deleted, would a gap remain that no other node fills?", how: "human", sources: "ISO 29148 5.2.5; INCOSE GtWR C1; machine reviewers miss it, Shefa 2024" },
  { scope: "intent", name: "wanted", test: "Is it what the project wants, in the human's judgement?", how: "human", sources: "ISO 29148 5.2.5 correct; Zave and Jackson, the customer's prerogative" },
  // the Check: one verification criterion on a leaf
  { scope: "check", name: "present", test: "Does every leaf carry a `kind` and a Check?", how: "check", code: "check-missing", sources: "ISO 29148 5.2.5 verifiable; Robertson fit criterion; the leaf contract" },
  { scope: "check", name: "one-sentence", test: "Is the Check one sentence?", how: "check", code: "check-long", sources: "the leaf contract; EARS guard and assertion" },
  { scope: "check", name: "numbers-carry-units", test: "Does every number in the Check name its unit or the thing counted?", how: "check", code: "number-unit", sources: "INCOSE GtWR R6; Ferrari 2018 PMU; IEEE 830" },
  { scope: "check", name: "shape", test: "Does it name what is observed, on this node's entity, and what counts as yes, so that a verifier writes pass or fail from the sentence and the glossary alone?", how: "reviewer", fatal: true, sources: "INCOSE GtWR C7; ISO 29148 verifiable; EARS stimulus, observed output, expected value" },
  { scope: "check", name: "guarded", test: "Does it say when the observation is made, the state and the event, with nothing evaluated outside them?", how: "reviewer", sources: "EARS, response iff preconditions and trigger; T-EARS" },
  { scope: "check", name: "same-property", test: "Is there no behaviour that passes the Check yet breaks the Intent, nor the reverse?", how: "reviewer", fatal: true, sources: "KAOS; Hull, Jackson and Dick, parent verified at its level" },
  { scope: "check", name: "decidable", test: "Can yes or no be decided at observation time from the past and the present, with no eventually and no never without a window?", how: "reviewer", fatal: true, sources: "Zave and Jackson rule c; KAOS bounded Achieve; Ferrari 2018" },
  { scope: "check", name: "numeric-measure", test: "For a numeric kind, does it name the measure, how it is measured, and the bound with its unit and tolerance?", how: "reviewer", sources: "INCOSE GtWR R33, R34; Gilb scale and meter; IEEE 830" },
  { scope: "check", name: "judged", test: "For an open-ended kind, does it name who or what judges, which artefact, and why that is enough; else a quantity, a direction and a target?", how: "reviewer", sources: "KAOS soft goals; the leaf contract" },
  { scope: "check", name: "other-case", test: "Is the case where the trigger does not hold covered, here or in a sibling?", how: "reviewer", sources: "EARS, two test cases per requirement; Kiro" },
  // the hierarchy: a parent and its children
  { scope: "hierarchy", name: "a-set", test: "Has a refined node two or more children, and a partition naming the question they answer?", how: "check", code: "single-child", sources: "KAOS no trivial refinement; the refine skill; INCOSE SEH" },
  { scope: "hierarchy", name: "no-restating", test: "Does no child repeat its parent's title; does each add refinement?", how: "check", code: "restates-parent", sources: "INCOSE GtWR R30; KAOS non-triviality" },
  { scope: "hierarchy", name: "entailment", test: "If every child holds, with the domain facts named, must the parent hold in every case? A counterexample is a missing child, or the parent's own Check.", how: "reviewer", fatal: true, sources: "KAOS completeness; Zave and Jackson S, K entail R; INCOSE GtWR C10; the refine skill" },
  { scope: "hierarchy", name: "minimal", test: "For each child, with it removed, is there a case where the rest hold and the parent fails? One whose removal changes nothing is redundant.", how: "reviewer", sources: "KAOS minimality; INCOSE GtWR C1; Preda leave-one-out" },
  { scope: "hierarchy", name: "consistent", test: "Is there one behaviour that satisfies all the children together?", how: "reviewer", fatal: true, sources: "KAOS consistency; Zave and Jackson" },
  { scope: "hierarchy", name: "justified", test: "Can \"why does this child exist?\" be answered from the parent alone?", how: "reviewer", sources: "ISO 29148 6.4.3.5; the ladder" },
  { scope: "hierarchy", name: "right-level", test: "Is each child about the entity of the set it sits in, neither the parent's generality nor a grandchild's detail?", how: "reviewer", sources: "INCOSE GtWR C2; Femmer 2017 F19, F31" },
  { scope: "hierarchy", name: "cases-cover", test: "When the children split by case, are the cases disjoint and together exhaustive, each case keeping the parent's target?", how: "reviewer", sources: "KAOS case-driven refinement; Heitmeyer coverage and disjointness" },
  { scope: "hierarchy", name: "other-case-covered", test: "Does every conditional behaviour have its counterpart, the case where the condition fails, in a sibling or in a recorded decision that none is needed?", how: "reviewer", sources: "EARS unwanted behaviour; Ferrari 2018 PMC; Jaffe 1991" },
  { scope: "hierarchy", name: "parent-check", test: "Does a parent whose children do not entail it keep a Check of its own?", how: "reviewer", sources: "DEC-021; Hull, Jackson and Dick" },
  // the set: the whole canon
  { scope: "set", name: "links-resolve", test: "Does every link name an existing node, with no cycle in requires?", how: "check", code: "link-unknown", sources: "ISO 29148 traceability; IEEE 830" },
  { scope: "set", name: "one-id", test: "Is every id claimed once?", how: "check", code: "duplicate-id", sources: "ISO 29148; IEEE 830" },
  { scope: "set", name: "one-concept", test: "Do no two nodes constrain the same glossary phenomenon of the same entity under overlapping conditions? Else merge or nest.", how: "reviewer", fatal: true, sources: "KAOS; PRN-1; the coherence pass; the critic's gap 1" },
  { scope: "set", name: "no-conflict", test: "For nodes with a shared subject and overlapping conditions, can one system satisfy both at once?", how: "reviewer", fatal: true, sources: "ISO 29148 consistent; INCOSE GtWR C11; KAOS divergence" },
  { scope: "set", name: "bindings-sorted", test: "Is every bound unit a convergence (implements: the code does what the Intent says), a divergence (contradicts, with its issue) or a contribution, and is a child the premise requires with nothing bound marked not built?", how: "reviewer", fatal: true, sources: "Murphy, Notkin and Sullivan reflexion; DEC-025" },
  { scope: "set", name: "complete", test: "Is every situation the premise names covered by a node, and does no node cover a situation that cannot occur?", how: "human", sources: "ISO 29148 5.2.6; Davis 1993; Zave and Jackson, all the customer's desires" },
  // the glossary
  { scope: "glossary", name: "declarative", test: "Is every definition a statement of what the term is, never an obligation?", how: "check", code: "glossary-prescriptive", sources: "ISO 29148 5.2.7; Zave and Jackson, a definition cannot be false" },
  { scope: "glossary", name: "one-meaning", test: "Does every occurrence of a term read in the glossary's sense?", how: "reviewer", sources: "INCOSE GtWR R4, R36; Dalpiaz 2019" },
  { scope: "glossary", name: "one-term", test: "Do no two terms denote one concept; else one term, or both defined with the distinction stated?", how: "reviewer", sources: "INCOSE GtWR R36; IEEE 830; Dalpiaz 2019" },
  { scope: "glossary", name: "decides-membership", test: "Does the definition settle a borderline instance by itself?", how: "reviewer", sources: "KAOS; Zave and Jackson designations" },
  { scope: "glossary", name: "measured-term", test: "Does a term that is a quantity carry its unit and range?", how: "reviewer", sources: "INCOSE GtWR R4; Porter 1995" },
];

export interface FormatChange {
  version: number;
  date: string;
  /** What this version changed, one line each. */
  changes: string[];
  /** How the start sequence brings a canon of the version before up to this one; the check codes that catch the older form in brackets. */
  broughtUp: string[];
}

/** The mechanical part of bringing a file up to this format; returns the text and what changed. */
export function upgradeText(text: string, uid: () => string): { text: string; changed: string[] } {
  const changed: string[] = [];
  let out = text;
  if (/^state:\s*open\s*$/m.test(out)) { out = out.replace(/^state:\s*open\s*$/m, "state: draft"); changed.push("state open to draft"); }
  if (/^##[ \t]+As built[ \t]*$/m.test(out)) { out = out.replace(/^##[ \t]+As built[ \t]*$/m, "## Implemented by"); changed.push("As built to Implemented by"); }
  if (/^kind:\s*\S/m.test(out) && !/^uid:\s*\S/m.test(out)) { out = out.replace(/^(kind:[^\n]*)$/m, `$1\nuid: ${uid()}`); changed.push("uid added"); }
  return { text: out, changed };
}

/** Newest first. The head is the current version. */
export const HISTORY: FormatChange[] = [
  {
    version: 4,
    date: "2026-11-16",
    changes: [
      "`draft` is the state of a node whose definition waits on an issue; it replaces `open`, which the loader still reads as draft (DEC-025).",
      "`## Implemented by` replaces `## As built`: the documents that state the entry and the code units bound to it with the relation implements, each with its source; the session writes it from the bindings, never the human.",
      "`uid` is a stable id on every node that carries a requirement; it survives a move, so tests and bindings keep their target. `binds` lists the evidence a node rests on as \"<relation> <unit>\": implements, contributes or contradicts a code unit, a cluster or a claim (DEC-025).",
      "Below a capability the tree goes as deep as explicitness allows: every node is an intent node, and from the capability layer down it carries a requirement that its children make more explicit; the leaf is where intent and requirement coincide.",
    ],
    broughtUp: [
      "`headcanon upgrade` rewrites `state: open` as `draft`, renames `## As built` to `## Implemented by` and adds a `uid` where a requirement has none [uid-missing].",
      "Then `format: 4` is written on the root [format-version].",
    ],
  },
  {
    version: 3,
    date: "2026-11-15",
    changes: [
      "`## As built` is a section of every node and of the root: what the code does today for the entry, with its `path:lines`, written by the session whenever it reads the code and never approved; the Intent says what must hold, so what the code does and what the project wants no longer share a sentence. An Intent the code contradicts, where the code does otherwise, is a contradiction issue; an Intent the code does not implement yet is a line under As built saying so, never a question.",
      "Adoption drafts the canon to its leaves before the human is asked anything (DEC-024): the reach of DEC-018 and DEC-023 is gone, a red box alone holds its subtree back, and `headcanon next`'s `human` list ranks what the human can approve or settle by impact, the boxes an approval validates or a settled red box frees, the premise first; the list stands after adoption, and `headcanon next <ID>` names the path to validate before work under a box.",
      "The Quality list: what a good Intent, Check, decomposition, set and glossary are, as yes-or-no tests with who decides each, drawn from the requirements literature; the check runs the deterministic ones, the language checks among them over a node's own words as warnings or notes and over the human's Stated words as notes.",
    ],
    broughtUp: [
      "Nothing to fold: a canon without `## As built` fits, and the sections fill as the session re-reads the code.",
      "Then `format: 3` is written on the root [format-version].",
    ],
  },
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
  out.push("## Quality", "", "What a good entry is, as yes-or-no tests, from the literature read on 2026-11-15 (docs/research/2026-11-15-requirement-quality.md). Who decides: `check` is `headcanon check` under the code shown; `reviewer` is the agent that reviews a set, which reads and judges each; `human` only the human can say, so a failure is an issue. A set fails its review when a check marked fatal says no, or when `headcanon check` reports an error; every other no is a note the refiner applies without another review. A review finding names the check by its name.", "");
  const scopes: Record<QualityCheck["scope"], string> = { intent: "The Intent: one requirement statement", check: "The Check: one verification criterion on a leaf", hierarchy: "The hierarchy: a parent and its children", set: "The set: the whole canon", glossary: "The glossary" };
  for (const scope of Object.keys(scopes) as Array<QualityCheck["scope"]>) {
    out.push(`### ${scopes[scope]}`, "", "| Check | Test | Who | Sources |", "|---|---|---|---|");
    for (const q of QUALITY.filter((x) => x.scope === scope)) out.push(`| ${q.name} | ${q.test} | ${q.how === "check" ? `check \`${q.code}\`` : q.fatal ? `${q.how}, fatal` : q.how} | ${q.sources} |`);
    out.push("");
  }
  out.push("## The start sequence", "", "On an existing canon, before any other work:", "", ...START_SEQUENCE.map((s, i) => `${i + 1}. ${s}`), "", "## Versions", "");
  for (const h of HISTORY) {
    out.push(`### ${h.version} (${h.date})${h.version === FORMAT_VERSION ? ", current" : ""}`, "", ...h.changes.map((c) => `- ${c}`), "");
    if (h.broughtUp.length) out.push(`Brought up from ${h.version - 1} by the start sequence:`, "", ...h.broughtUp.map((b) => `- ${b}`), "");
  }
  return out.join("\n");
}
