---
name: start
description: "The one entry point: looks at the repository and the canon, brings an older canon up to the current format, opens the viewer once, and hands over to adopt for a repository whose premise is not approved yet or to attend for one that has a canon."
when_to_use: "The human runs /headcanon:start, or asks to begin, set up, adopt, resume or continue HeadCanon on a repository."
---

# Start: find out where the repository stands, then hand over

`HC` means `node "${CLAUDE_PLUGIN_ROOT}/packages/canon/bin/headcanon.js"`. Everything the human sees happens in the viewer; nothing is asked in the terminal.

1. **Where things stand.** Decided from the folder and nothing else, the first case that fits:
   - No `canon/README.md` and no files worth reading (only configuration, no code, no documents): starting from zero. That path is not designed yet: say so and stop.
   - No `canon/README.md` and a repository with code or documents: adoption. `HC init`, then `/headcanon:adopt`.
   - A `canon/README.md` whose `state` is neither `stated` nor `resolved`, and no `REQ-` entry beside it in the canon folder: an adoption that stopped before the premise was approved. `/headcanon:adopt`, which resumes from what is on disk.
   - Any other `canon/README.md`: operation. `HC check | grep -E "format-version|errors,"`; when it prints a `format-version` line, run `HC upgrade` first, which rewrites the mechanical part (state `open` to `draft`, `## As built` to `## Implemented by`, a `uid` where a requirement has none) and sets the version; then `/headcanon:attend`, which resumes from what is on disk.
2. **One tab.** `headcanon_open` once, here, in this session. No agent you launch ever calls the page's tools; the page is held by this session alone.
3. **Hand over.** The skill you call owns the rest. Do not say what the next skill will say; the onboarding card is its first act.
