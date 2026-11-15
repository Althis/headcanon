---
name: adopt
description: "Creates a project's first canon: reads the repository, drafts the premise, principles and domains as assumptions, opens the canvas, and has refiner agents cut every level below to leaves that carry a check before the human is asked anything; then hands the human a list of what to approve or settle, ranked by impact, and keeps the canon consistent while they work it until they press Finish. Use when the session context says the project has no canon, when an adoption was started but not finished, or when the human asks to set up, adopt, install or start HeadCanon on a project."
when_to_use: "No canon/README.md exists; or a canon exists without canon/decisions/DEC-001-adoption-scope.md, which is an unfinished adoption; or the human asks to add HeadCanon to a project."
---

# Adopt: draft the whole canon, then review it by impact

`HC` means `node "${CLAUDE_PLUGIN_ROOT}/packages/canon/bin/headcanon.js"`. The briefing, formats, question shapes and wrong-entry examples are in [reference.md](reference.md); read it before step 2.

Two phases, machine then human (DEC-024). First the canon is drafted from the repository to its leaves with nobody waiting on the human: every entry the artifacts support is a guess marked `assumed`, with what the code does today under `## As built`, apart from the Intent that says what must hold; every contradiction and every thing nothing speaks to is a draft with its question filed under Issues and left there. Then the human's session: `HC next` ranks what they can approve or settle by impact, the boxes an approval validates or a settled red box frees, the premise first; they work down that list for about a quarter of an hour, each answer re-drafts what it invalidated in the background, and the list stands after adoption for whenever they return. The human's time goes to what the machine could not settle, never to what the code already answers. The `refine` skill cuts a node; below the domains it runs as the `refiner` agent, one node per agent in a fresh context, several at once. The `attend` skill runs both phases and returns here.

## Checklist

- 0 Where things stand: no `canon/` is a fresh start, go to 1; a canon without `canon/decisions/DEC-001-adoption-scope.md` is an unfinished adoption, go to 4; both present, point to `/headcanon:review` and stop.
- 1 Read the repository silently; write the thread list.
- 2 `HC init`; draft the root README.
- 3 Cut the premise into domains; open the canvas; the briefing as a say.
- 4 `/headcanon:attend`: refiners cut every ready node to the leaves, then the human works the ranked list; it returns at Finish.
- 5 Sweep leftovers, DEC-001, `HC render`, `/headcanon:commit`, report; then attend goes on with what the answers re-opened.

## Sources

Threads (one thing an artifact says, with its `path:lines`) are the direction of every draft and the evidence every draft is checked against. Precedence: what the human approved or typed in the page, the newest artifact, older artifacts. Every sentence rests on a thread or the human's words; nothing invented. Mark threads used; unused ones feed step 5.

Two threads that disagree on an entry: draft from the newer and make the node `contested`, with, under `## Contested`, one or two sentences on what the two cannot both hold and what choosing decides, then both statements with their sources, so it comes up red. A thread that disagrees with something the human approved on the canvas is never settled by you: say it in the chat and ask "The document says A. You approved B. Which stands?" with **Keep what I approved** and **The document is right**; list an overruled document in DEC-001 as superseded on that point.

Read only this repository, reference.md and what the human does in the page. The plugin's own `canon/`, earlier session transcripts and other projects are not this project's intent.

## Guessing

- **Decide by precedence** (DEC-022): the human's approvals in this run, then their typed words, then the newest artifact, then what the code does today, then the archetype of the thing's kind. Whatever speaks first is the entry's line, written `assumed` with the chain and the thread in `source`; when the artifacts allowed alternatives, one line under `## Open` names the choice and them, so review overturns it in one click.
- **Write what the code does** under `## As built`, apart from the Intent: one to three lines, each ending in its `path:lines`, for every entry the code speaks to. The Intent says what must hold, As built what holds today; where the two disagree the node is a contradiction draft like any other. As built is yours to rewrite whenever the code is re-read and never the human's to approve.
- **Ask only** for a contradiction (two artifacts, or an artifact against an approval or a principle), for a thing no artifact and no archetype speaks to, or for a choice that would change a box the human approved. Then write a draft node: a provisional title in plain words, `state: open`, an Intent of one line saying what is known; it stands in the tree dashed. File it with `headcanon_ask`: `nodeId` the draft, the question in one or two sentences, `why` it matters, and up to three suggestions as options, each with its sources. The answer defines the node, `stated`.
- **Prefer the guess** whenever a thread speaks to the entry at all: the human corrects a wrong guess in one click, but cannot answer a question that was never asked.
- The premise, the glossary and the principles are guessed the same way, from the newest artifacts that state them; a document the human did not watch being written never makes an entry stated.

