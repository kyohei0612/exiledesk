/**
 * shape-table.ts — 形の決まり (2026-10-09)。狙いの側の「今の形」(狙い h・狙い以外 j・空き) ごとに打つ物を決める。
 * 打った結果は今の形だけで決まるので、同じ形なら同じ手でいい (通ってきた道では決めない)。
 * 形の表 (StageOutcomeTree) と、打って決める画面 (同じファイルの打つモード) と、パターンの「この手にする」の判定で使う。
 * 計算は recipe-sim の policy (キー `${h}-${j}`)
 */
import { setByKey, type PatternKind, type PatternSet, type PolicyAct } from "./pattern";
import { kindOf } from "./apply-currency";
import { modTierWeight } from "../../vendor/poe2htc/engine/pool";
import { CURRENCY_FLOOR, type ItemBase, type PatchData } from "../../vendor/poe2htc/engine/types";

/**
 * 打つ物のキー (カレンシー + お告げ)。パターンのセットと同じ形 `種類|カレンシー|お告げ+お告げ`。
 * 品質・触媒など、セットの一覧に無い物も同じ形で持つ (2026-10-09 オーナー「クラフトに使えるカレンシーは全部出さんとあかん」)
 */
export function useKey(currency: string, omens: readonly string[]): string {
  const k = kindOf(currency);
  const kind = k === "essence" || k === "essence_perfect" || k === "desecrate" ? k : /^(transmute|augment|regal|alchemy|exalt|chaos|annul|fracture)/.exec(currency)?.[1] ?? k;
  return `${kind}|${currency}|${omens.join("+")}`;
}
/** キーから打つ物 (セットに無ければキーを分けて作る) */
export function setOf(sets: readonly PatternSet[], key: string): PatternSet | undefined {
  const s = setByKey(sets, key);
  if (s) return s;
  const [kind, currency, om] = key.split("|");
  if (!kind || !currency) return undefined;
  return { key, kind: kind as PatternKind, currency, omens: om ? om.split("+") : [], group: "" };
}

/**
 * 高貴で 1 つ付けた時に狙い (mods のどれか、段の下限以上) が出る確率。その側の置き場の重み (通貨の強さの下限) から出す目安
 * (同じ系統の除外は見ない)。h = 今付いている狙いの数 (付いている分は候補から抜く)
 */
export function hitChanceOf(data: PatchData, cls: ItemBase, itemLevel: number, side: "prefix" | "suffix", mods: ReadonlyArray<{ modId: string; minTierIndex: number }>, others = 0): (currency: string, h: number) => number | null {
  const pool = cls.pools.normal[side === "prefix" ? "prefixes" : "suffixes"];
  return (currency, h) => {
    const strength = /_perfect$/.test(currency) ? "perfect" : /_greater$/.test(currency) ? "greater" : "base";
    const floor = CURRENCY_FLOOR.exalt[strength];
    const total = pool.reduce((a, id) => { const m = data.mods.get(id); return a + (m ? modTierWeight(m, floor, itemLevel) : 0); }, 0);
    if (!total || !mods.length) return null;
    const want = mods.reduce((a, x) => { const m = data.mods.get(x.modId); return a + (m ? modTierWeight(m, floor, itemLevel, x.minTierIndex) : 0); }, 0);
    const left = mods.length - Math.min(mods.length, Math.max(0, h - others));
    return Math.min(1, (want * (left / mods.length)) / total);
  };
}

export interface ShapeCtx {
  side: "prefix" | "suffix";
  /** 側の枠 (3、マジックは 1) */
  limit: number;
  /** この側で揃える狙いの数 (揃ったらこの手は終わり) */
  need: number;
  /** 反対の側の消せる MOD の数 (固定は消えない。前の手の狙いも入る)。0 なら素の消去も必ず狙いの側に刺さる */
  otherRemovable: number;
  /**
   * 反対の側に付いている前の手の狙いの数。あれば形のキーに入れて、消えた時の次の手も決める (両側に狙いがある時。2026-10-09)。
   * 無ければ反対の側は数だけ見る (キーは今まで通り h-j)
   */
  otherHits?: number;
  /** 反対の側の枠と固定の数 (付く側が運の手で、反対の側に付くか)。無ければ 3 と 0 */
  otherLimit?: number;
  otherFixed?: number;
  /** 高貴で 1 つ付けた時に狙いが出る確率 (通貨・今の狙いの数で)。分からなければ null */
  pHit?: (currency: string, h: number) => number | null;
  /** 付く MOD が決まっている物 (エッセンス) の側と、それが狙いか。無ければ付く側は運 */
  fixedAdd?: (currency: string) => { side: "prefix" | "suffix"; hit: boolean } | null;
  sets: readonly PatternSet[];
}
/**
 * 形: 狙いの側の狙い h・狙い以外 j、反対の側の前の手の狙い g (数える時だけ)・消せる狙い以外 o。
 * キーは h-j (g を数える時は h-j-g)。o はキーに入れない (来た道で変わる数。札と結果の数え方に使う)
 */
