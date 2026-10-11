---
id: REQ-6.3
parent: REQ-6
title: "Folder layout: root README, one folder per branch, journeys/, decisions/"
state: assumed
source: "docs/design-brief-v0.md:196-209"
---

# Folder layout: root README, one folder per branch, journeys/, decisions/

## Proposed in brief

```
```
canon/
├─ README.md                       project purpose + Glossary
├─ REQ-1-onboarding/
│  ├─ README.md                    REQ-1
│  ├─ REQ-1.1-fast-signup.md
│  └─ REQ-1.2-skip-team-setup.md
├─ journeys/
│  └─ JRN-1-first-project.md
└─ decisions/
   └─ DEC-014-defer-team-setup.md
```
```

Source: docs/design-brief-v0.md:196-209

## Intent

This canon follows that layout. A node with children is a folder whose README.md is the node; a leaf is a single file.

