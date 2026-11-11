/**
 * chaos-spam.ts — スパムの結果のまとめ (何人中の順位・半分の人・運が悪い 10 人に 1 人)。運試しの順位 (StageRouteLuck) が使う
 *
 * 2026-10-16 のカオススパムモード (狙いのどれかが付くまで同じカオスを打ち続ける 1 人分の回し spamOne) は、スパムシミュレーターの道
 * (route-race.ts の routeRun) に替わってどの画面からも呼ばれなくなったので 2026-11-12 に消した。残るのはまとめの式だけ
 */

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
