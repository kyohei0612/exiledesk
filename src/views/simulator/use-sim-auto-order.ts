/**
 * use-sim-auto-order.ts — ④ の「おすすめの順番を出す」(SimAutoOrder.vue) の状態 (シミュ部長、2026-10-20)。
 * 押した時だけ計算 (オーナー 10-20)、出た順に表へ、止める、② や始め方を直したら表を消す (古い数字を出さない)、
 * 「この順にする」= s.simOrder を差し替え (1 つ戻す・Ctrl+Z で戻る。use-sim-steps の Snap に順番を入れた)。
 * 候補・ワーカーは services/simulator/auto/auto-order.ts、1 つの順番の値は解析君の solveOrder。
 * 形の組み立て (buildAutoModel) もワーカーで (S1b、10-20: 画面の側で 1.7 秒止まった)。④ に居る間、狙いが変わったら 0.25 秒後に組み、
 * 出せない理由は押す前にボタンの横へ (点検 3)。押したら組んだ形でそのまま計算
 */
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { runeEnForId } from "../../services/simulator/pattern";
import { autoOrderClient, byCost, orderCandidates, type AutoBuildResult, type AutoRow, type OrderInput } from "../../services/simulator/auto/auto-order";
import type { QuizSimIn } from "../../services/simulator/quiz-build";
import { priceOf } from "../../state/craft-stage";
import { BONES, OMEN_GROUPS, ORBS } from "../../state/emulator/craft-stage-shelf";
import { simStep } from "../../state/web-page";
import { tr } from "../../i18n/lang";
import type { SimTargetsCtx } from "./use-sim-targets";

const ASTRID = "rune:Astrid's Creativity";
/** 1 位とこれ以内の差なら「ほぼ同じ」 */
const NEAR = 0.05;

/** quizBase = ⑤ に渡す物と同じ入力 (use-sim-run の quizBase) */
/** autoOn = 自動で組む時 (② でも範囲を組んで調べる。始め方は ③ で決まるので、② ではフラクチャー済みから始めるとして調べる) */
export function useSimAutoOrder(tg: SimTargetsCtx, quizBase: () => QuizSimIn | null, autoOn: () => boolean = () => false) {
  const { s, orderKeys, restRows, runeNeeded, redoOf, targetsSig } = tg;
  const rows = ref<AutoRow[]>([]);
  const busy = ref(false);
  const step = ref<{ done: number; total: number } | null>(null);
  const error = ref<string | null>(null);
  /** 出せない時の理由 (押した後) */
  const unsupported = ref<string | null>(null);
  /** 押す前に分かる出せない理由 (2026-10-20 点検 3: 押させてから断っていた)。ワーカーで組んだ結果 */
  const blocked = ref<string | null>(null);
  const client = autoOrderClient();
  /** 値段を引いた鍵 (次の build で先に渡す。足りない物はワーカーが聞き返す)。棚のカレンシー・骨・お告げは最初から */
  const known = new Set<string>([...ORBS.flatMap((g) => g.keys), ...BONES, ...OMEN_GROUPS.flatMap((g) => g.keys)]);
  const ask = (k: string): number => { known.add(k); return priceOf(k); };
  /** 今の狙いで組んだ (組んでいる) 結果。狙いが変わる・止めると null */
  let built: Promise<AutoBuildResult> | null = null;
  function build(): Promise<AutoBuildResult> {
    const sim = quizBase();
    if (!sim) return Promise.resolve({ ok: false, reason: { ja: "狙いが無い", en: "No targets" } });
    const { data: _d, runePrice: _r, ...rest } = sim;
    if (simStep.value === "mods") rest.start = "fractured";
    const p = client.build(rest, Object.fromEntries([...known].map((k) => [k, priceOf(k)])), ask);
    built = p;
    void p.then((r) => { if (built === p) blocked.value = r.ok ? null : tr(r.reason.ja, r.reason.en); });
    return p;
  }
  const onOrder = (): boolean => (simStep.value === "order" && orderKeys.value.length > 1) || (simStep.value === "mods" && autoOn() && s.simTargets.value.length > 0);
  let timer: ReturnType<typeof setTimeout> | null = null;
  function schedule(): void {
    built = null;
    if (timer) clearTimeout(timer);
    timer = onOrder() ? setTimeout(() => { timer = null; void build(); }, 250) : null;
  }

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

  /** 止める (ワーカーごと捨てるので組んだ形も消える。④ に居れば組み直す) */
  function stop(): void {
    client.stop();
    busy.value = false;
    step.value = null;
    schedule();
  }
  function clear(): void { if (busy.value) stop(); rows.value = []; error.value = null; unsupported.value = null; }

  async function start(): Promise<void> {
    clear();
    const inp = input();
    busy.value = true;
    const r = await (built ?? build());
    if (!busy.value) return;
    if (!r.ok) { unsupported.value = tr(r.reason.ja, r.reason.en); busy.value = false; return; }
    client.run(orderCandidates(inp), inp.keys, {
      step: (done, total) => { step.value = { done, total }; },
      row: (x) => { rows.value = [...rows.value, x].sort((a, b) => byCost(a.perFinish, b.perFinish)); },
      done: () => { busy.value = false; step.value = null; },
      error: (m) => { error.value = m; busy.value = false; step.value = null; built = null; },
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
  // ④ に入った時・狙いや始め方 (quizBase) が変わった時に組み直す
  watch(() => [quizBase(), simStep.value, orderKeys.value.length, autoOn()], schedule, { immediate: true });
  onBeforeUnmount(() => { if (timer) clearTimeout(timer); client.stop(); });

  return { rows, shown, busy, step, error, unsupported, blocked, start, stop, use };
}
