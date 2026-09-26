/**
 * 規格外の賭け — シミュレーター (純粋関数、UI 非依存) 2026-09-14
 *
 * poe2db の推定重み (PoE1 由来。冒涜と新 MOD は 1) × クライアントのティア値で、
 * 「マジックベース (MOD 1 つ) → グレーターエッセンス → 肋骨で冒涜 (3 択から選ぶ) → 高貴なオーブで空きを埋める」を回す。
 * オーナー指示 (2026-09-14): 「DB に載っている重みをそのまま使って期待値をマシに」。
 *
 * 冒涜の 3 択 (2026-09-14 訂正): 1 つはアビス専用 MOD (リッチの MOD) が確定、残り 2 つはそれぞれ約 50% で
 * その装備の通常の MOD になる (Sift の冒涜ガイドの推定)。肋骨の「最低 MOD レベル」(古代 = 40) は通常の MOD にも効く。
 * 以前はアビス専用 MOD だけで 3 択を作っていて、古代の肋骨が意味を持たなかった (オーナー指摘)。
 * アビスの反響のお告げ: 最初の 3 択の一番いい物の点数が「引き直した時の点数の平均」より低ければ 1 回引き直す
 * (引き直すかどうかをこう決めると点数の期待値が一番高くなる)。
 *
 * 1 回ぶんの結果は「素の値」だけを持つ (フラット ES / %ES / ライフ / 元素耐性 / 混沌耐性 / 移動速度)。
 * 素の ES・品質・ルーンは後から足すので、それらを変えてもシミュレーションはやり直さない。
 * 乱数は seed 固定 (同じ条件なら同じ結果)。
 */
// 重み表・型・列・ティア・枠の数え方は sim-data.ts へ (2026-09-26 の分割)。ここから同じ名前で出し直す
import {
  COL_METRIC,
  NCOL,
  STAT_TO_COLS,
  WEIGHT_PAGES,
  baseModTiers,
  findEssence,
  slotsAfterSetup,
  type SimOptions,
  type SimResult,
  type WMod,
  type WStat,
} from "./sim-data";
export {
  COL,
  COL_METRIC,
  DEFAULT_NORMAL_SHARE,
  METRIC_LABEL,
  METRIC_UNIT,
  NCOL,
  WEIGHT_PAGES,
  baseModTiers,
  effectiveExaltCount,
  findEssence,
  slotsAfterSetup,
} from "./sim-data";
export type { BaseModSpec, Metric, SimOptions, SimResult, Slots, WEssence, WMod, WPage, WStat } from "./sim-data";

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map<string, SimResult>();

export function simulate(o: SimOptions): SimResult {
  const key = JSON.stringify(o);
  const hit = cache.get(key);
  if (hit) return hit;
  const res = run(o);
  if (cache.size > 400) cache.clear();
  cache.set(key, res);
  return res;
}

function weightedPick(cands: WMod[], r: () => number): WMod | null {
  if (cands.length === 0) return null;
  let total = 0;
  for (const m of cands) total += m.weight;
  let x = r() * total;
  for (const m of cands) {
    x -= m.weight;
    if (x <= 0) return m;
  }
  return cands[cands.length - 1];
}

