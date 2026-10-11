---
id: REQ-3.8
parent: REQ-3
title: "The top of the tree is derived from the premise: the domains the product needs to operate, then the capabilities each domain needs to be complete"
state: stated
source: "Claude Code session, 2026-10-11"
files: [skills/adopt/SKILL.md]
---

# The top of the tree is derived from the premise: the domains the product needs to operate, then the capabilities each domain needs to be complete

## Stated

> So, the valley is an interesting project to start having this discussion with because it is VERY well defined into domains and it's also reasonably easy to define segments: One of the segments is game content, the other is game engine, and the third specific to this project is the editor. You said the model naturally separated these, but from what I can see from our conversation there it seems it created 12 top level branches, but I don't see this domain separation(is domain the right term here?). The thing that I think should be done that isn't is that based on every overview(which we did before) the model should be able to split the project into "domains"(tentative term) that every system of this type needs to have. For example, the above for the Valley, and then further down, each game engine needs to define certain things to be fully well defined as a game engine, and so on. Another example, at my previous work, I worked for Talonic, that was a platform for reading PDF documents of clients and outputting JSON from those. The system needed multiple basic things to be able to do this: 1. auth, and user management, 2. document intake 3. feature discovery in the document 4. feature conciliation between documents in the same batch 5. user-created filtering options 6. user review 7. provenance features, etc. As you can see, this is malleable, who's to say feature discovery and conciliation should be separate? But what matters is that these areas are clearly defined as "things this product needs to do if it is to operate given the premise"

Source: Claude Code session, 2026-10-11, after the second adopt run on The Valley proposed twelve top-level branches.

## Intent [assumed]

The upper layers of the tree come from the premise, not from the artifacts. Once the concepts are approved (what it is, purpose, non-goals), the agent asks what must exist for that premise to operate and proposes the **domains**: the distinct areas the product needs, two to six of them. For The Valley these are game content, game engine and editor. Under each domain it proposes the **capabilities** that domain needs to be complete for a system of its kind, drawing first on what every such system needs and then on the artifacts. A capability the kind of system needs but nothing in the project covers enters as an `open` node titled as the question, so coverage gaps are visible from the first day. Only below the capabilities do the artifacts supply the requirements, as assumed nodes with sources.

The cut is malleable and the human settles it; what matters is that every area is explicit and agreed. A small product whose premise needs fewer than about eight areas has capabilities at the top level and no domain layer.

## Not this [assumed]

A top level cut by where statements were found, by engineering layer, or by whatever the artifacts happen to emphasize. Also not a fixed taxonomy: domains are derived per project from its premise.

## Assumptions

- "Domain" names the areas the premise requires and "capability" names what each domain must be able to do; both are ordinary software-design terms used in their usual sense. (model assumption)
- Two to six domains, up to about eight capabilities per domain, and one level of requirements below them at adoption time. (model assumption)
- Coverage against the archetype (what every system of this type needs) is measured by open capability nodes; coverage against the artifacts stays with the sweep in the adopt skill. (model assumption)
