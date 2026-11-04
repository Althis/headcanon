---
name: attend
description: "Attends the HeadCanon canvas: keeps refiner agents cutting every ready node in the background and integrates what they return, waits for what the human does in the page, keeps the canon consistent after each approval, rewrite or deletion, answers their questions in the chat, defines the branches they ask for, and returns when they press Finish with nothing red, or after that when nothing is left to cut. Use during adoption once the domains exist, whenever the human works in the page on an existing canon, or when they ask you to watch or follow the page."
when_to_use: "The viewer is open and the human is working in it; adopt has drafted the domains; the human asks you to attend, watch or follow the page."
---

# Attend the canvas

`HC` means `node "${CLAUDE_PLUGIN_ROOT}/packages/canon/bin/headcanon.js"`. The page's tools: `headcanon_changes` with `waitSeconds` waits for the human's next action; `headcanon_say` speaks in the chat and ends the page's working indicator, so every action of yours ends with one; `headcanon_focus` highlights a box on the canvas, and nothing of yours opens a card, the human does; `headcanon_ask` asks when a choice needs options (adopt/reference.md section 6). The `refiner` agent (`headcanon:refiner`) cuts one node in draft in a context of its own; you never cut a node in this one. Entries follow the adopt skill's Entries and Guessing rules; what the human types in the page is stated.

Colours on the canvas: green is approved by the human, yellow is your guess, red needs them before adoption can finish: an `open` node, a `contested` node, or one the check flagged. Red is yours to explain, never to clear by approving.

## Start

On an existing canon, before the loop, the format's start sequence (`HC format` prints it): `HC check --json`, and bring what does not fit the format into it, in one turn. A `format-newer` finding stops you: say that HeadCanon must be updated first.

- `title-question` or `intent-missing`: the node becomes a draft: `state: open`, a provisional plain title, one line of what is known as Intent (from its title, its bullets or its sources), the dated bullets dropped. Then one issue per draft, all in one `headcanon_ask` with `questions`: the question, `why` from what the node carried, its suggestions as options.
- `section-unknown`: the section's content moves where the format puts it: what the children will hold to `## Deferred` with its origin, a gap and what would settle it to `## Open`, a question only the human can answer to an issue on the node; the node's state stays.
- `glossary-inherited`: the heading becomes `## Glossary [assumed]`; the human approves terms in the Glossary tab.
- Every error, fixed as always.
- No finding about fit left: write `format: <current>`, the version `HC format` prints, on the root README's front matter.

Then one say: the counts (drafts made, issues filed, sections folded) and the next box for the human, the first of `HC next`'s `human` list with its reason, which you `headcanon_focus`.

## Loop

Until the human presses Finish with nothing red, or, once they have, until nothing is left to cut; or the human says stop:

