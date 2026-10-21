/**
 * quiz-build.ts — シミュレーターの入力 (ベース・狙う MOD・始め方) からクイズのレシピを組む (ADR-003、2026-10-12)。
 * 答え (rules) はパターンに工程ごとに持つ (Pattern.quiz)。完成の札は狙う MOD から毎回組むので、段や MOD を変えても答えは残る
 * (札の id は狙う MOD の並びの A, B, C …)。
 *
 * 両側の「どれか」(プレとサフィの候補を混ぜた狙い) は、プレの工程とサフィの工程に分ける (オーナー 2026-10-12
 * 「プレ狙いでサフィ狙いも兼ねてる、サフィに付いたらサフィの工程へ」)。両側の狙いは 1 つまで
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import type { StageItem, StageSide } from "../craft-stage/types";
import type { Force } from "../craft-stage/stage-core";
import type { QuizRecipe, QuizRoute, QuizRule, QuizSlot, QuizStart, SlotKind } from "./quiz-recipe";
import { CRAFTED_SOURCES } from "../../vendor/poe2htc/engine/pool";
import { runeEnForId } from "./pattern";
import { sideLimits } from "./sim-methods";
import { sideOfMod } from "../craft-stage/engine";
import { membersOf } from "./recipe-defs";

export interface QuizRules { v: 3; rules: Record<string, QuizRule[]> }
export type SimMethod = "exalt" | "chaos" | "augment" | "desecrate" | "essence" | "fracture";
export interface SimTargetIn { modId: string; minTierIndex: number; method: SimMethod; alts?: Array<{ modId: string; minTierIndex: number }>; need?: number; /** フラクチャー予定の狙い: 固定されなかった方も要る時の付け方 */ rest?: "exalt" | "chaos" | "desecrate" }
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
  /** グレーターエッセンスを巻き込む道 (sim-greater.ts): 固定済みのレアは、マジック (候補 + 残す MOD) → このエッセンス → 壁 → 候補を固定、で作る */
  greater?: { essKey: string | null; keep: SimTargetIn | null };
  /** ルーン 1 個の値段 (高貴建て、英語の名前)。白から全部 ⑤ で答える時に始めから差すルーンの代金をベース代に足す */
  runePrice?: (en: string) => number;
}

/**
 * 関門の打ち止め (その関門で打てる回数、お告げは数えない)。どの関門にも付ける (2026-10-20 オーナー「どの手順にも打ち止めは必須」
 * 「カオススパムとか冒涜リロールの沼はガチでマックスまで沼れる」)。spam = カオススパム・冒涜 (と、付け方を ⑤ で決める残りの候補)、step = それ以外。
 * 増強スパム (2026-10-21) もスパムなので spam
 */
export const GATE_CAPS = { spam: 3000, step: 300 } as const;

/** その MOD に使える付け方 (最初が既定)。シミュレーターの 2 狙う MOD と同じ */
export function methodsFor(data: PatchData, modId: string): SimMethod[] {
  const m = data.mods.get(modId);
  if (!m) return ["exalt"];
  if (m.source === "desecrated") return ["desecrate"];
  if (CRAFTED_SOURCES.has(m.source)) return ["essence"];
  return ["exalt", "chaos", "augment", "desecrate"];
}
export const methodOfTarget = (data: PatchData, t: { modId: string; method?: SimMethod }): SimMethod =>
  t.method === "fracture" ? "fracture" : t.method && methodsFor(data, t.modId).includes(t.method) ? t.method : methodsFor(data, t.modId)[0]!;

const KIND: Record<SimMethod, SlotKind> = { exalt: "normal", chaos: "normal", augment: "normal", desecrate: "desecrated", essence: "essence", fracture: "fractured" };
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
    const side: StageSide = sideOfMod(data, t.modId);
    if (!m || sides.has(side)) continue;
    sides.add(side);
    out.push({ mod: t.modId, tier: `T${m.tiers.length - t.minTierIndex}` });
  }
  return out;
}

/** グレーターの道のエッセンスの狙い (キー essence:<段>:<modId> の modId) */
const magicEss = (x: QuizSimIn): string | null => (x.greater?.essKey ? x.greater.essKey.split(":").slice(2).join(":") : null);

export interface QuizBuilt { recipe: QuizRecipe; error: string | null }

