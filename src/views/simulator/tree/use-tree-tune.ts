/**
 * use-tree-tune.ts — ツリーを開いている間、エンジンの設定 (触媒の倍率・聖別の倍率・MOD の重み) をその木の設定 (doc.tune) にする (2026-10-22 オーナー
 * 「ここ (ツリー) でも、触媒などの設定を変えられるように」)。直すのはクラフトステージと同じ部品 (お告げの下の StageOmenTune・重みの欄。打つ手の棚と試し打ちの
 * HeldOmens に入っている) で、直したら木に書く (1 つ戻す・レシピ・共有の URL に乗る)。木を替えた・1 つ戻した時は木の値を入れ直す。
 * 閉じたらクラフトステージの設定に戻す (共通の set〜 で戻すので、ブラウザに覚えた値も元のまま)
 */
import { onBeforeUnmount, watch, type Ref } from "vue";
import { setStageTuning } from "../../../services/craft-stage/engine";
import { tuneOf, tuningOf, type TreeTune } from "../../../services/simulator/tree/tree-tune";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { catalysingPerPct, modWeights, resetModWeights, sanctifyK, setCatalysingPerPct, setModWeight, setSanctifyK } from "../../../state/stage/stage-tuning";

export function useTreeTune(doc: Ref<TreeDoc>, edit: (f: (d: TreeDoc) => void) => void): void {
  const keep = { cat: catalysingPerPct.value, san: sanctifyK.value, w: { ...modWeights.value } };
  const same = (a: TreeTune | undefined, b: TreeTune | undefined): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  /** 木の値を画面の状態とエンジンへ (ブラウザには覚えない = クラフトステージの設定は書き換えない) */
  function load(t: TreeTune | undefined): void {
    const s = tuningOf(t);
    catalysingPerPct.value = s.catalysingPerPct;
    sanctifyK.value = s.sanctifyK;
    modWeights.value = { ...s.modWeights };
    setStageTuning(s);
  }
  load(doc.value.tune);
  watch(() => doc.value.tune, (t) => { if (!same(t, now())) load(t); }, { deep: true });
  const now = (): TreeTune | undefined => tuneOf({ catalysingPerPct: catalysingPerPct.value, sanctifyK: sanctifyK.value, modWeights: modWeights.value });
  // 部品で直した = 木に書く (1 つ戻すの 1 手)
  watch([catalysingPerPct, sanctifyK, modWeights], () => {
    const t = now();
    if (!same(t, doc.value.tune)) edit((d) => { if (t) d.tune = t; else delete d.tune; });
  });
  onBeforeUnmount(() => {
    setCatalysingPerPct(keep.cat);
    setSanctifyK(keep.san);
    resetModWeights();
    for (const [id, w] of Object.entries(keep.w)) setModWeight(id, w);
  });
}
