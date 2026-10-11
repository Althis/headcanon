---
id: REQ-12.1.4
parent: REQ-12.1
title: "Attention: changes that need the human's word"
state: assumed
source: "Claude Code session, 2026-10-11"
files: [packages/canon/public/app.js, packages/canon/src/attention.ts]
---

# Attention: changes that need the human's word

## Stated

> Changes that need my attention like the intent changes you mentioned last message.

Source: Claude Code session, 2026-10-11, fourth bullet of the viewer request.

## Intent

One page lists everything waiting on the human, most blocking first. Intent changes come from git, not from the canon files: commits whose Approved-By trailer says pending, and commits not on main that carry Intent-Change trailers, each shown with its subject, branch, intent IDs and an expandable list of its operations. After those: uncommitted edits to canon files, broken structure, contested items, open questions, decisions not yet confirmed, assumed requirements grouped by branch, and glossary terms awaiting confirmation. The tab badge counts the blocking groups so the human sees at a glance whether anything waits.

## Not this

A task list or an inbox the viewer manages. Nothing here can be ticked off in the viewer; approval happens in the session or by merging, per REQ-8.7.

## Assumptions

- Reading git trailers is the right source for pending intent changes, following REQ-8.4: the files hold the present, the log holds the history. (model assumption)
- A commit is "awaiting approval" when its Approved-By value begins with the word pending, the convention proposed in DEC-006. (model assumption)
- The badge counts pending approvals, unmerged intent changes, uncommitted edits, errors, contested items, open questions and unconfirmed decisions. Assumed requirements and glossary terms are listed but not counted, because they do not block work. (model assumption)
- "Not on main" is computed against a branch named main, or master as a fallback. (model assumption)
