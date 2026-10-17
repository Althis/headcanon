# HeadCanon

A Claude Code plugin that keeps a coding agent aligned with what the human
is actually trying to build.

AI coding agents lose track of intent in large projects and over many
iterations. HeadCanon captures intent before the agent acts and keeps it
alive afterward, so the agent can check its own short-term decisions
against it, surface its interpretation early, and stop to negotiate when
it hits an obstacle instead of quietly building something else.

HeadCanon is one of two products that share one intent format, the
**canon**:

- **HeadCanon** (this repo): the agent-side plugin, plus the shared canon
  format and CLI.
- **Writ**: the verification gate that runs in CI on every commit, PR or
  release. Lives in its own repo.

## Status

Pre-alpha. The project is being built with itself from the first commit:
every commit follows the canon's intent trailer format, the repo's own
`canon/` folder is the first canon, and the commit-msg hook that enforces
the format is installed here.

The design brief that started the project is in
[docs/design-brief-v0.md](docs/design-brief-v0.md).

## Use it on a project

Node 20 or newer. From a checkout of this repository:

```bash
npm install
npm run build
```

Then start Claude Code in the project you want to align, with the plugin
loaded from the checkout:

```bash
claude --plugin-dir "C:\path\to\headcanon"
```

Every session starts with the canon's rules, state and tree injected. In a
project with no canon yet, run `/headcanon:adopt`: it inventories the
repository's existing intent artifacts, installs the commit-msg hook, and
elicits the purpose, non-goals and glossary in your own words before
proposing a first requirement tree for you to approve.

| Skill | What it does |
| --- | --- |
| `/headcanon:adopt` | Start the canon in a project that has none, from its existing artifacts and your words |
| `/headcanon:capture` | Turn what the conversation established into a change request you approve |
| `/headcanon:review` | Walk assumed, open and contested items one at a time |
| `/headcanon:commit` | Compose a commit with the intent trailers and run it through the hook |

## CLI

All commands read `./canon`; pass `--canon <dir>` for another one.

```bash
npm run headcanon -- init       # canon skeleton + commit-msg hook in this repo
npm run check                   # validate the canon; exit 1 on errors
npm run summary                 # the requirement tree as plain text
npm run headcanon -- attention  # what waits on the human
npm run headcanon -- render     # canon/INDEX.md, the Mermaid index for GitHub
npm run ui                      # local viewer at http://127.0.0.1:4317/
npm test
```

## Layout

```
canon/            this project's own intent, in the canon format
packages/canon/   @headcanon/canon: parser, checks, text tree, CLI, viewer, hook
skills/           the plugin's skills
hooks/            the plugin's hook configuration
.claude-plugin/   the plugin manifest
docs/             the design brief
```

## License

Apache 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Work through the page

The plugin registers an MCP server, `headcanon mcp`, that starts the viewer when none is running and gives the session five tools: ask a question in the page, keep waiting for its answer, focus a node on the screen, read what the human did in the page, and open the browser. During adoption the agent asks through the page: the draft appears beside the tree, jargon the glossary does not define is marked with a tooltip where a check enshrines the term and a cross drops it, and the answer returns to the session. In the tree, every node has Define this branch, Edit and New child; what you type there is recorded as your words, and the session reads it before its next draft.

```bash
npm run headcanon -- terms --text "a draft to scan for jargon"
```
