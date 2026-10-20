/**
 * boosts.ts — MOD の値の上乗せの一覧と割り戻し (2026-10-20 J8、オーナー「MOD の数字は上乗せを全部抜いた素の値と段で出す、盛った値は要る所でだけ小さく」)。
 *
 * 上乗せはここに 1 か所。画面・シミュ・貼り付けの読みはここを呼ぶだけにする (自前で割り戻さない)。今エンジンが掛けている上乗せは 3 つ:
 *   quality    … カタリストの品質 (指輪・アミュレット・ジュエル・グラスピングメイルの catalystQuality)。その種類のタグを持つ MOD に掛かる (catalystBoosts)
 *   sideEffect … 反対側の「サフィックス / プレフィックスの効果が N% 増加する」(液化した感情の獰猛、sideEffectPct)
 *   magnitude  … ルーンで付く「明示 ○○ MOD の強さが N% 増加する」(その種類のタグを持つ明示 MOD に、magnitudePct。2026-10-21 J11)
 *   sanctify   … 聖別の倍率 (0.78〜1.22)。MOD の values は掛けた後で、掛ける前の値は m.sanctify.base
 * 表示 = floor(素 × 聖別の倍率 × (1 + (品質 + 側の効果 + 強さ) / 100)) (displayedValue と同じ切り捨て)。
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { boostedMod, catalystBoosts, catalystOf, magnitudePct, sideEffectPct, SIDES } from "./stage-core";
import { rawValue } from "../htc/quality";
import type { StageItem, StageMod, StageSide } from "./types";

export type BoostKind = "quality" | "sideEffect" | "magnitude" | "sanctify";
/** MOD 1 つに掛かっている上乗せ。pct = 足される %(聖別は (倍率 - 1) × 100)、tag = 品質の種類 (attack・caster …) */
export interface ModBoost { kind: BoostKind; pct: number; tag?: string }
/** アイテム全体の上乗せ (どの MOD に掛かるかは modBoostsOf で) */
export interface ItemBoost { kind: BoostKind; pct: number; tag?: string; side?: StageSide }

/** アイテムにある上乗せ (品質の種類と %・側ごとの効果・聖別した MOD があるか) */
export function boostsOf(item: StageItem): ItemBoost[] {
  const out: ItemBoost[] = [];
  const { tag, pct } = catalystOf(item);
  if (tag && pct > 0) out.push({ kind: "quality", pct, tag });
  for (const side of SIDES) { const p = sideEffectPct(item, side); if (p > 0) out.push({ kind: "sideEffect", pct: p, side }); }
  if ([...item.prefixes, ...item.suffixes].some((m) => m.sanctify && m.sanctify.k !== 1)) out.push({ kind: "sanctify", pct: 0 });
  return out;
}

/** その MOD に掛かっている上乗せ */
export function modBoostsOf(item: StageItem, m: StageMod, data?: PatchData): ModBoost[] {
  const out: ModBoost[] = [];
  const { tag, pct } = catalystOf(item);
  if (tag && pct > 0 && catalystBoosts(item, m, tag, data)) out.push({ kind: "quality", pct, tag });
  const se = sideEffectPct(item, m.side);
  if (se > 0) out.push({ kind: "sideEffect", pct: se });
  const mg = magnitudePct(item, m, data);
  if (mg > 0) out.push({ kind: "magnitude", pct: mg });
  if (m.sanctify && m.sanctify.k !== 1) out.push({ kind: "sanctify", pct: Math.round((m.sanctify.k - 1) * 100) });
  return out;
}

/** MOD の素の値 (上乗せを全部抜いた値) と、画面に出ている盛った値 */
export function baseValueOf(item: StageItem, m: StageMod, data?: PatchData): { base: number[]; shown: number[]; boosts: ModBoost[] } {
  return {
    base: m.sanctify ? [...m.sanctify.base] : [...m.values],
    shown: boostedMod(item, m, data)?.values ?? [...m.values],
    boosts: modBoostsOf(item, m, data),
  };
}

/**
 * 盛った値 (貼り付けなど) から素の値へ割り戻す。pct = 品質 + 側の効果。表示は切り捨てなので、整数は同じ表示になる一番小さい整数 (quality.ts の rawValue)
 */
export function unboost(shown: readonly number[], pct: number): number[] {
  return pct > 0 ? shown.map((v) => rawValue(v, pct)) : [...shown];
}
