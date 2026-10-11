---
id: REQ-3.14
parent: REQ-3
title: "A node is cut into children by laddering what it implies to the rung below it, and the axis is read off the set"
state: resolved
layer: requirement
source: "Claude Code session, 2026-10-11"
files: [skills/refine/SKILL.md, skills/refine/reference.md]
---

# A node is cut into children by laddering what it implies to the rung below it, and the axis is read off the set

## Stated

> This research still didn't turn up a solution for us on how to cut branches. We will work on this on the next turn while you do some implementation work for me remotely.

> I think defining a dimension first is a mistake in the order of operations. Running the inference prompts gives us information on what these dimensions can be.

> The artifacts are not necessarily candidates, because their level might be further down. [...] an artifact is a HINT that there should be an upper level

> If the rules are good enough, there is no need for alternative child sets, we can just create the set straight away.

> If the axis is the same per group, why not just unify the entire group under a new child and then branch from there?

Source: Claude Code session, 2026-10-11.

## Resolution

> This seems good. Can you then complete the Refine skill to enough specificity that we can test it as part of the adopt skill for the next test?

Claude Code session, 2026-10-11, on the construction below as proposed.

## Intent

The candidates for a node's children are the answers to the four prompts of REQ-3.13 on the node's meaning, together with the hints in its scope: artifact threads, assumptions recorded under it, and rungs deferred under it earlier. Every candidate is laddered to the node by asking why it must hold until the answer is a sentence the node's text already says. The rung directly below the node is a child; the rungs beneath it are deferred under that child until the child is refined in turn. Rungs that name one thing merge into one child.

The axis is read off the set: the question most top rungs answer about the node, when, which part, which case, who, what it acts on or how well, is recorded on the node as its partition. Rungs that answer a second question become one facet child that branches from there. A lone rung is deferred under the child it is an aspect of, linked to the children it cuts across, or lifted to the node's parent when it cuts across the node's siblings too.

The set is closed by two checks: if every child holds, the node holds; and everything the node's text acts on, produces or forbids appears in some child. Each gap becomes a child, pre-filled from the project where it speaks to it and otherwise asked as a question, and an open node when the human leaves it undecided. The children are named by their rungs in plain words or glossary terms, judged against the principles, ordered along the axis, and approved as one set together with the axis.

## Not this

- Choosing the dimension before the children, or proposing alternative child sets for the human to compare.
- An artifact's statement as a child in its own words.
