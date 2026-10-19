/**
 * quiz-build.ts — シミュレーターの入力 (ベース・狙う MOD・始め方) からクイズのレシピを組む (ADR-003、2026-10-12)。
 * 答え (rules) はパターンに工程ごとに持つ (Pattern.quiz)。完成の札は狙う MOD から毎回組むので、段や MOD を変えても答えは残る
 * (札の id は狙う MOD の並びの A, B, C …)。
 *
 * 両側の「どれか」(プレとサフィの候補を混ぜた狙い) は、プレの工程とサフィの工程に分ける (オーナー 2026-10-12
 * 「プレ狙いでサフィ狙いも兼ねてる、サフィに付いたらサフィの工程へ」)。両側の狙いは 1 つまで
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import type { StageItem, StageSide } from "./types";
import type { Force } from "./stage-core";
import type { QuizRecipe, QuizRoute, QuizRule, QuizSlot, QuizStart, SlotKind } from "./quiz-recipe";
import { CRAFTED_SOURCES } from "../../vendor/poe2htc/engine/pool";
import { runeEnForId } from "./pattern";
import { sideLimits } from "./sim-methods";

export interface QuizRules { v: 3; rules: Record<string, QuizRule[]> }
export type SimMethod = "exalt" | "chaos" | "desecrate" | "essence" | "fracture";
export interface SimTargetIn { modId: string; minTierIndex: number; method: SimMethod; alts?: Array<{ modId: string; minTierIndex: number }>; need?: number }
export interface QuizSimIn {
  data: PatchData;
  base: string;
  itemLevel: number;
  targets: readonly SimTargetIn[];
  start: "white" | "fractured" | "four" | "item" | "magic";
  /** 始め 1 個の値段 (高貴建て) */
  startPrice: number;
  sockets?: number;
  startItem?: StageItem | null;
  /** 付ける順番 (④ の simOrder、"mod:<id>" と "rune:<名前>")。⑤ で先の狙いを見ない関門に使う */
  order?: readonly string[];
  /** フラクチャーの候補ごとの付きやすさ (固定済みから始める時、どれが固定されたかの重み) */
  fracWeights?: Record<string, number>;
}

/**
 * 1 人が使うベースの上限 (最初の 1 個込み)。超える作り直しで諦める (2026-10-20 オーナー「上限は作り直しの回数、現実的な回まで」)
 */
export const MAX_BASES = 30;

/** その MOD に使える付け方 (最初が既定)。シミュレーターの 2 狙う MOD と同じ */
export function methodsFor(data: PatchData, modId: string): SimMethod[] {
  const m = data.mods.get(modId);
  if (!m) return ["exalt"];
  if (m.source === "desecrated") return ["desecrate"];
  if (CRAFTED_SOURCES.has(m.source)) return ["essence"];
  return ["exalt", "chaos", "desecrate"];
}
export const methodOfTarget = (data: PatchData, t: { modId: string; method?: SimMethod }): SimMethod =>
  t.method === "fracture" ? "fracture" : t.method && methodsFor(data, t.modId).includes(t.method) ? t.method : methodsFor(data, t.modId)[0]!;

const KIND: Record<SimMethod, SlotKind> = { exalt: "normal", chaos: "normal", desecrate: "desecrated", essence: "essence", fracture: "fractured" };
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * マジックを買う始め方で付いている MOD: 狙う MOD (普通の付け方) の最初のプレ 1 つ・サフィ 1 つ。段は狙いの下限 (2026-10-12 オーナー
 * 「マジックを買う始め方も足して」)。冒涜・エッセンス・フラクチャーの狙いはマジックに付いていないので入れない
 */
export function magicStartMods(data: PatchData, targets: readonly SimTargetIn[]): Force[] {
  const out: Force[] = [];
  const sides = new Set<StageSide>();
  for (const t of targets) {
    if (t.method !== "exalt" && t.method !== "chaos") continue;
    const m = data.mods.get(t.modId);
    const side: StageSide = m?.type === "suffix" ? "suffix" : "prefix";
    if (!m || sides.has(side)) continue;
    sides.add(side);
    out.push({ mod: t.modId, tier: `T${m.tiers.length - t.minTierIndex}` });
  }
  return out;
}

