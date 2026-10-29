---
id: DEC-019
title: "A mock is an HTML and CSS page: the agent writes one, and Figma's exports enter as one"
state: resolved
date: 2026-10-18
intents: [REQ-6.8, REQ-3.16, REQ-12.1.9, REQ-6]
origin: misread
---

# A mock is an HTML and CSS page: the agent writes one, and Figma's exports enter as one

## Resolution

> In that case lets use html and css as the foundation. As far as I know, Figma allows you to export CSS and HTML, so that should be compatible to that workflow as well. In this way, we instruct our agent to mock with HTML and CSS, and we also prepare to accept ready pre-made artifacts of UX intent via the HTML and CSS exports figma makes.

Claude Code session, 2026-10-18.

## Why

The first proposal, DEC-016, kept the picture as SVG with a Markdown element table beside it, chosen for openness and for rendering wherever the canon is read. The human asked two questions it had not weighed. How would relative size, position and responsive behaviour be carried? SVG is absolute geometry with no constraints and no breakpoints, so that intent would have lived in words and in extra drawings. And who holds the design files? The measured answer, in `docs/research/2026-10-18-ux-mock-formats.md`, is Figma, at 82 to 95 percent by survey, by spend and by Figma's own filing, with two thirds of its users non-designers; the question is the path from Figma into the canon, not which open tool to prefer. That the agent proposed a format without weighing either is the misreading recorded here.

HTML and CSS answer both. Flexbox, grid and media queries state layout and responsiveness; the viewer renders the page at any width; the text diffs in git; a model writes it; and Figma's own output reaches it: Dev Mode gives CSS, the MCP server gives React with Tailwind, or plain HTML and CSS on request, and the plugins people use, Anima, FigmaToCode, Builder.io and Locofy, give HTML with Tailwind or plain CSS. What recurs in that output is what the viewer provides or the agent flattens: a page declares `tailwind` or `lucide` as a need and the viewer adds them, React is flattened to a page before it enters, assets are copied into the folder, fonts stay linked by name. The element table, the ids and the binding stay as DEC-016 had them, so the loader, the check and the viewer change what they show, not their shape. The loss against SVG is rendering on GitHub, which shows a page's source; the viewer and any browser show the page. This supersedes DEC-016, which stays as the record of the first proposal.
