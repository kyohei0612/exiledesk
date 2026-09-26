/**
 * poe2scout の接続先 (BASE)・fetch の実装・キャッシュ無効の共通設定。モジュール状態はここに 1 つだけ置く
 *
 * poe2scout.ts から切り出し (2026-09-26)。
 */
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

export const BASE = import.meta.env.DEV
  ? "/api/poe2scout"
  : "https://api.poe2scout.com";

export const httpFetch: typeof fetch = import.meta.env.DEV
  ? globalThis.fetch.bind(globalThis)
  : (tauriFetch as unknown as typeof fetch);

// 「更新」で必ず最新を取得するため、全 GET は no-store でキャッシュを使わない。
// poe2scout は cf-cache-status: DYNAMIC(CDN非キャッシュ)だが Cache-Control 無 + Last-Modified 有のため
// WebView のヒューリスティックキャッシュを確実に回避する。
export const NO_STORE: RequestInit = { cache: "no-store" };
