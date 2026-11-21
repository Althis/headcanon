---
id: DEC-025
title: "After the ninth run: adoption is reading and onboarding, the premise is approved first, draft is a state, only red blocks, documents outrank code, the requirement is the leaf"
state: stated
date: 2026-11-16
intents: [REQ-3.3, REQ-3.4, REQ-3.15, REQ-5, REQ-11.6]
---

# After the ninth run: adoption is reading and onboarding, the premise is approved first, draft is a state, only red blocks, documents outrank code, the requirement is the leaf

## Stated

> Really this means that "adoption" is merely the phase where we read the repository and do the onboarding. Everything else is regular headcanon operation.

> We will create an onboarding [...] and then ask for approval on the premise draft before we do anything else that is compute intensive.

> Redefines, not recuts.

> A draft should have it's own state. [...] Having a draft be its own state marks and explicitly allows for this incompleteness of information.

> Ok, lets try red only. The assumption being that the prioritization algorithm for the resource allocator should already minimize the revision impact anyway.

> The list seems right, and code should not trump document. [...] the document that a human can check is always more important than the code the human can't.

> Code failing against an approved node is not a contradiction. It is a failure in the code, but the system working as intended.

> A leaf should hold only one. If a node has several requirements, then each of these can be their own sub-node.

> I am ok with starting with the simpler case. Occam's razor and all that. [...] register this as an open question, to be answered by experience.

Source: Claude Code session, 2026-11-15 late evening and 2026-11-16, reviewing the ninth Valley run.

## Intent

- **Adoption** is reading the repository and the onboarding: the premise and the principles are drafted and put to the user first, and nothing compute-intensive starts before the premise is approved. Everything after that, drafting guesses to the leaves, reviewing, checking coherence after every change, rebalancing, ranking the user's list, answering and redefining, is regular operation, one loop whatever the source of a change. The onboarding offers two modes: Guided, one level below the last approved node at a time with every level gated on approval; Full-Auto, breadth first to the leaves with no gate after the premise, with an optional cap on agents or spend asked at the start.
- **Vocabulary.** To refine a node is to branch it into children; to redefine a node is to do it again after a change. "Cut" and "recut" are retired everywhere: skills, agents, format rules, check messages, says, the operations log.
- **States.** Five certainty states, stored in the file: draft, assumed, contested, stated, resolved. Draft replaces open and names a node whose definition waits on an issue; stated is the user's words verbatim; resolved is wording the user approved as written; both are approved, and the difference is kept because a later rewrite may paraphrase a resolved node but must quote a stated one, and because stated outranks resolved when they conflict. Blocked, failing and regressed are derived, never stored. Every red state has an issue while a session runs, and the file is the truth.
- **Blocking.** A node is blocked only by a red node: a draft or contested node it requires, or one above it. An unrefined prerequisite orders the work but does not block it. REQ-3.15 is amended accordingly.
- **Precedence in operation.** Documents a user can check outrank code; recency decides between documents only during adoption. In operation, code that disagrees with an approved node is a failure for Writ to show, never a contradiction for the user to arbitrate; code informs the canon only during adoption or through an update of the canon from a repository that changed unobserved. This amends DEC-022's order.
- **The requirement is the leaf.** A leaf holds exactly one requirement, which is its Intent; a node with several refines into one child per requirement; a parent is satisfied when all its children are. A requirement shared by many nodes lives once and is required by edge. Every leaf carries a stable id beside its positional one, so tests and bindings survive a move. Model A, requirements as objects outside the tree, is the open question below. This keeps DEC-021 and makes its derivation literal.
- **Evidence** carries one of three relations to a node: owns, the files the node's module is responsible for, declared at the domain and inherited down; relates, anything about the node; supports, the entry that makes a node, a child, an edge or a requirement exist, which the review's justified test reads.
- **The adjudicator.** The quality rubric is final. When the user's own words fail it, the agent's role is to help them reach a wording that passes; it never overrides them and never keeps a failing wording silently.
- **The user's rank** is impact = 1 + nodes below + rungs still to materialise below + nodes waiting on it; red ranks anywhere and wins ties.

## Why

The ninth run (2026-11-15) drafted 250 nodes before the user had approved the premise, so approving or rewriting it afterwards either did nothing or cascaded through everything; 62 nodes waited on unrefined prerequisites that were never red; the code was right more often than the documents, which is the wrong signal for a tool whose purpose is to catch what the agent built that nobody asked for; and the words cut, open and recut confused the user reading the page.

## Open

- 2026-11-16: model A, requirements as objects with their own ids outside the tree, is re-evaluated when a codebase larger than the test project shows a requirement with no single home.
- 2026-11-16: the refiner's procedure, the ladder of DEC-015 or a proposer-and-judge over candidate axes, is settled by the measured comparison of 2026-11-16.

## Amended

- 2026-11-16, after the story of the system: every node is an intent node and from the capability layer down carries one requirement that its children make more explicit; the leaf is where they coincide, so the tree goes as deep as explicitness allows; `## As built` is retired for `## Implemented by`, the code units bound with implements and the documents that state the node; precedence is only a tie-break for the provisional wording while a contradiction stands, since intent never comes from code and code against a claim is always an issue; unreachable code is orphaned by that fact and raised as an issue for the user.
- 2026-11-18, by DEC-026: the kinds of issue gain impossible, and an implementation agent files issues as the session does; Implemented by is written from the evidence during adoption and kept by the implementation agents; failing and regressed show on the page as one mark, out of sync, beside not built.
