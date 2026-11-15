---
name: attend
description: "Orchestrates the canvas: dispatches a branch agent per top-level box to draft the canon to its leaves with nobody waiting on the human, applies what crosses the branches, defines the vocabulary, runs the coherence pass and rebalances at the hand-off, then waits for what the human does in the page, keeps the canon consistent after each approval, rewrite, deletion or answer by sending the change down to the agent that owns the box, answers their questions in the chat, and returns when they press Finish, or after that when nothing is left to cut. Use during adoption once the domains exist, whenever the human works in the page on an existing canon, or when they ask you to watch or follow the page."
when_to_use: "The viewer is open and the human is working in it; adopt has drafted the domains; the human asks you to attend, watch or follow the page."
---

# Attend the canvas

`HC` means `node "${CLAUDE_PLUGIN_ROOT}/packages/canon/bin/headcanon.js"`. The page's tools: `headcanon_changes` with `waitSeconds` waits for the human's next action; `headcanon_say` speaks in the chat and ends the page's working indicator, so every action of yours ends with one; `headcanon_focus` highlights a box on the canvas, and nothing of yours opens a card, the human does; `headcanon_ask` asks when a choice needs options (adopt/reference.md section 6); `headcanon_withdraw` takes a question of yours back. The agents: `headcanon:branch` drafts one top-level box to its leaves and reports with exact payloads; `headcanon:refiner` cuts one node; `headcanon:verifier` reads a scope and reports findings. You are the orchestrator: you hold the premise, the domains, the glossary and what crosses the branches, never a branch's own sets; you never cut a node in this context. Entries follow the adopt skill's Entries and Guessing rules; what the human types in the page is stated.

Colours on the canvas, where a box is a node as the canvas shows it: green is approved by the human, yellow is a guess, red is an issue for them, a draft (`open`) or a `contested` box; a finding is yours to fix and never paints a box. Red is yours to explain, never to clear by approving.

## Knobs

The human's session, about a quarter of an hour. Branch agents at once, one per top-level box. Refiners per branch, two. The review budget, two corrections. The wait for the human's next action, 600 seconds.

## Rules

- One question per box: a new ask on a box replaces the one pending, the human's rewrite of a box withdraws its questions, and `headcanon_withdraw` takes back one the Guessing rules would no longer ask; ask again only with what their words taught you.
- Never approve a node; approval is the human's click. Every rewrite of yours and every refiner's set is `assumed`; a question is an issue, never a node.
- The human's list is `HC next`'s `human` list, ranked by impact (DEC-024); its first entry is the next box for them, always, never a pick of your own. The page opens the list when the gate opens, every domain and capability cut; until then questions are filed and left. Call the human only at key points, by a say and a focus: the hand-off, a new red box, a thread that contradicts an approval. One chat line beats a question; a question only when the answer is a choice among options.
- Nothing is cut under a red box: it is the human's, and what it hides counts in its rank. A deadlock from `HC next` is said, not solved.
- Above the branches you write through `HC op` only (`link`, `move-edge`, `create`, `move`, `merge`, `contest`, `term`, `reword`, `delete`), checked and logged; a principle the human asks for and the root's own text are the exceptions, written by hand. Nothing passes between branches except through you, and every exchange lands in a file; a summary is never evidence, the full text is.
- `HC check` after every change; never commit from here. Your state is the canon on disk and the operations log: after a compaction, re-read this skill and continue from `HC next --json`.

## Start

On an existing canon, before anything else, the format's start sequence (`HC format` prints it): `HC check --json`, then the queue, then one say; all in one turn, before any waiting. A `format-newer` finding stops you: say that HeadCanon must be updated first.

- `title-question` or `intent-missing`: the node becomes a draft: `state: open`, a provisional plain title, one line of what is known as Intent (from its title, its bullets or its sources), the dated bullets dropped. Then one issue per draft, all in one `headcanon_ask` with `questions`: the question, `why` from what the node carried, its suggestions as options.
- `section-unknown`: the section's content moves where the format puts it: what the children will hold to `## Deferred` with its origin, a gap and what would settle it to `## Open`, a question only the human can answer to an issue on the node; the node's state stays.
- `glossary-inherited`: the heading becomes `## Glossary [assumed]`; the human approves terms in the Glossary tab.
- Every error, fixed as always.
- No finding about fit left: write `format: <current>`, the version `HC format` prints, on the root README's front matter.
- The queue (`$(git rev-parse --absolute-git-dir)/headcanon/questions.json`): every question the Guessing rules would no longer ask, you answer yourself: decide its box by precedence, write it `assumed` with the note under `## Open`, and `headcanon_withdraw` it. Only the three kinds stay.

Then one say: the counts (drafts made, issues filed, sections folded), and that the drafting goes on until the list opens.

## The drafting phase

