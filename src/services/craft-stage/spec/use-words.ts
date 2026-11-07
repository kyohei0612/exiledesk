/**
 * use-words.ts — カレンシーを打てる条件の文 (日英) をカレンシーの定義 (CurrencySpec の target・limits) から作る (2026-11-07 ジン jin-base3、
 * デザイン部長 design-own の頼み。オーナー「全て」= 説明カードの「マジックのみ」「MOD 4 つ以上」も打つ処理と同じ定義から)。
 * 打てない時の理由の文は judge.ts (limitBlock・targetBlock)、こちらは打つ前に読む「使える時」の文。並びは定義の順 (レアリティ → limits)。
 * 部位 (groups) は部位ごとの一言を定義が持つ (groupsReason) ので、ここでは出さない
 */
import type { StageRarity } from "../types";
import type { Limit } from "./types";
import { specOfKey } from "./run-spec";

export interface Words2 { ja: string; en: string }

const RARITY: Record<StageRarity, Words2> = {
  normal: { ja: "ノーマル", en: "Normal" }, magic: { ja: "マジック", en: "Magic" }, rare: { ja: "レア", en: "Rare" }, unique: { ja: "ユニーク", en: "Unique" },
};
/** レアリティの条件 (1 つなら「レアのみ」、2 つ以上なら「マジックかレア」) */
function rarityWords(rs: readonly StageRarity[]): Words2 {
  const ja = rs.map((r) => RARITY[r].ja), en = rs.map((r) => RARITY[r].en);
  return rs.length === 1 ? { ja: `${ja[0]}のみ`, en: `${en[0]} only` } : { ja: `${ja.join("か")}`, en: en.join(" or ") };
}
/** Limit 1 つの「使える時」の文 (無い物は null = 説明に出すほどでない) */
export function limitWords(l: Limit): Words2 | null {
  switch (l.kind) {
    case "oneDesecratedMod": return { ja: "冒涜の MOD がまだ無い (1 つまで)", en: "No Desecrated mod yet (1 per item)" };
    case "itemLevelAtLeast": return { ja: `アイテムレベル ${l.level} 以上`, en: `Item Level ${l.level}+` };
    case "itemLevelAtMost": return { ja: `アイテムレベル ${l.level} 以下`, en: `Item Level ${l.level} or lower` };
    case "hasUnrevealed": return { ja: "未発現の冒涜 MOD がある", en: "Has an Unrevealed Desecrated mod" };
    case "openSlot": return { ja: "付ける側に空きがある (お告げの側があればその側)", en: "Needs an open slot (on the Omen's side, if any)" };
    case "modsAtLeast": return { ja: `MOD が ${l.n} つ以上`, en: `${l.n}+ mods` };
    case "noFractured": return { ja: "フラクチャーがまだ無い", en: "No Fractured mod yet" };
    case "noAbyssMark": return { ja: "アビサルロードの紋章がまだ無い", en: "No Mark of the Abyssal Lord yet" };
    case "noRevealedDesecrated": return { ja: "発現済みの冒涜 MOD が無い (未発現ならよい)", en: "No revealed Desecrated mod (Unrevealed is fine)" };
    case "craftedSlot": return { ja: "クラフト MOD の空きがある (普通 1 つ、アストリッドの創造性で増える)", en: "A free crafted-mod slot (normally 1, more with Astrid's Creativity)" };
    case "essenceFamilyFree": return { ja: "同じ系統の MOD が付いていない", en: "No mod of the same group" };
    case "qualityBelow": return l.max === "catalyst" ? { ja: "品質が上限より下 (種類が変わる時は 0 から)", en: "Quality below the cap (restarts from 0 for a new type)" } : { ja: `品質が ${l.max}% より下`, en: `Quality below ${l.max}%` };
    case "hasCatalystQuality": return { ja: "カタリストの品質がある", en: "Has Catalyst quality" };
    case "socketsBelowCap": return { ja: "ソケットが上限より少ない", en: "Sockets below the cap" };
    case "fracturableClass": return { ja: "フラクチャーできる部位", en: "An item class that can be Fractured" };
    case "noCrafted": return { ja: "作った MOD がまだ無い", en: "No crafted mod yet" };
  }
}
/** その鍵のカレンシーを打てる条件の文 (レアリティ → limits の順)。説明文に移していない鍵は [] */
export function useConditions(key: string): Words2[] {
  const spec = specOfKey(key);
  if (!spec) return [];
  const rs = spec.target?.rarity;
  return [...(rs?.length ? [rarityWords(rs)] : []), ...(spec.limits ?? []).flatMap((l) => limitWords(l) ?? [])];
}
