/**
 * tier-rank.ts — 段の数え方の換算 (2026-10-22 シミュの自前の式を入口へ、sim-own-logic.md の B1)。
 * 段の番号 (tierIndex、0 = 一番下) と段の名前の T (T1 = 一番上 = tiers.length − tierIndex、stage-core の makeStageMod と同じ) を行き来する。
 * エッセンスの MOD の段の名前は、ふつうの MOD の段に合わせてある (apply-essence の normalTierOf) ので、T で比べると別の modId どうしでも揃う
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import type { StageMod } from "./types";
import { tr } from "../../i18n/lang";

/** 段の名前の T (T1 = 一番上) → 段の番号。MOD が無ければ 1 段として数える (シミュの ixOf と同じ) */
export const tierIndexOf = (data: PatchData, modId: string, rank: number): number => (data.mods.get(modId)?.tiers.length ?? 1) - rank;
/** 段の番号 → 段の名前の T。MOD が無ければ 0 */
export const tierRankOf = (data: PatchData, modId: string, index: number): number => (data.mods.get(modId)?.tiers.length ?? index) - index;
/** 付いている MOD の段の名前の T (名前に数字が無ければ 99 = 一番下より下) */
export const tierNoOf = (m: Pick<StageMod, "tierName">): number => Number(/\d+/.exec(m.tierName)?.[0] ?? 99);
/**
 * 狙い (modId と段の T) が全部付く一番低いアイテムレベル = その段の MOD レベルの一番高い物。分かる狙いが無ければ null。
 * エッセンスの MOD は数えない (アイテムレベルの制限は無い、essence-specs の owner。段の T も普通の MOD の段で数えた名前で、エッセンスの 3 段では読めない。10-24 シミュ部長)
 */
export function minIlvlFor(data: PatchData, aims: ReadonlyArray<{ modId: string; tier: number }>): number | null {
  const lv = aims.map((a) => {
    const m = data.mods.get(a.modId);
    if (!m || m.source === "essence" || m.source === "perfect_essence") return 0;
    return m.tiers[m.tiers.length - a.tier]?.ilvl ?? 0;
  }).filter((x) => x > 0);
  return lv.length ? Math.max(...lv) : null;
}
/** 段の札の文字: T1 はそのまま、ほかは「T2 以上」(atLeast = false で「T2」) */
export const tierRankLabel = (rank: number, atLeast = true): string => (!atLeast || rank === 1 ? `T${rank}` : tr(`T${rank} 以上`, `T${rank}+`));
/**
 * アイテムのカードの段の札 (トレードのサイトと同じ形、2026-10-24 オーナー「一般 MOD の火耐性 T3 とグレーターで付けた時の T3 が分けられたら何でもいい」):
 * エッセンス・完全エッセンス・合金で付いた MOD は "T0"、ほかは段の名前 (tierName) のまま。普通の MOD に合わせた段の名前は m.tierName に残る
 */
export function cardTierName(data: PatchData, m: Pick<StageMod, "modId" | "tierName">): string {
  const src = data.mods.get(m.modId)?.source;
  return src === "essence" || src === "perfect_essence" ? "T0" : m.tierName;
}
/**
 * カードの札の種類 (2026-10-24 デザイン部長 4 本目): エッセンス・完全エッセンスで付いた MOD は "essence"、合金で付いた MOD は "alloy"、ほかは null。
 * 判定は cardTierName と同じ source (essence / perfect_essence)。合金は完全エッセンスの MOD のうち、段の名前 (付けるアイテム) が「… Alloy」の物
 */
export function craftedKindOf(data: PatchData, m: Pick<StageMod, "modId">): "essence" | "alloy" | null {
  const mod = data.mods.get(m.modId);
  if (mod?.source === "essence") return "essence";
  if (mod?.source !== "perfect_essence") return null;
  return mod.tiers.some((t) => /Alloy$/.test(String(t.name ?? ""))) ? "alloy" : "essence";
}
