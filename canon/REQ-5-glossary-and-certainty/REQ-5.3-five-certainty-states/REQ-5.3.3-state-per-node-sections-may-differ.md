---
id: REQ-5.3.3
parent: REQ-5.3
title: "One state per node; sections may carry their own marker and may be expanded"
state: resolved
source: "Claude Code session, 2026-10-11"
---

# One state per node; sections may carry their own marker and may be expanded

## Stated

> The agent should be able to expand nodes. If "Not this" then that means something in the context of the conversation, and the agent should be able to expand the node with "Not this[the thing that it is not]"

Source: Claude Code session, 2026-10-11

## Intent

The front-matter `state` describes the node as a whole. A body section whose certainty differs carries a bracketed marker on its heading, for example `## Not this [assumed]`. The agent may add sections and extend existing ones with bracketed context drawn from the conversation.

## Resolution

> The state and license are approved also.

Approving the per-section state proposal. Resolved 2026-10-11.

