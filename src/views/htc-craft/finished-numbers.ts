/**
 * finished-numbers.ts — 計算機の完成品の数値 (DPS・防御) (2026-10-03、防具・武器への拡張 その 4)
 *
 * 狙いの MOD を全部付けた完成品を、クラフトステージのアイテム (StageItem) として 2 つ組む:
 *   下限 = 各狙いの「この段以上」の段の一番下の値、上限 = その ilvl で出る一番上の段の一番上の値。
 * 数値の式はクラフトステージの stage-props.ts (ゲームのツールチップと同じ。品質は物理と防御に掛かる) をそのまま使う。
 * 素の数値の無いベース (装飾品など) は null
 */
import { freshItem } from "../../services/craft-stage/run-plan";
import { makeStageMod, withValues } from "../../services/craft-stage/stage-core";
import { numbersOf, type ItemNumbers } from "../../services/craft-stage/stage-props";
import type { StageItem, StageMod } from "../../services/craft-stage/types";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import type { PatchData } from "../../vendor/poe2htc/engine/types";

export function finishedNumbers(data: PatchData, base: string, itemLevel: number, quality: number, targets: readonly TierTarget[]): { lo: ItemNumbers; hi: ItemNumbers } | null {
  let it: StageItem;
  try {
    it = freshItem(data, base, itemLevel, "rare");
  } catch {
    return null;
  }
  const build = (high: boolean): StageItem => {
    const mods: StageMod[] = [];
    for (const t of targets) {
      const mod = data.mods.get(t.modId);
      if (!mod) continue;
      const top = mod.tiers.reduce((a, x, i) => (x.ilvl <= itemLevel ? i : a), t.minTierIndex ?? 0);
      const idx = high ? top : t.minTierIndex ?? 0;
      const tier = mod.tiers[idx];
      if (!tier) continue;
      const side = mod.type === "suffix" ? "suffix" : "prefix";
      const sm = makeStageMod(mod, side, idx, () => 0);
      // 段の幅の端 (画面の単位)。下限は一番下、上限は一番上
      const fixed = sm.ranges.map((r) => (high ? r[1] : r[0]));
      mods.push(withValues(sm, mod, () => 0, fixed));
    }
    return { ...it, quality, prefixes: mods.filter((m) => m.side === "prefix"), suffixes: mods.filter((m) => m.side === "suffix") };
  };
  const lo = numbersOf(build(false));
  const hi = numbersOf(build(true));
  // 武器でも防具でもない (アタック/秒も防御の素の値も無い) なら出さない
  if (!lo || !hi || (lo.aps == null && lo.armour == null && lo.evasion == null && lo.es == null)) return null;
  return { lo, hi };
}
