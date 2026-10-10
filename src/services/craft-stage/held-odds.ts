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
import { addCandidates, applyCurrency, kindOf } from "./apply-currency";
import { mulberry32 } from "../htc/rng";
import { allMods, effectiveCls, makeStageMod, room, SIDES, withMod, without } from "./stage-core";
import { boneSideWeights } from "./apply-desecrate";
import type { StageItem, StageMod, StageSide } from "./types";
import { ABYSS_MARK_FLOOR } from "../htc/omens";

export interface HeldOdds {
  byMod: Map<string, { w: number; tiers: Array<{ index: number; w: number }> }>;
  total: number;
  /** 骨 (候補 3 つに出る確率) */
  bone?: true;
}

const BOSS: Record<string, DesecrationBossOmen> = { OmenoftheSovereign: "sovereign", OmenoftheLiege: "liege", OmenoftheBlackblooded: "blackblooded" };

export function heldOdds(data: PatchData, item: StageItem, key: string, omens: readonly string[]): HeldOdds | null {
  if (key.startsWith("desecrate") && !omens.includes("OmenofPutrefaction")) return boneOdds(data, item, key, omens);
  if (kindOf(key) === "exalt" && omens.includes("OmenofGreaterExaltation")) return twoAdds(data, item, key, omens);
  if (MANY.has(kindOf(key))) return sampled(data, item, key, omens);
  const cs = addCandidates(data, item, key, omens);
  if (!cs) return null;
  return { byMod: new Map(cs.map((c) => [c.mod.id, { w: c.w, tiers: c.tiers }])), total: cs.reduce((a, c) => a + c.w, 0) };
}

/** 1 回で MOD を幾つも足す・決まった MOD を足す手 (錬金 4 つ、エッセンス)。候補の式が無いので、打つ処理そのものを決まった種で回して数える */
const MANY = new Set(["alchemy", "essence", "essence_perfect"]);
const SAMPLES = 1500;
function sampled(data: PatchData, item: StageItem, key: string, omens: readonly string[]): HeldOdds | null {
  const byMod: HeldOdds["byMod"] = new Map();
  let ok = 0;
  for (let s = 1; s <= SAMPLES; s++) {
    const r = applyCurrency(data, item, key, mulberry32(7919 * s), [...omens]);
    if (!r.applied) { if (s === 1) return null; continue; }
    ok++;
    const seen = new Set<string>();
    for (const m of r.added ?? []) {
      if (seen.has(m.modId)) continue;
      seen.add(m.modId);
      const cur = byMod.get(m.modId) ?? { w: 0, tiers: [] };
      cur.w++;
      const t = cur.tiers.find((x) => x.index === m.tierIndex);
      if (t) t.w++; else cur.tiers.push({ index: m.tierIndex, w: 1 });
      byMod.set(m.modId, cur);
    }
  }
  if (!ok) return null;
  for (const x of byMod.values()) { x.w /= ok; for (const t of x.tiers) t.w /= ok; }
  return { byMod, total: 1 };
}

/**
 * 大いなる高貴 (2 つ足す): MOD ごとに「2 つのどちらかで付く確率」= 1 つ目で付く + 1 つ目が別の MOD だった時に 2 つ目で付く。
 * 2 つ目は 1 つ目が付いた後の候補 (側の空き・同じ系統・触媒の重みも同じ) で引く (2026-10-10 オーナー「偉大の高貴のお告げで確率が上がらない」:
 * 前は 1 つ足す時の割合のままで、お告げのオン / オフで表が変わらなかった)。total = 1 (確率そのもの)
 */
function twoAdds(data: PatchData, item: StageItem, key: string, omens: readonly string[]): HeldOdds | null {
  const first = addCandidates(data, item, key, omens);
  if (!first) return null;
  const W = first.reduce((a, c) => a + c.w, 0);
  if (!(W > 0)) return null;
  const byMod: HeldOdds["byMod"] = new Map();
  const add = (id: string, p: number, tiers: ReadonlyArray<{ index: number; w: number }>, tw: number): void => {
    const cur = byMod.get(id) ?? { w: 0, tiers: [] };
    cur.w += p;
    for (const t of tiers) {
      const x = cur.tiers.find((y) => y.index === t.index);
      if (x) x.w += (p * t.w) / tw; else cur.tiers.push({ index: t.index, w: (p * t.w) / tw });
    }
    byMod.set(id, cur);
  };
  for (const c1 of first) {
    const p1 = c1.w / W;
    add(c1.mod.id, p1, c1.tiers, c1.w);
    const it2 = withMod(item, makeStageMod(c1.mod, c1.side, c1.tiers[0]!.index, () => 0.5));
    const second = addCandidates(data, it2, key, omens);
    const W2 = second?.reduce((a, c) => a + c.w, 0) ?? 0;
    if (!second || !(W2 > 0)) continue;
    for (const c2 of second) add(c2.mod.id, p1 * (c2.w / W2), c2.tiers, c2.w);
  }
  return { byMod, total: 1 };
}

