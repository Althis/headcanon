---
name: adopt
description: "Creates a project's first canon from its repository and the human's answers, top-down: premise, principles, domains, capabilities, requirements, then a sweep of leftover artifact threads. Use when the session context says the project has no canon, or when the human asks to set up, adopt, install or start HeadCanon on a project."
when_to_use: "No canon/README.md exists, or the human asks to add HeadCanon to a project."
---

# Adopt: create the first canon

`HC` means `node "${CLAUDE_PLUGIN_ROOT}/packages/canon/bin/headcanon.js"`. Formats, question shapes and wrong-entry examples are in [reference.md](reference.md); read it before step 4.

Work top-down in five layers, each approved before the next: premise, principles, domains, capabilities, requirements; then a sweep of leftovers. The human decides every draft through AskUserQuestion. You read the repository; they judge drafts, never files.

## Checklist

Write this list to your scratch file and tick items as you go. The human sees progress through the layer label on each question.

- [ ] 0 `HC check` reports no canon; otherwise point to `/headcanon:review` and stop.
- [ ] 1 Read the repository silently; write the thread list.
- [ ] 2 The first question opens with the briefing.
- [ ] 3 Premise: what it is, purpose, not this, glossary.
- [ ] 4 `HC init`; write `canon/README.md`.
- [ ] 5 Principles.
- [ ] 6 Domains.
- [ ] 7 Capabilities, one domain at a time.
- [ ] 8 Requirements, one capability at a time.
- [ ] 9 Sweep unused threads.
- [ ] 10 `HC check` clean, `HC summary`, `HC render`, `/headcanon:commit`.
- [ ] 11 Report.

## Sources

What the human approved or typed in the layer above is the primary source for the layer below. Threads (one thing an artifact says, with its `path:lines`) have two roles and no third: they **pre-fill** a draft where the layers above leave it open, and they are the **evidence** every draft is checked against. Precedence: the human's approval in this run, their typed words, the newest artifact, older artifacts. Every sentence rests on a thread or the human's words; nothing invented. Mark threads used; unused ones feed step 9.

When a thread disagrees with an approval or with a draft derived from one: do not settle it and do not start the next layer. Ask "The document says A [1]. What you approved says B. Which stands?" with options **Keep what I approved** and **The document is right**; a typed third version is applied and asked again. Record the outcome, and list an overruled document in DEC-001 as superseded on that point.

Read only this repository, reference.md and the human's answers. The plugin's own `canon/`, earlier session transcripts and other projects are not this project's intent.

## Asking

- The full draft goes in the question text, once, as prose. A sentence resting on a thread ends with a footnote [1]; one "Sources:" line at the end lists them. Never a path or date inside a sentence.
- Label each question by layer: "Premise (1 of 5): purpose", "Principles (2 of 5)", "Domains (3 of 5)", "Capabilities (4 of 5): <domain>", "Requirements (5 of 5): <capability>", then "Leftovers".
- Options are exactly **Approve as written** and **Drop**, plus the line "To correct or rewrite, type in Other." An option carries no text.
- A list gets one multi-select whose options are ID and title only, then one question per unticked item restating its draft. A ticked item is approved as written. Every multi-select repeats: "Tick every item that is right as written; unticked items come back one by one."
- Typed text is one of three kinds. **Wording** (the statement itself) is stated, quoted verbatim, and is the entry. **A correction** ("drop the counts") is applied exactly and the merged text is asked again; neither it nor its reasons enter the entry. **A process instruction** ("one at a time") is followed for the rest of the run and recorded nowhere.
- Anything the human must know goes inside a question; free text between tool calls may never be read.
- Write a file only after the question approving it is answered.

## Entries

- An entry reads as an encyclopedia entry: what the thing is, complete for a reader who never saw this conversation, one concept per entry; no history, no reasons, no "not" clauses (exclusions live only in Not this), no counts, versions or statuses. Wrong examples and why: reference.md, section 5.
- A requirement or a glossary entry is one or two sentences. A principle is a title and a paragraph of two to four sentences, because principles are the main alignment point and a one-liner cannot be judged.
- Domains and capabilities in plain words; mechanisms and jargon only in requirements, using glossary terms.
- A written entry carries no footnote markers; sources go in the node's `source` field, or on a Source line after a principle or glossary entry.

## Briefing

The first question begins with this block, verbatim, then the draft:

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

## Steps

### 1 Read

Search `README*`, `REQUIREMENTS*`, `SPEC*`, `ARCHITECTURE*`, `ROADMAP*`, `CHANGELOG*`, `docs/**`, decision records (`docs/adr/**`, `decisions/**`, `.claude/decisions/**`), `.claude/**/*.md`, `CLAUDE.md`, `AGENTS.md`, the package manifest, test names. Note contradictions and which artifact is newer. Never present the list; never ask about provenance.

