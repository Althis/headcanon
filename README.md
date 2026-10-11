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
every commit follows the canon's intent trailer format, and the repo's own
`canon/` folder is the first canon.

The design brief that started the project is in
[docs/design-brief-v0.md](docs/design-brief-v0.md).

## Try it

Node 20 or newer.

```bash
npm install
npm run ui        # local viewer at http://127.0.0.1:4317/
npm run check     # validate the canon; exit 1 on errors
npm run summary   # the requirement tree as plain text
npm test
```

All three commands read `./canon`; pass `--canon <dir>` for another one.
The viewer has no build step and no watcher: edit a canon file and press
Refresh.

## Layout

```
canon/            this project's own intent, in the canon format
packages/canon/   @headcanon/canon: parser, checks, text tree, CLI, viewer
docs/             the design brief
```

## License

Apache 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
