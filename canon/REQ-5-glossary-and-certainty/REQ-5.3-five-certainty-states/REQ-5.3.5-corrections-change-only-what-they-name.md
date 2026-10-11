---
id: REQ-5.3.5
parent: REQ-5.3
title: "A correction changes only what it names; the human's reasons never enter the draft"
state: stated
source: "Claude Code session, 2026-10-11"
files: [packages/canon/src/rules.ts, skills/adopt/SKILL.md, skills/review/SKILL.md]
---

# A correction changes only what it names; the human's reasons never enter the draft

## Stated

> Once again you over-corrected. Remove the last sentence please.

Source: The Valley adopt session, 2026-10-11, after the agent folded the human's explanation of a correction into the non-goal it was correcting.

> The behaviour of the agent continues to overcorrect, is there anything we can do to help with that? Perhaps this doesn't live in the skill itself but rather in a rule since this is a pretty global behaviour that we want to curtail for the workflow we want.

Source: Claude Code session, 2026-10-11.

## Intent [assumed]

A typed correction has two parts: what to change, and why. The agent makes the smallest edit to its draft that satisfies the words naming the change, then shows the result for approval. The reasons the human gave are kept verbatim in the Stated quote, where they explain the change, and are never paraphrased into the draft itself. The agent adds nothing the correction did not name: no extra clauses, no reorganization, no restatement of the reason as content.

The behavior is global, so it is one line in the rules injected every session, and the adopt and review skills repeat it where corrections are handled.

## Not this [assumed]

Ignoring the reason. It is recorded, and it may change how the agent drafts the next item; it just does not become text in this one.

## Assumptions

- "Smallest edit" is judged against the human's words, not against what the agent thinks they meant; when the words are ambiguous, the agent asks rather than guessing larger. (model assumption)
- This is the certainty rule's twin: stated is only their words, and a correction is only their words too. (model assumption)
