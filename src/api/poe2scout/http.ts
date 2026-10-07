/**
 * poe2scout の接続先 (BASE)・fetch の実装・キャッシュ無効の共通設定。モジュール状態はここに 1 つだけ置く
 *
 * poe2scout.ts から切り出し (2026-09-26)。
 * 2026-10-07 Web 版: ブラウザ (Tauri でない) で動く時は、自前のサーバー (server/live の /api/poe2scout、10 分の端キャッシュ) を経由する
 * (poe2scout を直に叩くと CORS で弾かれ、見る人の数だけ叩くことにもなる)。開発版は今までどおり vite の proxy
 */
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { isTauriRuntime } from "../../utils/isTauriRuntime";
import { WEB_API_BASE } from "../../web/config";

const tauri = isTauriRuntime();

export const BASE = import.meta.env.DEV
  ? "/api/poe2scout"
  : tauri
    ? "https://api.poe2scout.com"
    : `${WEB_API_BASE}/api/poe2scout`;

export const httpFetch: typeof fetch = import.meta.env.DEV || !tauri
  ? globalThis.fetch.bind(globalThis)
  : (tauriFetch as unknown as typeof fetch);

// 「更新」で必ず最新を取得するため、全 GET は no-store でキャッシュを使わない。
// poe2scout は cf-cache-status: DYNAMIC(CDN非キャッシュ)だが Cache-Control 無 + Last-Modified 有のため
// WebView のヒューリスティックキャッシュを確実に回避する。
export const NO_STORE: RequestInit = { cache: "no-store" };
