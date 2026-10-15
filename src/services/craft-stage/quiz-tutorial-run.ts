/**
 * quiz-tutorial-run.ts — チュートリアル (quiz-tutorials.ts) を 1 手ずつ進める (2026-10-16)。
 *
 * 今のアイテムに当たる答え (ruleFor) が正解。選択肢は正解 + 同じレシピのほかの答え (最大 4 つ、種で並べ替え)。
 * 一度正解した答えと同じ答えになる状況は聞かずに自動で打つ (カオスや消去の繰り返しを何十回も聞かない)。
 * 打ち方はシミュレーターと同じ applyQuizAction・乱数も 1 本 (同じ種なら同じ結果)。画面の状態は持たない (StageTutorial.vue が持つ)
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import type { StageItem, StageMod } from "./types";
import { applyQuizAction, buyStart, routeDone, routeOf, ruleFor, situationOf, type QuizAction, type Situation } from "./quiz-recipe";
import type { QuizTutorial, TutorialRule } from "./quiz-tutorials";
import { mulberry32 } from "../htc/rng";

export interface TutorialEntry {
  /** 打った答え (チュートリアルの答えの番号) */
  rule: number;
  /** 打った物のキー (発現は reveal:n、買い直しは restart) */
  key: string;
  omens: string[];
  /** 聞かずに自動で打った */
  auto: boolean;
  added: StageMod[];
  removed: StageMod[];
}
export interface TutorialState {
  tut: QuizTutorial;
  item: StageItem;
  g: () => number;
  seed: number;
  /** 打った手の数 (弾かれた手は数えない) */
  steps: number;
  bases: number;
  /** 打った物 (カレンシー・お告げのキー → 数) */
  uses: Record<string, number>;
  /** 正解した答えの番号 */
  answered: Set<number>;
  log: TutorialEntry[];
  done: boolean;
  /** 止まった理由 (答えが無い・打てない・手の上限) */
  stop: string | null;
}
export interface TutorialQuestion {
  rule: number;
  situation: Situation;
  /** 選択肢 (答えの番号)。正解は rule */
  choices: number[];
}

const rulesOf = (t: QuizTutorial): TutorialRule[] => t.recipe.routes[0]!.rules as TutorialRule[];
/** 答えの手の中身 (同じ手の答えは選択肢で 1 つにまとめる) */
const actionKey = (a: QuizAction): string => ("restart" in a ? "restart" : "reveal" in a ? `reveal:${a.reveal.echoes}` : `${a.use}+${[...(a.omens ?? [])].sort().join(",")}`);

export function startTutorial(data: PatchData, tut: QuizTutorial, seed = tut.seed): TutorialState {
  const g = mulberry32(seed);
  return { tut, item: buyStart(data, tut.recipe, g), g, seed, steps: 0, bases: 1, uses: {}, answered: new Set(), log: [], done: false, stop: null };
}

/** 今の状況の問題 (完成・止まった時は null) */
export function questionOf(st: TutorialState): TutorialQuestion | null {
  if (st.done || st.stop) return null;
  const route = routeOf(st.tut.recipe, st.item);
  const sit = situationOf(st.item, route.goal);
  if (routeDone(route, sit)) { st.done = true; return null; }
  const rules = rulesOf(st.tut);
  const r = ruleFor(rules, sit);
  if (!r) { st.stop = "unanswered"; return null; }
  const right = rules.indexOf(r as TutorialRule);
  // ほかの答え (手の中身が正解と違う物、同じ手は 1 つ)。種と手の数で並べ替えて 3 つまで
  const seen = new Set([actionKey(r.do)]);
  const others: number[] = [];
  rules.forEach((x, i) => { const k = actionKey(x.do); if (!seen.has(k)) { seen.add(k); others.push(i); } });
  const pick = mulberry32(st.seed * 31 + st.steps);
  const shuffled = others.map((i) => [pick(), i] as const).sort((a, b) => a[0] - b[0]).slice(0, 3).map((x) => x[1]);
  const choices = [...shuffled, right].map((i) => [pick(), i] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  return { rule: right, situation: sit, choices };
}

/** 正解の手を 1 つ打つ (当たり所で弾かれた手は数えずに打ち直す)。打てなければ stop に理由 */
export function playRule(data: PatchData, st: TutorialState, rule: number, auto: boolean): TutorialEntry | null {
  const r = rulesOf(st.tut)[rule]!;
  const route = routeOf(st.tut.recipe, st.item);
  for (let k = 0; k < 50; k++) {
    const x = applyQuizAction(data, route, st.item, r.do, st.g);
    if (x.kind === "random") continue;
    if (x.kind === "blocked") { st.stop = x.reason ?? "blocked"; return null; }
    st.steps++;
    if (!auto) st.answered.add(rule);
    if (x.kind === "restart") {
      st.bases++;
      const removed = [...st.item.prefixes, ...st.item.suffixes];
      st.item = buyStart(data, st.tut.recipe, st.g);
      const e: TutorialEntry = { rule, key: "restart", omens: [], auto, added: [...st.item.prefixes, ...st.item.suffixes], removed };
      st.log.push(e);
      return e;
    }
    for (const s of x.spent) st.uses[s] = (st.uses[s] ?? 0) + 1;
    st.item = x.item;
    const e: TutorialEntry = { rule, key: x.key, omens: x.omens, auto, added: x.added, removed: x.removed };
    st.log.push(e);
    return e;
  }
  st.stop = "random";
  return null;
}

/** 正解した答えと同じ答えになる間は聞かずに打つ。打った数を返す (max で止める) */
export function autoAdvance(data: PatchData, st: TutorialState, max = 3000): number {
  let n = 0;
  for (; n < max; n++) {
    const q = questionOf(st);
    if (!q || !st.answered.has(q.rule)) break;
    if (!playRule(data, st, q.rule, true)) break;
  }
  if (n >= max && !st.done) st.stop = "cap";
  return n;
}
