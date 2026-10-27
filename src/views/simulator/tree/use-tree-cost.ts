/**
 * use-tree-cost.ts — 始まりの箱のベースの値段 (use-tree.ts から分けた、1 ファイル 500 行まで、10-28)。中身は前のまま。
 * 始め方を ③ の計算で比べた一番安い物 (tree-base-cost.ts)。計算は 1 回 3〜4 秒かかるので、値段に関わる物だけを鍵にし、箱を出し終えてから (allowCost) 回し、同じ鍵と相場の答えは覚える
 */
import { computed, ref, watch, type Ref } from "vue";
import { craftStage as s } from "../../../state/craft-stage";
import { nameOfKey } from "../../../state/for-share/craft-stage-shelf";
import { freshItem } from "../../../services/craft-stage/engine";
import { treeBaseCost } from "../../../services/simulator/tree/tree-base-cost";
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
  const baseCost = computed(() => {
    const d = s.data.value;
    if (!d) return null;
    if (!costReady.value) return null;
    const key = costKey.value;
    const { b, l, s: st, m } = JSON.parse(key) as { b: string; l: number; s: ReturnType<typeof startOf>; m: Aim[] };
    // 相場 (神の値段と骨・オーブの値段) も鍵に。ここで読むので相場が変われば計算し直す
    const mk = `${key}|${treePrice("divine")}|${treePrice("exalt")}|${treePrice("chaos")}|${treePrice("exalt_greater")}`;
    const hit = costMemo.get(mk);
    if (hit) return hit;
    const r = treeBaseCost(d, { ...newTree(b, l), start: st, memoAims: m }, st.prices ?? {}, treePrice, (k) => nameOfKey(k, freshItem(d, b, l, "rare"))); // 名前はそのベースで引く (骨の名前が部位で変わる。前はクラフト台のアイテムで引いていた)
    costMemo.set(mk, r);
    return r;
  });
  /** 始まりの値段をまだ計算していない (題の横の札) */
  const baseCostBusy = computed(() => !!s.data.value && !costReady.value);
  return { baseCost, baseCostBusy, allowCost };
}
