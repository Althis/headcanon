---
id: REQ-1.3.1
parent: REQ-1.3
title: "The origin field lives on decision records only"
state: resolved
source: "Claude Code session, 2026-10-11"
---

# The origin field lives on decision records only

## Intent

Every caught divergence ends in either a workaround or an intent change, and both produce a decision record. So the field is a front-matter key `origin` on decision records, with the values `misread`, `obstacle` and `side-effect`. Opting out is one configuration flag that stops the agent from asking for it.

## Resolution

> 13. Agreed.

In reply to the proposal above, in the Claude Code session. Resolved 2026-10-11.

## Assumptions

- Decision records that are not divergences (ordinary implementation choices) omit the field. (model assumption)

