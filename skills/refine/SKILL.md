---
name: refine
description: "Derives the children of one approved canon node and has the human approve them as a set: infers what the node implies, ladders every artifact hint up to the rung just below the node, reads the axis off the set, closes the gaps, and writes only what was approved. Use when adopt, capture or review need a node's children, or when the human asks to define, refine, decompose or expand a branch."
when_to_use: "A node is approved and its children are needed; the human pressed Define this branch in the viewer or asks to refine, decompose or expand a node."
argument-hint: "<ID> <domain|capability|requirement>"
---

# Refine: cut one node into its children

`HC` means `node "${CLAUDE_PLUGIN_ROOT}/packages/canon/bin/headcanon.js"`. The worked example, the set question and the child file format are in [reference.md](reference.md); read it before step 1.

Input: one node the human approved (`ROOT` for the premise) and the layer its children get. Output: the approved children written as files, the axis recorded on the node, and a list for the caller of what landed elsewhere. Nothing is written before the human approves it. Ask through `headcanon_ask` when the viewer's tools are present, otherwise AskUserQuestion; the asking rules, the three kinds of typed answer and the entry rules are the adopt skill's ([adopt/SKILL.md](../adopt/SKILL.md), Asking and Entries; the page procedure is [adopt/reference.md](../adopt/reference.md) section 6). Label each question as the caller says; alone, "Refine <ID>: <title>".

## Checklist

Write this list to your scratch file and tick items as you go.

- [ ] 0 Read the node as approved, its parent and siblings, its children and `## Deferred` list, and the root README (principles, glossary, Not this).
- [ ] 1 Gather candidates, each with its origin.
- [ ] 2 Ladder every candidate up to the node.
- [ ] 3 Take the top rungs; merge rungs that name one thing; defer the rest.
- [ ] 4 Read the axis off the set; make facet children; place strays.
- [ ] 5 Close the set: entailment, conservation.
- [ ] 6 Name and order; judge drift; jargon through the gate.
- [ ] 7 Ask: one multi-select, then one by one. Write only after approval.
- [ ] 8 `HC check`; report to the caller.

## Sources

The node's approved text, read with the glossary, is the primary source; the layers above it rank next. Artifact threads (one thing a document says, with `path:lines`) are **hints**: a thread shows that something belongs in this scope, usually several rungs down, and the ladder in step 2 finds the child it points at. A thread never becomes a child in its own words. Precedence when sources differ: the human's approval in this run, their typed words, the newest artifact, older artifacts. Two threads that disagree on a candidate: offer both readings; neither chosen, the child is `contested` with both positions. A thread that contradicts the node itself goes through the inconsistency procedure first (adopt skill, Sources).

## The moves

### 1 Gather

Four prompts on the node's meaning, answered in the project's vocabulary; each answer is a candidate with its origin written beside it:

- **prerequisite**: what must exist or be true before the node is possible;
- **consequence**: what follows once the node holds;
- **failure**: what it looks like when the node does not hold, and what must prevent it;
- **archetype**: what every system of this kind has at this point.

Then the hints: threads in the node's scope, assumptions recorded earlier under it, its `## Deferred` list, and candidates the caller passed in. An answer you cannot trace to the node's text or to a hint is not a candidate, because untraced is how invented needs enter.

### 2 Ladder

For each candidate ask "why must this hold, for <node>?" and answer in one sentence; ask it again of the answer, until the answer is a sentence the node's text already says. Each answer is a rung; write them down. The **top rung** is the one directly below the node: the node's text makes it necessary and nothing stands between them. Two checks: a top rung that could instead be a sibling of the node climbed too far, so step one rung down; a top rung that is a case, part or stage of a more general sentence the node still makes necessary stopped short, so climb. A prompt answer is usually its own top rung. A ladder that reaches another node belongs there: set it aside for the caller as a `link`, `lift` or `merge`. A ladder that reaches nothing is a leftover thread for the sweep.

