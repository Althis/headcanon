---
id: REQ-9.4
parent: REQ-9
title: "HeadCanon's tester writes the tests of a box before it is implemented"
state: stated
source: "docs/design-brief-v0.md:89"
---

# HeadCanon's tester writes the tests of a box before it is implemented

## Stated

> HeadCanon can request acceptance tests from Writ before implementing

Source: docs/design-brief-v0.md:89

## Intent [assumed]

See JRN-2. The tests of a box exist before its code: HeadCanon's tester writes them from the box, of the kind its check needs, in a context apart from the implementation agent's, and HeadCanon's reviewer passes or fails each against the rubric for its kind. Nobody waits for the human, who reads every test on its box's card as a description in plain words of what is tested and how. The tests are recorded in a form Writ can rerun (DEC-026).

