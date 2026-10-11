---
name: adopt
description: "Start HeadCanon in a project that has no canon yet, top-down through the question interface: project overview (what it is, purpose, non-goals, glossary), then principles, then the domains the premise requires, then the capabilities each domain needs, then requirements from the artifacts; then a sweep for intents the artifacts hold that the tree dropped. Use when the session context says the project has no canon, or when the human asks to set up, adopt or install HeadCanon."
when_to_use: "The project has no canon/README.md, or the human asks to add HeadCanon to an existing or new project."
---

# Adopt HeadCanon in this project

You are starting the canon for a project that has none. Work **top-down** in five layers, each approved before the next: overview, principles, domains, capabilities, requirements. Then sweep the artifacts for anything dropped. The human approves or corrects at every step through the **AskUserQuestion** tool. They are never asked where a file came from and never see a file inventory. You read the repository; they judge the drafts.

`HC` below means: `node "${CLAUDE_PLUGIN_ROOT}/packages/canon/bin/headcanon.js"`.

## How to ask

- Use **AskUserQuestion** for every approval. Put the full draft in the question text.
- **Selecting an option carries no text.** Offer two options, **Approve as written** and **Drop**, and say: "To correct or rewrite it, type your version in Other." Never offer "Approve with a correction".
- One concept per question. Use `multiSelect: true` only for a first pass over a list. **After a multi-select, go one by one** through every unselected item: restate the original proposal in full, same two options, corrections through Other.
- **Typed text comes in three kinds.** Tell them apart before recording anything:
  1. **Wording**: the human wrote the statement itself. It is **stated**, quoted verbatim, and it is the node's content.
  2. **A correction as an instruction** ("drop the counts", "lead with the engine"): their words are quoted under `## Stated` as the correction, you apply it to your draft, and you **ask once more** with the merged text, so the merged text can become **resolved**. Never treat a merged draft as approved without that question.
  3. **A process instruction** ("ask one at a time", "no not-clauses", "plain language"): follow it for the rest of the run; do not record it in any node.
- A draft approved as written is **resolved**: your text is the Intent, the option chosen is the Resolution. An unselected or unanswered draft stays **assumed**.
- Never write a canon file before the question that approves it has been answered.

## What goes into a node

- **Every clause traces to a source**: an artifact (file and lines) or the human's words in this conversation. Never add a clause because it seems plausible. If you are unsure whether an artifact says it, it does not.
- **Intent, not current state.** Counts, versions, statuses, and what exists today are facts that change ("15 questlines", "68 action types", "[IMPLEMENTED]"). They never enter a node; record the intent they serve.
- **Plain words at the upper layers.** Domains and capabilities are readable by someone who has never seen the code. Mechanisms and vocabulary ("statechart", "parallel regions") belong in requirements, and only where the glossary defines the terms.
- **One idea per node.** A node that needs "and" twice is two nodes.

## Threads

Your inventory from step 1 is a list of **threads**: things the artifacts say, each with its path and lines. At every step below, before drafting, scan the threads for the ones that speak to that step (purpose, direction, an area, a capability, a requirement), use them, and mark them used. Threads still unused at the end are what the sweep in step 7 asks about. Keep the thread list in a scratch file, not in the canon.

## File format

Node file, one per requirement (`canon/REQ-1-<slug>/README.md` for a node with children, `canon/REQ-1-<slug>/REQ-1.1-<slug>.md` for a leaf):

```markdown
---
id: REQ-1.2
parent: REQ-1
title: "Short plain-language title"
state: stated | resolved | assumed | open | contested
source: "path:lines, or: conversation, <date>"
kind: binary          # only when the node is already a yes-or-no check
---

# Short plain-language title

## Stated            (only when the human typed wording or a correction; verbatim, with a Source line)
## Intent            (your draft; mark the heading "## Intent [assumed]" when the node is stated)
## Resolution        (the option chosen and the date, when approved as written)
## Not this          (where an artifact or the human made one clear)
## Assumptions       (bullets; each ends with "(model assumption)")
## Open              (known unknowns, dated)
```

Use the Write tool for files, one file per call; shell heredocs fail on quoting.

## 0. Check

Run `HC check`. If a canon already exists, stop and point the human to `/headcanon:review` or `/headcanon:capture`. Otherwise continue. Do not run `HC init` yet.

## 1. Read the artifacts, silently

Search for intent artifacts and read the important ones: `README*`, `REQUIREMENTS*`, `SPEC*`, `ARCHITECTURE*`, `ROADMAP*`, `CHANGELOG*`, `docs/**/*.md`, decision records (`docs/adr/**`, `decisions/**`, `.claude/decisions/**`), plans and analyses under `.claude/**`, `CLAUDE.md`, `AGENTS.md`, the package manifest, test names. Build the thread list. Note where artifacts contradict each other and which is newer. **Do not present the inventory and do not ask about provenance.** Everything from an artifact is assumed; the only source of stated items is what the human types here.

## 2. Overview

One question each, in order, drafted from the threads that speak to it:

