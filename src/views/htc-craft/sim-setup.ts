/**
 * sim-setup.ts — シミュレーターに渡す設定と開始の指輪 (2026-09-24)
 *
 * 作り方のツリー ([[useCraftTree.ts]]) と、作る見込み ([[craft-estimate.ts]] の自動のツリーを回す分) で同じ物を使う。
 */
import { sideLimits } from "../../services/htc/bridge";
import { catalystPriceKey, maxQualityForBase } from "../../services/htc/catalysing";
import type { SimState } from "../../services/htc/sim-route";
import type { Side } from "../../services/htc/step-odds";
import { startKindOf } from "./start-kind";
import { htcModSides } from "../../services/htc/patch";
import { matchKey } from "../../services/htc/bridge-index";
import { zeroStart } from "./craft-settings";
import type { useHtcCraft } from "./useHtcCraft";

type C = ReturnType<typeof useHtcCraft>;

/** シミュレーターの設定。データ・ベース・相場が揃っていなければ null */
export function simCtxOf(c: C) {
  const d = c.data.value, cls = c.base.value, p = c.prices.value;
  if (!d || !cls || !p) return null;
  const it = c.item.value;
  const div = p.currency.divine ?? 1;
  return {
    data: d, cls, prices: p,
    itemLevel: it ? it.itemLevel ?? 82 : zeroStart.value.itemLevel,
    limits: sideLimits(d, it ? it.baseType : zeroStart.value.baseType),
    catalystOk: (tag: string) => c.catalystChoice.value[tag] ?? (p.currency[catalystPriceKey(tag)] ?? Infinity) / div < 0.2,
    // ベースの品質の上限 (ブリーチの指輪 +20% など)。ブリーチの MOD が付けばさらに +20%
    baseQuality: maxQualityForBase((it ? it.baseType : zeroStart.value.baseType) ?? ""),
  };
}

/**
 * 出発点 = ベース決めの結果 (固定済みの MOD と樹 MOD)。カオスで入れ替える物としてもう 1 つ (外れ) 付いている。
 * fixedIds = 固定済みで始める狙い (始め方の候補ごとに変わる)
 */
export function startStateOf(c: C, fixedIds: readonly string[], keepIds: readonly string[] = []): SimState {
  const d = c.data.value;
  const slots: SimState["slots"] = c.targets.value.filter((t) => fixedIds.includes(t.modId))
    .map((t) => ({ modId: t.modId, side: (d?.mods.get(t.modId)?.type ?? "prefix") as Side, fixed: true }));
  // 固定せずに買った時の狙い (触らない: 消えたらその回は失敗。オーナー 2026-09-25「固定無し品の方が安い場合もある」)
  for (const t of c.targets.value.filter((t) => keepIds.includes(t.modId) && !fixedIds.includes(t.modId))) {
    slots.push({ modId: t.modId, side: (d?.mods.get(t.modId)?.type ?? "prefix") as Side, fixed: false, keep: true, label: "買った時の MOD (触らない)" });
  }
  const tree = c.item.value ? { p: c.slotsUsed.value.prefixes, s: c.slotsUsed.value.suffixes } : { p: zeroStart.value.fixedPrefix, s: zeroStart.value.fixedSuffix };
  // 買った時から付いている MOD (樹 MOD・冒涜のみ・作れない)。固定するのは重い側の樹 MOD 1 つだけで、残りは「消えたら終わり」
  // ([[start-kind.ts]]、2026-09-24 オーナー:「固定不要の時は触らない書き方に」)。樹 MOD の側が分からない時は前の通り全部固定済み
  const k = startKindOf(c);
  const allFixed = !c.item.value || (k.kind === "fix" && !k.fixSide);
  let fixedDone = false;
  // 買った時から付いている冒涜の MOD (樹が生む異界の MOD も冒涜の種類)。冒涜の MOD は 1 つまでなので、付いていれば冒涜はもう使えない
  const lines = c.item.value?.lines ?? [];
  const desecOn = (S: "P" | "S"): number => c.skipped.value.filter((t) => {
    const l = lines.find((x) => x.text === t);
    return l?.kind === "desecrated" && htcModSides()[matchKey(l.template)] === S;
  }).length;
  for (const [side, n, S] of [["prefix", tree.p, "P"], ["suffix", tree.s, "S"]] as const) {
    let desecLeft = desecOn(S);
    const treeOn = c.dropOnly.value.filter((x) => x.side === S).length;
    for (let i = 0; i < n; i++) {
      const isTree = i < treeOn;
      const fix = allFixed || (k.kind === "fix" && k.fixSide === S && isTree && !fixedDone);
      if (fix && !allFixed) fixedDone = true;
      const desec = i >= n - desecLeft;
      slots.push(fix
        ? { modId: null, side, fixed: true, label: isTree || allFixed ? "樹 MOD (固定済み)" : "買った時の MOD (固定済み)", ...(desec ? { desec: true } : {}) }
        : { modId: null, side, fixed: false, keep: true, label: isTree ? "樹 MOD (触らない)" : "買った時の MOD (触らない)", ...(desec ? { desec: true } : {}) });
    }
  }
  // 固定済み 1 つのベースを買った時は、もう 1 つ付いている (フラクチャーオーブは 4 MOD 以上で打つ物なので)。
  // カオスで入れ替える 1 つとして外れを置く。側は空いている方
  const lim = simCtxOf(c)?.limits ?? { prefix: 3, suffix: 3 };
  // 触らない MOD がある側は消去を使わない (冒涜 + 光で作る) ので、外れは消せない。なるべく反対側に置く
  const nP = slots.filter((x) => x.side === "prefix").length, nS = slots.filter((x) => x.side === "suffix").length;
  const keepP = slots.some((x) => x.keep && x.side === "prefix"), keepS = slots.some((x) => x.keep && x.side === "suffix");
  const roomP = lim.prefix - nP, roomS = lim.suffix - nS;
  const side: Side = keepP !== keepS && (keepP ? roomS : roomP) > 0 ? (keepP ? "suffix" : "prefix") : roomS >= roomP ? "suffix" : "prefix";
  slots.push({ modId: null, side, fixed: false });
  return { slots, breach: false };
}
