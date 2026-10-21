// 計算機のエンジン (plan.ts の stepProbability → probability.ts、optimizer/markovActions.ts) と — 1 つ足す・大いなる高貴・錬金・カオス・消去
// クラフトステージのエミュレーター (applyCurrency / apply-essence) を、同じアイテム・同じお告げ・同じ強さで全部突き合わせる (2026-10-10)。
// エミュレーターが「正」。1 ケースを N 回打ち、狙いの MOD (と段以上) が付いた割合をエンジンの確率と比べる。
// 許し幅は 4σ と 1.5 ポイントの大きい方。informational: エンジンに無い手 (表に出すだけで落とさない)
import { describe, expect, it } from "vitest";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { revealOffers } from "../src/services/craft-stage/apply-desecrate";
import { effectiveCls } from "../src/services/craft-stage/stage-core";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { mulberry32 } from "../src/services/htc/rng";
import { stepProbability, type PlanStep } from "../src/vendor/poe2htc/engine/plan";
import { limitsOf } from "../src/vendor/poe2htc/engine/item";
import type { StageItem } from "../src/services/craft-stage/types";
import { data, N, toEngine, mod, topTier, strengthOf, ringNormal, ringMagic, ringRare, ringRare3, ring4, ringQual, ringPreFull, ringFull, ringOneSlot, glovesRare, glovesKol, wandRare, bodyRare, quiverRare, ring60, record, failMsg, setCase, run, parityReport } from "./helpers/parity";

parityReport("add");

// ── 1 つ足す手 (変成・増強・王者・高貴) ─────────────────────────────────────────────────────────
type AddCase = { name: string; item: StageItem; key: string; omens?: string[]; step: (id: string, minTier: number) => PlanStep; n?: number; info?: boolean };
const addStep = (currency: "transmute" | "augment" | "regal" | "exalt", key: string, constrainTo?: "prefix" | "suffix") =>
  (id: string, minTier: number): PlanStep => ({ currency, add: id, tier: strengthOf(key), minTierIndex: minTier, ...(constrainTo ? { constrainTo } : {}) } as PlanStep);
