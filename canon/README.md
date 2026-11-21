---
id: ROOT
title: "HeadCanon canon"
state: stated
source: "docs/design-brief-v0.md:7"
format: 3
---

# HeadCanon canon

This folder is the canon for HeadCanon itself: the project's own intent,
recorded in the format HeadCanon asks every project to use. It was seeded
from the design brief in `docs/design-brief-v0.md` and the Claude Code
session of 2026-10-11.

## Stated

> AI coding agents lose track of what the human is trying to build, especially in large projects and over many iterations. This framework captures human intent before the AI acts and keeps it alive afterward. The AI can then check its own short-term decisions against it.

Source: docs/design-brief-v0.md:7

> In fact, this sounds really good: Consolidation instead of Addition. Please add it as one of OUR principles for HeadCanon.

Source: Claude Code session, 2026-10-11

## How this canon is organized [assumed]

- `REQ-<n>-<slug>/README.md` is a requirement with children; `REQ-<n>.<m>-<slug>.md` is a leaf.
- `journeys/` holds user journeys, `decisions/` holds decision records.
- Every node's front-matter has `id`, `title`, `state` and `source`. `parent`, `kind`, `steps`, `files` and `baseline` appear when they apply.
- A node's `state` describes the node as a whole. A body section whose certainty differs carries a bracketed marker on its heading, for example `## Intent [assumed]` under a stated node.
- A `## Stated` section is always a verbatim quote with its source. `## Proposed in brief` quotes a proposal from the brief that the user has not confirmed. `## Resolution` quotes the user's words of agreement.
- Seeding rule: brief rows marked Decided became `stated`, Proposed became `assumed`, Open became `open`. Proposals made and explicitly agreed in the session became `resolved`.

## Not this

> - **A heavy upfront specification phase.** Existing spec-driven tools are criticized for burying small changes under stories and markdown files. This framework must stay light.
> - **Replacing teams' test tooling.** Writ builds on the test frameworks teams already use.
> - **Solving every negotiation ahead of time.** Negotiation is a mode the system enters when needed.
> - **Owning the user's CLAUDE.md** (proposed). HeadCanon injects its own context instead of editing that file.
> - **Claiming guarantees** (proposed). Tests give evidence, not proof, and the framework should say so.

Source: docs/design-brief-v0.md:37-41. The last two are marked proposed in the brief and are assumed here.

## Principles

**PRN-1 Consolidation instead of addition**
When intent changes, the first move is to revise what exists: an entry that already says it is updated, a child that restates its parent is merged up, a rule that overlaps another is folded in. A new entry, rule or line is the last resort, taken when nothing in the canon can absorb the change. Growth by appending is the drift HeadCanon exists to catch, in its own records before anyone else's.
Source: conversation, 2026-10-11

## Glossary [assumed]

Terms as the agent understands them from the brief and the session. Each is assumed until the user confirms it (REQ-5.3.4). A definition says what the term is and covers one concept (REQ-5.1.1).

**canon** (`TERM-canon`): The whole body of recorded intent for a project: the requirement tree, journeys, glossary and decisions, stored as files under `canon/`.

**HeadCanon** (`TERM-headcanon`): The Claude Code plugin that keeps the agent aligned with the canon during implementation. Also the name of the repository that holds the shared canon package.

**Writ** (`TERM-writ`): The verification tool that runs in CI on every commit, PR or release and checks the change against the canon. Passing it is the permission to proceed.

**intent** (`TERM-intent`): What the user is trying to achieve, at any level of abstraction. Recorded as requirements and journeys.

**requirement** (`TERM-requirement`): One node of the intent tree. Broad near the root, binary at the leaves.

**leaf** (`TERM-leaf`): A requirement refined far enough to be measured as a yes or a no.

**journey** (`TERM-journey`): A decision graph showing how the user envisions the product working, with steps linked to requirements. An intent record.

**step** (`TERM-step`): One node of a journey graph, written `JRN-1/S3`.

**certainty state** (`TERM-certainty-state`): One of stated, assumed, open, contested or resolved, carried by every requirement node and journey step.

**stated** (`TERM-stated`): The user's own words, quoted verbatim.

**assumed** (`TERM-assumed`): The agent's interpretation, awaiting the user's confirmation.

**open** (`TERM-open`): A known unknown that either side has recorded.

**contested** (`TERM-contested`): User and agent disagree, and the disagreement is recorded.

**resolved** (`TERM-resolved`): Settled on the user's explicit agreement, with the resolution recorded. Tacit approval never counts.

