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
}

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
  for (const t of x.targets) {
    const members = [{ modId: t.modId, minTierIndex: t.minTierIndex }, ...(t.alts ?? [])];
    const kind = KIND[t.method];
    const bySide = { prefix: members.filter((m) => sideOf(m.modId) === "prefix"), suffix: members.filter((m) => sideOf(m.modId) === "suffix") };
    const need = Math.max(1, Math.min(t.need ?? 1, members.length));
    if (bySide.prefix.length && bySide.suffix.length && kind !== "fractured") {
      if (split) { error = "両側のどれかは 1 つまで"; continue; }
      const id = LETTERS[n++] ?? `Z${n}`;
      split = { prefix: { id, side: "prefix", mods: bySide.prefix, kind }, suffix: { id, side: "suffix", mods: bySide.suffix, kind } };
      continue;
    }
    const side = bySide.prefix.length ? "prefix" : "suffix";
    for (let i = 0; i < need; i++) slots.push({ id: LETTERS[n++] ?? `Z${n}`, side, mods: members, kind });
  }
  const route = (id: string, goal: QuizSlot[], entry?: string[]): QuizRoute => ({ id, goal, ...(entry ? { entry } : {}), rules: q?.rules[id] ?? [] });
  const routes: QuizRoute[] = split
    ? [route("prefix", [...slots, split.prefix], [split.prefix.id]), route("suffix", [...slots, split.suffix], [split.suffix.id])]
    : [route("main", slots)];
  const frac = x.targets.find((t) => t.method === "fracture");
  let start: QuizStart;
  if (x.start === "item" && x.startItem) start = { kind: "item", item: x.startItem, price: x.startPrice };
  else if (x.start === "fractured" && frac) start = { kind: "bought", mods: [{ mod: frac.modId, fractured: true }], price: x.startPrice };
  else if (x.start === "magic") start = { kind: "bought", mods: magicStartMods(x.data, x.targets), rarity: "magic", price: x.startPrice, ...(x.sockets ? { sockets: x.sockets } : {}) };
  else if (x.start === "four" && frac) start = { kind: "bought", mods: [{ mod: frac.modId }], fill: { prefix: 2, suffix: 2 }, price: x.startPrice };
  else start = { kind: "white", price: x.startPrice, ...(x.sockets ? { sockets: x.sockets } : {}) };
  return { recipe: { v: 3, base: x.base, itemLevel: x.itemLevel, start, routes }, error };
}

/** 工程の名前 */
export const ROUTE_NAME: Record<string, [string, string]> = { main: ["", ""], prefix: ["プレフィックスに付いた工程", "Prefix route"], suffix: ["サフィックスに付いた工程", "Suffix route"] };
