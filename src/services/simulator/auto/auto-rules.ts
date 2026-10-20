/**
 * auto-rules.ts — 計算の最善手 (orderDetail の見えている形ごとの手) を ⑤ の答えに書く (解析君、2026-10-20 K2・設計 simulator/notes/2026-10-20-auto-flow-design.md の 3-1)。
 *
 *   rulesFromDetail: 見えている形 → ⑤ の状況の条件 (When) と答え。同じ条件になる形が 2 つ以上なら mc で通った回数の多い物
 *   methodsFromDetail: 札ごとに mc で打った付ける手の多い方 (高貴系 / カオス系) = ② の付け方
 *   answerFor: ⑥ で答えの無かった状況 → 計算の形に落として方策の手 (段が低いまま付いた札は外れに数える)
 * 画面の側で使う (recipe は quizFromSim の物)。エンジンのデータは読まない
 */
import type { QuizRules } from "../quiz-build";
import type { QuizAction, QuizRecipe, QuizRule, Situation, When } from "../quiz-recipe";
import type { AutoModel } from "./auto-types";
import { quizActionOf, Shape, type State } from "./auto-actions";
import type { OrderDetail, SolveOpts } from "./auto-types";
import { orderDetail } from "./auto-solve";

/** 条件に書く項目 (札の id のほか) */
const SIDE_KEYS = ["p.junk", "s.junk", "p.hid", "s.hid", "p.bad", "s.bad", "des"] as const;

/** 見えている形 → ⑤ の状況の条件。冒涜の印: 1・2 プレの未発現 / 3・4 サフィの未発現 / 5・6 外れの冒涜 / 7+k 札 k を冒涜で取った */
export function whenOf(m: AutoModel, fracId: string, aug: number, s: State): When {
  const K = m.slots.length, d = s[3 + K]!;
  const w: When = { aug, [fracId]: 3, "p.junk": s[1 + K]!, "s.junk": s[2 + K]!, "p.hid": d === 1 || d === 2 ? 1 : 0, "s.hid": d === 3 || d === 4 ? 1 : 0, "p.bad": d === 5 ? 1 : 0, "s.bad": d === 6 ? 1 : 0, des: d ? 1 : 0 };
  m.slots.forEach((sl, k) => { const x = s[1 + k]!; w[sl.id] = x > sl.members.length ? 2 : x > 0 ? 1 : 0; });
  return w;
}
const startRunes = (r: QuizRecipe): string[] => ("runes" in r.start ? r.start.runes ?? [] : []);
const keyOf = (w: When): string => JSON.stringify(w);
const doOf = (m: AutoModel, act: string): QuizAction => (act === "restart" ? { restart: true } : quizActionOf(m, act));

interface Table { fracId: string; aug: number; best: Map<string, { when: When; act: string; visits: number }> }
const routeIn = (recipe: QuizRecipe, id: string) => recipe.routes.find((r) => r.id === id) ?? recipe.routes[0]!;
function tableOf(m: AutoModel, det: OrderDetail, recipe: QuizRecipe, routeId = "main"): Table {
  const fracId = routeIn(recipe, routeId).goal.find((s) => s.kind === "fractured")!.id;
  const aug = (startRunes(recipe).length) + missingRunes(m, recipe).length;
  const best = new Map<string, { when: When; act: string; visits: number }>();
  for (const v of det.view) {
    const when = whenOf(m, fracId, aug, v.s);
    const k = keyOf(when), e = best.get(k);
    if (e && e.visits >= v.visits) continue;
    best.set(k, { when, act: v.act, visits: v.visits });
  }
  // 発現で段の足りない狙いの MOD が出た時、計算は「外れの冒涜」(p.bad / s.bad) に数えるが、⑤ は「札が段の足りない状態 (1)・冒涜あり」に見える。
  // 外れの冒涜の形の答えを、その側の空いた札が 1 の見え方にも書く。同じ条件の形が既にあれば通った回数の多い方
  // (「札を冒涜で取った + 別の札が普通に段の低い」形も同じ条件になる。めったに通らないその形の手 (消去) が勝ち、靴の発現の後に消去でドッジを失っていた。K2c)
  for (const { when, act, visits } of [...best.values()]) {
    for (const [bad, side, junk] of [["p.bad", 0, "p.junk"], ["s.bad", 1, "s.junk"]] as const) {
      if (when[bad] !== 1) continue;
      m.slots.forEach((sl) => {
        if (sl.side !== side || when[sl.id] !== 0) return;
        const w = { ...when, [bad]: 0, [junk]: (when[junk] as number) - 1, [sl.id]: 1 };
        const k = keyOf(w), e = best.get(k);
        if (!e || e.visits < visits) best.set(k, { when: w, act, visits });
      });
    }
  }
  return { fracId, aug, best };
}
/** 狙いに要るのに始めに差していないルーン (⑤ の最初に差す) */
function missingRunes(m: AutoModel, recipe: QuizRecipe): string[] {
  const have = new Set(startRunes(recipe));
  return m.runes.filter((en) => !have.has(en));
}

