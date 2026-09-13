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
import weightsJson from "../../i18n/mod-weights-poe2db.json";

export interface WStat {
  id: string;
  min: number;
  max: number;
}
export interface WMod {
  id: string | null;
  family: string;
  families: string[];
  gen: string;
  name: string;
  level: number;
  weight: number;
  tags: string[];
  text: string;
  stats: WStat[];
}
export interface WEssence {
  essence: string;
  code: string;
  level: number;
  gen: string;
  family: string;
  text: string;
  stats: WStat[];
}
export interface WPage {
  tags: string | null;
  normal: WMod[];
  desecrated: WMod[];
  essence: WEssence[];
}
export const WEIGHT_PAGES = (weightsJson as unknown as { pages: Record<string, WPage> }).pages;

export type Metric = "es" | "life" | "res" | "chaos" | "ms";
export const METRIC_LABEL: Record<Metric, string> = { es: "ES", life: "ライフ", res: "元素耐性", chaos: "混沌耐性", ms: "移動速度" };
export const METRIC_UNIT: Record<Metric, string> = { es: "", life: "", res: "%", chaos: "%", ms: "%" };

/** 冒涜の 3 択のうち、2 つ目・3 つ目が通常の MOD になる確率 (Sift の推定) */
export const DEFAULT_NORMAL_SHARE = 0.5;

/** 1 回ぶんの素の値 (列) */
const COL = { esFlat: 0, esPct: 1, life: 2, res: 3, chaos: 4, ms: 5 } as const;
const NCOL = 6;

/** stat id → 列への足し方 */
const STAT_TO_COLS: Record<string, [number, number][]> = {
  local_energy_shield: [[COL.esFlat, 1]],
  "local_energy_shield_+%": [[COL.esPct, 1]],
  "local_armour_and_energy_shield_+%": [[COL.esPct, 1]],
  "local_evasion_and_energy_shield_+%": [[COL.esPct, 1]],
  base_maximum_life: [[COL.life, 1]],
  "base_fire_damage_resistance_%": [[COL.res, 1]],
  "base_cold_damage_resistance_%": [[COL.res, 1]],
  "base_lightning_damage_resistance_%": [[COL.res, 1]],
  "base_chaos_damage_resistance_%": [[COL.chaos, 1]],
  "fire_and_chaos_damage_resistance_%": [
    [COL.res, 1],
    [COL.chaos, 1],
  ],
  "cold_and_chaos_damage_resistance_%": [
    [COL.res, 1],
    [COL.chaos, 1],
  ],
  "lightning_and_chaos_damage_resistance_%": [
    [COL.res, 1],
    [COL.chaos, 1],
  ],
  "base_movement_velocity_+%": [[COL.ms, 1]],
};
const COL_METRIC: Partial<Record<number, Metric>> = { [COL.life]: "life", [COL.res]: "res", [COL.chaos]: "chaos", [COL.ms]: "ms" };

export interface BaseModSpec {
  family: string;
  stat: string;
  /** 1 = ilvl で付く最上位 */
  tier: number;
}

export interface SimOptions {
  page: string;
  ilvl: number;
  baseMods: BaseModSpec[];
  essence: { name: string; stat: string } | null;
  desecrate: boolean;
  /** 冒涜の候補の最低 MOD レベル (保存 0 / 古代 40)。アビス専用 MOD と通常の MOD の両方に効く */
  ribMinLevel: number;
  /** 3 択の 2 つ目・3 つ目が通常の MOD になる確率 */
  normalShare: number;
  /** アビスの反響のお告げを使う (3 択を 1 回引き直せる) */
  echo: boolean;
  /** エグザルトごとの MOD レベル下限 (配列の長さ = 足す数) */
  exaltLevels: number[];
  /** 右側の高貴なお告げ = 接尾辞だけ */
  exaltSide: "any" | "suffix";
  /** 冒涜 3 択の選び方 (指標ごとの重み) */
  priority: Partial<Record<Metric, number>>;
  samples: number;
}

export interface SimResult {
  ok: boolean;
  reason?: string;
  n: number;
  raw: Float32Array;
  /** 反響で引き直した割合 */
  pReroll: number;
  /** 使ったベース MOD のティア値 (表示用) */
  baseRanges: { family: string; tier: number; level: number; min: number; max: number }[];
}

export interface Slots {
  prefixUsed: number;
  suffixUsed: number;
  desecrateGen: "prefix" | "suffix" | null;
  prefixOpen: number;
  suffixOpen: number;
}

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

/** ベース MOD のティア一覧 (レベル降順 = T1, T2, …) */
export function baseModTiers(page: string, family: string, stat: string, ilvl: number): { tier: number; level: number; min: number; max: number; mod: WMod }[] {
  const p = WEIGHT_PAGES[page];
  if (!p) return [];
  return p.normal
    .filter((m) => m.family === family && m.level <= ilvl && m.stats.some((s) => s.id === stat))
    .sort((a, b) => b.level - a.level)
    .map((m, i) => {
      const s = m.stats.find((x) => x.id === stat)!;
      return { tier: i + 1, level: m.level, min: s.min, max: s.max, mod: m };
    });
}

export function findEssence(page: string, name: string, stat: string): WEssence | null {
  return WEIGHT_PAGES[page]?.essence.find((e) => e.essence === name && e.stats.some((s) => s.id === stat)) ?? null;
}

