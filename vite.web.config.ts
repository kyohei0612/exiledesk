/**
 * Web 版のビルド (2026-10-07)。入口は web.html → src/web/main.ts (クラフトステージだけの殻)。出力は dist-web/ (index.html に直す)。
 * アプリ版 (vite.config.ts) と違い、画像 (base-art / unique-art / rune-art / skill-art) はそのまま入れる (Web は静的ファイルとして配る)。
 * mtx-art (47 MB、アプリのスキン画面の物) は Web のスキンのページに出す分だけ、開発用の stub は入れない。
 *   pnpm dev:web   … http://localhost:1440/web.html (相場は vite の proxy 経由)
 *   pnpm build:web … dist-web/ → server/web で置く (pnpm deploy:web)
 */
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

/** 出す場所。手元の本番環境・開発版 (scripts/preview-prod.mjs) は WEB_OUT で server/web/.wrangler/preview-dist(-dev) に出す */
const OUT = process.env.WEB_OUT || "dist-web";

export default defineConfig({
  plugins: [vue(), tailwindcss(), {
    // ANALYZE=1 の時だけ: 最初に読む塊 (web-*.js) の中身を大きい順に出す (2026-10-19 スマホの読み込みを縮める時に作った)
    name: "exiledesk-web-analyze",
    apply: "build" as const,
    generateBundle(_o: unknown, bundle: Record<string, { type: string; fileName: string; isEntry?: boolean; modules?: Record<string, { renderedLength: number }> }>) {
      if (!process.env.ANALYZE) return;
      for (const c of Object.values(bundle)) {
        if (c.type !== "chunk" || !c.isEntry || !c.modules) continue;
        const rows = Object.entries(c.modules).map(([id, m]) => [m.renderedLength, id.replace(/\\/g, "/").replace(/^.*?\/(src|node_modules)\//, "$1/")] as const).sort((a, b) => b[0] - a[0]);
        console.log(`\n${c.fileName}: ${Math.round(rows.reduce((a, r) => a + r[0], 0) / 1024)}KB`);
        for (const [n, id] of rows.slice(0, 45)) console.log(`${String(Math.round(n / 1024)).padStart(6)}KB ${id}`);
        // 大きい物が入口からどの道で読まれているか (静的な import だけをたどる最短の道)
        const self = this as unknown as { getModuleInfo: (id: string) => { importers: readonly string[]; isEntry: boolean } | null };
        const short = (id: string): string => id.replace(/\\/g, "/").replace(/^.*?\/src\//, "").replace(/\?.*$/, "");
        for (const [, full] of Object.entries(c.modules).map(([id, m]) => [m.renderedLength, id] as const).sort((a, b) => b[0] - a[0]).slice(0, 25)) {
          const prev = new Map<string, string | null>([[full, null]]);
          const q = [full];
          let hit: string | null = null;
          while (q.length && !hit) {
            const cur = q.shift()!;
            const info = self.getModuleInfo(cur);
            if (info?.isEntry) { hit = cur; break; }
            for (const imp of info?.importers ?? []) if (!prev.has(imp)) { prev.set(imp, cur); q.push(imp); }
          }
          const chain: string[] = [];
          for (let x: string | null | undefined = hit; x; x = prev.get(x)) chain.push(short(x));
          console.log(`道: ${chain.join(" → ")}`);
        }
      }
    },
  }, {
    name: "exiledesk-web-finish",
    apply: "build" as const,
    async closeBundle() {
      const { readdir, readFile, rm, rename, writeFile } = await import("node:fs/promises");
      await rename(`${OUT}/web.html`, `${OUT}/index.html`);
      // 版の印: 入口の JS の道 (古い塊の読み直しが Worker を通さずに新しい版を見る。web.html の頭の __staleReload、10-24)
      const entry = (await readFile(`${OUT}/index.html`, "utf8")).match(/src="(\/assets\/web-[^"]+\.js)"/)?.[1];
      if (!entry) throw new Error("index.html に入口の塊 (/assets/web-*.js) が無い");
      await writeFile(`${OUT}/version.txt`, `${entry}\n`);
      await rm(`${OUT}/dev-trade2-stub.js`, { force: true });
      // mtx-art はスキンのページ (?page=skins) に出す分だけ残す (1,901 枚・約 8 MB。静的な絵は 1 日 10 万の枠に数えない、サーバー管理人 10-25)
      const used = new Set((JSON.parse(await readFile("src/data/mtx-poe1-in-poe2.json", "utf8")) as { items: { a?: number }[] }).items.flatMap((x) => (x.a == null ? [] : [`${x.a}.webp`])));
      for (const f of await readdir(`${OUT}/mtx-art`).catch(() => [] as string[])) if (!used.has(f)) await rm(`${OUT}/mtx-art/${f}`, { force: true });
    },
  }, {
    // dev だけ: 読み物 (/blog/・/en/blog/) を build-blog-pages.mjs で data-cache/dev-blog に作って配る。右の列の新しい記事・すべて見るを dev でも辿れるように
    // (2026-10-25 オーナー「開発版だとブログどっか行ってる」、案はデザイン部長 5 本目)。記事を書き足したら dev を立て直すと新しくなる
    name: "exiledesk-dev-blog",
    apply: "serve" as const,
    configureServer(server: import("vite").ViteDevServer) {
      const DIR = "data-cache/dev-blog";
      const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };
      void import("node:child_process").then(({ execFile }) => execFile(process.execPath, ["scripts/build-blog-pages.mjs", DIR], (e) => e && console.warn("dev-blog:", e.message)));
      server.middlewares.use(async (req, res, next) => {
        let u: string;
        try { u = decodeURIComponent((req.url ?? "").split("?")[0]!); } catch { return next(); }
        if (!/^\/(en\/)?blog(\/|$)/.test(u) || u.includes("..")) return next();
        const { readFile } = await import("node:fs/promises");
        const { extname, join } = await import("node:path");
        const f = join(DIR, u.endsWith("/") ? `${u}index.html` : u);
        try { const b = await readFile(f); res.setHeader("Content-Type", TYPES[extname(f)] ?? "application/octet-stream"); res.end(b); } catch { next(); }
      });
    },
  }],
  build: { outDir: OUT, emptyOutDir: true, rollupOptions: { input: "web.html" } },
  // シミュレーションの作業場所は ES モジュールで (vite.config.ts と同じ)
  worker: { format: "es" },
  clearScreen: false,
  server: {
    port: 1440,
    strictPort: true,
    // 起動しても普段の Chrome にタブを開かない (2026-10-18 オーナー「タブで開いたり同時に 2 個立ち上がるのやめーや」。開くのは http://localhost:1440/web.html)
    watch: { ignored: ["**/src-tauri/**", "**/data-cache/**", "**/scripts/**", "**/video/**"] },
    proxy: {
      "/api/poe2scout": { target: "https://api.poe2scout.com", changeOrigin: true, rewrite: (path) => path.replace(/^\/api\/poe2scout/, "") },
    },
  },
});