const ADD: AddCase[] = [
  { name: "指輪 変成", item: ringNormal, key: "transmute", step: addStep("transmute", "transmute") },
  { name: "指輪 上級の変成", item: ringNormal, key: "transmute_greater", step: addStep("transmute", "transmute_greater") },
  { name: "指輪 完全の変成", item: ringNormal, key: "transmute_perfect", step: addStep("transmute", "transmute_perfect") },
  { name: "指輪 増強", item: ringMagic, key: "augment", step: addStep("augment", "augment") },
  { name: "指輪 完全の増強", item: ringMagic, key: "augment_perfect", step: addStep("augment", "augment_perfect") },
  { name: "指輪 王者", item: ringMagic, key: "regal", step: addStep("regal", "regal") },
  { name: "指輪 上級の王者", item: ringMagic, key: "regal_greater", step: addStep("regal", "regal_greater") },
  { name: "指輪 高貴", item: ringRare, key: "exalt", step: addStep("exalt", "exalt") },
  { name: "指輪 上級の高貴", item: ringRare, key: "exalt_greater", step: addStep("exalt", "exalt_greater") },
  { name: "指輪 完全の高貴", item: ringRare, key: "exalt_perfect", step: addStep("exalt", "exalt_perfect") },
  { name: "指輪 高貴 + 左", item: ringRare, key: "exalt", omens: ["OmenofSinistralExaltation"], step: addStep("exalt", "exalt", "prefix") },
  { name: "指輪 高貴 + 右", item: ringRare, key: "exalt", omens: ["OmenofDextralExaltation"], step: addStep("exalt", "exalt", "suffix") },
  { name: "指輪 完全の高貴 + 右", item: ringRare, key: "exalt_perfect", omens: ["OmenofDextralExaltation"], step: addStep("exalt", "exalt_perfect", "suffix") },
  { name: "指輪 プレ満杯 高貴", item: ringPreFull, key: "exalt", step: addStep("exalt", "exalt") },
  { name: "指輪 アイテムレベル 60 上級の高貴", item: ring60, key: "exalt_greater", step: addStep("exalt", "exalt_greater") },
  // 触媒: エンジンの probability.ts には触媒の重みが無い (markov だけ)。素の高貴として比べ、ずれは情報として出す
  { name: "指輪 品質 高貴 + 触媒 (probability.ts は素の高貴)", item: ringQual, key: "exalt", omens: ["OmenofCatalysingExaltation"], step: addStep("exalt", "exalt"), info: true },
  { name: "矢筒 高貴", item: quiverRare, key: "exalt", step: addStep("exalt", "exalt") },
  { name: "矢筒 完全の高貴", item: quiverRare, key: "exalt_perfect", step: addStep("exalt", "exalt_perfect") },
  { name: "手袋 コル無し 高貴", item: glovesRare, key: "exalt", step: addStep("exalt", "exalt") },
  { name: "手袋 コル 高貴", item: glovesKol, key: "exalt", step: addStep("exalt", "exalt") },
  { name: "手袋 コル 上級の高貴 + 右", item: glovesKol, key: "exalt_greater", omens: ["OmenofDextralExaltation"], step: addStep("exalt", "exalt_greater", "suffix") },
  { name: "火のワンド 高貴", item: wandRare, key: "exalt", step: addStep("exalt", "exalt") },
  { name: "火のワンド 完全の高貴 + 左", item: wandRare, key: "exalt_perfect", omens: ["OmenofSinistralExaltation"], step: addStep("exalt", "exalt_perfect", "prefix") },
  { name: "鎧 高貴", item: bodyRare, key: "exalt", step: addStep("exalt", "exalt") },
  { name: "鎧 上級の高貴", item: bodyRare, key: "exalt_greater", step: addStep("exalt", "exalt_greater") },
];

describe("1 つ足す手: stepProbability = エミュレーター", () => {
  for (const c of ADD) {
    it(c.name, () => {
      setCase(c.name);
      const n = c.n ?? N;
      const st = toEngine(c.item);
      const outs = run(c.item, c.key, c.omens ?? [], n, 10_000);
      const cls = effectiveCls(c.item);
      const ids = [...new Set([...cls.pools.normal.prefixes, ...cls.pools.normal.suffixes])];
      const rows: Array<{ target: string; engine: number; hits: number }> = [];
      const seen = new Set(outs.flatMap((o) => o.added.map((a) => a.id)));
      for (const id of ids) {
        const m = mod(id);
        const e0 = stepProbability(data, st, c.step(id, 0));
        const hit0 = outs.filter((o) => o.added[0]?.id === id).length;
        if (e0 === 0 && hit0 === 0) continue;
        rows.push({ target: `${id} 段問わず`, engine: e0, hits: hit0 });
        const tt = topTier(m, c.item.itemLevel);
        if (tt > 0) {
          rows.push({ target: `${id} 段${tt}以上`, engine: stepProbability(data, st, c.step(id, tt)), hits: outs.filter((o) => o.added[0]?.id === id && o.added[0]!.tier >= tt).length });
        }
      }
      // 置き場の外から付いた物
      for (const id of seen) if (!ids.includes(id)) rows.push({ target: `${id} (置き場の外)`, engine: 0, hits: outs.filter((o) => o.added[0]?.id === id).length });
      const bad = record("足す", c.name, rows, n, c.info);
      if (!c.info) expect(bad, failMsg(bad)).toEqual([]);
    });
  }
});