### 3 Top rungs

The top rungs are the candidate set. Rungs that name one thing merge into one child. Everything below a top rung is **deferred**: listed under that child in `## Deferred` with its origin, created only when that child is refined. The artifact's mechanism waits there, under the node it implies, which is where the hint pointed. Existing children are approved top rungs: keep them and propose only what is missing.

### 4 Axis

Each top rung answers one question about the node: when (its stages), which part, which case, who, what it acts on, how well. The question most rungs answer is the node's **partition**, a short phrase; a partition already on the node stands. Rungs answering another question:

- two or more: one **facet** child named by that question, with those rungs as its `## Deferred`; it gets its own partition when refined;
- one, an aspect of an existing child: deferred under that child;
- one, cutting across several children: a child with `relates` to each;
- one, cutting across the node's siblings too: not a child here; set it aside for the caller as a `lift` to the node's parent.

A facet of one member is not a facet. The partition is approved with the set in step 7, never asked on its own.

### 5 Close

Two checks before asking. **Entailment**: if every child holds, does the node hold? What the answer still needs is a missing child. **Conservation**: every thing the node's text acts on, produces or forbids appears in some child; what is missing is a child. A gap is a candidate with its chain, pre-filled from the project's threads when they speak to it, and marked "nothing in the project covers it" when they do not. Fewer than two top rungs: the node is a leaf, say so, and write nothing. More than eight: look for a second question among them that makes a facet; none, propose them all and say so.

### 6 Name

Each child is named by its rung, never by the artifact's wording: domains and capabilities in plain words, requirements in glossary terms, one or two sentences, an encyclopedia entry. A requirement is verifiable by definition: name to yourself a check in content or code that would show it met; none means it is a principle or too vague, so do not propose it; already a yes-or-no check: `kind: binary`. Judge each child against the principles and name any drift in the question. Children that cannot be approved or tested separately are one child, or a facet is missing. Order: time for stages, otherwise the user's path through them.

### 7 Ask

One question per set, in the shape of reference.md section 2: the body holds the node's text in one line, "Its children, by <partition>:" and one Sources line giving each chain as "[n] <prompt> of '<clause>'" or `path:lines`; the multi-select has one option per child, its label the ID and title, its description the child's one line ending with its footnote. Unticked items come back one by one with the draft restated; a child nothing in the project covers comes back as "Does <node> need <title>?" with **Yes, add it** and **No**, and only when the human types that it is undecided, "Leave it as an open node?" with **Leave open** and **Drop**; leave open writes `state: open`, titled as the question. A typed objection to the axis is a correction: rebuild the set along the question it names and ask again. Write after approval: each child as a file with `layer`, `source` carrying its chain and `## Deferred`; the node's front-matter gains `partition`. Entries carry no footnote markers.

### 8 Report

`HC check`; fix every error. Return to the caller: the IDs created, the partition, the set-asides with their operation, the leftover threads, the open nodes. The caller commits.

## Examples

<example>
A hint laddered. Thread: "OFX amounts are in cents" (docs/formats.md:8). Why must it hold? Each format's fields are read as the format defines them. Why? A statement in a known format becomes transactions, which the node says. Top rung: the parsing capability; the two lower rungs go under it as Deferred. The thread never becomes a child.
</example>

<example>
A facet child. Under Categorization the rungs answer "how a transaction gets its category": by rule, by hand, review of what has none. Two rungs answer "what a category is" instead: categories mirror the lines of the tax form; a category can be renamed. They become one child, REQ-2.4 The category list, with both rungs deferred under it, and REQ-2.4 is refined on its own.
</example>

<example>
Too far and too short. "The program keeps every file it is given" is a top rung of Statement import only if the node says so; when the premise says it, it could be a sibling of Statement import, so it is set aside as a lift. "CSV statements become transactions" is a case of "a statement in a known format becomes transactions", so the ladder climbs one more rung.
</example>
