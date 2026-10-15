// Web 版の PWA (2026-10-15): service worker の持ち方 (scripts/pwa-sw.js)・持つ物の一覧 (scripts/build-sw.mjs)・電波が無い時の要望の置き場 (src/web/outbox.ts)
import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 手元の Cache Storage の代わり (URL の文字列で引く) */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (r: RequestInfo | URL, ignoreSearch = false) => { const u = new URL(typeof r === "string" ? r : r instanceof URL ? r.href : r.url, "https://exiledesk.com"); return ignoreSearch ? u.origin + u.pathname : u.href; };
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    return {
      async match(r: RequestInfo | URL, o?: { ignoreSearch?: boolean }) { const k = keyOf(r, o?.ignoreSearch); for (const [kk, v] of m) if ((o?.ignoreSearch ? keyOf(kk, true) : kk) === k) return v.clone(); return undefined; },
      async put(r: RequestInfo | URL, res: Response) { m.set(keyOf(r), res); },
      async addAll(rs: Request[]) { for (const r of rs) { const res = await (globalThis as unknown as { __swFetch: typeof fetch }).__swFetch(r); if (!res.ok) throw new Error("addAll " + r.url); m.set(keyOf(r), res); } },
    };
  };
  return {
    stores,
    open,
    async keys() { return [...stores.keys()]; },
    async delete(n: string) { return stores.delete(n); },
    async match(r: RequestInfo | URL, o?: { ignoreSearch?: boolean }) { for (const n of stores.keys()) { const hit = await (await open(n)).match(r, o); if (hit) return hit; } return undefined; },
  };
}

/** sw.js を偽の self の上で動かす */
function loadSw(fetchFn: (r: Request) => Promise<Response>) {
  const handlers: Record<string, (e: unknown) => void> = {};
  const caches = fakeCaches();
  const self = { location: new URL("https://exiledesk.com/sw.js"), addEventListener: (t: string, f: (e: unknown) => void) => { handlers[t] = f; }, skipWaiting: vi.fn(), clients: { claim: vi.fn(async () => undefined) } };
  const f = async (r: RequestInfo | URL) => fetchFn(r instanceof Request ? r : new Request(new URL(String(r), "https://exiledesk.com")));
  (globalThis as unknown as { __swFetch: typeof fetch }).__swFetch = f as typeof fetch;
  const src = `const VERSION = "v1"; const ART_VERSION = "a1"; const PRECACHE = ["/", "/assets/web-x.js"];\n${readFileSync(join(ROOT, "scripts/pwa-sw.js"), "utf8")}`;
  // SW の中の new Request("/") は SW の場所から解く (Node の Request は相対の URL を受けない)
  class SwRequest extends Request { constructor(u: RequestInfo | URL, o?: RequestInit) { super(typeof u === "string" ? new URL(u, "https://exiledesk.com") : u, o); } }
  new Function("self", "caches", "fetch", "Request", "Response", src)(self, caches, f, SwRequest, Response);
  /** fetch の出来事を流す。respondWith されなければ null (ブラウザがそのまま取る) */
  const dispatch = async (url: string, mode: RequestMode | "navigate" = "no-cors", method = "GET"): Promise<Response | null> => {
    let p: Promise<Response> | null = null;
    const request = new Request(url, { method });
    Object.defineProperty(request, "mode", { value: mode });
    handlers.fetch!({ request, respondWith: (x: Promise<Response>) => { p = x; } });
    return p ? await p : null;
  };
  const lifecycle = async (t: "install" | "activate") => { let w: Promise<unknown> | null = null; handlers[t]!({ waitUntil: (x: Promise<unknown>) => { w = x; } }); await w; };
  return { handlers, caches, self, dispatch, lifecycle };
}

