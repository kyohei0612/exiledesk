import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [vue(), tailwindcss()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. Vite に watch させないディレクトリ:
      //    - src-tauri: Rust 側、Tauri 自身が監視
      //    - data-cache: スクレイプ HTML 等の中間ファイル (Phase λ で書き込み中に page reload を発火しないため)
      //    - scripts: ビルド時専用、ランタイム影響なし
      ignored: ["**/src-tauri/**", "**/data-cache/**", "**/scripts/**"],
    },
    // 4. dev 時 CORS 回避用のプロキシ（本番 Tauri ビルド時は無関係）
    proxy: {
      "/api/poe2scout": {
        target: "https://api.poe2scout.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/poe2scout/, ""),
      },
      // 2026-09-12: trade2 API も dev ではプロキシ経由で叩けるようにする (本番は Rust trade2_search / trade2_fetch)。
      // ブラウザ (vite dev) でヴァールの天秤の自動取得まで確認するため。UA は Cloudflare 対策で付ける。
      "/api/trade2-www": {
        target: "https://www.pathofexile.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/trade2-www/, "/api/trade2"),
        headers: { "User-Agent": "ExileDesk/dev (contact: nekodori0612@gmail.com)" },
      },
      "/api/trade2-jp": {
        target: "https://jp.pathofexile.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/trade2-jp/, "/api/trade2"),
        headers: { "User-Agent": "ExileDesk/dev (contact: nekodori0612@gmail.com)" },
      },
    },
  },
}));
