// スマホ用の開発版 (web-dev) の門 (2026-10-09 オーナー「公開したらあかんからスマホ開発版も作ってくれ」)。
// 鍵付きの URL (?k=<DEV_KEY>) で 1 回開いた端末にだけ印 (cookie) を置き、それ以外は 404。検索にも載せない。
// 鍵は wrangler の secret (DEV_KEY)。中身は scripts/deploy-web-dev.mjs が作る dist-web-dev/
const COOKIE = "exiledesk_dev";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const key = env.DEV_KEY;
    const cookie = request.headers.get("cookie") ?? "";
    const has = key && cookie.split(/;\s*/).includes(`${COOKIE}=${key}`);
    const given = key && url.searchParams.get("k") === key;
    if (!has && !given) return new Response("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } });
    if (given) {
      url.searchParams.delete("k");
      return new Response(null, {
        status: 302,
        headers: { Location: url.pathname + url.search, "Set-Cookie": `${COOKIE}=${key}; Path=/; Max-Age=31536000; Secure; HttpOnly; SameSite=Lax`, "X-Robots-Tag": "noindex, nofollow" },
      });
    }
    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    out.headers.set("X-Robots-Tag", "noindex, nofollow");
    out.headers.set("Cache-Control", "no-store");
    return out;
  },
};