// ── 大いなる高貴 (2 つ足す) ─────────────────────────────────────────────────────────────────
describe("大いなる高貴: greaterExaltProbability = エミュレーター", () => {
  const cases: Array<{ name: string; item: StageItem; key: string; info?: boolean }> = [
    { name: "指輪 大いなる高貴", item: ringRare, key: "exalt" },
    { name: "指輪 大いなる + 完全の高貴", item: ringRare, key: "exalt_perfect" },
    { name: "鎧 大いなる高貴", item: bodyRare, key: "exalt" },
    // 空きが 1 つ: エミュレーターは 1 つだけ足す、エンジンは 0 (意図して未対応)
    { name: "指輪 空き 1 つで大いなる高貴", item: ringOneSlot, key: "exalt", info: true },
  ];
  for (const c of cases) {
    it(c.name, () => {
      setCase(c.name);
      const st = toEngine(c.item);
      const outs = run(c.item, c.key, ["OmenofGreaterExaltation"], N, 20_000);
      // 打った結果で多かった MOD の組 (順不同) を上から 12 組
      const pairCount = new Map<string, number>();
      for (const o of outs) {
        const ids = o.added.map((a) => a.id).sort();
        pairCount.set(ids.join("+"), (pairCount.get(ids.join("+")) ?? 0) + 1);
      }
      const top = [...pairCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
      const rows = top.map(([k, hits]) => {
        const ids = k.split("+");
        const engine = ids.length === 2
          ? stepProbability(data, st, { currency: "greater-exalt", adds: [{ modId: ids[0]! }, { modId: ids[1]! }], tier: strengthOf(c.key) })
          : 0;
        return { target: k, engine, hits };
      });
      // 1 つの MOD の段: 上の 1 組目の 1 つ目を最上段指定で
      const [a, b] = top[0]![0].split("+");
      if (a && b) {
        const ta = topTier(mod(a), c.item.itemLevel);
        rows.push({
          target: `${a} 段${ta}以上 + ${b}`,
          engine: stepProbability(data, st, { currency: "greater-exalt", adds: [{ modId: a, minTierIndex: ta }, { modId: b }], tier: strengthOf(c.key) }),
          hits: outs.filter((o) => o.added.some((x) => x.id === a && x.tier >= ta) && o.added.some((x) => x.id === b)).length,
        });
      }
      const lim = limitsOf(effectiveCls(c.item));
      const free = lim.prefixes - c.item.prefixes.length + lim.suffixes - c.item.suffixes.length;
      rows.push({ target: "2 つ付いた割合", engine: free >= 2 ? 1 : 0, hits: outs.filter((o) => o.added.length === 2).length });
      const bad = record("大いなる高貴", c.name, rows, N, c.info);
      if (!c.info) expect(bad, failMsg(bad)).toEqual([]);
    });
  }
});

// ── 錬金 ───────────────────────────────────────────────────────────────────────────────
describe("錬金: alchemyProbability = エミュレーター", () => {
  const cases: Array<{ name: string; item: StageItem; info?: boolean }> = [
    { name: "指輪 ノーマル 錬金", item: ringNormal },
    { name: "火のワンド ノーマル 錬金", item: freshItem(data, "Volatile Wand", 82) },
    // マジックに錬金: エミュレーターは付いている MOD を消して 4 つ (0.3.1)、エンジンは normal 以外 0
    { name: "指輪 マジック 錬金", item: ringMagic, info: true },
  ];
  for (const c of cases) {
    it(c.name, () => {
      setCase(c.name);
      const n = Math.min(N, 3000);
      const st = toEngine(c.item);
      const white = toEngine({ ...c.item, rarity: "normal", prefixes: [], suffixes: [] });
      const outs = run(c.item, "alchemy", [], n, 30_000);
      const count = new Map<string, number>();
      for (const o of outs) for (const a of o.added) count.set(a.id, (count.get(a.id) ?? 0) + 1);
      const top = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id);
      const rows = top.map((id) => ({ target: id, engine: stepProbability(data, c.info ? st : white, { currency: "alchemy", adds: [id] }), hits: count.get(id)! }));
      const [x, y] = top;
      rows.push({ target: `${x} + ${y}`, engine: stepProbability(data, c.info ? st : white, { currency: "alchemy", adds: [x!, y!] }), hits: outs.filter((o) => o.added.some((a) => a.id === x) && o.added.some((a) => a.id === y)).length });
      rows.push({ target: "4 つ付いた割合", engine: 1, hits: outs.filter((o) => o.added.length === 4).length });
      const bad = record("錬金", c.name, rows, n, c.info);
      if (!c.info) expect(bad, failMsg(bad)).toEqual([]);
    });
  }
});

