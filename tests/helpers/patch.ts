/**
 * テスト用: 計算機のエンジン (PatchData) を同期に読む。アプリの loadHtcPatch と同じ applyExtras を通す
 * (クライアントで補ったベース・重みの上書き込み)。scripts/_htc-bridge-entry.ts の loadPatchSync と同じ中身
 */
import { indexPatch } from "../../src/vendor/poe2htc/engine/indexPatch";
import type { PatchData } from "../../src/vendor/poe2htc/engine/types";
import { applyExtras } from "../../src/services/htc/patch";
import mods from "../../src/vendor/poe2htc/data/mods.json";
import bases from "../../src/vendor/poe2htc/data/base_items.json";
import extra from "../../src/services/htc/extra-bases.json";

let cached: PatchData | null = null;
export function loadPatch(): PatchData {
  if (cached) return cached;
  const data = indexPatch(mods as unknown as Parameters<typeof indexPatch>[0], bases as unknown as Parameters<typeof indexPatch>[1]);
  cached = applyExtras(data, extra as unknown as Parameters<typeof applyExtras>[1]);
  return cached;
}
