---
id: REQ-6.6
parent: REQ-6
title: "ID scheme for requirements, journeys, steps, decisions, terms and datasets"
state: resolved
source: "Claude Code session, 2026-10-11"
---

# ID scheme for requirements, journeys, steps, decisions, terms and datasets

## Intent

Requirements: `REQ-1`, `REQ-1.2`, `REQ-1.2.3`. The dotted path mirrors the folder tree. Moving a node under another parent is a retire plus a create, and retired IDs are never reused.

Journeys and steps: `JRN-1`, with steps written `JRN-1/S3`.

Decisions: `DEC-014`, sequential, zero-padded to three digits.

Glossary terms: `TERM-workspace`, a slug of the term, so change requests can target one definition.

Tests: no separate ID in v1. A test carries the intent ID in its name; a Test-Change trailer cites the test file path plus that intent ID.

Datasets: `DS-1`, Writ-side, later.

## Resolution

> For your proposals, I like your schemes.

Approving the ID scheme as proposed. Resolved 2026-10-11.

## Mocks [assumed]

Mocks: `MOCK-1`, sequential. An element of a mock is written `MOCK-1#finish`, the part after `#` being the element's `id` in the picture (REQ-6.8).