1. **What it is.** One or two sentences.
2. **Purpose, and for whom.** One short paragraph.
3. **Not this.** Three to six non-goals. Multi-select, then one by one, then one question for anything missing. This is the only place where what the project is not belongs.
4. **Glossary.** Six to ten terms with a specific meaning here. A definition says **what the term is**, in one or two sentences, as a dictionary entry does: no "not" clauses, no contrasts, no reference to this conversation. **One concept per entry**; a related term gets its own entry. A disambiguation is a separate sentence added only when the human asks. Multi-select, then one by one.

After the glossary, run `HC init` and say in one sentence that the commit-msg hook is installed and what it requires. Write `canon/README.md` with front-matter (`id: ROOT`, `title`, `state`, `source`), `## Stated`, `## Intent`, `## Resolution`, `## Not this`, `## Principles` (filled in step 3), and `## Glossary` in the format `**term** (`TERM-slug`): definition`, with `[assumed]` on the heading unless every term was confirmed. Root `state` is `stated` if the purpose was typed, `resolved` if approved as written.

## 3. Principles

Principles are the project's direction: tone, taste, values, ways of working. They are tested against requirements, not code: every requirement proposed later is judged against them, and drift is raised for the human. From the threads that speak to direction (style guides, design principles, charters, the human's answers in step 2), draft three to eight principles, each as `**PRN-n Title**: statement` with a source. Multi-select, then one by one, then one question for anything missing. Write them into the root README under `## Principles`.

## 4. Domains

From the approved overview **alone**, ask: for this product to operate at all, what distinct areas must exist? Those are the domains. A game that ships its own engine and in-game editor has three: game content, game engine, editor. A platform that turns client PDFs into JSON needs intake, discovery, reconciliation, review, provenance, access. Then check the threads for areas the artifacts treat as their own and you missed.

Propose two to six domains, each with an ID (`REQ-1`, `REQ-2`, …), a plain title, and one line saying what the domain must do and why the premise needs it. Multi-select, then one by one, then one question for anything missing. The cut is malleable and the human settles it; what matters is that every area is explicit and agreed. If the premise needs fewer than about eight areas, those areas are the top level and there is no separate domain layer. Write the approved domains as folders with a `README.md` each.

## 5. Capabilities

For each domain, ask: what does every system of this kind need in order to be fully defined as one? Draw on that first, then on the threads. A game engine needs state, content loading, rendering, rules evaluation, persistence, and so on; a content domain needs a world structure, a tone reference, a path from idea to shipped content.

Propose up to eight capabilities per domain, each with a plain title, one line, and a source (the artifact that covers it, or "archetype" when nothing in the project does). **A capability the kind of system needs but nothing in the project covers is proposed as an `open` node titled as the question** ("How is game time modeled?"), so coverage gaps are visible on day one. Before asking, judge each capability against the principles and say in the question if one drifts. One multi-select per domain, then one by one. Write the approved capabilities as the domain's children.

## 6. Requirements

Under each capability, the concrete requirements the threads state, each with a plain title, one line, and a source, as assumed nodes. A requirement is verifiable by definition: before proposing one, name to yourself a check in content or code that would show it met; if you cannot, it is a principle or too vague, and it is not proposed. Where a requirement is already a yes-or-no check, set `kind`. Judge each against the principles. One multi-select per capability that has candidates, then one by one. **Stop at this depth.** Deeper levels fill lazily when work touches a branch.

Where two artifacts disagree, offer both readings as options; if the human picks neither, record the node as `contested` with both positions.

## 7. Sweep for dropped threads

Take every thread still unused. Group them, at most eight per question, and ask a multi-select with three kinds of option: **add as a new node** (under which capability), **merge into an existing node** (name the ID), or **drop**. Added threads become assumed nodes with their source. Merged threads update the named node, citing the source. Dropped threads are recorded in `canon/decisions/DEC-001-adoption-scope.md`: `state: resolved`, `intents` pointing at the root and the branches they would have joined, one line per dropped thread with its source and the human's reason. If the human says an artifact is entirely obsolete, record that once instead of asking per thread.

## 8. Verify, render, commit

Run `HC check` and fix every error. Run `HC summary` and show the tree. Run `HC render`. Then `/headcanon:commit`: one `Intent-Change: create <ID>` per node, `Intent-Change: update ROOT`, `Decision: DEC-001`, and `Approved-By:` with the human's git `user.name`, since they approved every item here.

## 9. Report

End with: the domains and the capabilities under each; which capabilities are open; how many nodes are stated, resolved and assumed; what was dropped and why; what the human corrected; and that `/headcanon:review` walks the assumed and open items whenever they are ready. Do not call the canon complete. It is a seed with the human's fingerprints on every node.

## Rules that apply throughout

- Never ask the human where a file came from or who wrote it.
- Never write a canon file before the human has answered the question that approves it.
- Stated is only what the human typed. A correction typed as an instruction is quoted as such; the merged text needs its own approval.
- Every clause cites a source. Nothing invented. No current-state facts.
- Plain words at the domain and capability layers.
- Definitions say what a term is; one concept per entry.
- The top comes from the premise and what every system of this kind needs, never from where statements were found.
- Never go deeper than domains, capabilities and one level of requirements during adoption.
- When the human disagrees, record contested; do not argue past one round.
- Stopping to ask is a successful outcome.
