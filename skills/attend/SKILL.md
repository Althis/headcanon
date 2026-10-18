---
name: attend
description: "Attends the HeadCanon canvas: waits for what the human does in the page, keeps the canon consistent after each approval, rewrite or deletion, answers their questions in the chat, defines the branches they ask for, and returns when they press Finish with nothing red left. Use during adoption once the canon is drafted, whenever the human works in the page on an existing canon, or when they ask you to watch or follow the page."
when_to_use: "The viewer is open and the human is working in it; adopt has drafted a canon; the human asks you to attend, watch or follow the page."
---

# Attend the canvas

`HC` means `node "${CLAUDE_PLUGIN_ROOT}/packages/canon/bin/headcanon.js"`. The page's tools: `headcanon_changes` with `waitSeconds` waits for the human's next action; `headcanon_say` speaks in the chat and ends the page's working indicator, so every action of yours ends with one; `headcanon_focus` with `open` opens a box's card; `headcanon_ask` asks when a choice needs options (adopt/reference.md section 6). Entries follow the adopt skill's Entries and Guessing rules; what the human types in the page is stated.

Colours on the canvas: green is approved by the human, yellow is your guess, red needs them before adoption can finish: an `open` node, a `contested` node, or one the check flagged. Red is yours to explain, never to clear by approving.

## Loop

Until a finish request with nothing red, or the human says stop:

1. `headcanon_changes` with the last cursor and `waitSeconds` 600; repeat while it returns no entries.
2. Handle the entries in order, by kind:
   - **node-approved**: the box is green. Re-read its children: a child whose line no longer follows the approved text is rewritten to follow it, `assumed`; a child that was approved too and now disagrees becomes `contested` with both statements.
   - **node-edited**: the human's words are stated. Children the new text no longer implies become `open`, titled as the question; children it still implies but words differently are rewritten `assumed`; the parent's line must still describe its children, or it is rewritten `assumed`; every node that `requires` this one is re-read for a concept that changed.
   - **node-deleted**: nodes that required it lose the edge; a node whose only reason was the deleted one becomes `open`; the parent's partition still holds or the parent's line is rewritten `assumed`.
   - **node-created**: the human's node; place it by descent if its parent is wrong, link what it duplicates, and `refine` it with `draft` when its layer has children.
   - **a mock's entry** (`MOCK-n` approved, edited or deleted): the same rules, over the requirements its table binds (REQ-8.8): one whose element vanished becomes `open`, titled as the question of what replaces it; one whose element changed is rewritten `assumed`; a new element is a candidate for `refine`. A picture the human replaced is stated; your own redraw is a `draft` beside the current picture, accepted element by element (refine/reference.md section 5).
   - **message** quoting a passage ("What do you mean by …"): explain it in one or two sentences, in the human's words, with `nodeId`; when the passage is a glossary term, give the definition and where it is used.
   - **message** otherwise: a question is answered in the chat; an instruction is followed; wording about a node is applied as a rewrite of that node.
   - **refine-request**: `/headcanon:refine <ID> <layer> draft`, then step 3; say what was added.
   - **term-enshrined**, **term-dropped**: the glossary changed; reword every node that uses a dropped term with its replacement.
   - **answer**: belongs to a question you asked; handle it by the adopt skill's Asking rules.
   - **finish-request**: `HC check`; count the red boxes (open, contested, flagged). Some left: say which and open the first with `headcanon_focus`. None left: return to the caller, which is adopt step 8, or `/headcanon:commit` when nothing called you.
3. After every change of yours: `HC check` and fix every error; then read the touched node's parent, siblings, children and `requires` neighbours for a contradiction or a duplicate, and mark what you find as the adopt skill's step 5 says. The verifier agent runs at finish, not after every click.
4. `headcanon_say` one or two sentences: what you changed, what is red now, and the next box to look at, which you also `headcanon_focus`.

## Rules

- Never approve a node; approval is the human's click. Your rewrites are `assumed`, your questions `open`.
- A deadlock or a blocked prerequisite from `HC next` is said, not solved: the human picks.
- Write only files under `canon/`; `HC check` after every write; never commit from here.
- One chat line beats a question; a question only when the answer is a choice among options.

<example>
Entry node-edited REQ-2 "Categorization: every transaction lands in exactly one tax category, by rule or by hand." Children REQ-2.1 by rule and REQ-2.2 by hand still follow; REQ-2.3 "a transaction may carry two categories" no longer does and becomes open, titled "Can a transaction carry two categories?". Say: "REQ-2 is yours now; REQ-2.3 contradicts it and is red. Open it next." Focus REQ-2.3.
</example>
