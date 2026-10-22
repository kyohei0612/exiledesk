/**
 * held-odds.ts — 持っているカレンシーで次に付く確率 (MOD 一覧の確率表、2026-10-09)
 *
 * StageModList.vue から切り出した。表に出す数と打った結果が同じ決まりで出るかを tests/held-odds-parity.test.ts で全部突き合わせる
 * (オーナー「お告げ系全部、異界も 0%、コルとか特殊モッド含め全部確認せえ」)。
 * どの式で数えるかは、打つ処理と同じ説明文の分解 (spec/run-spec.ts の planSpec: 動作の部品・お告げの効き目) から決める (2026-10-16、ADR-004):
 *   - add で 1 つ付ける手 (変成・増強・王者・高貴・カオス): spec/odds.ts の addOddsBySpec (打つ処理と同じ候補・重み・お告げ・触媒・ルーン)
 *   - add で 2 つ (大いなる高貴): 1 つ目の後の候補で 2 つ目 (twoAdds)。3 つ以上 (錬金)・エッセンス: 打つ処理を決まった種で回して数える
 *   - 骨 (addUnrevealed): 次の発現で候補 3 つに出る確率。側は打つ処理と同じ unrevealedPlan、確率はエンジンの desecrationOfferProbability /
 *     desecrationBossOfferProbability (計算機と同じ)
 * byMod の w は、足す手なら重み (total で割ると確率)、骨なら確率そのもの (total = 1)
 */
import type { PatchData, ItemState } from "../../vendor/poe2htc/engine/types";
import { DES_BOSS_TAG, desecrationBossOfferProbability, desecrationOfferProbability, type DesecrationBossOmen } from "../../vendor/poe2htc/engine/probability";
import { applyCurrency } from "./apply-currency";
import { mulberry32 } from "../htc/rng";
import { allMods, effectiveCls, makeStageMod, room, SIDES, withMod, without, type Candidate } from "./stage-core";
import { revealOffers } from "./apply-desecrate";
import type { StageItem, StageMod, StageSide } from "./types";
import { modsOf, omensOf, planSpec, type SpecPlan } from "./spec/run-spec";
import { REVEAL_SPEC } from "./spec/desecrate-specs";
import { unrevealedPlan, type AddUnrevealed } from "./spec/parts-unrevealed";
import { addCands, addOddsBySpec } from "./spec/odds";

export interface HeldOdds {
  byMod: Map<string, { w: number; tiers: Array<{ index: number; w: number }> }>;
  total: number;
  /** 骨 (候補 3 つに出る確率) */
  bone?: true;
  /** 1 回で 1 つだけ足す手 (w / total がそのまま付く確率で、MOD どうしは同時に付かない) */
  single?: true;
}

/** 勢力の保証のタグ → エンジンの勢力のお告げ */
const BOSS_OF_TAG: ReadonlyMap<string, DesecrationBossOmen> = new Map(Object.entries(DES_BOSS_TAG).map(([o, t]) => [t, o as DesecrationBossOmen]));
/** 発現でアビスの反響の引き直しが使える回数 (発現の手に掛かるお告げの効き目から) */
const rerollsOf = (omens: readonly string[]): number => modsOf(omensOf(REVEAL_SPEC, omens)).rerolls;

export function heldOdds(data: PatchData, item: StageItem, key: string, omens: readonly string[]): HeldOdds | null {
  const plan = planSpec(data, item, key, omens);
  if (!plan) return null;
  const bone = plan.actions.find((a) => "addUnrevealed" in a);
  if (bone && "addUnrevealed" in bone) return bone.addUnrevealed.fill ? null : boneOdds(data, item, plan, bone.addUnrevealed, omens);
  if (plan.actions.some((a) => "addEssence" in a)) return sampled(data, item, key, omens);
  const odds = addOddsBySpec(data, item, key, omens, plan);
  if (!odds) return null;
  if (odds.n > 2) return sampled(data, item, key, omens);
  if (odds.n === 2) return twoAdds(data, item, plan, odds.cands);
  const cs = odds.cands;
  return { byMod: new Map(cs.map((c) => [c.mod.id, { w: c.w, tiers: c.tiers }])), total: cs.reduce((a, c) => a + c.w, 0), single: true };
}

