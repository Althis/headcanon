# Adopt: reference

Text the adopt skill pastes and formats it writes. Use the Write tool, one file per call; shell heredocs fail on quoting.

## Contents

0. The briefing
1. Root README
2. Requirement node
3. Adoption scope decision
4. Question shapes
5. Entry quality: what not to write

## 0. The briefing

The first question's text begins with this block, verbatim, followed by the draft.

```
Welcome to HeadCanon. Together we are going to write down what this project is for, in a form that is re-read at the start of every session so that work stays true to it. I have already read the repository.

We build it in five layers, each approved before the next:
- Premise: what the project is, its purpose, what it is not, and its vocabulary.
- Principles: the direction it follows. Every requirement is later judged against them.
- Domains: the areas the project must cover to operate at all.
- Capabilities: what each domain must be able to do to be complete.
- Requirements: the concrete, checkable goals under each capability.
Then: anything from your documents that did not fit.

How you decide on each draft I show:
- Approve as written: my draft stands, recorded as approved by you.
- Drop: it is left out.
- Other: type your own wording to replace mine, or a correction, and I show the corrected draft again. Only what you type is recorded as your words.

In a list, tick every item that is right as written. Each unticked item comes back as its own question.
Nothing is saved until you approve it.

Premise (1 of 5): what the project is.
```

## 1. Root README (`canon/README.md`)

```markdown
---
id: ROOT
title: "<Project> canon"
state: stated | resolved
source: "conversation, <date>"
---

# <Project> canon

<One paragraph: what this folder is; seeded by /headcanon:adopt on <date>.>

## Stated
> <the human's typed words, verbatim, one blockquote per statement>
Source: conversation, <date>

## Intent
<approved drafts for what it is and the purpose>

## Resolution
<option chosen and date, when approved as written>

## Not this
- <non-goal> (source)

## Principles

**PRN-1 <Title>**
<Two to four sentences: what the direction is, what it means for the choices the project makes, where it applies.>
Source: <path:lines or conversation, date>

## Glossary [assumed]
**<term>** (`TERM-<slug>`): <definition>
```

`state` is `stated` when the purpose was typed by the human, `resolved` when approved as written. Remove `[assumed]` from the Glossary heading only when every term was approved.

## 2. Requirement node

A node with children is a folder: `canon/REQ-1-<slug>/README.md`. A leaf is a file: `canon/REQ-1-<slug>/REQ-1.1-<slug>.md`. Slugs are short and lowercase.

```markdown
---
id: REQ-1.2
parent: REQ-1
title: "Plain-language title"
state: stated | resolved | assumed | open | contested
source: "path:lines, or: conversation, <date>, or: archetype"
kind: binary            # only when the node is already a yes-or-no check
---

# Plain-language title

## Stated
> <verbatim typed words, when any>
Source: conversation, <date>

## Intent [assumed]
<one or two sentences; drop "[assumed]" from the heading when the node is not stated>

## Resolution
<option chosen and date, when approved as written>

## Not this
<when an artifact or the human made one clear>

## Assumptions
- <what you decided> (model assumption)

## Open
- <date>: <what would settle it>
```

An open domain or capability is a node whose `state` is `open` and whose title is the question, for example "How are duplicate transactions detected?".

## 3. Adoption scope decision (`canon/decisions/DEC-001-adoption-scope.md`)

```markdown
---
id: DEC-001
title: "What adoption left out of the canon"
state: resolved
date: <date>
intents: [ROOT, REQ-1, REQ-2]
---

# What adoption left out of the canon

## Dropped threads
- <thread> (<path:lines>): <the human's reason>
- <artifact> entirely: <the human's reason>
```

## 4. Question shapes

Single draft. The draft reads as prose; footnote markers sit at the end of sentences and the sources are listed once at the end:

```json
{"questions":[{"header":"<Layer>","question":"<Layer label>: <item>.\n\nDraft:\n\n\"Ledgerline turns a year of bank statements into the forms an accountant needs. [1] It runs on the owner's own computer and keeps every file it was given. [2]\"\n\nSources: [1] README.md:3, [2] docs/design.md:40-44\n\nTo correct or rewrite, type in Other.","multiSelect":false,
  "options":[{"label":"Approve as written","description":"Enters as resolved."},{"label":"Drop","description":"Left out; recorded in DEC-001 if it came from an artifact."}]}]}
```

List first pass. The drafts are in the question body, each ending with its footnote; the options carry the ID and title only:

```json
{"questions":[{"header":"<Layer>","question":"<Layer label>. Tick every item that is right as written; unticked items come back one by one.\n\nPRN-1 Keep the original. <paragraph> [1]\n\nPRN-2 Explain every number. <paragraph> [2]\n\nSources: [1] docs/design.md:12-15, [2] conversation, <date>\n\nTo correct or rewrite one, type in Other.","multiSelect":true,
  "options":[{"label":"PRN-1 Keep the original","description":""},{"label":"PRN-2 Explain every number","description":""}]}]}
```

Keep four options or fewer per question; split longer lists across questions in the same call.

## 5. Entry quality: what not to write

An entry is read later, by someone who was not in this conversation, the way a dictionary or encyclopedia entry is read. It says what the thing is, concisely, and nothing else. Each example below is wrong, with the reason, then the entry as it should be. The product is invented.

**Correction history inside the entry.**
Wrong: "Statement import: reads CSV and OFX statements from a bank (PDF statements were removed after the owner said they are out of scope)."
Why: the parenthesis is a story about how the entry changed. A reader wants the definition, and the history is already in git.
Right: "Statement import: reads CSV and OFX statements from a bank and turns each line into a transaction."

**The reason given for a correction, written as content.**
Wrong: "Category: a label that places a transaction on one line of the tax report. This is a bookkeeping rule, and asking for an exception does not change it."
Why: the second sentence is the human's explanation of why an earlier draft was wrong. It argues with a draft the reader never saw.
Right: "Category: a label that places a transaction on one line of the tax report."

**A "not" clause.**
Wrong: "Rule: a saved condition that assigns a category to matching transactions. Not a tag, and not a one-off edit."
Why: the reader learns two neighbors and still has to infer the thing. Exclusions belong only in a Not this section, where they are read as exclusions.
Right: "Rule: a saved condition that assigns a category to every transaction matching it."

**Dependence on the conversation.**
Wrong: "Reconciliation: as discussed above, matches the same transaction across two statements."
Why: "as discussed above" points at nothing the reader has.
Right: "Reconciliation: finds the same transaction in two statements and keeps one record of it."

**Current state as definition.**
Wrong: "Reporting: produces the forms an accountant needs; three report types as of version 0.4."
Why: the count and the version describe one day. Written here, they become a requirement to have exactly three.
Right: "Reporting: turns a categorized year into the forms an accountant needs."

**Two concepts in one entry.**
Wrong: "Rule: a saved condition that assigns a category; a filter is a rule that is not saved."
Why: the entry defines a second term in passing, and a reader looking up Filter never finds it.
Right: two entries. "Rule: a saved condition that assigns a category to every transaction matching it." "Filter: a condition applied once to the transactions in view."

**Rationale inside the entry.**
Wrong: "Duplicate detection: flags a transaction that appears twice, which matters because duplicates caused wrong totals in the first release."
Why: the second clause is a reason. Reasons live in decision records, where they can be read with their context.
Right: "Duplicate detection: flags a transaction that appears more than once in the imported statements."