export interface Shape { h: number; j: number; g?: number; o: number }
/** 結果: 打った後の形と、その文・確率 */
export interface ShapeOut extends Shape { label: string; p: number | null }
export const shapeKey = (h: number, j: number, g?: number): string => (g == null ? `${h}-${j}` : `${h}-${j}-${g}`);
export const keyOfShape = (x: Shape): string => shapeKey(x.h, x.j, x.g);

export const GREATER = "OmenofGreaterExaltation";
export const sideOmenOf = (side: "prefix" | "suffix", kind: "exalt" | "annul" | "chaos"): string => {
  const L = side === "prefix";
  return kind === "exalt" ? (L ? "OmenofSinistralExaltation" : "OmenofDextralExaltation") : kind === "annul" ? (L ? "OmenofSinistralAnnulment" : "OmenofDextralAnnulment") : L ? "OmenofSinistralErasure" : "OmenofDextralErasure";
};
/** 呼ぶ側の (h, j) と ctx から形を作る (反対の側の消せる数は前の手の狙いと狙い以外に分ける) */
export function shapeOf(c: ShapeCtx, h: number, j: number, g?: number, o?: number): Shape {
  const gg = g ?? c.otherHits;
  return { h, j, ...(gg != null ? { g: gg } : {}), o: o ?? Math.max(0, c.otherRemovable - (gg ?? 0)) };
}

/** 付ける物 (1 つ付く) か */
const ADDS = new Set(["transmute", "augment", "regal", "alchemy", "exalt", "essence", "essence_perfect", "desecrate"]);
/** 形を変える物か (付ける・消す・入れ替える)。変えない物 (触媒・品質など) は次の手の「先に打つ物」にする */
export const changesShape = (kind: string): boolean => ADDS.has(kind) || kind === "annul" || kind === "chaos";

/**
 * 打つ物 x を形 s で打った時の結果 (同じ形はまとめ、確率は足す)。
 *   付ける物: 側のお告げがある高貴は狙いの側だけ。無ければ空いている側のどちらか (運)。狙いの側は狙い / 狙い以外
 *   消去: 側のお告げなら狙いの側から、無ければ両側の消せる物から 1 つ (同じ重み)
 *   カオス: 消去と同じ選び方で 1 つ消して、付ける物と同じ選び方で 1 つ付く
 */
