---
id: REQ-3.15
parent: REQ-3
title: "Refinement follows dependency order: a node requires the nodes whose concepts it uses, and the next node to refine is chosen from that order"
state: stated
layer: requirement
source: "Claude Code session, 2026-10-11"
files: [packages/canon/src/next.ts, skills/refine/SKILL.md]
---

# Refinement follows dependency order: a node requires the nodes whose concepts it uses, and the next node to refine is chosen from that order

## Stated

> Does it know how to order these properly? Or is it just going from first to last? [...] the elements necessary for "The living world" will need to be defined in either the building blocks or game state as primitives. Do we currently have any way of checking this order of operations flows in the correct order? Or is this just luck? If not, may I suggest implementing a stage AFTER refinement, which is specifically designed to select the correct node to address next? That would be based on both specificity(so that we don't drill down a topic too much) as well as each node having the required pieces in place before it can be defined. Basically, each node upon refinemed would define a dependency order amongst its siblings and maybe first, second, etc cousins.

> I just wanted to say that maybe requirements relate to stuff on other parts of the acyclic graph. As to your question I'd create it when the new dependency is noticed, but we also need to watch out for dependency cycles and dead-lock, and we need a way both avoid them(hopefully CONSOLIDATED into some extant procedure, remember CONSOLIDATION BEFORE ADDITION) and deal with them when they happen(probably using human in the loop)

Source: Claude Code session, 2026-10-11, during the fifth adopt run.

## Intent [assumed]

A node requires every node whose concepts its definition uses, sibling or cousin, recorded as a `requires` link on the node when the dependency is noticed. The refine skill derives the links from the children's lines and deferred rungs, orders a new set with prerequisites first so that the IDs read as build order, and checks that a node's own prerequisites are refined before cutting it.

The next node to refine is the first in the topological order of the `requires` links among the unrefined nodes whose prerequisites are all refined: the shallowest first, so that no branch is drilled while a sibling above it waits, then the one most other nodes require, then the lowest ID. The `next` command computes it, and the session context states it. A request from the human to define a branch takes precedence, after the agent has said which prerequisites are unrefined.

A `requires` link that would close a cycle names a concept both nodes need, which is lifted to their lowest common ancestor instead; a cycle nothing can lift is settled by the human through the inconsistency question. A cycle that is written is an error in the check and a contradiction for the verifier. A deadlock, every unrefined node waiting on an unrefined prerequisite, is a warning in the check, and the agent asks the human which prerequisite to refine first or which link to drop.

## Assumptions

- A node is refined when it has children or a `kind`; an open or contested node is neither refined nor refinable, so a prerequisite in that state blocks until the human settles it. (model assumption)
- The requires link follows the feature-model requires constraint and the dependency link of the requirements tools; the ordering is a topological sort with depth and dependents as tie-breakers, as in critical-path scheduling. (model assumption)
