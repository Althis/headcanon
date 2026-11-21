# The canon format, version 4

What every entry of a canon carries, the sequence a session runs on an existing canon, and what each version of the format changed. The check enforces the rules named with a code in brackets; the root README records the version a canon was written under; a canon written under an older version is brought up by the start sequence, never broken. This file is printed by `headcanon format` from `packages/canon/src/format.ts`; a test keeps the two the same.

## Types

### Root README

The premise: what the project is and for whom, what it is not, its principles and its glossary.

Where: `canon/README.md`, front matter `id: ROOT`.

Fields: required `id`, `title`, `state`, `format`; optional `partition`, `source`.

States: stated, resolved, assumed, draft.

Sections: one of `Intent`, `Purpose`; may carry `Stated`, `Resolution`, `Implemented by`, `Not this`, `Principles`, `Glossary`.

Rules:

- `format` is the version of this format the canon was written under; an older one is brought up by the start sequence [format-version], a newer one needs a newer HeadCanon [format-newer].
- `## As built` on the root is the session's survey of what the repository is today: its entry points, modules, surfaces, data and tests, one line each with its path, written from the code so that a project without documents still yields a premise, and rewritten whenever the code is re-read; the Intent says what the project is for, and the two are never one sentence.
- `partition` is the question the top-level nodes answer, written when the premise is refined.
- Approving the root clears the markers on its own sections and leaves the Glossary heading's marker alone: terms are approved one by one.

### Node (domain, capability or requirement)

One entry of the tree, in one or two sentences that read as an encyclopedia entry. There is one node type; its layer, domain, capability or requirement, is a field on it, not a type of its own.

Where: `canon/REQ-1-<slug>/README.md` when it has children, `canon/REQ-1-<slug>/REQ-1.1-<slug>.md` when it is a leaf; the id mirrors the path.

Fields: required `id`, `title`, `state`; optional `parent`, `layer`, `source`, `kind`, `partition`, `relates`, `conflicts`, `requires`, `steps`, `files`, `baseline`, `uid`, `binds`.

States: stated, resolved, assumed, draft, contested.

Sections: one of `Intent`, `Stated`; may carry `Resolution`, `Check`, `Implemented by`, `Not this`, `Contested`, `Deferred`, `Assumptions`, `Open`.

Rules:

- `## As built` is the session's record of what the code does today for the entry, one to three lines each ending in its `path:lines`, apart from the Intent, which says what must hold; it is rewritten whenever the code is re-read and never approved, so a guess read off the code and the project's want never share a sentence. Where the code does otherwise than the Intent says, the node is contested and the contradiction is an issue; where the code does not implement the Intent yet, As built says `not built` with what exists instead, and no question is asked; neither case rewrites the Intent silently.
- The title names a thing, never a question [title-question]; the ids are unique [duplicate-id], the parent exists [parent-missing], and the id's path matches its parent's [parent-mismatch].
- An Intent, or the user's Stated words, is never missing [intent-missing]; a draft (`state: draft`) keeps one line of what is known, and its question is an issue, never a section.
- Only the sections named here [section-unknown]: `## Open` holds a dated note: a gap between the artifacts and the intent and what would settle it, or the choice a guess made and the alternatives it had; `## Deferred` what the node will hold once refined, one line each with its origin; `## Contested` a one-paragraph summary and one bullet per statement with its sources; `## Assumptions` what the session decided alone.
- `layer` is one of three, never above the parent's [layer-order]. A domain is an area the product must have to operate: the top level under the premise, drawn from the premise and from what every software project needs (documentation, verification), never from artifacts alone. A capability is what a domain must be able to do, drawn from what every system of its kind needs; it has requirements under it [uncovered-capability] and never a check of its own. A requirement is a thing that must hold, drawn mostly from artifacts, nested as deep as the thing needs. A project with fewer than about eight areas has no domain layer: its top level is capabilities. Without the field the layer is inferred from depth, for display only [layer-inferred].
- A node with children or a `kind` is refined; every other node is a leaf still to refine, which the check counts. Refinement ends at a requirement that carries `kind` (binary, numeric or open-ended) and a one-sentence `## Check` of what is observed and what counts as yes [kind-missing, check-missing]. A requirement is a requirement at every depth: a parent is verified at its own level, by its children when they entail it, by a `## Check` it keeps for itself when they do not, the integration check. An open-ended kind is a goal rather than a requirement, kept only when the user accepts it. A requirement's title reads as a claim; a capability's names a subject.
- `relates`, `conflicts` and `requires` name existing nodes [link-unknown]; `requires` has no cycle [requires-cycle]; a node with two or more children records `partition` [no-partition].
- `source` names where the entry came from: `path:lines`, `conversation, <date>`, or `archetype`; a user's typed words are `stated` and quoted under `## Stated`.
- What a good node is, beyond its shape, is the Quality list below: the check decides the deterministic tests under their codes, the reviewing agent reads and judges the rest, and a review finding names the test it failed.

