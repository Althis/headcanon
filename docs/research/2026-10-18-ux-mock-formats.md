# Which mock-up format should carry visual intent in a canon?

Research note, 2026-10-18. Question: is there an open mock-up format that design platforms such as Figma export, that git and GitHub handle as text, that an agent can write from a conversation, and in which a requirement can point at one part of the picture? Gathered from primary sources where they could be read; claims carry their URL. Items marked "not confirmed" could not be read at the source.

## What the canon asks of the format

Drawn from the canon's own rules, so the formats are judged against them and not against taste:

1. **Renders where the canon is read**: GitHub, IDE previews, the local viewer, an agent's context, with no build step (REQ-6, stated and decided in the brief).
2. **Text that git diffs**, one object per file (REQ-6.1, REQ-8.1).
3. **Open**: a published format and at least one tool under an OSI licence that reads and writes it (REQ-13.1).
4. **An agent can write it** from a conversation, without a graphical tool, since adoption drafts the whole canon (REQ-11.6.3).
5. **A designer can produce it** from Figma or another platform, and open it again in a tool of their choice.
6. **Elements are addressable**: a requirement can name the part of the picture it is about, and the page can light that part.
7. **The source survives**, so a later revision edits the drawing instead of redrawing it (REQ-8.8).

## Findings by format

