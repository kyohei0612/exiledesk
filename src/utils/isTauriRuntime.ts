/**
 * Tauri ランタイム判定ヘルパ
 *
 * 経緯 (engineering/debug-log/2026-05-21-browser-dev-tauri-invoke-noise.md, 案 3):
 *   ブラウザ dev (`pnpm dev` → http://localhost:1420/) では window.__TAURI_INTERNALS__
 *   が undefined のため、`invoke()` や `@tauri-apps/plugin-*` が TypeError を投げる。
 *   本番（Tauri ネイティブ起動 / EXE 配布）では必ず定義される。
 *
 * Tauri v2 公式仕様:
 *   `@tauri-apps/api` の内部実装は `window.__TAURI_INTERNALS__.invoke` を参照する。
 *   公式から専用の isTauri 判定 export は無いため、内部フラグの存在チェックを採用。
 *
 * 使い方:
 *   import { isTauriRuntime } from "../utils/isTauriRuntime";
 *   if (!isTauriRuntime()) return null; // dev-server (browser) では Tauri 環境ではないためスキップ
 */
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
