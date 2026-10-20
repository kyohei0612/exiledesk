/**
 * auto-actions.ts — 動的計画法の形と手 (解析君、2026-10-20。前の試し plan5.mjs の手袋専用の形を、札の並びから組む汎用版に)。
 *
 * 形 = [固定された候補, 札ごとの状態…, プレの外れ, サフィの外れ, 冒涜の印]
 *   札の状態: 0 無い / 1+m 候補 m が段の足りない段で付いている / 1+M+m 候補 m が狙いの段以上 (M = 候補の数)
 *   冒涜の印 (冒涜はアイテムに 1 つまで): 0 無し / 1・2 プレの未発現 (保存・古代) / 3・4 サフィの未発現 / 5・6 外れの冒涜 (プレ・サフィ、外れの数に込み) / 7+k 札 k を冒涜で取った
 * 手 = 高貴 (普通・上級・完全 × なし・左・右・偉大・偉大 + 左右)、カオス (× なし・左右の抹消)、消去 (× なし・左右の消去)、
 *   完璧なエッセンス (× なし・左右の結晶化)、骨 (保存・古代 × なし・左右の死霊術)、発現 (± 深淵の反響)、消去 + 光。
 * 行き先の出どころ:
 *   - 消去・光・骨・完璧なエッセンス・カオスの消す部分 = エンジンの入口の stepOutcomes を build の時に形ごとに打った表 (model.eng、auto-engine.ts)
 *   - 付ける (高貴・カオスの付ける部分) = 置き場の重み (auto-model がエンジンの candidates から作った物)。大いなる高貴は 1 つずつ 2 回 (打つ処理の addCount 2 と同じ)
 *   - 発現 = ⑤ の選び方 (選択なので stepOutcomes の外)
 * 近似 (計算とエンジンのずれ 1 割くらい、メモ optimal-craft-dp):
 *   - 外れの系統は置き場を減らさない (外れが何かは持たない)。狙いと同じ系統の別の MOD は外れに数える (札の系統を塞がない)
 *   - 発現の候補 3 つは置き場から重みで戻しありに引く (同じ系統が 2 つ出ない決まりは見ない)。冒涜専用の数の割合はエンジンと同じ
 *   - 表の代表のアイテムでは外れを代表の MOD で置く (auto-engine.ts)
 */
import type { AutoModel, Grade, MCand, State } from "./auto-types";

export type { State } from "./auto-types";
export type Outs = Array<[number, State]>;
export interface Act { name: string; cost: number; out: Outs }

const D_NONE = 0, D_JP = 5, D_JS = 6, D_T = 7;
const isU = (d: number): boolean => d >= 1 && d <= 4;
const uSide = (d: number): 0 | 1 => (d <= 2 ? 0 : 1);
const SIDE_OMEN = {
  exalt: ["OmenofSinistralExaltation", "OmenofDextralExaltation"], erasure: ["OmenofSinistralErasure", "OmenofDextralErasure"],
  annul: ["OmenofSinistralAnnulment", "OmenofDextralAnnulment"], crystal: ["OmenofSinistralCrystallisation", "OmenofDextralCrystallisation"],
  necro: ["OmenofSinistralNecromancy", "OmenofDextralNecromancy"],
} as const;
const ADD_KEY = { a0: ["exalt", "chaos"], a1: ["exalt_greater", "chaos_greater"], a2: ["exalt_perfect", "chaos_perfect"] } as const;

