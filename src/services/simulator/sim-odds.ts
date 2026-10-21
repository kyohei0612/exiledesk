/**
 * sim-odds.ts — ③ の式 (keep-compare・sim-greater・self-craft-dist・use-sim-calc) が使う 1 手の確率を、エンジンの入口から取る (2026-10-20 手 4)。
 * 前は式の中で modTierWeight・CURRENCY_FLOOR・ルーンの置き場を自分で組み、フラクチャーは「3 つに 1 つ」の定数だった。
 * ここは「どの状態のアイテムに何を打つか」を作るだけで、付く確率・側の割合・フラクチャーの当たりは入口 (addOddsBySpec・hitShare・addHitOdds・fractureHit) の物。
 * 式の組み方 (マジックのループ・× 本数) はそれぞれのファイルに残す
 */
import { addHitOdds, addOddsBySpec, fractureHit, hitShare, sideOfMod, type OddsTarget, type PatchData, type StageItem, type StageMod, type StageSide } from "../craft-stage/engine";
import { runeEnForId } from "./pattern";

/** 狙いのルーン (ルーンの MOD を狙う時) を差した、MOD の無いアイテム。アイテムレベルは ③ の入力の物 */
export function blankWith(data: PatchData, item: StageItem, itemLevel: number, rarity: StageItem["rarity"], targets: readonly OddsTarget[]): StageItem {
  const have = new Set((item.augments ?? []).map((a) => a.en));
  const runes = [...new Set(targets.map((t) => data.mods.get(t.modId)?.rune).filter((r): r is string => !!r))]
    .map((id) => runeEnForId(id)).filter((en): en is string => !!en && !have.has(en))
    .map((en) => ({ key: `rune:${en}`, en, ja: "", cat: "", textJa: "", textEn: "", stats: [] }));
  return { ...item, itemLevel, rarity, prefixes: [], suffixes: [], corrupted: false, augments: [...(item.augments ?? []), ...runes] };
}

/**
 * MOD の無いマジック (blank) に増強 (key) を 1 回打った時の候補から、側ごとの当たりの割合と、付く側の割合 (両側が空の時)。
 * hit(side, targets) = その側に付いた時に狙いのどれかが当たる割合 (その側の候補の重みの中で)
 */
export function magicAugOdds(data: PatchData, blank: StageItem, key: string): { hit: (side: StageSide, targets: readonly OddsTarget[]) => number; share: Record<StageSide, number> } {
  const cands = addOddsBySpec(data, blank, key, [])?.cands ?? [];
  const sum = (s: StageSide): number => cands.filter((c) => c.side === s).reduce((a, c) => a + c.w, 0);
  const pre = sum("prefix"), suf = sum("suffix");
  return {
    hit: (side, targets) => hitShare(cands.filter((c) => c.side === side), targets),
    share: pre + suf > 0 ? { prefix: pre / (pre + suf), suffix: suf / (pre + suf) } : { prefix: 0.5, suffix: 0.5 },
  };
}

/** 確率を数えるための MOD (modId と段だけ本物。値・文は見ない) */
function modFor(data: PatchData, modId: string, tierIndex: number, extra: Partial<StageMod> = {}): StageMod {
  const m = data.mods.get(modId);
  return { modId, family: m?.family ?? modId, side: sideOfMod(data, modId), tierIndex, tierName: "", affix: "", modLevel: 0, values: [], ranges: [], textJa: "", textEn: "", ...extra };
}

/**
 * 固定した MOD (fixed) + 外れ 1 つのレアにカオス (key) を 1 回打った時、付く物が狙いのどれかに当たる割合
 * (外れが消えて、固定した MOD の系統を除いた両側の候補から 1 つ)
 */
export function chaosAfterFix(data: PatchData, blank: StageItem, key: string, fixed: OddsTarget, targets: readonly OddsTarget[]): number {
  const fx = modFor(data, fixed.modId, fixed.minTierIndex, { fractured: true });
  const otherSide: StageSide = fx.side === "prefix" ? "suffix" : "prefix";
  const junk: StageMod = { ...modFor(data, "(外れ)", 0), side: otherSide, family: "(外れ)" };
  const item: StageItem = { ...blank, rarity: "rare", prefixes: [fx, junk].filter((m) => m.side === "prefix"), suffixes: [fx, junk].filter((m) => m.side === "suffix") };
  return addHitOdds(data, item, key, [], targets)?.p ?? 0;
}

/**
 * 狙い (fracture 候補の 1 つ目) + ほかの MOD (others 個) + 骨の壁 (未発現 1 つ) のレアにフラクチャーを 1 回打った時、狙いのどれかが固定される割合。
 * ③ の道は どれも「3 MOD + 壁」(白から: 狙い・反対側・王者 / 高貴、グレーター: 狙い・残す MOD・エッセンス、買う: 4 MOD の壁つき)
 */
export function fractureOdds(data: PatchData, blank: StageItem, targets: readonly OddsTarget[], others = 2): number {
  const t = targets[0];
  if (!t) return 0;
  const hit = modFor(data, t.modId, t.minTierIndex);
  const filler = Array.from({ length: others }, (_, i) => ({ ...modFor(data, `(ほか ${i + 1})`, 0), family: `(ほか ${i + 1})`, side: (i % 2 ? hit.side : hit.side === "prefix" ? "suffix" : "prefix") as StageSide }));
  const wall: StageMod = { ...modFor(data, "(壁)", 0), family: "(壁)", side: hit.side === "prefix" ? "suffix" : "prefix", desecrated: true, unrevealed: { floor: 0, altered: false, faction: null } };
  const all = [hit, ...filler, wall];
  const item: StageItem = { ...blank, rarity: "rare", prefixes: all.filter((m) => m.side === "prefix"), suffixes: all.filter((m) => m.side === "suffix") };
  return fractureHit(data, item, targets).p;
}
