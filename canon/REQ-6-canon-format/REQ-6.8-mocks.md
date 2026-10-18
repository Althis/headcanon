---
id: REQ-6.8
parent: REQ-6
title: "A mock is an SVG picture with an element table that binds its parts to requirements"
state: assumed
layer: requirement
source: "Claude Code session, 2026-10-18"
requires: [REQ-6.6, REQ-4.3]
files: [packages/canon/src/types.ts, packages/canon/src/parse.ts, packages/canon/src/load.ts, packages/canon/src/check.ts, skills/refine/reference.md]
---

# A mock is an SVG picture with an element table that binds its parts to requirements

## Stated

> In the case of UX, the behaviour is canonized with an open source mock-up format, like those that can be acquired from figma or other design platforms. Do research and find a format that could serve us well.

> The mock also becomes the artifact that binds all these requirements together.

Source: Claude Code session, 2026-10-18.

## Intent [assumed]

A mock is an intent record for one thing a person will see: a screen, a panel, a card, a control or a message, drawn at the fidelity the question needs. It lives in `canon/mocks/` as two files with one stem: the picture, `MOCK-3-node-card.svg`, and the record, `MOCK-3-node-card.md`. The record's front-matter carries `id`, `title`, `state`, `source` and `image`; its body holds an element table in the shape of a journey's step table (REQ-4.3): one row per element, written `#finish Finish button`, the row's state, and the requirements the element carries. An element is a part of the picture that has an `id` attribute in the SVG, which is what a requirement names as `MOCK-3#finish` and what the page lights. A drawing made in a design tool keeps the tool's own file inside the SVG when the tool embeds it, or beside it under the same stem.

The table is the binding. A requirement that describes something visible stands in the row of the element it describes, and a node may point back with `mocks: [MOCK-3#finish]`. A mock carries the five certainty states: a picture the human drew or brought is stated, the agent's drawing is assumed, an agreed one is resolved, and an empty frame that asks what belongs there is open. The check reports a row that names an unknown requirement, a node that names an unknown mock or element, and a picture file that is missing.

## Not this

- A screenshot of the running product, which records state, not intent (REQ-3.9).
- A design file as the record: a `.penpot`, `.pen`, `.excalidraw` or `.drawio` source may travel with the picture, and the canon reads only the SVG and the table.

## Assumptions

- One mock per screen. A second state of the same screen, empty, loading or failed, is a second frame in the same picture, a group with its own id, when it changes what is seen, and a row in the table when it does not. (model assumption)
- A requirement bound to an element names the element in its `source`, for example `MOCK-3#finish (consequence of 'the human is done')`. (model assumption)
- The page places the SVG inline with scripts and event attributes stripped. (model assumption)
