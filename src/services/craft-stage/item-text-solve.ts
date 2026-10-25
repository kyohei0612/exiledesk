/**
 * item-text-solve.ts — 貼り付けの明示の行を「そのベースの池の MOD の組み合わせ」で説明する割り当てを探す (2026-10-25 ジン部長 10 本目。
 * オーナー 10-25「このマナ＋スピリットが検知されないな忍者だと」「ハイブリッドはほかにもやまほどあるからな」「トレードだと合算してるからな」)。
 *
 * 1 行 = 能力値 (stat) の組と値。MOD 1 つは自分の能力値ごとに、同じ印 (✦・冒涜・クラフト) のその能力値の行へ値を足す。
 * - ハイブリッド (能力値 2 つ以上の MOD) は 2 行にまたがる (poe.ninja・ゲームのコピーは分かれて出る、見本 n6)
 * - 同じ能力値の MOD が 2 つ以上なら、その行の値は和 (トレード・ゲームのコピーは同じ文の行を 1 行に足して出す、見本 t3 の「スピリットが80%増加する」、n1 のレアリティ 35%)
 * 守る事: 系統は 1 つまで (mod-rules の familyBlocked)、プレ・サフィの枠、各値がその段の幅 (品質などの上乗せ込み)、行の印 (✦ の行は ✦ の MOD だけ等)。
 * 一番もっともらしい割り当て (読めない行が少ない > 和の行が少ない > 2 行にまたがる MOD が少ない > 印どおりの出どころ) を先頭に、ほかの読み方も返す。
 * どの組み合わせでも説明できない行は unexplained (推し量らない)
 */
import type { Mod } from "../../vendor/poe2htc/engine/types";
import { familyBlocked, familyKeysOf } from "../mods/mod-rules";
import { tierDisplayRanges } from "../mods/stat-scale";

export interface SolveLine {
  /** 能力値の id (MOD の tiers[].stats の並び。行の値と同じ数) */
  stats: readonly string[];
  /** 貼り付けの値 (盛られた値、reduced は正のまま) */
  values: readonly number[];
  /** 行の印 (fractured・desecrated・crafted …、無ければ null)。同じ印の行どうしだけで MOD を組む */
  note: string | null;
  /** Ctrl+Alt+C の見出しの側 */
  side?: "prefix" | "suffix";
  /** トレードのサイトの段の表記 (0 = エッセンス・合金・冒涜専用) */
  tradeTier?: number;
  /** 文で引いた MOD (説明できない行もこの MOD の枠と系統を使う) */
  own?: Mod;
}
export interface SolvePick {
  mod: Mod;
  /** mod.tiers の位置 */
  tier: number;
  /** 能力値ごとの行 (stats と同じ並び) */
  lines: number[];
}
export interface Solution {
  picks: SolvePick[];
  /** どの組み合わせでも説明できなかった行 */
  unexplained: number[];
  /** 小さいほどもっともらしい (読めない行・枠に入らない読めない行・和の行・和に足した MOD の数・またがる MOD・出どころ) */
  score: number[];
  /** 同じ MOD の組で段の割り方が 2 通り以上あった (和の行の分け方は仮。単体の MOD の段が高い割り方を選んだ) */
  tentative?: true;
}
export interface SolveCtx {
  lines: readonly SolveLine[];
  /** 池の MOD (そのベースに付きうる物全部、ルーンの特殊 MOD は除いて渡す) */
  pool: readonly Mod[];
  /** 割り当ての外で付いている MOD (アルダーで重ねた行など)。枠と系統だけ数える */
  fixed: readonly Mod[];
  limit: { prefix: number; suffix: number };
  /** その MOD の段の縛りのアイテムレベル (エッセンスは Infinity) */
  levelOf: (m: Mod) => number;
  /** その行のその MOD に掛かる上乗せの % (品質・反対側の効果・ルーンの強さ) */
  pctOf: (line: number, m: Mod) => number;
  /** MOD の能力値 (無ければ段の stats) */
  statsOf?: (m: Mod) => readonly string[];
}

/** MOD の能力値 (段の stats)。エッセンスの MOD は stats を持たないので、呼ぶ側が同じ文の MOD から借りた物を statsOf で渡す */
const ownStats = (m: Mod): readonly string[] => (m.tiers[0] as { stats?: string[] } | undefined)?.stats ?? [];
const NODES = 200_000;
const KEEP = 6;