/** 形の扱い (札の数・候補の数を model から) */
export class Shape {
  readonly K: number;
  readonly M: number[];
  /** 表 (model.eng) に無い形を引いた数 (0 が正しい) */
  miss = 0;
  constructor(readonly m: AutoModel) { this.K = m.slots.length; this.M = m.slots.map((s) => s.members.length); }
  key = (s: State): string => String.fromCharCode(...s.map((v) => v + 48));
  jx = (side: 0 | 1): number => 1 + this.K + side;
  dx = (): number => 3 + this.K;
  hit = (k: number, v: number): boolean => v > this.M[k]!;
  member = (k: number, v: number): number => (v - 1) % this.M[k]!;
  /** 始めの形の分かれ方 (build の時に auto-engine の startStates で作った物) */
  starts(): Array<[number, State]> {
    return this.m.starts.map(([p, s]) => [p, [...s]]);
  }
  goal = (s: State): boolean => { for (let k = 0; k < this.K; k++) if (!this.hit(k, s[1 + k]!)) return false; return true; };
  /** 側の MOD の数 (固定・札・外れ・未発現) */
  count(s: State, side: 0 | 1): number {
    let n = (this.m.frac.side === side ? 1 : 0) + s[this.jx(side)]!;
    for (let k = 0; k < this.K; k++) if (s[1 + k]! > 0 && this.m.slots[k]!.side === side) n++;
    const d = s[this.dx()]!;
    if (isU(d) && uSide(d) === side) n++;
    return n;
  }
  room = (s: State, side: 0 | 1): boolean => this.count(s, side) < this.m.cap[side];
  /** 塞いでいる系統 (固定の候補と付いている札の MOD。外れの系統は持たない) */
  blocked(s: State): Set<number> {
    const b = new Set(this.m.frac.picks[s[0]!]!.fams);
    for (let k = 0; k < this.K; k++) { const v = s[1 + k]!; if (v > 0) for (const f of this.m.slots[k]!.members[this.member(k, v)]!.fams) b.add(f); }
    return b;
  }
  /** 中身が同じ札は区別しない: 同じ組の中は状態の高い順 (quiz-recipe の assignSlots と同じ)。冒涜の印も一緒に動かす */
  canon(s0: State): State {
    const s = s0;
    const groups = new Map<number, number[]>();
    this.m.slots.forEach((sl, k) => groups.set(sl.group, [...(groups.get(sl.group) ?? []), k]));
    for (const ks of groups.values()) {
      if (ks.length < 2) continue;
      const d = s[this.dx()]!;
      const rank = (v: number, k: number) => (this.hit(k, v) ? 2000 : v > 0 ? 1000 : 0) - v;
      const items = ks.map((k) => ({ v: s[1 + k]!, t: d === D_T + k }));
      items.sort((a, b) => rank(b.v, ks[0]!) - rank(a.v, ks[0]!));
      ks.forEach((k, i) => { s[1 + k] = items[i]!.v; if (items[i]!.t) s[this.dx()] = D_T + k; });
    }
    if (s[this.dx()] === D_JP && !s[this.jx(0)]) s[this.dx()] = D_NONE;
    if (s[this.dx()] === D_JS && !s[this.jx(1)]) s[this.dx()] = D_NONE;
    return s;
  }
  /**
   * ⑤ の見え方: 順番 (札の番号の関門の並び、並びに無い札は後ろに 1 つずつ) のまだ揃っていない一番前の関門より後ろの札は「付いていない」、
   * その MOD は外れ (冒涜で取った物は外れの冒涜) に数える (quiz-recipe の maskedBy・situationOf と同じ)
   */
  view(s: State, gates: readonly number[]): State {
    const cut = gates.findIndex((k) => !this.hit(k, s[1 + k]!));
    if (cut < 0) return s;
    const t = [...s];
    for (const k of gates.slice(cut + 1)) {
      const v = t[1 + k]!;
      if (!v) continue;
      const side = this.m.slots[k]!.side;
      t[1 + k] = 0; t[this.jx(side)]!++;
      if (t[this.dx()] === D_T + k) t[this.dx()] = side ? D_JS : D_JP;
    }
    return this.canon(t);
  }
}

