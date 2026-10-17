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


## Corrections are not quoted [assumed]

When the human types a correction as an instruction ("drop the counts") rather than the wording itself, the agent applies it and shows the merged text; only the approved merged text is written, and the correction is not quoted in the node. A node is read without the conversation (REQ-3.11), and only wording the human typed is a Stated quote. (model assumption)