/**
 * 骨: MOD ごとに「次の発現の候補 3 つに出る確率」、段ごとは「その段で出る確率」(その段以上 − 1 つ上の段以上)。
 * 勢力のお告げは候補 3 つが全部その勢力 (足りなければ数だけ)。変質した鎖骨は異界の MOD も専用の側に入る。差したルーンの MOD は普通の置き場に入る
 */
function boneOdds(data: PatchData, item: StageItem, key: string, omens: readonly string[]): HeldOdds | null {
  if (item.rarity !== "rare") return null;
  const byMod: HeldOdds["byMod"] = new Map();
  if (allMods(item).some((m) => m.desecrated)) return { byMod, total: 1, bone: true };
  // 深淵の王の印: 骨は必ず印を置き換える (側は印の側、段の下限 ABYSS_MARK_FLOOR)。印は消える物として数えない (2026-10-10 点検)
  const mark = allMods(item).find((m) => m.abyssMark && !m.fractured);
  const omenSide: StageSide | undefined = omens.includes("OmenofSinistralNecromancy") ? "prefix" : omens.includes("OmenofDextralNecromancy") ? "suffix" : undefined;
  // 側が埋まっていたら、骨はその側の (固定していない) MOD を 1 つ等しい確率で消してから付く (applyBone の removeOne)。
  // 側を選ぶ重みは applyBone と同じ boneSideWeights (2026-10-10 総当たり: 両側が埋まったレアで表が全部 0% だった)
  const runs: Array<{ p: number; it: StageItem; side?: StageSide }> = [];
  const removal = (side: StageSide, p: number): void => {
    const rem = allMods(item).filter((m) => !m.fractured && m.side === side);
    for (const r of rem) runs.push({ p: p / rem.length, it: without(item, r), side });
  };
  if (mark) runs.push({ p: 1, it: without(item, mark), side: mark.side });
  else if (omenSide) { if (room(item, omenSide)) runs.push({ p: 1, it: item, side: omenSide }); else removal(omenSide, 1); }
  else if (SIDES.some((sd) => room(item, sd))) runs.push({ p: 1, it: item });
  else {
    const sw = boneSideWeights(data, item, key, omens);
    const W = sw.prefix + sw.suffix;
    if (!(W > 0)) return { byMod, total: 1, bone: true };
    for (const sd of SIDES) if (sw[sd] > 0) removal(sd, sw[sd] / W);
  }
  for (const run of runs) addBoneRun(data, run.it, key, omens, run.side, !!mark, run.p, byMod);
  return { byMod, total: 1, bone: true };
}

/** 骨の 1 通り (消した後の状態・側) の確率を p 倍して byMod に足す */
function addBoneRun(data: PatchData, item: StageItem, key: string, omens: readonly string[], constrainTo: StageSide | undefined, mark: boolean, p: number, byMod: HeldOdds["byMod"]): void {
  const cls = effectiveCls(item);
  const keep = (m: StageMod) => !m.unrevealed;
  const state: ItemState = {
    base: cls, level: item.itemLevel, rarity: "rare",
    prefixes: item.prefixes.filter(keep).map((m) => ({ modId: m.modId, tierName: m.tierName })),
    suffixes: item.suffixes.filter(keep).map((m) => ({ modId: m.modId, tierName: m.tierName })),
  };
  const boss = omens.map((o) => BOSS[o]).find(Boolean);
  const rerolls = omens.includes("OmenofAbyssalEchoes") ? 1 : 0;
  const altered = key === "desecrate_altered";
  const opts = { floor: Math.max(key === "desecrate_ancient" ? ANCIENT_BONE_FLOOR : 0, mark ? ABYSS_MARK_FLOOR : 0), altered, rerolls, ...(key === "desecrate_gnawed" ? { gnawed: true } : {}), ...(constrainTo ? { constrainTo } : {}) };
  const ids = new Set([
    ...cls.pools.normal.prefixes, ...cls.pools.normal.suffixes,
    ...cls.pools.desecrated.prefixes, ...cls.pools.desecrated.suffixes,
    ...(altered ? [...(cls.pools.otherworldly?.prefixes ?? []), ...(cls.pools.otherworldly?.suffixes ?? [])] : []),
  ]);
  for (const id of ids) {
    const mod = data.mods.get(id);
    if (!mod) continue;
    const atLeast = boss
      ? mod.tiers.map((_, i) => (i === 0 ? desecrationBossOfferProbability(data, state, id, { omen: boss, rerolls, ...(key === "desecrate_gnawed" ? { gnawed: true } : {}), ...(constrainTo ? { constrainTo } : {}) }) : 0))
      : mod.tiers.map((_, i) => desecrationOfferProbability(data, state, id, { ...opts, minTierIndex: i }));
    const w = atLeast[0] ?? 0;
    if (!(w > 0)) continue;
    const cur = byMod.get(id) ?? { w: 0, tiers: [] };
    cur.w += p * w;
    atLeast.forEach((a, i) => {
      const tw = p * (a - (atLeast[i + 1] ?? 0));
      if (!(tw > 0)) return;
      const x = cur.tiers.find((y) => y.index === i);
      if (x) x.w += tw; else cur.tiers.push({ index: i, w: tw });
    });
    byMod.set(id, cur);
  }
}
