import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const MINI = fileURLToPath(new URL("./fixtures/mini/", import.meta.url));
const BIN = fileURLToPath(new URL("../bin/headcanon.js", import.meta.url));

describe("mcp server over stdio [REQ-12.1.7]", () => {
  let dir: string;
  let client: Client;
  const port = 20000 + Math.floor(Math.random() * 20000);

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "headcanon-mcp-"));
    cpSync(MINI, join(dir, "canon"), { recursive: true });
    client = new Client({ name: "test", version: "0" });
    const transport = new StdioClientTransport({ command: process.execPath, args: [BIN, "mcp", "--canon", join(dir, "canon"), "--port", String(port), "--no-open"], stderr: "pipe" });
    await client.connect(transport);
  }, 60000);
  afterAll(async () => {
    await client.close().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  });

  it("lists the five tools and answers through the viewer it started", async () => {
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name).sort()).toEqual(["headcanon_ask", "headcanon_changes", "headcanon_focus", "headcanon_open", "headcanon_wait"]);

    const focus = await client.callTool({ name: "headcanon_focus", arguments: { id: "REQ-1" } });
    expect(JSON.parse((focus.content as Array<{ text: string }>)[0]!.text).ok).toBe(true);

    // Ask with a one-second wait: the human has not answered, so it comes back pending.
    const asked = await client.callTool({ name: "headcanon_ask", arguments: { question: "Premise (1 of 5): what it is. Draft: \"x\"", header: "Premise", waitSeconds: 1 } });
    const r = JSON.parse((asked.content as Array<{ text: string }>)[0]!.text) as { pending?: boolean; questionId: string; url: string };
    expect(r.pending).toBe(true);
    expect(r.url).toBe(`http://127.0.0.1:${port}/`);

    // The human answers in the page; the wait tool returns it.
    const res = await fetch(`${r.url}api/answer`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ questionId: r.questionId, selected: ["Drop"], other: "", terms: [] }) });
    expect(res.ok).toBe(true);
    const waited = await client.callTool({ name: "headcanon_wait", arguments: { questionId: r.questionId, waitSeconds: 2 } });
    const w = JSON.parse((waited.content as Array<{ text: string }>)[0]!.text) as { answered: boolean; answer: { selected: string[] } };
    expect(w.answered).toBe(true);
    expect(w.answer.selected).toEqual(["Drop"]);

    const changes = await client.callTool({ name: "headcanon_changes", arguments: { since: 0 } });
    const c = JSON.parse((changes.content as Array<{ text: string }>)[0]!.text) as { entries: Array<{ kind: string }> };
    expect(c.entries.map((e) => e.kind)).toContain("answer");
  }, 60000);
});
