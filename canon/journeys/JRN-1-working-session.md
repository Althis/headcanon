---
id: JRN-1
title: "A working session with HeadCanon"
state: assumed
source: "docs/design-brief-v0.md:258-281, 464-478"
---

# A working session with HeadCanon

How a developer and the agent get from a request to a committed change
without intent drifting. Derived from the Workflow and Architecture sections
of the brief; the shape is the agent's reading and awaits confirmation.
From the tests to the commit, steps S7 to S15, this journey is told in full
by JRN-2, the Implement/align journey (DEC-026).

```mermaid
flowchart TD
    S1[Session starts: canon summary injected] --> S2[Developer asks for work]
    S2 --> S3[Agent maps the request to the canon and Glossary]
    S3 --> S4{Gap, ambiguity or undefined term?}
    S4 -- yes --> S5[Record assumed or open entries, or ask]
    S5 --> S6
    S4 -- no --> S6[Refine the touched branch to binary leaves]
    S6 --> S7[Tests of the kind each check needs are written and reviewed, as in JRN-2]
    S7 --> S8[An implementation agent builds each node against its tests, as in JRN-2]
    S8 --> S9{Obstacle?}
    S9 -- no --> S13
    S9 -- yes --> S10{Intent preserved by a workaround?}
    S10 -- yes --> S11[Record the workaround as a decision] --> S8
    S10 -- no --> S12[Negotiation: surface the obstacle and options] --> S6
    S13[Stop gate: the agent stops when its tests pass, or each failing node has an issue] --> S14{The user approves what was built?}
    S14 -- no --> S8
    S14 -- yes --> S15[Commit in the intent format, with the changes to the canon]
```

| Step | State | Linked requirements |
| --- | --- | --- |
| S1 Session starts | assumed | REQ-11.1 |
| S2 Developer asks for work | assumed | REQ-1 |
| S3 Map request to canon and Glossary | assumed | REQ-5.1, REQ-5.2 |
| S4 Gap or ambiguity? | assumed | REQ-5.4, REQ-3.4 |
| S5 Record assumed or open entries, or ask | assumed | REQ-5.3, REQ-5.4, REQ-5.3.4 |
| S6 Refine to binary leaves | assumed | REQ-3.3, REQ-7.1 |
| S7 Tests written and reviewed | assumed | REQ-7.1, REQ-9.4 |
| S8 Implement | assumed | REQ-7.1 |
| S9 Obstacle? | assumed | REQ-7.2.1 |
| S10 Intent preserved? | assumed | REQ-7.4 |
| S11 Record workaround as a decision | assumed | REQ-7.3, REQ-8.2, REQ-1.3.1 |
| S12 Negotiation | assumed | REQ-7.2, REQ-7.5 |
| S13 Stop gate | assumed | REQ-11.1, REQ-11.1.1, REQ-11.1.2 |
| S14 The user's decision | assumed | REQ-7.1, REQ-12.1.8 |
| S15 Commit in the intent format | assumed | REQ-8.3, REQ-8.5, REQ-8.5.1 |
