import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkCanon, checkCommitMessage, loadCanon, parseElementTable, serveUi } from "../src/index.js";
import { bundleMockPage, prepareMockPage } from "../src/ui/server.js";

const MINI = fileURLToPath(new URL("./fixtures/mini/", import.meta.url));

describe("mocks: the record, the page and the element table [REQ-6.8]", () => {
  it("reads an element table like a step table, keeping the id without its #", () => {
    const rows = parseElementTable("| Element | State | Linked requirements |\n| --- | --- | --- |\n| #go Sign up button | stated | REQ-1.1, REQ-1 (the parent) |\n| #skip Skip link | assumed | |");
    expect(rows).toEqual([
      { id: "go", label: "Sign up button", state: "stated", requirements: ["REQ-1.1", "REQ-1"] },
      { id: "skip", label: "Skip link", state: "assumed", requirements: [] },
    ]);
  });

  it("loads a mock from canon/mocks with its page folder beside the record, its needs and its elements", () => {
    const canon = loadCanon(MINI);
    const m = canon.mocks.find((x) => x.id === "MOCK-1")!;
    expect(m.title).toBe("Sign-up form");
    expect(m.state).toBe("assumed");
    expect(m.page).toBe("mocks/MOCK-1-signup/index.html");
    expect(m.folder).toBe("mocks/MOCK-1-signup");
    expect(m.needs).toEqual(["tailwind"]);
    expect(m.elements.map((e) => e.id)).toEqual(["email", "go", "skip"]);
    expect(canon.nodes["REQ-1.1"]?.mocks).toEqual([]);
  });

  it("notes an element nothing asks for, and reports unknown requirements, unknown mocks, an unknown need and a missing page", () => {
    const codes = (dir: string) => checkCanon(loadCanon(dir)).map((f) => `${f.level}:${f.code}:${f.id ?? ""}`);
    expect(codes(MINI)).toContain("info:unbound-element:MOCK-1#skip");
    expect(codes(MINI).filter((c) => c.includes("MOCK-1") && !c.startsWith("info"))).toEqual([]);

    const dir = mkdtempSync(join(tmpdir(), "headcanon-mocks-"));
    cpSync(MINI, dir, { recursive: true });
    writeFileSync(join(dir, "mocks", "MOCK-2-lost.md"), "---\nid: MOCK-2\ntitle: \"Lost\"\nstate: assumed\nneeds: [bootstrap]\n---\n\n| Element | State | Linked requirements |\n| --- | --- | --- |\n| #a A | assumed | REQ-404 |\n");
    writeFileSync(join(dir, "REQ-2-billing.md"), "---\nid: REQ-2\ntitle: \"Billing\"\nstate: assumed\nmocks: [MOCK-1#go, MOCK-9#x, MOCK-1#nope]\n---\n\n# Billing\n");
    const c = codes(dir);
    expect(c).toContain("error:file-missing:MOCK-2");
    expect(c).toContain("warn:unknown-need:MOCK-2");
    expect(c).toContain("error:link-unknown:MOCK-2#a");
    expect(c.filter((x) => x === "error:link-unknown:REQ-2")).toHaveLength(2);
    rmSync(dir, { recursive: true, force: true });
  });

  it("accepts a mock and an element as an intent and as a changed object in a commit message", () => {
    const canon = loadCanon(MINI);
    const ok = checkCommitMessage("docs(canon): rewrite the sign-up form\n\nIntent: REQ-1.1, MOCK-1#go\nIntent-Change: update MOCK-1\nApproved-By: Someone\n", canon);
    expect(ok.errors).toEqual([]);
    const bad = checkCommitMessage("docs(canon): x\n\nIntent: MOCK-1#nope\nIntent-Change: update MOCK-9\nApproved-By: Someone\n", canon);
    expect(bad.errors).toContain("Intent MOCK-1#nope does not exist in the canon");
    expect(bad.errors.join("\n")).toMatch(/update.*MOCK-9/);
  });

  it("prepares a page for the frame: the declared needs in the head, the bridge before the body ends, nothing twice", () => {
    const page = prepareMockPage("<!doctype html><html><head><title>t</title></head><body><div id=\"go\"></div></body></html>", ["tailwind", "lucide"]);
    expect(page.indexOf("@tailwindcss/browser@4")).toBeLessThan(page.indexOf("<title>"));
    expect(page).toContain("unpkg.com/lucide");
    expect(page).toMatch(/hc-light[\s\S]*<\/body>/);
    const already = prepareMockPage("<html><head><script src=\"https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4\"></script></head><body></body></html>", ["tailwind"]);
    expect(already.match(/@tailwindcss\/browser@4/g)).toHaveLength(1);
    const bare = prepareMockPage("<p>just a fragment</p>", []);
    expect(bare.startsWith("<p>just a fragment</p><script>")).toBe(true);
  });

  it("bundles the folder's own files into the page and leaves the rest alone", () => {
    const dir = mkdtempSync(join(tmpdir(), "headcanon-bundle-"));
    writeFileSync(join(dir, "styles.css"), ".card{display:grid;background:url(bg.png)}");
    writeFileSync(join(dir, "bg.png"), Buffer.from([137, 80, 78, 71]));
    writeFileSync(join(dir, "app.js"), "console.log('</script>')");
    const html = `<html><head><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"><link rel="icon" href="bg.png"></head><body><img src="bg.png"><img src="../outside.png"><script src="app.js"></script><script src="https://cdn.example/x.js"></script></body></html>`;
    const out = bundleMockPage(html, dir);
    expect(out).toContain("<style>.card{display:grid;background:url(\"data:image/png;base64,");
    expect(out).toContain('href="https://fonts.googleapis.com/css2?family=Inter"');
    expect(out).toContain('rel="icon" href="bg.png"');
    expect(out).toContain('<img src="data:image/png;base64,');
    expect(out).toContain('src="../outside.png"');
    expect(out).toContain("<script>console.log('<\\/script>')</script>");
    expect(out).toContain('src="https://cdn.example/x.js"');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("mocks on the page [REQ-12.1.9]", () => {
  let dir: string;
  let base: string;
  let close: () => void;
  const get = (p: string, init?: RequestInit) => fetch(base + p, { redirect: "manual", ...init });
  const send = (p: string, body: unknown, headers: Record<string, string> = {}) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "headcanon-mocks-ui-"));
    cpSync(MINI, join(dir, "canon"), { recursive: true });
    const served = await serveUi({ canonDir: join(dir, "canon"), port: 0 });
    base = served.url.replace(/\/$/, "");
    close = served.close;
  });
  afterAll(() => {
    close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("serves a mock's page with its needs and the bridge, a bundle for the frame, its files from the folder, and nothing outside it", async () => {
    const page = await get("/api/mock/MOCK-1/");
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    const html = await page.text();
    expect(html).toContain('id="email"');
    expect(html).toContain('<link rel="stylesheet" href="styles.css">');
    expect(html).toContain("@tailwindcss/browser@4");
    expect(html).toContain("hc-light");
    const bundle = await (await get("/api/mock/MOCK-1/bundle")).text();
    expect(bundle).not.toContain('href="styles.css"');
    expect(bundle).toContain("<style>body { font: 14px system-ui");
    expect(bundle).toContain("hc-light");
    const css = await get("/api/mock/MOCK-1/styles.css");
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toContain("text/css");
    expect((await get("/api/mock/MOCK-1")).status).toBe(302);
    expect((await get("/api/mock/MOCK-1/..%2FMOCK-1-signup.md")).status).toBe(404);
    expect((await get("/api/mock/MOCK-1/nope.css")).status).toBe(404);
    expect((await get("/api/mock/MOCK-9/")).status).toBe(404);
  });

  it("carries a mock and a draft page with a question, the draft prepared for the frame", async () => {
    const asked = (await send("/api/ask", { question: "Mock: REQ-1.1 Sign-up form.\n\nIs this the form?", header: "Mock", nodeId: "REQ-1.1", mock: "MOCK-1", draft: "<!doctype html><html><body><div id=\"go\">Sign up</div></body></html>", options: [{ label: "Approve as drawn" }, { label: "Drop" }] }).then((r) => r.json())) as { questionId: string };
    const s = (await get("/api/session").then((r) => r.json())) as { question: { mock: string; draft: string } };
    expect(s.question.mock).toBe("MOCK-1");
    expect(s.question.draft).toContain('id="go"');
    expect(s.question.draft).toMatch(/hc-light[\s\S]*<\/body>/);
    await send("/api/answer", { questionId: asked.questionId, selected: ["Approve as drawn"], other: "", terms: [] });
    expect(((await get("/api/session").then((r) => r.json())) as { question: unknown }).question).toBeNull();
  });

  it("refuses a change asked from a sandboxed frame, whose origin is null, and takes one from the page", async () => {
    const fromFrame = await send("/api/say", { text: "hi" }, { origin: "null" });
    expect(fromFrame.status).toBe(403);
    const fromPage = await send("/api/say", { text: "hi" }, { origin: base });
    expect(fromPage.status).toBe(200);
  });
});
