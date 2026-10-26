/**
 * vite-sim-tutorial.ts — 手元の dev (vite serve) だけ: シミュのチュートリアルの手順と文を src/data/sim-tutorial.json に書く口 (POST /__sim-tutorial)。
 * オーナーが dev の画面で打って保存する (2026-10-26 夜)。中身の形だけ見て、そのまま整形して書く。本番・ビルドには入らない (apply: "serve")
 */
/** @typedef {import("vite").Plugin} Plugin */

const FILE = "src/data/sim-tutorial.json";

/** @returns {Plugin} */
export function simTutorialSave() {
  return {
    name: "exiledesk-sim-tutorial-save",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== "/__sim-tutorial" || req.method !== "POST") return next();
        const chunks = [];
        for await (const c of req) chunks.push(c);
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { res.statusCode = 400; return res.end("JSON ではない"); }
        if (body.v !== 1 || !Array.isArray(body.steps) || typeof body.texts !== "object" || typeof body.targets !== "object") { res.statusCode = 400; return res.end("形が違う"); }
        const { writeFile } = await import("node:fs/promises");
        await writeFile(FILE, `${JSON.stringify(body, null, 2)}\n`, "utf8");
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("ok");
      });
    },
  };
}
