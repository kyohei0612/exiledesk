/**
 * essence-kind.ts — エッセンスの MOD の 2 つの種類 (2026-10-05)
 *
 * オーナー「エッセンスはパーフェクトとそれ以外を MOD 分けようか、明確に使い道が違うから。これはエンジンごとだね」。
 * エンジンの MOD の出どころ (Mod.source) で分ける。画面はどれもここの名前と説明を使う (ステージの MOD 一覧・計算機の MOD の選び・MOD 解析・完成図)
 *   - essence         … レッサー / 普通 / グレーター。マジックに使ってレアにし、その MOD を 1 つ確定で付ける
 *   - perfect_essence … パーフェクトエッセンスと合金。レアに使ってクラフト MOD を付ける (1 つまで。結晶化のお告げで消す側を選ぶ)
 */
import type { Mod } from "../../vendor/poe2htc/engine/types";

export type EssenceKind = "essence" | "perfect_essence";
export const ESSENCE_KIND: Record<EssenceKind, { label: string; short: string; how: string }> = {
  // 札は両方「エッセンス」(2026-10-10 オーナー「パーフェクトとかやなくて意味わからん」)。違いは how (乗せると出る) で
  essence: { label: "エッセンス", short: "エッセンス", how: "レッサー〜グレーター。マジックをレアにして、その MOD を 1 つ確定で付ける" },
  perfect_essence: { label: "エッセンス", short: "エッセンス", how: "レアにクラフト MOD を確定で付ける (1 つまで。結晶化のお告げで消す側を選ぶ)" },
};
/** その MOD がどちらのエッセンスか (エッセンスでなければ null) */
export const essenceKindOf = (m: Pick<Mod, "source"> | null | undefined): EssenceKind | null =>
  m?.source === "perfect_essence" ? "perfect_essence" : m?.source === "essence" ? "essence" : null;
