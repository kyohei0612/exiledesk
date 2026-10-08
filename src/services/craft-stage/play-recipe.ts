/**
 * play-recipe.ts — 打って作るレシピの型 (ADR-002、2026-10-09)。
 *
 * オーナー 2026-10-09「手打ちみたいな挙動にしたらいい」「自分で選択できるところは MOD をここで付けるかどうか。付けなかったら 1 手進むだけ、
 * 付けるならハズレ・当たりの挙動をして、そこからはパターンを全て打って決める」「型だけしっかり作って後から UI。イメージは完全に手打ちの UI」。
 *
 * レシピ = 手 (PlayMove) の並び。手は 3 つだけ:
 *   use    … 打つ物 (カレンシー + お告げ。PatternSet.key)
 *   aim    … 狙い。無ければ「打つだけ」(打って 1 手進む)。あれば当たり・外れがあり、狙いが揃うまでこの手が続く
 *   shapes … 狙いの側の形 (狙い h・狙い以外 j) ごとの次の手。打った結果の形を全部決めるまで完成にしない
 * 前の型 (PatternStep) の onMiss / miss / otherGone / otherJunk / on / policy / resetTo は、全部「形ごとの次の手」で表す。
 * 計算は今のエンジン (recipe-sim の runPattern) に変換して回す (compilePlay)。
 */
import type { PatternSet } from "./pattern";
import type { CompiledStep, RecipeTarget } from "./recipe-sim";
import { keyOfShape, reachableShapes, setOf, type ShapeCtx } from "./shape-table";

/** 狙い: この中のどれかが need 個 (同じ側)。tier は MOD ごとの下限 (minTierIndex) */
export interface PlayAim {
  mods: Array<{ modId: string; minTierIndex: number }>;
  /**
   * この中から揃える数。前の手で同じ狙いから付いた分も入れた合計 (トリフラ: カオスの手 = 1、偉大の手 = 3)。
   * 計算は「この中の違う MOD が need 個付いたら揃った」
   */
  need: number;
  side: "prefix" | "suffix";
}
/** 形での次の手 */
export type PlayDecision =
  /** この形でこれを打つ (結果はまた形で見る) */
  | { use: string }
  /** 次の手へ (狙いが揃っていなくても進む) */
  | { go: "next" }
  /** 新しいベースで最初から */
  | { go: "start" }
  /** N 手目へ (0 始まり)。strip があれば先に固定以外を strip 個まで素の消去で減らす (1 MOD 残し消去 = strip 1) */
  | { go: "move"; to: number; strip?: number };
export interface PlayMove {
  use: string;
  aim: PlayAim | null;
  /** 形のキー (shape-table の shapeKey) → 次の手。aim がある手だけ */
  shapes?: Record<string, PlayDecision>;
}
export interface PlayRecipe {
  v: 2;
  moves: PlayMove[];
}

/** 手の狙いを計算の狙いにする (どれか N つ = 本体 + alts、need) */
export function aimTarget(aim: PlayAim, method: RecipeTarget["method"] = "exalt"): RecipeTarget {
  const [first, ...rest] = aim.mods;
  return { modId: first!.modId, minTierIndex: first!.minTierIndex, method, ...(rest.length ? { alts: rest } : {}), need: aim.need };
}

/**
 * 形の数え方のもと。狙いの側の狙いの数 h には、前の手で付いた狙い (同じ側) も入る。
 * h0 = この手の前に揃っているはずの数: 同じ側の前の手のうち、この手と同じ狙い (MOD が重なる) は need の一番大きい物、別の狙いは need の合計。
 * 揃える数 = 別の狙いの合計 + この手の need
 */
