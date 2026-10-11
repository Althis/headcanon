---
id: REQ-11.6
parent: REQ-11
title: "Adopting HeadCanon in an existing project is top-down: concepts, then requirements, then a sweep for dropped intents"
state: stated
source: "Claude Code session, 2026-10-11"
files: [skills/adopt/SKILL.md, packages/canon/src/init.ts]
---

# Adopting HeadCanon in an existing project is top-down: concepts, then requirements, then a sweep for dropped intents

## Stated

> The AGENT that we are going to harness should do this, because that will simulate the situation where a user wants to add headcanon to their ongoing project, and that agent should have a skill or something like that to search the repository for ongoing requirements they can use to get a headstart in the requirement-elicitation task.

> The agent harnessed with the headcanon plugin should be given instructions to search the repo and collect those and work with the human in elicitation and review of  the old artifacts found when it started if a headcanon format document is not already found in the repo.

> The requirement's document was drafted from a Claude agent with my guidance, but the works should be considered assumed.

Source: Claude Code session, 2026-10-11, answers 2 and 5 about The Valley.

> The process for intaking a project with no canon is kinda complicated. We should be guiding this process more. For example, it is currently asking me for provenance of a bunch of files that I have no idea where they came from, instead, I think humans should work better from a top down approach: Have it start creating the core concepts, what it is, purpose, etc, basic concepts for the project and ask for approval or correction. Ask it to use the question answering interface, because that is quite nice. From those we start with the requirements and instruct the model to start by generating assumptions based on artifacts and ask for corrections/approvals, and then once it thinks it's done double check the artifacts again to look for dropped intents and then request approval for whether those do need to be dropped or modify current intents to include them.

Source: Claude Code session, 2026-10-11, after the first adopt run on The Valley.

> If you will read you will see that the approval flow is good, but the interface selected is a bit cumbersome in that it lets you disselect the glossary term, but it doesn't let you correct immediately. A middle ground would be to instruct the model to go one by one directly after multiple concepts were not approved, instead of trying to correct/drop all in a batch.

Source: Claude Code session, 2026-10-11, after the second adopt run reached the glossary.

## Intent [assumed]

The `adopt` skill reads the repository's artifacts silently and never asks the human about provenance. It then works top-down through the question interface: core concepts first (what it is, purpose and audience, non-goals, glossary), each drafted from the artifacts and approved, corrected or rewritten by the human; then the requirement tree, drafted as assumptions one level at a time and approved branch by branch, stopping at two levels; then a sweep that compares the artifacts against the tree and asks, for every intent the tree dropped, whether to add it, merge it into an existing node, or drop it. Drops are recorded in a decision so they are conscious, not silent.

A multi-select is a first pass only. Every item the human leaves unselected is then asked about one at a time, with the original proposal restated, so a correction can be typed immediately. Options never carry text, so the choices are approve or drop, and every correction comes through the free-text field.

## Not this [assumed]

An inventory interview, where the human is asked file by file who wrote what. Also not a wholesale conversion of a requirements document into the tree. Also not a batch question that asks the human to sort out several rejected items at once.

## Assumptions

- A draft the human approves as written becomes resolved, with the chosen option as the resolution; only words the human types become stated. (model assumption)
- The question interface is Claude Code's AskUserQuestion tool, with at most four options and always a way to type a correction. (model assumption)
- Dropped intents live in one decision record, DEC-001 of the adopted project, listing each with its source and reason. (model assumption)
- Adoption stops at two levels of the tree; `kind`, `files` and `steps` are left for refinement. (model assumption)
