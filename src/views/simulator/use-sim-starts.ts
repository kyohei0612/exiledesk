/**
 * use-sim-starts.ts — ③ ベースの値段の始め方の行・値段・一番安い始め方・白から自作の「買う値段までに作れる割合」。
 * StageSimPanel.vue から分けた (2026-10-20、500 行の決まり)
 */
import { computed, watch } from "vue";
import { craftStage } from "../../state/craft-stage";
import { tr } from "../../i18n/lang";
import { SIM_STARTS, type SimStartKind } from "../../services/simulator/sim-methods";
import { withinBudget } from "../../services/simulator/self-craft-dist";
import type { SimTargetsCtx } from "./use-sim-targets";
import type { SimRunCtx } from "./use-sim-run";

export function useSimStarts(c: SimTargetsCtx & Pick<SimRunCtx, "calc" | "whiteCosts"> & { whiteDecide: () => void }) {
  const s = craftStage;
  const { calc, whiteCosts, fracMembers, wholeRoute, rows, num, whiteDivine, boughtDivine, magicDivine, fourDivine, itemDivine, ageOf, whiteDecide } = c;
/** 3 の始め方の行。フラクチャーの始め方は 2 にフラクチャー予定がある時だけ (無ければ出さない。2026-10-18 オーナー)。「エミュレーターの状態から」の行は出さない (2026-10-19 オーナー「意味わからんから消しておk」。「この状態からシミュレーター」で来た時はその状態のまま) */
// グレーターエッセンスを巻き込む道は自前のフラクチャーだけ (4 MOD を買う・フラクチャー済みを買うは出さない。2026-10-20 オーナー「グレーター系で付ける奴はフラクチャー済み買いはできない」)
// 増強スパムの狙いがある時 (白から全部 ⑤ で答える。2026-10-21) も白だけ (マジックを通るので買う始め方は無い)
const startKinds = computed(() => SIM_STARTS.filter((k) => k.k !== "item" && (!k.needsFracture || (fracMembers.value.length > 0 && !wholeRoute.value && !calc.value?.greater))));
// 選んでいた始め方が一覧から消えたら (マジック・フラクチャー予定を外した時) 白ベースからに戻す。エミュレーターの状態からは行が無くても戻さない
watch(startKinds, (ks) => { if (s.simStart.value !== "item" && !ks.some((k) => k.k === s.simStart.value)) s.simStart.value = "white"; }, { immediate: true });
/** 使えない始め方の理由 (今は出さない作りなので空。行の作りは残す) */
const startOff = (_k: (typeof SIM_STARTS)[number]): string => "";
/** 入れた時刻の札 (始め方 → 値段の欄。エミュレーターの状態からは無い) */
const startAge = (k: SimStartKind): ReturnType<typeof ageOf> | null => (k === "item" ? null : ageOf(k === "fractured" ? "bought" : k));
/**
 * その始め方の右の値段 (高貴建て。入れていなければ null)。フラクチャー予定がある時は「フラクチャー済みのベースになるまで」の費用で比べる
 * (ベースの値段だけだと、白が一番安いと出てしまう。2026-10-18 初めての 10 人の 6 人目)。4 の段の比べ (use-sim-result の routes) と同じ式
 */
function startCost(k: SimStartKind): number | null {
  const base = num(k === "white" ? whiteDivine.value : k === "fractured" ? boughtDivine.value : k === "magic" ? magicDivine.value : k === "four" ? fourDivine.value : itemDivine.value);
  if (!fracMembers.value.length || wholeRoute.value || k === "item" || base == null) return base;
  if (k === "fractured") return base + (calc.value?.keep?.chaos ?? 0);
  const c = calc.value;
  if (!c || c.cantRoll) return null;
  // 反対側の狙いが付くまで (白から自作は「一緒に揃える」と「固定してからカオス」の安い方、買う始め方はカオス。2026-10-20)
  const kp = c.keep ? (k === "white" ? Math.min(c.keep.together, c.keep.chaos) : c.keep.chaos) : 0;
  if (k === "four") return c.fourTotal != null ? c.fourTotal + kp : null;
  return (k === "white" ? c.total : (c.fracP > 0 ? (base + c.buyRest) / c.fracP : Infinity) + c.after) + kp;
}
/**
 * 白から自作の上限 (2026-10-21 オーナー「フラクチャー済み、4MOD レアの高い方のベース値段を試算上限としたら、越したらもうその白ベースから
 * フラクチャーの道はない」)。比べは同じ所まで (フラクチャー済み + 反対側の狙い)。買う方の値段が 1 つも無ければ上限なし
 */
const whiteCap = computed((): number | null => {
  if (!fracMembers.value.length || wholeRoute.value) return null;
  const xs = (["fractured", "four"] as const).filter((k) => startKinds.value.some((x) => x.k === k)).map((k) => startCost(k)).filter((x): x is number => x != null && Number.isFinite(x));
  return xs.length ? Math.max(...xs) : null;
});
/** 白から自作が上限を越えた (この道は無し。一番安いの候補にも出さない) */
const whiteOver = computed(() => { const c = startCost("white"); return whiteCap.value != null && c != null && c > whiteCap.value; });
/** グレーターの道でマジックに揃える反対側の MOD の文 (どれかは「／」で) */
const keepText = computed(() => { const k = calc.value?.greater?.keep; return k ? [k, ...(k.alts ?? [])].map((x) => rows.value.find((r) => r.modId === x.modId)?.text ?? rows.value.flatMap((r) => r.alts).find((a) => a.modId === x.modId)?.text ?? x.modId).join(" ／ ") : ""; });
/** 右の値段が何か (フラクチャー予定がある時はフラクチャー済みまで) */
const costNote = computed(() => (wholeRoute.value ? tr("右の値段 = 白のベース 1 個 (増強スパムの狙いがあるので、白から全部 ⑤ の打ち方で答える。費用は ⑤ の答えで決まる)", "Price = one white base (with an Augmentation-spam target, the whole craft is answered in step 5 from white; the cost comes from those answers)") : fracMembers.value.length ? `右の値段 = フラクチャー済みのベースになるまで (ベース代・壁・フラクチャー・消去込み、平均)${calc.value?.keep ? ` + ${keepName.value} が付くまで` : ""}` : "右の値段 = ベース 1 個の値段"));
/** 反対側で取る狙いの短い名前 */
const keepName = computed(() => { const r = rows.value.find((x) => x.modId === calc.value?.keep?.host); return r ? [r.text, ...r.alts.map((a) => a.text)].map((t) => t.replace(/\s*\([^()]*\d[^()]*\)/g, "").replace(/%$/, "")).join(" ／ ") + ` ${r.rank} 以上` : ""; });
/** 一番安い始め方 (値段の入った物から。③ の「次へ」の上に出し、次へでその始め方にする。2026-10-20 オーナー「計算画面で一番安い始め方を表示して次へ」) */
const bestStart = computed(() => {
  if (!fracMembers.value.length || wholeRoute.value) return null;
  const xs = startKinds.value.filter((k) => startCost(k.k) != null && !(k.k === "white" && whiteOver.value)).map((k) => ({ k: k.k, label: tr(k.label, k.labelEn), c: startCost(k.k)! }));
  return xs.length ? xs.reduce((a, x) => (x.c < a.c ? x : a)) : null;
});
/** 白から自作を、一番高い買う値段 (比べの値段) まで回したら何割できるか (2026-10-20 オーナー「上限は一番高いベースに設定して、その金額まで回した結果」) */
const whiteBudget = computed(() => {
  // 上限は白から自作の上限と同じ (フラクチャー済み・4 MOD の高い方)。越えて道が無い時は出さない
  const budget = whiteCap.value;
  if (budget == null || whiteOver.value || !whiteCosts.value) return null;
  return { budget, ...withinBudget(whiteCosts.value, budget) };
});
function decideStart(): void { const b = bestStart.value; if (b) s.simStart.value = b.k; whiteDecide(); }
/** 値段が入った始め方が 2 つ以上ある時の一番安い物 (フラクチャー予定がある時だけ比べに入れる) */
const cheapStart = computed((): SimStartKind | null => {
  const ok = startKinds.value.filter((k) => !startOff(k) && startCost(k.k) != null && !(k.k === "white" && whiteOver.value)).map((k) => ({ k: k.k, c: startCost(k.k)! }));
  return ok.length > 1 ? ok.reduce((a, b) => (b.c < a.c ? b : a)).k : null;
});
/**
 * ④ の上の「ベースの計算」の行 (2026-10-21 オーナー「③ はベース計算へで ④ にパスして、付ける順番の所にベースを計算後表示、その上で MOD 順番の方が綺麗」)。
 * ③ は値段を入れるだけ、費用・一番安い印・内訳はここ。base = 内訳の「?」に渡す入れた値段
 */
const baseRows = computed(() => {
  const rows: Array<{ k: SimStartKind; label: string; cost: number | null; base: number | null; over?: number }> = startKinds.value.map((k) => ({
    k: k.k, label: tr(k.label, k.labelEn), cost: startCost(k.k), ...(k.k === "white" && whiteOver.value ? { over: whiteCap.value! } : {}),
    base: num(k.k === "four" ? fourDivine.value : k.k === "fractured" ? boughtDivine.value : k.k === "white" ? whiteDivine.value : itemDivine.value),
  }));
  return rows;
});
/** ④ で始め方を選び直す。変わったら打ち方のパターンはやり直し (use-sim-steps の始め方の見張り) */
function chooseStart(k: SimStartKind): void { s.simStart.value = k; }
  return { startKinds, startOff, startAge, startCost, whiteCap, whiteOver, keepText, costNote, keepName, bestStart, whiteBudget, decideStart, cheapStart, baseRows, chooseStart };
}
