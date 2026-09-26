/** catalysing.ts から切り出し (2026-09-26): 実測の 2 点と、品質 → 倍率の当てはめ (catalysingMultiplier / catalysingBand) */
import { ABSOLUTE_MAX_QUALITY } from "./quality";

/** 実測 1 点。`quality` は %、`multiplier` はタグ付き MOD の重みに掛かる倍率。 */
export interface CatalysingSample {
  readonly quality: number;
  readonly multiplier: number;
  /** 二項の 95% 区間 (n=100) を倍率に直したもの */
  readonly lo: number;
  readonly hi: number;
  readonly hits: string;
}

/** 出典: reddit /r/PathOfExile2 "Omen of Catalysing Exaltation seem to scale on Quality amount" */
export const CATALYSING_SAMPLES: readonly CatalysingSample[] = [
  { quality: 1.5, multiplier: 1.65, lo: 1.09, hi: 2.44, hits: "42/100" },
  { quality: 40, multiplier: 7.63, lo: 5.01, hi: 13.17, hits: "77/100" },
];

/** 画面に出す但し書き。`LINGERING_CAVEAT` と同じ扱いで、必ず倍率と一緒に見せる。 */
export const CATALYSING_CAVEAT =
  "触媒の高貴のお告げの倍率はゲーム内にもクライアントにも数字が無く、" +
  "コミュニティの実測 200 個 (各 100 個) から引いた推定です。" +
  "40% 側の 95% 区間は 5 - 13 倍と広く、2 群のベースが同じとは書かれていないため " +
  "品質が低い側ほど当てになりません。";

/** 2 点を通る直線。`q` は % 。 */
function lineThrough(loSample: number, hiSample: number): (q: number) => number {
  const [a, b] = CATALYSING_SAMPLES as readonly [CatalysingSample, CatalysingSample];
  const slope = (hiSample - loSample) / (b.quality - a.quality);
  const intercept = loSample - slope * a.quality;
  return (q) => intercept + slope * q;
}

const CENTRAL = lineThrough(CATALYSING_SAMPLES[0]!.multiplier, CATALYSING_SAMPLES[1]!.multiplier);
const LOWER = lineThrough(CATALYSING_SAMPLES[0]!.lo, CATALYSING_SAMPLES[1]!.lo);
const UPPER = lineThrough(CATALYSING_SAMPLES[0]!.hi, CATALYSING_SAMPLES[1]!.hi);

/** 品質 (%) → タグ付き MOD の重みに掛かる倍率。品質 0 ではお告げを使う意味が無いので 1。 */
export function catalysingMultiplier(qualityPct: number): number {
  if (!(qualityPct > 0)) return 1;
  return Math.max(1, CENTRAL(Math.min(qualityPct, ABSOLUTE_MAX_QUALITY)));
}

/** 同じ品質での 95% 区間。画面には幅ごと出す。 */
export function catalysingBand(qualityPct: number): { lo: number; hi: number } {
  if (!(qualityPct > 0)) return { lo: 1, hi: 1 };
  const q = Math.min(qualityPct, ABSOLUTE_MAX_QUALITY);
  return { lo: Math.max(1, LOWER(q)), hi: Math.max(1, UPPER(q)) };
}
