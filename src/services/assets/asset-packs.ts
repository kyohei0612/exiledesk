/**
 * asset-packs.ts — 画像パックの読み先 (2026-09-29)
 *
 * オーナー「画像ビルドとコードビルドで完全に分けたら」。画像 (public/<pack>/…) はインストーラーに入れず、
 * アプリは起動時に要る版 (asset-packs.json、scripts/asset-packs.mjs が pnpm build の前に書く) を
 * src-tauri/src/asset_packs.rs で 1 回だけ落として <app_local_data_dir>/assets/<pack> に展開し、そこから読む。
 * 開発版 (Vite) と素のブラウザ (POE2Tube の撮影) は今までどおり public/ の画像 (/<pack>/<file>)。
 */
import { reactive, ref } from "vue";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isTauriRuntime } from "../../utils/isTauriRuntime";
import packs from "./asset-packs.json";

type Pack = keyof typeof packs.packs;
/** 本番のアプリだけ落とした画像を読む (開発版は Vite が public/ を出す) */
const USE_PACKS = isTauriRuntime() && !import.meta.env.DEV;
/** パック → 展開先のフォルダ (まだなら無し) */
const dirs = reactive<Partial<Record<string, string>>>({});
/** 準備中の表示 (落としている時だけ) */
export const assetProgress = ref<{ pack: string; phase: string; received: number; total: number } | null>(null);
export const assetError = ref<string | null>(null);

/** 画像の URL。本番で画像パックがまだ無い時は null (絵なしで出す) */
export function assetUrl(pack: Pack, file: string): string | null {
  if (!USE_PACKS) return `/${pack}/${file}`;
  const d = dirs[pack];
  return d ? convertFileSrc(`${d}/${file}`) : null;
}

let started = false;
/** 起動時に 1 回。要る版と違うパックだけ落とす (同じなら通信しない) */
export async function ensureAssetPacks(): Promise<void> {
  if (!USE_PACKS || started) return;
  started = true;
  const off = await listen<{ pack: string; phase: string; received: number; total: number }>("asset-pack-progress", (e) => {
    assetProgress.value = e.payload.phase === "done" ? null : e.payload;
  });
  try {
    for (const [pack, v] of Object.entries(packs.packs)) {
      try {
        dirs[pack] = await invoke<string>("asset_pack_ensure", { pack, hash: v.hash });
      } catch (e) {
        assetError.value = `画像 (${pack}) を用意できなかった: ${String(e)}`;
      }
    }
  } finally {
    assetProgress.value = null;
    off();
  }
}
