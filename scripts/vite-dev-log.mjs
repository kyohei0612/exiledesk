/**
 * vite-dev-log.mjs — 手元の dev (vite serve) だけ: オーナーが URL で触った操作を .dev-logs/YYYY-MM-DD.jsonl に足す口 (POST /__dev-log、Y-64)。
 * 本文は JSON 1 つか配列で、1 つが 1 行 (配列は要素ごと)。送る側は src/web/dev-log.ts。本番・ビルドには入らない (apply: "serve")、サーバーへは送らない
 * 2026-11-02 オーナー「シミュだけやないよ触ったボタン全てな」「必ず俺がURLで触った奴」
 */
/** @typedef {import("vite").Plugin} Plugin */

const DIR = ".dev-logs";
const MAX_BODY = 1024 * 1024;

/** @returns {Plugin} */
export function devLogSave() {
  return {
    name: "exiledesk-dev-log",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== "/__dev-log" || req.method !== "POST") return next();
        // よそのページからの POST は断る (vite-sim-tutorial.mjs と同じ)
        const origin = req.headers.origin;
        if (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) { res.statusCode = 403; return res.end("手元の dev の画面からだけ"); }
        // 窓なしの Chrome (部長たちの確かめ・モンキー) はオーナーの操作でないので置かない (Y-64 と同じ見分け)
        if (/HeadlessChrome/.test(req.headers["user-agent"] ?? "")) { res.statusCode = 204; return res.end(); }
        const chunks = [];
        let size = 0;
        for await (const c of req) { size += c.length; if (size <= MAX_BODY) chunks.push(c); }
        if (size > MAX_BODY) { res.statusCode = 413; return res.end("大きすぎる"); }
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { res.statusCode = 400; return res.end("JSON ではない"); }
        if (typeof body !== "object" || body === null) { res.statusCode = 400; return res.end("形が違う"); }
        const lines = (Array.isArray(body) ? body : [body]).map((r) => `${JSON.stringify(r)}\n`).join("");
        const { appendFile, mkdir } = await import("node:fs/promises");
        const { join } = await import("node:path");
        const dir = join(server.config.root, DIR);
        const day = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10); // 日本の日付
        await mkdir(dir, { recursive: true });
        await appendFile(join(dir, `${day}.jsonl`), lines, "utf8");
        res.statusCode = 204;
        res.end();
      });
    },
  };
}
