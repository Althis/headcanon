# What the Valley runs have exercised, and what they have not

Status as of 2026-10-18, after six adopt runs on the test project. The fifth run reached the requirement layer through the question flow and was stopped there. The sixth run used the draft-then-review flow (REQ-11.6.3): it drafted 187 nodes in 13 minutes, ran the verifier once, applied its 28 findings before the canvas opened, then opened and attended the canvas; the human had not acted on it when this was written. Nothing has been committed in that project, so everything that happens at or after the first commit is untested on a real project.

## Exercised on a real project

- Session start context and the no-canon prompt.
- `headcanon init` and the commit-msg hook installation (the hook itself never ran, see below).
- The briefing, the premise, principles, domains and capabilities as questions through the page; the jargon gate; options as ID, title, description; corrections typed in Other.
- The refine construction at the domain and capability layers: laddering, axis, facet rules; the child sets were judged good.
- The MCP server and the page: ask, wait, focus, changes, open; port choice beside another viewer; the pre-init empty canon.
- Drafting the whole canon as guesses (run 6): premise, glossary, eight principles, 11 domains, 187 nodes, two open, one contested from two decision records that disagree, 27 `requires` edges. The session drafted the tree in one generator script instead of calling refine per branch, so refine's draft mode itself went unexercised; a lost connection during that single output cost one full generation and left the session idle until the human spoke.
- The verifier on a whole drafted canon: one pass of two and a half minutes, 28 findings in all four kinds. Three contradictions were reworded in the draft and one kept contested; reiterations were merged; drift went under Open; uptake was fixed by rewording parents and adding the missing children. The verifier read every file by hand because `headcanon` was not on its path (fixed in the agent file).
- Attending the open canvas: `headcanon_changes` with a ten-minute wait, backgrounded by Claude Code after two minutes; idle attendance costs two model turns per ten minutes, about 345k cached input tokens, with the cache warm throughout.

## Not yet exercised on a real project

Pushed earlier by the sixth run's flow (they now happen during drafting and the review loop, before any commit):

- The continuous draft written after run 6 (DEC-017): the canvas opening after the domains; refiner agents cutting the ready nodes from `HC next --json` in the background, several at once, while the human reviews; the attend loop integrating their returns beside the human's clicks; the verifier per finished branch; the cutting going on after Finish with branches committed as assumed. Nothing of this has run yet.
- Leaf contracts: `kind` plus a `## Check` sentence on every leaf, the `leaves to cut` count in the check summary, the session context and the overview tiles, and the `check-missing` and `kind-missing` findings; covered by unit tests only.
- Dependency descent: a `requires` edge moving down to the child that holds the concept when its target is cut.
- The requirement layer of refine, where the ladder has to go deepest into artifacts and the code counts as a thread; `HC next` order, cycles as lifts, deadlock handling: run 6 drafted everything at once, so nothing was ever ordered.
- The attend loop: reworking children after an approval, a rewrite or a deletion; answering a ? question; a refine request from the card; the working indicator; the Finish check.
- Resuming an unfinished adoption in a new session.
- The "enough to guess" rule: whether it guesses too much or too little.
- The canvas on a canon of real size: the lanes simulation, the radial view (rings per dot, dendrogram forks, the sibling swaps that pull dependency lines apart), the tree view (columns as wide as their longest row, one row per leaf), and the view keeping a selected or dropped box on screen. Run 6 rendered the 187-node draft; the fixture checks cover eight nodes.

Still at the end of the pipeline, untouched until a run finishes:

- The sweep of unused threads and DEC-001.
- `/headcanon:commit` on a real project: the verifier at commit time, the review record pinned to the staged hash, the `Consolidated` trailer, the hook rejecting a bad message, `Approved-By` with the human's name.
- `headcanon render` and the Mermaid index on a real canon.
- `/headcanon:review` on assumed and open items, including the "Remind me later" lines in the root README.
- `/headcanon:capture` during implementation work; the Stop gate and PreToolUse protection (Phase 4, not built).
- Writ, not started.

## How to read a run

Transcripts land in `~/.claude/projects/D--Users-joaol-Desktop-Tor-Browser-queue-TheValley/<session>.jsonl`. Grep for `headcanon_say`, `node-approved`, `node-edited`, `node-deleted` and `finish-request` to follow the loop; grep for `review-record` and `Intent-Review` to see whether a commit happened.
