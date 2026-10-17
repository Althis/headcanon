---
id: REQ-11.6
parent: REQ-11
title: "Adopting HeadCanon in an existing project works top-down: overview, principles, domains, capabilities, requirements, then a sweep"
state: stated
source: "Claude Code session, 2026-10-11"
files: [skills/adopt/SKILL.md, packages/canon/src/init.ts]
---

# Adopting HeadCanon in an existing project works top-down: overview, principles, domains, capabilities, requirements, then a sweep

## Stated

> The AGENT that we are going to harness should do this, because that will simulate the situation where a user wants to add headcanon to their ongoing project, and that agent should have a skill or something like that to search the repository for ongoing requirements they can use to get a headstart in the requirement-elicitation task.

> The agent harnessed with the headcanon plugin should be given instructions to search the repo and collect those and work with the human in elicitation and review of  the old artifacts found when it started if a headcanon format document is not already found in the repo.

> The requirement's document was drafted from a Claude agent with my guidance, but the works should be considered assumed.

Source: Claude Code session, 2026-10-11, answers 2 and 5 about The Valley.

> The process for intaking a project with no canon is kinda complicated. We should be guiding this process more. For example, it is currently asking me for provenance of a bunch of files that I have no idea where they came from, instead, I think humans should work better from a top down approach: Have it start creating the core concepts, what it is, purpose, etc, basic concepts for the project and ask for approval or correction. Ask it to use the question answering interface, because that is quite nice. From those we start with the requirements and instruct the model to start by generating assumptions based on artifacts and ask for corrections/approvals, and then once it thinks it's done double check the artifacts again to look for dropped intents and then request approval for whether those do need to be dropped or modify current intents to include them.

Source: Claude Code session, 2026-10-11, after the first adopt run on The Valley.

> If you will read you will see that the approval flow is good, but the interface selected is a bit cumbersome in that it lets you disselect the glossary term, but it doesn't let you correct immediately. A middle ground would be to instruct the model to go one by one directly after multiple concepts were not approved, instead of trying to correct/drop all in a batch.

Source: Claude Code session, 2026-10-11, after the second adopt run reached the glossary.

> Then we update for the currently discussed structure: project definition/overview -> directions/principles -> domains(elicited by the model, corrected by the human) -> capabilities -> requirements. At every step the agent should look to the artifacts it collected as threads that it might want to incorporate in it's logic.

Source: Claude Code session, 2026-10-11, after the second adopt run was aborted at the requirements step.

## Intent [assumed]

The `adopt` skill reads the repository's artifacts silently into a list of threads and never asks the human about provenance. It then drafts the canon top-down in five layers, each as the agent's guesses: the overview (what it is, purpose and audience, non-goals, glossary); the principles (direction, as PRN entries in the root README); the domains the premise requires; the capabilities each domain needs to be complete for a system of its kind, with what cannot be guessed entered as open nodes; and the requirements the artifacts support under each capability. The three lower layers are cut one node at a time by the refine skill (REQ-3.13, REQ-3.14). The human then approves, rewrites or deletes the drafts on the canvas while the agent keeps the rest consistent (REQ-11.6.3). The threads still unused at the end are what the sweep asks about: add, merge or drop, with drops recorded in a decision.

A multi-select is a first pass only; every unselected item is asked about one at a time with the original proposal restated. Options never carry text, so corrections come through the free-text field, and a correction typed as an instruction is applied and the merged text approved in its own question before it counts as resolved.

## Not this [assumed]

An inventory interview, a wholesale conversion of a requirements document, a top level cut by where statements were found, or a batch question asking the human to sort out several rejected items at once.

## Assumptions

- The glossary belongs to the overview layer, since it defines the words the later layers use. (model assumption)
- Threads live in a scratch file outside the canon; only what the human approves is written to it. (model assumption)
- Dropped threads live in one decision record, DEC-001 of the adopted project. (model assumption)
- Adoption stops at domains, capabilities and one level of requirements. (model assumption)
