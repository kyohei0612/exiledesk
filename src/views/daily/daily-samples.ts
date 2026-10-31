/** daily-samples.ts — 順位の相手と先週の札の見本 (D-90)。サーバーができたら消す。名前・数字は手で書いた見本で意味は無い */
import type { DailyRankRow } from "./daily-api";

const MIN = 60_000;
const NAMES = ["見本の亡命者", "chaosman", "ヒネコラの弟子", "Exile77", "沼の住人"];
/** お題ごとに同じ見本の順位 */
export function sampleRank(id: string): DailyRankRow[] {
  const k = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
  return NAMES.map((name, i) => ({ name, cost: 180 + ((k * (i + 3)) % 90) + i * 55, rate: 90 + ((k + i * 3) % 9), ms: (24 + ((k + i * 7) % 34)) * MIN }));
}
/** 先週の順位の見本 (タグ D-54) */
export const LAST_WEEK: Record<string, number> = { "見本の亡命者": 1, chaosman: 2, Exile77: 6 };