// ── カオス ────────────────────────────────────────────────────────────────────────────
describe("カオス: chaosProbability = エミュレーター", () => {
  const cases: Array<{ name: string; item: StageItem; key: string; omens?: string[]; omen?: "whittling"; info?: boolean }> = [
    { name: "指輪 カオス", item: ringRare3, key: "chaos" },
    { name: "指輪 上級のカオス", item: ringRare3, key: "chaos_greater" },
    { name: "指輪 完全のカオス", item: ring4, key: "chaos_perfect" },
    { name: "指輪 6 MOD (両側満杯) カオス", item: ringFull, key: "chaos" },
    { name: "指輪 カオス + 削減", item: ring4, key: "chaos", omens: ["OmenofWhittling"], omen: "whittling" },
    { name: "手袋 コル カオス", item: glovesKol, key: "chaos" },
    { name: "鎧 カオス + 削減", item: bodyRare, key: "chaos", omens: ["OmenofWhittling"], omen: "whittling" },
    // 抹消のお告げはエンジンに無い (ChaosOmen は none / whittling だけ)。お告げ無しの式で比べて表に出す
    { name: "指輪 カオス + 左の抹消 (エンジンはお告げ無し)", item: ring4, key: "chaos", omens: ["OmenofSinistralErasure"], info: true },
    { name: "指輪 カオス + 右の抹消 (エンジンはお告げ無し)", item: ring4, key: "chaos", omens: ["OmenofDextralErasure"], info: true },
  ];
  for (const c of cases) {
    it(c.name, () => {
      setCase(c.name);
      const st = toEngine(c.item);
      const outs = run(c.item, c.key, c.omens ?? [], N, 40_000);
      const cls = effectiveCls(c.item);
      const ids = [...new Set([...cls.pools.normal.prefixes, ...cls.pools.normal.suffixes])];
      const removable = [...c.item.prefixes, ...c.item.suffixes].map((m) => m.modId);
      const step = (rm: string, add: string, minTier = 0): PlanStep => ({ currency: "chaos", remove: rm, add, tier: strengthOf(c.key), minTierIndex: minTier, ...(c.omen ? { omen: c.omen } : {}) });
      const rows: Array<{ target: string; engine: number; hits: number }> = [];
      // 消える MOD の割合 (足す側を全部足し合わせる)
      for (const rm of removable) {
        let e = 0;
        for (const id of ids) e += stepProbability(data, st, step(rm, id));
        rows.push({ target: `消える ${rm} (足す側の合計)`, engine: e, hits: outs.filter((o) => o.removed[0] === rm && o.added.length === 1).length });
      }
      // 付く MOD の割合 (消える側を全部足し合わせる)、最上段も
      for (const id of ids) {
        let e = 0;
        let eTop = 0;
        const tt = topTier(mod(id), c.item.itemLevel);
        for (const rm of removable) { e += stepProbability(data, st, step(rm, id)); if (tt > 0) eTop += stepProbability(data, st, step(rm, id, tt)); }
        const hits = outs.filter((o) => o.added[0]?.id === id).length;
        if (e === 0 && hits === 0) continue;
        rows.push({ target: `付く ${id}`, engine: e, hits });
        if (tt > 0) rows.push({ target: `付く ${id} 段${tt}以上`, engine: eTop, hits: outs.filter((o) => o.added[0]?.id === id && o.added[0]!.tier >= tt).length });
      }
      // 組 (消える × 付く) で多い物 10 個
      const pc = new Map<string, number>();
      for (const o of outs) if (o.added[0]) pc.set(`${o.removed[0]}→${o.added[0].id}`, (pc.get(`${o.removed[0]}→${o.added[0].id}`) ?? 0) + 1);
      for (const [k, hits] of [...pc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
        const [rm, add] = k.split("→");
        rows.push({ target: `組 ${k}`, engine: stepProbability(data, st, step(rm!, add!)), hits });
      }
      const bad = record("カオス", c.name, rows, N, c.info);
      if (!c.info) expect(bad, failMsg(bad)).toEqual([]);
    });
  }
});

// ── 消去 ──────────────────────────────────────────────────────────────────────────────
describe("消去: annulProbability = エミュレーター", () => {
  // 骨で普通の MOD が付いた指輪 (光のお告げ用): 発現の候補から普通の MOD を選ぶ
  const boned = (() => {
    for (let s = 1; s < 200; s++) {
      const b = applyCurrency(data, ringRare, "desecrate", mulberry32(s));
      if (!b.applied) continue;
      const offers = revealOffers(data, b.item, mulberry32(s + 1));
      const k = offers.first.findIndex((m) => mod(m.modId)?.source === "normal");
      if (k < 0) continue;
      // applyReveal は rng から同じ候補を引き直すので、同じ seed で回す
      const r = applyCurrency(data, b.item, `reveal:${k + 1}`, mulberry32(s + 1));
      if (r.applied) return r.item;
    }
    throw new Error("骨で普通の MOD を付けられない");
  })();
  const bonedDes = (() => {
    for (let s = 1; s < 200; s++) {
      const b = applyCurrency(data, ringRare, "desecrate", mulberry32(s));
      if (!b.applied) continue;
      const offers = revealOffers(data, b.item, mulberry32(s + 1));
      const k = offers.first.findIndex((m) => mod(m.modId)?.source === "desecrated");
      if (k < 0) continue;
      const r = applyCurrency(data, b.item, `reveal:${k + 1}`, mulberry32(s + 1));
      if (r.applied) return r.item;
    }
    throw new Error("骨で冒涜の MOD を付けられない");
  })();
  const cases: Array<{ name: string; item: StageItem; omens?: string[]; omen?: "sinistral" | "dextral" | "light" }> = [
    { name: "指輪 マジック 消去", item: ringMagic },
    { name: "指輪 レア 消去", item: ring4 },
    { name: "指輪 6 MOD 消去", item: ringFull },
    { name: "指輪 消去 + 左", item: ring4, omens: ["OmenofSinistralAnnulment"], omen: "sinistral" },
    { name: "指輪 消去 + 右", item: ring4, omens: ["OmenofDextralAnnulment"], omen: "dextral" },
    { name: "指輪 冒涜の MOD に 消去 + 光", item: bonedDes, omens: ["OmenofLight"], omen: "light" },
    { name: "指輪 骨で付いた普通の MOD に 消去 + 光", item: boned, omens: ["OmenofLight"], omen: "light" },
  ];
  for (const c of cases) {
    it(c.name, () => {
      setCase(c.name);
      const st = toEngine(c.item);
      const outs = run(c.item, "annul", c.omens ?? [], N, 50_000);
      const rows = [...c.item.prefixes, ...c.item.suffixes].map((m) => ({
        target: `${m.modId}${m.desecrated ? " (骨)" : ""}`,
        engine: stepProbability(data, st, { currency: "annul", remove: m.modId, ...(c.omen ? { omen: c.omen } : {}) }),
        hits: outs.filter((o) => o.removed[0] === m.modId).length,
      }));
      const bad = record("消去", c.name, rows, N);
      expect(bad, failMsg(bad)).toEqual([]);
    });
  }
});