export function shapeOutcomes(c: ShapeCtx, x: PatternSet, h: number | Shape, j?: number): ShapeOut[] {
  const s0: Shape = typeof h === "number" ? shapeOf(c, h, j ?? 0) : h;
  const track = s0.g != null;
  const OTHER = c.side === "prefix" ? "サフィ" : "プレ";
  const OL = c.otherLimit ?? 3, OF = c.otherFixed ?? 0;
  const out: ShapeOut[] = [];
  const push = (s: Shape, label: string, p: number | null): void => {
    if (s.h < 0 || s.j < 0 || s.h + s.j > c.limit || s.o < 0 || (s.g ?? 0) < 0) return;
    const k = keyOfShape(s);
    const y = out.find((z) => keyOfShape(z) === k);
    if (y) { y.p = y.p != null && p != null ? y.p + p : null; return; }
    out.push({ ...s, label, p });
  };
  /** 1 つ付く (sideOnly = 狙いの側だけ) */
  const adds = (s: Shape, sideOnly: boolean, pHit: number | null): Array<{ s: Shape; label: string; p: number | null }> => {
    const r: Array<{ s: Shape; label: string; p: number | null }> = [];
    const room = s.h + s.j < c.limit;
    const oroom = !sideOnly && (s.g ?? 0) + s.o + OF < OL;
    // 両方の側が空いていれば、どちらに付くかは運 (確率は出さない)
    const split = room && oroom;
    if (room) {
      r.push({ s: { ...s, h: s.h + 1 }, label: "狙いが付いた", p: split || pHit == null ? null : pHit });
      r.push({ s: { ...s, j: s.j + 1 }, label: "狙い以外が付いた", p: split || pHit == null ? null : 1 - pHit });
    }
    if (oroom) r.push({ s: { ...s, o: s.o + 1 }, label: `${OTHER}に付いた`, p: room ? null : 1 });
    return r;
  };
  /** 1 つ消える (sideOnly = 狙いの側だけ) */
  const removes = (s: Shape, sideOnly: boolean): Array<{ s: Shape; label: string; p: number; what: "h" | "j" | "g" | "o" }> => {
    const g = sideOnly ? 0 : (s.g ?? 0), o = sideOnly ? 0 : s.o;
    const n = s.h + s.j + g + o;
    if (!n) return [];
    const r: Array<{ s: Shape; label: string; p: number; what: "h" | "j" | "g" | "o" }> = [];
    if (s.j) r.push({ s: { ...s, j: s.j - 1 }, label: "狙い以外が消えた", p: s.j / n, what: "j" });
    if (s.h) r.push({ s: { ...s, h: s.h - 1 }, label: "狙いが消えた", p: s.h / n, what: "h" });
    if (g) r.push({ s: { ...s, g: g - 1 }, label: `${OTHER}の狙いが消えた`, p: g / n, what: "g" });
    if (o) r.push({ s: { ...s, o: o - 1 }, label: track ? `${OTHER}の狙い以外が消えた` : `${OTHER}の MOD (フラクチャー以外) が消えた`, p: o / n, what: "o" });
    return r;
  };
  if (x.kind === "annul" && x.omens.includes("OmenofLight")) {
    // 光のお告げ: 冒涜の MOD だけを消す (冒涜の外れを外す手。2026-10-10 MazBro の指輪の仕上げ)
    if (s0.j) push({ ...s0, j: s0.j - 1 }, "冒涜の外れが消えた", 1);
  } else if (x.kind === "annul") {
    for (const r of removes(s0, x.omens.includes(sideOmenOf(c.side, "annul")))) push(r.s, r.label, r.p);
  } else if (x.kind === "chaos") {
    for (const r of removes(s0, x.omens.includes(sideOmenOf(c.side, "chaos")))) {
      for (const a of adds(r.s, false, null)) {
        const same = keyOfShape(a.s) === keyOfShape(s0);
        const swapJ = same && r.what === "j" && a.label === "狙い以外が付いた";
        const swapO = same && r.what === "o" && a.label.endsWith("に付いた");
        push(a.s, swapJ ? "狙い以外が入れ替わった" : swapO ? `${OTHER}の MOD が入れ替わった` : `${r.label.replace(/た$/, "て")}${a.label}`, null);
      }
    }
  } else if ((x.kind === "essence" || x.kind === "essence_perfect") && c.fixedAdd?.(x.currency)) {
    // エッセンス: 付く MOD と側が決まっている。パーフェクトは先に 1 つ消える (結晶化のお告げがあればその側から)
    const fa = c.fixedAdd(x.currency)!;
    const onSide = fa.side === c.side;
    const addFixed = (s: Shape): { s: Shape; label: string } | null => {
      if (onSide) return s.h + s.j < c.limit ? { s: fa.hit ? { ...s, h: s.h + 1 } : { ...s, j: s.j + 1 }, label: fa.hit ? "狙いが付いた (エッセンス)" : "狙い以外が付いた (エッセンス)" } : null;
      return (s.g ?? 0) + s.o + OF < OL ? { s: { ...s, o: s.o + 1 }, label: `${OTHER}に付いた (エッセンス)` } : null;
    };
    if (x.kind === "essence") { const a = addFixed(s0); if (a) push(a.s, a.label, 1); }
    else {
      const crystal = (sd: "prefix" | "suffix"): string => (sd === "prefix" ? "OmenofSinistralCrystallisation" : "OmenofDextralCrystallisation");
      const other: "prefix" | "suffix" = c.side === "prefix" ? "suffix" : "prefix";
      const onlySide = x.omens.includes(crystal(c.side));
      const onlyOther = x.omens.includes(crystal(other));
      const rs = onlyOther ? removes({ ...s0, h: 0, j: 0 }, false).map((r) => ({ ...r, s: { ...r.s, h: s0.h, j: s0.j } })) : removes(s0, onlySide);
      for (const r of rs) { const a = addFixed(r.s); if (a) push(a.s, `${r.label.replace(/た$/, "て")}${a.label}`, r.p); }
    }
  } else if (ADDS.has(x.kind)) {
    // 側を決めるお告げ: 高貴は左右の高貴、骨は左右のネクロマンシー
    const sideOnly = (x.kind === "exalt" && x.omens.includes(sideOmenOf(c.side, "exalt"))) || (x.kind === "desecrate" && x.omens.includes(c.side === "prefix" ? "OmenofSinistralNecromancy" : "OmenofDextralNecromancy"));
    const ph = (hh: number): number | null => (x.kind === "exalt" ? c.pHit?.(x.currency, hh) ?? null : null);
    const k = x.kind === "exalt" && x.omens.includes(GREATER) ? 2 : 1;
    let cur: Array<{ s: Shape; label: string; p: number | null }> = [{ s: s0, label: "", p: 1 }];
    for (let n = 0; n < k; n++) {
      const next: typeof cur = [];
      for (const q of cur) {
        const a = adds(q.s, sideOnly, ph(q.s.h));
        if (!a.length) { next.push(q); continue; }
        for (const y of a) next.push({ s: y.s, label: q.label ? `${q.label}・${y.label}` : y.label, p: q.p != null && y.p != null ? q.p * y.p : null });
      }
      cur = next;
    }
    for (const q of cur) {
      if (q.s === s0) continue;
      // 偉大の 2 つが狙いの側だけなら「狙いが 2 つ / 狙い 1・狙い以外 1 / 狙い以外が 2 つ」の文に
      const dh = q.s.h - s0.h, dO = q.s.o - s0.o;
      // 2 つ付いた時だけ「2 つ」の文。空きが 1 つで 1 つしか付かない時は 1 つの文 (2026-10-10: 1 つでも「狙い以外が 2 つ」と出ていた)
      const added = dh + (q.s.j - s0.j) + dO;
      const label = k === 2 && added === 2 && dO === 0 ? (dh === 2 ? "狙いが 2 つ" : dh === 1 ? "狙い 1・狙い以外 1" : "狙い以外が 2 つ") : k === 2 && added === 1 ? `${q.label} (空きが 1 つなので 1 つだけ)` : q.label;
      push(q.s, label, q.p);
    }
  } else {
    // 付けない物 (品質・触媒など) は形が変わらない
    return [{ ...s0, label: "形は変わらない", p: 1 }];
  }
  return out;
}

