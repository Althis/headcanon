---
id: REQ-3.16
parent: REQ-3
title: "A visual node is defined from its mock: the page is agreed first, and its requirements are read off the elements and the behaviours the human names"
state: assumed
layer: requirement
source: "Claude Code session, 2026-10-18"
requires: [REQ-3.14, REQ-6.8]
files: [skills/refine/SKILL.md, skills/refine/reference.md]
---

# A visual node is defined from its mock: the page is agreed first, and its requirements are read off the elements and the behaviours the human names

## Stated

> Anything visual gets defined by showing it to the user as a mock, and then receives it's own written requirements based on this mock + expected behaviours defined by the user.

> [...] how to help the user define it when creating a new node, and how to look for details that might be overlooked in design [...]

Source: Claude Code session, 2026-10-18.

## Intent [assumed]

A node is visual when its text names something a person sees or operates: a screen, a page, a panel, a card, a control, a message. Refining such a node starts with its mock. The agent writes the mock from the threads in the node's scope, screenshots, interface code and style guides, and from the archetype of its kind, and shows it in the viewer together with the node's text. The human approves it as drawn, corrects it in words, which rewrites it and asks again, brings a page of their own, or drops it, which makes the node an ordinary one. An agreed mock is the primary source for the node's children, above every artifact (REQ-5.5).

The children are read off the mock. Every element the human kept is a candidate whose origin is the element, and the four prompts of REQ-3.13 are asked of each element: what must hold for it to show, what it does, what it does when it cannot, and what every control of its kind does. A behaviour the human names for an element is a stated requirement bound to it. The archetype of an interface is a walk of the states a screen has and a person meets: empty, loading, failed, partial and overflowing content, the first visit, a narrow window, the keyboard and focus, an action that destroys something, a change that arrives while the screen is open, and text in another language. A state the human confirms is a requirement bound to the element it concerns, or a second section of the page when it changes what is seen, a narrow window being seen by resizing; a state nothing in the project covers is asked as a question. Each requirement names its element in `source` and stands in the mock's table, so the mock binds the set.

## Not this

- A mock drawn after the requirements, as an illustration of them.
- Pixel fidelity: a mock shows what is there and where, in the plainest page that settles the question.

## Assumptions

- The walk of states is asked as one multi-select, pre-ticked from the artifacts; an unticked state comes back only when the human asks for it. (model assumption)
- Interface code and screenshots in the repository are threads like any other: hints of what the mock should show, never the mock itself. (model assumption)