/** reduced (段の値が全部 0 以下) の MOD に当てる時は、行の値を負にする */
const negative = (m: Mod): boolean => m.tiers.length > 0 && m.tiers.every((t) => t.ranges.length > 0 && t.ranges.every(([, hi]) => hi <= 0));
/** 印に合う出どころか、印どおりでなければ出どころの減点 (0 = 印どおり)。null = この行には当てない */
function sourceCost(m: Mod, l: SolveLine): number | null {
  const src = String(m.source ?? "normal");
  const ess = /essence|alloy/.test(src), des = src === "desecrated";
  if (l.tradeTier === 0) return ess ? 0 : des ? 1 : null;
  if (l.note === "crafted") return ess ? 0 : null;
  if (l.note === "desecrated") return des ? 0 : ess ? null : 1;
  return src === "normal" ? 0 : ess ? 2 : 1;
}

/**
 * 和の行 (2 つ以上の MOD が足された行) の値を MOD ごとに割る (素の値)。オーナー 10-25「前提単体のが数値高いからそれ引いた値がハイブリッド」
 * 「数値のティア幅あるでしょ」: 単体 (能力値 1 つ) の MOD を先に段の上まで埋め、残りをハイブリッドなどに渡す (目安の 1 つの値 v)。
 * 1 つの値に決めつけないよう、ほかの MOD の段の幅から引いた「その MOD が取りうる幅」[lo, hi] も返す (和 − ほかの上限 〜 和 − ほかの下限 と、自分の段の幅の重なり)。
 * 返す鍵は `${picks の位置}:${その MOD の能力値の位置}`。和でない行は入れない (呼ぶ側が今までどおり割り戻す)
 */
export function splitSums(sol: Solution, lines: readonly SolveLine[], pctOf: (line: number, m: Mod) => number, per: readonly number[], statsOf: (m: Mod) => readonly string[] = ownStats): Map<string, { v: number; lo: number; hi: number }> {
  const out = new Map<string, { v: number; lo: number; hi: number }>();
  const byLine = new Map<string, Array<{ key: string; lo: number; hi: number; p: number; neg: boolean; single: boolean }>>();
  sol.picks.forEach((pk, n) => {
    const ranges = tierDisplayRanges(pk.mod.tiers[pk.tier]!);
    statsOf(pk.mod).forEach((s, j) => {
      const i = pk.lines[j]!;
      if ((per[i] ?? 0) < 2 || !ranges[j]) return;
      const neg = negative(pk.mod);
      const a = Number(ranges[j]![0]), b = Number(ranges[j]![1]);
      // 負の段 (reduced) は向きを反して正の数で割る
      const lo = neg ? -b : a, hi = neg ? -a : b;
      const k = `${i}:${s}`;
      byLine.set(k, [...(byLine.get(k) ?? []), { key: `${n}:${j}`, lo, hi, p: 1 + pctOf(i, pk.mod) / 100, neg, single: statsOf(pk.mod).length === 1 }]);
    });
  });
  const r2 = (x: number): number => Math.round(x * 100) / 100;
  for (const [k, cs0] of byLine) {
    const [line, stat] = [Number(k.split(":")[0]), k.slice(k.indexOf(":") + 1)];
    const at = lines[line]?.stats.indexOf(stat) ?? -1;
    const total = Math.abs(lines[line]?.values[Math.max(0, at)] ?? 0);
    const cs = [...cs0].sort((x, y) => Number(y.single) - Number(x.single));
    let left = total - cs.reduce((a, c) => a + c.lo * c.p, 0);
    for (const c of cs) {
      const add = Math.max(0, Math.min(c.hi - c.lo, left / c.p));
      left -= add * c.p;
      const othersLo = cs.filter((x) => x !== c).reduce((a, x) => a + x.lo * x.p, 0), othersHi = cs.filter((x) => x !== c).reduce((a, x) => a + x.hi * x.p, 0);
      const lo = Math.max(c.lo, (total - othersHi) / c.p), hi = Math.min(c.hi, (total - othersLo) / c.p);
      const sg = c.neg ? -1 : 1;
      const v = r2(c.lo + add);
      out.set(c.key, c.neg ? { v: -v, lo: -r2(hi), hi: -r2(lo) } : { v: sg * v, lo: r2(lo), hi: r2(hi) });
    }
  }
  return out;
}

