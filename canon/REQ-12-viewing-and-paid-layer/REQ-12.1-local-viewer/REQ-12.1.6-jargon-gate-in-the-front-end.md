---
id: REQ-12.1.6
parent: REQ-12.1
title: "A term new to a draft is gated in the page: a span with a tooltip, a check that enshrines it, a cross that removes it"
state: stated
layer: requirement
source: "Claude Code session, 2026-10-11"
files: [packages/canon/public/app.js, packages/canon/src/terms.ts]
---

# A term new to a draft is gated in the page: a span with a tooltip, a check that enshrines it, a cross that removes it

## Stated

> Whenever a jargon is introduced to a draft, span it and on hover open a tooltip with the explanation with a checkmark and X symbol. With the checkmark it becomes enshrined into the glossary. With the X it gets deleted and the user can write a new term.

Source: Claude Code session, 2026-10-11.

## Intent [assumed]

When a draft shown in the page uses a term that is not in the glossary, the term is marked as a span. Hovering opens the agent's guessed definition with two controls. The check writes the term and its definition into the glossary at once and records the change for the session. The cross removes the term from the draft and opens a field for the word the human wants instead; the draft is reworded with it. A draft is approvable only when no span is unresolved. The candidate terms come from a deterministic detector the agent runs on its draft, so the gate cannot be skipped.

## Assumptions

- The detector marks capitalized words away from a sentence start, code-formatted tokens and quoted phrases that the glossary does not define; the agent supplies each guessed definition. (model assumption)
- A term enshrined by the check is approved by the human, so it is resolved, and the entry is the agent's wording. (model assumption)
