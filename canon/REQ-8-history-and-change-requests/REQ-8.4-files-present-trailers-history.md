---
id: REQ-8.4
parent: REQ-8
title: "Canon files hold the current intent; commit trailers record how and why it changed"
state: stated
source: "docs/design-brief-v0.md:82"
---

# Canon files hold the current intent; commit trailers record how and why it changed

## Stated

> Canon files hold the current intent; commit trailers record how and why it changed

Source: docs/design-brief-v0.md:82

## Intent [assumed]

Squash merges and rebases can collapse or drop trailers, so the files, not the log, are the source of truth for the present.

