# The canon format, version 2

What every entry of a canon carries, the sequence a session runs on an existing canon, and what each version of the format changed. The check enforces the rules named with a code in brackets; the root README records the version a canon was written under; a canon written under an older version is brought up by the start sequence, never broken. This file is printed by `headcanon format` from `packages/canon/src/format.ts`; a test keeps the two the same.

## Types

### Root README

The premise: what the project is and for whom, what it is not, its principles and its glossary.

Where: `canon/README.md`, front matter `id: ROOT`.

Fields: required `id`, `title`, `state`, `format`; optional `partition`, `source`.

States: stated, resolved, assumed, open.

Sections: one of `Intent`, `Purpose`; may carry `Stated`, `Resolution`, `Not this`, `Principles`, `Glossary`.

Rules:

- `format` is the version of this format the canon was written under; an older one is brought up by the start sequence [format-version], a newer one needs a newer HeadCanon [format-newer].
- `partition` is the question the top-level nodes answer, written when the premise is cut.
- Approving the root clears the markers on its own sections and leaves the Glossary heading's marker alone: terms are approved one by one.

### Node (domain, capability or requirement)

One entry of the tree, in one or two sentences that read as an encyclopedia entry. There is one node type; its layer, domain, capability or requirement, is a field on it, not a type of its own.

Where: `canon/REQ-1-<slug>/README.md` when it has children, `canon/REQ-1-<slug>/REQ-1.1-<slug>.md` when it is a leaf; the id mirrors the path.

Fields: required `id`, `title`, `state`; optional `parent`, `layer`, `source`, `kind`, `partition`, `relates`, `conflicts`, `requires`, `steps`, `files`, `baseline`.

States: stated, resolved, assumed, open, contested.

Sections: one of `Intent`, `Stated`; may carry `Resolution`, `Check`, `Not this`, `Contested`, `Deferred`, `Assumptions`, `Open`.

Rules:

- The title names a thing, never a question [title-question]; the ids are unique [duplicate-id], the parent exists [parent-missing], and the id's path matches its parent's [parent-mismatch].
- An Intent, or the human's Stated words, is never missing [intent-missing]; a draft (`state: open`) keeps one line of what is known, and its question is an issue, never a section.
- Only the sections named here [section-unknown]: `## Open` holds a dated note of a gap between the artifacts and the intent and what would settle it; `## Deferred` what the node will hold once refined, one line each with its origin; `## Contested` a one-paragraph summary and one bullet per statement with its sources; `## Assumptions` what the session decided alone.
- `layer` is one of three, never above the parent's [layer-order]. A domain is an area the product must have to operate: the top level under the premise, drawn from the premise and from what every software project needs (documentation, verification), never from artifacts alone. A capability is what a domain must be able to do, drawn from what every system of its kind needs; it has requirements under it [uncovered-capability] and never a check of its own. A requirement is a thing that must hold, drawn mostly from artifacts, nested as deep as the thing needs. A project with fewer than about eight areas has no domain layer: its top level is capabilities. Without the field the layer is inferred from depth, for display only [layer-inferred].
- A node with children or a `kind` is refined; every other node is a leaf still to cut, which the check counts. Cutting ends at a requirement that carries `kind` (binary, numeric or open-ended) and a one-sentence `## Check` of what is observed and what counts as yes [kind-missing, check-missing].
- `relates`, `conflicts` and `requires` name existing nodes [link-unknown]; `requires` has no cycle [requires-cycle]; a node with two or more children records `partition` [no-partition].
- `source` names where the entry came from: `path:lines`, `conversation, <date>`, or `archetype`; a human's typed words are `stated` and quoted under `## Stated`.

### Journey

A user journey: the steps a person takes, each bound to the requirements it exercises.

Where: `canon/journeys/JRN-n-<slug>.md`.

Fields: required `id`, `title`, `state`; optional `source`.

States: stated, resolved, assumed, open, contested.

Rules:

- The body holds a Mermaid graph of the steps [journey-no-graph] and a table of steps, each with its requirement ids [journey-no-steps, step-unlinked].

### Decision record

A decision record: a short-term choice, linked to the intent it serves; one with an origin is a caught divergence.

Where: `canon/decisions/DEC-n-<slug>.md`; DEC-001 is the adoption scope and marks an adoption as finished.

Fields: required `id`, `title`, `state`; optional `date`, `intents`, `origin`.

States: stated, resolved, assumed, open, contested.

Rules:

- `intents` name existing nodes [decision-unlinked]; `origin` names a known cause [origin-unknown]; an assumed decision awaits the human [decision-unconfirmed].

### Principle

A principle: a direction the project holds, a title and a paragraph of two to four sentences; the main alignment point.

Where: A line of the root README's `## Principles`: `**PRN-n Title** [state]`, then its paragraph, then an optional Source line.

States: stated, resolved, assumed, open, contested.

Rules:

- No marker on the title line means the human's own words (stated); each principle is approved, rewritten or deleted on its own, never through the root.

### Glossary term

A glossary term: one concept, defined as a dictionary entry does.

Where: A line of the root README's `## Glossary`: `**term** (`TERM-slug`) [state]: definition`.

States: stated, resolved, assumed, open, contested.

Rules:

- A term's own marker, after its id or at the end of its line, is its state; without one it takes the heading's marker, and `stated` when the heading has none [glossary-inherited].

## The start sequence

On an existing canon, before any other work:

1. `HC check --json`. A `format-newer` finding stops here: this HeadCanon is older than the canon; update it.
2. Bring every entry the check says does not fit the format into it, as the current version's notes say: a node titled as a question or without an Intent becomes a draft with its question filed as an issue; a section the format does not define is folded into the one that holds its content, or an issue; a glossary heading whose terms inherited the root's approval is marked `[assumed]` again. Every issue goes through `headcanon_ask`, all in one call.
3. Fix every error the check reports.
4. When no finding about fit remains, write `format: <current version>` on the root README.
5. Say the counts in one line, drafts made, issues filed, sections folded, and the next box to look at.

## Versions

### 2 (2026-10-30), current

- A thing the session cannot define is a draft node: `state: open`, a provisional plain title, one line of what is known as Intent, drawn dashed on the canvas; its question is an issue the human answers in the Issues panel. Before, the question was the node's title and the node had no Intent.
- The `## Options` section is gone; suggestions travel with the issue.
- `## Open` holds a dated note of a gap between the artifacts and the intent and what would settle it, never a question for the human.
- `## Deferred` is part of the format: what a node will hold once it is refined, one line each with its origin.
- A glossary term carries its own marker after its id; the heading's marker is the default for unmarked terms, and approving the root no longer clears it.
- The root README records the version it was written under, `format: 2`.

Brought up from 1 by the start sequence:

- A node titled as a question, or without an Intent, becomes a draft with an issue [title-question, intent-missing].
- A section the format does not define is folded into the one that holds its content, or becomes an issue [section-unknown].
- The glossary heading is marked `[assumed]` when its terms inherited the root's approval [glossary-inherited].
- Then `format: 2` is written on the root [format-version].

### 1 (2026-10-17)

- Draft-then-review adoption: the canon is drafted from the repository as guesses marked `assumed` and reviewed on the canvas; a thing the session could not define was an `open` node titled as the question.
- Every node carries `layer`; a refined node records `partition`; links are `relates`, `conflicts` and `requires`; a leaf carries `kind` and a `## Check`.
- Principles carry their own marker on the title line; the root README holds the premise, the principles and the glossary.

