---
name: adopt
description: "Creates a project's first canon from its repository and the human's answers, top-down: overview, principles, domains, capabilities, requirements, then a sweep of leftover artifact threads. Use when the session context says the project has no canon, or when the human asks to set up, adopt, install or start HeadCanon on a project."
when_to_use: "No canon/README.md exists, or the human asks to add HeadCanon to a project."
---

# Adopt: create the first canon

`HC` means `node "${CLAUDE_PLUGIN_ROOT}/packages/canon/bin/headcanon.js"`. File formats and question templates are in [reference.md](reference.md); read it before step 4.

## Checklist

Copy this list into your first reply and tick items as you complete them.

- [ ] 0 `HC check` reports no canon. Only proceed when it does; otherwise point the human to `/headcanon:review` and stop.
- [ ] 1 Read the artifacts silently; write the thread list to a scratch file.
- [ ] 2 Brief the human on how approval works (one message, no question).
- [ ] 3 Overview: what it is, purpose, not this, glossary.
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
- Classify typed text before acting on it:
  - **Wording** (the statement itself): stated, quoted verbatim; it is the node's content.
  - **A correction as an instruction** ("drop the counts"): quote it under Stated as a correction, apply it to the draft, then ask again with the merged text. Only that answer makes the merged text resolved.
  - **A process instruction** ("one at a time"): follow it for the rest of the run; record it nowhere.
- Write a file only after the question that approves it has been answered.

## The briefing

Before the first question, send one message: selecting an item approves it as written; unselected items will be asked about one by one; typing in Other corrects or rewrites; only typed words become stated; nothing is written to disk before approval. Then begin step 3.

## Drafting rules

- Every clause cites a source, as `path:lines` or `conversation, <date>`. No source, no clause.
- Intent only. Counts, versions and statuses describe today and never enter a node.
- Domains and capabilities in plain words. Mechanisms belong in requirements, using glossary terms.
- One idea per node. A node that needs "and" twice is two nodes.
- A glossary definition says what the term is, covers one concept, and has no "not" clause. Add a disambiguation only when the human asks for one.
- Threads: before each step, scan the thread list for threads about that step, use them, mark them used. Unused threads feed step 9.

## Steps

### 1 Read

Search `README*`, `REQUIREMENTS*`, `SPEC*`, `ARCHITECTURE*`, `ROADMAP*`, `CHANGELOG*`, `docs/**`, decision records (`docs/adr/**`, `decisions/**`, `.claude/decisions/**`), `.claude/**/*.md`, `CLAUDE.md`, `AGENTS.md`, the package manifest, test names. A thread is one thing an artifact says plus its `path:lines`. Note contradictions and which artifact is newer. Never present the list and never ask about provenance; the human judges drafts, not files.

### 3 Overview

One question each, in order: what it is (one or two sentences); purpose and for whom (one paragraph); not this (three to six; multi-select, one by one, then "anything missing?"); glossary (six to ten terms; multi-select, one by one).

### 4 Init

Run `HC init`. Tell the human in one sentence that the commit-msg hook now requires an Intent trailer on every commit. Write `canon/README.md` in the root format from reference.md.

### 5 Principles

Principles are direction: tone, taste, values, ways of working. A "never" the human states is a principle first. Draft three to eight as `**PRN-n Title**: statement` with sources. Multi-select, one by one, "anything missing?". Write them under `## Principles` in the root README.

### 6 Domains

Domains come from two sources, in this order, and artifacts are not one of them:

1. **The premise.** What distinct areas must exist for this product to operate? A game that ships its own engine and in-game editor needs content, engine, editor. A platform that turns client PDFs into JSON needs intake, discovery, reconciliation, review, provenance, access.
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
"DOMAINS. For The Valley to operate, these areas must exist. Select every one to keep.
REQ-1 Game content: the world, characters, scenes and prose the player experiences. (premise)
REQ-2 Game engine: runs the content, keeps state, resolves rules. (premise)
REQ-3 Editor: lets a creator author and play content without code. (premise)
REQ-4 Documentation: how the project records what it is and why. (software project)
REQ-5 Verification: how the project shows its content and code do what is intended. (software project)
To correct or rewrite one, type in Other."
</example>

<example>
Typed correction handled as an instruction, then re-asked:
Human types: "Don't mention the questline counts."
Agent: quotes that line under Stated as a correction, removes the counts from the draft, and asks: "Merged text: 'The Valley is an explorable open world of areas, locations and sub-locations, with NPCs, passing time and questlines that link to one another.' Approve as written / Drop. To correct, type in Other."
</example>

<example>
Glossary entries. Wrong: "Effect: a layered modifier on computed stats; a trait is a permanent base-layer effect. NOT a direct write." Right: two entries. "Effect: a layered modifier (base, buff, equipment) on computed stats, constants and resistances." "Trait: a permanent characteristic of a character, applied as a base-layer effect."
</example>
