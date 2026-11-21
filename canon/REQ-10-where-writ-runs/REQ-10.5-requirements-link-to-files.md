---
id: REQ-10.5
parent: REQ-10
title: "Requirements link to files or functions; Writ scopes checks to a commit's changed files"
state: stated
source: "docs/design-brief-v0.md:105"
---

# Requirements link to files or functions; Writ scopes checks to a commit's changed files

## Stated

> Requirements link to files or functions; Writ scopes checks to a commit's changed files

Source: docs/design-brief-v0.md:105

## Intent [assumed]

Every requirement says where it is built, under Implemented by: the functions bound to it as implementing it, or a line that it is not built with what exists instead. The links are written from the evidence during adoption and kept by the implementation agents from then on: approving a slice binds the units its commits changed (DEC-026). Writ reads a commit's changed files, maps them to requirements through these links, and loads only those branches of the canon.

