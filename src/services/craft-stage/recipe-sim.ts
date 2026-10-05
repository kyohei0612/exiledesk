/**
 * recipe-sim.ts — 決めた順番と付け方どおりに作るシミュレーション (2026-10-05、実験)
 *
 * オーナー「この MOD 群をどういう順番で付けるかを最初に選ばせて、それぞれフラクチャー・冒涜をする箇所を選ばせて、順番通りに作る」
 * 「フラクチャーの場合は確率的にそこからスタートさせて、フラクチャー、1 MOD の状態まで消去打たせてのところからスタート、
 * またはその MOD が付いた状態でスタートもできるように」「ほとんど挙動は一緒か、使いやすいようにリメイクって感じ」。
 *
 * ステージの 1 手 (applyCurrency) をそのまま使って、何百回も打つ。1 回の挑戦の n 手目の乱数は mulberry32(seed + n) で、
 * 手順 JSON の再生 ([[run-plan.ts]] playPlan) と同じなので、記録した手順はステージでそのまま再生できる。
 *
 * 決まり (どの回も同じ):
 *   - 順番の上から、まだ付いていない (段が足りない) 最初の狙いを作る。前に付けた物が消えたら、また上から
 *   - 高貴: その側に外れがあれば、その側の消去 (左右の消去のお告げ) で消す。空きがあればその側の高貴 (左右の高貴のお告げ)。
 *     高貴の等級は狙いの段が届く一番上 (段 50 以上 = 完全 / 35 以上 = 上級)
 *   - カオス: 狙いが付くまでカオス (お告げ無し)
 *   - 冒涜: その側に空きが無く外れがあれば側の消去。骨 (左右のネクロマンシー) → 発現は狙いがあれば選ぶ、無ければアビスの反響で
 *     引き直し、それでも無ければ 1 番を選んで、光のお告げ + 消去で消して打ち直し。骨は異界の MOD = 変質、段 40 以上 = 古代
 *   - エッセンス: パーフェクト (レアに。外れのある側を結晶化のお告げで消す)。パーフェクトが無い物は、マジックの時に普通の
 *     エッセンス (段が届く一番下の等級)
 *   - 白から: 最初の狙いが普通の MOD なら 変成 → 増強 (外れなら消去) で付けてから王者。それ以外は 変成 → 王者
 *   - フラクチャー (1 つ): 「作る」= 錬金 → 狙いが付くまでカオス → フラクチャー (4 個なら 1/4、外れたら白から作り直し) →
 *     外れが無くなるまで消去。「付いた状態」= その MOD を固定済みにしたレアから (費用は手で入れたベースの値段)
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { essenceLevelOf } from "../../vendor/poe2htc/optimizer/cost";
import { applyCurrency } from "./apply-currency";
import { revealOffers, unrevealedOf } from "./apply-desecrate";
import { mulberry32 } from "../htc/rng";
import { freshItem, startFrom } from "./run-plan";
import { allMods, listOf, room } from "./stage-core";
import type { StageItem, StageMod, StageSide } from "./types";
import type { CraftStagePlan } from "./contract";
import essenceKeys from "../htc/essence-keys.json";

export type RecipeMethod = "exalt" | "chaos" | "desecrate" | "essence" | "fracture";
export interface RecipeTarget { modId: string; minTierIndex: number; method: RecipeMethod }
export interface RecipeSpec {
  data: PatchData;
  base: string;
  itemLevel: number;
  /** 上から順に作る */
  targets: readonly RecipeTarget[];
  /** フラクチャーの狙いの始め方。"make" = 確率込みで作る、"bought" = 付いた状態のベースを買う (price は高貴建て) */
  fractureStart?: { kind: "make" } | { kind: "bought"; price: number };
  /** 1 個の値段 (高貴建て) */
  price: (key: string) => number;
  runs: number;
  /** 1 回の挑戦の手の上限 (超えたら失敗) */
  maxSteps?: number;
  seed?: number;
}
export interface RecipeRun {
  done: boolean; cost: number; steps: Array<{ currency: string; omen: string | null }>; seed: number; reason?: string;
  /** 白から作り直した時の、最後の作り直しの手の番号 (再生はここから。前の手は費用にだけ入る) */
  replayFrom: number;
}
export interface RecipeResult {
  runs: number;
  pDone: number;
  /** 1 個できるまでの平均 (全部の回の費用 ÷ 完成した回数) */
  perDone: number;
  p50: number; p80: number; p90: number;
  /** 打った物ごとの、1 個できるまでの平均の数と費用 */
  usage: Array<{ key: string; count: number; cost: number }>;
  /** 止まった理由と割合 */
  stops: Array<{ reason: string; p: number }>;
  /** 費用が真ん中くらいの完成した回 (ステージで再生する用) */
  sample: RecipeRun | null;
}