### Journey

A user journey: the steps a user takes, each bound to the requirements it exercises.

Where: `canon/journeys/JRN-n-<slug>.md`.

Fields: required `id`, `title`, `state`; optional `source`.

States: stated, resolved, assumed, draft, contested.

Rules:

- The body holds a Mermaid graph of the steps [journey-no-graph] and a table of steps, each with its requirement ids [journey-no-steps, step-unlinked].

### Decision record

A decision record: a short-term choice, linked to the intent it serves; one with an origin is a caught divergence.

Where: `canon/decisions/DEC-n-<slug>.md`. An adoption is finished when every branch ends in a requirement with its check; a canon adopted before format 4 says it with its scope record, DEC-001.

Fields: required `id`, `title`, `state`; optional `date`, `intents`, `origin`.

States: stated, resolved, assumed, draft, contested.

Rules:

- `intents` name existing nodes [decision-unlinked]; `origin` names a known cause [origin-unknown]; an assumed decision awaits the user [decision-unconfirmed].

### Principle

A principle: a direction the project holds, a title and a paragraph of two to four sentences; the main alignment point.

Where: A line of the root README's `## Principles`: `**PRN-n Title** [state]`, then its paragraph, then an optional Source line.

States: stated, resolved, assumed, draft, contested.

Rules:

- No marker on the title line means the user's own words (stated); each principle is approved, rewritten or deleted on its own, never through the root.

### Glossary term

A glossary term: one concept, defined as a dictionary entry does.

Where: A line of the root README's `## Glossary`: `**term** (`TERM-slug`) [state]: definition`.

States: stated, resolved, assumed, draft, contested.

Rules:

- A term's own marker, after its id or at the end of its line, is its state; without one it takes the heading's marker, and `stated` when the heading has none [glossary-inherited].

## Quality

What a good entry is, as yes-or-no tests, from the literature read on 2026-11-15 (docs/research/2026-11-15-requirement-quality.md). Who decides: `check` is `headcanon check` under the code shown; `reviewer` is the agent that reviews a set, which reads and judges each; `user` only the user can say, so a failure is an issue. A set fails its review when a check marked fatal says no, or when `headcanon check` reports an error; every other no is a note the refiner applies without another review. A review finding names the check by its name.

### The Intent: one requirement statement

