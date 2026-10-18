import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkCanon, checkCommitMessage, loadCanon, parseElementTable, serveUi } from "../src/index.js";
import { cleanSvg } from "../src/ui/server.js";

const MINI = fileURLToPath(new URL("./fixtures/mini/", import.meta.url));

describe("mocks: the record and its element table [REQ-6.8]", () => {
  it("reads an element table like a step table, keeping the id without its #", () => {
    const rows = parseElementTable("| Element | State | Linked requirements |\n| --- | --- | --- |\n| #go Sign up button | stated | REQ-1.1, REQ-1 (the parent) |\n| #skip Skip link | assumed | |");
    expect(rows).toEqual([
      { id: "go", label: "Sign up button", state: "stated", requirements: ["REQ-1.1", "REQ-1"] },
      { id: "skip", label: "Skip link", state: "assumed", requirements: [] },
    ]);
  });

  it("loads a mock from canon/mocks with its picture beside it, and the nodes it binds know nothing extra", () => {
    const canon = loadCanon(MINI);
    const m = canon.mocks.find((x) => x.id === "MOCK-1")!;
    expect(m.title).toBe("Sign-up form");
    expect(m.state).toBe("assumed");
    expect(m.image).toBe("mocks/MOCK-1-signup.svg");
    expect(m.elements.map((e) => e.id)).toEqual(["email", "go", "skip"]);
    expect(canon.nodes["REQ-1.1"]?.mocks).toEqual([]);
  });

  it("notes an element nothing asks for, and reports unknown requirements, unknown mocks and a missing picture", () => {
    const codes = (dir: string) => checkCanon(loadCanon(dir)).map((f) => `${f.level}:${f.code}:${f.id ?? ""}`);
    expect(codes(MINI)).toContain("info:unbound-element:MOCK-1#skip");
    expect(codes(MINI).filter((c) => c.includes("MOCK-1") && c.startsWith("error"))).toEqual([]);

    const dir = mkdtempSync(join(tmpdir(), "headcanon-mocks-"));
    cpSync(MINI, dir, { recursive: true });
    writeFileSync(join(dir, "mocks", "MOCK-2-lost.md"), "---\nid: MOCK-2\ntitle: \"Lost\"\nstate: assumed\n---\n\n| Element | State | Linked requirements |\n| --- | --- | --- |\n| #a A | assumed | REQ-404 |\n");
    writeFileSync(join(dir, "REQ-2-billing.md"), "---\nid: REQ-2\ntitle: \"Billing\"\nstate: assumed\nmocks: [MOCK-1#go, MOCK-9#x, MOCK-1#nope]\n---\n\n# Billing\n");
    const c = codes(dir);
    expect(c).toContain("error:file-missing:MOCK-2");
    expect(c).toContain("error:link-unknown:MOCK-2#a");
    expect(c.filter((x) => x === "error:link-unknown:REQ-2")).toHaveLength(2);
    rmSync(dir, { recursive: true, force: true });
  });

  it("accepts a mock and an element as an intent and as a changed object in a commit message", () => {
    const canon = loadCanon(MINI);
    const ok = checkCommitMessage("docs(canon): redraw the sign-up form\n\nIntent: REQ-1.1, MOCK-1#go\nIntent-Change: update MOCK-1\nApproved-By: Someone\n", canon);
    expect(ok.errors).toEqual([]);
    const bad = checkCommitMessage("docs(canon): x\n\nIntent: MOCK-1#nope\nIntent-Change: update MOCK-9\nApproved-By: Someone\n", canon);
    expect(bad.errors).toContain("Intent MOCK-1#nope does not exist in the canon");
    expect(bad.errors.join("\n")).toMatch(/update.*MOCK-9/);
  });

  it("strips scripts, event handlers and script links from a picture", () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><g id="go" onclick="x()"><a href="javascript:evil()"><rect/></a></g></svg>`;
    const clean = cleanSvg(dirty);
    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("javascript:");
    expect(clean).toContain('id="go"');
  });
});

describe("mocks on the page [REQ-12.1.9]", () => {
  let dir: string;
  let base: string;
  let close: () => void;
  const get = (p: string) => fetch(base + p);
  const send = (p: string, body: unknown) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json() as Promise<Record<string, unknown>>);

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

  it("serves a mock's picture from the canon folder, and only for mocks the canon names", async () => {
    const r = await get("/api/mock/MOCK-1");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("image/svg+xml");
    expect(await r.text()).toContain('id="email"');
    expect((await get("/api/mock/MOCK-9")).status).toBe(404);
    expect((await get("/api/mock/..%2FREADME.md")).status).toBe(404);
  });

  it("carries a mock and a cleaned draft with a question", async () => {
    const asked = await send("/api/ask", { question: "Mock: REQ-1.1 Sign-up form.\n\nIs this the form?", header: "Mock", nodeId: "REQ-1.1", mock: "MOCK-1", draft: `<svg xmlns="http://www.w3.org/2000/svg"><g id="go" onclick="x()"><rect/></g><script>1</script></svg>`, options: [{ label: "Approve as drawn" }, { label: "Drop" }] });
    const s = (await get("/api/session").then((r) => r.json())) as { question: { id: string; mock: string; draft: string } };
    expect(s.question.mock).toBe("MOCK-1");
    expect(s.question.draft).toContain('id="go"');
    expect(s.question.draft).not.toContain("onclick");
    expect(s.question.draft).not.toContain("<script");
    await send("/api/answer", { questionId: asked["questionId"], selected: ["Approve as drawn"], other: "", terms: [] });
    expect(((await get("/api/session").then((r) => r.json())) as { question: unknown }).question).toBeNull();
  });
});
