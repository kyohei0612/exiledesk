/**
 * vite-recipe-short.mjs — 手元の dev (vite serve) だけ: 本番の短い URL を開発版で開く口 (GET /r/<id>、Y-70b)。
 * 本番 https://exiledesk.com/r/<id> の HTML (location.replace("/#recipe=…")) から #recipe= の中身を抜き、/web.html#recipe=… へ送る。
 * 付けた ?off= などはそのまま渡す。向きは本番 → 開発だけ (開発から本番へは送らない)。本番・ビルドには入らない (apply: "serve")
 * 2026-11-16 オーナー「本番から開発は実装してもいいでしょ。毎回用意してもらうのめんどくさいし」「開発から本番へ送ることはない」
 */
/** @typedef {import("vite").Plugin} Plugin */

const PROD = "https://exiledesk.com";
const ID = /^\/r\/([A-Za-z0-9_-]{4,40})\/?(\?.*)?$/;
const HASH = /location\.replace\("\/?#recipe=([A-Za-z0-9_~.%-]+)"\)/;

/** @returns {Plugin} */
export function recipeShort() {
  return {
    name: "exiledesk-recipe-short",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const m = req.method === "GET" ? ID.exec(req.url ?? "") : null;
        if (!m) return next();
        let html = "";
        try {
          const r = await fetch(`${PROD}/r/${m[1]}`, { signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error(`本番が ${r.status} を返した`);
          html = await r.text();
        } catch (e) {
          res.statusCode = 502; res.setHeader("Content-Type", "text/plain; charset=utf-8");
          return res.end(`本番の短い URL を取れなかった (${e instanceof Error ? e.message : String(e)})`);
        }
        const h = HASH.exec(html);
        if (!h) { res.statusCode = 404; res.setHeader("Content-Type", "text/plain; charset=utf-8"); return res.end("本番の短い URL にレシピが無い (消えた・違う id)"); }
        res.statusCode = 302;
        res.setHeader("Location", `/web.html${m[2] ?? ""}#recipe=${h[1]}`);
        res.end();
      });
    },
  };
}