/** 接頭辞 / 接尾辞の空き (ベース MOD + エッセンス + 冒涜のあと) */
export function slotsAfterSetup(o: Pick<SimOptions, "page" | "ilvl" | "baseMods" | "essence" | "desecrate">): Slots {
  const page = WEIGHT_PAGES[o.page];
  let prefixUsed = 0;
  let suffixUsed = 0;
  for (const b of o.baseMods) {
    const t = baseModTiers(o.page, b.family, b.stat, o.ilvl)[0];
    if (t?.mod.gen === "prefix") prefixUsed++;
    else if (t) suffixUsed++;
  }
  if (o.essence) {
    const e = findEssence(o.page, o.essence.name, o.essence.stat);
    if (e?.gen === "prefix") prefixUsed++;
    else if (e) suffixUsed++;
  }
  let desecrateGen: Slots["desecrateGen"] = null;
  if (o.desecrate && page) {
    // アビス専用 MOD がある側に冒涜が付く (兜 / 手袋 / 靴は接尾辞だけ)
    const pool = page.desecrated.filter((m) => m.level <= o.ilvl);
    const suffixes = pool.filter((m) => m.gen === "suffix").length;
    const prefixes = pool.length - suffixes;
    desecrateGen = suffixes >= prefixes ? (3 - suffixUsed > 0 ? "suffix" : null) : 3 - prefixUsed > 0 ? "prefix" : null;
    if (desecrateGen === "suffix") suffixUsed++;
    else if (desecrateGen === "prefix") prefixUsed++;
  }
  return { prefixUsed, suffixUsed, desecrateGen, prefixOpen: Math.max(0, 3 - prefixUsed), suffixOpen: Math.max(0, 3 - suffixUsed) };
}

/** 指定した数のうち実際に付けられる数 (空きと、右側のお告げの制限) */
export function effectiveExaltCount(slots: Slots, side: "any" | "suffix", count: number): number {
  const open = side === "suffix" ? slots.suffixOpen : slots.prefixOpen + slots.suffixOpen;
  return Math.max(0, Math.min(count, open));
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

// ---------------------------------------------------------------------------
// 売値の段 (ラダー): 1 回ぶんの結果を「満たす段のうち一番高い売値」で売る
// ---------------------------------------------------------------------------

export interface PostOptions {
  baseEs: number;
  quality: number;
  /** ルーン (ソケット数ぶん足す) */
  rune: Partial<Record<"esPct" | "life" | "res" | "ms", number>>;
  runeCount: number;
}

export interface LadderBucket {
  key: string;
  label: string;
  conds: Partial<Record<Metric, number>>;
  price: number | null;
}

export interface LadderRow {
  key: string;
  label: string;
  /** 条件を満たす確率 */
  pReach: number;
  /** この段で売る確率 (もっと高い段に当たらなかった物) */
  pSold: number;
  price: number | null;
  contribution: number;
}

export interface LadderResult {
  rows: LadderRow[];
  floor: { pSold: number; price: number | null; contribution: number };
  expectedSale: number;
  ev: number;
  /** 売値が 1 回の費用以上になる確率 */
  pProfit: number;
  means: Record<Metric, number>;
}

function metricsOf(raw: Float32Array, i: number, post: PostOptions): Record<Metric, number> {
  const b = i * NCOL;
  const rc = post.runeCount;
  const esPct = raw[b + COL.esPct] + post.quality + (post.rune.esPct ?? 0) * rc;
  const esFlat = raw[b + COL.esFlat];
  return {
    es: post.baseEs > 0 || esFlat > 0 ? (post.baseEs + esFlat) * (1 + esPct / 100) : 0,
    life: raw[b + COL.life] + (post.rune.life ?? 0) * rc,
    res: raw[b + COL.res] + (post.rune.res ?? 0) * rc,
    chaos: raw[b + COL.chaos],
    ms: raw[b + COL.ms] + (post.rune.ms ?? 0) * rc,
  };
}

const meets = (m: Record<Metric, number>, conds: Partial<Record<Metric, number>>): boolean => {
  for (const k of Object.keys(conds) as Metric[]) {
    const v = conds[k];
    if (v != null && m[k] < v) return false;
  }
  return true;
};

export function evaluateLadder(sim: SimResult, post: PostOptions, buckets: LadderBucket[], floorPrice: number | null, cost: number): LadderResult {
  const reach = new Array(buckets.length).fill(0);
  const sold = new Array(buckets.length).fill(0);
  let floorSold = 0;
  let saleSum = 0;
  let profit = 0;
  const sums: Record<Metric, number> = { es: 0, life: 0, res: 0, chaos: 0, ms: 0 };
  const order = buckets
    .map((b, i) => ({ i, price: b.price }))
    .filter((x) => x.price != null)
    .sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
  for (let s = 0; s < sim.n; s++) {
    const m = metricsOf(sim.raw, s, post);
    for (const k of Object.keys(sums) as Metric[]) sums[k] += m[k];
    const ok = buckets.map((b) => meets(m, b.conds));
    ok.forEach((v, i) => {
      if (v) reach[i]++;
    });
    let price = floorPrice ?? 0;
    const top = order.find((x) => ok[x.i] && (x.price ?? 0) > (floorPrice ?? 0));
    if (top) {
      sold[top.i]++;
      price = top.price ?? 0;
    } else floorSold++;
    saleSum += price;
    if (price >= cost) profit++;
  }
  const n = Math.max(1, sim.n);
  const rows = buckets.map((b, i) => ({
    key: b.key,
    label: b.label,
    pReach: reach[i] / n,
    pSold: sold[i] / n,
    price: b.price,
    contribution: (sold[i] / n) * (b.price ?? 0),
  }));
  const expectedSale = saleSum / n;
  const means = { es: sums.es / n, life: sums.life / n, res: sums.res / n, chaos: sums.chaos / n, ms: sums.ms / n };
  return {
    rows,
    floor: { pSold: floorSold / n, price: floorPrice, contribution: (floorSold / n) * (floorPrice ?? 0) },
    expectedSale,
    ev: expectedSale - cost,
    pProfit: profit / n,
    means,
  };
}
