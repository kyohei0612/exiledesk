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

export default defineConfig({
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
