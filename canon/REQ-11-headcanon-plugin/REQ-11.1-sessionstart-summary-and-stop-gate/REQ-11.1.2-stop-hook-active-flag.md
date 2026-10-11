---
id: REQ-11.1.2
parent: REQ-11.1
title: "A blocking Stop hook must check stop_hook_active"
state: assumed
source: "docs/design-brief-v0.md:485"
---

# A blocking Stop hook must check stop_hook_active

## Proposed in brief

> - A Stop hook that blocks can loop forever, so it must check the `stop_hook_active` flag.

Source: docs/design-brief-v0.md:485