/**
 * 選んだ MOD のどれか 1 つでも付く (骨なら候補に出る) 確率 (2026-10-12 要望 c9dee700「次の一手で複数 MOD のどれかひとつでも付く確率」)。
 * 1 つだけ足す手は確率の和 (同時には付かない)。幾つも足す手 (錬金・大いなる高貴・エッセンス) と骨 (候補 3 つ、アビスの反響なら引き直しの 3 つも) は
 * 打つ処理そのものを決まった種で回して数える (和では重なりを二重に数える)
 */
/** 狙いの 1 つ = MOD の id と段 (`<modId>#<tierIndex>`)。MOD 一覧の行のチェックは付きうる段を全部、段の表のチェックはその段以上 */
export const aimTierKey = (modId: string, tierIndex: number): string => `${modId}#${tierIndex}`;
export function heldAnyOf(data: PatchData, item: StageItem, key: string, omens: readonly string[], keys: ReadonlySet<string>, h: HeldOdds): number {
  if (!keys.size) return 0;
  if (h.single) {
    if (!(h.total > 0)) return 0;
    let w = 0;
    for (const [id, x] of h.byMod) for (const t of x.tiers) if (keys.has(aimTierKey(id, t.index))) w += t.w;
    return w / h.total;
  }
  const echoes = rerollsOf(omens) > 0;
  let ok = 0, hit = 0;
  for (let s = 1; s <= SAMPLES; s++) {
    const r = applyCurrency(data, item, key, mulberry32(7919 * s), [...omens]);
    if (!r.applied) { if (s === 1 && !r.random) return 0; continue; }
    ok++;
    let got: readonly StageMod[] = r.added ?? [];
    if (h.bone) {
      const off = revealOffers(data, r.item, mulberry32(104729 * s));
      got = echoes ? [...off.first, ...off.reroll] : off.first;
    }
    if (got.some((m) => keys.has(aimTierKey(m.modId, m.tierIndex)))) hit++;
  }
  return ok ? hit / ok : 0;
}

