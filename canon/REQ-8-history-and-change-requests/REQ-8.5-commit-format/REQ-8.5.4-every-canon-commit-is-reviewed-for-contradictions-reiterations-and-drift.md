---
id: REQ-8.5.4
parent: REQ-8.5
title: "Every canon commit passes a semantic review for contradictions, reiterations and drift"
state: stated
source: "Claude Code session, 2026-10-11"
files: [packages/canon/src/review.ts, agents/verifier.md, skills/commit/SKILL.md]
---

# Every canon commit passes a semantic review for contradictions, reiterations and drift

## Stated

> The pre-commit SHOULD notice the same idea written in different words! This is super important! This is intent rebalancing/revision! This should be an integral part of the commit loop by checking the tree for contradictions, reiterations and drift!

Source: Claude Code session, 2026-10-11.

## Intent [assumed]

Before a canon change is committed, a verifier agent separate from the committing agent reads the staged canon diff against the rest of the tree and the root README and reports three kinds of finding: a contradiction, where two entries cannot both hold; a reiteration, where an entry says what another already says in different words, or restates its parent; and drift, where an entry departs from a principle. The committing agent puts every finding to the human as a question, with merging, keeping or contesting as the choices, applies the answers, and records the review with its resolutions. The record is pinned to a hash of the staged canon diff. The commit-msg hook refuses a canon commit whose diff has no record or whose record has an unresolved finding, and requires an Intent-Review trailer naming the hash and the outcome, so the log shows that the review happened.

The verifier reviews entries, never code, and proposes no new content. The deterministic append check remains beside it.

## Not this [assumed]

A model call inside the hook. The shared CLI never calls a model; the hook enforces that a review happened by checking the record and its hash.

## Assumptions

- A review is required for any new canon file or for five or more changed canon lines; a one-line fix passes without one. (model assumption)
- The record is written by the committing agent after the human has resolved the findings; the verifier's independence lies in finding, not in recording. Writ in CI remains the independent gate. (model assumption)
- The verifier inherits the session's model; running it on a different model, as the brief suggests for Writ, is a later choice. (model assumption)
- Records live under the repository's `.git` directory and are not committed. (model assumption)
