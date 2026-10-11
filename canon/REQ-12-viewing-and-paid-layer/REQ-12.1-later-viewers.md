---
id: REQ-12.1
parent: REQ-12
title: "A local viewer now; an MCP App later"
state: stated
source: "Claude Code session, 2026-10-11"
files: [packages/canon/src/ui, packages/canon/public]
---

# A local viewer now; an MCP App later

## Stated

> Create a fast web-server for headcanon to help visualize the requirements in the project. Make a front-end interface to help me see:
>
> * Requirements at a glance
> * The full requirement tree
> * problematic branches and children
> * Changes that need my attention like the intent changes you mentioned last message.
>
> Load this server locally so that I can better review these for headcanon itself.

Source: Claude Code session, 2026-10-11

## Proposed in brief

> Later viewing surfaces: a local viewer, then an MCP App

Source: docs/design-brief-v0.md:111

## Intent [assumed]

The brief placed the local viewer after v1. The user's request moves it forward: `headcanon ui` serves a browser page over the canon files with four views, matching the four bullets above. The MCP App remains a later surface and stays assumed.

## Not this [assumed]

A hosted service, a database, or a build step. The viewer reads the files on disk on every request and needs only Node.
