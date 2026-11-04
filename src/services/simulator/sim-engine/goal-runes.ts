/**
 * goal-runes.ts — 完成形の使用ルーンを嵌めた形 (S-31g、11-05 オーナー「ルーンは使用ルーンとして最大６つまで選べるように」、スイッチ useRunes)。
 * 使う順に嵌める: 空きソケットがあればそこへ、埋まっていれば前から順に置き換える (2 ソケットで 3 つ使う形 = 置き換えも含めて使う物)。
 * 置き換えられない物 (ソケットバウンド = セールの凱旋など、エンジンの決まり) の所は飛ばして次のソケットへ。どこも置き換えられなければそのルーンは嵌めない。
 * 完成の狙いのために自動で嵌まっているルーン (requiredRunes = ルーンの MOD・アストリッドの創造性) は置き換えない。
 * ソケットが全部それで埋まっていれば規格外で 1 つ足す。差せないルーン (部位・決まり) は飛ばす。嵌め方はエンジンの applyCurrency (rune:名前@n)
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { applyCurrency } from "../../craft-stage/apply-currency";
import { RUNE_PREFIX } from "../../craft-stage/stage-runes";
import type { StageItem } from "../../craft-stage/types";

/** 使用ルーンの上限 */
export const GOAL_RUNE_MAX = 6;

export function socketGoalRunes(data: PatchData, item: StageItem, runes: readonly string[], rng: () => number): StageItem {
  const fixed = (item.augments ?? []).length;
  let it = item, k = 0;
  for (const en of runes.slice(0, GOAL_RUNE_MAX)) {
    if ((it.augments ?? []).some((a) => a.en === en)) continue;
    const used = (it.augments ?? []).length, sockets = it.sockets ?? 0, free = sockets - fixed;
    if (used < sockets || free <= 0) {
      const r = applyCurrency(data, used < sockets ? it : { ...it, sockets: sockets + 1 }, `${RUNE_PREFIX}${en}`, rng);
      if (r.applied) it = r.item;
      continue;
    }
    // 埋まっていれば前から順に置き換える。置き換えられない所 (セールの凱旋などソケットバウンド) は飛ばして次を試す
    for (let n = 0; n < free; n++) {
      const at = fixed + ((k + n) % free) + 1;
      const r = applyCurrency(data, it, `${RUNE_PREFIX}${en}@${at}`, rng);
      if (r.applied) { it = r.item; k += n + 1; break; }
    }
  }
  return it;
}
