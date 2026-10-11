---
id: REQ-11.1
parent: REQ-11
title: "SessionStart summary instead of editing CLAUDE.md; Stop hook as the \"done\" gate"
state: assumed
source: "docs/design-brief-v0.md:110"
---

# SessionStart summary instead of editing CLAUDE.md; Stop hook as the "done" gate

## Proposed in brief

> SessionStart summary instead of editing CLAUDE.md; Stop hook as the "done" gate

Source: docs/design-brief-v0.md:110

## Intent

The plugin does not edit the user's CLAUDE.md. A static file drifts; the SessionStart summary is regenerated every session. The Stop hook checks the agent's "done" claim against the intent report before it can stop.

