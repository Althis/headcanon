---
id: REQ-12.1.9
parent: REQ-12.1
title: "Mocks on the page: a Mocks view with width presets, a mock beside the question that asks about it, and elements lit from their requirements"
state: assumed
layer: requirement
source: "Claude Code session, 2026-10-18"
requires: [REQ-6.8, REQ-12.1.7]
files: [packages/canon/public/app.js, packages/canon/public/index.html, packages/canon/public/style.css, packages/canon/src/ui/server.ts, packages/canon/src/session.ts, packages/canon/src/mcp.ts]
---

# Mocks on the page: a Mocks view with width presets, a mock beside the question that asks about it, and elements lit from their requirements

## Intent [assumed]

The viewer shows mocks the way it shows journeys (REQ-12.1.5). A Mocks view lists every mock with its page running in a frame and its element table under it; pointing at a row lights its element in the page, pointing at an element lights its rows, and width presets, phone, tablet, laptop and fit, show how the page responds. A requirement's page lists the mocks it is seen in. A question from the session may carry a mock, shown above the options, and a draft page, shown beside the current one, which is how a mock is agreed (REQ-3.16) and how a revision is accepted (REQ-8.8). The session points the human at a mock as it points at a node.

## Not this

- Drawing or editing in the viewer: a page is written by the agent or exported from a design tool; the viewer shows, lights and asks.

## Assumptions

- The viewer runs the page in a sandboxed frame with an opaque origin, handing it the page as one document with the folder's files bundled in, a bridge script for lighting and sizing, and a script tag per declared need; such a frame can load public libraries and fonts but nothing from the viewer, and a request from it to change the canon or the session is refused. The page opens on its own in a tab from the same route, with its files beside it. (model assumption)
- A draft arrives inline with the question as a complete page and reaches the disk only when it is accepted. (model assumption)
