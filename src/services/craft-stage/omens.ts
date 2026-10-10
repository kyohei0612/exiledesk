/**
 * クラフトステージ: お告げと、それが掛かる手の種類 (2026-09-27、ADR-001)
 *
 * id は price-keys.json の omens キー。側のある物の意味は計算機の [[omens.ts]] (htc) と同じ (左 = プレ / 右 = サフィ)。
 * 手の種類は apply-currency.ts の kindOf。1 つの手に何枚でも重ねられる (大いなる高貴 + 左の高貴 など)。
 */
import type { StageItem, StageSide } from "./types";
import { limitOf, listOf, room } from "./stage-core";
import { tr } from "../../i18n/lang";
export const OMEN_FOR: Readonly<Record<string, readonly string[]>> = {
  exalt: ["OmenofSinistralExaltation", "OmenofDextralExaltation", "OmenofGreaterExaltation", "OmenofCatalysingExaltation"],
  chaos: ["OmenofWhittling", "OmenofSinistralErasure", "OmenofDextralErasure"],
  annul: ["OmenofSinistralAnnulment", "OmenofDextralAnnulment", "OmenofLight"],
  essence_perfect: ["OmenofSinistralCrystallisation", "OmenofDextralCrystallisation"],
  desecrate: ["OmenofSinistralNecromancy", "OmenofDextralNecromancy", "OmenoftheSovereign", "OmenoftheLiege", "OmenoftheBlackblooded", "OmenofPutrefaction"],
  reveal: ["OmenofAbyssalEchoes"],
  divine: ["OmenofSanctification", "OmenoftheBlessed"],
  // 2026-10-05 オーナー「その 3 つも足して」(相場に値段がある = 今のゲームにある)
  chance: ["OmenofChance", "OmenoftheAncients"],
};
/**
 * 今のゲームに無いお告げ (2026-09-29、Forbidden Rites の相場 poe2scout で値段が 0 = 取引されていない。data-cache/market-snapshot-2026-09-29.json)。
 * オーナー「錬金術のお告げとかない、王者のお告げやら」。クライアントのデータには説明文付きで残っているので、表から外して打てない扱いにする
 * (決まり: カレンシーランキングに値段が無い物は使えない)。均質化・リコンビネーションも同じく値段 0 (元から棚に無い)
 */
export const REMOVED_OMENS: readonly string[] = [
  "OmenofSinistralCoronation", "OmenofDextralCoronation",
  "OmenofSinistralAlchemy", "OmenofDextralAlchemy",
  "OmenofGreaterAnnulment",
  "OmenofCorruption",
];
/**
 * 一緒に掛けられないお告げ (2026-10-09 お告げの洗い直し): 片方しか効かないのに両方減っていた (左と右・勢力 2 枚・削減と抹消・光と左右の消去)。
 * 同じ組のお告げを掛けると、前に掛けていた方を外す
 */
export const OMEN_EXCLUSIVE: readonly (readonly string[])[] = [
  ["OmenofSinistralExaltation", "OmenofDextralExaltation"],
  ["OmenofWhittling", "OmenofSinistralErasure", "OmenofDextralErasure"],
  ["OmenofSinistralAnnulment", "OmenofDextralAnnulment", "OmenofLight"],
  ["OmenofSinistralCrystallisation", "OmenofDextralCrystallisation"],
  ["OmenofSinistralNecromancy", "OmenofDextralNecromancy"],
  ["OmenoftheSovereign", "OmenoftheLiege", "OmenoftheBlackblooded"],
];
/** 棚に出す順 (手の種類ごと) */
export const OMEN_SHELF: readonly string[] = Object.values(OMEN_FOR).flat();
/** 効果の規則をまだ入れていない物 (棚には出すが打つと理由を返す)。2026-09-27 にヴァール・腐食・聖別を入れて空 */
export const UNMODELLED_OMENS: readonly string[] = [];
/** 勢力のお告げ → 冒涜の MOD のタグ (エンジンの DES_BOSS_TAG と同じ) */
export const FACTION_TAG: Readonly<Record<string, string>> = {
  OmenoftheSovereign: "ulaman_mod", OmenoftheLiege: "amanamu_mod", OmenoftheBlackblooded: "kurgal_mod",
};

/**
 * 今のアイテムでそのお告げを掛けても意味が無い / 掛けると打てなくなる時の一言 (無ければ null)。
 * 2026-10-10 オーナー「プレが埋まってる状態で左側は使えはするけど意味ないこと教えてあげた方がいい。サフィ冒涜したいけど、サフィ 1 以外全部
 * 埋まってたらお告げは付けれるけど意味ない (空きに勝手に入る)」。棚のお告げのアイコンの下に出す
 */
export function omenNote(omen: string, item: StageItem | null): string | null {
  if (!item) return null;
  const free = (s: StageSide): boolean => room(item, s);
  const removable = (s: StageSide): number => listOf(item, s).filter((m) => !m.fractured).length;
  const other = (s: StageSide): StageSide => (s === "prefix" ? "suffix" : "prefix");
  // 付ける側を決めるお告げ (高貴・骨)
  const addSide: Record<string, StageSide> = {
    OmenofSinistralExaltation: "prefix", OmenofDextralExaltation: "suffix",
    OmenofSinistralNecromancy: "prefix", OmenofDextralNecromancy: "suffix",
  };
  // 消す側を決めるお告げ (消去・カオス・パーフェクトエッセンス)
  const removeSide: Record<string, StageSide> = {
    OmenofSinistralAnnulment: "prefix", OmenofDextralAnnulment: "suffix",
    OmenofSinistralErasure: "prefix", OmenofDextralErasure: "suffix",
    OmenofSinistralCrystallisation: "prefix", OmenofDextralCrystallisation: "suffix",
  };
  if (item.rarity !== "rare") return null;
  const a = addSide[omen];
  if (a) {
    if (!free(a)) return a === "prefix" ? tr("プレ満杯で打てない", "Prefixes full") : tr("サフィ満杯で打てない", "Suffixes full");
    if (!free(other(a))) return tr("今は意味なし", "No effect now");
    return null;
  }
  const r = removeSide[omen];
  if (r) {
    if (!removable(r)) return tr("消せる物が無い", "Nothing to remove");
    if (!removable(other(r))) return tr("今は意味なし", "No effect now");
    return null;
  }
  if (omen === "OmenofGreaterExaltation") {
    const open = (["prefix", "suffix"] as const).reduce((n, sd) => n + Math.max(0, limitOf(item, sd) - listOf(item, sd).length), 0);
    return open === 1 ? tr("1 つしか付かない", "Only 1 slot open") : null;
  }
  if (omen === "OmenofCatalysingExaltation") return item.quality > 0 && item.qualityTag ? null : tr("品質が要る", "Needs quality");
  return null;
}
