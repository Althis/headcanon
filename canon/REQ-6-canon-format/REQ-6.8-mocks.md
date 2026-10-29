---
id: REQ-6.8
parent: REQ-6
title: "A mock is an HTML page in a folder, with an element table that binds its parts to requirements"
state: assumed
layer: requirement
source: "Claude Code session, 2026-10-18"
requires: [REQ-6.6, REQ-4.3]
files: [packages/canon/src/types.ts, packages/canon/src/parse.ts, packages/canon/src/load.ts, packages/canon/src/check.ts, packages/canon/src/ui/server.ts, skills/refine/reference.md]
---

# A mock is an HTML page in a folder, with an element table that binds its parts to requirements

## Stated

> In the case of UX, the behaviour is canonized with an open source mock-up format, like those that can be acquired from figma or other design platforms. Do research and find a format that could serve us well.

> The mock also becomes the artifact that binds all these requirements together.

> In that case lets use html and css as the foundation. As far as I know, Figma allows you to export CSS and HTML, so that should be compatible to that workflow as well. In this way, we instruct our agent to mock with HTML and CSS, and we also prepare to accept ready pre-made artifacts of UX intent via the HTML and CSS exports figma makes.

Source: Claude Code session, 2026-10-18.

## Intent [assumed]

A mock is an intent record for one thing a person will see: a screen, a panel, a card, a control or a message, at the fidelity the question needs. It lives in `canon/mocks/` as a record and a folder with one stem: `MOCK-3-node-card.md`, and `MOCK-3-node-card/` holding `index.html` with the stylesheets, images and fonts the page uses, nothing outside the folder. The record's front-matter carries `id`, `title`, `state`, `source`, `page` when the page is not `index.html` in that folder, and `needs`, the libraries the page relies on and the viewer provides: `tailwind` and `lucide`. Its body holds an element table in the shape of a journey's step table (REQ-4.3): one row per element, written `#finish Finish button`, the row's state, and the requirements the element carries. An element is a part of the page that carries an `id` or a `data-el` attribute, which is what a requirement names as `MOCK-3#finish` and what the viewer lights. The page is static HTML and CSS: layout in flexbox and grid, Figma variables as custom properties, fonts by name, icons and images as files in the folder or inline SVG, and a narrow width that shows how the page responds.

The table is the binding. A requirement that describes something visible stands in the row of the element it describes, and a node may point back with `mocks: [MOCK-3#finish]`. A mock carries the five certainty states: a page the human wrote or brought is stated, the agent's page is assumed, an agreed one is resolved, and an empty section that asks what belongs there is open. The check reports a row that names an unknown requirement, a node that names an unknown mock or element, a page that is missing, and a need the viewer does not provide.

## Not this

- A picture as the record: a screenshot records state, not intent (REQ-3.9), and an SVG or bitmap exported from a tool goes inside the page as an image.
- A framework application as the record: React, Vue or Svelte output from Figma or a plugin is a source the agent flattens into the page; the viewer runs no framework.
- A design file as the record: a `.fig`, `.penpot` or `.pen` source may travel in the folder, and the canon reads only the page and the table.

## Assumptions

- One mock per screen. A second state of the same screen, empty, loading or failed, is a second section of the page with its own id when it changes what is seen, and a row in the table when it does not; a narrower window is seen by resizing the frame, never drawn twice. (model assumption)
- A requirement bound to an element names the element in its `source`, for example `MOCK-3#finish (consequence of 'the human is done')`. (model assumption)
- A page from Figma enters as its tool exported it, with ids added to the elements the table names and its assets copied into the folder; the record's `source` names the export. (model assumption)
