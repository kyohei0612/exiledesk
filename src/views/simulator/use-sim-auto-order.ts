/**
 * use-sim-auto-order.ts — ④ の「おすすめの順番を出す」(SimAutoOrder.vue) の状態 (シミュ部長、2026-10-20)。
 * 押した時だけ計算 (オーナー 10-20)、出た順に表へ、止める、② や始め方を直したら表を消す (古い数字を出さない)、
 * 「この順にする」= s.simOrder を差し替え (1 つ戻す・Ctrl+Z で戻る。use-sim-steps の Snap に順番を入れた)。
 * 候補・ワーカーは services/simulator/auto/auto-order.ts、1 つの順番の値は解析君の solveOrder
 */
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { runeEnForId } from "../../services/simulator/pattern";
import { byCost, orderCandidates, runAutoOrder, type AutoRow, type OrderInput } from "../../services/simulator/auto/auto-order";
import { buildAutoModel } from "../../services/simulator/auto/auto-solve";
import type { QuizSimIn } from "../../services/simulator/quiz-build";
import { priceOf } from "../../state/craft-stage";
import { tr } from "../../i18n/lang";
import type { SimTargetsCtx } from "./use-sim-targets";

const ASTRID = "rune:Astrid's Creativity";
/** 1 位とこれ以内の差なら「ほぼ同じ」 */
const NEAR = 0.05;

/** quizBase = ⑤ に渡す物と同じ入力 (use-sim-run の quizBase) */
export function useSimAutoOrder(tg: SimTargetsCtx, quizBase: () => QuizSimIn | null) {
  const { s, orderKeys, restRows, runeNeeded, redoOf, targetsSig } = tg;
  const rows = ref<AutoRow[]>([]);
  const busy = ref(false);
  const step = ref<{ done: number; total: number } | null>(null);
  const error = ref<string | null>(null);
  /** 出せない時の理由 (押した後) */
  const unsupported = ref<string | null>(null);
  let job: { stop: () => void } | null = null;

  /** ④ の今の状態から候補を作る材料 */
  function input(): OrderInput {
    const keys = orderKeys.value;
    const aug = restRows.value.filter((r) => r.method === "augment").map((r) => `mod:${r.modId}`);
    const runeAt: OrderInput["runeAt"] = {};
    for (const rk of runeNeeded.value) {
      if (!keys.includes(rk)) continue;
      const before = restRows.value.filter((r) => [r.modId, ...r.alts.map((a) => a.modId)].some((id) => {
        const rn = s.data.value?.mods.get(id)?.rune;
        return rn != null && `rune:${runeEnForId(rn)}` === rk;
      })).map((r) => `mod:${r.modId}`);
      if (before.length) runeAt[rk] = { before, nth: 1 };
      else if (rk === ASTRID) runeAt[rk] = { before: restRows.value.filter((r) => r.method === "essence").map((r) => `mod:${r.modId}`), nth: 2 };
    }
    const redo: Record<string, number> = {}, side: Record<string, string> = {};
    for (const r of restRows.value) {
      const k = `mod:${r.modId}`;
      redo[k] = redoOf.value.get(r.modId)?.expected ?? 0;
      side[k] = r.side.startsWith("プレ") ? "p" : "s";
    }
    return { keys, aug, runeAt, redo, side };
  }

  function stop(): void {
    job?.stop();
    job = null;
    busy.value = false;
    step.value = null;
  }
  function clear(): void { stop(); rows.value = []; error.value = null; unsupported.value = null; }

  function start(): void {
    clear();
    const inp = input();
    const sim = quizBase();
    if (!sim) return;
    const built = buildAutoModel({ sim, price: priceOf });
    if (!built.ok) { unsupported.value = tr(built.reason.ja, built.reason.en); return; }
    busy.value = true;
    job = runAutoOrder(built.model, orderCandidates(inp), inp.keys, {
      step: (done, total) => { step.value = { done, total }; },
      row: (r) => { rows.value = [...rows.value, r].sort((a, b) => byCost(a.perFinish, b.perFinish)); },
      done: () => { busy.value = false; step.value = null; job = null; },
      error: (m) => { error.value = m; busy.value = false; step.value = null; job = null; },
    });
  }

  /** 出す行: 上位 3 つ + 今の順番 (上位に入っていなければ 4 行目) */
  const shown = computed(() => {
    const cur = orderKeys.value.join("|");
    const top = rows.value.slice(0, 3);
    const mine = rows.value.find((r) => r.current);
    const best = rows.value[0]?.perFinish ?? Infinity;
    const list = mine && !top.includes(mine) ? [...top, mine] : top;
    return list.map((r) => ({
      ...r,
      /** 今の ④ の並びと同じ */
      now: r.order.join("|") === cur,
      near: r !== rows.value[0] && Number.isFinite(best) && r.perFinish <= best * (1 + NEAR),
    }));
  });

  /** この順にする (勝手には並べ替えない。押した物だけ) */
  function use(order: string[]): void { s.simOrder.value = [...order]; }

  // ② の狙い・始め方・ベース・始めの値段を直したら表を消す
  watch(() => [targetsSig(), s.simStart.value, s.base.value, quizBase()?.startPrice], clear);
  onBeforeUnmount(stop);

  return { rows, shown, busy, step, error, unsupported, start, stop, use };
}