/** 足す: 等級 g、側 (null = 空きのある両側) で 1 つ付いた行き先。付けられなければ null */
function addOuts(sh: Shape, s: State, g: Grade, side: 0 | 1 | null): Outs | null {
  const pools = sh.m.pools[g];
  if (!pools) return null;
  const bl = sh.blocked(s);
  const out = new Map<string, [number, State]>();
  let tot = 0;
  const put = (w: number, t: State) => { if (!(w > 0)) return; tot += w; const c = sh.canon(t), k = sh.key(c); const e = out.get(k); if (e) e[0] += w; else out.set(k, [w, c]); };
  for (const sd of [0, 1] as const) {
    if ((side != null && sd !== side) || !sh.room(s, sd)) continue;
    for (const c of pools[sd]) {
      if (c.ex || c.fams.some((f) => bl.has(f))) continue;
      const ref = c.refs.find((r) => s[1 + r.k] === 0);
      if (ref) {
        const M = sh.M[ref.k]!;
        const h = [...s]; h[1 + ref.k] = 1 + M + ref.m; put(ref.hit, h);
        const l = [...s]; l[1 + ref.k] = 1 + ref.m; put(ref.low, l);
      } else { const j = [...s]; j[sh.jx(sd)]!++; put(c.w, j); }
    }
  }
  if (!(tot > 0)) return null;
  return [...out.values()].map(([w, t]) => [w / tot, t]);
}
/** 表の行き先の差分 (auto-engine.ts が作る): 0 k = 札 k を消す / 1 側 = 外れを消す / 2 側 = 外れの冒涜を消す / 3 = 未発現を消す / 4 印 = 未発現を付ける / 5 k m = 札 k に候補 m (エッセンス) */
function applyOps(sh: Shape, s: State, row: readonly number[]): State {
  const t = [...s], dx = sh.dx();
  for (let i = 1; i < row.length;) {
    const op = row[i]!;
    if (op === 0) { const k = row[i + 1]!; t[1 + k] = 0; if (t[dx] === D_T + k) t[dx] = D_NONE; i += 2; }
    else if (op === 1) { t[sh.jx(row[i + 1] as 0 | 1)]!--; i += 2; }
    else if (op === 2) { t[sh.jx(row[i + 1] as 0 | 1)]!--; t[dx] = D_NONE; i += 2; }
    else if (op === 3) { t[dx] = D_NONE; i += 1; }
    else if (op === 4) { t[dx] = row[i + 1]!; i += 2; }
    else { t[1 + row[i + 1]!] = 1 + sh.M[row[i + 1]!]! + row[i + 2]!; i += 3; }
  }
  return sh.canon(t);
}
/** 形の中身の鍵 (表の引き方): 固定の候補・札ごとの有無と候補・外れの数・冒涜の印。段の高い低いは見ない */
export function engKey(sh: Shape, s: State): string {
  const v: number[] = [s[0]!];
  for (let k = 0; k < sh.K; k++) { const x = s[1 + k]!; v.push(x ? 1 + sh.member(k, x) : 0); }
  v.push(s[sh.jx(0)]!, s[sh.jx(1)]!, s[sh.dx()]!);
  return v.join(",");
}
/** 表に入れる手 (名前・カレンシーの鍵・お告げ) */
export type EngAct = { name: string; kind: "an" | "li" | "bo"; key: string; omens: string[]; grade?: "b0" | "b4"; k: -1; m: -1 } | { name: string; kind: "es"; key: null; omens: string[]; k: number; m: number };
export function engActs(m: AutoModel): EngAct[] {
  const sd = (x: 0 | 1 | null) => (x == null ? "" : x ? "D" : "S");
  const om = (x: 0 | 1 | null, t: readonly [string, string]) => (x == null ? [] : [t[x]]);
  const out: EngAct[] = [];
  for (const x of [null, 0, 1] as const) out.push({ name: `an|${sd(x)}`, kind: "an", key: "annul", omens: om(x, SIDE_OMEN.annul), k: -1, m: -1 });
  out.push({ name: "li", kind: "li", key: "annul", omens: ["OmenofLight"], k: -1, m: -1 });
  for (const [g, key] of [["b0", "desecrate"], ["b4", "desecrate_ancient"]] as const) for (const x of [null, 0, 1] as const) out.push({ name: `bo|${g}|${sd(x)}`, kind: "bo", key, omens: om(x, SIDE_OMEN.necro), grade: g, k: -1, m: -1 });
  m.slots.forEach((sl, k) => { if (sl.kind === "essence") sl.members.forEach((mb, mi) => { if (mb.ess) for (const x of [null, 0, 1] as const) out.push({ name: `es|${k}|${mi}|${sd(x)}`, kind: "es", key: null, omens: om(x, SIDE_OMEN.crystal), k, m: mi }); }); });
  return out;
}
/** ⑤ の見え方の 1 つ分: 札 k の MOD を外れに (冒涜で取った物は外れの冒涜に) */
export function junkToView(sh: Shape, s: State, k: number): State {
  const t = [...s], side = sh.m.slots[k]!.side;
  t[1 + k] = 0; t[sh.jx(side)]!++;
  if (t[sh.dx()] === D_T + k) t[sh.dx()] = side ? D_JS : D_JP;
  return sh.canon(t);
}
/** 表の行き先 (無ければ null = その手は打てない、表に形が無ければ miss を数える) */
function engOuts(sh: Shape, s: State, name: string): Outs | null {
  const e = sh.m.eng[engKey(sh, s)];
  if (!e) { sh.miss++; return null; }
  const rows = e[name];
  if (!rows || !rows.length) return null;
  return merge(sh, rows.map((r) => [r[0]!, applyOps(sh, s, r)]));
}
const then = (sh: Shape, first: Outs, f: (t: State) => Outs | null, keepIfNull: boolean): Outs | null => {
  const out: Outs = [];
  for (const [p, t] of first) { const o = f(t); if (o) for (const [q, u] of o) out.push([p * q, u]); else if (keepIfNull) out.push([p, t]); else return null; }
  return merge(sh, out);
};
function merge(sh: Shape, o: Outs): Outs {
  const m = new Map<string, [number, State]>();
  for (const [p, t] of o) { if (!(p > 0)) continue; const k = sh.key(t); const e = m.get(k); if (e) e[0] += p; else m.set(k, [p, t]); }
  return [...m.values()];
}

