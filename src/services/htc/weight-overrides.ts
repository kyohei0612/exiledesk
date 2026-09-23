/**
 * weight-overrides.ts — 重みが仮置きの 1 のままの MOD を、別の出どころで埋める (2026-09-23)
 *
 * ## 何が起きていたか
 * PoE2 のクライアントは MOD の重みを持っていません (0/1 だけ)。同梱エンジンの重みは poe2db から
 * 取っていますが、poe2db も「PoE1 で同じ系統の MOD の重み」を当てはめた推定で、**PoE2 の新 MOD は
 * 1 = 不明のまま**です ([[scripts/build-mod-weights-poe2db.mjs]] の注意書き)。
 *
 * その 1 を本物の重みとして計算していました。指輪のキャストスピード (5 段とも重み 1) は、
 * 知性 (1 段 1,000) の 1,000 分の 1 扱いになり、「サフィ 1 個で 1/20,964」「カオスで出すと 1 万神」
 * という数字が出ていました。**全部仮置きのせい**です。本家 poe2htc.com もキャスピの段が 0.0% と
 * 出ていて、同じ仮置きを使っていると見られます。
 *
 * ## 埋める値 — Craft of Exile (beta, PoE2) の重み
 * CoE の指輪 (ニーモニックリング) の表では、キャストスピードは**知性・耐性と同じ 1 段 1,000**。
 * CoE の他の MOD の重みは私たちの表と一致する (知性 1,000 / 全元素耐性 800) ので、**同じ物差しの上で
 * 仮置きの所だけ埋める**形になります。首飾りは 1 段 800 (6 段)。
 *
 * ## 断り
 * - CoE 自身が重みを「推定値」と断っています。裏が取れた値ではありません。
 * - オーナーが聞いた「実際にやっている人の平均 500〜1000 カオス」とは合いません。CoE の重みだと
 *   カオス 1 回で 1/32 (平均 32 回) で、20〜30 倍の開きがあります (2026-09-23)。
 *   **どちらが正しいかは実測が要ります** (安い指輪に 100 回打って数える、など)。
 */
import type { Mod, PatchData } from "../../vendor/poe2htc/engine/types";

/** 画面に出す断り書き */
export const WEIGHT_OVERRIDE_NOTE =
  "キャストスピード (指輪・首飾り) の重みは、データに無いので Craft of Exile の推定値 (指輪 1 段 1,000 / "
  + "首飾り 1 段 800) を使っています。実際にやっている人の平均 (500〜1000 カオス) とは 20〜30 倍合いません。";

/** MOD id → 段の出始め ilvl ごとの重み */
const OVERRIDES: Record<string, { source: string; byIlvl: Record<number, number> }> = {
  "Rings/IncreasedCastSpeed": {
    source: "Craft of Exile (beta, PoE2) CastSpeedJewellery1-5 / ring",
    byIlvl: { 1: 1000, 18: 1000, 35: 1000, 51: 1000, 60: 1000 },
  },
  "Amulets/IncreasedCastSpeed": {
    source: "Craft of Exile (beta, PoE2) CastSpeedJewellery1-6 / amulet",
    byIlvl: { 1: 800, 18: 800, 35: 800, 51: 800, 60: 800, 66: 800 },
  },
};

/** 上書きで重みを埋めた MOD の id (画面で「推定値」と断るため) */
export const OVERRIDDEN: ReadonlySet<string> = new Set(Object.keys(OVERRIDES));

/** 重みが「全段 1 以下」= 仮置きのままか */
export function isPlaceholderWeight(mod: Mod): boolean {
  return mod.tiers.length > 0 && mod.tiers.every((t) => t.weight <= 1);
}

/**
 * 仮置きの重みを上書きしたデータを返す。**仮置きのままの所だけ**上書きします
 * (本物の重みが入ってきたら、そちらが勝つ)。
 */
export function applyWeightOverrides(data: PatchData): { data: PatchData; applied: string[] } {
  const mods = new Map(data.mods);
  const applied: string[] = [];
  for (const [id, o] of Object.entries(OVERRIDES)) {
    const m = mods.get(id);
    if (!m || !isPlaceholderWeight(m)) continue;
    const tiers = m.tiers.map((t) => (o.byIlvl[t.ilvl] != null ? { ...t, weight: o.byIlvl[t.ilvl]! } : t));
    mods.set(id, { ...m, tiers });
    applied.push(id);
  }
  return { data: { ...data, mods }, applied };
}
