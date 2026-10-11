---
id: REQ-12.1.5
parent: REQ-12.1
title: "Journeys, decisions and glossary have their own pages"
state: assumed
source: "Claude Code session, 2026-10-11"
files: [packages/canon/public/app.js]
---

# Journeys, decisions and glossary have their own pages

## Intent

The human did not ask for these pages; the agent added them because the four requested views link to journeys, decisions and terms, and a link needs somewhere to land. Journeys render their Mermaid flowchart and their step table with each step's linked requirements. Decisions list with state, origin and the intents they serve, and open to their full record. The glossary lists every term with its ID and definition.

## Not this

Editing. These pages read the canon; changes still go through change requests.

## Assumptions

- Mermaid is loaded from a CDN when online and falls back to the graph's source text offline. (model assumption)
- A journey step whose linked requirement does not exist is marked missing inline, mirroring the check's link-unknown error. (model assumption)
