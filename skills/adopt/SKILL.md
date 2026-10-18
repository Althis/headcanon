---
name: adopt
description: "Creates a project's first canon and reviews it with the human on the canvas: reads the repository, drafts premise, principles and domains as assumptions, opens the canvas, and keeps cutting the layers below with refiner agents while the human approves, rewrites and deletes boxes until nothing red is left, then on to leaves that carry a check. Use when the session context says the project has no canon, when an adoption was started but not finished, or when the human asks to set up, adopt, install or start HeadCanon on a project."
when_to_use: "No canon/README.md exists; or a canon exists without canon/decisions/DEC-001-adoption-scope.md, which is an unfinished adoption; or the human asks to add HeadCanon to a project."
---

# Adopt: draft the canon, then review it with the human

`HC` means `node "${CLAUDE_PLUGIN_ROOT}/packages/canon/bin/headcanon.js"`. The briefing, formats, question shapes and wrong-entry examples are in [reference.md](reference.md); read it before step 2.

The canon is drafted from the repository as guesses, and the human judges it on the canvas while the drafting goes on below them: every entry the artifacts support is a guess marked `assumed`, every entry only the structure demands is an `open` question. The human gives this about a quarter of an hour, which goes to the premise, the principles, every red box and the yellow ones they choose; so the canvas opens as soon as the domains exist, everything deeper is cut while they use it, and the cutting goes on after they finish, down to leaves that carry a check. Lay users refine the upper levels and the lower levels follow from them, so a guess that rests on a parent and a thread is worth more than a question. The `refine` skill cuts a node; below the domains it runs as the `refiner` agent, one node per agent in a fresh context, several at once. The `attend` skill runs that work and the review together; both return here.

## Checklist

- 0 Where things stand: no `canon/` is a fresh start, go to 1; a canon without `canon/decisions/DEC-001-adoption-scope.md` is an unfinished adoption, go to 5; both present, point to `/headcanon:review` and stop.
- 1 Read the repository silently; write the thread list.
- 2 The briefing, as its own question.
- 3 `HC init`; draft the root README.
- 4 Cut the premise into domains; open the canvas.
- 5 `/headcanon:attend`: refiners cut every ready node while the human reviews; it returns at Finish.
- 6 Sweep leftovers, DEC-001, `HC render`, `/headcanon:commit`, report; then attend goes on to the leaves.

## Sources

Threads (one thing an artifact says, with its `path:lines`) are the direction of every draft and the evidence every draft is checked against. Precedence: what the human approved or typed in the page, the newest artifact, older artifacts. Every sentence rests on a thread or the human's words; nothing invented. Mark threads used; unused ones feed step 6.

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

## Consistency

`HC check` at 0 errors after every write. The verifier agent (`headcanon:verifier`) runs on a branch when nothing in it is left to cut, and at Finish on what changed since: `git add canon`, the verifier, its findings applied, `git reset -q canon`. A contradiction between two threads makes both nodes `contested`, with the two statements under `## Contested` and a `conflicts` link; one the draft itself introduced, where the threads agree, is fixed in the draft from them. A reiteration merges the newer node into the older when they say one thing, PRN-1, and otherwise writes an `open` node asking whether they are one. Drift goes under the node's `## Open`. Uptake rewrites the parent's line as `assumed`. Nodes are files edited in place; nothing regenerates `canon/`, which would erase what the human has approved.

## Steps

### 1 Read

Search `README*`, `REQUIREMENTS*`, `SPEC*`, `ARCHITECTURE*`, `ROADMAP*`, `CHANGELOG*`, `docs/**`, decision records (`docs/adr/**`, `decisions/**`, `.claude/decisions/**`), `.claude/**/*.md`, `CLAUDE.md`, `AGENTS.md`, the package manifest, test names. Note contradictions and which artifact is newer. Never present the list; never ask about provenance. The thread list is a file the refiners read, so it names its path:lines and stays current.

### 2 Briefing

The briefing block in reference.md section 0, verbatim, as a question with the single option **Let's begin**. Nothing else is asked before the canvas opens.

### 3 Root

`HC init`. Draft `canon/README.md` in the root format with everything `assumed`: what it is (one or two sentences) and the purpose and for whom (one paragraph) from the newest artifacts; Not this, three to six non-goals the artifacts state; a glossary of six to ten terms; three to eight principles, each a title and a paragraph, from charters, style guides and decision records, where a "never" the artifacts state is a principle first and a milestone from an old plan is not. The Glossary heading keeps `[assumed]`.

### 4 Domains

`/headcanon:refine ROOT domain draft` here, in this session, passing documentation and verification as candidates with source `software project`; the archetype prompt reads "what distinct areas must exist for this product to operate?". Fewer than about eight areas: they are the top level with `layer: capability` and there is no domain layer. `HC check` at 0 errors. Then `headcanon_open` with view `adopt`; `headcanon_say` what exists, that the layers below are being drafted while they read, that the commit-msg hook now requires an Intent trailer on every commit, and where to start, the premise at the top; `headcanon_focus` ROOT with `open`. Nothing deeper is drafted in this context: a tree written in one output is checked by nobody set by set, is lost whole to a dropped connection, and gives the page nothing to show. Resuming an unfinished adoption starts here with the open and the say, counting what is approved, guessed and red, and naming the first red box.

### 5 Attend

`/headcanon:attend`, with the thread file and the goal of cutting every node to its leaves. It takes the ready nodes from `HC next --json`, spawns a `refiner` for each, several at once in the background, green parents first and none under a red box, integrates every return, keeps the Consistency rules, and handles what the human does on the canvas in between. The human's time goes to the premise, the principles, every red box and the yellow ones they choose; everything else is said in the chat, never asked. It returns when the human presses Finish with nothing red.

### 6 Finish

Unused threads, at most eight per question, as a multi-select with per-thread options **add under <ID>**, **merge into <ID>**, **drop**: adds become assumed nodes with their source, merges update the named node citing the source, drops go to `canon/decisions/DEC-001-adoption-scope.md` one line each with source and reason; an artifact the human calls obsolete gets one line. Write DEC-001 (reference.md section 3). `HC check` at 0 errors; `HC render`; `/headcanon:commit` with one `Intent-Change: create <ID>` per node, `update ROOT`, `Decision: DEC-001`, and `Approved-By` the human's git `user.name`, because every green box carries their approval. Report in the chat: domains with their capabilities; counts of approved, guessed and open; what they rewrote or deleted; how many leaves carry a check and how many are still to cut; and that `/headcanon:review` walks what stayed assumed. Then `/headcanon:attend` again until nothing is left to cut: it calls the human only at key points, and each branch that reaches its leaves is committed with `/headcanon:commit` and `Approved-By: pending (assumed; /headcanon:review walks them)`.

## Examples

<example>
Enough to guess. Parent: "Statement import: bank statements in any common format become transactions." Thread: docs/formats.md:3 lists CSV, OFX and QIF. Child written assumed: "REQ-1.2 Parsing: a statement in CSV, OFX or QIF becomes transactions, one per line", source "REQ-1 (consequence of 'become transactions'); docs/formats.md:3".
</example>

<example>
Not enough. The same parent implies that a statement imported twice must not double its transactions, but no document says how a duplicate is told apart. Child written open: title "How is a duplicate transaction recognized?", source "REQ-1 (failure of 'one transaction per line')", no Intent.
</example>

<example>
Resuming. The session starts, `canon/README.md` exists and DEC-001 does not. Step 0 sends you to 5: open the canvas as step 4 ends, say "12 approved, 31 guessed, 4 need you; REQ-2.3 is the first red box", focus it, and attend.
</example>