**change request** (`TERM-change-request`): A set of create, update and delete operations on canon objects, proposed by the agent and approved by the user. The only way the agent changes the canon.

**retire** (`TERM-retire`): What a delete operation does: it marks a node retired with a reason instead of erasing it.

**trailer** (`TERM-trailer`): A `Key: value` line at the end of a git commit message, such as `Intent: REQ-1.2`. The commit format carries intent in trailers, never in free-form prose.

**decision** (`TERM-decision`): A short-term implementation choice recorded in `canon/decisions/`, linked to the intent it serves. Flagged for review when that intent changes.

**divergence** (`TERM-divergence`): A moment the agent notices it is about to drift from intent: an obstacle, a decisive assumption, a contradiction, or an untestable leaf. Each caught divergence is tagged with its origin.

**negotiation mode** (`TERM-negotiation-mode`): The mode the agent enters when a divergence cannot be resolved without changing intent. Entered on a trigger.

**workaround** (`TERM-workaround`): A way past an obstacle that preserves intent: every affected journey still plays out as written. Recorded as a decision.

**package** (`TERM-package`): An approved set of intent changes plus the acceptance tests locked to it. Writ's unit of verification.

**baseline** (`TERM-baseline`): The last approved value of a numeric or open-ended requirement, or "passing" for a binary one. Anything worse needs approval.

**preservation** (`TERM-preservation`): Writ's third stage: rerunning every test from earlier approved packages to catch erosion.

**Test Bay** (`TERM-test-bay`): The user's local folder for projects in development.
**premise** (`TERM-premise`) [assumed]: The root of the canon: what the project is, for whom, what it is not, and its principles; approved by the user before anything is drafted under it.
**evidence** (`TERM-evidence`) [assumed]: An artifact line, a chat message or a user edit that a node, edge or requirement rests on; related to the node as owns, relates or supports.
**refine** (`TERM-refine`) [assumed]: To branch a node into its children; to redefine is to do it again after a change.
**draft** (`TERM-draft`) [assumed]: The state of a node whose definition waits on an issue; it has a name and a place, not yet a settled Intent.
**impact** (`TERM-impact`) [assumed]: The rank of a node on the user's list: 1 plus the nodes below it, plus the rungs still to materialise below it, plus the nodes waiting on it; red nodes rank anywhere and win ties.
**issue** (`TERM-issue`) [assumed]: A request for the user's help filed by the session or by an implementation agent: a contradiction, a disambiguation, an apocrypha, an undefined or an impossible; transient, while the node's state in the file is the record.
**contradiction** (`TERM-contradiction`) [assumed]: An issue in which two user-checkable sources cannot both hold; code against an approved node is a failure, not a contradiction.
**disambiguation** (`TERM-disambiguation`) [assumed]: An issue in which a word the user used does not pass the clarity tests; settled by a glossary term or a rewrite.
**apocrypha** (`TERM-apocrypha`) [assumed]: An issue in which the user's own wording fails the quality rubric; the agent helps them reach a wording that passes.
**undefined** (`TERM-undefined`) [assumed]: An issue in which no evidence, practice or common sense points one way; options when any exist, free text always.
**impossible** (`TERM-impossible`) [assumed]: An issue in which repeated attempts to make a node's tests pass have failed; it asks the user how to deal with the problem.
**guided mode** (`TERM-guided-mode`) [assumed]: Operation one level below the last approved node at a time, each level gated on approval; slower and cheaper.
**full-auto mode** (`TERM-full-auto-mode`) [assumed]: Operation breadth first to the leaves with no gate after the premise; faster and costlier, with an optional cap on agents or spend.
**out of sync** (`TERM-out-of-sync`) [assumed]: The mark of a node whose code and Intent disagree: code is bound to it as contradicting it, or it is built and one of its accepted tests fails, was changed or is missing; drawn as a red dashed ring a little outside the node.
**builder test** (`TERM-builder-test`) [assumed]: The tester's first pass over a capability, from the canon's text alone: each test case written in plain words as given, when, then, and a list of every gap, what it had to assume, a gap being costly when a wrong guess would break other people's work.
**implementation agent** (`TERM-implementation-agent`) [assumed]: The agent that builds one slice, on the model the user is using and free in how it builds; held at its stop until the tests of its nodes pass or each node still failing has an issue, and at its commits, which carry the intent format.
**slice** (`TERM-slice`) [assumed]: One node of a build round together with the nodes below it: what one implementation agent is given, whose tests it owes, and what the user approves, sends back or discards.
