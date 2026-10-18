---
name: attend
description: "Attends the HeadCanon canvas: keeps refiner agents cutting every ready node in the background and integrates what they return, waits for what the human does in the page, keeps the canon consistent after each approval, rewrite or deletion, answers their questions in the chat, defines the branches they ask for, and returns when they press Finish with nothing red, or after that when nothing is left to cut. Use during adoption once the domains exist, whenever the human works in the page on an existing canon, or when they ask you to watch or follow the page."
when_to_use: "The viewer is open and the human is working in it; adopt has drafted the domains; the human asks you to attend, watch or follow the page."
---

# Attend the canvas

`HC` means `node "${CLAUDE_PLUGIN_ROOT}/packages/canon/bin/headcanon.js"`. The page's tools: `headcanon_changes` with `waitSeconds` waits for the human's next action; `headcanon_say` speaks in the chat and ends the page's working indicator, so every action of yours ends with one; `headcanon_focus` with `open` opens a box's card; `headcanon_ask` asks when a choice needs options (adopt/reference.md section 6). The `refiner` agent (`headcanon:refiner`) cuts one node in draft in a context of its own; you never cut a node in this one. Entries follow the adopt skill's Entries and Guessing rules; what the human types in the page is stated.

Colours on the canvas: green is approved by the human, yellow is your guess, red needs them before adoption can finish: an `open` node, a `contested` node, or one the check flagged. Red is yours to explain, never to clear by approving.

## Loop

Until the human presses Finish with nothing red, or, once they have, until nothing is left to cut; or the human says stop:

1. **Launch.** `HC next --json`: every `ready` node whose parent is not red gets a refiner, green parents before yellow, several at once in the background, each briefed with the repository, the node, the layer its children get, and the thread file. A node a refiner already holds is not launched twice. The command's `waiting` nodes lie more than two levels below the deepest approved box on their path; they are left alone until the human approves, and named when the human asks what is next.
2. **Wait** for the next event: `headcanon_changes` with the last cursor and `waitSeconds` 600, or a refiner's return, whichever comes first.
3. **A refiner's return.** Apply its set-asides (link, lift, merge) and its moved edges; `HC check` and fix every error; read the new set's parent, siblings and `requires` neighbours for a contradiction or a duplicate and mark it as the adopt skill's Consistency rules say; say in one line what landed; launch what became ready. A branch with nothing left to cut gets the verifier (adopt, Consistency) and then a say that names it as a key point: how many leaves carry a check, how many boxes are red. A refiner that reports blocked waits for its blocker: a red box is the human's, a prerequisite is in the next wave.
4. **The human's entries**, in order, by kind:
   - **node-approved**: the box is green. Re-read its children: a child whose line no longer follows the approved text is rewritten to follow it, `assumed`; a child that was approved too and now disagrees becomes `contested` with both statements.
   - **node-edited**: the human's words are stated. Children the new text no longer implies become `open`, titled as the question; children it still implies but words differently are rewritten `assumed`; the parent's line must still describe its children, or it is rewritten `assumed`; every node that `requires` this one is re-read for a concept that changed.
   - **node-deleted**: nodes that required it lose the edge; a node whose only reason was the deleted one becomes `open`; the parent's partition still holds or the parent's line is rewritten `assumed`.
   - **node-created**: the human's node; place it by descent if its parent is wrong, link what it duplicates, and give it a refiner when its layer has children.
   - **message** with a `quote` (words the human highlighted in a node's card; `nodeId` names the node): the text is about that passage. A question gets one or two sentences in the human's words; a glossary term gets its definition and where it is used; wording given with it is applied as a rewrite of that passage, stated.
   - **message** otherwise: a question is answered in the chat; an instruction is followed; wording about a node is applied as a rewrite of that node.
   - **refine-request**: a refiner for that node with `draft`; say what was added when it returns.
   - **term-enshrined**, **term-dropped**: the glossary changed; reword every node that uses a dropped term with its replacement.
   - **answer**: belongs to a question you asked; handle it by the adopt skill's Asking rules.
   - **finish-request**: `HC check`; count the red boxes (open, contested, flagged). Some left: say which and open the first with `headcanon_focus`. None left: return to the caller, which is adopt step 6, or `/headcanon:commit` when nothing called you.
5. After every change of yours: `HC check` and fix every error; then read the touched node's parent, siblings, children and `requires` neighbours for a contradiction or a duplicate, and mark what you find as the Consistency rules say.
6. `headcanon_say` one or two sentences: what you changed, what is red now, and the next box to look at, which you also `headcanon_focus`.

## Rules

- Never approve a node; approval is the human's click. Your rewrites and the refiners' sets are `assumed`, your questions `open`.
- The human gives this about a quarter of an hour, for the premise, the principles, every red box and the yellow ones they pick. Call them only at key points, by a say and a focus: a branch that reached its leaves, a new red box, a thread that contradicts an approval. One chat line beats a question; a question only when the answer is a choice among options.
- A deadlock or a blocked prerequisite from `HC next` is said, not solved: the human picks. A `waiting` node is never cut early: the reach is the command's rule, not yours.
- Write only files under `canon/`; `HC check` after every write; never commit from here.

<example>
Entry node-edited REQ-2 "Categorization: every transaction lands in exactly one tax category, by rule or by hand." Children REQ-2.1 by rule and REQ-2.2 by hand still follow; REQ-2.3 "a transaction may carry two categories" no longer does and becomes open, titled "Can a transaction carry two categories?". Say: "REQ-2 is yours now; REQ-2.3 contradicts it and is red. Open it next." Focus REQ-2.3.
</example>

<example>
A refiner returns for REQ-1.2 with three children, one open, and a merge of its fourth candidate into REQ-3.1. Apply the merge, `HC check`, read REQ-1.1 and REQ-1.3 against the new set, then say: "REQ-1.2 has its three parts; one is a question, in red." REQ-1.2.1 is now ready: launch it.
</example>
