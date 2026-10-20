/**
 * use-target-plans.ts — ② 狙う MOD の付け方の ▾ (付け方の予定・残りの付け方・自動の札)。StageTargetSummary.vue から分けた (2026-10-20 R3: ぶつかる所を割る)。
 * 中身は前のまま。auto = 自動の時 (高貴 / カオスは「自動」1 つに)
 */
import { craftStage } from "../../state/craft-stage";
import { CRAFTED_SOURCES } from "../../services/craft-stage/engine";
import { tr } from "../../i18n/lang";
import { methodsOff, toAugment } from "../../services/simulator/sim-methods";

export type TargetKind = "fracture" | "normal" | "desecrated" | "essence" | "perfect_essence";
type Kind = TargetKind;
export type Plan = "fracture" | "exalt" | "chaos" | "augment" | "desecrate" | "essence";
export const PLAN_JA: Record<Plan, string> = { fracture: "フラクチャー予定", exalt: "高貴ガチャ", chaos: "カオススパム", augment: "増強スパム", desecrate: "冒涜", essence: "エッセンス" };
/** 付け方の予定の色 (2026-10-05 オーナー「高貴ガチャは黄色、フラクチャーはオレンジ、冒涜は深緑」「カオスも黄色」) */
export const PLAN_CLS: Record<Plan, string> = {
  fracture: "border-orange-400/80 text-orange-200",
  exalt: "border-yellow-400/80 text-yellow-200",
  chaos: "border-yellow-400/80 text-yellow-200",
  augment: "border-yellow-400/80 text-yellow-200",
  desecrate: "border-green-700 text-green-500",
  essence: "border-sky-400/60 text-sky-200",
};
/**
 * 残りの付け方 (2026-10-21 オーナー「どっちも要る時は一段下に付け方で 1 MOD 群増やして、フラクチャー以外の付け方を選ばせる。どっちかなら要らん」
 * 「増強の場合とかでもどっちもの場合、後工程で付け方選ばせんとぐちゃる」)。候補が 2 つ以上のフラクチャー予定の組 (固定されなかった方) と
 * 増強スパムの組 (マジックで付くのは側ごとに 1 つ、残り) だけ。無し = どれか 1 つで良い。カオススパムは何個でも狙えるので整理の段の「全部 / どれか N」で足りる
 */
export const REST_PLANS = ["exalt", "chaos", "desecrate"] as const;
export type RestPlan = (typeof REST_PLANS)[number];

