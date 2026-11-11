/**
 * sweep.ts — 木の「決められた枝」(枠の形 × 手 → どの箱に入るか) と、エンジンで同じ品に同じ手を何度も打った結果の突き合わせ (S-210、2026-11-12 シミュ部長 12)。
 * 段 A (1 手の結果と割合 = tests/step-outcomes-all/、E-99) の続きの段 B: 木が手を置いた時に作る結果の箱へ、打った結果が入るかを見る。
 *
 * 作り: 部位 × 枠の形 (始まりの形で作れる物) × 棚の手 × お告げ (無し・1 枚・一緒に効く 2 枚) × ☑ (既定・狙い無し) を並べ、
 *   手は画面と同じ口 (tree-hand-plan の planPick → applyPick) で始まりの箱に置く → 同じ品にエンジンの 1 手 (applyCurrency) を決まった種で N 回打つ →
 *   結果を回す時と同じ分け方 (tree-outcome の boxOutcomeOf → tree-shape の outBoxOf) に通す。見るのは 3 つ:
 *   (a) どの箱にも入らない結果  (b) 1 度も入らない箱  (c) 箱ごとの割合 (数え上げ stepOutcomes を同じ分け方に通した割合 ⇄ 打った割合、5 σ + 5 回)
 * エンジンの紙の「遊びがエンジンの答えを変える所の一覧」(E-100〜E-106) に行がある上書きは「違って当然」として別に数える (行が消えれば食い違いに戻る)。
 * 木の画面では回さない。回すのはエンジンの挙動か木の分け方を変えた時だけ (使い方は同じ置き場の README.md)。
 * これは「木の分け方とエンジンの打った結果が同じか」の見張りで、外の正解 (poe2db・E-01) ではない (G-22)
 */
import fs from "node:fs";
import { applyCurrency, freshItem, modListFor, mulberry32, type PatchData, type StageItem } from "../../../src/services/craft-stage/engine";
import { stepOutcomes } from "../../../src/services/simulator/sim-engine";
import { effectOf, engineOmens, isBone, isCatalyst } from "../../../src/services/simulator/tree/tree-hands";
import type { Aim, TreeBox, TreeDoc } from "../../../src/services/simulator/tree/tree-model";
import { boxOutcomeOf, essenceHold } from "../../../src/services/simulator/tree/tree-outcome";
import { outBoxOf } from "../../../src/services/simulator/tree/tree-shape";
import { aimsOf, handAims, playHand, sampleOf } from "../../../src/services/simulator/tree/tree-sample";
import { sampleAimed } from "../../../src/services/simulator/tree/tree-judge";
import { withTreeTune } from "../../../src/services/simulator/tree/tree-tune";
import { veilPick } from "../../../src/services/simulator/tree/tree-veil";
import { isWhittleHand } from "../../../src/services/simulator/tree/tree-whittle";
import { applyPick, planPick, shelfKeysOf } from "../../../src/views/simulator/tree/tree-hand-plan";
import { heldOmensOf } from "../../../src/components/for-share/shelf/held-omens";
import { omenSets, BASES as SWEEP_BASES } from "../../../tests/step-outcomes-all/sweep";
import { Ui } from "../../_tree-patterns-ui";

export const BASES = SWEEP_BASES;
const N = Number(process.env.N ?? 400);
/** 1 度も入らない箱を決める前の打ち直しの回数 (数え上げの無い手だけ) */
const N_MORE = 4000;
const off = (count: number, n: number, p: number): boolean => Math.abs(count - n * p) > 5 * Math.sqrt(n * p * (1 - p)) + 5;
const hashOf = (x: string): number => { let h = 2166136261; for (let i = 0; i < x.length; i++) h = Math.imul(h ^ x.charCodeAt(i), 16777619); return h >>> 0; };
const seedOf = (s: number, k: number): number => (Math.imul(s, 2654435761) ^ Math.imul(k, 0x5bd1e995)) >>> 0;

/** エンジンの紙の一覧 (E-100〜E-106) に今ある行の番号。行が無い上書きは除外しない */
export function allowedRows(): Set<string> {
  const md = fs.readFileSync(new URL("../../../docs/spec/engine.md", import.meta.url), "utf8");
  return new Set([...md.matchAll(/^\| (E-10[0-6]) \|/gm)].map((m) => m[1]!));
}

export type FindKind = "a 箱が無い" | "b 入らない箱" | "c 割合" | "x 打てない";
export interface Find { kind: FindKind; base: string; shape: string; hand: string; what: string; /** 一覧の行 (わざとの上書き)。無ければ食い違い */ allow?: string }
export interface Tally { hands: number; cant: number; back: number; skipped: number; compared: number; draws: number; voids: number }
export const newTally = (): Tally => ({ hands: 0, cant: 0, back: 0, skipped: 0, compared: 0, draws: 0, voids: 0 });

