/**
 * use-tree-cost.ts — 始まりの箱のベースの値段 (use-tree.ts から分けた、1 ファイル 500 行まで、10-28)。中身は前のまま。
 * 始め方を ③ の計算で比べた一番安い物 (tree-base-cost.ts)。計算は 1 回 3〜4 秒かかるので、値段に関わる物だけを鍵にし、箱を出し終えてから (allowCost) 回し、同じ鍵と相場の答えは覚える
 */
import { computed, ref, watch, type Ref } from "vue";
import { craftStage as s } from "../../../state/craft-stage";
import { nameOfKey } from "../../../state/for-share/craft-stage-shelf";
import { freshItem } from "../../../services/craft-stage/engine";
import { treeBaseCost } from "../../../services/simulator/tree/tree-base-cost";
import { withLoopsSoon } from "../../../services/simulator/start-cost";
import { fractureMarks, newTree, startOf, type Aim, type TreeDoc } from "../../../services/simulator/tree/tree-model";

export function makeBaseCost(doc: Ref<TreeDoc>, treePrice: (key: string) => number) {
  // 印 (✦) は memoAims にある (10-23 に start から移した)。前は鍵にも渡す木にも入れず、比べがいつも「✦ が無い」で止まり値段が 0 だった (10-24 夜 21 本目)
  const costKey = computed(() => JSON.stringify({ b: doc.value.base, l: doc.value.itemLevel, s: startOf(doc.value), m: fractureMarks(doc.value) }));
  const costReady = ref(false);
  let costAsked = false;
  /** 始まりの値段の計算を始めてよい (ツリーのページが箱を全部出し終えた時、use-tree-reveal)。描いてから (2 フレーム待って) 計算する */
  function allowCost(): void {
    if (costReady.value || costAsked) return;
    costAsked = true;
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => { costReady.value = true; }, 0)));
  }
  /**
   * 箱を出し終えた合図が来ない時の逃げ道: データが来て COST_WAIT_MS たっても来なければ計算を始める (題の横の「始まりの値段を計算中」が消えない、
   * 10-25 オーナー「このリロードなんだ」。手元 1440 の読み直しの重なりで use-tree が 2 つの版になり、合図が別の版へ行って出たままだった)
   */
  const COST_WAIT_MS = 5000;
  watch(() => !!s.data.value, (ok) => { if (ok) setTimeout(allowCost, COST_WAIT_MS); }, { immediate: true });
  const costMemo = new Map<string, ReturnType<typeof treeBaseCost>>();
  /** 裏で計算中の鍵 (区切って打つ間は画面を返す。済んだら costTick で出し直す) */
  const costRunning = ref<string | null>(null), costTick = ref(0);
  const pause = (): Promise<void> => new Promise((ok) => { const t = setTimeout(ok, 50); requestAnimationFrame(() => setTimeout(() => { clearTimeout(t); ok(); }, 0)); }); // 隠れたタブでも止まらない
  /** 値段の鍵 (相場 = 神の値段と骨・オーブの値段も入れる。ここで読むので相場が変われば計算し直す) */
  const costMk = computed(() => (s.data.value && costReady.value ? `${costKey.value}|${treePrice("divine")}|${treePrice("exalt")}|${treePrice("chaos")}|${treePrice("exalt_greater")}` : null));
  // 計算は 1 回 0.5 秒ほど (③ のマジックのループを 300 人打つ)。区切って裏で回す (開いた直後に画面が止まった、11-06 sim-light4)。式と答えは前のまま
  watch(costMk, (mk) => {
    const d = s.data.value;
    if (!mk || !d || costMemo.has(mk) || costRunning.value === mk) return;
    costRunning.value = mk;
    const { b, l, s: st, m } = JSON.parse(costKey.value) as { b: string; l: number; s: ReturnType<typeof startOf>; m: Aim[] };
    void withLoopsSoon(() => treeBaseCost(d, { ...newTree(b, l), start: st, memoAims: m }, st.prices ?? {}, treePrice, (k) => nameOfKey(k, freshItem(d, b, l, "rare"))), pause) // 名前はそのベースで引く (骨の名前が部位で変わる。前はクラフト台のアイテムで引いていた)
      .then((r) => { costMemo.set(mk, r); }, () => {})
      .finally(() => { if (costRunning.value === mk) costRunning.value = null; costTick.value++; });
  }, { immediate: true });
  const baseCost = computed(() => { void costTick.value; const mk = costMk.value; return mk ? costMemo.get(mk) ?? null : null; });
  /** 始まりの値段をまだ計算していない・計算中 (題の横の札) */
  const baseCostBusy = computed(() => !!s.data.value && (!costReady.value || !!costRunning.value));
  return { baseCost, baseCostBusy, allowCost };
}