const ESS = (essenceKeys as unknown as { keys: Record<string, { en: string; ja: string }> }).keys;
const SIDE_OMEN = {
  exalt: { prefix: "OmenofSinistralExaltation", suffix: "OmenofDextralExaltation" },
  annul: { prefix: "OmenofSinistralAnnulment", suffix: "OmenofDextralAnnulment" },
  necro: { prefix: "OmenofSinistralNecromancy", suffix: "OmenofDextralNecromancy" },
  crystal: { prefix: "OmenofSinistralCrystallisation", suffix: "OmenofDextralCrystallisation" },
} as const;

/** 1 回の挑戦 */
export function runRecipeOnce(spec: RecipeSpec, seed: number): RecipeRun {
  const { data } = spec;
  const max = spec.maxSteps ?? 4000;
  const steps: RecipeRun["steps"] = [];
  let cost = 0;
  let replayFrom = 0;
  const mod = (id: string) => data.mods.get(id)!;
  const sideOf = (id: string): StageSide => (mod(id).type === "suffix" ? "suffix" : "prefix");
  const meets = (it: StageItem, t: RecipeTarget): boolean => allMods(it).some((m) => m.modId === t.modId && !m.unrevealed && m.tierIndex >= t.minTierIndex);
  const isGood = (m: StageMod): boolean => !m.unrevealed && spec.targets.some((t) => m.modId === t.modId && m.tierIndex >= t.minTierIndex);
  const junkOn = (it: StageItem, s: StageSide): StageMod[] => listOf(it, s).filter((m) => !m.fractured && !isGood(m));
  const junkAll = (it: StageItem): StageMod[] => allMods(it).filter((m) => !m.fractured && !isGood(m));
  /** 狙いの段以上で一番高い段のレベル (等級の下限が届くか) */
  const reach = (t: RecipeTarget): number => Math.max(0, ...mod(t.modId).tiers.filter((x, i) => i >= t.minTierIndex && x.ilvl <= spec.itemLevel).map((x) => x.ilvl));
  const grade = (base: "exalt" | "transmute" | "augment", t: RecipeTarget): string => {
    const r = reach(t);
    return r >= 50 ? `${base}_perfect` : r >= 35 ? `${base}_greater` : base;
  };

  const fractureT = spec.targets.find((t) => t.method === "fracture") ?? null;
  let item = freshItem(data, spec.base, spec.itemLevel);
  if (fractureT && spec.fractureStart?.kind === "bought") {
    // 手順 JSON の始めの状態と同じ作り方 (再生で同じ物になる)
    const m = mod(fractureT.modId);
    item = startFrom(data, spec.base, spec.itemLevel, { rarity: "rare", mods: [{ mod: m.id, tier: `T${m.tiers.length - fractureT.minTierIndex}`, fractured: true }] }, seed - 1);
    cost += spec.fractureStart.price;
  }

  /** 1 手打つ。打てなければ理由 (その回は止める) */
  const play = (key: string, omens: string[] = []): string | null => {
    const n = steps.length + 1;
    const r = applyCurrency(data, item, key, mulberry32(seed + n), omens);
    if (!r.applied) return r.reason ?? "打てない";
    const used = r.omensUsed ?? [];
    cost += spec.price(key) * (r.count ?? 1) + used.reduce((a, o) => a + spec.price(o), 0);
    steps.push({ currency: key, omen: used.length ? used.join("+") : null });
    item = r.item;
    return null;
  };
  /** 発現: 狙い (desire) があれば選ぶ。無ければ反響で引き直し、それでも無ければ 1 番 */
  const reveal = (desire: RecipeTarget | null): string | null => {
    const n = steps.length + 1;
    const offers = revealOffers(data, item, mulberry32(seed + n));
    const hit = (list: StageMod[]) => (desire ? list.findIndex((m) => m.modId === desire.modId && m.tierIndex >= desire.minTierIndex) : -1);
    const a = hit(offers.first);
    if (a >= 0) return play(`reveal:${a + 1}`);
    if (desire && offers.reroll.length) {
      const b = hit(offers.reroll);
      return play(`reveal:${b >= 0 ? b + 1 : 1}:reroll`, ["OmenofAbyssalEchoes"]);
    }
    return play("reveal:1");
  };
  const fail = (reason: string): RecipeRun => ({ done: false, cost, steps, seed, reason, replayFrom });

  // フラクチャーで作る: 錬金 → 狙いが付くまでカオス → フラクチャー (外れたら白から) → 外れが無くなるまで消去
  if (fractureT && spec.fractureStart?.kind !== "bought") {
    for (;;) {
      if (steps.length >= max) return fail("手が多すぎる (フラクチャーまで)");
      if (item.rarity === "normal") { const e = play("alchemy"); if (e) return fail(`錬金: ${e}`); continue; }
      if (!meets(item, fractureT)) { const e = play("chaos"); if (e) return fail(`カオス: ${e}`); continue; }
      const e = play("fracture");
      if (e) return fail(`フラクチャー: ${e}`);
      const fixed = allMods(item).find((m) => m.fractured);
      if (fixed && fixed.modId === fractureT.modId && fixed.tierIndex >= fractureT.minTierIndex) break;
      // 外れを固定した: 白から作り直し (ベース代は数えない)
      item = freshItem(data, spec.base, spec.itemLevel);
      replayFrom = steps.length;
    }
    while (junkAll(item).length) {
      if (steps.length >= max) return fail("手が多すぎる (消去)");
      const e = play("annul");
      if (e) return fail(`消去: ${e}`);
    }
  }

  while (steps.length < max) {
    // 未発現の冒涜 MOD が残っていれば先に発現 (冒涜の狙いの手の中で選ぶ)
    const t = spec.targets.find((x) => !meets(item, x));
    if (!t) return { done: true, cost, steps, seed, replayFrom };
    if (t.method === "fracture") return fail("固定した MOD が消えた");
    const side = sideOf(t.modId);
    let e: string | null = null;
    if (unrevealedOf(item)) {
      e = reveal(t.method === "desecrate" ? t : null);
    } else if (item.rarity === "normal") {
      e = play(t.method === "exalt" || t.method === "chaos" ? grade("transmute", t) : "transmute");
    } else if (item.rarity === "magic") {
      const essKey = t.method === "essence" ? magicEssenceKey(t) : null;
      if (essKey) e = play(essKey);
      else if ((t.method === "exalt" || t.method === "chaos") && mod(t.modId).source === "normal" && !allMods(item).some(isGood)) {
        // マジックで最初の狙いを 1 つだけ作る (変成・増強、外れは消去)。その側に外れがある / 2 つ埋まっていれば消去。
        // 1 つ付いたら王者 (2 つ目までマジックで狙うと、消去が付けた物を消して回り続けた)
        e = junkOn(item, side).length || allMods(item).length >= 2 ? play("annul") : play(grade("augment", t));
      } else e = play("regal");
    } else if (t.method === "chaos") {
      e = play("chaos");
    } else if (t.method === "exalt") {
      if (junkOn(item, side).length) e = play("annul", [SIDE_OMEN.annul[side]]);
      else if (room(item, side)) e = play(grade("exalt", t), [SIDE_OMEN.exalt[side]]);
      else return fail("枠が足りない (狙いが多すぎる)");
    } else if (t.method === "desecrate") {
      const desec = allMods(item).find((m) => m.desecrated && !m.unrevealed && !isGood(m));
      if (desec) e = play("annul", ["OmenofLight"]);
      else if (!room(item, side)) {
        if (junkOn(item, side).length) e = play("annul", [SIDE_OMEN.annul[side]]);
        else return fail("冒涜する枠が足りない");
      } else e = play(boneFor(t), [SIDE_OMEN.necro[side]]);
    } else if (t.method === "essence") {
      const key = `essence:perfect:${t.modId}`;
      if (!ESS[key]) return fail("このエッセンスはマジックにしか使えない (レアになった後は付けられない)");
      const js = junkOn(item, "prefix").length ? "prefix" : junkOn(item, "suffix").length ? "suffix" : null;
      e = play(key, js ? [SIDE_OMEN.crystal[js]] : []);
    }
    if (e) return fail(e);
  }
  return fail("手が多すぎる");

  function boneFor(t: RecipeTarget): string {
    if (mod(t.modId).tags.includes("breach_desecration")) return "desecrate_altered";
    return reach(t) >= 40 ? "desecrate_ancient" : "desecrate";
  }
  /** マジックに使う普通のエッセンス (狙いの段が出る一番下の等級)。パーフェクトしか無い物は null */
  function magicEssenceKey(t: RecipeTarget): string | null {
    const m = mod(t.modId);
    for (const lv of ["lesser", "normal", "greater"] as const) {
      const key = `essence:${lv}:${t.modId}`;
      if (!ESS[key]) continue;
      const idx = m.tiers.findIndex((x) => essenceLevelOf(String(x.name ?? "")) === lv);
      if (idx >= t.minTierIndex) return key;
    }
    return null;
  }
}

