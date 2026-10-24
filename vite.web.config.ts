/**
 * Web 版のビルド (2026-10-07)。入口は web.html → src/web/main.ts (クラフトステージだけの殻)。出力は dist-web/ (index.html に直す)。
 * アプリ版 (vite.config.ts) と違い、画像 (base-art / unique-art / rune-art / skill-art) はそのまま入れる (Web は静的ファイルとして配る)。
 * mtx-art (47 MB、スキン画面の物) と開発用の stub は入れない。
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
      const { rm, rename } = await import("node:fs/promises");
      await rename(`${OUT}/web.html`, `${OUT}/index.html`);
      for (const p of ["mtx-art", "dev-trade2-stub.js"]) await rm(`${OUT}/${p}`, { recursive: true, force: true });
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