| Check | Test | Who | Sources |
|---|---|---|---|
| present | Has the node an Intent, or the user's Stated words? | check `intent-missing` | ISO 29148 5.2.8; INCOSE GtWR R29 |
| title-names | Is the title a thing, never a question; a requirement's a claim, a capability's a subject, and does it describe what the Intent says? | check `title-question` | Femmer 2017 S14; KAOS naming; the format |
| form | Is the Intent one or two sentences? | check `intent-long` | INCOSE GtWR R18; Genova 2013; the Entries rule |
| no-subjective | Is it free of judgements the reader cannot measure (user-friendly, easy, efficient, robust, adequate, appropriate)? | check `subjective` | ISO 29148 5.2.7; Femmer 2017 F1 |
| no-escape | Is it free of loopholes (if possible, as appropriate, as required, where feasible)? | check `escape-clause` | ISO 29148 5.2.7; INCOSE GtWR R8; Femmer 2017 F3 |
| no-open-end | Is it free of open sets (including but not limited to, etc., and so on, as a minimum)? | check `open-ended` | ISO 29148 5.2.7; INCOSE GtWR R9; Femmer 2017 F5 |
| no-vague | Is it free of unmeasured quantities and qualities (some, several, usually, significant, sufficient, timely, large, quickly)? | check `vague` | ISO 29148 5.2.7; INCOSE GtWR R7; Femmer 2017 F2 |
| no-placeholder | Is it free of holes left to fill (TBD, TODO, to be determined)? | check `placeholder` | ISO 29148 5.2.6; IEEE 830 4.3.3 |
| no-hedge | Is it free of doubt written as prose (probably, might, could, perhaps)? A doubtful entry is a draft with its question. | check `hedge` | Berry, Kamsties and Krieger; Genova 2013 |
| no-reason | Is it free of reasons and purposes (in order to, so that, because)? Reasons live in decision records. | check `purpose-clause` | INCOSE GtWR R20; the Entries rule |
| no-and-or | Is it free of and/or? | check `and-or` | ISO 29148 5.2.7; INCOSE GtWR R15 |
| indicative | Is it written as what is, without shall, should or must? The obligation is the slot, the Intent is indicative. | check `intent-modal` | Zave and Jackson 1997; Gleich 2010; research note 3.4 |
| names-the-thing | Does no sentence start with a pronoun and a verb (This is, It has)? | check `pronoun-start` | INCOSE GtWR R24; QuARS implicity |
| measured-comparison | Is every comparative or superlative (faster, best, most) held to a number or a finite set? | check `comparative` | ISO 29148 5.2.7; Femmer 2017 F6 to F9 |
| bounded-universal | Is every always, never or at all times backed by an enumerated set or a window? | check `absolute` | ISO 29148 5.2.7; INCOSE GtWR R26 |
| observable-verb | Is the main verb an observable action, not support, handle, process or manage? | check `vague-verb` | INCOSE GtWR R3; Paska P9 |
| plain-words-above | Is a domain or capability free of mechanisms (button, database, API, thread)? | check `design-term` | Femmer 2017 T10; Genova 2013; the Entries rule |
| terms-defined | Is every word that carries meaning here a glossary term, or proposed as one? | check `term-candidate` | ISO 29148; INCOSE GtWR R4; Arora 2017 |
| sourced | Does a guess carry its chain and the thread it rests on in `source`? | check `source-missing` | ISO 29148 traceability; INCOSE GtWR A2; the Guessing rule |
| one-reading | Would an implementer and a verifier paraphrase it to the same subject, action, object, bound and condition? | reviewer, fatal | ISO 29148 5.2.5; INCOSE GtWR C3; Davis 1993 Q1 |
| complete-in-itself | Can a reader understand it cold, glossary aside: the capability, how well, and under what conditions, none inferred? | reviewer | ISO 29148 5.2.5; INCOSE GtWR C4, R27 |
| singular | Does it state one capability, under however many conditions; would any part be verified or placed apart? | reviewer | ISO 29148 5.2.5 note 2; INCOSE GtWR C5; Honig et al. |
| entity-subject | Is the subject the entity at this level, named in the sentence, never a user or a role? | reviewer | ISO 29148 5.2.4; INCOSE GtWR R3, R25; EARS one system name |
| encyclopedia-entry | Does it say what the thing is, with no history, no exclusion, no count, no version, no status? | reviewer | the Entries rule; INCOSE GtWR C2 |
| implementation-free | Could more than one design satisfy it; does it name no mechanism the need does not impose, or is it a constraint with its reason recorded? | reviewer | ISO 29148 5.2.5; INCOSE GtWR R31; Davis 1993 Q10; Zave and Jackson |
| own-level | Is every detail about this node's entity at this depth, nothing a child or the rationale holds? | reviewer | ISO 29148 5.2.5; INCOSE GtWR C2; Femmer 2017 F19 |
| prescriptive | Could the software's behaviour make the sentence false? A sentence true whatever the software does is a domain fact; one that cannot be false is a definition, for the glossary. | reviewer | KAOS; Zave and Jackson 1997; Kamsties 2001 |
| faithful | Does it say what the cited thread says, no more, no less? | reviewer, fatal | ISO 29148 5.2.5; INCOSE GtWR C8; Porter 1995 incorrect fact |
| necessary | If this node were deleted, would a gap remain that no other node fills? | user | ISO 29148 5.2.5; INCOSE GtWR C1; machine reviewers miss it, Shefa 2024 |
| wanted | Is it what the project wants, in the user's judgement? | user | ISO 29148 5.2.5 correct; Zave and Jackson, the customer's prerogative |

### The Check: one verification criterion on a leaf

