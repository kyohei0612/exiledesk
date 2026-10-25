/**
 * spam-run.ts — 同じ手を狙いのどれかが付くまで打ち続ける 1 人分 (2026-10-25、エミュのスパムシミュとシミュのツリーの「当たるまで」で同じ物)
 *
 * 前はエミュの engine-emu/chaos-spam.ts の spamOne だけ (お告げ無し・回数だけ)。シミュ 25 本目の頼みで、お告げ (削減・消去など) を渡せて、
 * 打ち終わりのアイテムと使った個数も返す形を核に置いた。spamOne はこれを呼ぶだけ。
 * 打つ処理は applyCurrency。当たり所で弾かれた回 (random) は押した回数 n に数えるが、使った個数 used には数えない (ゲームでは使わない回)。
 * 打てなくなった時・上限に届いた時は n = null (アイテムはその時の物)。
 */
import { applyCurrency } from "./apply-currency";
import { aimDone, type AimTarget } from "./aim-odds";
import type { StageItem } from "./types";
import type { PatchData } from "../../vendor/poe2htc/engine/types";

/** 当たり: 狙いのどれか 1 つが (その段以上で) 付いている */
export const spamHit = (item: StageItem, ts: readonly AimTarget[]): boolean => ts.some((t) => aimDone(item, [t]));

export interface SpamRun {
  /** 当たるまでに押した回数 (始めから当たっていれば 0、付かなければ null) */
  n: number | null;
  /** 打ち終わりのアイテム */
  item: StageItem;
  /** 実際に使った個数 (手もお告げも 1 回ごとに 1 つ) */
  used: number;
}

export function spamRun(data: PatchData, start: StageItem, ts: readonly AimTarget[], key: string, rng: () => number, cap: number, omens: readonly string[] = []): SpamRun {
  if (spamHit(start, ts)) return { n: 0, item: start, used: 0 };
  let item = start, used = 0;
  for (let n = 1; n <= cap; n++) {
    const r = applyCurrency(data, item, key, rng, [...omens]);
    if (!r.applied) {
      if (!r.random) return { n: null, item, used };
      continue;
    }
    item = r.item;
    used++;
    if (spamHit(item, ts)) return { n, item, used };
  }
  return { n: null, item, used };
}
