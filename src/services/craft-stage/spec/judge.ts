/**
 * 対象と制約の判定 (2026-10-16、ADR-004)。打てなければ一言、打てれば null。
 * 部位は item-classes.ts のまとまりで見る (部位の名前は書かない)。
 * 一言は今の関数 (apply-desecrate.ts など) と同じ文にしている (手順の再生の突き合わせで同じ結果になるように)
 */
import { inAny, inGroup } from "../../mods/item-classes";
import { allMods, catalystRoom, hasCatalystQuality, hasExtraCatalyst, limitOf, room, SIDES, takenFamilies } from "../stage-core";
import { craftedLimitOf, essenceTarget, infiniteChoices, isInfiniteEssence } from "../apply-essence";
import { familyBlocked } from "../../mods/mod-rules";
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { socketCapOf } from "../stage-runes";
import { canFracture } from "../../mods/item-classes";
import type { Mods } from "./parts";
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
export const groupsFit = (t: Target, item: StageItem): boolean => !t.groups || inAny(item.cls.category, t.groups) || (!!t.orImplicitCatalyst && hasExtraCatalyst(item.base));

/** 対象の判定: 部位 → レアリティの順 */
export function targetBlock(t: Target, item: StageItem): string | null {
  if (!groupsFit(t, item)) return t.groupsReason ? tr(t.groupsReason.ja, t.groupsReason.en) : tr("この部位には使えない", "Can't be used on this item class");
  if (t.rarity && !t.rarity.includes(item.rarity as StageRarity)) return t.rarityReason ? tr(t.rarityReason.ja, t.rarityReason.en) : rarityReason(t.rarity);
  return null;
}

/**
 * ジュエルはアイテムレベルを見ない (MOD は全部レベル 1・重みは全部同じで、画面にもアイテムレベルを出さない。2026-10-12 オーナー
 * 「ジュエルにアイテムレベルって意味あるんか」)。カレンシー・骨のアイテムレベルの制限も掛けない
 */
export const noIlvl = (item: StageItem): boolean => inGroup(item.cls.category, "jewel"); // E-11b の例外 (ジュエルはアイテムレベルを見ない)

/** mods = その手に掛かるお告げの効き目 (空きの判定はお告げの側で見る)。tag = 触媒の品質の種類。ess = エッセンスの手の鍵 (essenceFamilyFree) */
export function limitBlock(l: Limit, item: StageItem, mods?: Mods, tag?: string | null, ess?: { data: PatchData; key: string }): string | null { // E-21 打てるかは乱数に関係ない条件だけ
  switch (l.kind) {
    case "oneDesecratedMod": // E-60
      return allMods(item).some((m) => m.desecrated) ? tr("冒涜の MOD はアイテムに 1 つまで", "Only 1 Desecrated mod per item") : null;
    case "itemLevelAtLeast":
      return item.itemLevel < l.level && !noIlvl(item) ? tr(`アイテムレベルが ${l.level} 未満には使えない`, `Requires Item Level ${l.level}+`) : null;
    case "itemLevelAtMost":
      return item.itemLevel > l.level && !noIlvl(item) ? tr(`アイテムレベル ${l.level} 以下にだけ使える`, `Item Level ${l.level} or lower only`) : null;
    case "hasUnrevealed":
      return allMods(item).some((m) => m.unrevealed) ? null : tr("未発現の冒涜 MOD が無い", "No Unrevealed Desecrated mod");
    case "openSlot": { // E-11e・E-11g (お告げの側だけを見る)
      const side = mods?.side;
      if ((side ? [side] : SIDES).some((s) => room(item, s))) return null;
      if (side) return tr("お告げの側に空きが無い", "No open slot on the Omen's side");
      // ベースの暗黙で枠が 0 のマジック (不在のアミュレット = プレフィックス -1 / サフィックス -1。要望 752b6d80 で「見えない MOD が付いている」と思われた)
      if (item.rarity === "magic" && SIDES.every((s) => limitOf(item, s) === 0)) return tr("このベースはマジックの枠が 0 (暗黙のプレフィックス -1 / サフィックス -1)。王者のオーブでレアにすると付けられる", "This base has no Magic affix slots (implicit -1 Prefix / -1 Suffix). Use a Regal Orb to make it Rare first");
      return l.reason ? tr(l.reason.ja, l.reason.en) : tr("足す枠が無い", "No open affix slot");
    }
    case "modsAtLeast":
      return allMods(item).length >= l.n ? null : tr(`MOD が ${l.n} つ以上要る`, `Needs ${l.n}+ mods`);
    case "noFractured":
      return allMods(item).some((m) => m.fractured) ? tr("もう固定した MOD がある", "Already has a Fractured mod") : null;
    case "noRevealedDesecrated":
      return allMods(item).some((m) => m.desecrated && !m.unrevealed) ? tr("発現済みの冒涜 MOD があると使えない (未発現なら使える)", "Can't be used while a revealed Desecrated mod is present (unrevealed is fine)") : null;
    case "noAbyssMark":
      return allMods(item).some((m) => m.abyssMark) ? tr("アビサルロードの紋章がもう付いている", "Already has a Mark of the Abyssal Lord") : null;
    case "craftedSlot": { // E-11h
      const limit = craftedLimitOf(item);
      if (allMods(item).filter((m) => m.crafted).length < limit) return null;
      return limit > 1 ? tr(`クラフト MOD はアストリッドの創造性込みで ${limit} つまで`, `Max ${limit} crafted mods (with Astrid's Creativity)`) : tr("エッセンスの MOD はアイテムに 1 つまで (アストリッドの創造性で増える)", "Only 1 Essence mod per item (more with Astrid's Creativity)");
    }
    case "essenceFamilyFree": {
      if (!ess) return null;
      // 無限のエッセンスは付いていない能力値から選ぶので、選べる物が残っていれば打てる (E-50)
      const free = isInfiniteEssence(ess.key) ? infiniteChoices(ess.data, item, ess.key).length > 0 : (() => { const t = essenceTarget(ess.data, item, ess.key); return !t || !familyBlocked(t.mod, takenFamilies(ess.data, item)); })();
      return free ? null : tr("同じ系統の MOD が付いている", "A mod of the same group is already on the item");
    }
    case "qualityBelow": {
      const cat = l.max === "catalyst" ? catalystRoom(item, tag as string) : null;
      const max = cat ? cat.max : (l.max as number);
      const now = cat ? cat.now : item.quality;
      return now >= max ? tr(`品質が上限 (${max}%)`, `Quality is maxed (${max}%)`) : null;
    }
    case "hasCatalystQuality": { // グラスピングメイルはベースの品質とは別の欄 (catalystOf、E-71)
      return hasCatalystQuality(item) ? null : tr("触媒の高貴のお告げは品質 (カタリスト) が要る", "Omen of Catalysing Exaltation needs Catalyst quality");
    }
    case "socketsBelowCap": {
      const max = socketCapOf(item.base, item.cls.category);
      const n = item.sockets ?? 0;
      if (n < max) return null;
      return n > max ? tr(`ソケットが規格外 (${n})。熟練工のオーブで足せるのは ${max} まで`, `Sockets over the limit (${n}); Artificer's Orbs add up to ${max}`) : tr(`ソケットが上限 (${max})`, `Sockets are maxed (${max})`);
    }
    case "fracturableClass":
      return canFracture(item.cls.category) ? null : tr("この部位はフラクチャーできない", "This item class can't be Fractured");
    case "noCrafted":
      return allMods(item).some((m) => m.crafted) ? tr("作った MOD が付いているジュエルには使えない", "Can't be used while the jewel has a crafted mod") : null;
  }
}

