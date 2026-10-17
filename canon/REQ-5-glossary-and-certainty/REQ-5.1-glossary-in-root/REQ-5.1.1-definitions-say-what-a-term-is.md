---
id: REQ-5.1.1
parent: REQ-5.1
title: "A definition says what the term is, and covers one concept"
state: stated
source: "Claude Code session, 2026-10-11"
files: [skills/adopt/SKILL.md, packages/canon/src/rules.ts]
---

# A definition says what the term is, and covers one concept

## Stated

> Second, the definitions often seem to say what a thing is NOT. I want your opinion on this, but I think that is sloppy. Glossary definitions, like in a dictionary, should focus on what something IS, not what it is not. Finally, the EFFECT definition conflated Trait in it's glossary definition. The model needs to be more careful about separating concepts. Trait should have been it's own entry in the glossary.

Source: Claude Code session, 2026-10-11, after the first adopt run on The Valley reached its glossary step.

> Drop the last two sentences. Glossaries should focus on what a thing is, and now what it is not.

Source: The Valley adopt session, 2026-10-11, correcting the Condition definition.

## Intent [assumed]

Every glossary definition states what the term is, in one or two sentences, as a dictionary entry does. It carries no "not" clause and no contrast with another term. Each entry covers one concept; when a definition needs another concept to be understood, that concept gets its own entry, and a related term is never bundled into another term's definition. A disambiguation, for a term that genuinely collides with another meaning in the same codebase, is a separate sentence after the definition and is added only at the human's request.

## Not this [assumed]

The brief's wording that the Glossary records "what X does not mean" (docs/design-brief-v0.md:167). The place for what the project is not is the root README's Not this section, not the definitions.

## Assumptions

- This narrows REQ-5.1's reading of the brief rather than contradicting it: terms are still the human's, and ambiguity is still resolved against the Glossary. (model assumption)
- HeadCanon's own glossary was edited to follow the rule in the same change. (model assumption)