| Check | Test | Who | Sources |
|---|---|---|---|
| present | Does every leaf carry a `kind` and a Check? | check `check-missing` | ISO 29148 5.2.5 verifiable; Robertson fit criterion; the leaf contract |
| one-sentence | Is the Check one sentence? | check `check-long` | the leaf contract; EARS guard and assertion |
| numbers-carry-units | Does every number in the Check name its unit or the thing counted? | check `number-unit` | INCOSE GtWR R6; Ferrari 2018 PMU; IEEE 830 |
| shape | Does it name what is observed, on this node's entity, and what counts as yes, so that a verifier writes pass or fail from the sentence and the glossary alone? | reviewer, fatal | INCOSE GtWR C7; ISO 29148 verifiable; EARS stimulus, observed output, expected value |
| guarded | Does it say when the observation is made, the state and the event, with nothing evaluated outside them? | reviewer | EARS, response iff preconditions and trigger; T-EARS |
| same-property | Is there no behaviour that passes the Check yet breaks the Intent, nor the reverse? | reviewer, fatal | KAOS; Hull, Jackson and Dick, parent verified at its level |
| decidable | Can yes or no be decided at observation time from the past and the present, with no eventually and no never without a window? | reviewer, fatal | Zave and Jackson rule c; KAOS bounded Achieve; Ferrari 2018 |
| numeric-measure | For a numeric kind, does it name the measure, how it is measured, and the bound with its unit and tolerance? | reviewer | INCOSE GtWR R33, R34; Gilb scale and meter; IEEE 830 |
| judged | For an open-ended kind, does it name who or what judges, which artefact, and why that is enough; else a quantity, a direction and a target? | reviewer | KAOS soft goals; the leaf contract |
| other-case | Is the case where the trigger does not hold covered, here or in a sibling? | reviewer | EARS, two test cases per requirement; Kiro |

### The hierarchy: a parent and its children

| Check | Test | Who | Sources |
|---|---|---|---|
| a-set | Has a refined node two or more children, and a partition naming the question they answer? | check `single-child` | KAOS no trivial refinement; the refine skill; INCOSE SEH |
| no-restating | Does no child repeat its parent's title; does each add refinement? | check `restates-parent` | INCOSE GtWR R30; KAOS non-triviality |
| entailment | If every child holds, with the domain facts named, must the parent hold in every case? A counterexample is a missing child, or the parent's own Check. | reviewer, fatal | KAOS completeness; Zave and Jackson S, K entail R; INCOSE GtWR C10; the refine skill |
| minimal | For each child, with it removed, is there a case where the rest hold and the parent fails? One whose removal changes nothing is redundant. | reviewer | KAOS minimality; INCOSE GtWR C1; Preda leave-one-out |
| consistent | Is there one behaviour that satisfies all the children together? | reviewer, fatal | KAOS consistency; Zave and Jackson |
| justified | Can "why does this child exist?" be answered from the parent alone? | reviewer | ISO 29148 6.4.3.5; the ladder |
| right-level | Is each child about the entity of the set it sits in, neither the parent's generality nor a grandchild's detail? | reviewer | INCOSE GtWR C2; Femmer 2017 F19, F31 |
| cases-cover | When the children split by case, are the cases disjoint and together exhaustive, each case keeping the parent's target? | reviewer | KAOS case-driven refinement; Heitmeyer coverage and disjointness |
| other-case-covered | Does every conditional behaviour have its counterpart, the case where the condition fails, in a sibling or in a recorded decision that none is needed? | reviewer | EARS unwanted behaviour; Ferrari 2018 PMC; Jaffe 1991 |
| parent-check | Does a parent whose children do not entail it keep a Check of its own? | reviewer | DEC-021; Hull, Jackson and Dick |

### The set: the whole canon

| Check | Test | Who | Sources |
|---|---|---|---|
| links-resolve | Does every link name an existing node, with no cycle in requires? | check `link-unknown` | ISO 29148 traceability; IEEE 830 |
| one-id | Is every id claimed once? | check `duplicate-id` | ISO 29148; IEEE 830 |
| one-concept | Do no two nodes constrain the same glossary phenomenon of the same entity under overlapping conditions? Else merge or nest. | reviewer, fatal | KAOS; PRN-1; the coherence pass; the critic's gap 1 |
| no-conflict | For nodes with a shared subject and overlapping conditions, can one system satisfy both at once? | reviewer, fatal | ISO 29148 consistent; INCOSE GtWR C11; KAOS divergence |
| bindings-sorted | Is every bound unit a convergence (implements: the code does what the Intent says), a divergence (contradicts, with its issue) or a contribution, and is a child the premise requires with nothing bound marked not built? | reviewer, fatal | Murphy, Notkin and Sullivan reflexion; DEC-025 |
| complete | Is every situation the premise names covered by a node, and does no node cover a situation that cannot occur? | user | ISO 29148 5.2.6; Davis 1993; Zave and Jackson, all the customer's desires |

