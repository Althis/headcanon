import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serveUi } from "../src/index.js";

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
    expect(tools.tools.map((t) => t.name).sort()).toEqual(["headcanon_ask", "headcanon_changes", "headcanon_focus", "headcanon_open", "headcanon_say", "headcanon_wait"]);

    // The session speaks, and a waiting changes call wakes on the human's next action.
    const said = await client.callTool({ name: "headcanon_say", arguments: { text: "Hello from the session.", nodeId: "REQ-1" } });
    expect(JSON.parse((said.content as Array<{ text: string }>)[0]!.text).kind).toBe("say");
    const cursor = JSON.parse((await client.callTool({ name: "headcanon_changes", arguments: {} }).then((r) => (r.content as Array<{ text: string }>)[0]!.text))).cursor as number;
    const waiting = client.callTool({ name: "headcanon_changes", arguments: { since: cursor, waitSeconds: 5 } });
    await new Promise((r) => setTimeout(r, 200));
    await fetch(`http://127.0.0.1:${port}/api/message`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "What do you mean by 'widget'?", nodeId: "REQ-1" }) });
    const woke = JSON.parse(((await waiting).content as Array<{ text: string }>)[0]!.text) as { entries: Array<{ kind: string; id?: string }> };
    expect(woke.entries.map((e) => `${e.kind}:${e.id}`)).toEqual(["message:REQ-1"]);

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

  it("pages several questions in one call and returns every answer in order", async () => {
    const asked = await client.callTool({ name: "headcanon_ask", arguments: { questions: [{ question: "First?", header: "A", nodeId: "REQ-1", notice: "The hook is installed." }, { question: "Second?", header: "B", nodeId: "REQ-2" }], waitSeconds: 1 } });
    const r = JSON.parse((asked.content as Array<{ text: string }>)[0]!.text) as { questionIds: string[]; pending?: boolean; pendingIds: string[]; url: string };
    expect(r.questionIds).toHaveLength(2);
    expect(r.pending).toBe(true);
    // The page shows the first question, with its notice and 1 more after it, and focuses its node, not the last one's.
    const s = (await fetch(`${r.url}api/session`).then((x) => x.json())) as { question: { id: string; notice: string }; pending: number; focus: { id: string } };
    expect(s.question.id).toBe(r.questionIds[0]);
    expect(s.question.notice).toBe("The hook is installed.");
    expect(s.pending).toBe(2);
    expect(s.focus.id).toBe("REQ-1");
    for (const [i, id] of r.questionIds.entries()) {
      await fetch(`${r.url}api/answer`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ questionId: id, selected: [i === 0 ? "Approve as written" : "Drop"], other: "", terms: [] }) });
    }
    const w1 = await client.callTool({ name: "headcanon_wait", arguments: { questionId: r.questionIds[0], waitSeconds: 2 } });
    const w2 = await client.callTool({ name: "headcanon_wait", arguments: { questionId: r.questionIds[1], waitSeconds: 2 } });
    const a = [w1, w2].map((w) => (JSON.parse((w.content as Array<{ text: string }>)[0]!.text) as { answer: { selected: string[] } }).answer.selected[0]);
    expect(a).toEqual(["Approve as written", "Drop"]);
  }, 60000);
});

describe("two projects never share a page [REQ-12.1.7]", () => {
  it("skips a port whose viewer serves another canon and starts its own, even before init", async () => {
    const other = mkdtempSync(join(tmpdir(), "headcanon-mcp-other-"));
    cpSync(MINI, join(other, "canon"), { recursive: true });
    const busy = await serveUi({ canonDir: join(other, "canon"), port: 0 });
    // The project has no canon folder yet, as in the first minutes of an adopt run.
    const fresh = join(mkdtempSync(join(tmpdir(), "headcanon-mcp-fresh-")), "canon");
    const client = new Client({ name: "test", version: "0" });
    const transport = new StdioClientTransport({ command: process.execPath, args: [BIN, "mcp", "--canon", fresh, "--port", String(busy.port), "--no-open"], stderr: "pipe" });
    try {
      await client.connect(transport);
      const opened = await client.callTool({ name: "headcanon_open", arguments: {} });
      const { url } = JSON.parse((opened.content as Array<{ text: string }>)[0]!.text) as { url: string };
      expect(url).not.toBe(busy.url);
      const h = (await fetch(`${url}api/health`).then((r) => r.json())) as { canon: string };
      expect(resolve(h.canon).toLowerCase()).toBe(resolve(fresh).toLowerCase());
      const snap = (await fetch(`${url}api/snapshot`).then((r) => r.json())) as { stats: { nodes: number } };
      expect(snap.stats.nodes).toBe(0);
    } finally {
      await client.close().catch(() => {});
      busy.close();
      rmSync(other, { recursive: true, force: true });
    }
  }, 60000);
});
