---
id: REQ-8.7
parent: REQ-8
title: "CUD covers all canon objects; updates are patches; deletes retire; trailers must match the diff; a PR merge is approval"
state: assumed
source: "docs/design-brief-v0.md:85"
---

# CUD covers all canon objects; updates are patches; deletes retire; trailers must match the diff; a PR merge is approval

## Proposed in brief

> CUD covers all canon objects; updates are patches; deletes retire; trailers must match the diff; a PR merge is approval

Source: docs/design-brief-v0.md:85

## Intent

The same operations cover requirements, journeys, glossary terms and decisions. An update carries only the changed fields plus a reason. A delete retires a node with a reason instead of erasing it. The canon diff in git is the change itself; commit trailers list the operations and Writ checks that they match. On GitHub the PR is the change request and a merge is the approval; in a session, approval is the human's explicit words.

