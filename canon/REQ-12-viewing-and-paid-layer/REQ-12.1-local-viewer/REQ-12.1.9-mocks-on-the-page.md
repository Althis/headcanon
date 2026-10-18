---
id: REQ-12.1.9
parent: REQ-12.1
title: "Mocks on the page: a Mocks view, a mock beside the question that asks about it, and elements lit from their requirements"
state: assumed
layer: requirement
source: "Claude Code session, 2026-10-18"
requires: [REQ-6.8, REQ-12.1.7]
files: [packages/canon/public/app.js, packages/canon/public/index.html, packages/canon/public/style.css, packages/canon/src/ui/server.ts, packages/canon/src/session.ts, packages/canon/src/mcp.ts]
---

# Mocks on the page: a Mocks view, a mock beside the question that asks about it, and elements lit from their requirements

## Intent [assumed]

The viewer shows mocks the way it shows journeys (REQ-12.1.5). A Mocks view lists every mock with its picture and its element table; pointing at a row lights its element in the picture, and pointing at an element lights its rows. A requirement's page lists the mocks it is seen in. A question from the session may carry a mock, shown above the options, and a draft picture, shown beside the current one, which is how a mock is agreed (REQ-3.16) and how a revision is accepted (REQ-8.8). The session points the human at a mock as it points at a node.

## Not this

- Drawing in the page: the picture is edited in a design tool or by the agent; the page shows, lights and asks.

## Assumptions

- The viewer serves the picture from the canon folder and places it inline, so its elements are reachable; a draft arrives inline with the question and reaches the disk only when it is accepted. (model assumption)