### 3 Premise

One question each, in order: what it is (one or two sentences); purpose and for whom (one paragraph); not this (three to six non-goals, the only place for what the project is not; multi-select, one by one, then "anything missing?"); glossary (six to ten terms; multi-select, one by one).

### 4 Init

Run `HC init`; tell the human in one sentence that the commit-msg hook now requires an Intent trailer on every commit. Write `canon/README.md` in the root format.

### 5 Principles

Direction: tone, taste, values, ways of working; a "never" the human states is a principle first. Draw on the premise answers first, then on the newest artifacts that state direction (charters, style guides, decision records); a milestone from an old plan is not a principle. Draft three to eight, each a title and a paragraph. Multi-select, one by one, "anything missing?". Write them under `## Principles`.

### 6 Domains

Derive from the approved premise: what distinct areas must exist for this product to operate? A desktop app that turns bank statements into tax reports needs statement import, categorization, reporting; a platform that turns client PDFs into JSON needs intake, discovery, reconciliation, review, provenance, access. Add the domains every software project needs, documentation and verification, with source "software project". Then check the threads: an area they treat as their own is added as a candidate; a contradiction goes through the inconsistency procedure. Propose two to six premise domains plus the project-kind ones: `REQ-n`, plain title, one line on what it must do and why the premise needs it. Multi-select, one by one, "anything missing?". Fewer than about eight areas in total: they are the top level and there is no domain layer.

Gap, when you believe an area is needed and the project has nothing on it: ask "Does this project need <area>?" with **Yes, add it** and **No**, and act on the answer. Only when the human types that it is undecided, ask "Leave it as an open domain to consider later?" with **Leave open** and **Drop**; leave open writes a node with `state: open`, titled as the question.

### 7 Capabilities

Per domain, in turn: given the domain as approved, what does every system of this kind need to be complete? Pre-fill the wording from threads; check each candidate against the threads and the layers above. Up to eight: plain title, one line, source (an artifact, or `archetype` when nothing in the project covers it, in which case it is an `open` node titled as the question). Judge each against the principles and name any drift in the question. One multi-select per domain, then one by one.

### 8 Requirements

Per capability, in turn: the concrete requirements under it, pre-filled from threads, as assumed nodes with sources. A thread that contradicts the capability or a principle goes through the inconsistency procedure first. A requirement is verifiable by definition: name to yourself a check in content or code that would show it met; none means it is a principle or too vague, so do not propose it. Already a yes-or-no check: set `kind`. Judge each against the principles. One multi-select per capability with candidates, then one by one. Stop at this depth. Two artifacts disagree: offer both readings; neither chosen: `contested` with both positions.

### 9 Sweep

Unused threads, at most eight per question, as a multi-select with per-thread options **add under <capability>**, **merge into <ID>**, **drop**. Adds become assumed nodes with their source; merges update the named node, citing the source; drops go to `canon/decisions/DEC-001-adoption-scope.md`, one line each with source and reason. An artifact the human calls obsolete gets one line for the whole artifact.

### 10 Verify and commit

`HC check`; fix every error; only proceed at 0 errors. `HC summary` and show the tree; `HC render`. `/headcanon:commit` with one `Intent-Change: create <ID>` per node, `Intent-Change: update ROOT`, `Decision: DEC-001`, and `Approved-By` set to the human's git `user.name`, because they approved every item here.

### 11 Report

Domains with their capabilities; open capabilities and domains; counts of stated, resolved and assumed nodes; what was dropped and why; what the human corrected; and that `/headcanon:review` walks the assumed and open items when they are ready. The canon is a seed, not complete.

## Examples

<example>
Domain question, plain words, one line each, footnoted:
"Domains (3 of 5). For Ledgerline to operate, these areas must exist. Tick every item that is right as written; unticked items come back one by one.
REQ-1 Statement import: bank statements in any common format become transactions. [1]
REQ-2 Categorization: every transaction lands in a tax category, by rule or by hand. [1]
REQ-3 Reporting: the categorized year becomes the forms an accountant needs. [1]
REQ-4 Documentation: how the project records what it is and why. [2]
REQ-5 Verification: how the project shows its code does what is intended. [2]

Sources: [1] premise, [2] software project

To correct or rewrite one, type in Other."
</example>

<example>
Typed correction applied exactly, then asked again:
Human types: "Don't mention how many banks we support."
Agent asks: "Merged text: 'Ledgerline imports statements from any bank that exports a common format, and keeps the original file next to the transactions it produced.' Approve as written / Drop. To correct, type in Other."
</example>

<example>
Glossary entries. Wrong: "Category: a label on a transaction; a rule is a saved category assignment. NOT a tag." Right: two entries. "Category: a label that places a transaction on one line of the tax report." "Rule: a saved condition that assigns a category to every transaction matching it."
</example>
