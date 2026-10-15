// Web のセキュリティのヘッダー (server/web/security-headers.js、2026-10-16)。
// 正解の出どころ: AdSense の CSP の案内にある読み込み先と、今のコード (web.html・public/*.html・src/web) が読みに行く先
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error JS のまま (Worker と vite の設定から読む)
import { cspDirectives, headersFileText, LIVE_API, securityHeaders, withSecurityHeaders } from "../server/web/security-headers.js";

const read = (p: string): string => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
type Dirs = Record<string, string[]>;
/** CSP の 1 つの決まりがその URL を許すか (ホストの * は 1 段以上のサブドメイン) */
function allows(list: string[], url: string): boolean {
  const u = new URL(url);
  return list.some((src) => {
    if (src === "'self'") return u.origin === "https://exiledesk.com";
    if (src === "https:") return u.protocol === "https:";
    if (!/^https?:\/\//.test(src)) return false;
    const s = new URL(src.replace("*.", "wild."));
    if (s.protocol !== u.protocol) return false;
    return src.includes("*.") ? u.hostname.endsWith(s.hostname.replace(/^wild/, "")) : u.hostname === s.hostname;
  });
}

describe("セキュリティのヘッダー", () => {
  const d = cspDirectives() as Dirs;

  it("public/_headers は security-headers.js から作った物のまま", () => {
    expect(read("public/_headers").replace(/\r\n/g, "\n")).toBe(headersFileText());
  });

  it("埋め込みを止める・nosniff・Referrer-Policy・object / base の締め", () => {
    const h = securityHeaders() as Record<string, string>;
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(d["frame-ancestors"]).toEqual(["'none'"]);
    expect(d["object-src"]).toEqual(["'none'"]);
    expect(d["base-uri"]).toEqual(["'self'"]);
  });

  it("AdSense の読み込み先を許す (スクリプト・通信・枠)", () => {
    for (const u of ["https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js", "https://tpc.googlesyndication.com/sodar/x.js", "https://googleads.g.doubleclick.net/pagead/ads", "https://adservice.google.com/adsid/integrator.js", "https://adservice.google.co.jp/adsid/integrator.js", "https://www.googletagservices.com/activeview/js/current/x.js", "https://ep2.adtrafficquality.google/sodar/x.js", "https://fundingchoicesmessages.google.com/i/x"]) {
      expect(allows(d["script-src"]!, u), u).toBe(true);
      expect(allows(d["connect-src"]!, u), u).toBe(true);
    }
    for (const u of ["https://googleads.g.doubleclick.net/pagead/ads?x", "https://tpc.googlesyndication.com/safeframe/1-0-40/html/container.html", "https://www.google.com/recaptcha/api2/aframe", "https://ep2.adtrafficquality.google/sodar/x.html"]) expect(allows(d["frame-src"]!, u), u).toBe(true);
    expect(allows(d["img-src"]!, "https://tpc.googlesyndication.com/simgad/123")).toBe(true);
  });

  it("今のコードが読みに行く外の先を全部許す", () => {
    // 頭で読むスクリプト・CSS (web.html と public の単独のページ、/bases/ の雛形)
    const heads = ["web.html", "public/about.html", "public/contact.html", "public/guide.html", "public/privacy.html", "scripts/build-seo-pages.mjs"].map(read).join("\n");
    for (const [, src] of heads.matchAll(/<script[^>]*\ssrc="(https:[^"]+)"/g)) expect(allows(d["script-src"]!, src!), src).toBe(true);
    for (const [, href] of heads.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="(https:[^"]+)"/g)) expect(allows(d["style-src"]!, href!), href).toBe(true);
    expect(allows(d["font-src"]!, "https://fonts.gstatic.com/s/zenkakugothicnew/v1/x.woff2")).toBe(true);
    // server/live (Web の接続先と問い合わせのページ)
    expect(read("src/web/config.ts")).toContain(LIVE_API);
    expect(read("public/contact.html")).toContain(`${LIVE_API}/feedback`);
    expect(allows(d["connect-src"]!, `${LIVE_API}/boot.json`)).toBe(true);
    // Cloudflare Web Analytics
    expect(read("src/web/main.ts")).toContain("https://static.cloudflareinsights.com/beacon.min.js");
    expect(allows(d["script-src"]!, "https://static.cloudflareinsights.com/beacon.min.js")).toBe(true);
    expect(allows(d["connect-src"]!, "https://cloudflareinsights.com/cdn-cgi/rum")).toBe(true);
    // 配信の欄の絵 (server/live が配るサムネイル・アイコン)
    for (const u of ["https://i.ytimg.com/vi/x/mqdefault.jpg", "https://yt3.ggpht.com/x", "https://static-cdn.jtvnw.net/previews-ttv/x.jpg"]) expect(allows(d["img-src"]!, u)).toBe(true);
    // シミュレーションの作業場所 (new Worker)
    expect(d["worker-src"]).toContain("'self'");
  });

  it("Worker を通したページにも付く (move-gate.js)", async () => {
    const res = withSecurityHeaders(new Response("<html></html>", { headers: { "content-type": "text/html" } })) as Response;
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("content-type")).toBe("text/html");
    expect(await res.text()).toBe("<html></html>");
  });

  it("開発版は手元のサーバーと HMR を許し、https への引き上げはしない", () => {
    const dev = cspDirectives({ dev: true }) as Dirs;
    expect(dev["connect-src"]).toContain("ws://localhost:*");
    expect(dev["upgrade-insecure-requests"]).toBeUndefined();
    expect(d["upgrade-insecure-requests"]).toEqual([]);
  });
});