export function useTargetPlans(auto: () => boolean) {
  const s = craftStage;
  /** カオススパムは片側だけ (反対側にあれば選べない) */
  /**
   * ▾ で選べない付け方を組の全員分で (前は組の 1 つ目だけ見ていて、両側にまたがるフラクチャー候補の組をカオススパムに替えると両側にできた。
   * 2026-10-21 モンキーチェック)。一緒に替わる組の仲間は「ほかの狙い」に数えない。両側にまたがる組はカオススパムにできない (片側だけの決まり)
   */
  function planOff(g: { kind: string; host: string; hosts?: string[] }): ReturnType<typeof methodsOff> {
    const list = s.simTargets.value;
    const ids = g.kind === "fracture" ? list.filter((t) => t.method === "fracture").map((t) => t.modId) : g.hosts ?? [g.host];
    const off: ReturnType<typeof methodsOff> = {};
    for (const id of ids) for (const [k, v] of Object.entries(methodsOff(s.data.value, list.filter((t) => t.modId === id || !ids.includes(t.modId)), id))) off[k as keyof typeof off] ??= v;
    const sides = new Set(list.filter((t) => ids.includes(t.modId)).flatMap((t) => [t, ...(t.alts ?? [])]).map((x) => s.data.value?.mods.get(x.modId)?.type === "suffix"));
    // カオススパムは片側だけ (両側は側ごとに別のパターンで作る。[[sim-split-by-side]])。増強スパムは側ごとに分けて入る (toAugment) ので止めない
    if (sides.size > 1) off.chaos ??= "両側にまたがる組はカオススパムにできない (プレとサフィで別のパターンに分けて作る)";
    return off;
  }

  /**
   * 自動の時: 高貴ガチャ / カオススパムは「自動」1 つにまとめる (どちらにするかは最善手で決まる。設計 auto-flow-design の 1)。
   * フラクチャーの印・冒涜・エッセンスは今まで通り選ぶ。増強スパムは自動に未対応
   */
  const autoPlan = (p: Plan | null | undefined): boolean => !!auto() && (p === "exalt" || p === "chaos");
  const planLabel = (p: Plan): string => (autoPlan(p) ? tr("自動", "Auto") : PLAN_JA[p]);
  const samePlan = (a: Plan | null | undefined, b: Plan): boolean => a === b || (autoPlan(a) && autoPlan(b));
  function planList(host: string): Plan[] {
    const ps = plansOf(host);
    if (!auto()) return ps;
    const at = ps.findIndex((p) => autoPlan(p));
    const out = ps.filter((p) => !autoPlan(p));
    if (at >= 0) out.splice(at, 0, "exalt");
    return out;
  }
  const restList = (): readonly RestPlan[] => (auto() ? (["exalt", "desecrate"] as const) : REST_PLANS);
  function offOf(g: Parameters<typeof planOff>[0]): ReturnType<typeof planOff> {
    return auto() ? { ...planOff(g), augment: tr("自動は増強スパムに未対応", "Auto doesn't support Augmentation spam yet") } : planOff(g);
  }
  const AUTO_LABELS = { exalt: ["自動", "Auto"] } as const;
  function plansOf(host: string): Plan[] {
    const m = s.data.value?.mods.get(host);
    if (!m) return ["exalt"];
    if (m.source === "desecrated") return ["desecrate"];
    if (CRAFTED_SOURCES.has(m.source)) return ["essence"];
    return ["fracture", "exalt", "chaos", "augment", "desecrate"];
  }
  function planOf(g: { kind: Kind; host: string }): Plan {
    if (g.kind === "fracture") return "fracture";
    const t = s.simTargets.value.find((x) => x.modId === g.host);
    const ps = plansOf(g.host);
    return t?.method && (ps as string[]).includes(t.method) ? (t.method as Plan) : ps.find((p) => p !== "fracture") ?? ps[0]!;
  }
  /** ほかのフラクチャー予定と同じ側か (違う側も選べるが、同じ側を推奨。2026-10-05 オーナー「どっちも選択できるでいい、推奨とかで出しておけば」) */
  function canFracture(host: string): boolean {
    const type = s.data.value?.mods.get(host)?.type;
    return !s.simTargets.value.some((t) => t.method === "fracture" && t.modId !== host && s.data.value?.mods.get(t.modId)?.type !== type);
  }
  function setPlan(g: { kind: Kind; host: string; hosts?: string[] }, p: Plan): void {
    let list = s.simTargets.value;
    // 増強スパムは側ごとに 1 つ: 替える物をまとめて 1 つの狙い (かその側の増強スパムの候補) に (sim-methods の toAugment)
    if (p === "augment") { s.simTargets.value = toAugment(s.data.value, list, g.kind === "fracture" ? list.filter((t) => t.method === "fracture").map((t) => t.modId) : g.hosts ?? [g.host]); return; }
    if (g.kind === "fracture") {
      if (p === "fracture") return;
      // フラクチャー予定のまとまりを全部その付け方に (固定されなかった方の付け方 rest は外す)
      list = list.map((t) => { if (t.method !== "fracture") return t; const { rest: _r, ...o } = t; return { ...o, method: p }; });
    } else {
      const hs = g.hosts ?? [g.host];
      list = list.map((t) => (hs.includes(t.modId) ? { ...t, method: p } : t));
      // フラクチャー予定は一番上へ (最初に作る物)
      if (p === "fracture") list = [...list.filter((t) => t.method === "fracture"), ...list.filter((t) => t.method !== "fracture")];
    }
    s.simTargets.value = list;
  }


  const restable = (g: { kind: Kind; host: string; members: ReadonlyArray<{ modId: string }> }): boolean => g.members.length > 1 && (g.kind === "fracture" || planOf(g) === "augment");
  const restOf = (g: { kind: Kind; host: string }): RestPlan | null =>
    (g.kind === "fracture" ? s.simTargets.value.find((t) => t.method === "fracture" && t.rest)?.rest : s.simTargets.value.find((t) => t.modId === g.host)?.rest) ?? null;
  function restOff(g: { members: ReadonlyArray<{ modId: string }> }): Partial<Record<RestPlan, string>> {
    const side = (id: string): string => (s.data.value?.mods.get(id)?.type === "suffix" ? "suffix" : "prefix");
    const fs = side(g.members[0]!.modId);
    const out: Partial<Record<RestPlan, string>> = {};
    if (s.simTargets.value.some((t) => t.method === "chaos" && side(t.modId) !== fs)) out.chaos = "カオススパムは反対側で選んでいる (片側だけ)";
    if (g.members.some((m) => s.data.value?.mods.get(m.modId)?.source !== "normal")) out.exalt = out.chaos = "候補に普通の MOD 以外がある";
    return out;
  }
  function setRest(g: { kind: Kind; host: string }, p: RestPlan | null): void {
    const hit = (t: { modId: string; method?: string }): boolean => (g.kind === "fracture" ? t.method === "fracture" : t.modId === g.host);
    s.simTargets.value = s.simTargets.value.map((t) => { if (!hit(t)) return t; const { rest: _r, ...o } = t; return p ? { ...o, rest: p } : o; });
  }

  return { planOff, autoPlan, planLabel, samePlan, planList, restList, offOf, AUTO_LABELS, plansOf, planOf, canFracture, setPlan, restable, restOf, restOff, setRest };
}
export type TargetPlans = ReturnType<typeof useTargetPlans>;
