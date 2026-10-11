---
id: REQ-8.5.2
parent: REQ-8.5
title: "The commit-msg hook is installed from the start by headcanon init"
state: stated
source: "Claude Code session, 2026-10-11"
files: [packages/canon/src/init.ts, packages/canon/src/commit-msg.ts]
---

# The commit-msg hook is installed from the start by headcanon init

## Stated

> We should install it yes.

Source: Claude Code session, 2026-10-11, answer 4, to the question "Install it from the start so every future commit carries intent, or only once the canon has enough nodes to point at?"

## Intent [assumed]

`headcanon init` writes `.git/hooks/commit-msg`, which runs the checker against the project's canon. The checker requires a Conventional Commits header and an Intent trailer, accepts `Intent: none (reason)`, requires one `Intent-Change: <op> <ID>` per canon operation, and requires `Approved-By` whenever intent or tests change. Referenced IDs must exist in the canon. Merge, fixup and squash messages pass untouched. Only errors reject a commit; warnings are printed.

## Not this [assumed]

Replacing a hook the project already has. init refuses unless told `--force`, and then keeps the old hook as a backup.

## Assumptions

- The hook is a `#!/bin/sh` script that calls `node` on the launcher with an absolute path, which git on Windows, macOS and Linux all run. (model assumption)
- `update ROOT` is a valid operation for changes to the root README's purpose, non-goals or glossary. (model assumption)
- The checker does not yet verify that the trailers match the canon diff; that comparison belongs to Writ (REQ-8.7). (model assumption)
