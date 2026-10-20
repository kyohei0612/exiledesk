/**
 * auto-order.worker.ts — 「順番だけ自動」の組み立てと計算を画面とは別の場所 (Web Worker) で (シミュ部長、2026-10-20)。
 *
 * 組み立て (buildAutoModel) もここ (S1b、10-20: 手 5 で行き先の表を build で打つようになり、画面の側で 1.7 秒止まった)。
 *   - build: データ (PatchData) はワーカーが自分で読む (loadHtcPatch、画面の物と同じ JSON)。値段は画面から表で受け、表に無い鍵は
 *     need で聞き返して組み直す (値段の鍵は解析君の auto-model が決めるので、ここでは並べない)。組んだ形はワーカーに残し、run で使う
 *   - run: 値だけ (mc 無し) で候補を全部 → 安い順に上位 top と今の順番だけ 1 人ずつ mc 人回し、出た順に返す
 *   - fill: 決めた順番で orderDetail (mc 人) → ⑤ の答え (rulesFromDetail) と ② の付け方 (methodsFromDetail) を返す (S3、自動で埋める。解析君の auto-rules)
 *   - answer: ⑥ で答えの無かった状況に、最後の fill の方策で答える (answerFor)。当たらない物は返さない (イレギュラーのまま)
 * 止めるのは画面の側でワーカーごと捨てる (auto-order.ts の autoOrderClient)。1 つの順番の値は解析君の solveOrder (auto-solve.ts)
 */
import { buildAutoModel } from "./auto-model";
import { orderDetail, solveOrder } from "./auto-solve";
import type { AutoModel, OrderDetail, OrderResult } from "./auto-types";
import { answerFor, methodsFromDetail, rulesFromDetail } from "./auto-rules";
import { quizFromSim, type QuizRules } from "../quiz-build";
import type { QuizRecipe, QuizRule, Situation } from "../quiz-recipe";
import { loadHtcPatch } from "../../craft-stage/engine";
import type { QuizSimIn } from "../quiz-build";
import type { PatchData } from "../../../vendor/poe2htc/engine/types";

/** 画面から送る狙いの入力 (データと関数は送れないので外す。ルーンの値段は表の `rune:<英語名>`) */
export type AutoSimIn = Omit<QuizSimIn, "data" | "runePrice">;
export type AutoJob =
  | { kind: "build"; id: number; sim: AutoSimIn; prices: Record<string, number> }
  | { kind: "prices"; id: number; prices: Record<string, number> }
  | { kind: "run"; cands: string[][]; current: string[]; top: number; mc: number }
  | { kind: "fill"; id: number; order: string[]; mc: number }
  | { kind: "answer"; id: number; situations: Situation[] };
/** fill の返事: ⑤ の答え・② の付け方 (札ごと)・その順番の値と、方策が打てなかった形の数 (0 が正しい) */
export interface AutoFilled { rules: QuizRules; methods: ReturnType<typeof methodsFromDetail>; result: OrderResult; bad: number; stuck: number }
export type AutoMsg =
  | { kind: "need"; id: number; keys: string[] }
  | { kind: "built"; id: number; ok: true }
  | { kind: "built"; id: number; ok: false; reason: { ja: string; en: string } }
  | { kind: "step"; done: number; total: number }
  | { kind: "row"; row: OrderResult & { order: string[]; current: boolean } }
  | { kind: "done" }
  | { kind: "filled"; id: number; out: AutoFilled }
  | { kind: "answers"; id: number; rules: QuizRule[] }
  | { kind: "error"; message: string };

const post = (m: AutoMsg): void => (self as unknown as Worker).postMessage(m);
/** 安い順 (NaN・Infinity は一番後ろ。a - b だと NaN で並べ替えが壊れる。auto-order.ts の byCost と同じ) */
const byCost = (a: number, b: number): number => { const x = Number.isFinite(a) ? a : Infinity, y = Number.isFinite(b) ? b : Infinity; return x < y ? -1 : x > y ? 1 : 0; };
const same = (a: string[], b: string[]): boolean => a.length === b.length && a.every((k, i) => k === b[i]);

