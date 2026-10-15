/**
 * 対象と制約の判定 (2026-10-16、ADR-004)。打てなければ一言、打てれば null。
 * 部位は item-classes.ts のまとまりで見る (部位の名前は書かない)。
 * 一言は今の関数 (apply-desecrate.ts など) と同じ文にしている (手順の再生の突き合わせで同じ結果になるように)
 */
import { inAny, inGroup } from "../../mods/item-classes";
import { allMods } from "../stage-core";
import { isFlask, isGem } from "../stage-bases";
import { REMOVED_OMENS } from "../omens";
import { ANY_STATE } from "../apply-extra";
import { DISPOSE_JA } from "../apply-dispose";
import type { StageItem, StageRarity } from "../types";
import type { CurrencySpec, Limit, Target } from "./types";
import { tr } from "../../../i18n/lang";

/** レアリティの組 → 一言 (今の関数の文) */
function rarityReason(rs: readonly StageRarity[]): string {
  const has = (r: StageRarity) => rs.includes(r);
  if (rs.length === 1 && has("rare")) return tr("レアのアイテムにだけ使える", "Rare items only");
  if (rs.length === 1 && has("magic")) return tr("マジックのアイテムにだけ使える", "Magic items only");
  if (rs.length === 1 && has("normal")) return tr("ノーマルのアイテムにだけ使える", "Normal items only");
  if (has("magic") && has("rare") && !has("normal")) return tr("マジックかレアのアイテムにだけ使える", "Magic or Rare items only");
  if (has("normal") && has("magic") && !has("rare")) return tr("ノーマルかマジックのアイテムにだけ使える", "Normal or Magic items only");
  return tr("このレアリティには使えない", "Can't be used on this rarity");
}

/** 部位だけ (骨の種類を選ぶのに使う) */
export const groupsFit = (t: Target, item: StageItem): boolean => !t.groups || inAny(item.cls.category, t.groups);

/** 対象の判定: 部位 → レアリティの順 */
export function targetBlock(t: Target, item: StageItem): string | null {
  if (!groupsFit(t, item)) return t.groupsReason ? tr(t.groupsReason.ja, t.groupsReason.en) : tr("この部位には使えない", "Can't be used on this item class");
  if (t.rarity && !t.rarity.includes(item.rarity as StageRarity)) return rarityReason(t.rarity);
  return null;
}

/** ジュエルはアイテムレベルを見ない (2026-10-12 オーナー、apply-currency.ts の noIlvl と同じ) */
const noIlvl = (item: StageItem): boolean => inGroup(item.cls.category, "jewel");

export function limitBlock(l: Limit, item: StageItem): string | null {
  switch (l.kind) {
    case "oneDesecratedMod":
      return allMods(item).some((m) => m.desecrated) ? tr("冒涜の MOD はアイテムに 1 つまで", "Only 1 Desecrated mod per item") : null;
    case "itemLevelAtLeast":
      return item.itemLevel < l.level && !noIlvl(item) ? tr(`アイテムレベルが ${l.level} 未満には使えない`, `Requires Item Level ${l.level}+`) : null;
    case "itemLevelAtMost":
      return item.itemLevel > l.level && !noIlvl(item) ? tr(`アイテムレベル ${l.level} 以下にだけ使える`, `Item Level ${l.level} or lower only`) : null;
    case "hasUnrevealed":
      return allMods(item).some((m) => m.unrevealed) ? null : tr("未発現の冒涜 MOD が無い", "No Unrevealed Desecrated mod");
  }
}

/**
 * どのカレンシーにも掛かる、アイテムの状態の決まり (applyCurrency の頭と同じ順)。
 * 壊れた・処分した・ミラー・未鑑定・聖別・コラプト (用語集 Corrupted「ほとんどのクラフトはコラプトに使えない」)・今のゲームに無いお告げ。
 * フラスコ・スキルジェムはこのステージが MOD を扱わない (ゲームの決まりではない)
 */
export function stateBlock(spec: CurrencySpec, item: StageItem, omens: readonly string[]): string | null {
  if (item.destroyed) return tr("壊れたアイテムには何も使えない", "Item is destroyed");
  if (item.disposed) return tr(`${DISPOSE_JA[item.disposed]}したアイテムには何も使えない`, `Item was ${item.disposed === "disenchant" ? "disenchanted" : "salvaged"}`);
  if (item.mirrored && !ANY_STATE.includes(spec.stageKey)) return tr("ミラーしたアイテムには使えない", "Can't modify a Mirrored item");
  if (item.identified === false) return tr("未鑑定 (先に鑑定の巻物で鑑定する)", "Unidentified (identify it with a Scroll of Wisdom first)");
  if (item.sanctified) return tr("聖別したアイテムには使えない", "Can't modify a Sanctified item");
  if (item.corrupted && !spec.allowCorrupted) return tr("コラプトしたアイテムには使えない", "Can't modify a Corrupted item");
  if (omens.some((o) => REMOVED_OMENS.includes(o))) return tr("今のゲームに無いお告げ", "This Omen is no longer in the game");
  if (isFlask(item.cls.category) || isGem(item.cls.category)) return isGem(item.cls.category) ? tr("スキルジェムには使えない", "Can't be used on Skill Gems") : tr("フラスコには使えない (このステージでは MOD を扱わない)", "Can't be used on Flasks (flask mods aren't supported)");
  return null;
}
