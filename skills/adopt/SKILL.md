---
name: adopt
description: "Creates a project's first canon from its repository and the human's answers, top-down: premise, principles, domains, capabilities, requirements, then a sweep of leftover artifact threads. Use when the session context says the project has no canon, or when the human asks to set up, adopt, install or start HeadCanon on a project."
when_to_use: "No canon/README.md exists, or the human asks to add HeadCanon to a project."
---

# Adopt: create the first canon

`HC` means `node "${CLAUDE_PLUGIN_ROOT}/packages/canon/bin/headcanon.js"`. File formats and question templates are in [reference.md](reference.md); read it before step 4.

## Checklist

Write this list to your scratch file next to the thread list, and tick items as you complete them. The human sees progress through the step names in each question, not through this list.

- [ ] 0 `HC check` reports no canon. Only proceed when it does; otherwise point the human to `/headcanon:review` and stop.
- [ ] 1 Read the artifacts silently; write the thread list to a scratch file.
- [ ] 2 Put the briefing in the first question's text.
- [ ] 3 Premise: what it is, purpose, not this, glossary.
- [ ] 4 `HC init`; write `canon/README.md`.
- [ ] 5 Principles into the root README.
- [ ] 6 Domains.
- [ ] 7 Capabilities, one domain at a time.
- [ ] 8 Requirements, one capability at a time.
- [ ] 9 Sweep unused threads: add, merge or drop.
- [ ] 10 `HC check` clean, `HC summary`, `HC render`, `/headcanon:commit`.
- [ ] 11 Report.

## Asking

These apply to every question in every step.

- Ask with AskUserQuestion. The full draft goes in the question text.
- Options are exactly two: **Approve as written** and **Drop**. Add to the question: "To correct or rewrite, type in Other." An option carries no text, so a "correct" option would arrive empty.
- Lists get one multi-select first. **A selected item is approved as written** and becomes resolved. Then ask one question per unselected item, restating the original draft.
- Anything the human must know goes inside a question's text, never in a free-text message between tool calls; those may never be read.
- Classify typed text before acting on it:
  - **Wording** (the statement itself): stated, quoted verbatim; it is the node's content.
  - **A correction as an instruction** ("drop the counts"): apply exactly what it names to the draft, then ask again with the merged text. Only that answer makes the merged text resolved. Neither the correction nor the reasons given for it are recorded in the entry; the entry reads as if the conversation never happened.
  - **A process instruction** ("one at a time"): follow it for the rest of the run; record it nowhere.
- Write a file only after the question that approves it has been answered.

## The briefing

Free text you send between tool calls may never reach the human, so the briefing goes inside the first question. The human is using HeadCanon for the first time, so the briefing says what is happening before it says how the buttons work. Begin the first question's text with this block, verbatim, then the draft:

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

Step 1 of 11: what the project is.
```

Every later question starts with its step name and number ("Step 6 of 11: domains"). Every multi-select question repeats one line: "Tick every item that is right as written; unticked items come back one by one."

## Drafting rules

- Every clause cites a source, as `path:lines` inside this repository or `conversation, <date>`. No source, no clause.
- Intent only. Counts, versions and statuses describe today and never enter a node.
- Domains and capabilities in plain words. Mechanisms belong in requirements, using glossary terms.
- One idea per node. A node that needs "and" twice is two nodes.
- Every entry, whether a node's intent, a glossary definition, a principle or a non-goal, reads as a dictionary or encyclopedia entry: concise, about what the thing is, complete for a reader who never saw this conversation, one concept per entry. No correction history, no reasons, no "not" clauses; exclusions live only in a Not this section. Wrong examples and why they are wrong: reference.md, section 5.
- Threads: before each step, scan the thread list for threads about that step, use them, mark them used. Unused threads feed step 9.

## Steps

### 1 Read

Search `README*`, `REQUIREMENTS*`, `SPEC*`, `ARCHITECTURE*`, `ROADMAP*`, `CHANGELOG*`, `docs/**`, decision records (`docs/adr/**`, `decisions/**`, `.claude/decisions/**`), `.claude/**/*.md`, `CLAUDE.md`, `AGENTS.md`, the package manifest, test names. A thread is one thing an artifact says plus its `path:lines`. Note contradictions and which artifact is newer. Never present the list and never ask about provenance; the human judges drafts, not files.

Read only files inside this repository, this skill's reference file, and the human's answers. Do not open the plugin directory's own `canon/`, earlier session transcripts, or other projects: their content is not this project's intent, and drafts built from them are invented.

### 3 Premise

One question each, in order: what it is (one or two sentences); purpose and for whom (one paragraph); not this (three to six; multi-select, one by one, then "anything missing?"); glossary (six to ten terms; multi-select, one by one).

### 4 Init

Run `HC init`. Tell the human in one sentence that the commit-msg hook now requires an Intent trailer on every commit. Write `canon/README.md` in the root format from reference.md.

### 5 Principles

Principles are direction: tone, taste, values, ways of working. A "never" the human states is a principle first. Draft three to eight as `**PRN-n Title**: statement` with sources. Multi-select, one by one, "anything missing?". Write them under `## Principles` in the root README.

