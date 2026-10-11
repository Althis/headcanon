---
id: REQ-5.3.1
parent: REQ-5.3
title: "Stated items are always verbatim quotes collected from the conversation"
state: stated
source: "docs/design-brief-v0.md:71"
---

# Stated items are always verbatim quotes collected from the conversation

## Stated

> Stated items are always verbatim quotes collected from the conversation

Source: docs/design-brief-v0.md:71

## Not this [assumed]

The agent's paraphrase of what the human said. A paraphrase is assumed, however faithful.


## Corrections are quoted as corrections [assumed]

When the human types a correction as an instruction ("drop the counts", "lead with the engine") rather than the wording itself, the quote is stated, but it states a correction, not the node's content. The agent applies it to its draft and asks once more with the merged text; only then can the merged text become resolved. The second adopt run on The Valley recorded such corrections as if they were the requirement's statement, which is the drift this section rules out. (model assumption)