export function moveShapeCtx(recipe: PlayRecipe, i: number, sets: readonly PatternSet[], limit: number, otherRemovable: number, pHit?: ShapeCtx["pHit"]): { ctx: ShapeCtx; h0: number } | null {
  const m = recipe.moves[i];
  if (!m?.aim) return null;
  const side = m.aim.side;
  const mine = new Set(m.aim.mods.map((x) => x.modId));
  let others = 0, same = 0;
  for (const p of recipe.moves.slice(0, i)) {
    if (!p.aim || p.aim.side !== side) continue;
    if (p.aim.mods.some((x) => mine.has(x.modId))) same = Math.max(same, p.aim.need);
    else others += p.aim.need;
  }
  return { ctx: { side, limit, need: Math.min(limit, others + m.aim.need), otherRemovable, pHit, sets }, h0: Math.min(limit, others + same) };
}

/** i 手目より前に、その側で揃っているはずの狙いの数 (同じ狙いは need の一番大きい物、別の狙いは合計) */
export function sideNeedBefore(recipe: PlayRecipe, i: number, side: "prefix" | "suffix"): number {
  const best = new Map<string, number>();
  for (const p of recipe.moves.slice(0, i)) {
    if (!p.aim || p.aim.side !== side) continue;
    const k = p.aim.mods.map((x) => x.modId).sort().join(",");
    best.set(k, Math.max(best.get(k) ?? 0, p.aim.need));
  }
  return [...best.values()].reduce((a, b) => a + b, 0);
}
/** まだ決めていない形の数 (手ごと)。全部 0 でレシピは完成 */
export function playLeft(recipe: PlayRecipe, sets: readonly PatternSet[], limit: number, otherRemovable: number): number[] {
  return recipe.moves.map((m, i) => {
    const c = moveShapeCtx(recipe, i, sets, limit, otherRemovable);
    const x = setOf(sets, m.use);
    if (!c || !x) return 0;
    const pol = Object.fromEntries(Object.entries(m.shapes ?? {}).map(([k, d]) => [k, "use" in d ? { set: d.use } : { then: "next" as const }]));
    return reachableShapes(c.ctx, x, c.h0, 0, pol).filter((r) => !m.shapes?.[keyOfShape(r)]).length;
  });
}

/** 計算の手にする (recipe-sim の runPattern で回す)。打つ物の無い手は null を返す (呼ぶ側で止める) */
export function compilePlay(recipe: PlayRecipe, sets: readonly PatternSet[]): CompiledStep[] | null {
  const out: CompiledStep[] = [];
  for (const [i, m] of recipe.moves.entries()) {
    // 反対の側に前の手の狙いがあれば、その数 (減ったら揃っていても形の手で決める。画面の形のキー h-j-g と同じ)
    const other = m.aim ? (m.aim.side === "prefix" ? "suffix" : "prefix") : null;
    const gNeed = other ? sideNeedBefore(recipe, i, other) : 0;
    const x = setOf(sets, m.use);
    if (!x) return null;
    const policy: NonNullable<CompiledStep["policy"]> = {};
    for (const [k, d] of Object.entries(m.shapes ?? {})) {
      if ("use" in d) {
        const y = setOf(sets, d.use);
        if (!y) return null;
        policy[k] = { act: { kind: y.kind, currency: y.currency, omens: [...y.omens] } };
      } else if (d.go === "next") policy[k] = { then: "next" };
      else if (d.go === "start") policy[k] = { then: "restart" };
      else policy[k] = d.strip != null ? { then: "reset", goto: d.to, keep: d.strip } : { then: "goto", goto: d.to };
    }
    out.push({
      kind: x.kind, currency: x.currency, omens: [...x.omens],
      target: m.aim ? aimTarget(m.aim, x.kind === "chaos" ? "chaos" : "exalt") : null,
      // 形を全部決めた手は形の手で動く。決めていない形に来たら (UI で止めるので普通は来ない) 新しいベースで最初から
      onMiss: m.aim ? "restart" : "next",
      play: true,
      ...(gNeed > 0 ? { gNeed } : {}),
      ...(Object.keys(policy).length ? { policy } : {}),
    });
  }
  return out;
}
