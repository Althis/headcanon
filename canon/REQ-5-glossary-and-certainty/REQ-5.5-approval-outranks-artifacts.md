---
id: REQ-5.5
parent: REQ-5
title: "The human's latest approval outranks every artifact; artifacts pre-fill and validate, and inconsistencies are raised before moving on"
state: stated
source: "Claude Code session, 2026-10-11"
files: [packages/canon/src/rules.ts, skills/adopt/SKILL.md]
---

# The human's latest approval outranks every artifact; artifacts pre-fill and validate, and inconsistencies are raised before moving on

## Stated

> You should instruct on the use of the artifacts properly. The artifacts help: 1. Guess an auto-fill for each entry ahead of time. 2. Look for evidence to base decisions from the model on.
> That means that you are right: we go down from premise into principles, domains, capabilities etc and the primary information is the one the user JUST approved/drafted. That is the most up to date information, and the artifacts procured earlier only help validation, and highlight inconsistencies with previous documents that need to be clarified before moving on.

Source: Claude Code session, 2026-10-11.

## Intent [assumed]

Intent flows down the layers. At each layer the primary source is what the human approved or typed in the layer above, because it is the most current statement of intent. Artifacts found in the repository have exactly two roles: they pre-fill a draft where the layers above leave it open, and they are the evidence a draft is checked against and footnoted with. They never decide. Precedence when sources disagree: the human's approval in this run, the human's typed words, the newest artifact, older artifacts.

When an artifact disagrees with an approval or with a draft derived from one, the agent neither resolves it nor proceeds. It asks which stands, offering the approval and the document as the two options and taking a third version through the free-text field, then records the outcome: the entry follows the answer, and an overruled document is noted as superseded on that point so the question is not raised again.

The rule applies in every session, not only during adoption: a document that contradicts the canon is an inconsistency to raise, never a reason to change the canon on the agent's own authority.

## Assumptions

- "Highlight inconsistencies ... before moving on" is read as a hard stop at the layer boundary: the next layer does not begin while a raised inconsistency is unanswered. (model assumption)
- Overruled documents are recorded in the adoption scope decision rather than edited, since editing a project's documents is not the agent's to do unasked. (model assumption)