1. **Dispatch.** `HC next --json`. For every top-level box, a `headcanon:branch` with the Agent tool, in the background, never a workflow, which stops to ask the human; its brief names the repository, the box, the thread file, the viewer's port and the knobs. A branch agent's state is the disk, so one that dies is dispatched again and continues. Set `doing` on your says to the boxes being drafted.
2. **A branch report** (JSON: ops, terms, questions, exhausted, leftovers, blocked). Apply its `ops` with `HC op`, one by one; a refused operation comes back with its reason, which you resolve or send back as a command. Keep its `terms` and `leftovers`. Say in one line what landed. A `blocked` branch waits for what it names: a red box is the human's, a prerequisite in another branch is dispatched or already running.
3. **Every branch reported**: the hand-off, in this order.
   - **Vocabulary.** From every branch's `terms` and the `term-candidate` notes of `HC check`: one word with two meanings becomes two terms, each qualified; two words with one meaning become one term, and the losing word is a `reword` operation sent down to the branch that used it; every term is written `assumed` with `HC op term`. The human approves terms in the Glossary tab; the review already shows them marked.
   - **Coherence.** `HC coherence --json` names clusters of boxes in different branches that share a term, a code file, a prerequisite or a rare word. For each cluster, a `headcanon:verifier` with the cluster as its scope, several at once, each reading the full text; its findings become operations: a reiteration a `merge`, a contradiction a `contest` and a contradiction issue through `headcanon_ask`, a drift a line under the box's `## Open`, an uptake a `recut` command to the owning branch.
   - **Rebalance.** A box whose `requires` edges point mostly into another branch, or that a cluster says belongs under another parent, is moved with `HC op move`, which renumbers it and everything that named it; a lift to a common ancestor is a `create` there and `link`s from the siblings. The root is read against the domains that emerged: a domain the premise does not imply, or a premise sentence no domain carries, is an uptake on the root, rewritten `assumed`.
   - `HC check` and fix every error; `HC render`.
   - One say to the human, `to: "human"`: the counts (boxes, leaves with a check, red), the retries `HC op --stats` reports, and the first three entries of the `human` list with their reasons; focus the first. The list is open from here.

## The human's session

Until the human presses Finish, and after it until nothing is left to cut; or the human says stop. The loop is your whole turn: a wait that returns nothing is followed by another wait, never by a reply that ends the turn; a Stop hook sends you back otherwise. When the human asks you to stop, say the words "stopping attend" and stop.

1. **Wait** for the next event: a branch or refiner return while any runs; otherwise `headcanon_changes` with the last cursor and `waitSeconds` as the knobs say; whichever comes first.
2. **A change on a box** goes down the same way whoever made it. While a branch agent holds the box's subtree, resume it with the command; after it reported, do the step yourself with a `headcanon:refiner`:
   - **node-approved**: the box is green. Its children are re-read: a child whose line no longer follows the approved text is rewritten to follow it, `assumed`; a child that was approved too and now disagrees becomes `contested` with both statements (`HC op contest`).
   - **node-edited**: the human's words are stated. `stop under <ID>`, then `recut <ID>: rewritten by the human`: children the new text no longer implies are removed and asked about as an issue, children it still implies but words differently are rewritten `assumed`, a node left without children is cut again; the parent's line must still describe its children, or it is rewritten `assumed`; every node that `requires` this one is re-read for a concept that changed.
   - **node-deleted**: nodes that required it lose the edge; a node whose only reason was the deleted one is removed and asked about as an issue; the parent's partition still holds or the parent's line is rewritten `assumed`.
   - **node-created**: the human's node; place it by descent if its parent is wrong (`HC op move`), link what it duplicates, and give it a refiner when its layer has children.
   - **answer**: belongs to a question. One that begins `superseded:` needs nothing. For a refiner's question, define its draft node from the chosen or typed words: the title when the answer names the thing, the Intent from the words, `stated`; then `recut` it when its layer has children. A contradiction issue is settled by the page itself; its node-edited entry follows. A diagnosis answered defines the box the same way.
   - **refine-request**: `recut <ID>: asked in the page`; say what was added when it returns.
   - After each: `HC check`, the vocabulary and coherence steps for what changed, and the list re-ranks by itself.
3. **The human's words** in the chat:
   - **message** with a `quote` (words they highlighted in a node's card; `nodeId` names the node): the text is about that passage. A question gets one or two sentences in their words; a glossary term gets its definition and where it is used; wording given with it is applied as a rewrite of that passage, stated. A term they ask to canonize is asked back with `headcanon_ask`, `terms` carrying your definition, so they keep it or drop it; never written unasked.
   - **message** otherwise: a question is answered in the chat; an instruction is followed; wording about a node is applied as a rewrite of that node; a principle they ask for is added to the root README's `## Principles` in their words, stated (no marker), with a Source line naming the chat.
   - **edit-conflict**: you rewrote a box they were writing in. "keeps their own": leave that box alone until their node-edited arrives, then treat it as theirs. "took yours": nothing to do.
   - **term-enshrined**, **term-dropped**: the glossary changed; a dropped term is a `reword` to its replacement in every box that used it. A node-approved, node-edited or node-deleted entry with a TERM id comes from the Glossary tab: a rewritten term is the human's meaning now, a deleted one is dropped.
   - **finish-request**: the human's session is over, whatever is red (DEC-020). `HC check` and fix every error; say how many red boxes and unanswered questions remain, which stay as issues, and that their list stands for their next visit; then return to the caller, which is adopt step 5, or `/headcanon:commit` when nothing called you.
4. `headcanon_say` one or two sentences after every change: what changed, what is red now, and the next box for the human, the first of the `human` list with its reason, which you also `headcanon_focus`. A say that reports what you did goes to the page's history; one that asks something of the human, or needs their eyes now, carries `to: "human"` and lands in their chat. Every say carries `doing`: the boxes being cut or verified at that moment, empty when nothing runs.

<example>
Entry node-edited REQ-2 "Categorization: every transaction lands in exactly one tax category, by rule or by hand." REQ-2's branch agent is still running: `stop under REQ-2`, then `recut REQ-2: rewritten by the human`. It keeps REQ-2.1 by rule and REQ-2.2 by hand, removes REQ-2.3 "a transaction may carry two categories" and files the issue asking whether two categories can ever apply. Say: "REQ-2 is yours now; REQ-2.3 contradicted it and is gone; one issue asks about it." Focus REQ-2.
</example>

<example>
Two branch reports name the same word: REQ-1.4 uses "statement" for a bank's file, REQ-5.2 for a sentence of the rules. `HC op term` writes "bank statement" and "rule statement", both assumed; `reword` operations go to both branches; the Glossary tab shows the two for the human to keep or rename.
</example>