export interface QuizBuilt { recipe: QuizRecipe; error: string | null }

export function quizFromSim(x: QuizSimIn, q: QuizRules | null | undefined): QuizBuilt {
  const sideOf = (id: string): StageSide => (x.data.mods.get(id)?.type === "suffix" ? "suffix" : "prefix");
  const slots: QuizSlot[] = [];
  /** 両側の狙い (候補がプレとサフィに分かれる) の札 */
  let split: { prefix: QuizSlot; suffix: QuizSlot } | null = null;
  let error: string | null = null;
  let n = 0;
  /**
   * フラクチャーの候補 (付け方 = フラクチャーの狙いと、その「どれか」の候補を全部) は 1 つの札「このどれか 1 つが固定」にまとめる
   * (2026-10-20 オーナー「フラクチャーは複数から選べて、どれか 1 つが固定されたらいい」。前は候補ごとに固定の札を作り、2 つ選ぶと両方の固定が要った)。
   * 両側の候補は側ごとに別のパターンにする決め (sim-split-by-side) なので、ここでは 1 つ目の候補の側だけ
   */
  const fracC: Array<{ modId: string; minTierIndex: number }> = [];
  for (const t of x.targets) if (t.method === "fracture") for (const m of [{ modId: t.modId, minTierIndex: t.minTierIndex }, ...(t.alts ?? [])]) if (!fracC.some((c) => c.modId === m.modId)) fracC.push(m);
  const fracSide = fracC[0] ? sideOf(fracC[0].modId) : null;
  if (fracC.some((c) => sideOf(c.modId) !== fracSide)) error = "フラクチャーの候補がプレフィックスとサフィックスにまたがっている (側ごとに別のパターンにする。今は 1 つ目の側だけ)";
  const frac = fracC.filter((c) => sideOf(c.modId) === fracSide);
  /** 狙いの modId → 札の id (付ける順番に使う) */
  const slotIds = new Map<string, string[]>();
  if (frac.length && fracSide) slots.push({ id: LETTERS[n++] ?? `Z${n}`, side: fracSide, mods: frac, kind: "fractured" });
  for (const t of x.targets) {
    if (t.method === "fracture") continue;
    const members = [{ modId: t.modId, minTierIndex: t.minTierIndex }, ...(t.alts ?? [])];
    const kind = KIND[t.method];
    const bySide = { prefix: members.filter((m) => sideOf(m.modId) === "prefix"), suffix: members.filter((m) => sideOf(m.modId) === "suffix") };
    const need = Math.max(1, Math.min(t.need ?? 1, members.length));
    if (bySide.prefix.length && bySide.suffix.length && kind !== "fractured") {
      if (split) { error = "両側のどれかは 1 つまで"; continue; }
      const id = LETTERS[n++] ?? `Z${n}`;
      split = { prefix: { id, side: "prefix", mods: bySide.prefix, kind }, suffix: { id, side: "suffix", mods: bySide.suffix, kind } };
      slotIds.set(t.modId, [id]);
      continue;
    }
    const side = bySide.prefix.length ? "prefix" : "suffix";
    const ids: string[] = [];
    for (let i = 0; i < need; i++) { const id = LETTERS[n++] ?? `Z${n}`; ids.push(id); slots.push({ id, side, mods: members, kind }); }
    slotIds.set(t.modId, ids);
  }
  /**
   * 固定されなかった候補: その側に空きがあれば、後から取る札にする (完成品の MOD の数で決まる。2026-10-20 オーナー「フラクチャーでどっちかでいいけど
   * 他 5 MOD 指定ならどっちかが完成品、どっちもなら他 4 MOD」)。付け方は ⑤ の答えで決める (札は普通の MOD、冒涜で付いても埋まる)。順番に無いので最後の関門
   */
  if (frac.length > 1 && fracSide) {
    const room = sideLimits(x.data, x.base, x.itemLevel)[fracSide] - slots.filter((s) => s.side === fracSide).length - (split ? 1 : 0);
    // 候補と重なる「どれか」の狙い (例: 高貴で ES かマナのどちらか) の候補も入れる。高貴でマナが付いたら、残りの札は ES で埋まる
    const mods = [...frac];
    for (const s of slots) if (s.side === fracSide && s.kind !== "fractured" && s.mods.some((m) => frac.some((c) => c.modId === m.modId))) for (const m of s.mods) if (!mods.some((y) => y.modId === m.modId)) mods.push(m);
    for (let i = 0; i < Math.min(frac.length - 1, Math.max(0, room)); i++) slots.push({ id: LETTERS[n++] ?? `Z${n}`, side: fracSide, mods, kind: "normal" });
  }
  const order = x.order?.flatMap((k) => slotIds.get(k.startsWith("mod:") ? k.slice(4) : k) ?? []);
  const route = (id: string, goal: QuizSlot[], entry?: string[]): QuizRoute => ({ id, goal, ...(entry ? { entry } : {}), rules: q?.rules[id] ?? [], ...(order?.length ? { order } : {}) });
  const routes: QuizRoute[] = split
    ? [route("prefix", [...slots, split.prefix], [split.prefix.id]), route("suffix", [...slots, split.suffix], [split.suffix.id])]
    : [route("main", slots)];
  let start: QuizStart;
  // 固定する MOD がルーンの MOD (コルの狩りのマークスマンなど) なら、そのルーンを差した状態から (差していないと付けられず、5 が「この手では付かない」で止まった。
  // 2026-10-19 動画 SJdAUeUMNBU の手袋)。ソケットも 1 で選んだ数 (規格外) のまま
  const runesOf = (modId: string): string[] => { const rid = x.data.mods.get(modId)?.rune; const r = rid ? runeEnForId(rid) : null; return r ? [r] : []; };
  if (x.start === "item" && x.startItem) start = { kind: "item", item: x.startItem, price: x.startPrice };
  else if (x.start === "fractured" && frac.length) {
    // 固定された MOD は狙いの段 (下限) で。段を決めないと乱数の段で付き、マナ T1 を狙ったのに T4 のマナが固定されたレアから始まっていた (2026-10-20 検証)
    const fx = (c: { modId: string; minTierIndex: number }) => {
      const len = x.data.mods.get(c.modId)?.tiers.length ?? 0;
      return { mod: c.modId, fractured: true, ...(c.minTierIndex > 0 && len ? { tier: `T${len - c.minTierIndex}` } : {}) };
    };
    // 候補が複数なら、買うたびにどれが固定されたかを付きやすさの重みで選ぶ (2026-10-20)。ルーンは候補のどれかに要る物を全部
    // (候補を作る時に差しているので、マナが固定されてもコルの狩りは差さっている。前は固定された MOD のルーンだけで、マナの時に差さっていなかった)
    const r0 = [...new Set(frac.flatMap((c) => runesOf(c.modId)))];
    const pick = frac.length > 1 ? frac.map((c) => ({ mods: [fx(c)], runes: r0, w: x.fracWeights?.[c.modId] ?? 1 })) : undefined;
    start = { kind: "bought", mods: [fx(frac[0]!)], price: x.startPrice, ...(x.sockets ? { sockets: x.sockets } : {}), ...(r0.length ? { runes: r0 } : {}), ...(pick ? { pick } : {}) };
  }
  else if (x.start === "magic") start = { kind: "bought", mods: magicStartMods(x.data, x.targets), rarity: "magic", price: x.startPrice, ...(x.sockets ? { sockets: x.sockets } : {}) };
  else if (x.start === "four" && frac.length) start = { kind: "bought", mods: [{ mod: frac[0]!.modId }], fill: { prefix: 2, suffix: 2 }, price: x.startPrice };
  else start = { kind: "white", price: x.startPrice, ...(x.sockets ? { sockets: x.sockets } : {}) };
  return { recipe: { v: 3, base: x.base, itemLevel: x.itemLevel, start, routes }, error };
}

/** 工程の名前 */
export const ROUTE_NAME: Record<string, [string, string]> = { main: ["", ""], prefix: ["プレフィックスに付いた工程", "Prefix route"], suffix: ["サフィックスに付いた工程", "Suffix route"] };
