---
id: REQ-11.6.2
parent: REQ-11.6
title: "Drafts read as prose with footnoted sources, and a principle is a title with a paragraph"
state: stated
source: "Claude Code session, 2026-10-11"
files: [skills/adopt/SKILL.md, skills/adopt/reference.md]
---

# Drafts read as prose with footnoted sources, and a principle is a title with a paragraph

## Stated

> I already had problem with the way the model put references in () making it really hard to read what it wanted to say. The previous iteration didn't do this, and it was much easier to read. It is good to have references, but it would be easier if they were just [n] numbers with references later, or maybe even nothing until the user asks for references.

> Before they had title and an actual paragraph explaining the principle. Now they are too short, you can barely get what they mean. This seems like it would be a fine style for more direct entries, like requirements, but for principles, they should be more expressive on what they mean, as this is a more important point of alignment with the user.

Source: Claude Code session, 2026-10-11, at the principles step of the fourth adopt run on The Valley.

## Intent [assumed]

In a question, a draft reads as prose. A sentence that rests on an artifact ends with a footnote marker, and the sources are listed once at the end of the question. No path or date appears inside a sentence. The entry written to the canon carries no markers; its sources live in the node's `source` field or on a Source line after a principle or glossary entry. In a multi-select, the drafts appear once, in the question body, and each option is the ID and title only.

Length follows the layer. Requirements and glossary entries are one or two sentences. A principle is a title and a paragraph of two to four sentences that says what the direction is, what it means for the project's choices and where it applies, because a reader must be able to judge from the paragraph alone whether a requirement follows it.

## Assumptions

- Footnotes rather than no references: the human offered both, and footnotes keep the provenance visible without the cost the parentheses had. (model assumption)
- The fourth run's shorter principles came from the one-line template in the reference file and from the entry rule's "concise", which did not distinguish layers; the template and the rule now do. (model assumption)
- The selection of principles also worsened in the fourth run; the skill now says to draw on the human's premise answers first and the newest artifacts next, and to leave old milestones out. Whether that is enough is open until the next run. (model assumption)
