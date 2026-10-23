/**
 * aim-text.ts — 「T8 以上」の狙いの文を、当たりになる値の幅全部で出す (2026-10-23 モンキーテストの 6:
 * 「最大ライフ (100-119)」にチェックすると狙いが「最大ライフ (10-19) T8 以上」と出て、選び間違えたと思われた)。
 * 幅 = 一番下の段の下の値から、このアイテムレベルで付く一番上の段の上の値まで (見せ方だけ。段の中身はエンジンの物のまま)
 */
import { fillModText, tierDisplayRanges, type Mod } from "../../services/craft-stage/engine";

export function aimRangeText(m: Mod, minTierIndex: number, ilvl: number): string {
  const lo = m.tiers[minTierIndex];
  if (!lo) return fillModText(m, []);
  let top = minTierIndex;
  for (let i = m.tiers.length - 1; i > minTierIndex; i--) if (m.tiers[i]!.ilvl <= ilvl) { top = i; break; }
  const a = tierDisplayRanges(lo), b = tierDisplayRanges(m.tiers[top]!);
  return fillModText(m, a.map(([x, y], i) => [Math.min(x!, b[i]?.[0] ?? x!), Math.max(y!, b[i]?.[1] ?? y!)]));
}