/** 発現の行き先 (⑤ の選び方: 候補 3 つに埋まっていない札の MOD があれば取る、無ければ反響で引き直し、それでも無ければ外れ) */
function revealOuts(sh: Shape, s: State, echoes: boolean): { out: Outs; pEcho: number } | null {
  const d = s[sh.dx()]!;
  const side = uSide(d), pools = sh.m.pools[d === 2 || d === 4 ? "b4" : "b0"];
  if (!pools) return null;
  const bl = sh.blocked(s);
  // 種類: 札の当たり (k, m) と外れ。冒涜専用と普通で分ける
  type Cat = { w: number; k: number; m: number };
  const cats: [Cat[], Cat[]] = [[], []]; // [普通, 冒涜専用]
  const junk = [0, 0];
  for (const c of pools[side] as MCand[]) {
    if (c.fams.some((f) => bl.has(f))) continue;
    const x = c.ex ? 1 : 0;
    const ref = c.refs.find((r) => s[1 + r.k] === 0);
    if (ref && ref.hit > 0) { cats[x].push({ w: ref.hit, k: ref.k, m: ref.m }); junk[x]! += ref.low; }
    else junk[x]! += c.w;
  }
  const totN = cats[0].reduce((a, c) => a + c.w, 0) + junk[0]!, totX = cats[1].reduce((a, c) => a + c.w, 0) + junk[1]!;
  // 1 組 3 つの中の当たりの分かれ方 (当たりが複数なら等しく 1 つ)
  const once = (): { hit: Map<string, number>; none: number } => {
    const hit = new Map<string, number>(); let none = 0;
    const plans: Array<[number, number]> = totX > 0 ? sh.m.exRates.map((r, i) => [r, i + 1] as [number, number]) : [[1, 0]];
    for (const [pr, nx] of plans) {
      const walk = (left: number, prob: number, picks: Cat[]): void => {
        if (!left) {
          if (!picks.length) { none += pr * prob; return; }
          for (const c of picks) { const k = `${c.k}:${c.m}`; hit.set(k, (hit.get(k) ?? 0) + (pr * prob) / picks.length); }
          return;
        }
        const ex = sh.m.offers - left < nx || totN <= 0;
        const cs = ex ? cats[1] : cats[0], tot = ex ? totX : totN, j = ex ? junk[1]! : junk[0]!;
        if (!(tot > 0)) { walk(left - 1, prob, picks); return; }
        for (const c of cs) walk(left - 1, (prob * c.w) / tot, [...picks, c]);
        if (j > 0) walk(left - 1, (prob * j) / tot, picks);
      };
      walk(sh.m.offers, 1, []);
    }
    return { hit, none };
  };
  const a = once();
  const res = (k: number, m: number): State => { const t = [...s]; t[1 + k] = 1 + sh.M[k]! + m; t[sh.dx()] = D_T + k; return sh.canon(t); };
  const bad = (): State => { const t = [...s]; t[sh.jx(side)]!++; t[sh.dx()] = side ? D_JS : D_JP; return sh.canon(t); };
  const out: Outs = [];
  const mul = echoes ? 1 + a.none : 1;
  for (const [km, p] of a.hit) { const [k, m] = km.split(":").map(Number) as [number, number]; out.push([p * mul, res(k, m)]); }
  out.push([echoes ? a.none * a.none : a.none, bad()]);
  return { out: merge(sh, out), pEcho: echoes ? a.none : 0 };
}

