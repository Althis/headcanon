---
id: REQ-12.1.7
parent: REQ-12.1
title: "The session asks through the page, focuses the human's screen, and reads the human's edits and branch requests"
state: resolved
layer: requirement
source: "Claude Code session, 2026-10-11"
files: [packages/canon/src/mcp.ts, packages/canon/src/session.ts, packages/canon/src/ui/server.ts, packages/canon/public/app.js]
---

# The session asks through the page, focuses the human's screen, and reads the human's edits and branch requests

## Intent

The viewer's server also serves a Model Context Protocol server that the plugin registers, so the same Claude Code session gains tools it did not have. It asks its questions through the page: the question, the draft, the options and a free-text field render beside the tree, and the answer returns to the tool call. It focuses a node on the human's screen before asking about it. It reads a change feed before drafting: nodes the human edited or created in the page, glossary terms enshrined, free-text messages typed in the page, and requests to define a branch, which is how the human directs where the tree grows instead of the agent walking every branch. A session acts only on its turn, so a message typed while it is idle lands on the next turn; during adoption the session is almost always waiting on a question, so the wait is invisible.

## Resolution

> The implementation task I want you to run is the implementation of the front-end and MCP for the next test.

Claude Code session, 2026-10-11, choosing this design over a separate agent hosted in the web app, which would not be the same session. Resolved 2026-10-11.

## Assumptions

- The question tool waits a bounded time and returns pending when the human has not answered, and a wait tool continues; this keeps tool calls inside Claude Code's timeout. (model assumption)
- Edits made in the page are canon changes like any other: the hook, the check and the verifier see them at commit time, and the agent treats wording the human typed in the page as stated. (model assumption)
