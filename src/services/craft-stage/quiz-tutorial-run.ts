/**
 * quiz-tutorial-run.ts — チュートリアル (quiz-tutorials.ts) を 1 手ずつ進める (2026-10-16)。
 *
 * 今のアイテムに当たる答え (ruleFor) が正解。選択肢は正解 + その答えの外れ 2 つ (decoys) の 3 択 (2026-10-16 オーナー「○○をするには? の 3 択で明確に ○×」)。
 * 一度正解した答えと同じ答えになる状況は聞かずに自動で打つ (カオスや消去の繰り返しを何十回も聞かない)。
 * 打ち方はシミュレーターと同じ applyQuizAction・乱数も 1 本 (同じ種なら同じ結果)。画面の状態は持たない (StageTutorial.vue が持つ)
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import type { StageItem, StageMod } from "./types";
import { applyQuizAction, buyStart, revealWanted, routeDone, routeOf, ruleFor, situationOf, type QuizAction, type Situation } from "./quiz-recipe";
import { applyCurrency } from "./apply-currency";
import { revealOffers } from "./apply-desecrate";
import type { JaEn, QuizTutorial, TutorialRule } from "./quiz-tutorials";
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
  data: PatchData;
  /** 発現の問いを出している間の候補 (同じ問いを描き直しても乱数を引き直さない) */
  pending: { rule: number; rs: number } | null;
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
/** 選択肢 1 つ (正解か、外れとその理由)。pick = 発現の候補 (key は reveal:n / reveal:n:reroll) */
export interface TutorialChoice { do: QuizAction; right: boolean; why?: JaEn; pick?: { key: string; mod: StageMod } }
export interface TutorialQuestion {
  rule: number;
  situation: Situation;
  /** 3 択 (並びは種で混ぜる)。right が 1 つ (発現の「どれを選ぶ?」は当たる候補が全部 right) */
  choices: TutorialChoice[];
  /** 発現の「どれを選ぶ?」(2026-10-17 オーナー「未発現の MOD をクイズに出さなくていい、どれを選ぶ? で選ばせたら」)。
   * rerolled = 最初の 3 つに狙いが無く、アビスの反響で引き直した 3 つ。none = どれも狙いではない (どれを選んでも後で消す) */
  reveal?: { rerolled: boolean; none: boolean };
}

const rulesOf = (t: QuizTutorial): TutorialRule[] => t.recipe.routes[0]!.rules as TutorialRule[];

export function startTutorial(data: PatchData, tut: QuizTutorial, seed = tut.seed): TutorialState {
  const g = mulberry32(seed);
  return { tut, data, pending: null, item: buyStart(data, tut.recipe, g), g, seed, steps: 0, bases: 1, uses: {}, answered: new Set(), log: [], done: false, stop: null };
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
  const tr = r as TutorialRule;
  if ("reveal" in tr.do) return revealQuestion(st, right, sit, tr.do.reveal.echoes);
  const opts: TutorialChoice[] = [{ do: tr.do, right: true }, ...tr.decoys.map((x) => ({ do: x.do, right: false, why: x.why }))];
  const pick = mulberry32(st.seed * 31 + st.steps);
  const choices = opts.map((o) => [pick(), o] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  return { rule: right, situation: sit, choices };
}

/** 発現の「どれを選ぶ?」: 出た候補をそのまま選択肢に。最初の 3 つに狙いが無く反響のお告げがあれば、引き直した 3 つ */
function revealQuestion(st: TutorialState, rule: number, sit: Situation, echoes: boolean): TutorialQuestion {
  if (st.pending?.rule !== rule) st.pending = { rule, rs: Math.floor(st.g() * 2 ** 31) };
  const route = routeOf(st.tut.recipe, st.item);
  const offers = revealOffers(st.data, st.item, mulberry32(st.pending.rs));
  const ok = revealWanted(st.item, route.goal);
  const rerolled = echoes && !offers.first.some(ok) && offers.reroll.length > 0;
  const list = rerolled ? offers.reroll : offers.first;
  const none = !list.some(ok);
  const choices: TutorialChoice[] = list.map((m, i) => ({
    do: { reveal: { echoes } }, right: none || ok(m),
    ...(none || ok(m) ? {} : { why: ["完成の形に無い MOD。狙いの MOD を選ぶ", "Not in the Goal. Pick the target mod"] as JaEn }),
    pick: { key: `reveal:${i + 1}${rerolled ? ":reroll" : ""}`, mod: m },
  }));
  return { rule, situation: sit, choices, reveal: { rerolled, none } };
}

/** 発現の候補を選んで打つ (問いを出した時の種で) */
export function playPick(st: TutorialState, rule: number, key: string): TutorialEntry | null {
  const rs = st.pending?.rule === rule ? st.pending.rs : Math.floor(st.g() * 2 ** 31);
  const omens = key.endsWith(":reroll") ? ["OmenofAbyssalEchoes"] : [];
  const x = applyCurrency(st.data, st.item, key, mulberry32(rs), omens);
  st.pending = null;
  if (!x.applied) { st.stop = x.reason ?? "blocked"; return null; }
  st.steps++;
  st.answered.add(rule);
  for (const o of x.omensUsed ?? omens) st.uses[o] = (st.uses[o] ?? 0) + 1;
  st.item = x.item;
  const e: TutorialEntry = { rule, key, omens, auto: false, added: x.added, removed: x.removed };
  st.log.push(e);
  return e;
}
/** 選んだ選択肢を打つ (正解の時だけ呼ぶ) */
export function playChoice(data: PatchData, st: TutorialState, q: TutorialQuestion, c: TutorialChoice): TutorialEntry | null {
  return c.pick ? playPick(st, q.rule, c.pick.key) : playRule(data, st, q.rule, false);
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
    if (!q || !st.answered.has(q.rule) || q.reveal) break;
    if (!playRule(data, st, q.rule, true)) break;
  }
  if (n >= max && !st.done) st.stop = "cap";
  return n;
}
