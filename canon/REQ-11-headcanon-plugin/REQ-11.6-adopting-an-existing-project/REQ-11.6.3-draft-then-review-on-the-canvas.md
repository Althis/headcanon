---
id: REQ-11.6.3
parent: REQ-11.6
title: "Adoption drafts the canon as guesses and questions while the human reviews it on the canvas until nothing is red, then goes on to the leaves"
state: stated
layer: requirement
source: "Claude Code session, 2026-10-17"
files: [skills/adopt/SKILL.md, skills/attend/SKILL.md, skills/refine/SKILL.md, agents/refiner.md]
requires: [REQ-12.1.8]
---

# Adoption drafts the canon as guesses and questions while the human reviews it on the canvas until nothing is red, then goes on to the leaves

## Stated

> Right now the process of defining requirements is rather exhaustive.

> I'm unsure how the system will work if the user doesn't finish the process in one go and tries to open again. Do they have to do so via adopt? Will the system handle stopping and starting again gracefully in any way?

> What I would like to do is to enable us to move forward more free-form. We already have a conceptual element in place to enable this: which is the "assumed" tag.

> On our next version, I'd like you to immediately tell the agent to refine and use the artifacts they found as direction. For each new node, the system needs to identify if they have enough from previous nodes and artifacts to make a good guess. If they do not think they have enough, they should not guess. If they think they have enough, they are incentivized to guess and mark the node as an assumption.

> After each edit or deletion, the model should run again and re-calculate the impact of the changes to the tree(use some type of pending UI to signify to the user that the model is working). Upon this recalculation, contradictions and duplication will need to be re-evaluated and if they are found they should be marked as red.

> This flow should continue until the entire graph has no red and can be fully committed for creating the binary tests from the requirements.

> Hypothesis: Lay users do not know how to drill down into the details that we need to turn requirements into tests, but they also shouldn't need to. The more they refine the upper levels of the tree, the more the model itself should be able to define the lower levels.

> My guess is that the human will fix everything that is red, and confirm or edit a few nodes that are pushed into their face (like the premise), and check a few yellow nodes more or less at random before clicking finish. [...] The time the user is expected to spend in the adopt screen approving and reading stuff is between 7 to 15 minutes. This is not a goal, this is a requirement.

> Boxes appearing on the canvas while we work seems awesome! [...] If we could work from the top, and start refining as the human is working somewhere else I think that would be great!

> When they finish, we need to create the most detailed requirements document possible, and then do so in a system where the entire requirements document doesn't need to be added to the context of Claude all at once, but that it can develop working entirely in its local branch, and any assumptions or decisions get then added to the DAG.

Source: Claude Code session, 2026-10-17, after the fifth adopt run; the last three quotes on 2026-10-18, after the sixth.

## Intent [assumed]

After the briefing, the agent drafts the root README and cuts the premise into domains without asking, opens the canvas, and from then on cuts every ready node below with refiner agents in fresh contexts, several at once in dependency order, children of approved nodes first and none under a red one, while the human reviews what exists. An entry whose line rests on its chain to the parent plus a thread or the archetype is written as assumed; an entry that rests on the chain alone is written as an open node titled as the question. A guess is preferred whenever a thread speaks to the entry at all. Two threads that disagree make the node contested. The verifier runs on a branch when nothing in it is left to cut and at Finish: a contradiction between two threads stays contested, one the draft itself introduced is fixed in the draft, and reiterations are merged or questioned.

The human reviews on the canvas (REQ-12.1.8), top-down, approving, rewriting or deleting one box at a time, and the attend skill reworks what hangs from each change: children an approved or rewritten text no longer implies become open, children it words differently are rewritten as assumed, the parent's line is kept describing its children, and nodes that require a changed one are re-read. After each change the agent says in the chat what it changed and which box to look at next. The human's review takes about a quarter of an hour and goes to the premise, the principles, every red box and the yellow ones they choose; a branch reaching its leaves, a new red box and a thread that contradicts an approval are the key points at which they are called, in the chat. Finish, pressed with no box red, sweeps the unused threads, writes the scope decision and commits the canon with the human as approver; the cutting then goes on until every leaf carries its check, each finished branch committed as assumed for the review skill.

An adoption stops and resumes without ceremony: the canon on disk is the state. Starting the adopt skill on a canon that has no scope decision resumes at the canvas, and the attend skill works on any canon the page shows.

## Assumptions

- During adoption, deleting a box removes its file and its children's files; nothing was committed yet, so there is nothing to retire. (model assumption)
- The sixth run tests the hypothesis: whether approving and rewriting the upper layers lets the agent define the lower ones well enough that the human need not open them. (model assumption)
- One node per refiner agent is the unit of drafting because the sixth run, told to cut each node with refine in its own context, drafted all 187 nodes in one output instead, and because a canon of thousands of nodes fits no single context; a fresh context per node keeps the moves explicit and the cost per node flat. (model assumption, 2026-10-18)

## Open

- 2026-10-17: whether the guess rule errs towards too many guesses or too many questions on a real repository; the sixth run decides.
- 2026-10-18: the sixth run drafted 185 guesses, one question and one contested node; whether the guesses hold is for its review to show.
