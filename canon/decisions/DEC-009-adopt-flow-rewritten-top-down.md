---
id: DEC-009
title: "The adopt skill was rewritten top-down after its first run asked the human for file provenance"
state: assumed
date: 2026-10-11
intents: [REQ-11.6, REQ-11.2.1]
origin: misread
---

# The adopt skill was rewritten top-down after its first run asked the human for file provenance

## Why

The first adopt skill read "search the repository for ongoing requirements to get a headstart" as: inventory the artifacts, present them, and ask the human to confirm each file's provenance so that only human-written text could be stated. On The Valley, the first real test, the human did not know where many files came from and found the process complicated and badly guided.

The misreading was the agent's: the human's words were about the agent getting a head start, not about the human vouching for files. The rewrite keeps the certainty rules (artifacts are assumed, only typed words are stated) but changes who does the work. The agent reads silently and drafts; the human approves, corrects or rewrites through the question interface, top-down: concepts, then requirements one level at a time, then a sweep for intents the tree dropped.

This is the third caught divergence and the first of the misread kind.
