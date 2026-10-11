---
id: REQ-8.5.5
parent: REQ-8.5
title: "A change to a child asks its parent: untouched parents are accounted for in the review"
state: stated
source: "Claude Code session, 2026-10-11"
files: [packages/canon/src/review.ts, packages/canon/src/check.ts, agents/verifier.md, skills/commit/SKILL.md]
---

# A change to a child asks its parent: untouched parents are accounted for in the review

## Stated

> Also please check our design for a methodology to update higher nodes on the creation of new nodes underneath. This should already be possible under the commit hook, but I'd like to explore if there is a lightweight method to make these uptake decisions to happen on create, update or delete operation of children. This should be EXTREMELY lightweight at this point, and as previously stated, focus on consolidation instead of addition.

Source: Claude Code session, 2026-10-11.

## Intent [assumed]

When a node is created, updated or deleted, its parent may no longer describe its children. The hook computes, from the staged canon diff, the parents of changed nodes whose own file is not part of the change, and the review of that commit must account for each: the verifier reads every such parent and reports an uptake finding when the parent's text excludes what a child now says, enumerates a set that changed, or is restated by a child; the committing agent puts each finding to the human with the choices of updating the parent or merging the child into it; and the review record lists every untouched parent with one line saying why it still describes its children. A parent that is changed in the same commit leaves the list by definition.

Nothing is asked in the clean case: the cost of a commit that touches a child is one line per untouched parent in a record the hook already requires. Beside the review, the check reports two deterministic signals for consolidation: a child whose title shares most of its words with its parent, and a parent with more than eight children.

## Assumptions

- Only the direct parent is accounted for; a grandparent is reached when the parent changes and becomes a child of the next commit's review. (model assumption)
- The threshold of eight children and the title-overlap heuristic are starting values to tune on a real canon. (model assumption)
