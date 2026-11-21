---
id: DEC-024
title: "Adoption drafts the canon to its leaves before the human is asked; the human works a list ranked by impact"
state: stated
date: 2026-11-15
intents: [REQ-3.4, REQ-11.6, REQ-11.6.3]
---

# Adoption drafts the canon to its leaves before the human is asked; the human works a list ranked by impact

## Stated

> I was thinking that the solution for us was to actually draft EVERYTHING first, instead of ending early. Computers can work faster and longer, so I thought introducing detective sub-agents could help us resolve something fully before the human needs to confirm anything. Problems can even be recorded, such as contradictions and disambiguations, etc, and then brought to the human at the end in a ranked list taking into consideration the most impactful questions (some should invalidate others). In my opinion we were trying to brute force a problem when the machine time is fast and cheap, and we should be the ones planning to make the most bang out of the human time buck possible.

> [...] adoption capturing capability and then a secondary process introducing intent and then combining/comparing the two.

> I like your take for the architecture for 1. Lets make that change. [...] The goal for this phase should be aligning any project implementation, extant documentation and intent. For the assumption debt, I have two solutions, first is that the system should still prioritize approvals for the most impactful nodes in the UI even after the adoption process is done, so that the human can always choose to inspect the canon in fruitful ways whenever they want to spend time doing it. Then comes the implementation of new features, and in those cases the agent really should ask pointed questions that help validate the assumptions of the feature branch for the new feature. These shouldn't be exhaustive on the debt, but should be enough to reach the new feature's placements so that they are starting from validated paths on the tree.

Source: Claude Code session, 2026-11-15, after the reading of the field and the review of the Valley runs of October and November.

## Intent

Adoption has two phases, machine then human. First the session drafts the canon from the repository to its leaves with nobody waiting on the human: every entry the artifacts support is written `assumed`; what the code does today goes under the entry's `## As built`, apart from the Intent that says what must hold; every contradiction and every thing nothing speaks to is a draft with its question filed as an issue and left; a red box alone holds its subtree back. Then the human's session: `headcanon next` ranks what they can approve or settle by impact, the boxes an approval validates or a settled red box frees, the premise first and then the frontier of guessed boxes under approved ones, and each answer re-drafts what it invalidated in the background. The list stands after adoption, so the human validates the canon by it whenever they return; before work starts under a box, the session names the unapproved boxes on the path down to it (`headcanon next <ID>`) and asks about those alone.

This supersedes the reach of DEC-018 and DEC-023 and the second half of DEC-020, the lifting of the reach after Finish: nothing waits for an approval any more. DEC-017's continuous and local drafting, DEC-020's Finish as the end of the human's session whatever is red, and DEC-022's precedence and three kinds of question stand.

## Why

The runs of October and November 2026 spent the human's quarter of an hour on questions the code already answered and on approvals whose only effect was to release more drafting, and none finished in its window. The lazy filling of REQ-3.4 as first written deferred the questions without making them cheaper and left the record thin. Machine time is cheap and resumable, so the drafting runs ahead to the leaves, and the human's time goes to what the machine could not settle, in the order of what their answer changes. Keeping `## As built` apart from the Intent stops a guess read off the code from passing for the project's want, the failure the auto-updated specifications in the field show.

## Amended

- 2026-11-16, by DEC-025: adoption is reading and onboarding with the premise approved before anything compute-intensive; the two modes Guided and Full-Auto; the refiners redefine after a change, breadth first.
- 2026-11-18, by DEC-026: building does not wait for the path down to a box to be validated. Guessed and approved boxes are built alike, a red box alone is left out, and the human reviews what was built after the round; the ranked list stands for a human who chooses to validate.
