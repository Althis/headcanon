---
id: JRN-3
title: "Writ gates a pull request"
state: assumed
source: "docs/design-brief-v0.md:338-344, 396-411"
---

# Writ gates a pull request

What happens in CI when a PR opens. Three stages, intent before code, and
the report traced to intent is the output a reviewer reads.

```mermaid
flowchart TD
    S1[PR opened; the Writ GitHub Action installs the CLI] --> S2[Stage 1: intent check against the live canon]
    S2 --> S3{Contradiction, glossary conflict or missing approval?}
    S3 -- yes --> S10[Report the finding; check fails]
    S3 -- no --> S4[Stage 2: review code against the package, run its tests]
    S4 --> S5{Package tests pass?}
    S5 -- no --> S10
    S5 -- yes --> S6[Stage 3: rerun every earlier approved test]
    S6 --> S7{Anything worse than its baseline?}
    S7 -- yes --> S8[Surface the regression for approval]
    S8 --> S9{Human approves as an intent change?}
    S9 -- no --> S10
    S9 -- yes --> S11
    S7 -- no --> S11[Report traced to intent: verified, provisional, untested; check passes]
```

| Step | State | Linked requirements |
| --- | --- | --- |
| S1 PR opened, Action installs CLI | assumed | REQ-10.1, REQ-10.2 |
| S2 Stage 1 intent check | assumed | REQ-9.2, REQ-10.5 |
| S3 Contradiction or missing approval? | assumed | REQ-8.7, REQ-9.16 |
| S4 Stage 2 delivery | assumed | REQ-9.2, REQ-10.3 |
| S5 Package tests pass? | assumed | REQ-9.1 |
| S6 Stage 3 preservation | assumed | REQ-9.3, REQ-10.6 |
| S7 Worse than baseline? | assumed | REQ-9.12, REQ-9.14 |
| S8 Surface regression | assumed | REQ-9.12 |
| S9 Approved as intent change? | assumed | REQ-9.14, REQ-8.1 |
| S10 Check fails | assumed | REQ-10.3 |
| S11 Report traced to intent | assumed | REQ-9.1, REQ-9.16 |