describe("service worker (scripts/pwa-sw.js)", () => {
  it("入れる時は画面と計算 (PRECACHE) だけ持つ。広告・解析・YouTube は触らない、POST も触らない", async () => {
    const seen: string[] = [];
    const sw = loadSw(async (r) => { seen.push(r.url); return new Response("ok:" + r.url); });
    await sw.lifecycle("install");
    expect(seen).toEqual(["https://exiledesk.com/", "https://exiledesk.com/assets/web-x.js"]);
    expect(await sw.dispatch("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js")).toBeNull();
    expect(await sw.dispatch("https://static.cloudflareinsights.com/beacon.min.js")).toBeNull();
    expect(await sw.dispatch("https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg")).toBeNull();
    expect(await sw.dispatch("https://exiledesk-live.exiledesk.workers.dev/feedback", "cors", "POST")).toBeNull();
    expect(await sw.dispatch("https://exiledesk.com/sw.js")).toBeNull();
  });

  it("エミュレーターの画面は手元の版 (?base= 付きも)、JS は手元から (電波が無くても動く)", async () => {
    let online = true;
    const sw = loadSw(async (r) => { if (!online) throw new TypeError("offline"); return new Response("net:" + new URL(r.url).pathname); });
    await sw.lifecycle("install");
    await sw.lifecycle("activate");
    online = false;
    expect(await (await sw.dispatch("https://exiledesk.com/?base=Wand", "navigate"))!.text()).toBe("net:/");
    expect(await (await sw.dispatch("https://exiledesk.com/assets/web-x.js"))!.text()).toBe("net:/assets/web-x.js");
  });

  it("絵は使った物から順にためる (2 回目は取りに行かない)", async () => {
    let n = 0;
    const sw = loadSw(async () => { n++; return new Response("png"); });
    await sw.dispatch("https://exiledesk.com/base-art/Wand01.webp");
    await sw.dispatch("https://exiledesk.com/base-art/Wand01.webp");
    expect(n).toBe(1);
    expect([...sw.caches.stores.keys()]).toContain("exiledesk-art-a1");
  });

  it("相場 (/boot.json) は電波があれば取り直し、無ければ最後の物", async () => {
    let online = true;
    let price = 1;
    const sw = loadSw(async () => { if (!online) throw new TypeError("offline"); return new Response(JSON.stringify({ market: { at: "t", price: price++ } })); });
    const url = "https://exiledesk-live.exiledesk.workers.dev/boot.json";
    expect(((await (await sw.dispatch(url, "cors"))!.json()) as { market: { price: number } }).market.price).toBe(1);
    expect(((await (await sw.dispatch(url, "cors"))!.json()) as { market: { price: number } }).market.price).toBe(2);
    online = false;
    expect(((await (await sw.dispatch(url, "cors"))!.json()) as { market: { price: number } }).market.price).toBe(2);
  });

  it("版が変わったら古い shell は 1 つ前まで残して消す、絵の版が変われば絵を捨てる", async () => {
    const sw = loadSw(async () => new Response("x"));
    for (const n of ["exiledesk-shell-old1", "exiledesk-shell-old2", "exiledesk-art-old"]) await sw.caches.open(n);
    const data = await sw.caches.open("exiledesk-data");
    await data.put("/__exiledesk-sw-meta", new Response(JSON.stringify({ shells: ["exiledesk-shell-old1", "exiledesk-shell-old2"] })));
    await sw.caches.open("exiledesk-shell-v1");
    await sw.lifecycle("activate");
    expect([...sw.caches.stores.keys()].sort()).toEqual(["exiledesk-data", "exiledesk-shell-old2", "exiledesk-shell-v1"]);
    // 待っている版は「更新」を押した時だけ切り替わる
    expect(sw.self.skipWaiting).not.toHaveBeenCalled();
    sw.handlers.message!({ data: { type: "SKIP_WAITING" } });
    expect(sw.self.skipWaiting).toHaveBeenCalled();
  });
});

describe("持つ物の一覧 (scripts/build-sw.mjs)", () => {
  let dir = "";
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });
  const build = () => { execFileSync(process.execPath, [join(ROOT, "scripts/build-sw.mjs"), dir], { stdio: "pipe" }); return readFileSync(join(dir, "sw.js"), "utf8"); };
  const head = (sw: string) => new Function(`${sw.split("\n").slice(0, 3).join("\n")}; return { VERSION, ART_VERSION, PRECACHE };`)() as { VERSION: string; ART_VERSION: string; PRECACHE: string[] };
  it("画面・計算・ui-art・アイコンは持ち、絵と og.png は持たない。中身が同じなら版も同じ、絵だけ変われば ART_VERSION だけ変わる", () => {
    dir = mkdtempSync(join(tmpdir(), "exiledesk-sw-"));
    for (const d of ["assets", "ui-art", "web", "base-art", "skill-art"]) mkdirSync(join(dir, d));
    writeFileSync(join(dir, "index.html"), "<html>");
    writeFileSync(join(dir, "assets/web-x.js"), "1");
    writeFileSync(join(dir, "ui-art/frame.webp"), "f");
    writeFileSync(join(dir, "web/icon-192.png"), "i");
    writeFileSync(join(dir, "web/og.png"), "o");
    writeFileSync(join(dir, "favicon.png"), "p");
    writeFileSync(join(dir, "base-art/a.webp"), "a");
    writeFileSync(join(dir, "skill-art/b.webp"), "b");
    writeFileSync(join(dir, "about.html"), "<html>");
    const a = head(build());
    expect(a.PRECACHE).toEqual(["/", "/assets/web-x.js", "/favicon.png", "/ui-art/frame.webp", "/web/icon-192.png"]);
    expect(head(build())).toEqual(a);
    writeFileSync(join(dir, "base-art/a.webp"), "a2");
    const b = head(build());
    expect(b.VERSION).toBe(a.VERSION);
    expect(b.ART_VERSION).not.toBe(a.ART_VERSION);
    writeFileSync(join(dir, "assets/web-x.js"), "2");
    expect(head(build()).VERSION).not.toBe(a.VERSION);
  });
});

describe("電波が無い時の要望 (src/web/outbox.ts)", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
  it("置いた物は戻った時に 1 回だけ送り、送れなくても捨てる。届いた物は返事を待つ一覧に", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
    vi.stubGlobal("navigator", { onLine: true });
    vi.doMock("../src/web/pwa", () => ({ onOnline: () => undefined }));
    const sent: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, o: { body: string }) => { sent.push(o.body); return o.body.includes("ng") ? Promise.reject(new TypeError("offline")) : new Response(JSON.stringify({ ok: true, id: "abcd1234" })); }));
    const { queueSend, flushOutbox } = await import("../src/web/outbox");
    expect(queueSend("https://x/feedback", '{"text":"ng"}', "ng")).toBe(true);
    expect(queueSend("https://x/feedback", '{"text":"ok"}', "ok")).toBe(true);
    await flushOutbox();
    expect(sent).toEqual(['{"text":"ng"}', '{"text":"ok"}']);
    expect(store.get("exiledesk.web.outbox")).toBeUndefined();
    await flushOutbox();
    expect(sent).toHaveLength(2);
    expect(JSON.parse(store.get("exiledesk.feedback.sent") ?? "[]")).toMatchObject([{ id: "abcd1234", text: "ok" }]);
  });
});
