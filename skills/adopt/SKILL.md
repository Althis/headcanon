---
name: adopt
description: "Creates a project's first canon and reviews it with the human on the canvas: reads the repository, drafts premise, principles, domains, capabilities and requirements as assumptions, marks what it could not guess as open questions, then attends the page while the human approves, rewrites and deletes boxes until nothing red is left. Use when the session context says the project has no canon, when an adoption was started but not finished, or when the human asks to set up, adopt, install or start HeadCanon on a project."
when_to_use: "No canon/README.md exists; or a canon exists without canon/decisions/DEC-001-adoption-scope.md, which is an unfinished adoption; or the human asks to add HeadCanon to a project."
---

# Adopt: draft the canon, then review it with the human

`HC` means `node "${CLAUDE_PLUGIN_ROOT}/packages/canon/bin/headcanon.js"`. The briefing, formats, question shapes and wrong-entry examples are in [reference.md](reference.md); read it before step 2.

The canon is drafted whole from the repository before the human judges anything: every entry the artifacts support is a guess marked `assumed`, every entry only the structure demands is an `open` question, and the human then reviews on the canvas, top-down, approving, rewriting or deleting one box at a time while you keep the rest consistent. Lay users refine the upper levels and the lower levels follow from them, so a guess that rests on a parent and a thread is worth more than a question. The `refine` skill cuts every node (`/headcanon:refine <ID> <layer> draft`); the `attend` skill runs the review loop; both return here.

## Checklist

Write this list to your scratch file and tick items as you go.

- [ ] 0 Where things stand: no `canon/` is a fresh start, go to 1; a canon without `canon/decisions/DEC-001-adoption-scope.md` is an unfinished adoption, go to 6; both present, point to `/headcanon:review` and stop.
- [ ] 1 Read the repository silently; write the thread list.
- [ ] 2 The briefing, as its own question.
- [ ] 3 `HC init`; draft the root README.
- [ ] 4 Draft the tree in `HC next` order: domains, capabilities, requirements.
- [ ] 5 Recalculate: `HC check` at 0 errors, then the consistency pass.
- [ ] 6 Open the canvas; say what is red and where to start.
- [ ] 7 `/headcanon:attend` until the human finishes.
- [ ] 8 Sweep leftovers, DEC-001, `HC render`, `/headcanon:commit`, report.

## Sources

Threads (one thing an artifact says, with its `path:lines`) are the direction of every draft and the evidence every draft is checked against. Precedence: what the human approved or typed in the page, the newest artifact, older artifacts. Every sentence rests on a thread or the human's words; nothing invented. Mark threads used; unused ones feed step 8.

Two threads that disagree on an entry: draft from the newer and make the node `contested`, with both statements under `## Contested`, so it comes up red. A thread that disagrees with something the human approved on the canvas is never settled by you: say it in the chat and ask "The document says A. You approved B. Which stands?" with **Keep what I approved** and **The document is right**; list an overruled document in DEC-001 as superseded on that point.

Read only this repository, reference.md and what the human does in the page. The plugin's own `canon/`, earlier session transcripts and other projects are not this project's intent.

## Guessing

- **Enough to guess**: the entry's line can be written from its chain to the parent plus a thread or the archetype of its kind. Write it `assumed`, with the chain and the thread in `source`.
- **Not enough**: only the chain exists and nothing in the project says what the thing concretely is. Write an `open` node titled as the question, with the chain in `source`, and invent nothing.
- **Prefer the guess** whenever a thread speaks to the entry at all: the human corrects a wrong guess in one click, but cannot answer a question that was never asked.
- The premise, the glossary and the principles are guessed the same way, from the newest artifacts that state them; a document the human did not watch being written never makes an entry stated.

## Asking

The few questions left, the briefing, the sweep and a disagreement after an approval, go through `headcanon_ask` when the viewer's tools are present (reference.md section 6), otherwise AskUserQuestion. A draft in a question reads as prose; a sentence resting on a thread ends with a footnote [1] and one "Sources:" line lists them. Options are exactly **Approve as written** and **Drop** unless the step names others; an option carries no text; a list gets one multi-select whose options are ID and title with the one-line draft as description. Typed text is wording (stated, quoted verbatim), a correction (applied exactly to the draft it names, which is asked again; in a list only the changed items come back, and items the text approves count as ticked), or a process instruction (followed, recorded nowhere). Anything the human must know travels as a question's `notice` or a `headcanon_say`, never inside a draft and never as free text between tool calls, which may never be read.

## Entries

