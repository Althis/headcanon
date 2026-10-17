---
id: REQ-9.18
parent: REQ-9
title: "Writ judges requirements against the principles with a model and surfaces drift for approval"
state: stated
source: "Claude Code session, 2026-10-11"
---

# Writ judges requirements against the principles with a model and surfaces drift for approval

## Stated

> they should be checks the engine checks requirements against with an LLM judge to guarantee there is no drift, and if there is drift,  that the human approves it.

Source: Claude Code session, 2026-10-11.

## Intent [assumed]

Writ's intent check (REQ-9.2, stage 1) compares every requirement a change request creates or updates against the principles in the root README, using the user-supplied model (REQ-2.5). For each requirement it reports which principles it upholds and which it drifts from, with a justification, as part of the review report that is the audit trail (REQ-9.16). Drift blocks the check until the human approves it; approving drift is an intent change (REQ-8.1) that updates the principle or the requirement and is recorded in the history. HeadCanon performs the same judgment in the session when proposing a change request, as an early warning; Writ is the gate (REQ-9.13).

## Not this [assumed]

Judging code against principles. Principles meet code only through the requirements they govern.

## Assumptions

- The judge sees the full principle list and the changed requirements with their ancestors, not the whole tree, following the scoping rule in REQ-10.5. (model assumption)
- A drift verdict is a warning in HeadCanon and a failure in Writ until approved. (model assumption)
