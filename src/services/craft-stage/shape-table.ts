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
  /** 側の枠 (3) */
  limit: number;
  /** この側で揃える狙いの数 (揃ったらこの手は終わり) */
  need: number;
  /** 反対の側の消せる MOD の数 (固定は消えない)。0 なら素の消去も必ず狙いの側に刺さる */
  otherRemovable: number;
  /** 高貴で 1 つ付けた時に狙いが出る確率 (通貨・今の狙いの数で)。分からなければ null */
  pHit?: (currency: string, h: number) => number | null;
  sets: readonly PatternSet[];
}
export interface ShapeOut { label: string; h: number; j: number; p: number | null }
export const shapeKey = (h: number, j: number): string => `${h}-${j}`;

export const GREATER = "OmenofGreaterExaltation";
export const sideOmenOf = (side: "prefix" | "suffix", kind: "exalt" | "annul" | "chaos"): string => {
  const L = side === "prefix";
  return kind === "exalt" ? (L ? "OmenofSinistralExaltation" : "OmenofDextralExaltation") : kind === "annul" ? (L ? "OmenofSinistralAnnulment" : "OmenofDextralAnnulment") : L ? "OmenofSinistralErasure" : "OmenofDextralErasure";
};

/** 打つ物 x を (h, j) で打った時の、狙いの側の結果 (同じ形はまとめ、確率は足す)。反対の側の出来事は狙いの側の形で表す */
export function shapeOutcomes(c: ShapeCtx, x: PatternSet, h: number, j: number): ShapeOut[] {
  const f = c.limit - h - j;
  const out: ShapeOut[] = [];
  const push = (label: string, h2: number, j2: number, p: number | null): void => {
    const o = out.find((y) => y.h === h2 && y.j === j2);
    if (o) { o.p = o.p != null && p != null ? o.p + p : null; return; }
    out.push({ label, h: h2, j: j2, p });
  };
  if (x.kind === "exalt") {
    if (f <= 0) return [];
    const k = Math.min(x.omens.includes(GREATER) ? 2 : 1, f);
    const ph = (hh: number): number | null => c.pHit?.(x.currency, hh) ?? null;
    if (k === 1) {
      const p = ph(h);
      push("狙いが付いた", h + 1, j, p);
      push("狙い以外が付いた", h, j + 1, p != null ? 1 - p : null);
    } else {
      const p1 = ph(h), p2 = ph(h + 1);
      const ok = p1 != null && p2 != null;
      push("狙いが 2 つ", h + 2, j, ok ? p1 * p2 : null);
      push("狙い 1・狙い以外 1", h + 1, j + 1, ok ? p1 * (1 - p2) + (1 - p1) * p1 : null);
      push("狙い以外が 2 つ", h, j + 2, ok ? (1 - p1) * (1 - p1) : null);
    }
  } else if (x.kind === "annul") {
    if (h + j === 0) return [];
    // 側のお告げなら側の中から 1 つ。素の消去は反対の側の消せる物も合わせた中から 1 つ (反対の側が固定だけなら側と同じ)
    const o = x.omens.includes(sideOmenOf(c.side, "annul")) ? 0 : c.otherRemovable;
    const n = h + j + o;
    if (j > 0) push("狙い以外が消えた", h, j - 1, j / n);
    if (h > 0) push("狙いが消えた", h - 1, j, h / n);
    if (o > 0) push(`反対の側 (${c.side === "prefix" ? "サフィ" : "プレ"}) が消えた`, h, j, o / n);
  } else if (x.kind !== "chaos") {
    // 付ける物 (変成・増強・王者・錬金・エッセンス・骨・フラクチャー…) は 1 つ付く目安。付けない物 (品質・触媒など) は形が変わらない
    const adds = ["transmute", "augment", "regal", "alchemy", "essence", "essence_perfect", "desecrate"].includes(x.kind);
    if (!adds) return [{ label: "形は変わらない", h, j, p: 1 }];
    if (f <= 0) return [];
    push("狙いが付いた", h + 1, j, null);
    push("狙い以外が付いた", h, j + 1, null);
  } else {
    if (h + j + c.otherRemovable === 0) return [];
    // 1 つ消して 1 つ付く (付く物は重みでランダムなので確率は出さない)。狙いの側が変わる形だけ
    const rem: Array<[number, number, string]> = [];
    if (j > 0) rem.push([0, -1, "狙い以外"]);
    if (h > 0) rem.push([-1, 0, "狙い"]);
    for (const [dh, dj, gone] of rem) for (const [ah, aj, got] of [[1, 0, "狙い"], [0, 1, "狙い以外"]] as const) {
      const h2 = h + dh + ah, j2 = j + dj + aj;
      // 狙い以外が別の狙い以外に入れ替わった時も形は同じだが、外れとして次の手を決める (カオスのスパムでもう一度打つ、など)
      push(h2 === h && j2 === j ? `${gone}が入れ替わった` : `${gone}が消えて${got}が付いた`, h2, j2, null);
    }
    // 付いたのが反対の側 (狙いの側は 1 つ減る)
    for (const [dh, dj, gone] of rem) push(`${gone}が消えた`, h + dh, j + dj, null);
    // お告げ無しは反対の側から消えて、狙いの側に付くこともある
    if (!x.omens.includes(sideOmenOf(c.side, "chaos")) && c.otherRemovable > 0) {
      if (h + j < c.limit) { push("狙いが付いた", h + 1, j, null); push("狙い以外が付いた", h, j + 1, null); }
      push(`反対の側 (${c.side === "prefix" ? "サフィ" : "プレ"}) が入れ替わった`, h, j, null);
    }
  }
  return out.filter((o) => o.h + o.j <= c.limit && o.h >= 0 && o.j >= 0);
}

/**
 * この手を打った後に来うる形 (決めた手の結果を辿って増える)。並びは来る順。揃った形は入れない。
 * 打つ前の形は入らない (この手 = set の結果から)
 */
export function reachableShapes(c: ShapeCtx, set: PatternSet, h0: number, j0: number, policy: Record<string, PolicyAct>): Array<{ h: number; j: number }> {
  const order: Array<{ h: number; j: number }> = [];
  const seen = new Set<string>();
  const queue: Array<[number, number]> = shapeOutcomes(c, set, h0, j0).map((o) => [o.h, o.j]);
  while (queue.length && order.length < 60) {
    const [h, j] = queue.shift()!;
    const k = shapeKey(h, j);
    if (seen.has(k)) continue;
    seen.add(k);
    if (h >= c.need) continue;
    order.push({ h, j });
    const act = policy[k];
    const x = act?.set ? setOf(c.sets, act.set) : undefined;
    if (x) for (const o of shapeOutcomes(c, x, h, j)) queue.push([o.h, o.j]);
  }
  return order;
}

/** まだ決めていない形の数 (全部決めるまでこの手にできない) */
export const shapesLeft = (c: ShapeCtx, set: PatternSet, h0: number, j0: number, policy: Record<string, PolicyAct>): number =>
  reachableShapes(c, set, h0, j0, policy).filter((r) => !policy[shapeKey(r.h, r.j)]).length;