export function quizFromSim(x: QuizSimIn, q: QuizRules | null | undefined): QuizBuilt {
  const sideOf = (id: string): StageSide => sideOfMod(x.data, id);
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
  /** 札の id → 関門の打ち止め */
  const caps: Record<string, number> = {};
  const capOf = (m: SimMethod | null): number => (m == null || m === "chaos" || m === "augment" || m === "desecrate" ? GATE_CAPS.spam : GATE_CAPS.step);
  if (frac.length && fracSide) slots.push({ id: LETTERS[n++] ?? `Z${n}`, side: fracSide, mods: frac, kind: "fractured" });
  for (const t of x.targets) {
    if (t.method === "fracture") continue;
    const members = membersOf(t);
    const kind = KIND[t.method];
    const bySide = { prefix: members.filter((m) => sideOf(m.modId) === "prefix"), suffix: members.filter((m) => sideOf(m.modId) === "suffix") };
    const need = Math.max(1, Math.min(t.need ?? 1, members.length));
    if (bySide.prefix.length && bySide.suffix.length && kind !== "fractured") {
      if (split) { error = "両側のどれかは 1 つまで"; continue; }
      const id = LETTERS[n++] ?? `Z${n}`;
      split = { prefix: { id, side: "prefix", mods: bySide.prefix, kind }, suffix: { id, side: "suffix", mods: bySide.suffix, kind } };
      slotIds.set(t.modId, [id]);
      caps[id] = capOf(t.method);
      continue;
    }
    const side = bySide.prefix.length ? "prefix" : "suffix";
    const ids: string[] = [];
    for (let i = 0; i < need; i++) { const id = LETTERS[n++] ?? `Z${n}`; ids.push(id); slots.push({ id, side, mods: members, kind }); caps[id] = capOf(t.method); }
    slotIds.set(t.modId, ids);
    // 増強スパムの組で残りの候補も要る時 (rest): 候補の数 − 1 の札をその付け方で (② の「残りの候補」、④ の順番のキー rest:<modId>。2026-10-21)
    if (t.method === "augment" && t.rest && members.length > 1) {
      const rid: string[] = [];
      for (let i = 1; i < members.length; i++) { const id = LETTERS[n++] ?? `Z${n}`; rid.push(id); slots.push({ id, side, mods: members, kind: KIND[t.rest] }); caps[id] = capOf(t.rest); }
      slotIds.set(`rest:${t.modId}`, rid);
    }
  }
  /**
   * 固定されなかった候補: ② で「固定されなかった方」の付け方を選んだ時だけ、後から取る札にする (2026-10-21 オーナー「どっちも要る時は一段下に
   * 付け方で 1 MOD 群増やす、どっちかなら要らん」。前は空き枠があれば札にしていて、② の「どれか 1」と食い違っていた)。札の付け方はその選んだ物、
   * 付ける順番は ④ の「固定されなかった方」の行 (順番のキー rest:frac)
   */
  const rest = x.targets.find((t) => t.method === "fracture" && t.rest)?.rest ?? null;
  if (frac.length > 1 && fracSide && rest) {
    const room = sideLimits(x.data, x.base, x.itemLevel)[fracSide] - slots.filter((s) => s.side === fracSide).length - (split ? 1 : 0);
    // 候補と重なる「どれか」の狙い (例: 高貴で ES かマナのどちらか) の候補も入れる。高貴でマナが付いたら、残りの札は ES で埋まる
    const mods = [...frac];
    for (const s of slots) if (s.side === fracSide && s.kind !== "fractured" && s.mods.some((m) => frac.some((c) => c.modId === m.modId))) for (const m of s.mods) if (!mods.some((y) => y.modId === m.modId)) mods.push(m);
    const ids: string[] = [];
    for (let i = 0; i < Math.min(frac.length - 1, Math.max(0, room)); i++) { const id = LETTERS[n++] ?? `Z${n}`; ids.push(id); slots.push({ id, side: fracSide, mods, kind: KIND[rest] }); caps[id] = capOf(rest); }
    slotIds.set("rest:frac", ids);
  }
  // グレーターの道: 残す MOD とエッセンスの MOD は始めから付いている (フラクチャーの前に付けた) ので、関門の一番前に (後ろだと「先の狙い」で隠れた。2026-10-20 見本の靴)
  const pre = x.greater ? [x.greater.keep?.modId, magicEss(x)].flatMap((id) => (id ? slotIds.get(id) ?? [] : [])) : [];
  /**
   * 増強スパムの札はマジックの間に揃える物なので、1 つの関門にまとめて一番前に (2026-10-21。順番どおり 1 つずつだと、サフィが先に付いた時に
   * 「先の狙い」で外れに数えて消していた)。白から全部 ⑤ で答える時は、フラクチャーの候補もマジックで一緒に揃える
   */
  const augIds = x.targets.filter((t) => t.method === "augment").flatMap((t) => slotIds.get(t.modId) ?? []);
  const fracId = slots.find((s) => s.kind === "fractured")?.id;
  const magicGate = [...augIds, ...(augIds.length && x.start === "white" && fracId ? [fracId] : [])];
  const order0 = x.order?.flatMap((k) => slotIds.get(k.startsWith("mod:") ? k.slice(4) : k) ?? []);
  const order1 = order0 ? [...pre, ...order0.filter((id) => !pre.includes(id))] : undefined;
  const order = magicGate.length ? [magicGate.join("|"), ...(order1 ?? []).filter((id) => !magicGate.includes(id))] : order1;
  if (magicGate.length > 1) caps[magicGate.join("|")] = GATE_CAPS.spam;
  const route = (id: string, goal: QuizSlot[], entry?: string[]): QuizRoute => ({ id, goal, ...(entry ? { entry } : {}), rules: q?.rules[id] ?? [], ...(order?.length ? { order, caps } : {}) });
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
    if (x.greater) {
      // グレーターエッセンスを巻き込む道 (2026-10-20 オーナー): マジック (候補 + 残す MOD) → エッセンス → 壁 → 候補を固定。残す MOD が「どれか」なら候補ごとに同じ重み
      const r0 = [...new Set(frac.flatMap((c) => runesOf(c.modId)))];
      const keeps = x.greater.keep ? [{ modId: x.greater.keep.modId, minTierIndex: x.greater.keep.minTierIndex }, ...(x.greater.keep.alts ?? [])] : [null];
      const forceOf = (c: { modId: string; minTierIndex: number }) => { const len = x.data.mods.get(c.modId)?.tiers.length ?? 0; return { mod: c.modId, ...(c.minTierIndex > 0 && len ? { tier: `T${len - c.minTierIndex}` } : {}) }; };
      const pick = frac.flatMap((c) => keeps.map((k) => ({ mods: [forceOf(c), ...(k ? [forceOf(k)] : [])], runes: r0, w: (x.fracWeights?.[c.modId] ?? 1) / keeps.length, fracture: c.modId })));
      const wallOmen = fracSide === "suffix" ? "OmenofDextralNecromancy" : "OmenofSinistralNecromancy";
      start = { kind: "bought", rarity: "magic", mods: pick[0]!.mods, price: x.startPrice, ...(x.sockets ? { sockets: x.sockets } : {}), ...(r0.length ? { runes: r0 } : {}), pick, fracture: pick[0]!.fracture,
        // レアにするのはそのエッセンス、無ければ王者 (反対側の狙いを一緒に揃えた時。2026-10-20)
        steps: [{ use: x.greater.essKey ?? "regal" }, ...(x.greater.keep ? [] : [{ use: "exalt" }]), { use: "desecrate", omens: [wallOmen] }] };
      return { recipe: { v: 3, base: x.base, itemLevel: x.itemLevel, start, routes }, error };
    }
    // 候補が複数なら、買うたびにどれが固定されたかを付きやすさの重みで選ぶ (2026-10-20)。ルーンは候補のどれかに要る物を全部
    // (候補を作る時に差しているので、マナが固定されてもコルの狩りは差さっている。前は固定された MOD のルーンだけで、マナの時に差さっていなかった)
    const r0 = [...new Set(frac.flatMap((c) => runesOf(c.modId)))];
    const pick = frac.length > 1 ? frac.map((c) => ({ mods: [fx(c)], runes: r0, w: x.fracWeights?.[c.modId] ?? 1 })) : undefined;
    start = { kind: "bought", mods: [fx(frac[0]!)], price: x.startPrice, ...(x.sockets ? { sockets: x.sockets } : {}), ...(r0.length ? { runes: r0 } : {}), ...(pick ? { pick } : {}) };
  }
  else if (x.start === "magic") start = { kind: "bought", mods: magicStartMods(x.data, x.targets), rarity: "magic", price: x.startPrice, ...(x.sockets ? { sockets: x.sockets } : {}) };
  else if (x.start === "four" && frac.length) start = { kind: "bought", mods: [{ mod: frac[0]!.modId }], fill: { prefix: 2, suffix: 2 }, price: x.startPrice };
  else {
    // 白から全部 ⑤ で答える時 (増強スパム): マジックで揃える狙い (増強スパム・フラクチャーの候補) にルーンの MOD があれば、そのルーンを差した白から
    // (マジックの間は差せないと付かない。固定済みから始める時と同じ)
    const r0 = magicGate.length ? [...new Set([...frac, ...x.targets.filter((t) => t.method === "augment").flatMap((t) => [t, ...(t.alts ?? [])])].flatMap((c) => runesOf(c.modId)))] : [];
    const rp = r0.reduce((a, en) => a + (x.runePrice?.(en) ?? 0), 0);
    start = { kind: "white", price: x.startPrice + rp, ...(x.sockets ? { sockets: x.sockets } : {}), ...(r0.length ? { runes: r0 } : {}) };
  }
  return { recipe: { v: 3, base: x.base, itemLevel: x.itemLevel, start, routes }, error };
}

/** 工程の名前 */
export const ROUTE_NAME: Record<string, [string, string]> = { main: ["", ""], prefix: ["プレフィックスに付いた工程", "Prefix route"], suffix: ["サフィックスに付いた工程", "Suffix route"] };