/** 揃った形: 狙いが need に届き、反対の側の前の手の狙いも減っていない */
export const shapeDone = (c: ShapeCtx, s: Shape): boolean => s.h >= c.need && (s.g == null || s.g >= (c.otherHits ?? 0));
export interface ShapeVia { from: Shape | null; set: PatternSet; label: string }
/**
 * この手を打った後に来うる形 (決めた手の結果を辿って増える)。並びは来る順。揃った形は入れない。
 * via は一番近い道 (どの形で何を打って、どうなったか)
 */
export function reachableShapes(c: ShapeCtx, set: PatternSet, h0: number, j0: number, policy: Record<string, PolicyAct>): Array<Shape & { via: ShapeVia }> {
  const order: Array<Shape & { via: ShapeVia }> = [];
  const seen = new Set<string>();
  const strip = (o: ShapeOut): Shape => ({ h: o.h, j: o.j, ...(o.g != null ? { g: o.g } : {}), o: o.o });
  const queue: Array<Shape & { via: ShapeVia }> = shapeOutcomes(c, set, h0, j0).map((o) => ({ ...strip(o), via: { from: null, set, label: o.label } }));
  while (queue.length && order.length < 80) {
    const q = queue.shift()!;
    const k = keyOfShape(q);
    if (seen.has(k)) continue;
    seen.add(k);
    if (shapeDone(c, q)) continue;
    order.push(q);
    const act = policy[k];
    const x = act?.set ? setOf(c.sets, act.set) : undefined;
    const from: Shape = { h: q.h, j: q.j, ...(q.g != null ? { g: q.g } : {}), o: q.o };
    if (x) for (const o of shapeOutcomes(c, x, from)) queue.push({ ...strip(o), via: { from, set: x, label: o.label } });
  }
  return order;
}

/** まだ決めていない形の数 (全部決めるまでこの手にできない) */
export const shapesLeft = (c: ShapeCtx, set: PatternSet, h0: number, j0: number, policy: Record<string, PolicyAct>): number =>
  reachableShapes(c, set, h0, j0, policy).filter((r) => !policy[keyOfShape(r)]).length;
