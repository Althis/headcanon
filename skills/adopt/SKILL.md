---
name: adopt
description: "Start HeadCanon in a project that has no canon yet. Inventories the repository's existing intent artifacts (README, requirements, roadmaps, decision records), then elicits the purpose, non-goals and glossary in the human's own words and proposes a first requirement tree as assumed items for the human to review. Use when the session context says the project has no canon, or when the human asks to set up, adopt or install HeadCanon."
when_to_use: "The project has no canon/README.md, or the human asks to add HeadCanon to an existing or new project."
---

# Adopt HeadCanon in this project

You are starting the canon for a project that does not have one. The outcome is a small, honest canon: the human's purpose and non-goals in their words, a glossary, and a first-level tree whose every node says where it came from and how certain it is. Depth comes later, lazily, when work touches a branch.

`HC` below means: `node "${CLAUDE_PLUGIN_ROOT}/packages/canon/bin/headcanon.js"`.

## 0. Check

Run `HC check` from the project root. If a canon already exists, stop and tell the human to use `/headcanon:review` or `/headcanon:capture` instead. Otherwise continue.

## 1. Inventory the existing intent artifacts

Search before asking, so the human reviews what exists instead of restating it. Look for, at least:

- `README*`, `REQUIREMENTS*`, `SPEC*`, `ARCHITECTURE*`, `ROADMAP*`, `CHANGELOG*`, `CONTRIBUTING*`
- `docs/**/*.md`, `doc/**/*.md`
- decision records: `docs/adr/**`, `decisions/**`, `.claude/decisions/**`
- plans and analyses: `.claude/**/*.md`, `plans/**`, `*.plan.md`
- `CLAUDE.md`, `AGENTS.md` (project instructions often carry intent)
- the package manifest's description, and test names (`describe(` / `it(` strings) as evidence of intended behavior

Present an inventory table: path, what it is, last modified date, size, and your guess at provenance (human-written, agent-written with the human's guidance, generated from code). Then ask the human to correct the provenance guesses. **Only text the human wrote themselves can become stated. Everything else is assumed until the human confirms it, however authoritative it looks.** A document being long, detailed or named REQUIREMENTS does not make it the human's intent.

Record your inventory in your working notes; it becomes the `source` fields later.

## 2. Create the skeleton

Run `HC init`. It creates `canon/README.md`, `canon/journeys/`, `canon/decisions/` and installs the commit-msg hook. Tell the human the hook now requires an Intent trailer on every commit, with `Intent: none (reason)` allowed. If init reports an existing hook it did not install, show the message and ask before using `--force`.

## 3. Elicit the purpose, in the human's words

Ask, in order, one or two questions at a time, and wait for answers:

1. What is this project for, in one or two sentences? Who is it for?
2. What must it never become, or what is it explicitly not? (These become **Not this**.)
3. Which terms do you use that mean something specific here? What does each mean, and what does it not mean?

Write the answers into `canon/README.md` **verbatim**, as blockquotes under `## Stated` and `## Not this`, each with `Source: conversation, <date>`. Do not tidy the human's wording. If an answer is vague, ask a follow-up; do not fill it in yourself. Change the root's `state` from `open` to `stated` only once the purpose is in the human's words.

## 4. Glossary

Propose terms you found in the artifacts and in the human's answers, with a definition and a "not" clause each, in the format `**term** (`TERM-slug`): definition`. Mark the section `## Glossary [assumed]`. For every term the human confirms or corrects in their own words, quote them; the human's definition is stated, yours stays assumed. Keep the glossary short; ten terms the human actually uses beat forty you inferred.

## 5. Propose the first-level tree

From the inventory and the conversation, propose between five and twelve top-level requirements. For each: an ID (`REQ-1`, `REQ-2`, …), a title, the state (`stated` only for a verbatim quote from the human in this conversation; otherwise `assumed`), a `source` pointing at the file and line range or the conversation, an **Intent** paragraph, and a **Not this** line where the artifacts make one clear. Where an artifact lists sub-items, add at most one level of children, also assumed, with sources. Do not go deeper. Do not convert a whole document; the tree is filled lazily when work touches a branch.

Show the proposal as a change request before writing anything: one line per node with its ID, title, state and source. Ask the human to approve, change or drop nodes. Write the files only after the human explicitly says yes. The layout is one folder per node with children (`canon/REQ-1-<slug>/README.md`) and one file per leaf (`canon/REQ-1-<slug>/REQ-1.1-<slug>.md`), with front-matter `id`, `parent`, `title`, `state`, `source`, and optional `kind`, `steps`, `files`.

## 6. Decisions and journeys found in the repository

If you found decision records, propose one `canon/decisions/DEC-NNN-<slug>.md` per record, state `assumed`, `intents` linking to the branches they serve, body summarizing the decision and citing the original file. If you found a described user flow, propose it as a journey only if it is clearly how the human wants the product used; otherwise leave it for later. Same rule: show, then write on an explicit yes.

## 7. Verify and commit

Run `HC check`; fix every error. Run `HC summary` and show the tree. Then use `/headcanon:commit` to compose the commit. The commit lists one `Intent-Change: create <ID>` per node and carries `Approved-By:` with the human's git user.name if they approved in this conversation, or `pending (…)` if the change goes to a pull request for approval.

## 8. Report

End with: which items are stated, which are assumed, which are open; what you chose not to convert and why; and that `/headcanon:review` walks the assumed items whenever the human is ready. Do not claim the canon is complete. It is a seed.

## Rules that apply throughout

- Never paraphrase into a stated item.
- Never write a canon file without showing the change request first and hearing an explicit yes.
- When you do not know something, record it as open rather than guessing.
- If the human disagrees with a proposed node, record it as contested with both positions, not silently dropped.
- Stopping to ask is a successful outcome.