/** 1 回で MOD を幾つも足す・決まった MOD を足す手 (錬金 4 つ、エッセンス)。候補の式が無いので、打つ処理そのものを決まった種で回して数える */
const SAMPLES = 1500;
function sampled(data: PatchData, item: StageItem, key: string, omens: readonly string[]): HeldOdds | null {
  const byMod: HeldOdds["byMod"] = new Map();
  let ok = 0;
  for (let s = 1; s <= SAMPLES; s++) {
    const r = applyCurrency(data, item, key, mulberry32(7919 * s), [...omens]);
    // 打つ前に分かる理由で打てない時だけ出さない。当たり所で弾かれた回は数えずに続ける ([[feedback-game-rules-as-written]])
    if (!r.applied) { if (s === 1 && !r.random) return null; continue; }
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
function twoAdds(data: PatchData, item: StageItem, plan: SpecPlan, first: readonly Candidate[]): HeldOdds | null {
  const last = plan.actions[plan.actions.length - 1]!;
  if (!("add" in last)) return null;
  const W = first.reduce((a, c) => a + c.w, 0);
  if (!(W > 0)) return { byMod: new Map(), total: 1 };
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
    // 2 つ目は打つ処理 (parts.ts の add) と同じく、1 つ目が付いた後の状態から同じ側・同じ重みで
    const it2 = withMod(item, makeStageMod(c1.mod, c1.side, c1.tiers[0]!.index, () => 0.5));
    const second = addCands(data, it2, last.add, plan.mods);
    const W2 = second.reduce((a, c) => a + c.w, 0);
    if (!(W2 > 0)) continue;
    for (const c2 of second) add(c2.mod.id, p1 * (c2.w / W2), c2.tiers, c2.w);
  }
  return { byMod, total: 1 };
}

/**
 * 骨: MOD ごとに「次の発現の候補 3 つに出る確率」、段ごとは「その段で出る確率」(その段以上 − 1 つ上の段以上)。
 * 勢力のお告げは候補 3 つが全部その勢力 (足りなければ数だけ)。変質した鎖骨は異界の MOD も専用の側に入る。差したルーンの MOD は普通の置き場に入る
 */
function boneOdds(data: PatchData, item: StageItem, plan: SpecPlan, a: AddUnrevealed, omens: readonly string[]): HeldOdds | null {
  const byMod: HeldOdds["byMod"] = new Map();
  // 対象で打てない時は表を出さない、それ以外 (冒涜の MOD は 1 つまで・アイテムレベル・コラプト) で打てない時は全部 0%
  if (plan.block) return plan.offTarget ? null : { byMod, total: 1, bone: true };
  // 側は打つ処理と同じ unrevealedPlan: アビサルロードの紋章は必ず置き換える (印は消える物として数えない)、お告げの側、空きがあればその中から、
  // 両側が埋まっていれば固定していない MOD を全部から等しく 1 つ消して、その側に付く
  const sp = unrevealedPlan(data, item, a, plan.mods);
  const runs: Array<{ p: number; it: StageItem; side?: StageSide }> = [];
  const removal = (side: StageSide, p: number): void => {
    const rem = allMods(item).filter((m) => !m.fractured && m.side === side);
    for (const r of rem) runs.push({ p: p / rem.length, it: without(item, r), side });
  };
  if (sp.mark) runs.push({ p: 1, it: without(item, sp.mark), side: sp.mark.side });
  else if (sp.fixed) { if (room(item, sp.fixed)) runs.push({ p: 1, it: item, side: sp.fixed }); else removal(sp.fixed, 1); }
  // 空きがある時は空いた側から等しく (両側なら半々、2026-10-16 Craft of Exile と同じ)
  else if (SIDES.some((sd) => room(item, sd))) {
    const W = sp.weights.reduce((x, y) => x + y.w, 0);
    if (!(W > 0)) return { byMod, total: 1, bone: true };
    for (const { s, w } of sp.weights) if (w > 0) runs.push({ p: w / W, it: item, side: s });
  } else {
    const W = sp.weights.reduce((x, y) => x + y.w, 0);
    if (!(W > 0)) return { byMod, total: 1, bone: true };
    for (const { s, w } of sp.weights) if (w > 0) removal(s, w / W);
  }
  const boss = plan.mods.guaranteeTag ? BOSS_OF_TAG.get(plan.mods.guaranteeTag) : undefined;
  const opts: BoneOpts = { floor: sp.floor, altered: a.pools.includes("otherworldly"), gnawed: !a.exclusiveAnyLevel, boss, rerolls: rerollsOf(omens) };
  for (const run of runs) addBoneRun(data, run.it, opts, run.side, run.p, byMod);
  return { byMod, total: 1, bone: true };
}

/** 骨の 1 通り (消した後の状態・側) の確率を p 倍して byMod に足す */
interface BoneOpts { floor: number; altered: boolean; gnawed: boolean; boss: DesecrationBossOmen | undefined; rerolls: number }
function addBoneRun(data: PatchData, item: StageItem, o: BoneOpts, constrainTo: StageSide | undefined, p: number, byMod: HeldOdds["byMod"]): void {
  const cls = effectiveCls(item);
  const keep = (m: StageMod) => !m.unrevealed;
  const state: ItemState = {
    base: cls, level: item.itemLevel, rarity: "rare",
    prefixes: item.prefixes.filter(keep).map((m) => ({ modId: m.modId, tierName: m.tierName })),
    suffixes: item.suffixes.filter(keep).map((m) => ({ modId: m.modId, tierName: m.tierName })),
  };
  const { boss, rerolls, altered } = o;
  const opts = { floor: o.floor, altered, rerolls, ...(o.gnawed ? { gnawed: true } : {}), ...(constrainTo ? { constrainTo } : {}) };
  const ids = new Set([
    ...cls.pools.normal.prefixes, ...cls.pools.normal.suffixes,
    ...cls.pools.desecrated.prefixes, ...cls.pools.desecrated.suffixes,
    ...(altered ? [...(cls.pools.otherworldly?.prefixes ?? []), ...(cls.pools.otherworldly?.suffixes ?? [])] : []),
  ]);
  for (const id of ids) {
    const mod = data.mods.get(id);
    if (!mod) continue;
    const atLeast = boss
      // 勢力の MOD は段を分けない (先頭にまとめる)、混じる普通の MOD は段ごと
      ? mod.tiers.map((_, i) => (i === 0 || mod.source === "normal" ? desecrationBossOfferProbability(data, state, id, { omen: boss, rerolls, floor: opts.floor, minTierIndex: i, ...(o.gnawed ? { gnawed: true } : {}), ...(constrainTo ? { constrainTo } : {}) }) : 0))
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
