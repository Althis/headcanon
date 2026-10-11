---
id: DEC-003
title: "Every hook is a Node script, never a shell script"
state: resolved
date: 2026-10-11
intents: [REQ-2.8, REQ-11.2, REQ-11.3]
---

# Every hook is a Node script, never a shell script

## Resolution

> I like your schemes.

Claude Code session, 2026-10-11.

## Why [assumed]

Claude Code hooks are shell commands. Invoking `node <path>` keeps one implementation for Windows, macOS and Linux; only install instructions differ.
