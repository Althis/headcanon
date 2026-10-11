---
id: REQ-3.8
parent: REQ-3
title: "The top of the tree is derived from the premise and from what every software project needs: domains, then the capabilities each domain needs to be complete"
state: stated
source: "Claude Code session, 2026-10-11"
files: [skills/adopt/SKILL.md]
---

# The top of the tree is derived from the premise and from what every software project needs: domains, then the capabilities each domain needs to be complete

## Stated

> So, the valley is an interesting project to start having this discussion with because it is VERY well defined into domains and it's also reasonably easy to define segments: One of the segments is game content, the other is game engine, and the third specific to this project is the editor. You said the model naturally separated these, but from what I can see from our conversation there it seems it created 12 top level branches, but I don't see this domain separation(is domain the right term here?). The thing that I think should be done that isn't is that based on every overview(which we did before) the model should be able to split the project into "domains"(tentative term) that every system of this type needs to have. For example, the above for the Valley, and then further down, each game engine needs to define certain things to be fully well defined as a game engine, and so on. Another example, at my previous work, I worked for Talonic, that was a platform for reading PDF documents of clients and outputting JSON from those. The system needed multiple basic things to be able to do this: 1. auth, and user management, 2. document intake 3. feature discovery in the document 4. feature conciliation between documents in the same batch 5. user-created filtering options 6. user review 7. provenance features, etc. As you can see, this is malleable, who's to say feature discovery and conciliation should be separate? But what matters is that these areas are clearly defined as "things this product needs to do if it is to operate given the premise"

Source: Claude Code session, 2026-10-11, after the second adopt run on The Valley proposed twelve top-level branches.

> That is not true. This is a software project and every software project requires documentation. The choice to use headcanon to manage documentation is a definition for the documentation management domain.

Source: Claude Code session, 2026-10-11, answering whether ways of working are principles rather than domains.

> It should ask, and then ask if the user wants to just leave it as an open domain to consider later.

Source: Claude Code session, 2026-10-11, answering whether a domain may be open.

## Intent [assumed]

The upper layers of the tree come from two sources, neither of which is the artifacts. First, the premise: once the overview is approved, the agent asks what distinct areas must exist for this product to operate, and proposes them as domains. For The Valley these are game content, game engine and editor. Second, the kind of project: every software project needs certain domains regardless of premise, such as documentation and verification, and they are proposed alongside the premise-specific ones. A choice like "the canon is the primary documentation" is then a definition inside the documentation domain, not a principle. Under each domain the agent proposes the capabilities that domain needs to be complete for a system of its kind, drawing on what every such system needs and then on the artifacts; a capability nothing in the project covers enters as an open node titled as the question.

When the agent believes the premise needs a domain the project has nothing on, it asks the human about the gap. If the human does not settle it, the agent asks a second question: leave it as an open domain to consider later, or drop it. An open domain is a node with `state: open`, titled as the question.

The cut is malleable and the human settles it; what matters is that every area is explicit and agreed. A small product whose premise needs fewer than about eight areas has capabilities at the top level and no domain layer.

## Not this [assumed]

A top level cut by where statements were found, by engineering layer, or by whatever the artifacts emphasize. Also not a fixed taxonomy: the premise-specific domains are derived per project.

## Assumptions

- "Domain" names the areas the premise or the kind of project requires and "capability" names what each domain must be able to do; both are ordinary software-design terms. (model assumption)
- The domains every software project needs are at least documentation and verification; delivery and operation are candidates the human confirms per project. (model assumption)
- Two to six premise-specific domains, up to about eight capabilities per domain, and one level of requirements below them at adoption time. (model assumption)
- Coverage against the archetype is measured by open capability and open domain nodes; coverage against the artifacts stays with the sweep. (model assumption)
