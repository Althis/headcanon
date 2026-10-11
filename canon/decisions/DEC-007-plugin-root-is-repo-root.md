---
id: DEC-007
title: "The plugin root is the repository root, loaded with --plugin-dir during development"
state: assumed
date: 2026-10-11
intents: [REQ-11.2, REQ-11.3, REQ-2.4]
---

# The plugin root is the repository root, loaded with --plugin-dir during development

## Why

Claude Code reads `.claude-plugin/plugin.json`, `hooks/hooks.json` and `skills/*/SKILL.md` from the plugin root, and a plugin cannot reach files above its root. The CLI the hooks and skills call lives in `packages/canon` and needs the repository's `node_modules`. Making the repository root the plugin root keeps everything reachable with one `claude --plugin-dir <checkout>` and no packaging step. The launcher prefers the built `dist/` and falls back to running the TypeScript source through tsx, so a fresh checkout works after `npm install`.

Packaging for a marketplace, where the plugin would need its dependencies bundled, is a later decision.
