/**
 * craft-estimate.ts — 狙いを 1 つずつ付ける平均の合計 (作る見込みの目安) (2026-09-24)
 *
 * useFinishedCompare の「作る見込み」と、始め方の候補の比べ ([[useStartSearch.ts]]) で同じ物差しを使うため分けた。
 * 固定済みにする MOD (fixedIds) は付いている前提で数えない。[[step-odds.ts]] の一番安い打ち方 (外れの消去込み) の合計。
 * 付けた物が消える分は入らないので安めに出る。
 */
import { sideLimits } from "../../services/htc/bridge";
import { catalystPriceKey } from "../../services/htc/catalysing";
import { stepHelpers, type ItemState, type Side } from "../../services/htc/step-odds";
import { shallowRef } from "vue";
import { simulateTreeChunked } from "../../services/htc/sim-route";
import { zeroStart } from "./craft-settings";
import { simCtxOf, startStateOf } from "./sim-setup";
import { startKindOf } from "./start-kind";
import { autoInputFor, pickAutoTree } from "./auto-pick";
import type { useHtcCraft } from "./useHtcCraft";

/**
 * 作る見込み (高貴換算) と、どの物差しで出したか。
 *
 * **自動で組んだツリー ([[tree-auto.ts]]) を回した平均**を使う (オーナー 2026-09-24:「気になったところはその通りだから
 * それでおけ」)。前の「自動の組み立て」(spam-plan) は樹 MOD の側に触らない縛りを入れずに数えていて、金の指輪で 234 神と
 * 出た (ツリーを回すと 1,906 神)。作るか買うかを決める数字なので、実際の作り方に近い方を使う。
 * ツリーは裏で回す (候補ごとに数百回)。回し終わるまでは前の物差しの値を「計算中」として出す。
 * 真ん中の始め方の比べと、右の完成品との比べで同じ物を使う。
 */
export function craftEstimate(c: ReturnType<typeof useHtcCraft>, fixedIds: readonly string[]): { value: number; basis: string } | null {
  const key = keyOf(c, fixedIds);
  const hit = cache.value.get(key);
  if (hit && hit !== "pending") {
    return hit.value == null ? null : {
      value: hit.value,
      basis: `自動で組んだツリーを ${RUNS} 回回した平均${hit.pDone < 0.95 ? ` (完成 ${(hit.pDone * 100).toFixed(0)}%)` : ""}`,
    };
  }
  if (!hit) queueMicrotask(() => void runAuto(c, [...fixedIds], key));
  const fixed = c.targets.value.filter((t) => fixedIds.includes(t.modId));
  const spam = c.spamFor(fixed)?.total?.expected;
  if (spam != null) return { value: spam, basis: "計算中 (仮に自動の組み立ての平均)" };
  const steps = stepsEstimate(c, fixedIds);
  return steps != null ? { value: steps, basis: "計算中 (仮に狙いを 1 つずつ付ける合計)" } : null;
}

/** 自動のツリーを回す回数 (候補ごと。多いと重い) */
const RUNS = 400;
/** 回した結果 (鍵 = ベース・狙いと段・固定済み・神の値段)。value が null は組めなかった / 非推奨 */
const cache = shallowRef(new Map<string, { value: number | null; pDone: number } | "pending">());
function keyOf(c: ReturnType<typeof useHtcCraft>, fixedIds: readonly string[]): string {
  return [
    c.item.value?.baseType ?? zeroStart.value.baseType,
    c.targets.value.map((t) => `${t.modId}:${t.minTierIndex ?? 0}`).join(","),
    [...fixedIds].sort().join(","),
    c.prices.value?.currency.divine ?? 0,
  ].join("|");
}
function put(key: string, v: { value: number | null; pDone: number } | "pending"): void {
  const m = new Map(cache.value);
  m.set(key, v);
  cache.value = m;
}
async function runAuto(c: ReturnType<typeof useHtcCraft>, fixedIds: string[], key: string): Promise<void> {
  if (cache.value.has(key)) return;
  put(key, "pending");
  const ctx = simCtxOf(c), d = c.data.value, p = c.prices.value;
  if (!ctx || !d || !p || startKindOf(c).kind === "unsafe") { put(key, { value: null, pDone: 0 }); return; }
  const start = startStateOf(c, fixedIds);
  const inp = autoInputFor(c, ctx, start, fixedIds);
  if (!inp) { put(key, { value: null, pDone: 0 }); return; }
  const { nodes } = await pickAutoTree(inp, ctx, start);
  if (!nodes.length) { put(key, { value: 0, pDone: 1 }); return; }
  try {
    const r = await simulateTreeChunked({ ctx, start, nodes, runs: RUNS });
    put(key, { value: r.pDone > 0 ? r.expected : null, pDone: r.pDone });
  } catch {
    put(key, { value: null, pDone: 0 });
  }
}

/** 高貴換算の合計。組めなければ null */
export function stepsEstimate(c: ReturnType<typeof useHtcCraft>, fixedIds: readonly string[]): number | null {
  const d = c.data.value, cls = c.base.value, p = c.prices.value;
  if (!d || !cls || !p) return null;
  const baseType = c.item.value?.baseType ?? zeroStart.value.baseType;
  const h = stepHelpers({
    data: d, cls, prices: p, itemLevel: c.item.value?.itemLevel ?? zeroStart.value.itemLevel, limits: sideLimits(d, baseType),
    catalystOk: (tag) => c.catalystChoice.value[tag] ?? (p.currency[catalystPriceKey(tag)] ?? Infinity) / (p.currency.divine ?? 1) < 0.2,
  });
  const fixed = new Set(fixedIds);
  const sideOf = (id: string): Side => d.mods.get(id)!.type as Side;
  let s: ItemState = { breach: false, slots: [...fixed].map((id) => ({ modId: id, side: sideOf(id), fixed: true })) };
  let sum = 0;
  for (const t of c.targets.value.filter((x) => !fixed.has(x.modId))) {
    const best = h.methodsFor(s, t.modId, t.minTierIndex ?? 0)[0];
    if (!best) return null;
    sum += best.avg;
    s = { ...s, slots: [...s.slots, { modId: t.modId, side: sideOf(t.modId), fixed: false }] };
  }
  return sum;
}

/**
 * その MOD (狙いの段以上) が、その側に 1 回付けた時に出る確率。ベースの MOD 一覧 (normal) の重みの割合、ilvl で出ない段は除く。
 * 普通の MOD 以外 (エッセンス・冒涜など) は null。始め方の候補の % と、完成品を探す時に外す順で使う
 */
export function spawnChance(c: ReturnType<typeof useHtcCraft>, modId: string, minTierIndex: number): number | null {
  const d = c.data.value, cls = c.base.value;
  const m = d?.mods.get(modId);
  if (!d || !cls || !m || m.source !== "normal") return null;
  const lv = c.item.value?.itemLevel ?? zeroStart.value.itemLevel;
  const w = (id: string, minIdx: number): number =>
    (d.mods.get(id)?.tiers ?? []).reduce((a, t, i) => a + (i >= minIdx && t.ilvl <= lv ? t.weight : 0), 0);
  const pool = (cls.pools.normal[m.type === "prefix" ? "prefixes" : "suffixes"] ?? []).reduce((a, id) => a + w(id, 0), 0);
  return pool > 0 ? w(modId, minTierIndex) / pool : null;
}
