---
name: commit
description: "Compose and run a git commit in the canon's fixed format: a Conventional Commits header plus the intent trailers (Intent, Intent-Change, Decision, Test-Change, Approved-By). Reads the staged changes, derives the intent IDs and canon operations, validates the message with the commit-msg checker, and commits. Use whenever work is ready to commit in a project that uses HeadCanon."
when_to_use: The human asks to commit, or a capture, review or adopt step has reached its commit stage.
argument-hint: "[subject]"
---

# Commit with intent trailers

`HC` below means: `node "${CLAUDE_PLUGIN_ROOT}/packages/canon/bin/headcanon.js"`.

## 1. Look at what is staged

Run `git status --short` and `git diff --cached --stat`. If nothing is staged, ask what to stage; never `git add -A` on the human's behalf without saying so.

## 2. Derive the trailers

- **Intent**: the requirement or journey IDs this change serves. For code, read the `files:` links in the canon (`grep -r "files:" canon`) and the conversation. If the change serves no intent, write `Intent: none (reason)`; a reason is required.
- **Intent-Change**: one trailer per canon operation, derived from the staged canon files: a new file is `create <ID>`, a modified file is `update <ID>`, a retirement is `delete <ID>`. Read the `id` from each file's front-matter; never guess an ID from a filename. A change to the root README's purpose or non-goals is `update ROOT`; a glossary term is `create TERM-<slug>` or `update TERM-<slug>`.
- **Decision**: one per new `canon/decisions/DEC-*.md`.
- **Test-Change**: present when a test was weakened, removed or its data changed. Cite the test file and the intent change that permits it. If there is no such intent change, stop: weakening a test needs an intent change and human approval first.
- **Approved-By**: required when there is any Intent-Change or Test-Change. Use the approving human's git `user.name` (`git config user.name`) only if they explicitly approved the change in this conversation. Otherwise write `Approved-By: pending (<how approval will happen, e.g. merge of PR>)`.

## 3. Compose the message

```
<type>(<scope>): <subject in the imperative, under 72 characters>

<one short paragraph: what changed and why, in prose>

Intent: REQ-x, REQ-y
Intent-Change: update REQ-x
Decision: DEC-nnn
Approved-By: <name or pending (...)>
```

Types: feat, fix, docs, chore, refactor, test, build, ci, perf, style, revert. Scope is optional. The trailers are the last paragraph, nothing after them except other trailers such as Co-Authored-By.

## 4. Validate, then commit

Write the message to a temporary file and run `HC commit-msg <file>`. Fix every error it reports. Then `git commit -F <file>`. The installed commit-msg hook runs the same check; if it rejects the commit, the message, not the hook, is wrong.

Show the human the final message and the commit hash.

## Rules

- Never bypass the hook (`--no-verify`).
- Never write a real name in Approved-By that the human did not earn by approving in this conversation.
- A commit that changes intent and a commit that changes code may be the same commit; the trailers make the intent change visible either way.
