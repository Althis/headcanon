---
id: REQ-11.6.3
parent: REQ-11.6
title: "Adoption drafts the canon to its leaves as guesses and questions, then the user reviews it on the canvas by impact"
state: stated
layer: requirement
source: "Claude Code session, 2026-10-17"
files: [skills/adopt/SKILL.md, skills/attend/SKILL.md, skills/refine/SKILL.md, agents/refiner.md]
requires: [REQ-12.1.8]
---

# Adoption drafts the canon to its leaves as guesses and questions, then the user reviews it on the canvas by impact

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

The agent drafts the root README, opens the canvas with the briefing, and from then on refines in two kinds of context: one context, the agent `top`, takes the premise to its domains and every domain to its capabilities, and one refiner per capability, each in a fresh context, takes that capability to the leaves, started once the capabilities of its domain passed review and none under a red node, with nobody waiting on the user (DEC-024, DEC-026). An entry whose line rests on its chain to the parent plus a thread, the code or the archetype is written as assumed, and a requirement says where it is built: the code bound to it under Implemented by, or a line that it is not built with what exists instead; an entry that rests on the chain alone, or on two sources that disagree where precedence does not decide, is a draft with its question filed as an issue and left. A guess is preferred whenever a thread speaks to the entry at all. The reviewer and the builder test run on a capability when its refiner reports, and the reviewer's global check on a domain when all its capabilities are done: a contradiction between two threads stays contested, one the draft itself introduced is fixed in the draft, reiterations are merged or questioned, and a gap the builder test found is closed from the evidence, a costly one the evidence does not settle becoming a draft with its question.

The user reviews on the canvas (REQ-12.1.8) down the list the next command ranks by impact, approving, rewriting or deleting one node at a time, and the attend skill reworks what hangs from each change: children an approved or rewritten text no longer implies become open, children it words differently are rewritten as assumed, a node left without children is cut again, the parent's line is kept describing its children, and nodes that require a changed one are re-read. After each change the agent says in the chat what it changed and which node is next on their list. The user's session takes about a quarter of an hour; the drafting done, a new red node and a thread that contradicts an approval are the key points at which they are called, in the chat. Adoption is complete when every branch ends in a requirement with a check that says where it is built; red nodes wait on the user and hold nothing else, and the session then says that Implement/align is ready (DEC-026). Finish ends the user's session whatever is red (DEC-020) and sweeps the unused threads; the canon is committed in the intent format, with the review record of the adoption's own reviews, when the first build round starts; the list stands for their next visit, and what their answers re-opened is refined again as assumed.

An adoption stops and resumes without ceremony: the canon on disk is the state. Starting the adopt skill on a canon whose adoption is not complete resumes at the canvas, and the attend skill works on any canon the page shows.

## Assumptions

- During adoption, deleting a node removes its file and its children's files; nothing was committed yet, so there is nothing to retire. (model assumption)
- The sixth run tests the hypothesis: whether approving and rewriting the upper layers lets the agent define the lower ones well enough that the user need not open them. (model assumption)
- One capability per refiner is the unit of drafting below the map, and one context holds the map (DEC-026). A canon of thousands of nodes fits no single context, and the sixth run, told to refine each node in its own context, drafted all 187 nodes in one output instead; the tenth run, with one context per domain, saw a refiner's context peak between 167k and 365k tokens (docs/research/2026-11-18-alpha-proposal.md, section 1). (model assumption, 2026-11-18)

## Open

- 2026-10-17: whether the guess rule errs towards too many guesses or too many questions on a real repository; the sixth run decides.
- 2026-10-18: the sixth run drafted 185 guesses, one question and one contested node; whether the guesses hold is for its review to show.