## Asking

- The few questions left, the sweep and a disagreement after an approval, go through `headcanon_ask` when the viewer's tools are present (reference.md section 6), otherwise AskUserQuestion.
- A proposed text in a question reads as prose; a sentence resting on a thread ends with a footnote [1] and one "Sources:" line lists them.
- Options are exactly **Approve as written** and **Drop** unless the step names others; an option carries no text; a list gets one multi-select whose options are ID and title with the one-line proposed text as description.
- Typed text is wording (stated, quoted verbatim), a correction (applied exactly to the proposed text it names, which is asked again; in a list only the changed items come back, and items the text approves count as ticked), or a process instruction (followed, recorded nowhere).
- Anything the human must know travels as a question's `notice` or a `headcanon_say`, never inside a proposed text and never as free text between tool calls, which may never be read.

## Entries

- An entry reads as an encyclopedia entry: what the thing is, complete for a reader who never saw this conversation, one concept per entry; no history, no reasons, no "not" clauses (exclusions live only in Not this), no counts, versions or statuses. Wrong examples and why: reference.md, section 5.
- A requirement or a glossary entry is one or two sentences. A principle is a title and a paragraph of two to four sentences, because principles are the main alignment point and a one-liner cannot be judged.
- Domains and capabilities in plain words; mechanisms and jargon only in requirements, using glossary terms.
- A written entry carries no footnote markers; sources go in the node's `source` field, or on a Source line after a principle or glossary entry.

## Consistency

- `HC check` at 0 errors after every write.
- The verifier agent (`headcanon:verifier`) runs on a branch when nothing in it is left to cut, over the whole tree when the drafting is done, and at Finish on what changed since: `git add canon`, the verifier, its findings applied, `git reset -q canon`.
- A contradiction between two threads makes both nodes `contested`, with a one-paragraph summary and the two statements with their sources under `## Contested` and a `conflicts` link, and files a contradiction issue (`headcanon_ask` with `kind: contradiction`, the node and `why`), which the page settles into the node from the human's choice; one the draft itself introduced, where the threads agree, is fixed in the draft from them.
- A reiteration merges the newer node into the older when they say one thing, PRN-1, and otherwise files an issue on the newer node asking whether they are one.
- Drift goes under the node's `## Open`. Uptake rewrites the parent's line as `assumed`.
- Nodes are files edited in place; nothing regenerates `canon/`, which would erase what the human has approved.

## Steps

### 0 Where you are

`canon/README.md` exists and `canon/decisions/DEC-001-adoption-scope.md` does not: the adoption is unfinished. Go to 4 with what is on disk, where the attend skill's Start step brings what does not fit the format into it and the drafting goes on from what is unrefined; never `HC init`, never redraft the root or the domains. Otherwise start at 1.

### 1 Read

Search `README*`, `REQUIREMENTS*`, `SPEC*`, `ARCHITECTURE*`, `ROADMAP*`, `CHANGELOG*`, `docs/**`, decision records (`docs/adr/**`, `decisions/**`, `.claude/decisions/**`), `.claude/**/*.md`, `CLAUDE.md`, `AGENTS.md`, the package manifest, test names. Note contradictions and which artifact is newer. Never present the list; never ask about provenance. The thread list is a file the refiners read, so it names its path:lines and stays current.

### 2 Root

