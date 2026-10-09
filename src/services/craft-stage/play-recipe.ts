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
  /**
   * any = プレ・サフィどちらでも (2026-10-10 MazBro の指輪「T1 の最大マナ量・マナ回復・レアリティ・全耐性のどれか」)。
   * 外れの形は決めず、カオスは消去で外れを 1 つまで減らして続ける (動画の「annul down to one affix, chaos spam」)。
   * 高貴 (2026-10-09 から) は空きがある間は打ち続け、どの側も埋まったら外れのある側を消してから打つ。当たった側で道が分かれる (branch)
   */
  side: "prefix" | "suffix" | "any";
}
/** 形での次の手 */
export type PlayDecision =
  /** この形でこれを打つ (結果はまた形で見る) */
  | { use: string; pre?: string[] }
  /** 次の手へ (狙いが揃っていなくても進む) */
  | { go: "next" }
  /** 新しいベースで最初から */
  | { go: "start" }
  /** N 手目へ (0 始まり)。strip があれば先に固定以外を strip 個まで素の消去で減らす (1 MOD 残し消去 = strip 1) */
  | { go: "move"; to: number; strip?: number; auto?: boolean };
export interface PlayMove {
  use: string;
  aim: PlayAim | null;
  /** 形のキー (shape-table の shapeKey) → 次の手。aim がある手だけ */
  shapes?: Record<string, PlayDecision>;
  /** この手が揃った後の行き先 (無ければ次の手)。"end" = 完成の確かめ (揃っていなければ新しいベースで最初から) */
  next?: number | "end";
  /** 両側の狙い (side any) が当たった側で分ける行き先。無ければ next */
  branch?: { prefix: number | "end"; suffix: number | "end" };
}
export interface PlayRecipe {
  v: 2;
  moves: PlayMove[];
}

/** k 手目が揃った後に行ける手 (行き先が無ければ次の手)。"end" は recipe.moves.length */
export function nextsOf(recipe: PlayRecipe, k: number): Array<{ to: number; side?: "prefix" | "suffix" }> {
  const m = recipe.moves[k];
  const n = recipe.moves.length;
  const at = (x: number | "end" | undefined): number => (x === "end" ? n : x ?? k + 1);
  if (m?.branch) return [{ to: at(m.branch.prefix), side: "prefix" }, { to: at(m.branch.suffix), side: "suffix" }];
  return [{ to: at(m?.next) }];
}
/**
 * i 手目までの道 (始めから i 手目の前まで、通る手の番号と、両側の狙いが当たった側)。行き先で分かれる時は i に着く方。
 * 着けなければ並びの通り (0..i-1)
 */
export function pathTo(recipe: PlayRecipe, i: number): Array<{ k: number; side?: "prefix" | "suffix" }> {
  const seen = new Set<number>();
  const q: Array<{ at: number; path: Array<{ k: number; side?: "prefix" | "suffix" }> }> = [{ at: 0, path: [] }];
  while (q.length) {
    const c = q.shift()!;
    if (c.at === i) return c.path;
    if (c.at >= recipe.moves.length || seen.has(c.at)) continue;
    seen.add(c.at);
    for (const nx of nextsOf(recipe, c.at)) q.push({ at: nx.to, path: [...c.path, { k: c.at, ...(nx.side ? { side: nx.side } : {}) }] });
  }
  return recipe.moves.slice(0, i).map((_, k) => ({ k }));
}
/**
 * i 手目より前に道で通る手。両側の狙いの手は、道で当たった側の狙いとして数える
 * (プレのどれかの道なら、カオスで付いた最大マナ量はプレの狙い 1 つ。2026-10-10 MazBro の指輪で画面の形と計算の形がずれた)
 */
const before = (recipe: PlayRecipe, i: number): PlayMove[] => pathTo(recipe, i).map((x) => {
  const m = recipe.moves[x.k]!;
  return m.aim?.side === "any" && x.side ? { ...m, aim: { ...m.aim, side: x.side } } : m;
});

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
  if (!m?.aim || m.aim.side === "any") return null;
  const side = m.aim.side;
  const mine = new Set(m.aim.mods.map((x) => x.modId));
  let others = 0, same = 0;
  for (const p of before(recipe, i)) {
    if (!p.aim || p.aim.side !== side) continue;
    if (p.aim.mods.some((x) => mine.has(x.modId))) same = Math.max(same, p.aim.need);
    else others += p.aim.need;
  }
  return { ctx: { side, limit, need: Math.min(limit, others + m.aim.need), otherRemovable, pHit, sets }, h0: Math.min(limit, others + same) };
}

/** i 手目より前に、その側で揃っているはずの狙いの数 (同じ狙いは need の一番大きい物、別の狙いは合計) */
export function sideNeedBefore(recipe: PlayRecipe, i: number, side: "prefix" | "suffix"): number {
  const best = new Map<string, number>();
  // 両側の狙い (カオスの途中) は数えない: 反対の側に残っているはずの数は、側を決めて付けた狙いだけ
  for (const p of pathTo(recipe, i).map((x) => recipe.moves[x.k]!)) {
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
    const other = m.aim && m.aim.side !== "any" ? (m.aim.side === "prefix" ? "suffix" : "prefix") : null;
    const gNeed = other ? sideNeedBefore(recipe, i, other) : 0;
    const x = setOf(sets, m.use);
    if (!x) return null;
    const policy: NonNullable<CompiledStep["policy"]> = {};
    for (const [k, d] of Object.entries(m.shapes ?? {})) {
      if ("use" in d) {
        const y = setOf(sets, d.use);
        if (!y) return null;
        const pre = (d.pre ?? []).flatMap((u) => { const z = setOf(sets, u); return z ? [{ currency: z.currency, omens: [...z.omens] }] : []; });
        policy[k] = { act: { kind: y.kind, currency: y.currency, omens: [...y.omens] }, ...(pre.length ? { pre } : {}) };
      } else if (d.go === "next") policy[k] = { then: "next" };
      else if (d.go === "start") policy[k] = { then: "restart" };
      else policy[k] = d.strip != null ? { then: "reset", goto: d.to, keep: d.strip } : { then: "goto", goto: d.to };
    }
    out.push({
      kind: x.kind, currency: x.currency, omens: [...x.omens],
      target: m.aim ? aimTarget(m.aim, x.kind === "chaos" ? "chaos" : "exalt") : null,
      // 形を全部決めた手は形の手で動く。決めていない形に来たら (UI で止めるので普通は来ない) 新しいベースで最初から
      // 両側のカオスは外れたらそのままもう一度 (打つ前に外れを 1 つまで消す)
      onMiss: m.aim?.side === "any" ? "redo" : m.aim ? "restart" : "next",
      play: true,
      ...(gNeed > 0 ? { gNeed } : {}),
      // 打つ前に外れを 1 つまで消す (annul down to one affix) のはカオスだけ。両側の高貴は空きが無くなった時だけ消す (recipe-sim)
      ...(m.aim?.side === "any" && x.kind === "chaos" ? { spam: true } : {}),
      ...(m.branch ? { branch: { prefix: m.branch.prefix === "end" ? recipe.moves.length : m.branch.prefix, suffix: m.branch.suffix === "end" ? recipe.moves.length : m.branch.suffix } } : {}),
      ...(m.next != null ? { next: m.next === "end" ? recipe.moves.length : m.next } : {}),
      ...(Object.keys(policy).length ? { policy } : {}),
    });
  }
  return out;
}
