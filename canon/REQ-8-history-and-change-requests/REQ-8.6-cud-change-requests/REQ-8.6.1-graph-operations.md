---
id: REQ-8.6.1
parent: REQ-8.6
title: "The canon is managed through a fixed set of operations drawn from established frameworks"
state: stated
layer: requirement
source: "Claude Code session, 2026-10-11"
---

# The canon is managed through a fixed set of operations drawn from established frameworks

## Stated

> use established movement and insertion operations to define the rules for managing the graph.

Source: Claude Code session, 2026-10-11.

## Intent [assumed]

Every change to the graph is one of these operations, each with its rule:

- **create**: a node with one home, placed by descending from the domain to the most specific node the statement refines; proposed only after the parent and siblings were checked for an entry that already says it.
- **update**: only what changed and why.
- **retire**: the node stays with a reason; nothing is erased.
- **link**: `relates` between nodes that bear on each other, `conflicts` between nodes that pull against each other, `requires` from a node to the nodes whose concepts its definition uses; the acknowledgement that makes overlap and order visible. A `requires` edge that would close a cycle is a lift of the shared concept instead.
- **lift**: a node two siblings both need moves to their lowest common ancestor.
- **split**: a node whose parts can be verified separately becomes children along a named dimension.
- **merge**: a child that restates its parent, or a sibling that says what another says, is absorbed into it.
- **re-home**: a node moves under another parent; today a retire plus a create with the old node naming its successor, since an ID mirrors its home's path.

The change request names the operation; the commit trailers carry it; the check and the verifier know the rule of each.

## Assumptions

- The vocabulary follows the researched frameworks: typed links from KAOS and Volere, lifting from capability-map and work-breakdown practice, controlled copies from SysML and the requirements tools left out for now. (model assumption)
- The trailer grammar grows from create, update and delete to the full set when capture and review implement them. (model assumption)
