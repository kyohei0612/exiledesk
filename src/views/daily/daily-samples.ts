/**
 * daily-samples.ts — 見本のお題 (D-90)。サーバーができたら消す。名前・数字は手で書いた見本で意味は無い。
 * 文は poe.ninja / トレードのコピーの形。読むのは投稿と同じ parseItemText。
 */
import type { DailyRankRow } from "./daily-api";

export type SampleTopic = { id: string; day: string; by: string; base: string; baseJa: string; ilvl: number; modCount: number; tries: number; text: string; rank: DailyRankRow[] };

const MIN = 60_000;
export const SAMPLE_TOPICS: SampleTopic[] = [
  {
    id: "s1", day: "11/01", by: "見本", base: "Gold Ring", baseJa: "金の指輪", ilvl: 82, modCount: 4, tries: 128,
    text: ["Rarity: Rare", "Doom Band", "Gold Ring", "Item Level: 82", "+100 to maximum Life", "+35% to Fire Resistance", "+35% to Cold Resistance", "+35% to Lightning Resistance"].join("\n"),
    rank: [
      { name: "見本の亡命者", cost: 312, rate: 94, ms: 41 * MIN },
      { name: "chaosman", cost: 338, rate: 91, ms: 58 * MIN },
      { name: "ヒネコラの弟子", cost: 356, rate: 97, ms: 37 * MIN },
      { name: "Exile77", cost: 401, rate: 90, ms: 52 * MIN },
    ],
  },
];
