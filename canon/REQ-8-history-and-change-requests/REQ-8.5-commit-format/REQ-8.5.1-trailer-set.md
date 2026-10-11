---
id: REQ-8.5.1
parent: REQ-8.5
title: "Trailers: Intent, Intent-Change, Decision, Test-Change, Approved-By"
state: resolved
source: "docs/design-brief-v0.md:318-324"
---

# Trailers: Intent, Intent-Change, Decision, Test-Change, Approved-By

## Proposed in brief

> | Trailer | When | Value |
> | --- | --- | --- |
> | Intent | Always | One or more requirement or journey IDs, or `none` plus a reason |
> | Intent-Change | A canon node was created, updated or deleted | Operation and ID, one trailer per operation |
> | Decision | A decision record was added | Decision ID |
> | Test-Change | A test was weakened or removed, or its data changed | Test ID and the intent change it cites |
> | Approved-By | Any Intent-Change or Test-Change | The approving human |

Source: docs/design-brief-v0.md:318-324

## Intent

The five trailers from the brief, unchanged. Approved-By takes the approver's git `user.name`.

## Resolution

> In regards to trailers, I still don't get why these are called "trailers", but that said, I agree on what the trailers you decided are.

Claude Code session, 2026-10-11. The git-username as the Approved-By value came from the answer to question 9: "The git-username. This whole system expects Git and cannot work without it." Resolved 2026-10-11.

## Assumptions

- A commit on a branch that is awaiting review cannot yet carry a real approver. Until the rule is settled, such commits carry `Approved-By: pending (<how approval is being sought>)`, and merging to main supplies the approval. See DEC-006. (model assumption)

