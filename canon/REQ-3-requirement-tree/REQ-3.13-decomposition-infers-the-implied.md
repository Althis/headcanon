---
id: REQ-3.13
parent: REQ-3
title: "Decomposition infers what a node implies, and the inference is its own skill, refine, invoked by the others"
state: stated
layer: requirement
source: "Claude Code session, 2026-10-11"
files: [skills/refine/SKILL.md]
---

# Decomposition infers what a node implies, and the inference is its own skill, refine, invoked by the others

## Stated

> This in my opinion is where the "capability inference" becomes MOST IMPORTANT. The user will just note what they want, but they usually never think of all of the consequences of their desired features. This is where the system should help them.

> For the completeness, I agree with everything you said, but for us to do this properly, I think this needs to be it's own skill that gets invoked by other skills. If we don't do it this way, we will blow the size constraint on skills and compromise either the adopt skill or this essential skill in itself. You can choose a name for this skill.

Source: Claude Code session, 2026-10-11.

## Intent [assumed]

Given one approved node, the skill derives its children by asking what must exist, and what follows, for the node to hold. Four prompts are applied to the node's meaning: prerequisites, what must exist before it is possible; consequences, what follows once it holds; failures, what happens when it does not hold and what must prevent it, which is the obstacle analysis the brief keeps in mind; and the archetype, what every system of this kind has at this point. Each inferred child carries its chain, the clause it follows from and the kind of inference, and the human approves the chain with the child. An inference with no chain is not proposed, which guards against invented needs. Artifacts then pre-fill wording and confirm or contradict; an implied child nothing in the project covers is proposed as an open node.

The skill is named `refine`, after the brief's own verb for the step, and is invoked by adopt at the capability and requirement layers, by capture when a branch is refined for implementation, and by review when a branch is rebalanced. It is separate so that neither it nor the skills that call it exceed their size limits.

## Open

- 2026-10-11: how the skill chooses the dimension along which to cut a branch is REQ-3.14, open; the skill is written once that is settled.
