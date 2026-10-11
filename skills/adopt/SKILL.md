---
name: adopt
description: "Creates a project's first canon from its repository and the human's answers, top-down: premise, principles, domains, capabilities, requirements, then a sweep of leftover artifact threads. Use when the session context says the project has no canon, or when the human asks to set up, adopt, install or start HeadCanon on a project."
when_to_use: "No canon/README.md exists, or the human asks to add HeadCanon to a project."
---

# Adopt: create the first canon

`HC` means `node "${CLAUDE_PLUGIN_ROOT}/packages/canon/bin/headcanon.js"`. The briefing, formats, question shapes and wrong-entry examples are in [reference.md](reference.md); read it before step 2.

Work top-down in five layers, each approved before the next: premise, principles, domains, capabilities, requirements; then a sweep of leftovers. The three lower layers are cut by the `refine` skill (`/headcanon:refine <ID> <layer>`), one node at a time, and it returns to this skill. The human decides every draft through `headcanon_ask` when the viewer's tools are present (reference.md section 6), otherwise AskUserQuestion. You read the repository; they judge drafts, never files.

## Checklist

Write this list to your scratch file and tick items as you go. The human sees progress through the layer label on each question.

- [ ] 0 `HC check` reports no canon; otherwise point to `/headcanon:review` and stop.
- [ ] 1 Read the repository silently; write the thread list.
- [ ] 2 The briefing, as its own question; the premise waits for its answer.
- [ ] 3 Premise: what it is, purpose, not this, glossary.
- [ ] 4 `HC init`; write `canon/README.md`.
- [ ] 5 Principles.
- [ ] 6 Domains: refine ROOT.
- [ ] 7 Capabilities: refine each domain.
- [ ] 8 Requirements: refine each capability.
- [ ] 9 Sweep unused threads.
- [ ] 10 `HC check` clean, `HC summary`, `HC render`, `/headcanon:commit`.
- [ ] 11 Report.

## Sources

What the human approved or typed in the layer above is the primary source for the layer below. Threads (one thing an artifact says, with its `path:lines`) have two roles and no third: they **pre-fill** a draft where the layers above leave it open, and they are the **evidence** every draft is checked against. Precedence: the human's approval in this run, their typed words, the newest artifact, older artifacts. Every sentence rests on a thread or the human's words; nothing invented. Mark threads used; unused ones feed step 9.

When a thread disagrees with an approval or with a draft derived from one: do not settle it and do not start the next layer. Ask "The document says A [1]. What you approved says B. Which stands?" with options **Keep what I approved** and **The document is right**; a typed third version is applied and asked again. Record the outcome, and list an overruled document in DEC-001 as superseded on that point.

Read only this repository, reference.md and the human's answers. The plugin's own `canon/`, earlier session transcripts and other projects are not this project's intent. With the viewer's tools present, call `headcanon_changes` before each layer: wording the human typed in the page is stated, and a refine-request names the branch to decompose next.

## Asking

- The full draft goes in the question text, once, as prose. A sentence resting on a thread ends with a footnote [1]; one "Sources:" line at the end lists them. Never a path or date inside a sentence.
- Label each question by layer: "Premise (1 of 5): purpose", "Principles (2 of 5)", "Domains (3 of 5)", "Capabilities (4 of 5): <domain>", "Requirements (5 of 5): <capability>", then "Leftovers".
- Options are exactly **Approve as written** and **Drop**; the briefing has told the human that Other replaces them with their own wording or a correction, so no question repeats it. An option carries no text.
- A list gets one multi-select: each option's label is the ID and title, its description the item's one-line draft ending with its footnote; the question body holds only the layer label, the instruction and the Sources line, never the drafts again. Then one question per unticked item restating its draft. A ticked item is approved as written. Every multi-select repeats: "Tick every item that is right as written; unticked items come back one by one."
- Typed text is one of three kinds. **Wording** (the statement itself) is stated, quoted verbatim, and is the entry. **A correction** ("drop the counts") is applied exactly and the merged text is asked again; neither it nor its reasons enter the entry. **A process instruction** ("one at a time") is followed for the rest of the run and recorded nowhere.
- "Anything missing?" closes a layer with the options **Nothing missing** and **Remind me later in review**; typed text is the missing item, drafted and asked back. Remind me later adds a line under `## Open` in the root README with the date and the layer, which `/headcanon:review` walks.
- Anything the human must know travels with a question, as its `notice` through the page or a sentence before it in the terminal, never inside the draft; free text between tool calls may never be read.
- Write a file only after the question approving it is answered.

## Entries

- An entry reads as an encyclopedia entry: what the thing is, complete for a reader who never saw this conversation, one concept per entry; no history, no reasons, no "not" clauses (exclusions live only in Not this), no counts, versions or statuses. Wrong examples and why: reference.md, section 5.
- A requirement or a glossary entry is one or two sentences. A principle is a title and a paragraph of two to four sentences, because principles are the main alignment point and a one-liner cannot be judged.
- Domains and capabilities in plain words; mechanisms and jargon only in requirements, using glossary terms.
- A written entry carries no footnote markers; sources go in the node's `source` field, or on a Source line after a principle or glossary entry.

