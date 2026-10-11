# Refine: reference

Formats the refine skill writes and the shape of its question, then one worked example. The product is invented. Use the Write tool, one file per call.

## Contents

1. Child file
2. The set question
3. Chains and origins
4. Worked example

## 1. Child file

A child is a file in its parent's folder: `canon/REQ-1-<slug>/REQ-1.2-<slug>.md`. The first child of a node that was a file turns that file into `canon/REQ-1-<slug>/README.md` first. Front-matter and sections follow the adopt skill's node template (adopt/reference.md section 2) with these additions.

```markdown
---
id: REQ-1.2
parent: REQ-1
title: "A statement in a known format becomes transactions"
state: resolved
layer: capability
source: "REQ-1 (consequence of 'become transactions'); docs/formats.md:8"
relates: [REQ-3.2]      # only when the child cuts across other children
---

# A statement in a known format becomes transactions

## Intent

Every line of a statement in a format the program knows becomes one transaction carrying its date, amount, payee and the statement it came from.

## Resolution

Approved as written, 2026-10-11.

## Deferred

- OFX amounts are read in cents (docs/formats.md:8)
- CSV, OFX and QIF are the known formats (docs/formats.md:3)
- an unreadable file is reported with the line that failed (failure of this capability)
```

The node that was refined gains one front-matter line, `partition: "stage of an import"`, and nothing else changes in it. A facet child is an ordinary child whose `## Deferred` holds the rungs of its question. An open child has `state: open`, the question as its title, and no Intent section.

## 2. The set question

Each option carries its child's one line as the description, ending with its footnote; the body carries the node's text, the axis, the instruction and the Sources line, so each draft appears once. Through AskUserQuestion, four options or fewer per question, its limit; a longer set is split across questions in the same call. The page takes any number.

```json
{"questions":[{"header":"Capabilities (4 of 5)","question":"Capabilities (4 of 5): REQ-1 Statement import.\n\n\"Bank statements in any common format become transactions, and every file given to the program is kept.\"\n\nIts children, by stage of an import. Tick every item that is right as written; unticked items come back one by one.\n\nSources: [1] prerequisite of 'statements become transactions'; CHANGELOG.md:14. [2] consequence of 'become transactions'; docs/formats.md:3-8. [3] failure of 'one transaction per line'; nothing in the project covers it. [4] consequence of 'every file is kept'.","multiSelect":true,
  "options":[{"label":"REQ-1.1 Intake","description":"a statement file reaches the program by file picker or by dropping it on the window. [1]"},{"label":"REQ-1.2 Parsing","description":"a statement in a known format becomes transactions, one per line. [2]"},{"label":"REQ-1.3 Duplicate detection","description":"a transaction already imported is recognized and imported once. [3]"},{"label":"REQ-1.4 Keeping the original","description":"the file a statement came from is kept beside its transactions. [4]"}]}]}
```

Through the page: the same text as `question`, `header` "Capabilities (4 of 5)", `nodeId` "REQ-1", `multiSelect` true, one option per child, and `terms` from `HC terms --text "<question>" --json`.

## 3. Chains and origins

A candidate's origin is written beside it while working and becomes the child's `source` when it is written:

| Origin | While working | In `source` |
| --- | --- | --- |
| a prompt | prerequisite / consequence / failure / archetype of '<clause>' | `REQ-1 (prerequisite of 'statements become transactions')` |
| a thread | the thread's words and `path:lines` | appended after a semicolon: `; docs/formats.md:8` |
| an earlier assumption | the node and line it sits in | `REQ-1 (assumption, 2026-10-11)` |
| a gap found in step 5 | entailment or conservation of '<clause>' | `REQ-1 (needed for 'any common format')` |
| the caller | what the caller passed and why | the caller's source, for example `software project` |

A deferred rung keeps its origin in parentheses on its `## Deferred` line. A child whose source is only a prompt or a gap is marked "nothing in the project covers it" in the question's Sources line, so the human knows it is implied, not documented.

## 4. Worked example

Node REQ-1 Statement import, approved: "Bank statements in any common format become transactions, and every file given to the program is kept." Children get `layer: capability`.

**1 Gather.** Candidates with origin:

- a statement file reaches the program (prerequisite of 'statements become transactions')
- the file's format is recognized (prerequisite)
- each statement line is one transaction (consequence of 'become transactions')
- the original file is kept beside its transactions (consequence of 'every file is kept')
- a file in a format the program does not know (failure)
- the same statement imported twice (failure of 'one transaction per line')
- intake, parsing, duplicate detection, error reporting (archetype)
- "OFX amounts are in cents" (thread, docs/formats.md:8)
- "CSV, OFX and QIF are supported" (thread, docs/formats.md:3)
- "statements can be dropped onto the window" (thread, CHANGELOG.md:14)

**2 Ladder.** "OFX amounts are in cents": why must it hold? Each format's fields are read as the format defines them. Why? A statement in a known format becomes transactions, which the node says. Top rung: parsing; two rungs deferred. "CSV, OFX and QIF are supported": why? The common formats are known, which is the parsing rung again. "Dropped onto the window": why? A statement file reaches the program: the intake rung; one rung deferred. "A file in an unknown format": why must it be handled? Parsing holds only when an unknown file is told apart from a known one: an aspect of parsing, same axis, so it is deferred under it. "Imported twice": why? Each line becomes one transaction, once: its own rung, because it happens after parsing and can be tested apart from it.

**3 Top rungs.** A statement file reaches the program; a statement in a known format becomes transactions; a transaction already imported is imported once; the original file is kept beside its transactions. "The file's format is recognized" and "each statement line is one transaction" name the parsing rung and merge into it.

**4 Axis.** All four answer "when, in an import": partition "stage of an import". No rung answers a second question, so no facet.

**5 Close.** Entailment: with the four holding, statements in the known formats become transactions and every file is kept; the node says "any common format", so the known formats must be the common ones: the thread at docs/formats.md:3 speaks to it, and it is deferred under parsing. Conservation: statements (intake), formats (parsing), transactions (parsing, duplicate detection), the kept file (keeping the original). Nothing missing.

**6 Name.** Intake, Parsing, Duplicate detection, Keeping the original: plain words, one line each, ordered by time. No drift from PRN-1 Keep the original; REQ-1.4 is its direct expression.

**7 Ask.** The question in section 2. Approved as ticked; REQ-1.3 left unticked comes back as "Does Statement import need duplicate detection?" with Yes, add it and No.

**8 Report.** Created REQ-1.1 to REQ-1.4; partition "stage of an import"; no set-asides; no leftover threads; no open nodes.
