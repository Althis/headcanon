---
id: REQ-11.6.3
parent: REQ-11.6
title: "Adoption drafts the whole canon as guesses and questions, then the human reviews it on the canvas until nothing is red"
state: stated
layer: requirement
source: "Claude Code session, 2026-10-17"
files: [skills/adopt/SKILL.md, skills/attend/SKILL.md, skills/refine/SKILL.md]
requires: [REQ-12.1.8]
---

# Adoption drafts the whole canon as guesses and questions, then the human reviews it on the canvas until nothing is red

## Stated

> Right now the process of defining requirements is rather exhaustive.

> I'm unsure how the system will work if the user doesn't finish the process in one go and tries to open again. Do they have to do so via adopt? Will the system handle stopping and starting again gracefully in any way?

> What I would like to do is to enable us to move forward more free-form. We already have a conceptual element in place to enable this: which is the "assumed" tag.

> On our next version, I'd like you to immediately tell the agent to refine and use the artifacts they found as direction. For each new node, the system needs to identify if they have enough from previous nodes and artifacts to make a good guess. If they do not think they have enough, they should not guess. If they think they have enough, they are incentivized to guess and mark the node as an assumption.

> After each edit or deletion, the model should run again and re-calculate the impact of the changes to the tree(use some type of pending UI to signify to the user that the model is working). Upon this recalculation, contradictions and duplication will need to be re-evaluated and if they are found they should be marked as red.

> This flow should continue until the entire graph has no red and can be fully committed for creating the binary tests from the requirements.

> Hypothesis: Lay users do not know how to drill down into the details that we need to turn requirements into tests, but they also shouldn't need to. The more they refine the upper levels of the tree, the more the model itself should be able to define the lower levels.

Source: Claude Code session, 2026-10-17, after the fifth adopt run.

## Intent [assumed]

After the briefing, the agent drafts the whole canon from the repository without asking: the root README, then every domain, capability and requirement in dependency order, each cut by the refine skill in draft mode. An entry whose line rests on its chain to the parent plus a thread or the archetype is written as assumed; an entry that rests on the chain alone is written as an open node titled as the question. A guess is preferred whenever a thread speaks to the entry at all. Two threads that disagree make the node contested. A consistency pass with the verifier then marks contradictions as contested and merges or questions reiterations.

The human reviews on the canvas (REQ-12.1.8), top-down, approving, rewriting or deleting one box at a time, and the attend skill reworks what hangs from each change: children an approved or rewritten text no longer implies become open, children it words differently are rewritten as assumed, the parent's line is kept describing its children, and nodes that require a changed one are re-read. After each change the agent says in the chat what it changed and which box to look at next. Adoption finishes when the human presses Finish and no box is red: the unused threads are swept, the scope decision is written, and the canon is committed with the human as approver.

An adoption stops and resumes without ceremony: the canon on disk is the state. Starting the adopt skill on a canon that has no scope decision resumes at the canvas, and the attend skill works on any canon the page shows.

## Assumptions

- During adoption, deleting a box removes its file and its children's files; nothing was committed yet, so there is nothing to retire. (model assumption)
- The sixth run tests the hypothesis: whether approving and rewriting the upper layers lets the agent define the lower ones well enough that the human need not open them. (model assumption)

## Open

- 2026-10-17: whether the guess rule errs towards too many guesses or too many questions on a real repository; the sixth run decides.
