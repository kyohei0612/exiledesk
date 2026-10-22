/**
 * use-tree-run.ts — ツリーの「100 人回す」の状態 (2026-10-22 オーナー「回すボタンもやろ？」「オーバーレイでいい、修正しやすい」)。
 * 回すのは services/simulator/tree/tree-run.ts の runTreeSteps を 1 人ずつ区切り、2 人ごとに途中の結果を出して画面を返す。
 * 結果は木の上に重ねる層 (TreeRunLayer.vue) だけが読む。組み替えたら消す (位置を動かしただけでは消さない)
 */
import { computed, ref, watch, type Ref } from "vue";
import { runTreeSteps, type TreeRunResult } from "../../../services/simulator/tree/tree-run";
import { withTreeTune } from "../../../services/simulator/tree/tree-tune";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { craftStage as s } from "../../../state/craft-stage";
import { routeKeyOf } from "./use-tree-check";

/** 回す人数 (帯の「100 人回した時」と同じ)。seed は台本・解析君と同じ 1 */
export const RUN_N = 100;
/** 途中の結果を出す間隔 (人) と、その間の最低の間 (ms)。速い木でも 3 秒ほどかけて数字が増えていくのが見える (オーナー「ヌルヌルとカウントアップ」) */
const EVERY = 2;
const PACE_MS = 60;

/** onHalt = 止まった人が出て止めた時 (その箱へ寄る) */
export function useTreeRun(doc: Ref<TreeDoc>, startCost: () => number, priceOf: (key: string) => number, onHalt: (box: string) => void) {
  const result = ref<TreeRunResult | null>(null);
  const running = ref(false);
  /** 層を出しているか (隠すと今の組む画面のまま) */
  const shown = ref(true);
  /** 止まった人が出て途中で止めた時の箱と人数 (10-22 オーナー「止まった瞬間 100 人回すの止めて修正しなよ」) */
  const halted = ref<{ box: string; n: number } | null>(null);
  let token = 0;
  // 組み替えたら結果を消す (回している途中なら止める)
  watch(() => routeKeyOf(doc.value), () => { token++; result.value = null; running.value = false; halted.value = null; });
  async function run(): Promise<void> {
    const data = s.data.value;
    if (!data || running.value) return;
    const my = ++token;
    running.value = true; shown.value = true; result.value = null; halted.value = null;
    const d = doc.value;
    // 相場は高貴建て → 神に直す (tree-base-cost と同じ。そのまま渡すと 2000 神の打ち止めに当たって完成 8% になった、10-22 開発版で見た)
    const div = priceOf("divine") || 1;
    let last: TreeRunResult | null = null;
    const g = runTreeSteps(data, d, { n: RUN_N, seed: 1, price: (k) => priceOf(k) / div, startCost: startCost(), every: 1, onProgress: (r) => { last = r; if (my === token) result.value = r; } });
    try {
      let t0 = performance.now();
      for (;;) {
        const r = withTreeTune(d, () => g.next());
        if (my !== token) return;
        if (r.done) { result.value = r.value; break; }
        // 1 人でも止まったらそこで止める (直してから回し直す)。打ち止め (神・手の上限) は止まりではないので続ける
        const st = last ? Object.keys((last as TreeRunResult).stuckAt)[0] : undefined;
        if (st) { halted.value = { box: st, n: r.value }; onHalt(st); break; }
        const wait = r.value % EVERY ? 0 : Math.max(0, PACE_MS - (performance.now() - t0));
        await new Promise((res) => setTimeout(res, wait));
        if (!(r.value % EVERY)) t0 = performance.now();
      }
    } finally { if (my === token) running.value = false; }
  }
  /** 止まり・打ち止めの箱 (多い順) */
  const stuckBoxes = computed(() => Object.entries(result.value?.stuckAt ?? {}).sort((a, z) => z[1] - a[1]));
  return { result, running, shown, halted, run, stuckBoxes };
}
