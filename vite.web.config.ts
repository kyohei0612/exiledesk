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
import { execSync } from "node:child_process";

/** 配信ごとに変わる版の印 (日本時間の月日・時分 + コミット)。Web 版は版の番号を上げずに配るので、更新されたか分かるように (2026-10-08 オーナー) */
const jst = new Date(Date.now() + 9 * 3600_000);
const pad = (n: number): string => String(n).padStart(2, "0");
let sha = "";
try { sha = execSync("git rev-parse --short HEAD").toString().trim(); } catch { /* 無くてよい */ }
const WEB_BUILD = `${pad(jst.getUTCMonth() + 1)}/${pad(jst.getUTCDate())} ${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}${sha ? ` · ${sha}` : ""}`;

export default defineConfig({
  define: { __WEB_BUILD__: JSON.stringify(WEB_BUILD) },
  plugins: [vue(), tailwindcss(), {
    name: "exiledesk-web-finish",
    apply: "build" as const,
    async closeBundle() {
      const { rm, rename } = await import("node:fs/promises");
      await rename("dist-web/web.html", "dist-web/index.html");
      for (const p of ["mtx-art", "dev-trade2-stub.js"]) await rm(`dist-web/${p}`, { recursive: true, force: true });
    },
  }],
  build: { outDir: "dist-web", emptyOutDir: true, rollupOptions: { input: "web.html" } },
  // シミュレーションの作業場所は ES モジュールで (vite.config.ts と同じ)
  worker: { format: "es" },
  clearScreen: false,
  server: {
    port: 1440,
    strictPort: true,
    open: "/web.html",
    watch: { ignored: ["**/src-tauri/**", "**/data-cache/**", "**/scripts/**"] },
    proxy: {
      "/api/poe2scout": { target: "https://api.poe2scout.com", changeOrigin: true, rewrite: (path) => path.replace(/^\/api\/poe2scout/, "") },
    },
  },
});
