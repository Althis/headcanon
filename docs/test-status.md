# What the Valley runs have exercised, and what they have not

Status as of 2026-10-17, after five adopt runs on the test project. The fifth run reached the requirement layer and was stopped there; nothing was committed in that project, so everything that happens at or after the first commit is untested on a real project. The sixth run uses the draft-then-review flow (REQ-11.6.3), which moves some of these earlier in the pipeline and leaves others where they were.

## Exercised on a real project

- Session start context and the no-canon prompt.
- `headcanon init` and the commit-msg hook installation (the hook itself never ran, see below).
- The briefing, the premise, principles, domains and capabilities as questions through the page; the jargon gate; options as ID, title, description; corrections typed in Other.
- The refine construction at the domain and capability layers: laddering, axis, facet rules; the child sets were judged good.
- The MCP server and the page: ask, wait, focus, changes, open; port choice beside another viewer; the pre-init empty canon.

## Not yet exercised on a real project

Pushed earlier by the sixth run's flow (they now happen during drafting and the review loop, before any commit):

- The requirement layer of refine, where the ladder has to go deepest into artifacts.
- `requires` links written by refine, `headcanon next` order, cycles as lifts, deadlock handling.
- The verifier's consistency pass on a whole drafted canon: contradiction, reiteration, drift, uptake findings and their resolutions (contested, merge, open).
- The attend loop: reworking children after an approval, a rewrite or a deletion; answering a ? question; a refine request from the card; the working indicator; the Finish check.
- Resuming an unfinished adoption in a new session.
- The "enough to guess" rule: whether it guesses too much or too little.
- The canvas on a canon of real size: the lanes simulation, the radial view (rings per dot, dendrogram forks, the sibling swaps that pull dependency lines apart), and the view keeping a selected or dropped box on screen. Checked only on the six-node fixture.

Still at the end of the pipeline, untouched until a run finishes:

- The sweep of unused threads and DEC-001.
- `/headcanon:commit` on a real project: the verifier at commit time, the review record pinned to the staged hash, the `Consolidated` trailer, the hook rejecting a bad message, `Approved-By` with the human's name.
- `headcanon render` and the Mermaid index on a real canon.
- `/headcanon:review` on assumed and open items, including the "Remind me later" lines in the root README.
- `/headcanon:capture` during implementation work; the Stop gate and PreToolUse protection (Phase 4, not built).
- Writ, not started.

## How to read a run

Transcripts land in `~/.claude/projects/D--Users-joaol-Desktop-Tor-Browser-queue-TheValley/<session>.jsonl`. Grep for `headcanon_say`, `node-approved`, `node-edited`, `node-deleted` and `finish-request` to follow the loop; grep for `review-record` and `Intent-Review` to see whether a commit happened.