/** 枠の形 (始まりの形で作れる物だけ。未発現・腐食・コラプトなど始まりにできない形は段 A の持ち場) */
const SHAPES = ["白", "青 狙い 1", "青 外れ 1", "黄 狙い 1 + 外れ 2", "黄 狙い 2 + 外れ 2", "黄 外れ 3", "黄 狙い 2 + 外れ 4 (満杯)", "黄 ✦ 狙い 1 + 外れ 2"] as const;
export type Shape = (typeof SHAPES)[number];
export const shapesOf = (): readonly Shape[] => (process.env.SHAPE ? SHAPES.filter((s) => s.includes(process.env.SHAPE!)) : SHAPES);

/** 完成形の狙い 3 つ (プレ・サフィ・プレ。普通の MOD の一番下の段 = その段以上が当たりなので当たりの箱に人が入りやすい) */
function goalsOf(data: PatchData, base: string): Aim[] {
  const rows = modListFor(data, freshItem(data, base, 82, "rare")).filter((r) => r.group === "normal" && r.tiers.length);
  const pick = (side: string, skip: number): Aim | null => { const r = rows.filter((x) => x.side === side)[skip]; const t = r?.tiers.at(-1); return r && t ? { modId: t.modId ?? r.id, tier: Number(t.rank.slice(1)) } : null; };
  return [pick("prefix", 0), pick("suffix", 0), pick("prefix", 1)].filter((a): a is Aim => !!a);
}
/** 枠の形の木 (始まりの箱だけ)。作れない部位 (狙いが取れない等) は null */
export function docOf(data: PatchData, base: string, shape: Shape): TreeDoc | null {
  const goals = goalsOf(data, base);
  if (goals.length < 2) return null;
  const u = new Ui(data, shape, base);
  for (const g of goals) u.memo(g);
  const [g1, g2] = goals as [Aim, Aim];
  const junk = Number(/外れ (\d)/.exec(shape)?.[1] ?? 0);
  if (shape.startsWith("青")) u.d.goal = { rarity: "magic" };
  if (shape.includes("✦")) u.startMod(g1.modId, g1.tier, true);
  else if (shape.includes("狙い")) { u.startMod(g1.modId, g1.tier); if (shape.includes("狙い 2")) u.startMod(g2.modId, g2.tier); }
  if (junk) u.random(junk);
  return u.finds.length ? null : u.d;
}

const sigBox = (c: TreeBox): string => `${c.out}${c.aim ? `(${c.aim.modId.split("/").pop()})` : ""}${c.junkKey ? `[${c.junkKey}]` : ""}`;

/** わざとの上書きの行 (E-100〜): この手・この結果がエンジンと違って当然か */
function allowOf(data: PatchData, rows: ReadonlySet<string>, h: NonNullable<TreeBox["hand"]>, before: StageItem, boxes: readonly TreeBox[]): string | undefined {
  const hit = (id: string, on: boolean): string | undefined => (on && rows.has(id) ? id : undefined);
  return hit("E-102", isWhittleHand(h))
    ?? hit("E-103", h.currency === "hinekora" || !!before.foreseen)
    ?? hit("E-100", effectOf(h.currency) === "essence" && (!!essenceHold(data, before, h.currency) || boxes.some((c) => c.out === "blocked")));
}