`HC init`. Draft `canon/README.md` in the root format with everything `assumed` (each principle's title line carries `[assumed]`): what it is (one or two sentences) and the purpose and for whom (one paragraph) from the newest artifacts; Not this, three to six non-goals the artifacts state; a glossary of six to ten terms; three to eight principles, each a title and a paragraph, from charters, style guides and decision records, where a "never" the artifacts state is a principle first and a milestone from an old plan is not. The Glossary heading keeps `[assumed]`.

### 3 Domains

`/headcanon:refine ROOT domain draft` here, in this session, passing documentation and verification as candidates with source `software project`; the archetype prompt reads "what distinct areas must exist for this product to operate?". Fewer than about eight areas: they are the top level with `layer: capability` and there is no domain layer. `HC check` at 0 errors. Then `headcanon_open` with view `adopt`; `headcanon_say` to the human the briefing of reference.md section 0, that the layers below are being drafted while they read, that the commit-msg hook now requires an Intent trailer on every commit, and that their list under Issues starts with the premise; `headcanon_focus` ROOT. Nothing deeper is drafted in this context: a tree written in one output is checked by nobody set by set, is lost whole to a dropped connection, and gives the page nothing to show. Resuming an unfinished adoption starts here with the open and the say, counting what is approved, guessed and red, and naming the first of `HC next`'s `human` list.

### 4 Attend

`/headcanon:attend`, with the thread file. The drafting first: it takes the ready nodes from `HC next --json`, spawns a `refiner` for each, several at once in the background, green parents first and none under a red box, integrates every return, keeps the Consistency rules, and never waits on the human: a question is filed as an issue and left. When nothing is ready and nothing runs, the verifier reads the whole tree and the human's session begins: their list is `HC next`'s `human` list, ranked by impact; everything else is said in the chat, never asked. It returns when the human presses Finish.

### 5 Finish

Finish is the end of the human's session, whatever is red: red boxes and unanswered questions stay as issues, and the ranked list stands for their next visit (DEC-020, DEC-024). Unused threads, at most eight per question, as a multi-select with per-thread options **add under <ID>**, **merge into <ID>**, **drop**: adds become assumed nodes with their source, merges update the named node citing the source, drops go to `canon/decisions/DEC-001-adoption-scope.md` one line each with source and reason; an artifact the human calls obsolete gets one line. Write DEC-001 (reference.md section 3). `HC check` at 0 errors; `HC render`; `/headcanon:commit` with one `Intent-Change: create <ID>` per node, `update ROOT`, `Decision: DEC-001`, and `Approved-By` the human's git `user.name`, because every green box carries their approval. Report in the chat: domains with their capabilities; counts of approved, guessed and open; what they rewrote or deleted; how many leaves carry a check and how many are still to cut; and that `/headcanon:review` walks what stayed assumed. Then `/headcanon:attend` again for what the answers re-opened and what the red boxes hide, until nothing is left to cut: it calls the human only at key points, and each branch that reaches its leaves is committed with `/headcanon:commit` and `Approved-By: pending (assumed; /headcanon:review walks them)`.

## Examples

<example>
Enough to guess. Parent: "Statement import: bank statements in any common format become transactions." Thread: docs/formats.md:3 lists CSV, OFX and QIF. Child written assumed: "REQ-1.2 Parsing: a statement in CSV, OFX or QIF becomes transactions, one per line", source "REQ-1 (consequence of 'become transactions'); docs/formats.md:3", with "- The CSV, OFX and QIF readers each produce one transaction per line (src/import/parse.ts:12-80)" under As built.
</example>

<example>
Not enough. The same parent implies that a statement imported twice must not double its transactions, but no document says how a duplicate is told apart. Draft written open: title "Duplicate detection", Intent "A statement imported twice must not double its transactions; how a duplicate is told apart is not named anywhere", source "REQ-1 (failure of 'one transaction per line')". Issue filed: "How is a duplicate transaction recognized?", why the importer's retry depends on it, and the suggestions the artifacts allow.
</example>

<example>
Resuming. The session starts, `canon/README.md` exists and DEC-001 does not. Step 0 sends you to 4: open the canvas as step 3 ends, say "12 approved, 31 guessed, 4 need you; your list starts with the premise", focus ROOT, the first of `HC next`'s `human` list, and attend.
</example>
