---
id: DEC-026
title: "After the tenth run: one context for the map and one per capability, tests of every kind written by HeadCanon, one box as the unit of building, implementation agents held only at stop and at commit, the human's decision on what was built"
state: stated
date: 2026-11-18
intents: [REQ-3.4, REQ-3.13, REQ-7.1, REQ-8.6, REQ-9.4, REQ-11.1.1, REQ-12.1.8, JRN-2]
---

# After the tenth run: one context for the map and one per capability, tests of every kind written by HeadCanon, one box as the unit of building, implementation agents held only at stop and at commit, the human's decision on what was built

## Stated

On adopting the test project again from zero, with the new contexts:

> Do the risky context changes. We are here to break fast and re-iterate.

> [...] faster than the one used at run 10, or at least more dynamic, so that the user and the agent can co-work effectively

On the kinds of test:

> unit, e2e, integration, evals, etc. Write the test-writter agent to be aware of that, and different skills for it addressing quality standards for tests in all of these fields. Specifically for e2e, remember to record the assumed/approved journey on the journeys tab.

On journeys, where the product is a web app:

> [...] can be transformed into playwright playbooks

On how a test is shown on its box's card, and who judges it:

> [...] in natural language. A lay user is not to be expected to understand code, they just need a clear description of what is being tested and how

> There is no need to wait for the user

> Our own quality reviewers should have a rubric for deciding whether a test is good as part of the test proposal process.

On "Implemented by", which is core:

> [...] that should come directly from evidence during adoption, then maintained by the builders.

On a card that is not built or out of sync, which offers "implement this":

> [...] launch the implemented in just that slice, pass the tests, and the user then has final decision, if the user approves it it goes up in a commit with our intent format + the changes to the canon. This should be the base way headcanon works. The 'implement all' button at the top is just a bigger version of t his process.

On building from guesses:

> [...] most implementations will be on assumptions, and the user should be presented a final product after a round of implementation to review(no matter how big, see 4)

> [...] there is no difference between a green and a yellow leaf, only from those to a red leaf

On a new kind of issue, "impossible":

> [...] the implementer tried many times to make it work but couldn't for some reason, and ask for a decision on how to deal with the problem

On the implementation agents, which:

> [...] run on whatever model the user is using currently

> [...] not strictly controlled by head-canon, but get all of our contextual information derived from the canon

> [...] constrained only in the stop(should only stop if the tests created by headcanon pass) and commit(can only perform commits containing the intent format)

and which can:

> [...] add further assumptions to the canon, and create new issues that can block development, unless the user resolves them

Source: Claude Code session, 2026-11-18, the human's review of docs/research/2026-11-18-alpha-proposal.md. The words are as the build contract of that day records them, each cut where the contract cuts it; the lines between the quotes are the session's.

## Intent

