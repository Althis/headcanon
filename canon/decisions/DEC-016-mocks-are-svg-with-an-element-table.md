---
id: DEC-016
title: "A mock is kept as SVG with a Markdown element table; the design tool's own file travels inside or beside it"
state: assumed
date: 2026-10-18
intents: [REQ-6.8, REQ-3.16, REQ-12.1.9, REQ-6]
---

# A mock is kept as SVG with a Markdown element table; the design tool's own file travels inside or beside it

## Why

The human asked for an open mock-up format "like those that can be acquired from figma or other design platforms". The research in `docs/research/2026-10-18-ux-mock-formats.md` found no open design-file format that the platforms share. Figma's file is proprietary and undocumented. Penpot's is open and reachable from Figma through an exporter plugin, but it is a zip of JSON files that git cannot diff and that only Penpot renders. The agent-era JSON formats, pen.dev's `.pen`, OpenPencil's `.op` and Excalidraw's `.excalidraw`, are text a model writes well, but nothing renders them without their tool, and the first two are months old, one of them under a proprietary application that reserves breaking changes. The one format every platform exports and everything that reads the canon already renders is SVG: the format REQ-6 asks for, text that git diffs, and one that Figma and Penpot import again as editable layers. Two tools already show the shape chosen here: draw.io's editable SVG and Excalidraw's export with the scene embedded are pictures that render anywhere and carry their editable source inside.

So the canon keeps the picture as SVG and the binding as a Markdown table beside it, in the shape of a journey's step table, so that one parser, one check and one page serve journeys and mocks alike. The design tool's own file is welcome inside the SVG or beside it under the same stem; the canon never reads it. The agent draws its own mocks as plain SVG from a small kit of shapes, which needs no tool and keeps every element addressable; a designer's export enters as it is, with layer names as ids where the tool offers that, as Figma does.

Rejected: Penpot's file as the record, which is not diffable, renders only in Penpot and is heavy for the agent to write; Excalidraw's JSON as the record, which renders nowhere without an export step whose SVG carries no element ids; pen.dev, a proprietary application with a format in flux; tldraw, which is not under an open licence; PlantUML Salt, which has no element identity and no way back into a design tool; screenshots and HTML prototypes, which record state and code rather than intent.

## Open

- 2026-10-18: whether designers accept an SVG kit drawn by the agent as a starting point, or always bring their own export; the first run with a visual node decides.