- An entry reads as an encyclopedia entry: what the thing is, complete for a reader who never saw this conversation, one concept per entry; no history, no reasons, no "not" clauses (exclusions live only in Not this), no counts, versions or statuses. Wrong examples and why: reference.md, section 5.
- A requirement or a glossary entry is one or two sentences. A principle is a title and a paragraph of two to four sentences, because principles are the main alignment point and a one-liner cannot be judged.
- Domains and capabilities in plain words; mechanisms and jargon only in requirements, using glossary terms.
- A written entry carries no footnote markers; sources go in the node's `source` field, or on a Source line after a principle or glossary entry.

## Steps

### 1 Read

Search `README*`, `REQUIREMENTS*`, `SPEC*`, `ARCHITECTURE*`, `ROADMAP*`, `CHANGELOG*`, `docs/**`, decision records (`docs/adr/**`, `decisions/**`, `.claude/decisions/**`), `.claude/**/*.md`, `CLAUDE.md`, `AGENTS.md`, the package manifest, test names. Note contradictions and which artifact is newer. Never present the list; never ask about provenance.

### 2 Briefing

The briefing block in reference.md section 0, verbatim, as a question with the single option **Let's begin**. Nothing else is asked before the canvas opens.

### 3 Root

`HC init`. Draft `canon/README.md` in the root format with everything `assumed`: what it is (one or two sentences) and the purpose and for whom (one paragraph) from the newest artifacts; Not this, three to six non-goals the artifacts state; a glossary of six to ten terms; three to eight principles, each a title and a paragraph, from charters, style guides and decision records, where a "never" the artifacts state is a principle first and a milestone from an old plan is not. The Glossary heading keeps `[assumed]`.

### 4 Tree

`refine ROOT domain draft`, passing documentation and verification as candidates with source `software project`; the archetype prompt reads "what distinct areas must exist for this product to operate?". Fewer than about eight areas: they are the top level with `layer: capability` and there is no domain layer. Then each domain with `capability draft` and each capability with `requirement draft`, in the order `HC next` gives, so that what others build on is defined first. Stop at the requirement layer; deeper levels wait for the human's Define further.

### 5 Recalculate

`HC check`; fix every error. Then the consistency pass: `git add canon`, run the verifier agent (`headcanon:verifier`) and apply its findings before `git reset -q canon`. A contradiction makes both nodes `contested`, with the two statements under `## Contested` and a `conflicts` link. A reiteration merges the newer node into the older when they say one thing, PRN-1, and otherwise writes an `open` node asking whether they are one. Drift goes under the node's `## Open`. Uptake rewrites the parent's line as `assumed`.

### 6 Canvas

`headcanon_open` with view `adopt`. `headcanon_say`: how many boxes are approved, guessed and need them; that the commit-msg hook now requires an Intent trailer on every commit; and where to start, the premise at the top, then the domains. `headcanon_focus` ROOT with `open`.

### 7 Attend

`/headcanon:attend`. It returns when the human presses Finish with nothing red left.

### 8 Finish

Unused threads, at most eight per question, as a multi-select with per-thread options **add under <ID>**, **merge into <ID>**, **drop**: adds become assumed nodes with their source, merges update the named node citing the source, drops go to `canon/decisions/DEC-001-adoption-scope.md` one line each with source and reason; an artifact the human calls obsolete gets one line. Write DEC-001 (reference.md section 3). `HC check` at 0 errors; `HC render`; `/headcanon:commit` with one `Intent-Change: create <ID>` per node, `update ROOT`, `Decision: DEC-001`, and `Approved-By` the human's git `user.name`, because every green box carries their approval. Report in the chat: domains with their capabilities; counts of approved, guessed and open; what they rewrote or deleted; and that `/headcanon:review` walks what stayed assumed.

## Examples

<example>
Enough to guess. Parent: "Statement import: bank statements in any common format become transactions." Thread: docs/formats.md:3 lists CSV, OFX and QIF. Child written assumed: "REQ-1.2 Parsing: a statement in CSV, OFX or QIF becomes transactions, one per line", source "REQ-1 (consequence of 'become transactions'); docs/formats.md:3".
</example>

<example>
Not enough. The same parent implies that a statement imported twice must not double its transactions, but no document says how a duplicate is told apart. Child written open: title "How is a duplicate transaction recognized?", source "REQ-1 (failure of 'one transaction per line')", no Intent.
</example>

<example>
Resuming. The session starts, `canon/README.md` exists and DEC-001 does not. Step 0 sends you to 6: open the canvas, say "12 approved, 31 guessed, 4 need you; REQ-2.3 is the first red box", focus it, and attend.
</example>