### 6 Domains

Domains come from two sources, in this order, and artifacts are not one of them:

1. **The premise.** What distinct areas must exist for this product to operate? A desktop app that turns bank statements into tax reports needs statement import, transaction categorization, report generation. A platform that turns client PDFs into JSON needs intake, discovery, reconciliation, review, provenance, access.
2. **The kind of project.** Every software project needs documentation and verification regardless of premise. Propose those too, with "software project" as source.

Then scan the threads for areas the artifacts treat as their own that you missed. Propose two to six premise domains plus the project-kind ones: `REQ-n`, a plain title, one line saying what the domain must do and why the premise needs it. Multi-select, one by one, "anything missing?".

Gap procedure, when you believe an area is needed and the project has nothing on it:
1. Ask: "Does this project need <area>?" Options: **Yes, add it**, **No**. When the answer is one of those two, act on it and stop here.
2. When the human types that it is undecided: ask "Leave it as an open domain to consider later?" Options: **Leave open**, **Drop**. Leave open writes a node with `state: open`, titled as the question.

Fewer than about eight areas in total: those areas are the top level and there is no domain layer.

### 7 Capabilities

For each domain, in turn: what does every system of this kind need to be fully defined as one? Archetype first, threads second. Propose up to eight: a plain title, one line, a source (an artifact, or `archetype` when nothing in the project covers it). A capability nothing in the project covers is proposed as an `open` node titled as the question. Judge each against the principles and name any drift in the question. One multi-select per domain, then one by one.

### 8 Requirements

For each capability, in turn: what the threads state, as assumed nodes with sources. Before proposing one, name to yourself a check in content or code that would show it met. No check means it is a principle or too vague: do not propose it. A requirement that is already a yes-or-no check gets `kind`. Judge each against the principles. One multi-select per capability that has candidates, then one by one. Stop at this depth; deeper levels fill when work touches a branch.

Two artifacts disagree: offer both readings. Neither chosen: write the node as `contested` with both positions.

### 9 Sweep

Take every unused thread, at most eight per question, as a multi-select whose options per thread are **add under <capability>**, **merge into <ID>**, **drop**. Added threads become assumed nodes with their source. Merged threads update the named node, citing the source. Dropped threads go into `canon/decisions/DEC-001-adoption-scope.md` in the format from reference.md, one line each with source and reason. An artifact the human calls obsolete gets one line for the whole artifact.

### 10 Verify and commit

Run `HC check` and fix every error. Only proceed when it reports 0 errors. Run `HC summary` and show the tree, then `HC render`. Run `/headcanon:commit` with one `Intent-Change: create <ID>` per node, `Intent-Change: update ROOT`, `Decision: DEC-001`, and `Approved-By` set to the human's git `user.name`, because they approved every item in this conversation.

### 11 Report

List the domains with their capabilities; the open capabilities and domains; the counts of stated, resolved and assumed nodes; what was dropped and why; what the human corrected; and that `/headcanon:review` walks the assumed and open items when they are ready. The canon is a seed, not complete.

## Examples

<example>
Domain question, plain words, one line each, sources named:
"Step 6 of 11: domains. For Ledgerline to operate, these areas must exist. Selected means approved as written; unselected items are asked about next.
REQ-1 Statement import: bank statements in any common format become transactions. (premise)
REQ-2 Categorization: every transaction lands in a tax category, by rule or by hand. (premise)
REQ-3 Reporting: the categorized year becomes the forms an accountant needs. (premise)
REQ-4 Documentation: how the project records what it is and why. (software project)
REQ-5 Verification: how the project shows its code does what is intended. (software project)
To correct or rewrite one, type in Other."
</example>

<example>
Typed correction handled as an instruction, then re-asked:
Human types: "Don't mention how many banks we support."
Agent: quotes that line under Stated as a correction, removes the count from the draft, and asks: "Merged text: 'Ledgerline imports statements from any bank that exports a common format, and keeps the original file next to the transactions it produced.' Approve as written / Drop. To correct, type in Other."
</example>

<example>
Glossary entries. Wrong: "Category: a label on a transaction; a rule is a saved category assignment. NOT a tag." Right: two entries. "Category: a label that places a transaction on one line of the tax report." "Rule: a saved condition that assigns a category to every transaction matching it."
</example>
