---
id: REQ-11.2.1
parent: REQ-11.2
title: "The minimal plugin: session context, four skills, init with the hook, render"
state: resolved
source: "Claude Code session, 2026-10-11"
files: [.claude-plugin/plugin.json, hooks/hooks.json, skills/adopt/SKILL.md, skills/capture/SKILL.md, skills/review/SKILL.md, skills/commit/SKILL.md]
---

# The minimal plugin: session context, four skills, init with the hook, render

## Intent

The first harness is the smallest set that lets an agent guide a human through adoption and elicitation on a real project:

- A SessionStart hook that injects the rules, the canon's state, what waits on the human, the glossary and the tree.
- Rules injected every session rather than written into the project's CLAUDE.md.
- Skills: `adopt` for a project without a canon, `capture` to turn a conversation into a change request, `review` to walk assumed and open items, `commit` to compose a conforming commit.
- `headcanon init`, which creates the skeleton and installs the commit-msg hook.
- `headcanon render`, the Mermaid index.

The Stop gate, the test-protection hook and the verifier subagent stay in Phase 4.

## Resolution

> Agreed with your numbered points. PRs are merged also.
> Lets go to phase 3 you suggest then.

Claude Code session, 2026-10-11, approving the plugin contents proposed in the previous turn. Resolved 2026-10-11.

## Assumptions

- Skills carry the detailed procedure; the injected rules carry only what applies every turn. (model assumption)
- A skill may run the CLI through the launcher at `packages/canon/bin/headcanon.js` under the plugin root. (model assumption)