/** 何百回も回してまとめる (画面に手を返しながら) */
export async function runRecipe(spec: RecipeSpec, onProgress?: (done: number, total: number) => void, stopped?: () => boolean): Promise<RecipeResult | null> {
  const seed0 = spec.seed ?? Math.floor(Date.now() % 1_000_000) * 10_000;
  const runs: RecipeRun[] = [];
  let last = Date.now();
  for (let i = 0; i < spec.runs; i++) {
    runs.push(runRecipeOnce(spec, seed0 + i * 10_000));
    if (Date.now() - last > 15) {
      onProgress?.(i + 1, spec.runs);
      await new Promise((r) => setTimeout(r, 0));
      if (stopped?.()) return null;
      last = Date.now();
    }
  }
  onProgress?.(spec.runs, spec.runs);
  const done = runs.filter((r) => r.done);
  const spent = runs.reduce((a, r) => a + r.cost, 0);
  const costs = done.map((r) => r.cost).sort((a, b) => a - b);
  const q = (p: number): number => (costs.length ? costs[Math.min(costs.length - 1, Math.floor(p * costs.length))]! : Infinity);
  const tally = new Map<string, { count: number; cost: number }>();
  for (const r of runs) for (const s of r.steps) {
    for (const k of [s.currency, ...(s.omen ? s.omen.split("+") : [])]) {
      const key = k.replace(/^reveal:.*$/, "reveal");
      const x = tally.get(key) ?? { count: 0, cost: 0 };
      x.count++;
      x.cost += key === "reveal" ? 0 : spec.price(k);
      tally.set(key, x);
    }
  }
  const per = done.length || 1;
  const usage = [...tally].map(([key, x]) => ({ key, count: x.count / per, cost: x.cost / per })).sort((a, b) => b.cost - a.cost);
  const stopMap = new Map<string, number>();
  for (const r of runs) if (!r.done) stopMap.set(r.reason ?? "?", (stopMap.get(r.reason ?? "?") ?? 0) + 1);
  const mid = q(0.5);
  const sample = done.length ? done.reduce((a, b) => (Math.abs(b.cost - mid) < Math.abs(a.cost - mid) ? b : a)) : null;
  return {
    runs: runs.length,
    pDone: done.length / runs.length,
    perDone: done.length ? spent / done.length : Infinity,
    p50: q(0.5), p80: q(0.8), p90: q(0.9),
    usage,
    stops: [...stopMap].map(([reason, n]) => ({ reason, p: n / runs.length })).sort((a, b) => b.p - a.p),
    sample,
  };
}

/** 記録した 1 回を手順 JSON に (ステージで再生する用)。付いた状態から始める時は始めの MOD を固定済みで */
export function recipePlan(spec: RecipeSpec, run: RecipeRun): CraftStagePlan {
  const fractureT = spec.targets.find((t) => t.method === "fracture");
  const bought = fractureT && spec.fractureStart?.kind === "bought";
  const m = bought ? spec.data.mods.get(fractureT.modId) : null;
  return {
    title: "シミュレーションの 1 回",
    base: spec.base,
    item_level: spec.itemLevel,
    // 作り直した回は最後の作り直しから (n 手目の乱数は seed + n なので、seed をずらすと同じ結果になる)
    seed: run.seed + run.replayFrom,
    ...(bought && m ? ({ start: { rarity: "rare", mods: [{ mod: m.id, tier: `T${m.tiers.length - fractureT.minTierIndex}`, fractured: true }] } } as object) : {}),
    steps: run.steps.slice(run.replayFrom).map((s) => ({ currency: s.currency, ...(s.omen ? { omen: s.omen } : {}) })) as CraftStagePlan["steps"],
  } as CraftStagePlan;
}
