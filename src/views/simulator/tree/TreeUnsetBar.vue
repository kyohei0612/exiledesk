<!--
  TreeUnsetBar.vue — 木の枠の下の真ん中の帯「! 未設定 n つ ▸ 次へ」(案 B、S-89b、スイッチ unsetMark。10-28 深夜オーナー「未設定は穴と同意義で赤枠でいいと思うわ。Bで」)。
  数は箱の右上の「!」の数 = 決める事が残っている箱 (足りない所に何か出ている箱。10-28 深夜オーナー「この未定ってマーク共通にして全体」)。
  押すと上から順に 1 つずつその箱へ寄る (最後の次は最初へ)。色は足りない所と同じ赤 (未設定と穴を別の色にしない)
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { tr } from "../../../i18n/lang";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import type { CheckIssue } from "../../../services/simulator/tree/tree-check";
import { holesCount } from "./hole-check";
import { nextCmp } from "../../../services/simulator/tree/tree-ideal-first";

/** n = 未設定の数 (困り事の出た箱の数、箱の無い木の不具合も 1 つ。上の札・一覧の見出しと同じ数、11-08) */
const props = defineProps<{ issues: readonly CheckIssue[] | null; n: number; doc: TreeDoc }>();
const emit = defineEmits<{ go: [id: string] }>();
/** 未設定の箱 (上の段から、同じ段は左から) */
const ids = computed(() => {
  const d = props.doc;
  const set = [...new Set((props.issues ?? []).filter((x) => d.boxes[x.boxId]).map((x) => x.boxId))];
  return set.sort(nextCmp(d)); // buildHitsFirst の ① は当たりの道を左の枝から深く (S-142j ⑤)、ほかは上の段から
});
const at = ref(-1);
function next(): void {
  if (!ids.value.length) return;
  at.value = (at.value + 1) % ids.value.length;
  emit("go", ids.value[at.value]!);
}
</script>

<template>
  <!-- 木の枠の一番下の帯 (木の面はこの上で終わる = 箱の MOD に被らない。⑦11 → ブラック案・オーナー「進めてくれ」10-28) -->
  <!-- 帯は未設定が 0 の時も置く (札が出た時に木の面が縮んで下の＋が札の裏へ隠れない、11-10 最終チェック。ブラック 75「札の分だけ木の下に余白」) -->
  <!-- 11-11 オーナー「基本的に動かせる奴全部枠内におさめてほしい」: 帯は地も線も無し、札だけを木の面の下の真ん中に浮かせる (木の面・段の札は枠の下まで)。寄せは札の分を下に空けて数える (use-tree-flow の BAR_GAP) -->
  <div data-tree-unset-strip class="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex h-11 items-center justify-center">
  <button v-if="n" type="button" data-tree-unset-bar class="pointer-events-auto flex items-center gap-2 whitespace-nowrap rounded-full border-2 border-rose-500 bg-[#1a0f10]/95 py-1 pl-1.5 pr-3 text-[13px] font-bold text-rose-100 shadow-[0_0_16px_rgba(244,63,94,0.45)] hover:bg-[#2a1416]"
    :title="tr('手も戻りも完成も決めていない箱 (＋ が出ている箱)。押すと順にその箱へ寄る', 'Boxes with no next step, return or finish yet (the ones showing ＋). Click to jump to each in turn')" @click="next">
    <span class="flex size-5 items-center justify-center rounded-full bg-rose-600 text-[12px] text-white">!</span>
    <span>{{ holesCount(n) }}</span>
    <span class="text-rose-300">{{ tr("▸ 次へ", "▸ Next") }}</span>
  </button>
  </div>
</template>