/** 方策 → ⑤ の答え (工程 routeId、既定 main)。要るルーンを差す答えが先、完成の形は書かない */
export function rulesFromDetail(m: AutoModel, det: OrderDetail, recipe: QuizRecipe, routeId = "main"): QuizRules {
  const have = startRunes(recipe).length;
  const rules: QuizRule[] = missingRunes(m, recipe).map((en, i) => ({ when: { aug: have + i }, do: { use: `rune:${en}` } }));
  const t = tableOf(m, det, recipe, routeId);
  for (const { when, act } of t.best.values()) {
    if (m.slots.every((sl) => when[sl.id] === 2)) continue;
    rules.push({ when, do: doOf(m, act) });
  }
  return { v: 3, rules: { [routeId]: rules } };
}

/**
 * 順番 1 つの ⑤ の答えを全部の route について (両側の「どれか」があれば route ごとにその model を解いて、K6)。
 * details は route の id → orderDetail (answerFor・methodsFromDetail に渡す)
 */
export function rulesForOrder(m: AutoModel, order: readonly string[], recipe: QuizRecipe, opts: SolveOpts = {}): { quiz: QuizRules; details: Record<string, { model: AutoModel; detail: OrderDetail }> } {
  const rs = m.routes ?? [{ id: recipe.routes[0]!.id, model: m }];
  const quiz: QuizRules = { v: 3, rules: {} };
  const details: Record<string, { model: AutoModel; detail: OrderDetail }> = {};
  for (const r of rs) {
    const detail = orderDetail(r.model, order, opts);
    details[r.id] = { model: r.model, detail };
    quiz.rules[r.id] = rulesFromDetail(r.model, detail, recipe, r.id).rules[r.id]!;
  }
  return { quiz, details };
}

/**
 * ② の付け方: 札 (普通の札だけ) ごとに、その札が今の関門の時に mc で打った付ける手 (高貴 ex / カオス ch) の回数の多い方。
 * 打っていない札は null (付け方を変えない)。share = 多い方の割合
 */
export function methodsFromDetail(m: AutoModel, det: OrderDetail): Array<{ slot: string; modIds: string[]; method: "exalt" | "chaos" | null; share: number }> {
  const sh = new Shape(m);
  const n = m.slots.map(() => ({ ex: 0, ch: 0 }));
  for (const v of det.view) {
    if (!(v.visits > 0)) continue;
    const kind = v.act.split("|")[0];
    if (kind !== "ex" && kind !== "ch") continue;
    const k = det.gates.find((g) => !sh.hit(g, v.s[1 + g]!));
    if (k == null) continue;
    n[k]![kind] += v.visits;
  }
  return m.slots.flatMap((sl, k) => {
    if (sl.kind !== "normal") return [];
    const { ex, ch } = n[k]!, tot = ex + ch;
    return [{ slot: sl.id, modIds: sl.members.map((x) => x.modId), method: tot ? (ex >= ch ? "exalt" as const : "chaos" as const) : null, share: tot ? Math.max(ex, ch) / tot : 0 }];
  });
}

/**
 * ⑥ で答えの無かった状況に答える: 条件の項目だけ見て、方策の表で引く。無ければ段の低い札 (1) を外れに数え直して引く
 * (今の決まり「段が低いまま付いたらここでは付いていない」)。冒涜で付いた段の低い札は外れの冒涜として。当たらなければ null (イレギュラーのまま)
 */
export function answerFor(m: AutoModel, det: OrderDetail, recipe: QuizRecipe, sit: Situation, routeId = "main"): QuizRule | null {
  const t = tableOf(m, det, recipe, routeId);
  const pick = (w: When): QuizAction | null => { const e = t.best.get(keyOf(w)); return e ? doOf(m, e.act) : null; };
  const base: When = { aug: t.aug, [t.fracId]: 3 };
  // 外れは数のまま、未発現・外れの冒涜・冒涜は有無 (冒涜はアイテムに 1 つまで)
  for (const k of SIDE_KEYS) { const v = Number(sit[k] ?? 0); base[k] = k.endsWith("junk") ? v : Math.min(1, v); }
  m.slots.forEach((sl) => { base[sl.id] = Number(sit[sl.id] ?? 0); });
  if (Number(sit.aug ?? 0) !== t.aug || Number(sit[t.fracId] ?? 0) !== 3) return null;
  // 書く条件は状況そのまま (この状況だけに当たる)
  const when: When = { ...base };
  const tryW = (w: When): QuizRule | null => { const a = pick(w); return a ? { when, do: a } : null; };
  const hit0 = tryW(base);
  if (hit0) return hit0;
  // 段の低い札を外れに (冒涜で付いた物かは状況から分からないので、普通の外れ → 外れの冒涜の順に試す)
  const low = m.slots.filter((sl) => base[sl.id] === 1);
  if (!low.length) return null;
  const w: When = { ...base };
  for (const sl of low) { w[sl.id] = 0; const j = sl.side ? "s.junk" : "p.junk"; w[j] = (w[j] as number) + 1; }
  const r1 = tryW(w);
  if (r1) return r1;
  for (const sl of low) {
    const b = sl.side ? "s.bad" : "p.bad";
    if (w[b] === 1 || w.des !== 1 || w["p.hid"] || w["s.hid"]) continue;
    const r2 = tryW({ ...w, [b]: 1 });
    if (r2) return r2;
  }
  return null;
}