**SVG (W3C).** The one format every design platform exports and every browser, GitHub and IDE preview renders. Figma's export carries layer names as `id` attributes only when the `svgIdAttribute` setting is on; it is off by default and duplicate names get `_2`, `_3` suffixes (https://developers.figma.com/docs/plugins/api/ExportSettings; https://forum.figma.com/t/export-pdf-is-there-a-way-to-preserve-the-names-of-the-layers/54284). A long-standing bug with invalid id attributes in Figma's SVG export is mentioned in a support reply: not confirmed. Figma and Penpot import SVG back as editable layers; Excalidraw and draw.io import it as an image only (Penpot's SVG import: not read at the source). SVG is a drawing, not a design file: it has no components, layout or states of its own, and an exported SVG is verbose, so diffs are long.

**Excalidraw `.excalidraw`.** MIT (https://github.com/excalidraw/excalidraw/blob/master/LICENSE). A JSON document: `type`, `version`, `source`, `elements`, `appState`, `files` (https://docs.excalidraw.com/docs/codebase/json-schema). Every element carries `id`, `type`, position and size, `groupIds`, `frameId`, `boundElements`, `link: string | null`, `locked`, and an optional `customData?: Record<string, any>`; the element types are rectangle, diamond, ellipse, text, arrow, line, freedraw, image, frame, magicframe, embeddable, iframe and stickynote (https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/types.ts). The flat element list is the easiest of the formats for a model to write, and the hand-drawn rendering says "sketch, not pixels" on its own. Nothing renders the JSON without Excalidraw: `exportToSvg` runs in a browser and can embed the scene in the SVG (`appState.exportEmbedScene`), so the picture reopens in Excalidraw (https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/export); a Node port exists (https://github.com/JRJurman/excalidraw-to-svg). The SVG renderer writes no element ids (a `data-id` only in tests) but wraps a linked element in `<a href>` (https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/renderer/staticSvgScene.ts). No import from Figma.

**draw.io `.drawio` and `.drawio.svg`.** Apache-2.0 (https://github.com/jgraph/drawio). The native file is mxGraph XML; the editor saves an "editable SVG" with the diagram XML embedded, so one file both renders as an image and opens again in draw.io (https://www.drawio.com/doc/faq/save-file-formats; https://www.drawio.com/doc/faq/export-to-svg). The VS Code extension calls these files "perfectly valid svg/png-images that contain an embedded Draw.io diagram" and notes they embed in GitHub READMEs (https://github.com/hediet/vscode-drawio). A mockup stencil library, `mxgraph.mockup.*`, holds about a hundred interface components, and draw.io publishes a style reference aimed at generating files with AI (https://www.drawio.com/doc/faq/drawio-style-reference: listed, not read). A code search of jgraph/drawio for `data-cell-id` on 2026-10-18 returned nothing, so the exported SVG does not appear to name its cells; the identity lives in the embedded XML. No import from Figma; re-embedding after an edit needs the desktop or web application.

**Penpot `.penpot`.** The application is MPL-2.0 (https://github.com/penpot/penpot). The current format, v3, is a zip: `manifest.json` at the root, each page's shapes as individual JSON files under `files/`, media as binaries under `objects/`; v1 was a binary and v2 a SQLite file never released (https://help.penpot.app/technical-guide/developer/data-model/penpot-file-format/; https://help.penpot.app/user-guide/export-import/penpot-file-format/). The authoritative schema is the Clojure spec in the repository's `common` module. Figma files reach Penpot through the open-source Penpot Exporter plugin, which writes a `.penpot` from inside Figma (https://www.figma.com/community/plugin/1219369440655168734/penpot-exporter; https://github.com/penpot/penpot-exporter-figma-plugin), and through third-party converters (https://github.com/betagouv/figpot); Penpot's community says there is no native `.fig` import (https://community.penpot.app/t/can-i-transfer-a-figma-project-to-penpot/276). Penpot exports SVG, PNG, PDF and JPEG. Whether its SVG export carries layer names: a community request suggests it does not (https://community.penpot.app/t/export-object-group-names-in-svg-format/646), not confirmed.

**Sketch `.sketch`.** A zip of JSON files (`meta.json`, `document.json`, `user.json`, `pages/*.json`, `images/`), documented with a public JSON Schema and TypeScript types (https://developer.sketch.com/file-format/). The application is proprietary and macOS only; the page states no licence for the specification.

**pen.dev `.pen` (formerly Pencil).** "Just a JSON file that allows agents to work with it natively", "Schema fully opened", with a local MCP server and a CLI, import of `.fig` files, and export to PDF, PNG, JPEG, WEBP and HTML/CSS (https://www.pen.dev/). The format reference (version 2.21) describes an object tree of frames, rectangles, text, groups, paths and `ref` instances of `reusable` objects, every object with an `id` unique in the document, flex-style layout and typed variables; it also says "we reserve the right to introduce breaking changes in the .pen format" and "Use pen.dev, its MCP tools, or the CLI to make changes instead of editing serialized IDs and references by hand" (https://docs.pen.dev/for-developers/the-pen-format). The application is under an EULA; no source licence is stated. OpenPencil is an MIT editor that imports `.fig`, uses `.pen` only for UI kits and keeps its own `.op` JSON as the native format (https://github.com/ZSeven-W/openpencil). Both are months old.

**OpenDesign.** Apache-2.0 desktop application whose projects "live in a folder on your computer as HTML, CSS, and related files"; the agent writes an HTML prototype; no Figma export (https://open-design.ai/). It shows one more answer to the question, the prototype itself as the record, which the canon excludes because code records state rather than intent (REQ-3.9).

**tldraw `.tldr`.** JSON, but the SDK is source-available under a licence that requires a watermark and is "not Open Source by any definition" in its own words (https://tldraw.dev/legal/tldraw-license). Excluded by the third criterion.

**PlantUML Salt.** A text wireframe language rendered by PlantUML, "function ahead of looks" (https://plantuml.com/salt). A model writes it easily; it has no element identity, no positions a requirement can name, and no way back into a design tool.

**Figma `.fig`.** Proprietary and undocumented. The ways out are the REST API's JSON, which needs an account and a token; the SVG, PDF and PNG exports; the Penpot Exporter plugin; and the `.fig` importers of pen.dev and OpenPencil.

**Design Tokens (DTCG) 2025.10.** The first stable version of the Design Tokens Format Module, a JSON format for colours, type and spacing, published 2025-10-28 as a W3C Community Group final report, not a W3C standard (https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/; https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/). It carries a design system's values, not a picture; a complement to a mock format, not a candidate.

## Against the canon's needs

| Format | 1 renders | 2 text | 3 open | 4 agent writes | 5 from Figma | 6 elements | 7 source kept |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SVG | yes | yes, verbose | yes | yes | export; ids opt-in | `id` attributes | only with an embedded scene |
| Excalidraw | no, needs export | yes | yes, MIT | best | no | in JSON, not in SVG | embedded on export |
| draw.io `.drawio.svg` | yes | yes | yes, Apache | yes, XML | no | in XML, not in SVG | inside the SVG |
| Penpot v3 | no | zip | yes, MPL | hard | via plugin | yes, in JSON | the file itself |
| Sketch | no | zip | spec only | hard | no | yes, in JSON | the file itself |
| pen.dev | no | yes | app no, schema shown | yes, by its tools | import | yes | the file, breaking changes reserved |
| Salt | via PlantUML | yes | yes | yes | no | no | n/a |
| HTML prototype | yes | yes | n/a | yes | no | yes | it is the code |

## Synthesis

No open design-file format is shared across the design platforms. Figma's is closed; Penpot's is open but a zip that only Penpot renders; the agent-era JSON formats are text a model writes well, but nothing renders them without their tool, and the youngest of them is under a proprietary application that reserves breaking changes. The one format that every platform exports, that everything reading the canon already renders, and that Figma and Penpot import again as editable layers, is SVG. Two tools already show the shape that satisfies every criterion at once: draw.io's editable SVG and Excalidraw's export with the scene embedded are pictures that render anywhere and carry their own source inside.

What follows for the canon is a picture in SVG with its binding kept beside it in Markdown, in the shape a journey already uses, so that the design tool's file is welcome inside or beside the picture but never has to be read. An agent draws its own mocks as plain SVG from a small kit of shapes, which needs no tool and keeps every element addressable; a designer's export enters as it is, with layer names as ids where the tool offers that. Recorded as DEC-016.

## What the research did not settle

- Whether draw.io's or Penpot's SVG exports can be made to name their elements; both would otherwise need the ids added by hand or read from the embedded source.
- Whether designers accept a plain SVG kit drawn by the agent as a starting point, or always bring their own export. The first adoption run with a visual node decides.
- How much of a design system's vocabulary (tokens, components) the binding needs; the DTCG format is the candidate when it does.
