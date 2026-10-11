---
name: adopt
description: "Start HeadCanon in a project that has no canon yet, top-down: draft the core concepts (what it is, purpose, non-goals, glossary) from the repository's artifacts and get each approved or corrected through the question interface; then draft the requirement tree as assumptions, branch by branch, for approval; then sweep the artifacts for intents the tree dropped and ask whether to add, merge or drop them. Use when the session context says the project has no canon, or when the human asks to set up, adopt or install HeadCanon."
when_to_use: "The project has no canon/README.md, or the human asks to add HeadCanon to an existing or new project."
---

# Adopt HeadCanon in this project

You are starting the canon for a project that has none. Work **top-down**: concepts first, then requirements, then a sweep for anything the artifacts hold that the tree dropped. The human approves or corrects at every step through the **AskUserQuestion** tool. They are never asked where a file came from, and they never see a file inventory to approve. You read the repository; they judge the drafts.

`HC` below means: `node "${CLAUDE_PLUGIN_ROOT}/packages/canon/bin/headcanon.js"`.

## How to ask

- Use **AskUserQuestion** for every approval. Put the draft in the question text so the human reads and decides in one place.
- One concept per question. Batch only lists that belong together, with `multiSelect: true`.
- Offer at most four options. The usual set is: **Approve as written**, **Approve with a correction** (the human types the correction), **Rewrite** (the human types their own version), **Drop**. For lists: a multi-select of the items to keep, then one follow-up question for corrections and missing items.
- Record outcomes by the certainty rules. Words the human **typed** are **stated**, quoted verbatim. A draft the human **approved as written** is **resolved**: your draft is the Intent and the option they chose is the Resolution. A draft with no answer yet is **assumed**. A draft the human corrected is stated for their words and assumed for whatever remains yours.
- Never write a canon file before the question that approves it has been answered.

## 0. Check

Run `HC check`. If a canon already exists, stop and point the human to `/headcanon:review` or `/headcanon:capture`. Otherwise continue. Do not run `HC init` yet.

## 1. Read the artifacts, silently

Search for intent artifacts and read the important ones. At least: `README*`, `REQUIREMENTS*`, `SPEC*`, `ARCHITECTURE*`, `ROADMAP*`, `CHANGELOG*`, `docs/**/*.md`, decision records (`docs/adr/**`, `decisions/**`, `.claude/decisions/**`), plans and analyses under `.claude/**`, `CLAUDE.md`, `AGENTS.md`, the package manifest, and test names as evidence of intended behavior.

Keep a private inventory: path, date, and the intents it carries, as short bullets with line references. You will need it for step 4. Note where artifacts contradict each other, and which is newer. **Do not present the inventory and do not ask about provenance.** Everything taken from an artifact is assumed; the only source of stated items is what the human types in this conversation.

## 2. Core concepts, one at a time

Ask these in order, each as one AskUserQuestion with your draft inside:

1. **What it is.** One or two sentences, drafted from the artifacts. Options: approve, correct, rewrite.
2. **Purpose, and for whom.** One short paragraph. Same options.
3. **Not this.** Three to six non-goals drawn from the artifacts and from what the purpose excludes. Multi-select the ones to keep; then one question for corrections and additions.
4. **Glossary.** Six to ten terms the project uses with a specific meaning, each with a definition and a "not" clause. Multi-select the ones that are right; then one question asking for corrections to the rest.

After the glossary is settled, run `HC init` and tell the human in one sentence that the commit-msg hook is now installed and what it requires. Then write `canon/README.md`: the front-matter (`id: ROOT`, `title`, `state`, `source`), `## Stated` with any typed words quoted verbatim and their source, `## Intent` with approved drafts, `## Resolution` quoting the option chosen and the date, `## Not this`, and `## Glossary` in the format `**term** (`TERM-slug`): definition`, with `[assumed]` on the Glossary heading unless every term was confirmed. Set the root `state` to `stated` if the purpose was typed by the human, `resolved` if approved as written.

## 3. Requirements, top-down

1. **Top level.** Draft five to twelve top-level requirements from the artifacts and the concepts just approved. Each has an ID (`REQ-1`, `REQ-2`, …), a title, a one-line intent and a source (file and lines, or "concepts, step 2"). Ask one multi-select question: which to keep. Then one question for corrections and anything missing. Write the approved nodes as folders with a `README.md` each, state `assumed` unless the human typed the wording, with `source`, `## Intent`, `## Not this` where clear, and `## Assumptions` listing what you decided.
2. **One level down, branch by branch.** For each approved branch, draft up to eight children with one-line intents and sources, and ask one multi-select question per branch. Write the approved children as leaf files (`REQ-1.1-<slug>.md`). **Stop at this depth.** Deeper levels are filled lazily when work touches a branch.
3. Where two artifacts disagree, offer both readings as options. If the human picks one, record it; if they do not, record the node as `contested` with both positions.

Do not ask about `kind`, `files` or `steps` now; leave them out until a branch is refined for implementation.

## 4. Sweep for dropped intents

Go back to your inventory from step 1 and compare it against the tree. List every intent that an artifact carries and no node covers. Group them, at most eight per question, and ask a multi-select for each group with three kinds of option: **add as a new node** (under which branch), **merge into an existing node** (name the ID), or **drop**. Then:

- Added intents become new assumed nodes with their source.
- Merged intents update the named node's Intent or Assumptions, citing the source.
- Dropped intents are recorded in `canon/decisions/DEC-001-adoption-scope.md`: a decision with `state: resolved`, `intents` pointing at the root and the branches they would have joined, and a list of each dropped intent with its source and the human's reason. This makes the drop a conscious act that later checks can see, rather than a silent omission.

If the human says an artifact is entirely obsolete, record that once in the same decision instead of asking about each of its intents.

## 5. Verify, render, commit

Run `HC check` and fix every error. Run `HC summary` and show the tree. Run `HC render`. Then use `/headcanon:commit`. The message carries one `Intent-Change: create <ID>` per node, `Intent-Change: update ROOT`, `Decision: DEC-001`, and `Approved-By:` with the human's git `user.name`, since they approved every item in this conversation through the questions.

## 6. Report

End with: how many nodes are stated, resolved and assumed; what was dropped and why; what the human corrected; and that `/headcanon:review` walks the remaining assumed items whenever they are ready. Do not call the canon complete. It is a seed with the human's fingerprints on every node.

## Rules that apply throughout

- Never ask the human where a file came from or who wrote it.
- Never write a canon file before the human has answered the question that approves it.
- Never turn a draft into a stated item. Stated is only what the human typed.
- Never go deeper than two levels during adoption.
- When the human disagrees, record contested; do not argue past one round.
- Stopping to ask is a successful outcome.
