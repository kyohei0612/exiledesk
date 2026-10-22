/**
 * hand-effect.ts — 手の働きとカタリストを最大まで入れる (2026-10-22 シミュの自前の式を入口へ、sim-own-logic.md の B4・B5)。
 * 打つ処理はエンジンの applyCurrency のまま。ここは「その手で何が起きる種類か」と「品質が最大になるまでカタリストを打つ」をまとめるだけ
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { applyCurrency, kindOf } from "../apply-currency";
import { catalystBoosts, catalystOf, maxQualityOf } from "../stage-core";
import type { StageApply, StageItem } from "../types";
import { tr } from "../../../i18n/lang";

/** 手の働き: quality = カタリスト (品質だけ)、essence = エッセンス、swap = カオス (1 つ消して 1 つ付く)、remove = 消去、fracture = フラクチャー、add = それ以外 (足す) */
export type CurrencyEffect = "quality" | "essence" | "swap" | "remove" | "fracture" | "add";
export function effectOf(key: string): CurrencyEffect {
  const k = kindOf(key);
  if (k === "catalyst") return "quality";
  if (k.startsWith("essence")) return "essence";
  return k === "chaos" ? "swap" : k === "annul" ? "remove" : k === "fracture" ? "fracture" : "add";
}
/** カタリストの種類 (タグ)。catalyst_<タグ>・jcatalyst_<タグ> (spec/run-spec と同じ取り方) */
export const catalystTagOf = (key: string): string => key.slice(key.indexOf("_") + 1);
/** そのカタリストの種類で品質が最大か (指輪・アミュレットなどは別の欄のカタリストの品質、catalystOf) */
export function catalystFull(item: StageItem, key: string): boolean {
  const c = catalystOf(item);
  return c.tag === catalystTagOf(key) && c.pct >= maxQualityOf(item);
}
/** カタリストを打つ上限 (見張り。品質の上限より十分大きい) */
const CAT_MAX = 200;
/**
 * カタリストを品質が最大になるまで打つ (1 回 = 1 個、oneCatalyst)。別の種類が入っていれば 0 から (エンジンどおり)。count = 打った個数 (費用はこの分)。
 * 1 個も打てなければ count 0 と、その理由 (もう最大なら「品質はもう最大」)
 */
export function fillCatalyst(data: PatchData, item: StageItem, key: string, rng: () => number): StageApply & { count: number } {
  let it = item, count = 0, last: StageApply = { applied: false, item, added: [], removed: [] };
  for (let i = 0; i < CAT_MAX && !catalystFull(it, key); i++) {
    last = applyCurrency(data, it, key, rng, [], { oneCatalyst: true });
    if (!last.applied) break;
    it = last.item;
    count++;
  }
  return count ? { ...last, applied: true, item: it, count } : { ...last, count: 0, ...(last.applied || last.reason ? {} : { reason: tr("品質はもう最大", "Quality is already at max") }) };
}
/** その MOD を伸ばすカタリスト (keys の並びで最初の物、伸ばす物が無ければ null)。伸びるかはエンジンの catalystBoosts (指輪・アミュレットは MOD の tags、ジュエル・上のベースは中身のタグ) */
export function catalystForMod(data: PatchData, item: StageItem, modId: string, keys: readonly string[]): string | null {
  const mod = data.mods.get(modId);
  if (!mod) return null;
  return keys.find((k) => catalystBoosts(item, { modId, tags: mod.tags }, catalystTagOf(k), data)) ?? null;
}
