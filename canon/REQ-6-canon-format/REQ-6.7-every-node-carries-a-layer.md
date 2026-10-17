---
id: REQ-6.7
parent: REQ-6
title: "Every node carries a layer: domain, capability or requirement"
state: resolved
source: "Claude Code session, 2026-10-11"
files: [packages/canon/src/types.ts, packages/canon/src/load.ts, packages/canon/src/check.ts, packages/canon/src/tree.ts, packages/canon/public/app.js, skills/adopt/reference.md]
---

# Every node carries a layer: domain, capability or requirement

## Intent

The tree has one node type, and the layer is a field on it. A node's front-matter carries `layer: domain`, `layer: capability` or `layer: requirement`; IDs and the folder mirror are unchanged. The text tree, the viewer, the session context and Writ's report show the layer, so a reader knows at a glance what kind of thing they are approving. The check uses explicit layers: a capability with nothing under it is reported as uncovered, which is a different finding from a requirement with no test, and a child whose layer is above its parent's is an error. A node without the field has its layer inferred from depth for display only, and the check notes once how many nodes were inferred.

## Resolution

> Very good analysis. I approve your decision. Please enshrine it.

Claude Code session, 2026-10-11, approving the recommendation in DEC-013. Resolved 2026-10-11.

## Assumptions

- HeadCanon's own canon predates the layer model and keeps inferred layers until a rebalancing pass sets them by hand. (model assumption)
- A small project whose premise needs fewer than about eight areas has `layer: capability` at the top level and no domain layer. (model assumption)
