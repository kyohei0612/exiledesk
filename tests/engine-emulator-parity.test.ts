// 計算機のエンジン (plan.ts の stepProbability → probability.ts、optimizer/markovActions.ts) と
// クラフトステージのエミュレーター (applyCurrency / apply-essence) を、同じアイテム・同じお告げ・同じ強さで全部突き合わせる (2026-10-10)。
// エミュレーターが「正」。1 ケースを N 回打ち、狙いの MOD (と段以上) が付いた割合をエンジンの確率と比べる。
// 許し幅は 4σ と 1.5 ポイントの大きい方。informational: エンジンに無い手 (表に出すだけで落とさない)
import { writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { revealOffers } from "../src/services/craft-stage/apply-desecrate";
import { effectiveCls } from "../src/services/craft-stage/stage-core";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { mulberry32 } from "../src/services/htc/rng";
import { boostedBy } from "../src/services/htc/quality";
import { catalysingMultiplier } from "../src/services/htc/catalysing-multiplier";
import { stepProbability, type PlanStep } from "../src/vendor/poe2htc/engine/plan";
import { limitsOf } from "../src/vendor/poe2htc/engine/item";
import type { CurrencyTier, ItemState, Mod } from "../src/vendor/poe2htc/engine/types";
import { createActionSpace, type McAction } from "../src/vendor/poe2htc/optimizer/markovActions";
import { decodeState, encodeState, sideIndexOf, type McTarget } from "../src/vendor/poe2htc/optimizer/markovState";
import { essenceLevelOf } from "../src/vendor/poe2htc/optimizer/cost";
import type { StageApply, StageItem, StageMod } from "../src/services/craft-stage/types";

const data = loadPatch();
const N = Number(process.env.PARITY_N ?? 3000);

/** エミュレーターのアイテム → エンジンの ItemState (ルーン込みのベース、段の名前はエンジンの tiers[].name) */
const toEngine = (it: StageItem): ItemState => {
  const pm = (m: StageMod) => ({
    modId: m.modId,
    tierName: String(data.mods.get(m.modId)?.tiers[m.tierIndex]?.name ?? m.tierName),
    ...(m.fractured ? { fractured: true } : {}),
    ...(m.desecrated ? { desecrated: true } : {}),
  });
  const all = [...it.prefixes, ...it.suffixes];
  return {
    base: effectiveCls(it), level: it.itemLevel, rarity: it.rarity as ItemState["rarity"],
    prefixes: it.prefixes.map(pm), suffixes: it.suffixes.map(pm),
    ...(all.some((m) => m.desecrated) ? { desecrated: true } : {}),
  };
};
const A = (it: StageItem, key: string, seed: number, omens: string[] = []): StageItem => {
  const r = applyCurrency(data, it, key, mulberry32(seed), omens);
  if (!r.applied) throw new Error(`${key}: ${r.reason}`);
  return r.item;
};
const mod = (id: string): Mod => data.mods.get(id)!;
const topTier = (m: Mod, lv: number): number => { let k = 0; m.tiers.forEach((t, i) => { if (t.ilvl <= lv && t.weight > 0) k = i; }); return k; };
const strengthOf = (key: string): CurrencyTier => (key.endsWith("_greater") ? "greater" : key.endsWith("_perfect") ? "perfect" : "base");

// ── アイテム ─────────────────────────────────────────────────────────────────────────────
const ringNormal = freshItem(data, "Gold Ring", 82);
const ringMagic = A(ringNormal, "transmute", 11);
const ringRare = A(ringMagic, "regal", 12);
const ringRare3 = A(ringRare, "exalt", 14);
const ring4 = A(ringRare3, "exalt", 15);
const ringQual = A(ringRare, "catalyst_life", 13);
// プレが埋まった指輪 (左の高貴で埋める)
let ringPreFull = ringRare;
for (let s = 100; ringPreFull.prefixes.length < 3; s++) ringPreFull = A(ringPreFull, "exalt", s, ["OmenofSinistralExaltation"]);
const ringFull = (() => { let it = ring4; for (let s = 300; it.prefixes.length + it.suffixes.length < 6; s++) it = A(it, "exalt", s); return it; })();
const ringOneSlot = (() => { let it = ring4; for (let s = 200; it.prefixes.length + it.suffixes.length < 5; s++) it = A(it, "exalt", s); return it; })();
const glovesRare = A(A(A(freshItem(data, "Riveted Mitts", 82), "transmute", 21), "regal", 22), "artificer", 23);
const glovesKol = A(glovesRare, "rune:Kolr's Hunt", 24);
const wandRare = A(A(freshItem(data, "Volatile Wand", 82), "transmute", 31), "regal", 32);
const bodyRare = A(A(freshItem(data, "Garment", 82), "transmute", 41), "regal", 42);
const quiverRare = A(A(freshItem(data, "Broadhead Quiver", 82), "transmute", 71), "regal", 72);
const ring60 = A(A(freshItem(data, "Gold Ring", 60), "transmute", 51), "regal", 52);

// ── 記録 ─────────────────────────────────────────────────────────────────────────────────
type Row = { group: string; name: string; target: string; engine: number; emu: number; n: number; ok: boolean; info?: boolean };
const ROWS: Row[] = [];
const tol = (p: number, n: number) => Math.max(0.015, 4 * Math.sqrt((p * (1 - p)) / n));
afterAll(() => {
  const pct = (x: number) => (Number.isFinite(x) ? (x * 100).toFixed(2) : "NaN");
  // ケースごとに一番ずれた行と、落ちた行の数
  const byCase = new Map<string, Row[]>();
  for (const r of ROWS) byCase.set(`${r.group}｜${r.name}`, [...(byCase.get(`${r.group}｜${r.name}`) ?? []), r]);
  const lines = ["ケース\t比べた数\t落ちた数\t一番ずれた狙い\tエンジン%\tエミュ%"];
  for (const [k, rs] of byCase) {
    const worst = rs.reduce((a, b) => (Math.abs(b.engine - b.emu) > Math.abs(a.engine - a.emu) || !Number.isFinite(b.engine) ? b : a));
    const bad = rs.filter((r) => !r.ok).length;
    lines.push(`${k}${rs[0]!.info ? " (情報)" : ""}\t${rs.length}\t${bad}\t${worst.target}\t${pct(worst.engine)}\t${pct(worst.emu)}`);
  }
  console.log(lines.join("\n"));
  if (process.env.PARITY_OUT) {
    writeFileSync(process.env.PARITY_OUT, JSON.stringify(ROWS, null, 1));
  }
});
/** 行を足して、落ちた物を返す */
function record(group: string, name: string, rows: Array<{ target: string; engine: number; hits: number }>, n: number, info = false): Row[] {
  const out = rows.map((r) => {
    const emu = r.hits / n;
    const ok = Number.isFinite(r.engine) && Math.abs(r.engine - emu) < tol(r.engine, n);
    return { group, name, target: r.target, engine: r.engine, emu, n, ok, ...(info ? { info } : {}) };
  });
  ROWS.push(...out);
  return out.filter((r) => !r.ok);
}
const failMsg = (bad: Row[]) => bad.slice(0, 8).map((r) => `${r.target}: エンジン ${(r.engine * 100).toFixed(2)}% / エミュ ${(r.emu * 100).toFixed(2)}%`).join("\n");

/** N 回打つ (結果は added / removed の id と段だけ残す) */
type Out = { applied: boolean; added: Array<{ id: string; tier: number }>; removed: string[] };
/** ケースの名前から乱数の始まりをずらす (同じ seed 列をケース間で使い回すと、ずれが揃って見える) */
const seedOf = (name: string): number => { let h = 2166136261; for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h % 1_000_000_000; };
let currentCase = "";
function run(item: StageItem, key: string, omens: string[], n: number, seedBase: number): Out[] {
  const seed0 = seedBase + seedOf(currentCase);
  const out: Out[] = [];
  for (let s = 1; s <= n; s++) {
    const r: StageApply = applyCurrency(data, item, key, mulberry32(seed0 + s), omens);
    out.push({ applied: r.applied, added: r.added.map((m) => ({ id: m.modId, tier: m.tierIndex })), removed: r.removed.map((m) => m.modId) });
  }
  return out;
}

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
      currentCase = c.name;
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
      currentCase = c.name;
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
      currentCase = c.name;
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
      currentCase = c.name;
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
      currentCase = c.name;
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

// ── エッセンス ─────────────────────────────────────────────────────────────────────────
const essencePool = (it: StageItem, source: Mod["source"]) =>
  [...it.cls.pools.essence.prefixes, ...it.cls.pools.essence.suffixes].map(mod).filter((m) => m && m.source === source && m.tiers.length > 0);
const rawFams = (m: Mod) => (m.families?.length ? m.families : [m.family]);
const onItemRaw = (it: StageItem) => new Set([...it.prefixes, ...it.suffixes].flatMap((x) => rawFams(mod(x.modId))));

describe("エッセンス: essenceForcedProbability = エミュレーター", () => {
  const fams = onItemRaw(ringMagic);
  const ess = essencePool(ringMagic, "essence");
  const free = ess.filter((m) => !rawFams(m).some((f) => fams.has(f))).slice(0, 4);
  // 付いている普通の MOD と同じ系統のエッセンス (ノーマル → 同じ系統の MOD を変成で付けたマジック)
  const clash = (() => {
    for (const e of ess) {
      for (let s = 1; s < 400; s++) {
        const mg = A(ringNormal, "transmute", 1000 + s);
        if (mg.prefixes.concat(mg.suffixes).some((x) => rawFams(mod(x.modId)).some((f) => rawFams(e).includes(f)))) return { e, mg };
      }
    }
    return null;
  })();
  const cases = [
    ...free.map((e) => ({ name: `指輪 マジック ${e.id}`, item: ringMagic, e })),
    ...(clash ? [{ name: `指輪 マジック 同じ系統の普通の MOD 付き ${clash.e.id}`, item: clash.mg, e: clash.e }] : []),
  ];
  for (const c of cases) {
    it(c.name, () => {
      currentCase = c.name;
      const tierIndex = 0;
      const level = essenceLevelOf(String(c.e.tiers[tierIndex]!.name ?? ""));
      const key = `essence:${level}:${c.e.id}`;
      const n = 200; // 確定の手 (0 か 1)
      const outs = run(c.item, key, [], n, 60_000);
      const engine = stepProbability(data, toEngine(c.item), { currency: "essence", add: c.e.id, essenceTier: tierIndex });
      const bad = record("エッセンス", c.name, [{ target: `${c.e.id} が付く`, engine, hits: outs.filter((o) => o.added.some((a) => a.id === c.e.id)).length }], n);
      expect(bad, failMsg(bad)).toEqual([]);
    });
  }
});

describe("パーフェクトエッセンス: perfectEssenceProbability (stepProbability) = エミュレーター", () => {
  const pick = (it: StageItem, side: "prefix" | "suffix") => {
    const fams = onItemRaw(it);
    return essencePool(it, "perfect_essence").find((m) => m.type === side && !rawFams(m).some((f) => fams.has(f)) && !/breach/i.test(m.family));
  };
  const clashPick = (it: StageItem) => {
    const fams = onItemRaw(it);
    return essencePool(it, "perfect_essence").find((m) => rawFams(m).some((f) => fams.has(f)));
  };
  // パーフェクトエッセンスと同じ系統 (マナ再生など) の普通の MOD を高貴で付けた指輪
  const ringClash = (() => {
    const pf = new Set(essencePool(ringRare, "perfect_essence").flatMap(rawFams));
    for (let s = 1; s < 2000; s++) {
      const r = applyCurrency(data, ringRare3, "exalt", mulberry32(5000 + s));
      if (r.applied && r.added.some((m) => rawFams(mod(m.modId)).some((f) => pf.has(f)))) return r.item;
    }
    throw new Error("同じ系統の指輪が作れない");
  })();
  const cases: Array<{ name: string; item: StageItem; e: Mod | undefined; omens?: string[]; omen?: "sinistral" | "dextral" }> = [
    { name: "指輪 4 MOD プレのパーフェクト", item: ring4, e: pick(ring4, "prefix") },
    { name: "指輪 4 MOD サフィのパーフェクト", item: ring4, e: pick(ring4, "suffix") },
    { name: "指輪 4 MOD プレのパーフェクト + 左の結晶化", item: ring4, e: pick(ring4, "prefix"), omens: ["OmenofSinistralCrystallisation"], omen: "sinistral" },
    { name: "指輪 4 MOD プレのパーフェクト + 右の結晶化", item: ring4, e: pick(ring4, "prefix"), omens: ["OmenofDextralCrystallisation"], omen: "dextral" },
    { name: "指輪 プレ満杯 プレのパーフェクト (お告げ無し)", item: ringPreFull, e: pick(ringPreFull, "prefix") },
    { name: "指輪 プレ満杯 プレのパーフェクト + 左の結晶化", item: ringPreFull, e: pick(ringPreFull, "prefix"), omens: ["OmenofSinistralCrystallisation"], omen: "sinistral" },
    { name: "指輪 プレ満杯 プレのパーフェクト + 右の結晶化", item: ringPreFull, e: pick(ringPreFull, "prefix"), omens: ["OmenofDextralCrystallisation"], omen: "dextral" },
    { name: "指輪 同じ系統の普通の MOD 付きのパーフェクト", item: ringClash, e: clashPick(ringClash) },
    { name: "鎧 パーフェクト (プレ)", item: bodyRare, e: pick(bodyRare, "prefix") },
  ];
  for (const c of cases) {
    it(c.name, () => {
      currentCase = c.name;
      expect(c.e, "パーフェクトエッセンスの MOD が見つからない").toBeTruthy();
      const e = c.e!;
      const st = toEngine(c.item);
      const outs = run(c.item, `essence:perfect:${e.id}`, c.omens ?? [], N, 70_000);
      const rows = [...c.item.prefixes, ...c.item.suffixes].map((m) => ({
        target: `${m.modId} を消して付く`,
        engine: stepProbability(data, st, { currency: "perfect-essence", add: e.id, remove: m.modId, ...(c.omen ? { omen: c.omen } : {}) }),
        hits: outs.filter((o) => o.applied && o.removed[0] === m.modId && o.added.some((a) => a.id === e.id)).length,
      }));
      rows.push({ target: "打てた割合", engine: rows.reduce((a, r) => a + r.engine, 0), hits: outs.filter((o) => o.applied).length });
      const bad = record("パーフェクト", c.name, rows, N);
      expect(bad, failMsg(bad)).toEqual([]);
    });
  }
});

// ── 計算機の自動 (optimizer/markovActions.ts の遷移) ──────────────────────────────────────────
// 狙い 1 つの格子で、付いている MOD は「ジャンク」(jp/js) になる。1 手の遷移で狙いが立つ確率を比べる
describe("markov の 1 手 (createActionSpace) = エミュレーター", () => {
  const PRICES = {
    currency: { exalt: 1, exalt_greater: 2, exalt_perfect: 3, chaos: 1, annul: 1, transmute: 1, augment: 1, regal: 1, catalyst_life: 1 } as Record<string, number>,
    omens: { OmenofCatalysingExaltation: 1, OmenofSinistralExaltation: 1, OmenofDextralExaltation: 1 } as Record<string, number>,
  };
  function markovP(item: StageItem, targetId: string, minIndex: number, want: (a: McAction) => boolean, heldAsTargets = false): number {
    const base = effectiveCls(item);
    const m = mod(targetId);
    const list: McTarget[] = [{ mods: [{ mod: m, minIndex }], type: m.type, fractured: false }];
    // heldAsTargets: 付いている MOD も狙いとして格子に入れる (present)。系統が分母から外れる = ジャンク扱いとの差を切り分ける
    const held = heldAsTargets ? [...item.prefixes, ...item.suffixes] : [];
    for (const h of held) list.push({ mods: [{ mod: mod(h.modId), minIndex: 0 }], type: mod(h.modId).type, fractured: false });
    const presentMask = held.reduce((a, _h, i) => a | (1 << (i + 1)), 0);
    const tag = item.qualityTag;
    const { actionsOf } = createActionSpace({
      data, prices: PRICES, level: item.itemLevel, pools: base.pools, list, side: sideIndexOf(list),
      desecratable: false, bossTargetable: false, limits: limitsOf(base),
      ...(tag && item.quality > 0 ? {
        catalysing: { tags: [tag], qualities: [item.quality], catalystCount: () => 1, boosted: (md: Mod, t: string) => boostedBy(md, t), multiplier: catalysingMultiplier },
      } : {}),
    });
    const s = decodeState(heldAsTargets
      ? encodeState(presentMask, 0, 0, 0, 0, item.rarity as "normal" | "magic" | "rare")
      : encodeState(0, 0, item.prefixes.length, item.suffixes.length, 0, item.rarity as "normal" | "magic" | "rare"));
    const a = actionsOf(s).find((x) => want(x.action));
    if (!a) return NaN;
    let p = 0;
    for (const [k, q] of a.dist) if (decodeState(k).present & 1) p += q;
    return p;
  }
  const cases: Array<{ name: string; item: StageItem; key: string; omens?: string[]; want: (a: McAction) => boolean; held?: boolean }> = [
    { name: "指輪 変成", item: ringNormal, key: "transmute", want: (a) => a.currency === "transmute" && a.strength === "base" },
    { name: "指輪 増強", item: ringMagic, key: "augment", want: (a) => a.currency === "augment" && a.strength === "base" },
    { name: "指輪 王者", item: ringMagic, key: "regal", want: (a) => a.currency === "regal" && a.strength === "base" },
    { name: "指輪 高貴 (付いている MOD = ジャンク)", item: ring4, key: "exalt", want: (a) => a.currency === "exalt" && a.strength === "base" && !a.side && !a.catalysing },
    { name: "指輪 品質 高貴 + 触媒", item: ringQual, key: "exalt", omens: ["OmenofCatalysingExaltation"], want: (a) => a.currency === "exalt" && a.strength === "base" && !!a.catalysing },
    { name: "指輪 カオス (付いている MOD = ジャンク)", item: ring4, key: "chaos", want: (a) => a.currency === "chaos" },
    { name: "鎧 高貴 (付いている MOD = ジャンク)", item: bodyRare, key: "exalt", want: (a) => a.currency === "exalt" && a.strength === "base" && !a.side && !a.catalysing },
    // 切り分け: 付いている MOD を狙いとして入れると系統が分母から外れる
    { name: "指輪 高貴 (付いている MOD を狙いに入れる)", item: ring4, key: "exalt", held: true, want: (a) => a.currency === "exalt" && a.strength === "base" && !a.side && !a.catalysing },
    { name: "指輪 品質 高貴 + 触媒 (付いている MOD を狙いに入れる)", item: ringQual, key: "exalt", omens: ["OmenofCatalysingExaltation"], held: true, want: (a) => a.currency === "exalt" && a.strength === "base" && !!a.catalysing },
    { name: "指輪 カオス (付いている MOD を狙いに入れる)", item: ring4, key: "chaos", held: true, want: (a) => a.currency === "chaos" },
    { name: "指輪 王者 (付いている MOD を狙いに入れる)", item: ringMagic, key: "regal", held: true, want: (a) => a.currency === "regal" && a.strength === "base" },
  ];
  for (const c of cases) {
    it(c.name, () => {
      currentCase = c.name;
      const outs = run(c.item, c.key, c.omens ?? [], N, 80_000);
      const count = new Map<string, number>();
      for (const o of outs) for (const a of o.added) count.set(a.id, (count.get(a.id) ?? 0) + 1);
      const onItem = new Set([...c.item.prefixes, ...c.item.suffixes].map((m) => m.modId));
      const top = [...count.entries()].filter(([id]) => !onItem.has(id)).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id);
      const rows: Array<{ target: string; engine: number; hits: number }> = [];
      for (const id of top) {
        rows.push({ target: `${id} 段問わず`, engine: markovP(c.item, id, 0, c.want, c.held), hits: count.get(id)! });
        const tt = topTier(mod(id), c.item.itemLevel);
        if (tt > 0) rows.push({ target: `${id} 段${tt}以上`, engine: markovP(c.item, id, tt, c.want, c.held), hits: outs.filter((o) => o.added.some((a) => a.id === id && a.tier >= tt)).length });
      }
      const bad = record("markov", c.name, rows, N);
      expect(bad, failMsg(bad)).toEqual([]);
    });
  }
});
