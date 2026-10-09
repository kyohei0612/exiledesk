/**
 * held-odds.ts — 持っているカレンシーで次に付く確率 (MOD 一覧の確率表、2026-10-09)
 *
 * StageModList.vue から切り出した。表に出す数と打った結果が同じ決まりで出るかを tests/held-odds-parity.test.ts で全部突き合わせる
 * (オーナー「お告げ系全部、異界も 0%、コルとか特殊モッド含め全部確認せえ」)。
 *   - MOD を足す手 (変成・増強・王者・錬金・高貴・カオス): apply-currency の addCandidates (打つ処理と同じ候補・重み・お告げ・触媒・ルーン)
 *   - 骨: 次の発現で候補 3 つに出る確率。エンジンの desecrationOfferProbability / desecrationBossOfferProbability (計算機と同じ)
 * byMod の w は、足す手なら重み (total で割ると確率)、骨なら確率そのもの (total = 1)
 */
import type { PatchData, ItemState } from "../../vendor/poe2htc/engine/types";
import { ANCIENT_BONE_FLOOR, desecrationBossOfferProbability, desecrationOfferProbability, type DesecrationBossOmen } from "../../vendor/poe2htc/engine/probability";
import { addCandidates } from "./apply-currency";
import { allMods, effectiveCls } from "./stage-core";
import type { StageItem } from "./types";

export interface HeldOdds {
  byMod: Map<string, { w: number; tiers: Array<{ index: number; w: number }> }>;
  total: number;
  /** 骨 (候補 3 つに出る確率) */
  bone?: true;
}

const BOSS: Record<string, DesecrationBossOmen> = { OmenoftheSovereign: "sovereign", OmenoftheLiege: "liege", OmenoftheBlackblooded: "blackblooded" };

export function heldOdds(data: PatchData, item: StageItem, key: string, omens: readonly string[]): HeldOdds | null {
  if (key.startsWith("desecrate") && !omens.includes("OmenofPutrefaction")) return boneOdds(data, item, key, omens);
  const cs = addCandidates(data, item, key, omens);
  if (!cs) return null;
  return { byMod: new Map(cs.map((c) => [c.mod.id, { w: c.w, tiers: c.tiers }])), total: cs.reduce((a, c) => a + c.w, 0) };
}

/**
 * 骨: MOD ごとに「次の発現の候補 3 つに出る確率」、段ごとは「その段で出る確率」(その段以上 − 1 つ上の段以上)。
 * 勢力のお告げは候補 3 つが全部その勢力 (足りなければ数だけ)。変質した鎖骨は異界の MOD も専用の側に入る。差したルーンの MOD は普通の置き場に入る
 */
function boneOdds(data: PatchData, item: StageItem, key: string, omens: readonly string[]): HeldOdds | null {
  if (item.rarity !== "rare") return null;
  const byMod: HeldOdds["byMod"] = new Map();
  if (allMods(item).some((m) => m.desecrated)) return { byMod, total: 1, bone: true };
  const cls = effectiveCls(item);
  const state: ItemState = {
    base: cls, level: item.itemLevel, rarity: "rare",
    prefixes: item.prefixes.filter((m) => !m.unrevealed).map((m) => ({ modId: m.modId, tierName: m.tierName })),
    suffixes: item.suffixes.filter((m) => !m.unrevealed).map((m) => ({ modId: m.modId, tierName: m.tierName })),
  };
  const boss = omens.map((o) => BOSS[o]).find(Boolean);
  const constrainTo = omens.includes("OmenofSinistralNecromancy") ? "prefix" as const : omens.includes("OmenofDextralNecromancy") ? "suffix" as const : undefined;
  const rerolls = omens.includes("OmenofAbyssalEchoes") ? 1 : 0;
  const altered = key === "desecrate_altered";
  const opts = { floor: key === "desecrate_ancient" ? ANCIENT_BONE_FLOOR : 0, altered, rerolls, ...(constrainTo ? { constrainTo } : {}) };
  const ids = new Set([
    ...cls.pools.normal.prefixes, ...cls.pools.normal.suffixes,
    ...cls.pools.desecrated.prefixes, ...cls.pools.desecrated.suffixes,
    ...(altered ? [...(cls.pools.otherworldly?.prefixes ?? []), ...(cls.pools.otherworldly?.suffixes ?? [])] : []),
  ]);
  for (const id of ids) {
    const mod = data.mods.get(id);
    if (!mod) continue;
    const atLeast = boss
      ? mod.tiers.map((_, i) => (i === 0 ? desecrationBossOfferProbability(data, state, id, { omen: boss, rerolls, ...(constrainTo ? { constrainTo } : {}) }) : 0))
      : mod.tiers.map((_, i) => desecrationOfferProbability(data, state, id, { ...opts, minTierIndex: i }));
    const w = atLeast[0] ?? 0;
    if (!(w > 0)) continue;
    byMod.set(id, { w, tiers: atLeast.map((p, i) => ({ index: i, w: p - (atLeast[i + 1] ?? 0) })).filter((t) => t.w > 0) });
  }
  return { byMod, total: 1, bone: true };
}
