// 計算機のエンジン (plan.ts の stepProbability → probability.ts、optimizer/markovActions.ts) と — エッセンス・パーフェクトエッセンス・markov の 1 手
// クラフトステージのエミュレーター (applyCurrency / apply-essence) を、同じアイテム・同じお告げ・同じ強さで全部突き合わせる (2026-10-10)。
// エミュレーターが「正」。1 ケースを N 回打ち、狙いの MOD (と段以上) が付いた割合をエンジンの確率と比べる。
// 許し幅は 4σ と 1.5 ポイントの大きい方。informational: エンジンに無い手 (表に出すだけで落とさない)
import { describe, expect, it } from "vitest";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { effectiveCls } from "../src/services/craft-stage/stage-core";
import { mulberry32 } from "../src/services/htc/rng";
import { boostedBy } from "../src/services/htc/quality";
import { catalysingMultiplier } from "../src/services/htc/catalysing-multiplier";
import { stepProbability } from "../src/vendor/poe2htc/engine/plan";
import { limitsOf } from "../src/vendor/poe2htc/engine/item";
import type { Mod } from "../src/vendor/poe2htc/engine/types";
import { createActionSpace, type McAction } from "../src/vendor/poe2htc/optimizer/markovActions";
import { decodeState, encodeState, sideIndexOf, type McTarget } from "../src/vendor/poe2htc/optimizer/markovState";
import { essenceLevelOf } from "../src/vendor/poe2htc/optimizer/cost";
import type { StageItem } from "../src/services/craft-stage/types";
import { data, N, toEngine, A, mod, topTier, ringNormal, ringMagic, ringRare, ringRare3, ring4, ringQual, ringPreFull, bodyRare, record, failMsg, setCase, run, parityReport } from "./helpers/parity";

parityReport("essence");

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
      setCase(c.name);
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
      setCase(c.name);
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
      setCase(c.name);
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