let data: Promise<PatchData> | null = null;
/** 最後に組んだ形 (run はこれで回す) */
let model: AutoModel | null = null;
/** 一番新しい build の id (古い build が後から終わっても形を上書きしない) */
let latest = 0;
/** 最後に組んだ時の狙いの入力 (データ込み。fill で ⑤ と同じ札の組み方 quizFromSim に使う) と、最後の fill の中身 (answer で使う) */
let lastSim: Parameters<typeof quizFromSim>[0] | null = null;
let lastFill: { det: OrderDetail; recipe: QuizRecipe } | null = null;
/** need で聞いた値段の返事待ち (build の id ごと) */
const waiting = new Map<number, (p: Record<string, number>) => void>();

async function build(job: Extract<AutoJob, { kind: "build" }>): Promise<void> {
  model = null;
  latest = job.id;
  const d = await (data ??= loadHtcPatch());
  const tab = { ...job.prices };
  const once = (): { built: ReturnType<typeof buildAutoModel>; missing: string[] } => {
    const missing = new Set<string>();
    const price = (k: string): number => { if (k in tab) return tab[k]!; missing.add(k); return 0; };
    const sim = { ...job.sim, data: d, runePrice: (en: string) => price(`rune:${en}`) };
    lastSim = sim;
    lastFill = null;
    const built = buildAutoModel({ sim, price });
    return { built, missing: [...missing] };
  };
  let r = once();
  if (r.missing.length) {
    const got = await new Promise<Record<string, number>>((res) => { waiting.set(job.id, res); post({ kind: "need", id: job.id, keys: r.missing }); });
    Object.assign(tab, got);
    r = once();
  }
  if (job.id !== latest) return;
  if (r.built.ok) { model = r.built.model; post({ kind: "built", id: job.id, ok: true }); }
  else post({ kind: "built", id: job.id, ok: false, reason: r.built.reason });
}

function run(job: Extract<AutoJob, { kind: "run" }>): void {
  const { cands, current, top, mc } = job;
  const m = model;
  if (!m) { post({ kind: "error", message: "model not built" }); return; }
  const solve = (order: string[], opts?: { mc: number }): OrderResult => solveOrder(m, order, opts);
  const vals: Array<{ order: string[]; v: number }> = [];
  let last = 0;
  cands.forEach((order, i) => {
    vals.push({ order, v: solve(order).perFinish });
    // 知らせるのは 0.1 秒に 1 回まで
    if (Date.now() - last > 100 || i === cands.length - 1) { last = Date.now(); post({ kind: "step", done: i + 1, total: cands.length + Math.min(top, cands.length) }); }
  });
  vals.sort((a, b) => byCost(a.v, b.v));
  const picks = vals.slice(0, top).map((x) => x.order);
  if (!picks.some((o) => same(o, current))) picks.push(current);
  picks.forEach((order, j) => {
    post({ kind: "row", row: { ...solve(order, { mc }), order, current: same(order, current) } });
    post({ kind: "step", done: cands.length + j + 1, total: cands.length + picks.length });
  });
  post({ kind: "done" });
}

function fill(job: Extract<AutoJob, { kind: "fill" }>): void {
  const m = model, sim = lastSim;
  if (!m || !sim) { post({ kind: "error", message: "model not built" }); return; }
  const det = orderDetail(m, job.order, { mc: job.mc });
  const recipe = quizFromSim({ ...sim, order: job.order }, null).recipe;
  lastFill = { det, recipe };
  post({ kind: "filled", id: job.id, out: { rules: rulesFromDetail(m, det, recipe), methods: methodsFromDetail(m, det), result: det.result, bad: det.bad, stuck: det.stuck } });
}
function answer(job: Extract<AutoJob, { kind: "answer" }>): void {
  const m = model, f = lastFill;
  if (!m || !f) { post({ kind: "answers", id: job.id, rules: [] }); return; }
  post({ kind: "answers", id: job.id, rules: job.situations.map((sit) => answerFor(m, f.det, f.recipe, sit)).filter((r): r is QuizRule => !!r) });
}

self.addEventListener("message", (e: MessageEvent<AutoJob>) => {
  const job = e.data;
  try {
    if (job.kind === "prices") { waiting.get(job.id)?.(job.prices); waiting.delete(job.id); }
    else if (job.kind === "build") build(job).catch((err) => post({ kind: "error", message: err instanceof Error ? err.message : String(err) }));
    else if (job.kind === "fill") fill(job);
    else if (job.kind === "answer") answer(job);
    else run(job);
  } catch (err) {
    post({ kind: "error", message: err instanceof Error ? err.message : String(err) });
  }
});