/**
 * どのカレンシーにも掛かる、アイテムの状態の決まり (applyCurrency の頭と同じ順)。
 * 壊れた・処分した・ミラー・未鑑定・聖別・コラプト (用語集 Corrupted「ほとんどのクラフトはコラプトに使えない」)・今のゲームに無いお告げ。
 * フラスコ・スキルジェムはこのステージが MOD を扱わない (ゲームの決まりではない)
 */
export function stateBlock(spec: CurrencySpec, item: StageItem, omens: readonly string[]): string | null { // E-18 フラスコ・E-26 聖別済み (状態の決まり)
  const st = itemStateBlock(item, ANY_STATE.includes(spec.stageKey)) ?? lockedStateBlock(item, { sanctifiedOk: !!spec.allowSanctified, unidentifiedOk: false });
  if (st) return st;
  if (item.corrupted && !spec.allowCorrupted) return tr("コラプトしたアイテムには使えない", "Can't modify a Corrupted item");
  const gone = removedOmenBlock(omens);
  if (gone) return gone;
  if (!spec.modless) return modlessBlock(item);
  return null;
}
/** フラスコ・スキルジェム (このステージは MOD を扱わない) には打てない (E-18)。説明文で打つ手 (stateBlock) と移していない手 (applyCurrency) が同じ物 */
export function modlessBlock(item: StageItem): string | null {
  if (isGem(item.cls.category)) return tr("スキルジェムには使えない", "Can't be used on Skill Gems");
  if (isFlask(item.cls.category)) return tr("フラスコには使えない (このステージでは MOD を扱わない)", "Can't be used on Flasks (flask mods aren't supported)");
  return null;
}

/**
 * どの手にも掛かる品の状態の決まりのうち、壊れた・処分した・ミラー (anyState = 状態を問わない手 = 鏡・抽出は通す)。
 * 説明文で打つ手 (stateBlock) と、まだ説明文に移していない手を振り分ける applyCurrency の頭が同じ物を呼ぶ (2026-11-07 に写しを 1 本に)
 */
export function itemStateBlock(item: StageItem, anyState: boolean): string | null {
  if (item.destroyed) return tr("壊れたアイテムには何も使えない", "Item is destroyed");
  if (item.disposed) return tr(`${DISPOSE_JA[item.disposed]}したアイテムには何も使えない`, `Item was ${item.disposed === "disenchant" ? "disenchanted" : "salvaged"}`);
  if (item.mirrored && !anyState) return tr("ミラーしたアイテムには使えない", "Can't modify a Mirrored item");
  return null;
}
/** 聖別済みの品には何も打てない (E-26)。apply-currency の SANCTIFIED_REASON もこの文 */
export const sanctifiedReason = (): string => tr("聖別済みのアイテムには手を加えられない", "Can't modify a Sanctified item");
/** 聖別済み (sanctifiedOk の手だけ通す)・未鑑定 (unidentifiedOk = 鑑定の巻物だけ通す) */
export function lockedStateBlock(item: StageItem, o: { sanctifiedOk: boolean; unidentifiedOk: boolean }): string | null {
  if (item.sanctified && !o.sanctifiedOk) return sanctifiedReason();
  if (item.identified === false && !o.unidentifiedOk) return tr("未鑑定 (先に鑑定の巻物で鑑定する)", "Unidentified (identify it with a Scroll of Wisdom first)");
  return null;
}
/** 今のゲームに無いお告げ (相場に値段が無い、omens.ts の REMOVED_OMENS) を掛けていたら打てない */
export const removedOmenBlock = (omens: readonly string[]): string | null => (omens.some((o) => REMOVED_OMENS.includes(o)) ? tr("今のゲームに無いお告げ", "This Omen is no longer in the game") : null);
