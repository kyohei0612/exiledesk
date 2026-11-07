/**
 * use-words.ts — カレンシーを打てる条件の文 (日英) をカレンシーの定義 (CurrencySpec の target・limits) から作る (2026-11-07 ジン jin-base3、
 * デザイン部長 design-own の頼み。オーナー「全て」= 説明カードの「マジックのみ」「MOD 4 つ以上」も打つ処理と同じ定義から)。
 * 打てない時の理由の文は judge.ts (limitBlock・targetBlock)、こちらは打つ前に読む「使える時」の文。並びは定義の順 (レアリティ → limits)。
 * 部位 (target.groups) も「○○だけ」の文で返す (11-07 デザイン部長の頼み)。特殊なエッセンスの部位は鍵の表から essencePartsOf
 */
import type { StageRarity } from "../types";
import type { ItemGroup } from "../../mods/item-classes";
import { ESSENCE_KEYS } from "../../htc/essence-key-table";
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
/** 部位のまとまりの名前 (E-12 の ItemGroup) */
const GROUP: Record<ItemGroup, Words2> = {
  weapon: { ja: "武器", en: "Weapons" }, martial: { ja: "マーシャル武器", en: "Martial Weapons" }, caster: { ja: "ワンド・スタッフ・セプター", en: "Wands, Staves and Sceptres" },
  wandStaff: { ja: "ワンド・スタッフ", en: "Wands and Staves" }, armour: { ja: "防具", en: "Armour" }, jewellery: { ja: "宝飾品", en: "Jewellery" },
  ringAmulet: { ja: "指輪・アミュレット", en: "Rings and Amulets" }, quiver: { ja: "矢筒", en: "Quivers" }, jewel: { ja: "ジュエル", en: "Jewels" },
  flask: { ja: "フラスコ", en: "Flasks" }, charm: { ja: "チャーム", en: "Charms" }, gem: { ja: "スキルジェム", en: "Skill Gems" },
  bodyArmour: { ja: "胴の防具", en: "Body Armour" }, shieldLike: { ja: "盾・バックラー・フォーカス", en: "Shields, Bucklers and Foci" }, shield: { ja: "盾", en: "Shields" },
  equipment: { ja: "装備", en: "Equipment" },
};
const joinWords = (ws: readonly Words2[]): Words2 => ({ ja: ws.map((w) => w.ja).join("・"), en: ws.map((w) => w.en).join(", ") });
/** 部位の条件 (「宝飾品だけ」) */
export const groupWords = (gs: readonly ItemGroup[]): Words2 => { const w = joinWords(gs.map((g) => GROUP[g])); return { ja: `${w.ja}だけ`, en: `${w.en} only` }; };
/** MOD の id の頭 (部位の行、Boots_dex の Boots) の名前 */
const ROW: Record<string, Words2> = {
  Amulets: { ja: "アミュレット", en: "Amulets" }, Rings: { ja: "指輪", en: "Rings" }, Belts: { ja: "ベルト", en: "Belts" }, Quivers: { ja: "矢筒", en: "Quivers" },
  Body: { ja: "胴の防具", en: "Body Armour" }, Helmets: { ja: "兜", en: "Helmets" }, Gloves: { ja: "手袋", en: "Gloves" }, Boots: { ja: "靴", en: "Boots" },
  Shields: { ja: "盾", en: "Shields" }, Bucklers: { ja: "バックラー", en: "Bucklers" }, Foci: { ja: "フォーカス", en: "Foci" },
  OneHand: { ja: "片手武器", en: "One-Handed Weapons" }, TwoHand: { ja: "両手武器", en: "Two-Handed Weapons" }, Bows: { ja: "弓", en: "Bows" }, Crossbows: { ja: "クロスボウ", en: "Crossbows" },
  Quarterstaves: { ja: "クォータースタッフ", en: "Quarterstaves" }, Spears: { ja: "槍", en: "Spears" }, Sceptres: { ja: "セプター", en: "Sceptres" }, Staves: { ja: "スタッフ", en: "Staves" }, Wands: { ja: "ワンド", en: "Wands" },
};
/**
 * そのエッセンス (英名、例 "Essence of Horror") を使える部位 (同梱のエッセンスの鍵の表 = 部位ごとの MOD がある所)。並びは表の順、名前の無い頭はそのまま。
 * 特殊なエッセンス・合金の説明の「○○だけ」に使う (画面が部位を手で書かない)
 */
export function essencePartsOf(nameEn: string): Words2[] {
  const rows: string[] = [];
  for (const [k, v] of Object.entries(ESSENCE_KEYS)) {
    if (v?.en !== nameEn) continue;
    const row = k.split(":")[2]?.split("/")[0]?.split("_")[0];
    if (row && !rows.includes(row)) rows.push(row);
  }
  return rows.map((r) => ROW[r] ?? { ja: r, en: r });
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
  const gs = spec.target?.groups;
  return [...(rs?.length ? [rarityWords(rs)] : []), ...(gs?.length ? [groupWords(gs)] : []), ...(spec.limits ?? []).flatMap((l) => limitWords(l) ?? [])];
}
