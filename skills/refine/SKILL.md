---
name: refine
description: "Refines one node into its children in one turn: the rung's question and the four questions asked of every box, one conceptual level of detail named as an axis, every piece of bound evidence placed under a child with its relation, every requirement saying where it is built or that it is not, a requires link for every box whose concepts a child uses, an issue only where precedence does not decide; written as operations and checked before it counts (DEC-025)."
when_to_use: "The top agent or a refiner agent refines or redefines a node; or the human asks to refine, define, decompose or expand a box."
---

# Refine: one node, one turn

`HC` means `node "${CLAUDE_PLUGIN_ROOT}/packages/canon/bin/headcanon.js"`. The node is `<ID>`, or `ROOT` for the premise. Every operation in full, and one capability worked from its parcel to its report, are in [reference.md](reference.md): read it before your first set.

## What you read

- Where the node stands and the words to use: `HC context <ID>` prints the node whole, its path from the premise with each Intent, its siblings and children, its links in both directions, the journeys and decisions that cite it, its nearest relatives in other branches, and the glossary terms its text uses.
- `HC parcel <ID> --by <your name>`: the evidence bound to the node, expanded one level: clusters with their descriptions and their children, functions, claims, each with an id. Reading a parcel is the start of a turn: from that moment the page shows you on that box, the one being refined, until your next parcel; operations on its children do not move you. For `ROOT`, the parcel is the whole evidence. A parcel that ends with `(truncated at ...)` is not whole: ask again with a larger `--budget`. `HC code show <unit>` opens any unit deeper when a placement is unclear.
- What lies outside the node: `HC find "<words>"` searches every box, journey, decision and term, one line per hit; `HC code find "<words>"` searches the code units by id, file and description. Look before you write a child: what another box already says is reached by a `requires` link, never written a second time.
- On a redefinition: the node's previous children and the reason for the change, named in the brief. They are evidence; a child the human approved weighs more than a guess.

## The question, by the rung

- `ROOT`: **what distinct areas must a product like this have, for the premise to hold?** Children are domains: a short name in plain words, no mechanisms. Where the format says a product has no domain layer (`HC format`), its areas are capabilities, created under `ROOT` with `layer: "capability"`.
- a domain: **what must the product be able to do in this area, for its intent to hold?** Children are capabilities: a subject in plain words, and an Intent that says what the product can do there.
- a capability or a requirement: **what must hold, observably, for this to be true?** Children are requirements: a claim a reader understands cold, in glossary words, naming the thing, no loophole or hedge; a `check`, what is observed and when the answer is yes; a `kind`, binary, or numeric with every number carrying its unit. A requirement refines again while it can be made more explicit; the leaf is where intent and requirement coincide.

## The four questions, asked of every node

Before the set is written, answer four things about the node, in the product's own words. Each answer is a candidate child, or a link to a box that exists:

- **What must exist first?** What must exist or be true before the node is possible. Inside the node it is a child, created before the ones that need it; outside it is a box to find and require.
- **What follows once it holds?** What the product must then do or show.
- **How does it fail, and what must prevent that?** The other case of every condition, the input that is wrong, the step that stops halfway.
- **What does every system of its kind have at this point?** What a product of this kind always has here, whether or not the evidence mentions it.

Keep an answer only when it traces to the node's text or to a piece of evidence; an answer that traces to neither is invented, and is dropped. Each child's `source` says where it came from: the claim or the unit it rests on, or the question and the words of the node that make it necessary.

## The constraint

The children sit on one conceptual level of detail, chosen for how a person navigates them and named as the axis they share: activity, object, actor, lifecycle, rule family, surface or quality. The axis is the `why` of every `create` of the set, so the log and History keep it. Every piece of evidence in the parcel fits at least one child. A split that leaves evidence unplaced is a bad split; fix it before answering, in this turn. Children that differ only in the instance they name are one child, which states the rule the instances share. A child the premise requires may exist with nothing bound, marked not built. As many children as the node needs, no more; no number is a target.

## Placing the evidence

Each parcel element goes to one child or more with a relation:

- **implements**: the unit's description and the child's intent say the same thing at the same level.
- **contributes**: part of the unit serves the child.
- **contradicts**: the code does otherwise than a document says the product must. Code against a claim is never settled by precedence: the child's Intent follows the document, the unit is bound `contradicts`, the child is `contested`, and the issue names both sides with their sources.

Two documents that disagree are settled by precedence, and no issue is filed: the newer one's wording stands, and a `note` on the child names the older reading with its source. The child is `contested` only where their dates do not tell which is newer. What only the code shows is written as a guess whose `source` names the unit. A claim that says it is a draft, a plan or an idea is intent nobody built yet: its child is written and says not built.

A cluster that fits one child whole passes to it unexpanded while that child will be refined further. Code the tree marks unreachable is named in your report as an issue, never dropped; the human decides whether it is deprecated, a bug, or an entry the tree missed (data-driven calls are not in the tree).

## Where each requirement is built

Every requirement says where it is built in the `create` that writes it, or the set is refused:

- **Built:** `binds` carries an `implements` line for each function that implements it. Find them in the parcel, by opening a bound cluster with `HC code show` down to its functions, or with `HC code find "<words>"`. On a leaf, bind functions, never a cluster in their place.
- **Not built:** `implementedBy: ["not built: <what exists instead>"]`. On a box that exists already, a `note` whose text starts with `not built:`.

Evidence bound to the parent or higher is not enough: `HC parcel --check` names every requirement that says neither as `built-unstated`.

## What you write

Operations, nothing by hand, each read from stdin so that no two agents ever share a file:

```
HC op - --by <your name> <<'JSON'
{"op":"create","under":"<ID>","title":"...","intent":"...","check":"...","kind":"binary","source":"...","binds":["implements <unit>"],"why":"axis: <the axis>"}
JSON
```

Several operations go in one Bash call, one `HC op -` each with its own heredoc. Read every result, and send again what was refused. A call that runs long is cut short by the shell: it fails on an unmatched quote and applies nothing, so send its operations again in smaller calls. A file, when you do need one, is named after you and lives in the scratch folder your brief names, never in the repository. In this order:

1. `create` for each child, what the others need first, so that the ids read as the order of building.
2. `link` with `kind: "requires"`, from a child to every box whose concepts its text uses, sibling or not, at the most specific box that holds the concept. A link that would close a cycle is refused: the concept both need belongs to their common ancestor. A link that only says two boxes share a subject is not written.
3. `contest` for each contradiction, `note` for each choice precedence made, `term` for a word the product gives a meaning of its own and the glossary lacks: assumed, never used undefined.
4. What the tool refuses as outside your border is recorded for the session, which applies it: `HC propose '<op JSON>' --why "<reason>" --by <your name>`. Then go on with your own boxes.
5. `HC parcel --check`: no line may name the node or a box under it; lines about other boxes are other agents' work in progress. `HC check | grep -E "<ID>|errors,"`: fix the errors and the warnings on your boxes. A note is fixed where it names a real defect, never by rewording for its own sake.

The set then goes to the reviewer; a correction names the parents that failed and where their findings are.

## Before answering, the tests you apply yourself

A named axis and more than one child; the four questions asked; no two children constrain the same thing; nothing the node implies is left out; every child justified by a bound unit or marked not built; every requirement saying where it is built; a `requires` link for every concept borrowed from another box; nothing in a child that belongs to a sibling or to the rung below; plain words above the requirement layer; no pronoun starts, loopholes or hedges; every number with its unit; every conditional with its other case.