/** 行の明示の MOD を池の MOD の組み合わせに割り当てる。よい順に最大 KEEP 通り (先頭が一番もっともらしい) */
export function solveLines(ctx: SolveCtx): Solution[] {
  const { lines } = ctx;
  const statsOf = ctx.statsOf ?? ownStats;
  // 能力値 → その能力値を持つ行 (印ごと)
  const lineOf = (stat: string, note: string | null): number[] => lines.flatMap((l, i) => (l.note === note && l.stats.includes(stat) ? [i] : []));
  // 行ごとに当てられる MOD (その行の能力値を全部持ち、ほかの能力値も同じ印の行がある)
  const cands: Array<Array<{ mod: Mod; cost: number; at: number[] }>> = lines.map((l, li) => ctx.pool.flatMap((m) => {
    const ms = statsOf(m);
    if (!l.stats.every((s) => ms.includes(s))) return [];
    if (l.side && m.type !== l.side) return [];
    const cost = sourceCost(m, l);
    if (cost === null) return [];
    const at: number[] = [];
    // この行の能力値はこの行へ、ほかの能力値は同じ印のその能力値の行へ
    for (const s of ms) {
      if (l.stats.includes(s)) { at.push(li); continue; }
      const ls = lineOf(s, l.note);
      if (!ls.length) return [];
      at.push(ls[0]!);
    }
    return [{ mod: m, cost, at }];
  }));
  // 行ごとの値の帯 (MOD ごとに符号と上乗せが違うので、足す時に MOD の側で換算する)
  const n = lines.length;
  const lo = lines.map((l) => l.values.map(() => 0));
  const hi = lines.map((l) => l.values.map(() => 0));
  const sign = lines.map((_, i) => (cands[i]![0] && negative(cands[i]![0]!.mod) ? -1 : 1));
  const target = (i: number, k: number): number => sign[i]! * lines[i]!.values[k]!;
  // 上乗せのある行は表示が切り捨てなので、素の和は [表示, 表示 + 1) の帯
  const boosted = lines.map((_, i) => cands[i]!.some((c) => ctx.pctOf(i, c.mod) > 0));
  const slack = (i: number): number => (boosted[i] ? 1 - 1e-9 : 0);
  const done = (i: number): boolean => lines[i]!.values.every((_, k) => {
    const v = target(i, k);
    return v >= 0 ? hi[i]![k]! >= v && lo[i]![k]! <= v + slack(i) : lo[i]![k]! <= v && hi[i]![k]! >= v - slack(i);
  });
  const over = (i: number): boolean => lines[i]!.values.some((_, k) => {
    const v = target(i, k);
    return v >= 0 ? lo[i]![k]! > v + slack(i) : hi[i]![k]! < v - slack(i);
  });
  const contrib: number[] = new Array(n).fill(0);
  const picks: Array<SolvePick & { cost: number }> = [];
  const unexplained: number[] = [];
  /** 説明できない行のうち、枠か系統の都合で 1 つの MOD として数えられなかった数 (少ないほどもっともらしい) */
  let overflow = 0;
  const count = { prefix: 0, suffix: 0 };
  const taken = new Set<string>();
  for (const m of ctx.fixed) {
    if (m.type === "prefix" || m.type === "suffix") count[m.type]++;
    for (const k of familyKeysOf(m)) taken.add(k);
  }
  const found: Solution[] = [];
  const seen = new Map<string, { at: number; tb: number[]; tiers: Set<string> }>();
  let nodes = 0;
  let best = Infinity;

  /** MOD を段 t で足す / 外す (行の帯へ、上乗せと符号を換算して) */
  const apply = (mod: Mod, t: number, at: readonly number[], dir: 1 | -1): void => {
    const ms = statsOf(mod), ranges = tierDisplayRanges(mod.tiers[t]!);
    ms.forEach((s, j) => {
      const i = at[j]!, k = lines[i]!.stats.indexOf(s), r = ranges[j];
      if (k < 0 || !r) return;
      const p = 1 + ctx.pctOf(i, mod) / 100;
      lo[i]![k]! += dir * Number(r[0]) * p;
      hi[i]![k]! += dir * Number(r[1]) * p;
    });
    // 和の数え: 行ごとに MOD 1 つで 1 (値が 2 つの行「# から # の…」を 2 と数えない)
    for (const i of new Set(at)) contrib[i]! += dir;
  };
  const fixVals = (): void => { for (let i = 0; i < n; i++) for (let k = 0; k < lo[i]!.length; k++) { lo[i]![k] = Math.round(lo[i]![k]! * 1e6) / 1e6; hi[i]![k] = Math.round(hi[i]![k]! * 1e6) / 1e6; } };

  const record = (): void => {
    const sumLines = contrib.filter((c) => c > 1).length;
    const spans = picks.filter((p) => new Set(p.lines).size > 1).length;
    const cost = picks.reduce((a, p) => a + p.cost, 0);
    // 和に足した MOD の多さ (1 行を 3 つの MOD の和で読むより 2 つ)
    const extra = contrib.reduce((a, c) => a + Math.max(0, c - 1), 0);
    const score = [unexplained.length, overflow, sumLines, extra, spans, cost];
    const key = picks.map((p) => p.mod.id).sort().join(",") + "|" + [...unexplained].sort().join(",");
    // 同じ MOD の組で段の割り方が違う物は 1 つに: 和の行の単体 (能力値 1 つ) の MOD の段が高い方、次にほかの MOD の段が高い方 (オーナー 10-25「前提T1に合わせて残った方の単体数値でティア」)
    const onSum = (p: SolvePick): boolean => p.lines.some((i) => contrib[i]! > 1);
    const tb = [picks.filter((p) => onSum(p) && statsOf(p.mod).length === 1).reduce((a, p) => a + p.tier, 0), picks.filter(onSum).reduce((a, p) => a + p.tier, 0)];
    const sol: Solution = { picks: picks.map(({ mod, tier, lines: ls }) => ({ mod, tier, lines: [...ls] })), unexplained: [...unexplained], score };
    const was = seen.get(key);
    const tiers = picks.map((p) => `${p.mod.id}@${p.tier}`).sort().join(",");
    if (was) {
      if (was.tiers.has(tiers)) return; // 足す順が違うだけの同じ割り方
      was.tiers.add(tiers);
      const prev = found[was.at]!;
      prev.tentative = true;
      if (tb[0]! > was.tb[0]! || (tb[0] === was.tb[0] && tb[1]! > was.tb[1]!)) { found[was.at] = { ...sol, tentative: true }; was.tb = tb; }
      return;
    }
    seen.set(key, { at: found.length, tb, tiers: new Set([tiers]) });
    best = Math.min(best, unexplained.length);
    found.push(sol);
  };

  const dfs = (): void => {
    if (++nodes > NODES) return;
    if (unexplained.length > best) return;
    const i = lines.findIndex((_, j) => !unexplained.includes(j) && !done(j));
    if (i < 0) { record(); return; }
    for (const c of cands[i]!) {
      const side = c.mod.type;
      if ((side === "prefix" || side === "suffix") && count[side] >= ctx.limit[side]) continue;
      if (familyBlocked(c.mod, taken)) continue;
      const keys = familyKeysOf(c.mod);
      const level = ctx.levelOf(c.mod);
      for (let t = c.mod.tiers.length - 1; t >= 0; t--) {
        if (c.mod.tiers[t]!.ilvl > level) continue;
        apply(c.mod, t, c.at, 1);
        fixVals();
        if (!c.at.some(over)) {
          if (side === "prefix" || side === "suffix") count[side]++;
          for (const k of keys) taken.add(k);
          picks.push({ mod: c.mod, tier: t, lines: c.at, cost: c.cost });
          dfs();
          picks.pop();
          for (const k of keys) taken.delete(k);
          if (side === "prefix" || side === "suffix") count[side]--;
        }
        apply(c.mod, t, c.at, -1);
        fixVals();
        if (nodes > NODES) return;
      }
    }
    // この行はどの組み合わせでも説明できない (推し量らない)。途中まで MOD を足した形は数えない。
    // 説明できない行も 1 つの MOD として文で引いた MOD の枠と系統を使う (見本 t4 10-25 オーナー「ハイブリッドに被ってないMODが残り2枠あったりしたら4MODになるからハイブリッドって気づくよね」)。
    // 枠が埋まっている・系統がぶつかる時は使わずに (説明できない行どうしの数え過ぎで、どの読み方も無くならないように)
    if (contrib[i]! > 0) return;
    const own = lines[i]!.own, side = own?.type;
    const occupy = !!own && (side === "prefix" || side === "suffix") && count[side] < ctx.limit[side] && !familyBlocked(own, taken);
    const keys = occupy ? familyKeysOf(own!) : [];
    if (occupy) { count[side as "prefix" | "suffix"]++; for (const k of keys) taken.add(k); }
    if (!occupy) overflow++;
    unexplained.push(i);
    dfs();
    unexplained.pop();
    if (!occupy) overflow--;
    if (occupy) { count[side as "prefix" | "suffix"]--; for (const k of keys) taken.delete(k); }
  };
  dfs();
  const cmp = (a: Solution, b: Solution): number => { for (let k = 0; k < a.score.length; k++) if (a.score[k] !== b.score[k]) return a.score[k]! - b.score[k]!; return 0; };
  return found.sort(cmp).slice(0, KEEP);
}
