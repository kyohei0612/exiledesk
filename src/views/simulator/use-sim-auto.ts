/**
 * use-sim-auto.ts — シミュレーターの自動 / 手動の切り替え (シミュ部長、2026-10-20 S2 の手 3。設計 docs/org/simulator/notes/2026-10-20-auto-flow-design.md の 1・2・3-3)。
 * オーナー 10-20 の決め (おすすめどおり): 自動の時は ② の付け方も自動・既定は手動で前回を覚える (sim-state の simAuto)・切ったら捨てる。
 *   - 切った時 (自動 → 手動): ② の付け方のうち自動が決める物 (高貴 / カオス・残りの付け方) を手動の既定に戻し、④ の順番・⑤ の答え・⑥ の結果を消して ② へ
 *   - 入れた時 (手動 → 自動): ⑤ の答え・⑥ の結果を消す。④ より先にいたら ④ へ (自動の計算は ④ から)
 *   - 消す物がある時だけ確かめの窓 (SimAutoConfirm.vue)。1 つ戻す (Ctrl+Z) で戻せる (use-sim-steps の Snap に simAuto)
 * 自動で選べる段は T2 以上まで (オーナー 10-20、README の決まり 5)。T1 だけの狙いがある時も「自動で組む」は押せて、確かめの窓で
 * 「T2 以上にして自動にする」を選ぶと T1 だけの狙いを T2 以上に下げて自動にする (S2b、オーナー 10-20。1 つ戻す・Ctrl+Z で戻る)。
 * フラクチャーで固定する MOD は打たないので除く・下げない (auto-model の frac は始めの形)。ただし「どっちも」(rest) の固定されなかった方は打つので入れる
 */
import { computed, ref } from "vue";
import { craftStage } from "../../state/craft-stage";
import { simAuto } from "../../state/simulator/sim-state";
import { simStep } from "../../state/web-page";
import type { Pattern } from "../../services/simulator/pattern";

/** 自動で決める付け方 (これ以外の冒涜・エッセンス・フラクチャー・増強スパムは MOD か人で決まる) */
const AUTO_METHODS = new Set(["exalt", "chaos"]);

export function useSimAuto(c: {
  modsDone: { value: boolean }; sortDone: { value: boolean }; orderDone: { value: boolean };
  results: { value: unknown[] };
  resetPatterns: () => void;
}) {
  const s = craftStage;
  /** T1 だけの狙い (自動にできない) があるか */
  /** T1 だけ (段が 2 つ以上ある MOD の一番上だけ) の狙いか */
  const t1Only = (m: { modId: string; minTierIndex: number }): boolean => { const n = s.data.value?.mods.get(m.modId)?.tiers.length ?? 0; return n > 1 && n - m.minTierIndex === 1; };
  const counts = (t: { method?: string; rest?: string }): boolean => !(t.method === "fracture" && !t.rest);
  const t1Block = computed(() => s.simTargets.value.some((t) => counts(t) && [t, ...(t.alts ?? [])].some(t1Only)));
  /** T1 だけの狙いを T2 以上に下げる (フラクチャーで固定する物は下げない) */
  function lowerT1(): void {
    const down = <T extends { modId: string; minTierIndex: number }>(m: T): T => (t1Only(m) ? { ...m, minTierIndex: m.minTierIndex - 1 } : m);
    s.simTargets.value = s.simTargets.value.map((t) => (counts(t) ? { ...down(t), ...(t.alts ? { alts: t.alts.map(down) } : {}) } : t));
  }
  /** 今の自動 (選んでいても T1 だけの狙いがあれば手動) */
  const autoOn = computed(() => simAuto.value && !t1Block.value);
  const hasAnswers = (): boolean => s.simPatterns.value.some((p: Pattern) => !!p.quiz && Object.values(p.quiz.rules).some((r) => r.length > 0));
  /** 切り替えで消える物があるか (確かめの窓を出すか) */
  function loses(to: boolean): number {
    const answers = s.simPatterns.value.reduce((a, p) => a + (p.quiz ? Object.values(p.quiz.rules).reduce((b, r) => b + r.length, 0) : 0), 0);
    if (to) return answers + (c.results.value.length ? 1 : 0);
    return answers + (c.results.value.length ? 1 : 0) + (c.orderDone.value ? 1 : 0) + (s.simTargets.value.some((t) => (t.method && AUTO_METHODS.has(t.method)) || t.rest) ? 1 : 0);
  }
  /** 確かめの窓 (null = 閉じている)。n = 手で入れた答えの数、t1 = T1 だけの狙いを T2 以上に下げて自動にする */
  const ask = ref<{ to: boolean; n: number; t1?: boolean } | null>(null);
  function apply(to: boolean): void {
    const t1 = !!ask.value?.t1;
    ask.value = null;
    if (to && t1) lowerT1();
    simAuto.value = to;
    if (!to) {
      // 自動が決めた付け方を手動の既定に (冒涜・エッセンス・フラクチャー・増強スパムは残す)
      s.simTargets.value = s.simTargets.value.map((t) => {
        const { rest: _r, ...o } = t;
        if (!t.method || !AUTO_METHODS.has(t.method)) return t.rest ? o : t;
        const { method: _m, ...p } = o;
        return p;
      });
      c.resetPatterns();
      s.simOrder.value = [];
      c.orderDone.value = false;
      c.modsDone.value = false; c.sortDone.value = false;
      simStep.value = "mods";
      return;
    }
    if (hasAnswers() || c.results.value.length) c.resetPatterns();
    if (simStep.value === "play" || simStep.value === "result") simStep.value = "order";
  }
  /** チェック・帯の札を押した時 */
  function toggle(to = !autoOn.value): void {
    const answers = s.simPatterns.value.reduce((a, p) => a + (p.quiz ? Object.values(p.quiz.rules).reduce((b, r) => b + r.length, 0) : 0), 0);
    if (to && t1Block.value) { ask.value = { to, n: answers, t1: true }; return; }
    if (loses(to) > 0) ask.value = { to, n: answers };
    else apply(to);
  }
  return { t1Block, autoOn, ask, toggle, apply };
}
export type SimAutoCtx = ReturnType<typeof useSimAuto>;
