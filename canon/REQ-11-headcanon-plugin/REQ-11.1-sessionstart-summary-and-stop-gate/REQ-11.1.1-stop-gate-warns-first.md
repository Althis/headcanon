---
id: REQ-11.1.1
parent: REQ-11.1
title: "The session's Stop gate ships in warn mode and blocks only once its checks prove accurate; the gate on an implementation agent blocks"
state: resolved
source: "Claude Code session, 2026-10-11"
---

# The session's Stop gate ships in warn mode and blocks only once its checks prove accurate; the gate on an implementation agent blocks

## Intent

In warn mode the session's gate appends its findings to the transcript but lets the agent stop. It switches to blocking once the checks are accurate enough that false positives would not train the user to ignore it. The gate on an implementation agent is another gate and blocks: its checks are the tests HeadCanon recorded for the agent's boxes, and it lets the agent stop only when they pass or each box still failing has an issue waiting on the human (DEC-026).

## Resolution

> For 11 let's try your recommendation.

Claude Code session, 2026-10-11. Resolved 2026-10-11.

## Assumptions

- The resolution covers the session's gate. The sentence on the implementation agent's gate was added on 2026-11-18 from DEC-026, whose quoted words hold those agents at the stop. (model assumption)

