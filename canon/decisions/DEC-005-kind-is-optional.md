---
id: DEC-005
title: "`kind` is optional in node front-matter; absent means not yet refined to a measurable leaf"
state: assumed
date: 2026-10-11
intents: [REQ-3.3, REQ-6.4]
---

# `kind` is optional in node front-matter; absent means not yet refined to a measurable leaf

## Why

Most nodes seeded from the brief are design constraints, not yet measurable. Forcing a `kind` on them would misrepresent their certainty. A node without `kind` renders as untested, which matches REQ-3.3: a node that is not binary yet is simply not a leaf yet.
