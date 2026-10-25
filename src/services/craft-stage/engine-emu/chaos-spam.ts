/**
 * chaos-spam.ts — カオススパムモード (2026-10-16 オーナーの手書きのメモ)
 *
 *   ① 狙う MOD を選ぶ (複数可、最大 6 つ。「次の手で狙う」と同じ狙い)
 *   ② カオス・上級・完全のどれかを選ぶ
 *   ③ 100 人が当たるまでスパムした時の回数を計算 + 自分でもスパムする (長押し、狙いが出たら自動で止まる)
 *   ④ 100 人の結果で、今回の自分のスパムの運試しができる
 *
 * 1 人 = 同じ状態から、狙いのどれか 1 つが付くまで同じカオスを打ち続ける (2026-10-16 オーナー「どれか付いたらでしょ、2 つ付いたらなんていう計算機じゃない」。前は全部揃うまで) (外れても、その結果に続けて打つ。今の MOD が消えても狙いが揃えば当たり)。
 * 打つ処理はステージと同じ applyCurrency (お告げ無し)。打てなくなった時・上限に届いた時は「付かなかった」(null)
 */
import { applyCurrency } from "../apply-currency";
import { aimDone, type AimTarget } from "../aim-odds";
import type { StageItem } from "../types";
import type { PatchData } from "../../../vendor/poe2htc/engine/types";

/** 1 人が打つ上限 (これを超えたら「付かなかった」) */
export const SPAM_CAP = 50_000;

/** 当たり: 狙いのどれか 1 つが (その段以上で) 付いている */
const spamHit = (item: StageItem, ts: readonly AimTarget[]): boolean => ts.some((t) => aimDone(item, [t]));
/** 1 人分: 狙いのどれかが付くまでの回数 (付かなければ null) */
export function spamOne(data: PatchData, start: StageItem, ts: readonly AimTarget[], key: string, rng: () => number, cap = SPAM_CAP): number | null {
  if (spamHit(start, ts)) return 0;
  let item = start;
  for (let n = 1; n <= cap; n++) {
    const r = applyCurrency(data, item, key, rng);
    // 打てない (当たり所で弾かれた回も数える = ゲームでは使わない回だが、押した回数として数える)
    if (!r.applied) {
      if (!r.random) return null;
      continue;
    }
    item = r.item;
    if (spamHit(item, ts)) return n;
  }
  return null;
}

/** 100 人の結果のまとめ (回数は小さい順。付かなかった人は後ろに数だけ) */
export interface SpamStats {
  tries: number[];
  failed: number;
  people: number;
}
const at = (xs: readonly number[], p: number): number => xs[Math.min(xs.length - 1, Math.max(0, Math.ceil(xs.length * p) - 1))]!;
/** 半分の人がここまでで付いた */
export const medianOf = (s: SpamStats): number | null => (s.tries.length * 2 >= s.people ? at(s.tries, (s.people / 2) / s.tries.length) : null);
/** 運が悪い 10 人に 1 人はここまでかかった (付かなかった人が 1 割を超えれば null) */
export const unluckyOf = (s: SpamStats): number | null => (s.tries.length >= s.people * 0.9 ? at(s.tries, (s.people * 0.9) / s.tries.length) : null);
/**
 * 今回の回数が 100 人の中で上位何 % か (少ない回数で付いたほど上位)。
 * 自分より少ない回数で付いた人の数 + 同じ回数の人の半分 を人数で割る
 */
export function rankOf(s: SpamStats, mine: number): number {
  const less = s.tries.filter((x) => x < mine).length;
  const same = s.tries.filter((x) => x === mine).length;
  return Math.min(100, Math.max(1, Math.round(((less + same / 2) / s.people) * 100) || 1));
}