## Briefing

The first question is the briefing block in reference.md section 0, pasted verbatim, with the single option **Let's begin** and no draft, so the human agrees to the process before judging anything. The premise draft is the next question, asked only once that answer is in.

## Steps

### 1 Read

Search `README*`, `REQUIREMENTS*`, `SPEC*`, `ARCHITECTURE*`, `ROADMAP*`, `CHANGELOG*`, `docs/**`, decision records (`docs/adr/**`, `decisions/**`, `.claude/decisions/**`), `.claude/**/*.md`, `CLAUDE.md`, `AGENTS.md`, the package manifest, test names. Note contradictions and which artifact is newer. Never present the list; never ask about provenance.

### 3 Premise

One question each, in order: what it is (one or two sentences); purpose and for whom (one paragraph); not this (three to six non-goals, the only place for what the project is not; multi-select, one by one, then "anything missing?"); glossary (six to ten terms; multi-select, one by one).

### 4 Init

Run `HC init`; the human must learn in one sentence that the commit-msg hook now requires an Intent trailer on every commit: through the page it is the `notice` of the next question, never part of its text; in the terminal it is said before the next question. Write `canon/README.md` in the root format.

### 5 Principles

Direction: tone, taste, values, ways of working; a "never" the human states is a principle first. Draw on the premise answers first, then on the newest artifacts that state direction (charters, style guides, decision records); a milestone from an old plan is not a principle. Draft three to eight, each a title and a paragraph. Multi-select, one by one, "anything missing?". Write them under `## Principles`.

### 6 Domains

Refine `ROOT` with layer `domain`, labelled "Domains (3 of 5)", passing two candidates every software project needs, documentation and verification, with source `software project`. The node is the approved premise and the archetype prompt reads "what distinct areas must exist for this product to operate?": a desktop app that turns bank statements into tax reports needs statement import, categorization, reporting; a platform that turns client PDFs into JSON needs intake, discovery, reconciliation, review, provenance, access. Each domain is a folder with a `README.md`, `layer: domain`; the partition goes in the root README's front-matter. Fewer than about eight areas in total: they are the top level with `layer: capability`, and there is no domain layer.

### 7 Capabilities

Per approved domain, in turn: refine it with layer `capability`, labelled "Capabilities (4 of 5): <domain>". The archetype prompt reads "what does every system of this kind need for this domain to be complete?". The children are written under the domain, `layer: capability`.

### 8 Requirements

Per capability, in turn: refine it with layer `requirement`, labelled "Requirements (5 of 5): <capability>". Stop at this depth; deeper levels wait for the human's Define this branch.

### 9 Sweep

Unused threads, at most eight per question, as a multi-select with per-thread options **add under <capability>**, **merge into <ID>**, **drop**. Adds become assumed nodes with their source; merges update the named node, citing the source; drops go to `canon/decisions/DEC-001-adoption-scope.md`, one line each with source and reason. An artifact the human calls obsolete gets one line for the whole artifact.

### 10 Verify and commit

`HC check`; fix every error; only proceed at 0 errors. `HC summary` and show the tree; `HC render`. `/headcanon:commit` with one `Intent-Change: create <ID>` per node, `Intent-Change: update ROOT`, `Decision: DEC-001`, and `Approved-By` set to the human's git `user.name`, because they approved every item here.

### 11 Report

Domains with their capabilities; open capabilities and domains; counts of stated, resolved and assumed nodes; what was dropped and why; what the human corrected; and that `/headcanon:review` walks the assumed and open items when they are ready. The canon is a seed, not complete.

## Examples

<example>
Domain question, plain words, one line each, footnoted:
Body: "Domains (3 of 5). For Ledgerline to operate, these areas must exist. Tick every item that is right as written; unticked items come back one by one.

Sources: [1] premise, [2] software project"
Options: label "REQ-1 Statement import", description "bank statements in any common format become transactions. [1]"; label "REQ-2 Categorization", description "every transaction lands in a tax category, by rule or by hand. [1]"; label "REQ-3 Reporting", description "the categorized year becomes the forms an accountant needs. [1]"; label "REQ-4 Documentation", description "how the project records what it is and why. [2]"; label "REQ-5 Verification", description "how the project shows its code does what is intended. [2]".
</example>

<example>
Typed correction applied exactly, then asked again:
Human types: "Don't mention how many banks we support."
Agent asks: "Merged text: 'Ledgerline imports statements from any bank that exports a common format, and keeps the original file next to the transactions it produced.' Approve as written / Drop."
</example>

<example>
Glossary entries. Wrong: "Category: a label on a transaction; a rule is a saved category assignment. NOT a tag." Right: two entries. "Category: a label that places a transaction on one line of the tax report." "Rule: a saved condition that assigns a category to every transaction matching it."
</example>
