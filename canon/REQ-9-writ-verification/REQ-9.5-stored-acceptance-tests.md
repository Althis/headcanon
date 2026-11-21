---
id: REQ-9.5
parent: REQ-9
title: "Accepted tests are stored so they aren't regenerated"
state: stated
source: "docs/design-brief-v0.md:90"
---

# Accepted tests are stored so they aren't regenerated

## Stated

> Writ stores acceptance tests so they aren't regenerated

Source: docs/design-brief-v0.md:90

## Intent [assumed]

The accepted tests are the test files in the repository and their record in the canon folder, committed with the canon: each entry names its node by stable id, its kind, its file, its description in plain words and the fingerprint of the file. HeadCanon's tester writes them once and every run reads them; Writ reruns the same record once it exists (DEC-026).