/** 1 つの枠の形に 1 つの手を置いて突き合わせる */
function check(data: PatchData, base: string, shape: Shape, doc0: TreeDoc, key: string, omens: string[], pickNone: boolean, rows: ReadonlySet<string>, finds: Find[], t: Tally): void {
  const d: TreeDoc = structuredClone(doc0);
  const label = `${key} [${omens.join("+") || "-"}]${pickNone ? " 狙い無し" : ""}`;
  const push = (kind: FindKind, what: string, allow?: string): void => { finds.push({ kind, base, shape, hand: label, what, ...(allow ? { allow } : {}) }); };
  const it0 = sampleOf(data, d, "start", 1).item;
  const plan = planPick(data, d, "start", it0, key, omens, { echo: isBone(key), ...(pickNone ? { hitAims: [] } : {}) }, d.memoAims ?? []);
  t.hands++;
  if (plan.problem) { t.cant++; return; }
  const at = applyPick(d, "start", plan.hand, plan.kind, plan.aims, plan.preCat, plan.only);
  const b = d.boxes[at];
  if (!b?.hand) { t.back++; return; }
  const h = b.hand;
  // 繰り返し・品質だけの手は結果の箱が決め打ち (当たりだけ・通り抜け) なので突き合わせの外
  if (h.repeat || isCatalyst(h.currency)) { t.skipped++; return; }
  const before = sampleOf(data, d, at, 1).item, aims = aimsOf(data, d), aimed = sampleAimed(data, d, at, 1);
  const kids = b.outs.map((id) => d.boxes[id]!).filter(Boolean);
  const allow = allowOf(data, rows, h, before, kids);
  const om = engineOmens(h);
  // 発現で選ぶ骨は木の打ち方 (骨 → ☑ の発現) まで打つ。ほかはエンジンの 1 手そのもの
  const hit1 = (rng: () => number) => (veilPick(h) ? playHand(data, before, h, rng, handAims(d, at, aims)) : applyCurrency(data, before, h.currency, rng, om));
  const route = (after: StageItem): string | undefined => outBoxOf(data, d, b, boxOutcomeOf(data, d, b, before, after, aims, aimed), after);
  const k0 = hashOf(`${base}|${shape}|${label}`);
  const seen = new Map<string, number>();
  let applied = 0, missA = false;
  const draw = (from: number, to: number): boolean => {
    for (let s = from; s <= to; s++) {
      const r = hit1(mulberry32(seedOf(s, k0)));
      t.draws++;
      if (!r.applied) { if (r.random) { t.voids++; continue; } push("x 打てない", `木は手を置けたのにエンジンは打てない (${r.reason ?? ""})`, allow); return false; }
      applied++;
      const to1 = route(r.item);
      if (!to1) { if (!missA) { missA = true; const oc = boxOutcomeOf(data, d, b, before, r.item, aims, aimed); push("a 箱が無い", `結果 ${oc.out}${oc.hits.length ? `(${oc.hits.map((x) => x.modId.split("/").pop()).join(",")})` : ""}${oc.junkKey ? `[${oc.junkKey}]` : ""} の行き先が無い (箱 = ${kids.map(sigBox).join(" / ") || "無し"}、${s} 回目)`, allow); } continue; }
      seen.set(to1, (seen.get(to1) ?? 0) + 1);
    }
    return true;
  };
  if (!draw(1, N)) return;
  t.compared++;
  // 数え上げ (段 A が打った結果と同じと見張っている物) を同じ分け方に通した箱ごとの割合
  const so = veilPick(h) ? null : stepOutcomes(data, before, h.currency, om);
  const want = new Map<string, number>();
  let live = 0;
  if (so?.length) for (const o of so) { if (o.void) continue; live += o.p; const to1 = route(o.item); if (to1) want.set(to1, (want.get(to1) ?? 0) + o.p); }
  for (const c of kids) {
    const n = seen.get(c.id) ?? 0, p = live > 0 ? (want.get(c.id) ?? 0) / live : null;
    if (p !== null && p > 0 && applied > 0) { if (off(n, applied, p)) push("c 割合", `箱 ${sigBox(c)}: 数え上げを分けた割合 ${p.toFixed(4)} / 打った ${(n / applied).toFixed(4)} (${applied} 回)`, allow); continue; }
    if (n > 0) continue;
    // 数え上げでも 0 = その箱へ行く結果が無い。数え上げの無い手は打ち足してから決める
    if (p === null) { const a0 = applied; if (!draw(N + 1, N_MORE)) return; if ((seen.get(c.id) ?? 0) > 0) continue; push("b 入らない箱", `箱 ${sigBox(c)}: ${applied} 回打って 0 (数え上げの無い手、${a0} 回の後に打ち足した)`, allow); } else push("b 入らない箱", `箱 ${sigBox(c)}: 数え上げを分けても 0・${applied} 回打って 0`, allow);
  }
}

/** 見る手 (KEY=chaos,annul で絞る = 変えた手だけ。前方一致: essence: で全エッセンス) */
const wantKey = (key: string): boolean => { const ks = process.env.KEY?.split(",").filter(Boolean); return !ks?.length || ks.some((k) => key === k || (k.endsWith(":") && key.startsWith(k))); };

/** 1 つの部位 × 1 つの枠の形の全部の手。手ごとに一度手を離す (vitest の連絡が時間切れにならないように) */
export async function sweepShape(data: PatchData, base: string, shape: Shape, rows: ReadonlySet<string>, t: Tally): Promise<Find[] | null> {
  const doc = docOf(data, base, shape);
  if (!doc) return null;
  const finds: Find[] = [];
  const keys = shelfKeysOf(data, sampleOf(data, doc, "start", 1).item).filter(wantKey);
  for (const key of keys) {
    const can = heldOmensOf(key);
    for (const om of omenSets(key).filter((s) => s.every((x) => can.includes(x)))) {
      for (const none of [false, true]) {
        try { withTreeTune(doc, () => check(data, base, shape, doc, key, om, none, rows, finds, t)); }
        catch (e) { finds.push({ kind: "x 打てない", base, shape, hand: `${key} [${om.join("+") || "-"}]${none ? " 狙い無し" : ""}`, what: `落ちた: ${(e as Error).message.slice(0, 160)}` }); }
      }
    }
    await new Promise((r) => setImmediate(r));
  }
  return finds;
}
