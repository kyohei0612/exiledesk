/**
 * ディスクキャッシュ I/O ラッパ (Tauri command 経由)
 *
 * craft-discovery-v2.ts から切り出し (2026-09-07)。
 * 場所: %APPDATA%/com.kyohei.exiledesk/craft_v2_cache.json (Rust 側 craft_v2_storage.rs)
 */

import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../../utils/isTauriRuntime";
import type { CraftV2Cache } from "./types";

/**
 * ディスクキャッシュを読込む。Tauri 環境外 / ファイル無し / 壊れ / I/O エラーはすべて null
 * (UI を止めない)。
 */
export async function loadCraftV2Cache(): Promise<CraftV2Cache | null> {
  if (!isTauriRuntime()) return null;
  try {
    const cache = await invoke<CraftV2Cache | null>("craft_v2_cache_load");
    return cache ?? null;
  } catch (err) {
    console.warn("[craft-discovery-v2] loadCraftV2Cache failed:", err);
    return null;
  }
}

/** ディスクキャッシュを保存。失敗時は console.warn のみ。 */
export async function saveCraftV2Cache(cache: CraftV2Cache): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await invoke<void>("craft_v2_cache_save", { cache });
  } catch (err) {
    console.warn("[craft-discovery-v2] saveCraftV2Cache failed:", err);
  }
}

/** ディスクキャッシュを削除 (UI の「キャッシュ削除 + 全取得」用)。 */
export async function clearCraftV2Cache(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await invoke<void>("craft_v2_cache_clear");
  } catch (err) {
    console.warn("[craft-discovery-v2] clearCraftV2Cache failed:", err);
  }
}
