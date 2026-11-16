/**
 * daily-topic-card.ts — お題の知らせ (D-85b) に付ける品の絵の元。クラフト箱の絵 (D-20c) と同じ形 (server/web の box-card.js が絵にする) で、
 * 16:00 の台本 (scripts/_daily-roll-entry.ts) がお題を組んだ時にエンジンのデータから作り、お題の写し (daily_topics.type_snap の card) に残す。
 * 画面のカードを読む投稿 (daily-post-card.ts) と違い、字はお題の狙いの文 (ja) と段のまま。札 = 側と段 (1 は「P1」、ほかは「P2 以上」)
 * オーナー 11-16「これもクラフト箱みたいに画像で欲しいなついでにMODは文字で入らないしベースもいらない本日のクラフトお題で画像だけでいい」
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import art from "../../components/art/base-art.json";
import { classJa } from "../../services/items/base-catalog";
import { classOfBase } from "./daily-gen";
import { jaTypeName } from "../../i18n/item-names-ja";
import type { TopicQuality } from "./daily-quality";

/** n = 品の名前、a = ベースの絵のファイル名、h = 種類・アイテムレベル・品質の行、r = MOD の行 (s = 側、g = 札、t = 文)、l = 言語、k = 絵の見出しの種類 */
export type TopicCard = { n: string; a: string | null; h: string[]; r: Array<{ s: "P" | "S"; g: string; t: string }>; l: "ja"; k: "topic" };

export function topicCard(data: PatchData, base: string, ilvl: number, aims: ReadonlyArray<{ modId: string; tier: number; ja?: string; en?: string }>, quality: TopicQuality | null): TopicCard | null {
  const r = aims.slice(0, 12).map((a) => {
    const s: "P" | "S" = data.mods.get(a.modId)?.type === "suffix" ? "S" : "P";
    const t = (a.ja || a.en || "").replace(/\s+/g, " ").trim().slice(0, 120);
    return t ? { s, g: `${s}${a.tier}${a.tier === 1 ? "" : " 以上"}`, t } : null;
  }).filter((x): x is TopicCard["r"][number] => !!x);
  if (!r.length) return null;
  const cls = classOfBase(base);
  const h = [cls ? classJa(cls, false) : "", `アイテムレベル: ${ilvl}`, quality ? `品質: +${quality.value}%` : ""].filter(Boolean);
  return { n: jaTypeName(base) || base, a: (art as Record<string, string>)[base] ?? null, h, r, l: "ja", k: "topic" };
}