/** その形で打てる手と行き先 */
export function actionsOf(sh: Shape, s: State): Act[] {
  const P = sh.m.prices, A: Act[] = [];
  const pr = (k: string): number | null => { const v = P[k]; return v != null && v > 0 && Number.isFinite(v) ? v : null; };
  const push = (name: string, keys: string[], out: Outs | null) => {
    if (!out || !out.length) return;
    let c = 0; for (const k of keys) { const v = k === "reveal" ? (P.reveal ?? 0) : pr(k); if (v == null) return; c += v; }
    A.push({ name, cost: c, out });
  };
  const room = [sh.room(s, 0), sh.room(s, 1)];
  for (const g of ["a0", "a1", "a2"] as const) {
    if (!sh.m.pools[g]) continue;
    const [ex, ch] = ADD_KEY[g];
    const add1 = (side: 0 | 1 | null) => (t: State) => addOuts(sh, t, g, side);
    if (room[0] || room[1]) {
      push(`ex|${g}|`, [ex], addOuts(sh, s, g, null));
      const o1 = addOuts(sh, s, g, null);
      if (o1) push(`ex|${g}|G`, [ex, "OmenofGreaterExaltation"], then(sh, o1, add1(null), true));
    }
    for (const sd of [0, 1] as const) {
      if (!room[sd]) continue;
      const o = addOuts(sh, s, g, sd);
      push(`ex|${g}|${sd ? "D" : "S"}`, [ex, SIDE_OMEN.exalt[sd]], o);
      if (o) push(`ex|${g}|G${sd ? "D" : "S"}`, [ex, "OmenofGreaterExaltation", SIDE_OMEN.exalt[sd]], then(sh, o, add1(sd), true));
    }
    // カオス = 消去と同じ消し方 (表の an|…、打つ処理のスペックが同じ。auto-engine.ts の頭) の後に 1 つ付ける (付けられなければ消しただけ)
    for (const sd of [null, 0, 1] as const) {
      const rem = engOuts(sh, s, `an|${sd == null ? "" : sd ? "D" : "S"}`);
      if (!rem) continue;
      push(`ch|${g}|${sd == null ? "" : sd ? "D" : "S"}`, [ch, ...(sd == null ? [] : [SIDE_OMEN.erasure[sd]])], then(sh, rem, add1(null), true));
    }
  }
  const d = s[sh.dx()]!;
  // 消去・光・骨・完璧なエッセンスは表 (stepOutcomes) のまま
  for (const a of engActs(sh.m)) {
    if (a.kind === "bo" && (d !== D_NONE || !sh.m.pools[a.grade!])) continue;
    if (a.kind === "li" && d === D_NONE) continue;
    if (a.kind === "es" && s[1 + a.k] !== 0) continue;
    const keys = [a.kind === "es" ? sh.m.slots[a.k]!.members[a.m]!.ess! : a.key, ...a.omens];
    push(a.name, keys, engOuts(sh, s, a.name));
  }
  if (isU(d)) for (const echo of [false, true]) {
    const r = revealOuts(sh, s, echo);
    if (!r) continue;
    const e = pr("OmenofAbyssalEchoes");
    if (echo && e == null) continue;
    A.push({ name: echo ? "rv|1" : "rv|0", cost: (P.reveal ?? 0) + r.pEcho * (e ?? 0), out: r.out });
  }
  return A;
}

/** 手の名前 → ⑤ の答え (QuizAction) */
export function quizActionOf(m: AutoModel, name: string): { use: string; omens?: string[] } | { reveal: { echoes: boolean } } {
  const [kind, a, b, c] = name.split("|");
  const om = (x: string | undefined, table: readonly [string, string]) => (x === "S" ? [table[0]] : x === "D" ? [table[1]] : []);
  const w = (use: string, omens: string[]) => (omens.length ? { use, omens } : { use });
  if (kind === "ex") { const g = a as "a0" | "a1" | "a2"; const os = [...(b!.includes("G") ? ["OmenofGreaterExaltation"] : []), ...om(b!.replace("G", ""), SIDE_OMEN.exalt)]; return w(ADD_KEY[g][0], os); }
  if (kind === "ch") return w(ADD_KEY[a as "a0"][1], om(b, SIDE_OMEN.erasure));
  if (kind === "an") return w("annul", om(a, SIDE_OMEN.annul));
  if (kind === "es") return w(m.slots[Number(a)]!.members[Number(b)]!.ess!, om(c, SIDE_OMEN.crystal));
  if (kind === "bo") return w(a === "b4" ? "desecrate_ancient" : "desecrate", om(b, SIDE_OMEN.necro));
  if (kind === "rv") return { reveal: { echoes: a === "1" } };
  return { use: "annul", omens: ["OmenofLight"] };
}