function run(o: SimOptions): SimResult {
  const fail = (reason: string): SimResult => ({ ok: false, reason, n: 0, raw: new Float32Array(0), pReroll: 0, baseRanges: [] });
  const page = WEIGHT_PAGES[o.page];
  if (!page) return fail(`重み表に ${o.page} が無い`);

  // ベース MOD
  const bases: { mod: WMod; tier: number; level: number; min: number; max: number }[] = [];
  for (const b of o.baseMods) {
    const tiers = baseModTiers(o.page, b.family, b.stat, o.ilvl);
    const t = tiers[Math.min(Math.max(1, b.tier), tiers.length) - 1];
    if (!t) return fail(`ベースの MOD (${b.family}) が ilvl ${o.ilvl} で付かない`);
    bases.push(t);
  }
  // エッセンス
  const ess = o.essence ? findEssence(o.page, o.essence.name, o.essence.stat) : null;
  if (o.essence && !ess) return fail("エッセンスがこの装備に付かない");
  if (ess && bases.some((b) => b.mod.families.includes(ess.family))) return fail("エッセンスの MOD がベースの MOD と同じ系統 (付けられない)");

  const slots = slotsAfterSetup(o);
  const gen = o.desecrate ? slots.desecrateGen : null;
  // 冒涜の候補: アビス専用 MOD (一様) と、同じ側の通常の MOD (poe2db の重み)。どちらも最低 MOD レベルで絞る
  const lichPool = gen ? page.desecrated.filter((m) => m.gen === gen && m.level <= o.ilvl && m.level >= o.ribMinLevel) : [];
  const normalPool = gen ? page.normal.filter((m) => m.gen === gen && m.weight > 0 && m.level <= o.ilvl && m.level >= o.ribMinLevel) : [];
  if (gen && lichPool.length === 0 && normalPool.length === 0) return fail("冒涜の候補が無い");

  // エグザルトの候補
  const eligible = page.normal.filter((m) => m.weight > 0 && m.level <= o.ilvl);

  const priority = o.priority;
  const modScore = (m: WMod): number => {
    let s = 0;
    for (const st of m.stats) {
      const cols = STAT_TO_COLS[st.id];
      if (!cols) continue;
      const mean = (st.min + st.max) / 2;
      for (const [c, k] of cols) {
        const metric = COL_METRIC[c];
        if (metric && priority[metric]) s += (priority[metric] ?? 0) * mean * k;
      }
    }
    return s;
  };

  const n = Math.max(500, o.samples);
  const raw = new Float32Array(n * NCOL);
  const r = rng(0x5eed1234);
  const row = new Float64Array(NCOL);
  const addStat = (st: WStat): void => {
    const cols = STAT_TO_COLS[st.id];
    if (!cols) return;
    const v = st.min + (st.max - st.min) * r();
    for (const [c, k] of cols) row[c] += v * k;
  };
  const share = Math.min(1, Math.max(0, o.normalShare));

  // 冒涜の時点で埋まっている系統 (ベース + エッセンス) は毎回同じ
  const setupFamilies = new Set<string>();
  for (const b of bases) for (const f of b.mod.families) setupFamilies.add(f);
  if (ess) setupFamilies.add(ess.family);

  /** 冒涜の 3 択を出して、指標の点数が一番高い物を返す (1 つ目はアビス専用 MOD、2 つ目・3 つ目は share の確率で通常の MOD) */
  const reveal = (rand: () => number): { mod: WMod | null; score: number } => {
    const picks: WMod[] = [];
    const free = (m: WMod): boolean => !picks.includes(m) && !m.families.some((f) => setupFamilies.has(f));
    const drawLich = (): WMod | null => {
      const c = lichPool.filter(free);
      return c.length ? c[Math.floor(rand() * c.length)] : null;
    };
    const drawNormal = (): WMod | null => weightedPick(normalPool.filter(free), rand);
    for (let k = 0; k < 3; k++) {
      let m = k === 0 ? drawLich() : rand() < share ? drawNormal() : drawLich();
      if (!m) m = drawLich() ?? drawNormal();
      if (m) picks.push(m);
    }
    let best: WMod | null = null;
    let bestScore = -Infinity;
    for (const m of picks) {
      const sc = modScore(m);
      if (sc > bestScore) {
        best = m;
        bestScore = sc;
      }
    }
    return { mod: best, score: best ? bestScore : 0 };
  };
  // 反響: 引き直した時の点数の平均より悪ければ引き直す
  let rerollBelow = -Infinity;
  if (gen && o.echo) {
    const r2 = rng(0xec0e5);
    const K = 3000;
    let sum = 0;
    for (let k = 0; k < K; k++) sum += reveal(r2).score;
    rerollBelow = sum / K;
  }
  let rerolls = 0;

  for (let i = 0; i < n; i++) {
    row.fill(0);
    const used = new Set<string>(setupFamilies);
    let prefix = 0;
    let suffix = 0;
    for (const b of bases) {
      for (const st of b.mod.stats) addStat(st);
      if (b.mod.gen === "prefix") prefix++;
      else suffix++;
    }
    if (ess) {
      for (const st of ess.stats) addStat(st);
      if (ess.gen === "prefix") prefix++;
      else suffix++;
    }
    if (gen) {
      let rv = reveal(r);
      if (o.echo && rv.score < rerollBelow) {
        rv = reveal(r);
        rerolls++;
      }
      const best = rv.mod;
      if (best) {
        for (const st of best.stats) addStat(st);
        for (const f of best.families) used.add(f);
        if (best.gen === "prefix") prefix++;
        else suffix++;
      }
    }
    // エグザルト
    for (const lv of o.exaltLevels) {
      const prefixOk = o.exaltSide === "any" && prefix < 3;
      const suffixOk = suffix < 3;
      const cands: WMod[] = [];
      for (const m of eligible) {
        if (m.level < lv) continue;
        if (m.gen === "prefix" ? !prefixOk : !suffixOk) continue;
        if (m.families.some((f) => used.has(f))) continue;
        cands.push(m);
      }
      const pick = weightedPick(cands, r);
      if (!pick) break;
      for (const st of pick.stats) addStat(st);
      for (const f of pick.families) used.add(f);
      if (pick.gen === "prefix") prefix++;
      else suffix++;
    }
    raw.set(row, i * NCOL);
  }
  return { ok: true, n, raw, pReroll: rerolls / n, baseRanges: bases.map((b) => ({ family: b.mod.family, tier: b.tier, level: b.level, min: b.min, max: b.max })) };
}
