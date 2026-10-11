import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadCanon, serveUi } from "../src/index.js";

const MINI = fileURLToPath(new URL("./fixtures/mini/", import.meta.url));

describe("viewer session endpoints [REQ-12.1.7]", () => {
  let dir: string;
  let base: string;
  let close: () => void;
  const get = (p: string) => fetch(base + p).then((r) => r.json() as Promise<Record<string, unknown>>);
  const send = (p: string, body: unknown, method = "POST") => fetch(base + p, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> }));

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "headcanon-server-"));
    cpSync(MINI, join(dir, "canon"), { recursive: true });
    const served = await serveUi({ canonDir: join(dir, "canon"), port: 0 });
    base = served.url.replace(/\/$/, "");
    close = served.close;
  });
  afterAll(() => {
    close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("asks, shows, answers and hands the answer to a waiter", async () => {
    const asked = await send("/api/ask", { question: "Premise (1 of 5): what it is.\n\nDraft: \"A thing that uses a Widget.\" [1]\n\nSources: [1] README.md:1", header: "Premise", nodeId: "REQ-1", terms: [{ term: "Widget", definition: "a small part" }], options: [{ label: "Approve as written", description: "The Widget stays. [1]" }, { label: "Drop" }] });
    const id = asked.body["questionId"] as string;
    expect(id).toBeTruthy();
    const s = await get("/api/session");
    const q = s["question"] as Record<string, unknown>;
    expect(q["id"]).toBe(id);
    expect(String(q["html"])).toContain('class="jargon" data-term="Widget"');
    // Footnote markers carry their source as a tooltip; the Sources line itself is not shown.
    expect(String(q["html"])).toContain('<sup class="fn" title="README.md:1">[1]</sup>');
    expect(String(q["html"])).not.toContain("Sources:");
    // An option's description gets the same treatment, since list drafts live in the options.
    const opt = (q["options"] as Array<Record<string, string>>)[0]!;
    expect(opt["html"]).toContain('class="jargon" data-term="Widget"');
    expect(opt["html"]).toContain('title="README.md:1"');
    expect((s["focus"] as Record<string, unknown>)["id"]).toBe("REQ-1");
    const pending = await get(`/api/wait?id=${id}&timeout=1`);
    expect(pending["pending"]).toBe(true);
    const ans = await send("/api/answer", { questionId: id, selected: ["Approve as written"], other: "", terms: [{ term: "Widget", decision: "keep" }] });
    expect(ans.status).toBe(200);
    const got = await get(`/api/wait?id=${id}&timeout=1`);
    expect((got["answer"] as Record<string, unknown>)["selected"]).toEqual(["Approve as written"]);
    expect((await get("/api/session"))["question"]).toBeNull();
    expect((await get("/api/wait?id=nope&timeout=1"))["unknown"]).toBe(true);
  });

  it("enshrines a kept term, records a message and a refine request, and reports them as changes", async () => {
    const before = (await get("/api/changes"))["cursor"] as number;
    const kept = await send("/api/term", { term: "Widget", definition: "a small part", decision: "keep" });
    expect(kept.body["id"]).toBe("TERM-widget");
    expect(loadCanon(join(dir, "canon")).terms.map((t) => t.id)).toContain("TERM-widget");
    await send("/api/message", { text: "please go deeper on REQ-1" });
    await send("/api/refine", { id: "REQ-1" });
    const changes = await get(`/api/changes?since=${before}`);
    expect((changes["entries"] as Array<Record<string, unknown>>).map((e) => e["kind"])).toEqual(["term-enshrined", "message", "refine-request"]);
  });

  it("edits a node and creates a child, turning a leaf parent into a folder", async () => {
    const raw = await get("/api/node/REQ-1.1/raw");
    expect(String(raw["text"])).toContain("id: REQ-1.1");
    const bad = await send("/api/node/REQ-1.1", { text: String(raw["text"]).replace("id: REQ-1.1", "id: REQ-9") }, "PUT");
    expect(bad.status).toBe(400);
    const edited = await send("/api/node/REQ-1.1", { text: String(raw["text"]).replace("Sign-up takes under 60 seconds", "Sign-up takes under 30 seconds") }, "PUT");
    expect(edited.status).toBe(200);
    expect(loadCanon(join(dir, "canon")).nodes["REQ-1.1"]?.title).toBe("Sign-up takes under 30 seconds");

    const created = await send("/api/node", { parent: "REQ-1.1", title: "Email is optional", intent: "A player may sign up without an email address." });
    expect(created.status).toBe(200);
    expect(created.body["id"]).toBe("REQ-1.1.1");
    const canon = loadCanon(join(dir, "canon"));
    expect(canon.nodes["REQ-1.1.1"]?.parent).toBe("REQ-1.1");
    expect(canon.nodes["REQ-1.1.1"]?.state).toBe("stated");
    expect(canon.nodes["REQ-1.1.1"]?.layer).toBe("requirement");
    expect(existsSync(join(dir, "canon", "REQ-1-onboarding", "REQ-1.1-fast-signup", "README.md"))).toBe(true);
    expect(readFileSync(join(dir, "canon", "REQ-1-onboarding", "REQ-1.1-fast-signup", "README.md"), "utf8")).toContain("id: REQ-1.1");
    const top = await send("/api/node", { title: "Billing is fair" });
    expect(top.body["id"]).toBe("REQ-3");
  });
});
