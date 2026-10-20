/**
 * paste-read.ts — 取引所・poe.ninja のアイテムの貼り付けを読んで、シミュレーター ① のベースと ② の狙いを一度に決める (2026-10-20 オーナー)。
 * 入口は ① のベースを選ぶページの「貼り付け」のタイル (SimPasteRead.vue)。前の ② の「貼り付けで写す ▾」(paste-target.ts) はここに一本化した。
 *
 * 読むのはエンジンの入口の parseItemText (ジン部長、形は craft-stage/item-text-types.ts)。ここは読んだ MOD を ② の狙いに直すだけ:
 *   - 狙いの段 = 貼った値が入る段 (その段以上が当たり)。未発現・MOD の分からない行は狙いにしない
 *   - フラクチャーの印はフラクチャー予定、冒涜で付いた物は冒涜 (それ以外は MOD の種類で決まる既定の付け方)
 */
import { parseItemText, type ItemTextResult } from "../craft-stage/engine";
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import type { SimTargets } from "../../state/simulator/sim-state";

export interface PasteRead {
  item: ItemTextResult;
  /** ② の狙い */
  targets: SimTargets;
}

export function readPaste(data: PatchData, text: string): PasteRead {
  const item = parseItemText(data, text);
  const targets: SimTargets = [];
  for (const m of item.mods) {
    // 複合 MOD など同じ MOD が 2 行で来た時は 1 つにまとめる
    if (!m.modId || m.unrevealed || targets.some((t) => t.modId === m.modId)) continue;
    targets.push({
      modId: m.modId, minTierIndex: m.tier?.index ?? 0,
      ...(m.fractured ? { method: "fracture" as const } : m.desecrated ? { method: "desecrate" as const } : {}),
    });
  }
  return { item, targets };
}
