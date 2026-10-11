---
id: REQ-3.12
parent: REQ-3
title: "A balanced branch is complete including the implied, has one home with acknowledged links, and holds siblings of one kind"
state: stated
layer: requirement
source: "Claude Code session, 2026-10-11"
---

# A balanced branch is complete including the implied, has one home with acknowledged links, and holds siblings of one kind

## Stated

> Complete: you are focusing on the text, but to me the MOST IMPORTANT aspect of this branching is not the TEXT but rather that is IMPLIED through the text. If the game says "the player has a customized player character" it never states that there is a need for character creation, but it is IMPLIED that it is necessary.

> Exclusive: I am VERY doubtful that we will be able to maintain exclusivity from my experience with software engineering. That said, I am open to trying it, and I trust you did your research and saw that similar frameworks to what we are trying to build do not have issues with maintaining separation in the tree.

> Same kind: This I agree wholy.

> Proportionate: I see no reason why this needs to be enforced. Are you trying to enforce this only for organization purposes?

Source: Claude Code session, 2026-10-11, challenging the agent's four criteria for a balanced branch.

## Intent [assumed]

A branch is balanced when three things hold, each with its own guarantee. It is complete including the implied: every child the parent's meaning requires exists, whether the parent's text names it or not, and every inferred child is chained to what implies it (REQ-3.13). Each node has one home, chosen by descending from the domain to the most specific node the statement refines, and every overlap with another node is acknowledged by a link or resolved by lifting (DEC-014); the verifier flags overlap that is not acknowledged. Siblings are of one kind, because they partition their parent along one named dimension recorded on the parent.

Proportion is not a criterion. A parent with many children and a branch far deeper than its siblings are reported as information, since the first often hides a missing middle layer and the second uneven refinement, but neither blocks anything; under user-directed deepening the reader opens one branch at a time, so counts no longer protect the eye.

## Assumptions

- The dimension is recorded on the parent as `partition` and approved before any children are proposed. (model assumption)
- The link fields are `relates` and `conflicts`, after KAOS and Volere. (model assumption)