- **Contexts.** One context, the agent `top`, refines the premise into domains and every domain into its capabilities; it draws the whole map, so it decides which capability owns what, and it drafts the product's journeys from the evidence as guesses. Below it, one fresh refiner per capability refines that capability to its leaves. The tool refuses a refiner's operation outside its capability; what belongs elsewhere is a proposal the session applies, asking the human only when an approved box is involved. Two lookups reach the rest of the tree: the context of one box, and a search of every box by its words. The test project is adopted again from zero with these contexts.
- **Readiness.** When a capability's refiner reports, the builder test runs beside the review: an agent that has only the canon's text writes each test case in plain words and lists what it had to assume. The refiner closes the gaps from the evidence; a costly gap the evidence does not settle becomes a draft with its question, and the rest are recorded as assumptions.
- **Tests are HeadCanon's own, of every kind a project needs.** The tester writes the tests of a box before any code is written for it, the kind chosen by what the box's check observes: unit, integration, end-to-end, eval. An end-to-end test is written from a journey, which is recorded first, guessed or approved, and shows on the Journeys page. Each test carries a description in plain words of what is tested and how, which is what the box's card shows. A reviewer passes or fails each test against the rubric for its kind; nobody waits for the human. Writ stays the gate in CI (REQ-9.13) and reruns the same record once it exists.
- **Where a box is built.** Every requirement says where it is built under Implemented by: the code bound to it from the evidence during adoption, or a line that it is not built with what exists instead. The implementation agents keep it from then on: an approved slice binds what its commits changed.
- **Two marks about the code.** A box that is not built has a grey fill and keeps its own solid border. A box out of sync, whose code contradicts it or whose accepted tests fail, carries a red dashed ring a little outside it. A draft shows neither.
- **One box is the unit of building.** A box that is not built or out of sync offers Implement this: readiness, tests, a first run, one implementation agent on that slice, then the human's final decision; what they approve goes up in a commit in the intent format with the changes to the canon. Implement/align, at the top of the canvas, is the same steps over the selected box and everything under it, or over everything (JRN-2).
- **Guesses are built like approvals.** Guessed and approved boxes are built alike and nothing is asked first; only a red box, one with an issue, is left out. After a round, however large, the human reviews what was built: approve, send back with a note, or discard.
- **Implementation agents** run on the model the human is using, are free in how they build, and take their brief from the canon. They are held at two points. At the stop: an agent stops only when the tests HeadCanon recorded for its boxes pass, or when each box still failing has an issue waiting on the human. At the commit: only in the intent format. They may add assumptions, guessed child boxes marked as the builder's, and file issues that block their box until the human resolves them. The kinds of issue gain impossible: repeated attempts to make a box's tests pass failed, and the human is asked how to deal with it.
- **Where they work.** One at a time, on a build branch in the human's checkout, which the human merges.

This amends DEC-017 and DEC-022, whose one refiner per node, four at a time and never two siblings give way to the contexts above; DEC-024, whose path to a box was to be validated before work under it; and DEC-025, whose kinds of issue were four, all filed by the session, and whose Implemented by was the session's alone. JRN-2 is rewritten as the journey of this decision and JRN-1 points at it. The boxes it changes are reworded in place: REQ-3.4, REQ-3.13, REQ-4.1, REQ-7.1, REQ-7.2.2, REQ-8.6, REQ-9.4, REQ-9.5, REQ-9.6, REQ-9.7, REQ-9.14, REQ-10.5, REQ-11.1.1, REQ-11.1.2, REQ-11.6, REQ-11.6.3, REQ-12.1.5, REQ-12.1.8 and JRN-4; JRN-5 names JRN-2 where it named Test as a later journey. Not changed: a capability carries no check of its own (DEC-013), and a parent requirement may keep one (DEC-021).

## Why

The tenth run (2026-11-17) drafted 993 boxes in 2 h 52 min for $514 with one context per domain: a refiner's context peaked between 167k and 365k tokens, the largest domain took 85 minutes, and cache reads were $148 of the refiners' $289. A builder given only the canon's text found none of five capabilities ready to build: 126 gaps over 79 boxes, 59 of them costly, and three gaps in four were answered by the repository the refiners had already read. Counting leaves with no code bound gave 550 of 847 on a product that runs, since the run bound code mostly at the domain and the capability, so the marks could not be read from the bindings as they stood. The figures are in docs/research/2026-11-18-alpha-proposal.md, sections 1 to 3.

The canon already held the path requirements, tests, implementation, report (REQ-7.1, JRN-1); this decision makes it run in the session, one box at a time, with the human's time spent on what was built and not on questions before it.

## Open

- 2026-11-18: whether the new contexts are faster than the tenth run's, or more dynamic, is measured by the run that follows.
- 2026-11-18: whether siblings in different capabilities drift apart when each capability has its own context was not measured before the decision; the same run shows it.
- 2026-11-18: the form of a data shape, one child per field or one box whose check names a schema file kept beside the canon, is settled on the first capability that needs one.
