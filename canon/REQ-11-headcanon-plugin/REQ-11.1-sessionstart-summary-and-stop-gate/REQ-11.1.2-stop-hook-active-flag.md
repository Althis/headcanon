---
id: REQ-11.1.2
parent: REQ-11.1
title: "A gate that blocks a stop ends by itself: the Stop hook checks stop_hook_active, the gate on an implementation agent has a retry budget"
state: assumed
source: "docs/design-brief-v0.md:485"
---

# A gate that blocks a stop ends by itself: the Stop hook checks stop_hook_active, the gate on an implementation agent has a retry budget

## Proposed in brief

> - A Stop hook that blocks can loop forever, so it must check the `stop_hook_active` flag.

Source: docs/design-brief-v0.md:485

## Intent

The session's Stop hook checks the `stop_hook_active` flag. The gate on an implementation agent blocks while the tests of its boxes fail, and lets the agent go in two cases: each box still failing has an issue the agent filed, or a further attempt left the same tests failing with the retry budget spent, and the gate then files an issue of the kind impossible on each failing box (DEC-026).

