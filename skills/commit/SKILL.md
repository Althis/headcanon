---
name: commit
description: "Composes and runs a git commit in the canon's fixed format: a Conventional Commits header plus the intent trailers. When canon files are staged, first has the verifier review the change for contradictions, reiterations and drift, resolves each finding with the human, and records the review so the hook accepts the commit. Use whenever work is ready to commit in a project that uses HeadCanon."
when_to_use: "The human asks to commit, or a capture, review or adopt step has reached its commit stage."
argument-hint: "[subject]"
---

# Commit with intent trailers

`HC` means `node "${CLAUDE_PLUGIN_ROOT}/packages/canon/bin/headcanon.js"`.

## 1. What is staged

Run `git status --short` and `git diff --cached --stat`. Nothing staged: ask what to stage; never `git add -A` unasked.

## 2. Review the intent change

Run `HC review-hash`. When it reports `required: true`, run the verifier agent (subagent `headcanon:verifier`) on this repository and read its JSON. It also lists `affectedParents`: parents of changed nodes that this change leaves untouched; the verifier reads each one. For each finding, ask the human with AskUserQuestion, one finding per question, quoting both texts:

- reiteration: **Merge into <existing ID>**, **Keep both**; a typed answer says what to do instead.
- contradiction: **<A> stands**, **<B> stands**; a typed answer records it as contested with both positions.
- drift: **Amend the entry**, **Amend the principle**; a typed answer rejects the change.
- uptake: **Update the parent**, **Merge the child into the parent**; a typed answer keeps both and says why.

Apply the answers and re-stage. Run `HC review-hash` again; when the hash changed, run the verifier on the new diff and resolve any new finding the same way. Then write `review.json` as `{"hash": "<hash>", "reviewer": "headcanon:verifier", "findings": [ ...each with its "resolution"... ], "parents": [ {"id": "<each affected parent>", "reason": "<why it still describes its children>"} ]}` and run `HC review-record review.json`. A clean review is recorded the same way with an empty findings list. No canon files staged, or under the threshold: skip this step.

## 3. Derive the trailers

- **Intent**: the requirement or journey IDs this change serves, from the canon's `files:` links and the conversation; otherwise `none (reason)`.
- **Intent-Change**: one per canon operation from the staged files: a new file is `create <ID>`, a modified file `update <ID>` (a mock's picture and record are one operation on `MOCK-n`), a retirement `delete <ID>`, the root README `update ROOT`, a term `create TERM-<slug>`, a principle `create PRN-n`. Read the `id` from the front-matter, never from the filename.
- **Decision**: one per new `canon/decisions/DEC-*.md`.
- **Test-Change**: when a test was weakened, removed or its data changed; cite the test file and the intent change that permits it. No such intent change: stop, because weakening a test needs one and the human's approval first.
- **Consolidated**: when the hook reports a modified rules, skill or canon file that only gained lines. Re-read the file, merge the addition into what is there, and say what you compared or merged.
- **Intent-Review**: the hash from step 2 and the outcome, e.g. `Intent-Review: 3f9a1c2b4d5e, 2 findings, 1 merged, 1 kept`.
- **Approved-By**: required with any Intent-Change or Test-Change. The approving human's git `user.name` only if they approved in this conversation; otherwise `pending (how approval will happen)`.

## 4. Compose and commit

```
<type>(<scope>): <subject, imperative, under 72 characters>

<one short paragraph: what changed and why>

Intent: REQ-x
Intent-Change: update REQ-x
Intent-Review: <hash>, <outcome>
Approved-By: <name or pending (...)>
```

Types: feat, fix, docs, chore, refactor, test, build, ci, perf, style, revert. Write the message to a file, run `HC commit-msg <file>`, fix every error, then `git commit -F <file>`. Show the human the message and the hash. Never `--no-verify`; never a real name in Approved-By the human did not earn here.