1. **Launch.** `HC next --json`: every `ready` node whose parent is not red gets a refiner, green parents before yellow, several at once in the background with the Agent tool, never a workflow, which stops to ask the human, each briefed with the repository, the node, the layer its children get, and the thread file. A node a refiner already holds is not launched twice. The command's `waiting` nodes lie more than two levels below the deepest approved box on their path; they are left alone until the human approves. Its `human` list ranks what the human can approve or settle by what that releases; its first entry is the next box for them, always, never a pick of your own.
2. **Wait** for the next event: `headcanon_changes` with the last cursor and `waitSeconds` 600, or a refiner's return, whichever comes first.
3. **A refiner's return.** Apply its set-asides (link, lift, merge) and its moved edges; `HC check` and fix every error; read the new set's parent, siblings and `requires` neighbours for a contradiction or a duplicate and mark it as the adopt skill's Consistency rules say; file each of its `questions` as an issue with `headcanon_ask`, without waiting: `nodeId` the draft node it wrote, the question, `why`, the suggestions as options; say in one line what landed; launch what became ready. A branch with nothing left to cut gets the verifier (adopt, Consistency) and then a say that names it as a key point: how many leaves carry a check, how many boxes are red. A refiner that reports blocked waits for its blocker: a red box is the human's, a prerequisite is in the next wave.
4. **The human's entries**, in order, by kind:
   - **node-approved**: the box is green. Re-read its children: a child whose line no longer follows the approved text is rewritten to follow it, `assumed`; a child that was approved too and now disagrees becomes `contested` with both statements.
   - **node-edited**: the human's words are stated. Children the new text no longer implies are removed and asked about as an issue; children it still implies but words differently are rewritten `assumed`; the parent's line must still describe its children, or it is rewritten `assumed`; every node that `requires` this one is re-read for a concept that changed.
   - **node-deleted**: nodes that required it lose the edge; a node whose only reason was the deleted one is removed and asked about as an issue; the parent's partition still holds or the parent's line is rewritten `assumed`.
   - **node-created**: the human's node; place it by descent if its parent is wrong, link what it duplicates, and give it a refiner when its layer has children.
   - **message** with a `quote` (words the human highlighted in a node's card; `nodeId` names the node): the text is about that passage. A question gets one or two sentences in the human's words; a glossary term gets its definition and where it is used; wording given with it is applied as a rewrite of that passage, stated.
   - **message** otherwise: a question is answered in the chat; an instruction is followed; wording about a node is applied as a rewrite of that node; a principle the human asks for is added to the root README's `## Principles` in their words, stated (no marker), with a Source line naming the chat. The page re-reads the canon whenever a file changes, so a direct edit needs no announcement.
   - **refine-request**: a refiner for that node with `draft`; say what was added when it returns.
   - **edit-conflict**: you rewrote a box the human was writing in. "keeps their own": leave that box alone until their node-edited arrives, then treat it as theirs. "took yours": nothing to do.
   - **term-enshrined**, **term-dropped**: the glossary changed; reword every node that uses a dropped term with its replacement. A node-approved, node-edited or node-deleted entry with a TERM id comes from the Glossary tab: a rewritten term is the human's meaning now, a deleted one is dropped.
   - **answer**: belongs to a question you asked; handle it by the adopt skill's Asking rules. For a refiner's question, define its draft node from the chosen or typed words: the title when the answer names the thing, the Intent from the words, `stated`; then launch it when its layer has children. A contradiction issue is settled by the page itself; its node-edited entry follows.
   - **finish-request**: `HC check`; count the red boxes (open, contested, flagged) and the questions still unanswered. Some left: say which and open the first with `headcanon_focus`. None left: return to the caller, which is adopt step 6, or `/headcanon:commit` when nothing called you.
5. After every change of yours: `HC check` and fix every error; then read the touched node's parent, siblings, children and `requires` neighbours for a contradiction or a duplicate, and mark what you find as the Consistency rules say.
6. `headcanon_say` one or two sentences: what you changed, what is red now, and the next box for the human, the first of `HC next`'s `human` list with its reason, which you also `headcanon_focus`. A say that reports what you did goes to the page's history; one that asks something of the human, or needs their eyes now (a key point), carries `to: "human"` and lands in their chat.

## Rules

- Never approve a node; approval is the human's click. Your rewrites and the refiners' sets are `assumed`; your questions are issues, never nodes.
- The human gives this about a quarter of an hour, for the premise, the principles, every red box and the yellow ones they pick. Call them only at key points, by a say and a focus: a branch that reached its leaves, a new red box, a thread that contradicts an approval. One chat line beats a question; a question only when the answer is a choice among options.
- A deadlock or a blocked prerequisite from `HC next` is said, not solved: the human picks. A `waiting` node is never cut early: the reach is the command's rule, not yours.
- Write only files under `canon/`; `HC check` after every write; never commit from here.

<example>
Entry node-edited REQ-2 "Categorization: every transaction lands in exactly one tax category, by rule or by hand." Children REQ-2.1 by rule and REQ-2.2 by hand still follow; REQ-2.3 "a transaction may carry two categories" no longer does: it is removed, and an issue on REQ-2 asks whether two categories can ever apply, with its sources. Say: "REQ-2 is yours now; REQ-2.3 contradicted it and is gone; one issue asks about it." Focus REQ-2.
</example>

<example>
A refiner returns for REQ-1.2 with three children, one a draft with its question, and a merge of its fourth candidate into REQ-3.1. Apply the merge, file the question as an issue, `HC check`, read REQ-1.1 and REQ-1.3 against the new set, then say: "REQ-1.2 has its three parts; one is a draft, dashed, with its question under Issues." REQ-1.2.1 is now ready: launch it.
</example>
