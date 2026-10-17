---
id: REQ-6.4
parent: REQ-6
title: "Node file front-matter fields"
state: assumed
source: "docs/design-brief-v0.md:211-234"
---

# Node file front-matter fields

## Proposed in brief

```
```markdown
---
id: REQ-1.2
parent: REQ-1
state: assumed
kind: binary            # binary | numeric | open-ended
steps: [JRN-1/S5]
files: [src/onboarding/setup.ts]
baseline: passing
---

# Team setup can be skipped

## Intent
A new user can reach their first project without creating a team.

## Not this
Removing teams, or hiding the invite flow.

## Assumptions
- "Skip" means deferred until the first invite. (model assumption)
```
```

Source: docs/design-brief-v0.md:211-234

## Intent

Fields: id, parent, state, kind (binary | numeric | open-ended), steps, files, baseline. This canon adds `title` and `source`, and makes `kind` optional; see DEC-005. It also adds `layer` (REQ-6.7); `partition`, the question a node's children answer, written on the node when it is refined (REQ-3.14); and `relates`, `conflicts` and `requires`, lists of node IDs for the typed links (DEC-014, REQ-3.15). In the body, a `## Deferred` section lists, one line each with its origin in parentheses, what a node will hold once it is refined in turn.

## Assumptions

- `title` is in front-matter so the text tree can be rendered without parsing the body. (model assumption)
- `source` records where a stated quote comes from, as a path with a line range or a session reference. (model assumption)

