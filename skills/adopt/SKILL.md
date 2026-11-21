---
name: adopt
description: "Reads a repository into evidence (the code tree with descriptions, the claims of its documents and content, the documents split among several readers), has the top agent draft the premise and principles from it, has the human approve both in the viewer, and hands over to attend. Adoption is reading and onboarding; everything after is regular operation (DEC-025)."
when_to_use: "Called by start when a repository has code or documents and no approved premise; or the human asks to adopt a repository."
---

# Adopt: read the repository, onboard the human, approve the premise, hand over

`HC` means `node "${CLAUDE_PLUGIN_ROOT}/packages/canon/bin/headcanon.js"`. `headcanon_say` speaks in the viewer's chat; `headcanon_changes` returns what the human did since a cursor and waits up to `waitSeconds` for the next thing. Nothing is asked in the terminal. Nothing compute-intensive runs before the premise is approved.

## The order

1. **Open and signal.** `headcanon_open` once (start did it; never a second tab). `headcanon_say` with `to: "intro"` and one line, "Reading has started": the page owns the onboarding's words (docs/tone.md) and shows them as one card, welcome, then the way of working, then the reading with a measured bar. Nothing you say is shown on that card.
2. **Read, in the background, while they read.** `HC code build` first (the parser, a second). Then every reader at once, each a `headcanon:reader` started in the background with the Agent tool. Its brief names its name, its part and its scratch folder: `<your scratchpad directory>/<its name>/` as an absolute path written with forward slashes, or the same under the system's temporary folder when you have no scratchpad. No two agents share a folder, and none writes a working file in the repository.
   - `reader-code`, the code tree: descriptions bottom up, to the roots.
   - `reader-content`, the content and data files, and the documents that are not Markdown.
   - The documents, split. `HC reading parts <n>` prints the Markdown files as a JSON array of groups of like size. Ask for as many groups as readers you may start beside the other two: what the cap leaves once `HC settings` shows one, otherwise what the session lets you start. One reader per group, `reader-docs-<k>`, its brief giving that same command and the position of its group, the first being 1.

   Readers write evidence, never intent; what is a claim and what is not is theirs to apply. The card's bar counts what they write to disk; say nothing for it. A launch that is refused waits for a reader to reply.
3. **Let's go and the mode.** Wait with `headcanon_changes` until the feed carries `onboarding` (the mode, Guided or Full-Auto, and the cap). Store nothing yourself: the page saved them; `HC settings` prints them. Keep reading meanwhile; when the cap is lower than what runs, start nothing more until enough readers have replied.
4. **The premise.** When every reader has replied, start `headcanon:top` in the background, named `top`, with `the premise`, the mode, its scratch folder, and the viewer's port when it is not the default. It reads the whole evidence once, in its context and not in yours, and writes `canon/README.md`: the Intent, what the project is and for whom; `## Not this`; `## Principles`; `## Glossary`; every part `assumed`. When it reports, `HC check | tail -n 1` must show 0 errors. `headcanon_say` that the premise is ready, and `headcanon_focus ROOT`: the page shows the premise as editable text with Approve. Keep the id of that agent.
5. **Wait for the premise.** `headcanon_changes` until `node-approved` or `node-edited` for `ROOT`. An edit is the human's words, `stated`; refine nothing yet. Then the principles: the page shows them as a list the human approves, rewrites or removes one by one, or approves the rest at once; `principles-approved` arrives either way, as soon as the last one is settled, so never ask for a list approval. Apply `node-edited` and `node-deleted` for `PRN-` ids as they come. Nothing else runs while you wait: idle costs nothing, see attend's waiting rule.
6. **Hand over.** `/headcanon:attend` with the mode and the id of `top`: attend resumes that agent, which still holds the evidence, for the map, and goes on to the leaves. Adoption is complete when every branch ends in a requirement with a check that says where it is built; attend says so. Red boxes wait on the human and hold nothing else back.

## Rules

- **Evidence is never intent.** A code description says what the code does, never what the product must do; a claim is what a document says, with its source. Intent is written by `top` at step 4 and after it, and by the refiners.
- **Nothing is dropped.** Every function belongs to a cluster, every cluster to the tree, every claim to the index; the refiner binds all of it or raises an issue. Unreachable code is marked by the tree and becomes an issue, never a silent omission.
- **Cost.** Readers take their batches from `HC code todo`, read a function's body only when its name and context do not tell, and write descriptions in one call per batch; the premise is one say, not a conversation. Your own context holds the readers' one-line replies, never the evidence.
- **Resume,** at the first of these that holds. A code tree without descriptions, or documents without claims, is an adoption waiting at step 2: `HC code stats` and `HC claims | grep -c "claim:"` say where it stands, and a reader started again skips what was read. A `canon/README.md` that `HC init` wrote and nobody filled is waiting at step 4, with a fresh `top`. One that is `assumed` with no domains is waiting at step 5.
