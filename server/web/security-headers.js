// Web 版 (exiledesk.com) のセキュリティのヘッダー (2026-10-16、ロードマップのセキュリティのタスク 4「広告を入れる時に」)。
// 1 か所で決めて 2 か所で使う: move-gate.js (Worker を通るページ = / と /index.html と /web.html) と public/_headers (絵・JS・その他のページ /bases/ など)。
// public/_headers はここから作った物を置いている (tests/security-headers.test.ts が食い違いを見る。変えたら `node scripts/build-headers.mjs`)。
//
// 許す読み込み先 (2026-10-16 にコードから洗い出し):
//   - 自分: 画面・計算・絵 (base-art などは同じ所)、Worker の作業場所 (new Worker)、PWA の manifest
//   - Google Fonts (web.html の Yuji Syuku / Zen Antique / Zen Kaku Gothic New): fonts.googleapis.com の CSS → fonts.gstatic.com の字
//   - server/live (src/web/config.ts の WEB_API_BASE と public/contact.html の API): /boot.json・/live.json・/log・/feedback・相場の中継
//   - Cloudflare Web Analytics (src/web/main.ts): static.cloudflareinsights.com の beacon → cloudflareinsights.com へ送る
//   - 配信の欄の絵 (YouTube の i.ytimg.com・yt3.ggpht.com、Twitch の static-cdn.jtvnw.net): 画像は広告のために https: を全部許すので個別には書かない
//   - AdSense (web.html と public/*.html の頭の adsbygoogle.js、AdSlot.vue の <ins>): 公式の CSP の案内にある読み込み先
//     pagead2 / tpc.googlesyndication.com、googleads.g.doubleclick.net、adservice.google.com (日本は adservice.google.co.jp)、
//     www.googletagservices.com、*.adtrafficquality.google (不正クリックの見張り)、fundingchoicesmessages.google.com (同意の窓)、*.gstatic.com。
//     広告の絵・動画は広告主の置き場から来るので img / media は https: を全部。Google の案内どおり 'unsafe-inline' 'unsafe-eval' も要る
// 埋め込み (iframe でこのサイトを出す) は全部止める: frame-ancestors 'none' と X-Frame-Options: DENY (POE2Tube の録画は URL を開くだけで埋め込まない)

export const LIVE_API = "https://exiledesk-live.exiledesk.workers.dev";

const ADS_SCRIPT = [
  "https://pagead2.googlesyndication.com", "https://tpc.googlesyndication.com", "https://*.googlesyndication.com",
  "https://googleads.g.doubleclick.net", "https://*.doubleclick.net",
  "https://adservice.google.com", "https://*.google.com", "https://adservice.google.co.jp", "https://*.google.co.jp",
  "https://www.googletagservices.com", "https://*.googleadservices.com", "https://*.adtrafficquality.google", "https://*.gstatic.com",
];
const ADS_FRAME = [
  "https://*.googlesyndication.com", "https://*.doubleclick.net", "https://*.google.com", "https://*.google.co.jp",
  "https://*.googleadservices.com", "https://*.adtrafficquality.google",
];

/** CSP の中身。dev = 開発版 (vite の dev サーバー。手元のサーバーと HMR の websocket も許す) */
export function cspDirectives({ dev = false } = {}) {
  const local = dev ? ["http://localhost:*", "ws://localhost:*", "http://127.0.0.1:*", "ws://127.0.0.1:*"] : [];
  return {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://static.cloudflareinsights.com", ...ADS_SCRIPT],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "media-src": ["'self'", "blob:", "https:"],
    "connect-src": ["'self'", LIVE_API, "https://cloudflareinsights.com", "https://static.cloudflareinsights.com", ...ADS_SCRIPT, ...local],
    "frame-src": ADS_FRAME,
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    ...(dev ? {} : { "upgrade-insecure-requests": [] }),
  };
}

export function cspValue(opts) {
  return Object.entries(cspDirectives(opts)).map(([k, v]) => (v.length ? `${k} ${v.join(" ")}` : k)).join("; ");
}

/** 全部のページと物に付けるヘッダー */
export function securityHeaders(opts) {
  return {
    "Content-Security-Policy": cspValue(opts),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    // 外へのリンク・広告にはオリジンだけ渡す (AdSense はどのサイトの広告かをこれで見る。パスと ?nolog などは渡さない)
    "Referrer-Policy": "strict-origin-when-cross-origin",
    // 使わない機能は止める (広告が使う attribution-reporting・browsing-topics などは止めない)
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), usb=(), serial=(), hid=()",
    ...(opts?.dev ? {} : { "Strict-Transport-Security": "max-age=31536000" }),
  };
}

/** public/_headers の中身 (Cloudflare Workers の静的ファイルの決まりの形) */
export function headersFileText() {
  const lines = ["# このファイルは server/web/security-headers.js から作る (node scripts/build-headers.mjs)。手で直さない", "/*"];
  for (const [k, v] of Object.entries(securityHeaders())) lines.push(`  ${k}: ${v}`);
  return lines.join("\n") + "\n";
}

/** Worker を通したページの応答にヘッダーを付ける (move-gate.js) */
export function withSecurityHeaders(res) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(securityHeaders())) out.headers.set(k, v);
  return out;
}
