---
id: REQ-8.8
parent: REQ-8
title: "An agreed mock is redrawn only as a proposal the human accepts element by element, and the requirements bound to changed elements are re-read"
state: assumed
layer: requirement
source: "Claude Code session, 2026-10-18"
requires: [REQ-6.8, REQ-8.6.1]
files: [skills/attend/SKILL.md, skills/capture/SKILL.md, skills/review/SKILL.md, agents/verifier.md]
---

# An agreed mock is redrawn only as a proposal the human accepts element by element, and the requirements bound to changed elements are re-read

## Stated

> [...] and how to update previous designs with the consent of the user.

Source: Claude Code session, 2026-10-18.

## Intent [assumed]

A mock the human approved or brought is intent, and it changes the way a node changes: through an update the human approves (REQ-8.6.1), never by the agent redrawing it. The agent draws the proposed picture as a draft and shows it on the page beside the current one, with the elements that are added, removed, moved or renamed as the choices; the human accepts each change or keeps what stands, and the picture is rewritten with the accepted changes only. A picture the human replaces themselves needs no proposal.

After either, the requirements bound to the changed elements are re-read. A requirement whose element is gone becomes open, titled as the question of what replaces it; one whose element changed is rewritten as assumed to say what the picture now shows; a new element is a candidate for the node's refinement (REQ-3.16). The mock's table and the commit's trailers carry the update, and the verifier's uptake check reports a requirement still bound to an element the revision removed or renamed.

## Not this

- Keeping old pictures beside the new one: git holds the history (REQ-8.1).
- A redraw to match the code: when the product drifts from the mock, the code is wrong or the mock is revised with consent, never silently (REQ-5.4).

## Assumptions

- The changes between two pictures are read from their element ids: an id in one and not the other is added or removed; the same id with a different box or text is moved or renamed. (model assumption)
