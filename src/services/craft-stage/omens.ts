/**
 * クラフトステージ: お告げと、それが掛かる手の種類 (2026-09-27、ADR-001)
 *
 * id は price-keys.json の omens キー。側のある物の意味は計算機の [[omens.ts]] (htc) と同じ (左 = プレ / 右 = サフィ)。
 * 手の種類は apply-currency.ts の kindOf。1 つの手に何枚でも重ねられる (大いなる高貴 + 左の高貴 など)。
 */
import type { StageItem, StageSide } from "./types";
import type { PatchData } from "../../vendor/poe2htc/engine";
import { bossOmenAllowed } from "../../vendor/poe2htc/engine/probability";
import { hasCatalystQuality, listOf, openSlots, room } from "./stage-core";
import { tr } from "../../i18n/lang";
import { FACTION_TAG, omenSideOf, omenSpecOf, omensOfKind } from "./spec/omen-layer";
import { OMEN_KEY } from "./spec/omen-keys";
export const OMEN_FOR: Readonly<Record<string, readonly string[]>> = {
  exalt: ["OmenofSinistralExaltation", "OmenofDextralExaltation", "OmenofGreaterExaltation", "OmenofCatalysingExaltation"],
  chaos: ["OmenofWhittling", "OmenofSinistralErasure", "OmenofDextralErasure"],
  annul: ["OmenofSinistralAnnulment", "OmenofDextralAnnulment", "OmenofLight"],
  essence_perfect: ["OmenofSinistralCrystallisation", "OmenofDextralCrystallisation"],
  desecrate: ["OmenofSinistralNecromancy", "OmenofDextralNecromancy", "OmenoftheSovereign", "OmenoftheLiege", "OmenoftheBlackblooded", "OmenofPutrefaction"],
  reveal: ["OmenofAbyssalEchoes"],
  divine: ["OmenofSanctification", "OmenoftheBlessed"],
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
 * 一緒に掛けられないお告げ (2026-10-09 お告げの洗い直し: 片方しか効かないのに両方減っていた。左と右・勢力 2 枚・光と左右の消去) と
 * 掛け替え (同じ組のお告げを掛けると前の方を外す)・勢力のタグは、お告げの層 (spec/omen-layer.ts) が OmenSpec のデータ (exclusive・supersedes・guaranteeTag) から作る。
 * 削減は左右の抹消と一緒に掛けられる (2026-10-11 要望 aa132a4a)、光を使う時は左右の消去は使えない (2026-10-17 オーナー)
 */
export { FACTION_TAG, OMEN_EXCLUSIVE, omenRivals, toggleOmen } from "./spec/omen-layer";

/**
 * 今のアイテムでそのお告げを掛けても意味が無い / 掛けると打てなくなる時の一言 (無ければ null)。
 * 2026-10-10 オーナー「プレが埋まってる状態で左側は使えはするけど意味ないこと教えてあげた方がいい。サフィ冒涜したいけど、サフィ 1 以外全部
 * 埋まってたらお告げは付けれるけど意味ない (空きに勝手に入る)」。棚のお告げのアイコンの下に出す
 */
/** omenNote と同じ一言 + 掛けても意味が無い (掛けられない) 物か。block の物はお告げの欄で灰色・押せない (2026-10-22 オーナー「進行不能」) */
export function omenNoteOf(omen: string, item: StageItem | null, data?: PatchData | null): { text: string; block: boolean } | null {
  const no = (text: string): { text: string; block: boolean } => ({ text, block: true });
  const say = (text: string): { text: string; block: boolean } => ({ text, block: false });
  if (!item) return null;
  // 勢力のお告げ: 部位に掛けられない / その勢力の MOD がこの部位に無い (セプターなど。骨は打てるが候補は普通の 3 つ。2026-10-11 オーナー)
  const fac = FACTION_TAG[omen];
  if (fac) {
    if (!bossOmenAllowed(item.cls.category)) return no(tr("武器・宝飾品・矢筒だけ", "Weapons, jewellery & quivers only"));
    const ids = [...item.cls.pools.desecrated.prefixes, ...item.cls.pools.desecrated.suffixes];
    if (data && !ids.some((id) => data.mods.get(id)?.tags.includes(fac))) return no(tr("この部位に勢力の MOD が無い (意味なし)", "No such mods on this item class (no effect)"));
  }
  // 効かない状態 (紋章のある品の左右のネクロマンシー = 紋章を置き換える、E-67) は今効くお告げの層 (omensOfKind) に聞く。打つ処理と同じ答え
  const spec = omenSpecOf(omen);
  if (spec?.idleWhen && !omensOfKind(spec.appliesTo, [omen], item).length) return no(tr("紋章を置き換えるので効かない", "Replaces the Abyssal mark (no effect)"));
  const free = (s: StageSide): boolean => room(item, s);
  const removable = (s: StageSide): number => listOf(item, s).filter((m) => !m.fractured).length;
  const other = (s: StageSide): StageSide => (s === "prefix" ? "suffix" : "prefix");
  // 側は OmenSpec の効き目から (付ける側 = 高貴・骨、消す側 = 消去・カオス・パーフェクトエッセンス)。
  // 骨は側が満杯でもその側の MOD を 1 つ置き換えて打てる (E-61、apply-desecrate.ts、2026-10-14 総点検で一言を直した)
  const { add: a, remove: r } = omenSideOf(omen);
  const replacesWhenFull = spec?.appliesTo === "desecrate";
  if (item.rarity !== "rare") return null;
  if (a) {
    if (!free(a)) return replacesWhenFull ? say(a === "prefix" ? tr("プレフィックス満杯: プレフィックスを 1 つ置き換える", "Prefixes full: replaces a prefix") : tr("サフィックス満杯: サフィックスを 1 つ置き換える", "Suffixes full: replaces a suffix")) : no(a === "prefix" ? tr("プレフィックス満杯で打てない", "Prefixes full") : tr("サフィックス満杯で打てない", "Suffixes full"));
    if (!free(other(a))) return no(tr("今は意味なし", "No effect now"));
    return null;
  }
  if (r) {
    if (!removable(r)) return no(tr("消せる物が無い", "Nothing to remove"));
    if (!removable(other(r))) return no(tr("今は意味なし", "No effect now"));
    return null;
  }
  if (omen === OMEN_KEY.greater) {
    return openSlots(item) === 1 ? say(tr("1 つしか付かない", "Only 1 slot open")) : null;
  }
  if (omen === OMEN_KEY.catalysing) return hasCatalystQuality(item) ? null : no(tr("品質が要る", "Needs quality"));
  return null;
}
export function omenNote(omen: string, item: StageItem | null, data?: PatchData | null): string | null {
  return omenNoteOf(omen, item, data)?.text ?? null;
}