### The glossary

| Check | Test | Who | Sources |
|---|---|---|---|
| declarative | Is every definition a statement of what the term is, never an obligation? | check `glossary-prescriptive` | ISO 29148 5.2.7; Zave and Jackson, a definition cannot be false |
| one-meaning | Does every occurrence of a term read in the glossary's sense? | reviewer | INCOSE GtWR R4, R36; Dalpiaz 2019 |
| one-term | Do no two terms denote one concept; else one term, or both defined with the distinction stated? | reviewer | INCOSE GtWR R36; IEEE 830; Dalpiaz 2019 |
| decides-membership | Does the definition settle a borderline instance by itself? | reviewer | KAOS; Zave and Jackson designations |
| measured-term | Does a term that is a quantity carry its unit and range? | reviewer | INCOSE GtWR R4; Porter 1995 |

## The start sequence

On an existing canon, before any other work:

1. `HC check --json`. A `format-newer` finding stops here: this HeadCanon is older than the canon; update it.
2. Bring every entry the check says does not fit the format into it, as the current version's notes say: a node titled as a question or without an Intent becomes a draft with its question filed as an issue; a section the format does not define is folded into the one that holds its content, or an issue; a glossary heading whose terms inherited the root's approval is marked `[assumed]` again. Every issue goes through `headcanon_ask`, all in one call.
3. Fix every error the check reports.
4. When no finding about fit remains, write `format: <current version>` on the root README.
5. Say the counts in one line, drafts made, issues filed, sections folded, and the next node for the user: the first entry of `headcanon next`'s `user` list, ranked by impact, the nodes an approval validates or a settled red node frees.

## Versions

### 4 (2026-11-16), current

- `draft` is the state of a node whose definition waits on an issue; it replaces `open`, which the loader still reads as draft (DEC-025).
- `## Implemented by` replaces `## As built`: the documents that state the entry and the code units bound to it with the relation implements, each with its source; the session writes it from the bindings, never the user.
- `uid` is a stable id on every node that carries a requirement; it survives a move, so tests and bindings keep their target. `binds` lists the evidence a node rests on as "<relation> <unit>": implements, contributes or contradicts a code unit, a cluster or a claim (DEC-025).
- Below a capability the tree goes as deep as explicitness allows: every node is an intent node, and from the capability layer down it carries a requirement that its children make more explicit; the leaf is where intent and requirement coincide.

Brought up from 3 by the start sequence:

- `headcanon upgrade` rewrites `state: open` as `draft`, renames `## As built` to `## Implemented by` and adds a `uid` where a requirement has none [uid-missing].
- Then `format: 4` is written on the root [format-version].

### 3 (2026-11-15)

- `## As built` is a section of every node and of the root: what the code does today for the entry, with its `path:lines`, written by the session whenever it reads the code and never approved; the Intent says what must hold, so what the code does and what the project wants no longer share a sentence. An Intent the code contradicts, where the code does otherwise, is a contradiction issue; an Intent the code does not implement yet is a line under As built saying so, never a question.
- Adoption drafts the canon to its leaves before the user is asked anything (DEC-024): the reach of DEC-018 and DEC-023 is gone, a red node alone holds its subtree back, and `headcanon next`'s `user` list ranks what the user can approve or settle by impact, the nodes an approval validates or a settled red node frees, the premise first; the list stands after adoption, and `headcanon next <ID>` names the path to validate before work under a node.
- The Quality list: what a good Intent, Check, decomposition, set and glossary are, as yes-or-no tests with who decides each, drawn from the requirements literature; the check runs the deterministic ones, the language checks among them over a node's own words as warnings or notes and over the user's Stated words as notes.

Brought up from 2 by the start sequence:

- Nothing to fold: a canon without `## As built` fits, and the sections fill as the session re-reads the code.
- Then `format: 3` is written on the root [format-version].

### 2 (2026-10-30)

- A thing the session cannot define is a draft node: `state: open`, a provisional plain title, one line of what is known as Intent, drawn dashed on the canvas; its question is an issue the user answers in the Issues panel. Before, the question was the node's title and the node had no Intent.
- The `## Options` section is gone; suggestions travel with the issue.
- `## Open` holds a dated note of a gap between the artifacts and the intent and what would settle it, never a question for the user.
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

