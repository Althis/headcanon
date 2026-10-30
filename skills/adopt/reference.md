# Adopt: reference

Text the adopt skill pastes and formats it writes. Use the Write tool, one file per call; shell heredocs fail on quoting.

## Contents

0. The briefing
1. Root README
2. Requirement node
3. Adoption scope decision
4. Question shapes
5. Entry quality: what not to write
6. Asking through the page

## 0. The briefing

The first question's text is this block, verbatim, with one option, **Let's begin**. The premise draft is the question after it.

```
Welcome to HeadCanon. Together we are going to write down what this project is for, in a form that is re-read at the start of every session so that work stays true to it. I have already read the repository.

What happens next: I draft the whole thing from your documents, then you review it on a canvas, box by box.

The canon has five layers, top to bottom:
- Premise: what the project is, its purpose, what it is not, and its vocabulary.
- Principles: the direction it follows. Every requirement is later judged against them.
- Domains: the areas the project must cover to operate at all.
- Capabilities: what each domain must be able to do to be complete.
- Requirements: the concrete, checkable goals under each capability.

On the canvas, every box has a colour:
- Green: approved by you.
- Yellow: my guess from your documents. Open it and approve it, rewrite it in your own words, or delete it.
- Red: I could not guess it, or two statements disagree. Those need you before we can finish.

Work top-down: the premise first, then the domains. When you change a box, I rework what hangs from it and tell you in the chat on the right. Select any words in a box's card and the chat is ready for your question about them.

Nothing is final until you press Finish with no red left.
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

**PRN-1 <Title>** [assumed]
<Two to four sentences: what the direction is, what it means for the choices the project makes, where it applies.>
Source: <path:lines or conversation, date>

## Glossary [assumed]
**<term>** (`TERM-<slug>`) [assumed]: <definition>
```

`state` is `stated` when the purpose was typed by the human, `resolved` when approved as written. A term's own marker sits after its id, never inside the definition: `[assumed]` while guessed, `[stated]` for the human's own words; the page writes `[resolved]` on approval. The heading's `[assumed]` is the default for unmarked terms; remove it only when every term is approved. A principle carries its own marker on its title line: `[assumed]` while it is the session's guess, `[open]` when only the human can state it; the page writes `[resolved]` when they approve it and no marker when they rewrite it, and a line without a marker is the human's own (stated).

## 2. Requirement node

A node with children is a folder: `canon/REQ-1-<slug>/README.md`. A leaf is a file: `canon/REQ-1-<slug>/REQ-1.1-<slug>.md`. Slugs are short and lowercase.

```markdown
---
id: REQ-1.2
parent: REQ-1            # omit on a top-level node
title: "Plain-language title"
state: stated | resolved | assumed | open | contested   # open: a draft, the session's provisional name for a thing it could not define, drawn dashed; its question is an issue
layer: domain | capability | requirement
source: "path:lines, or: conversation, <date>, or: archetype"
kind: binary            # on a leaf, with its Check: binary | numeric | open-ended
---

# Plain-language title

## Stated
> <verbatim typed words, when any>
Source: conversation, <date>

## Intent [assumed]
<one or two sentences; drop "[assumed]" from the heading when the node is not stated; on a draft node, one line of what is known so far>

## Resolution
<option chosen and date, when approved as written>

## Check
<on a leaf: one sentence, what is observed and what counts as yes>

## Not this
<when an artifact or the human made one clear>

## Contested
<when two statements disagree: one or two sentences on what they cannot both hold and what choosing decides, then one bullet per statement with its sources>
- <statement one> (<path:lines>)
- <statement two> (<path:lines>)

## Deferred
- <what this node will hold once it is refined, one line each> (<origin>)

## Assumptions
- <what you decided> (model assumption)

## Open
- <date>: <a gap between the artifacts and the intent, and what would settle it; never a question for the human, which is an issue>
```

A draft is a node whose `state` is `open`: a provisional plain title such as "Duplicate detection", one line of what is known as Intent, and its question filed as an issue. A title is never a question. No other section exists; the check flags one.

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
{"questions":[{"header":"<Layer>","question":"<Layer label>: <item>.\n\nDraft:\n\n\"Ledgerline turns a year of bank statements into the forms an accountant needs. [1] It runs on the owner's own computer and keeps every file it was given. [2]\"\n\nSources: [1] README.md:3, [2] docs/design.md:40-44","multiSelect":false,
  "options":[{"label":"Approve as written","description":"Enters as resolved."},{"label":"Drop","description":"Left out; recorded in DEC-001 if it came from an artifact."}]}]}
```

List first pass. Each option carries its draft as the description, ending with its footnote; the body carries the label, the instruction and the Sources line, so a draft appears once:

```json
{"questions":[{"header":"<Layer>","question":"<Layer label>. Tick every item that is right as written; unticked items come back one by one.\n\nSources: [1] docs/design.md:12-15, [2] conversation, <date>","multiSelect":true,
  "options":[{"label":"PRN-1 Keep the original","description":"<paragraph> [1]"},{"label":"PRN-2 Explain every number","description":"<paragraph> [2]"}]}]}
```

Through AskUserQuestion, four options or fewer per question, its limit; split longer lists across questions in the same call. The page takes any number.

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

## 6. Asking through the page

When the tools `headcanon_ask`, `headcanon_wait`, `headcanon_focus`, `headcanon_changes` and `headcanon_open` are present, the human answers in the HeadCanon viewer instead of the terminal. The question content is unchanged; only the channel is.

1. Build the question text exactly as section 4 shows: layer label, the draft as prose with footnotes and the Sources line
2. Run `HC terms --text "<draft>" --json` and give every listed word a one-sentence guessed definition. Pass them as `terms`. The page marks each one; the human keeps it (it enters the glossary at once) or drops it and names a replacement. The answer's `terms` list says what they decided; reword a dropped term with its replacement before writing anything.
3. Call `headcanon_ask` with `header`, `question`, `options` (omit for Approve as written / Drop; one option per item with `multiSelect: true` for a list), `nodeId` when the question is about an existing node, and `terms`. Several questions in one turn, as AskUserQuestion allows: pass them as `questions`; the page shows them one after another and the result holds every answer in order. On the first call the page opens in the browser.
4. The result is the answer, or `{pending: true, questionId}`. When pending, call `headcanon_wait` with the `questionId` and keep calling it until the answer arrives. Never give up on a pending question and never re-ask it.
5. Read the answer like a terminal answer: `selected` holds the chosen labels; `other` holds typed text, which is wording, a correction or a process instruction as the skill defines.
6. `headcanon_changes` with the last cursor, and `waitSeconds` to wait for the next action, returns what the human did: `node-approved`, `node-edited`, `node-created` and `node-deleted` (their wording is stated), `term-enshrined` and `term-dropped`, `message` (free text, or a question about a quoted passage with its `id`), `refine-request` naming a branch to define next, and `finish-request`. The attend skill says what each one asks of you.
7. `headcanon_say` posts a line of yours in the chat; the page shows a working indicator from the human's last action until your next say or question, so end every spell of work with one. `headcanon_focus` with `open` opens a box's card on their screen; `headcanon_open` with view `adopt` opens the canvas.

Example call:

```json
{"header":"Premise (1 of 5)","question":"Premise (1 of 5): what it is.\n\nDraft:\n\n\"Ledgerline turns a year of bank statements into the forms an accountant needs. [1]\"\n\nSources: [1] README.md:3","nodeId":"ROOT","terms":[{"term":"OFX","definition":"a file format banks use to export statements"}]}
```
