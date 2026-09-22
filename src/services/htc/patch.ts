/**
 * patch.ts — 取り込んだクラフトエンジンにデータを渡す (2026-09-22)
 *
 * エンジン本体 (src/vendor/poe2htc) は純粋な計算だけで、読み込みは持っていません
 * (node:fs を使う loader は取り込み時に外しました)。ここが唯一の入口です。
 *
 * MOD 表は 4 MB あるので**動的 import** にしてあります。クラフト計算の画面を開くまで
 * 落ちてこないので、起動と他の画面には効きません。
 */
import { indexPatch } from "../../vendor/poe2htc/engine/indexPatch";
import type { PatchData } from "../../vendor/poe2htc/engine/types";

let cached: Promise<PatchData> | null = null;

/**
 * MOD 表とベース表を読んで索引を作る (1 回だけ。2 回目からは同じ物を返す)。
 * 取り込んだ版は patch 0.5.0。
 */
export function loadHtcPatch(): Promise<PatchData> {
  if (!cached) {
    cached = (async () => {
      const [mods, bases] = await Promise.all([
        import("../../vendor/poe2htc/data/mods.json"),
        import("../../vendor/poe2htc/data/base_items.json"),
      ]);
      // JSON は上流の ModsFile / BasesFile の形。indexPatch がそのまま受ける
      return indexPatch(
        (mods.default ?? mods) as unknown as Parameters<typeof indexPatch>[0],
        (bases.default ?? bases) as unknown as Parameters<typeof indexPatch>[1],
      );
    })();
  }
  return cached;
}
