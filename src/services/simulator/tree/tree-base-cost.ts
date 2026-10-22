/**
 * tree-base-cost.ts — ツリーの始まりの箱のベースの値段 (2026-10-22 オーナー「始まりの MOD を置いたら、その形に着く始め方を前の ③ の計算で全部比べ、
 * 一番安い始め方と費用をベースの値段に自動で」)。式は ③ と同じ start-cost.ts (startCalc・startCostOf)、自前の式は作らない。
 *
 * ✦ の MOD = フラクチャーの狙い、ほかの始まりの MOD = 反対側の狙い (③ と同じく 1 つまで。2 つ以上は比べない)。エッセンスの MOD ならグレーターの道 (白から自作だけ)。
 * 始め方 = フラクチャー済みを買う・4 MOD を買ってフラクチャー・白から自作 (増強の道 / グレーターの道)。白から自作は買う 2 つの高い方を超えたら道無し (③ と同じ、10-21)。
 * ベースの値段 (白・4 MOD・フラクチャー済み) は手入力の神、カレンシーは今の相場 (price、高貴建て)。結果は神
 */
import { freshItem, sideOfMod, type PatchData } from "../../craft-stage/engine";
import { methodsFor, type SimStartKind } from "../sim-methods";
import type { SimTargetIn } from "../quiz-build";
import { startCalc, startCostOf } from "../start-cost";
import { startOf, type TreeBasePrices, type TreeDoc } from "./tree-model";
import { tr } from "../../../i18n/lang";

export type TreeStartKind = Extract<SimStartKind, "white" | "four" | "fractured">;
export interface TreeBaseCost {
  /** 始め方ごとの「フラクチャー済みの始まりになるまで」の費用 (神。値段が無い・着かない時は null) と、比べから外す理由 */
  kinds: Array<{ k: TreeStartKind; label: string; cost: number | null; why: string | null }>;
  /** short = 箱の 1 行に入る短い名前 (箱の幅で全文が切れた、10-22) */
  best: { k: TreeStartKind; label: string; short: string; cost: number } | null;
  /** 比べられない時の理由 (✦ が無い・反対側が 2 つ以上) */
  note: string | null;
}

export function treeBaseCost(data: PatchData, doc: TreeDoc, prices: TreeBasePrices, price: (key: string) => number, name: (key: string) => string): TreeBaseCost {
  const st = startOf(doc);
  const fr = st.mods.find((m) => m.fractured);
  const none = (note: string): TreeBaseCost => ({ kinds: [], best: null, note });
  if (!fr) return none(tr("✦ (フラクチャー) の MOD が無いので比べない", "No ✦ (fractured) mod, nothing to compare"));
  const others = st.mods.filter((m) => !m.fractured);
  if (others.length > 1) return none(tr("反対側の狙いが 2 つ以上は比べられない (前の ③ と同じく 1 つまで)", "Can't compare with 2+ other mods (one at most, as in step 3)"));
  const div = price("divine") || 1;
  const ex = (v: number | undefined): number | null => (v != null && Number.isFinite(v) && v >= 0 ? v * div : null);
  const ixOf = (modId: string, tier: number): number => (data.mods.get(modId)?.tiers.length ?? 1) - tier;
  const item = freshItem(data, doc.base, doc.itemLevel, "normal");
  const fracMembers = [{ modId: fr.modId, minTierIndex: ixOf(fr.modId, fr.tier), text: fr.modId, rank: `T${fr.tier}` }];
  const targets: SimTargetIn[] = [
    { modId: fr.modId, minTierIndex: ixOf(fr.modId, fr.tier), method: "fracture" },
    ...others.map((o): SimTargetIn => ({ modId: o.modId, minTierIndex: ixOf(o.modId, o.tier), method: methodsFor(data, o.modId)[0]! })),
  ];
  const c = startCalc({ data, item, itemLevel: doc.itemLevel, fracModId: fr.modId, fracMembers, allTargets: targets, targets, white: ex(prices.white), four: ex(prices.four), price, name });
  if (!c) return none(tr("計算できない形", "Can't calculate this shape"));
  // 反対側でない MOD (フラクチャーと同じ側) は ③ でも費用に入らない
  const sameSide = !c.greater && others.some((o) => sideOfMod(data, o.modId) === sideOfMod(data, fr.modId));
  const label = (k: TreeStartKind): string => k === "fractured" ? tr("フラクチャー済みを買う", "Buy fractured")
    : k === "four" ? tr("4 MOD を買ってフラクチャー", "Buy a 4-mod rare and fracture")
    : c.greater ? tr("白から自作・グレーターの道", "Craft from white (Greater Essence route)") : tr("白から自作・増強の道", "Craft from white (Augmentation route)");
  const base = (k: TreeStartKind): number | null => ex(k === "white" ? prices.white : k === "four" ? prices.four : prices.fractured);
  // グレーターの道はフラクチャーを自前でするだけ (買う始め方は無し、③ と同じ 10-20)
  const ks: TreeStartKind[] = c.greater ? ["white"] : ["fractured", "four", "white"];
  const costOf = (k: TreeStartKind): number | null => startCostOf(k, base(k), c, { fractured: true });
  const buys = ks.filter((k) => k !== "white").map(costOf).filter((x): x is number => x != null && Number.isFinite(x));
  const cap = buys.length ? Math.max(...buys) : null;
  const kinds = ks.map((k) => {
    const cost = costOf(k);
    const why = base(k) == null ? tr("ベースの値段が無い", "No base price")
      : cost == null || !Number.isFinite(cost) ? tr("この形には着かない", "Can't reach this shape")
      : k === "white" && cap != null && cost > cap ? tr("買う方より高いので道無し", "Costs more than buying, so skipped") : null;
    // 上限を超えた白から自作は費用も見せる (一番安いの候補には入れない)
    return { k, label: label(k), cost: cost != null && Number.isFinite(cost) ? cost / div : null, why };
  });
  const ok = kinds.filter((x): x is typeof x & { cost: number } => x.cost != null && !x.why);
  const best = ok.length ? ok.reduce((a, x) => (x.cost < a.cost ? x : a)) : null;
  const short = (k: TreeStartKind): string => k === "fractured" ? tr("済みを買う", "buy fractured") : k === "four" ? tr("4 MOD 買い", "4-mod buy") : c.greater ? tr("白からグレーター", "white, Greater") : tr("白から増強", "white, Augment");
  return { kinds, best: best ? { k: best.k, label: best.label, short: short(best.k), cost: best.cost } : null, note: sameSide ? tr("フラクチャーと同じ側の MOD は費用に入らない (③ と同じ)", "A mod on the fractured side isn't costed (as in step 3)") : null };
}
