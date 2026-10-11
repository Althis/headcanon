---
id: REQ-11.2
parent: REQ-11
title: "What lives where inside the plugin"
state: assumed
source: "docs/design-brief-v0.md:464-478"
files: [.claude-plugin/plugin.json, hooks/hooks.json, skills]
---

# What lives where inside the plugin

## Proposed in brief

> | Framework piece | Where it lives |
> | --- | --- |
> | Current intent state in every session | HeadCanon: SessionStart hook injecting a generated summary |
> | Intent capture, glossary, journeys, negotiation, test derivation | HeadCanon: skills |
> | Independent review during the session | HeadCanon: verifier subagent |
> | Block silent test weakening in the session | HeadCanon: PreToolUse hook on test files |
> | No "done" claim before checking intents | HeadCanon: Stop hook |
> | Intent trailers in commits | Shared: git commit-msg hook |
> | Goal regression, documentation coverage, contradictions | Writ, in CI |
> | Running intent-traced tests | Writ, via the team's own test runner |
> | Distribution | HeadCanon: plugin marketplace; Writ: package plus a GitHub Action |
> | Intent-to-file map | HeadCanon records it (commit trailers plus a PostToolUse hook); Writ reads it |
> | Acceptance tests written ahead of time | HeadCanon skill calling the Writ CLI |
> | Baselines | Writ, stored in the repo; HeadCanon also measures locally |
> | Text tree and Mermaid index | Shared: CLI render command, run by the commit hook |

Source: docs/design-brief-v0.md:464-478

## Intent

Skills for intent capture, glossary, journeys, negotiation and test derivation. A verifier subagent for independent review. A PreToolUse hook on test files. A Stop hook. A PostToolUse hook recording the intent-to-file map.

