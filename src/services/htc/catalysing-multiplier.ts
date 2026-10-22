/** catalysing.ts から切り出し (2026-09-26): 品質 → 倍率 (catalysingMultiplier、2026-10-16 から Craft of Exile の式) と実測の 2 点の区間 (catalysingBand) */
import { ABSOLUTE_MAX_QUALITY } from "./quality";

/** 実測 1 点。`quality` は %、`multiplier` はタグ付き MOD の重みに掛かる倍率。 */
interface CatalysingSample {
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
  "Craft of Exile の式 (1 + 0.2 × 品質、20% を超えた分は 1% ごとに +0.12) を使っています。" +
  "幅はコミュニティの実測 200 個 (各 100 個) の 95% 区間です。" +
  "大いなる高貴のお告げと重ねた時は、足す 2 つとも重く引きます (公開の確認は無く、クラフト配信者の説明に合わせています)。";

/**
 * Craft of Exile の作り (package_poe2.js の exaltedParams、OmenOnExaltConsumeQuality。2026-10-16 オーナー「CoE に合わせて」):
 * 1 + 0.2 × 品質 (20% で 5 倍)。標準の上限 20% を超えた分は 1% ごとに +0.12 (40% で 7.4 倍)。reddit の実測 2 点 (上の表) の区間の中に入る
 */
const DEFAULT_MAX = 20;
function coeMultiplier(q: number): number {
  return q <= DEFAULT_MAX ? 1 + 0.2 * q : 1 + 0.2 * DEFAULT_MAX + 0.12 * (q - DEFAULT_MAX);
}
/** 区間は reddit の実測 2 点 (各 100 個) の 95% 区間を結んだ物 (画面の幅だけに使う) */
function lineThrough(loSample: number, hiSample: number): (q: number) => number {
  const [a, b] = CATALYSING_SAMPLES as readonly [CatalysingSample, CatalysingSample];
  const slope = (hiSample - loSample) / (b.quality - a.quality);
  const intercept = loSample - slope * a.quality;
  return (q) => intercept + slope * q;
}
const LOWER = lineThrough(CATALYSING_SAMPLES[0]!.lo, CATALYSING_SAMPLES[1]!.lo);
const UPPER = lineThrough(CATALYSING_SAMPLES[0]!.hi, CATALYSING_SAMPLES[1]!.hi);

/** 品質 (%) → タグ付き MOD の重みに掛かる倍率。品質 0 ではお告げを使う意味が無いので 1。 */
export function catalysingMultiplier(qualityPct: number): number {
  if (!(qualityPct > 0)) return 1;
  return coeMultiplier(Math.min(qualityPct, ABSOLUTE_MAX_QUALITY));
}

/** 同じ品質での 95% 区間。画面には幅ごと出す。 */
export function catalysingBand(qualityPct: number): { lo: number; hi: number } {
  if (!(qualityPct > 0)) return { lo: 1, hi: 1 };
  const q = Math.min(qualityPct, ABSOLUTE_MAX_QUALITY);
  return { lo: Math.max(1, LOWER(q)), hi: Math.max(1, UPPER(q)) };
}
