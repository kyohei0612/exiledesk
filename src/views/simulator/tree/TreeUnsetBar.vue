<!--
  TreeUnsetBar.vue — 木の枠の下の真ん中の帯「! 未設定 n つ ▸ 次へ」(案 B、S-89b、スイッチ unsetMark。10-28 深夜オーナー「未設定は穴と同意義で赤枠でいいと思うわ。Bで」)。
  数は箱の右上の「!」の数 = 決める事が残っている箱 (足りない所に何か出ている箱。10-28 深夜オーナー「この未定ってマーク共通にして全体」)。
  押すと上から順に 1 つずつその箱へ寄る (最後の次は最初へ)。色は足りない所と同じ赤 (未設定と穴を別の色にしない)
  木の途中の未設定 (S-107d・U-05f、スイッチ actLog) は赤に数えず琥珀: 出た時に 1 枚 (このまま送る・どこ？・×)、閉じた後は琥珀の札「? 途中の未設定 n つ ▸ 次へ」
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { tr } from "../../../i18n/lang";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import type { CheckIssue } from "../../../services/simulator/tree/tree-check";
import { holesCount } from "./hole-check";
import { nextCmp } from "../../../services/simulator/tree/tree-ideal-first";
import { midCardHead, midCardSub, midChip, midIdsOf, midSendAsIs, midWhere } from "./tree-mid-unset";

/** n = 未設定の数 (困り事の出た箱の数、箱の無い木の不具合も 1 つ。上の札・一覧の見出しと同じ数、11-08)。mid = 木の途中の未設定 (S-107d) */
const props = defineProps<{ issues: readonly CheckIssue[] | null; n: number; doc: TreeDoc; mid?: readonly CheckIssue[]; /** 開いた直後からある打てない手の箱 (S-107d) */ cant?: readonly string[] }>();
const emit = defineEmits<{ go: [id: string]; report: [] }>();
const midIds = computed(() => midIdsOf(props.mid ?? []));
/** 箱の id を上の段から (同じ段は左から) */
const sorted = (list: readonly string[]): string[] => [...new Set(list)].filter((id) => props.doc.boxes[id]).sort(nextCmp(props.doc)); // buildHitsFirst の ① は当たりの道を左の枝から深く (S-142j ⑤)、ほかは上の段から
/** 赤の未設定の箱 (途中の未設定だけの箱は除く) */
const ids = computed(() => sorted((props.issues ?? []).filter((x) => !(x.kind === "orphan" && midIds.value.has(x.boxId))).map((x) => x.boxId)));
const mids = computed(() => sorted([...midIds.value]));
const cants = computed(() => sorted((props.cant ?? []).filter((id) => !midIds.value.has(id))));
/** 誘いの箱 (途中の未設定 → 打てない手の順) */
const nudge = computed(() => [...mids.value, ...cants.value]);
function stepper(list: () => string[]): () => void {
  const at = ref(-1);
  return () => { const l = list(); if (!l.length) return; at.value = (at.value + 1) % l.length; emit("go", l[at.value]!); };
}
const next = stepper(() => ids.value);
const nextMid = stepper(() => nudge.value);
/** 1 枚を閉じた (×・このまま送る)。途中の未設定が 0 から出直すたびに開き直す */
const shut = ref(false);
watch(() => nudge.value.length > 0, (on) => { if (on) shut.value = false; });
function sendAsIs(): void { shut.value = true; emit("report"); }
</script>

<template>
  <!-- 木の枠の一番下の帯 (木の面はこの上で終わる = 箱の MOD に被らない。⑦11 → ブラック案・オーナー「進めてくれ」10-28) -->
  <!-- 帯は未設定が 0 の時も置く (札が出た時に木の面が縮んで下の＋が札の裏へ隠れない、11-10 最終チェック。ブラック 75「札の分だけ木の下に余白」) -->
  <!-- 11-11 オーナー「基本的に動かせる奴全部枠内におさめてほしい」: 帯は地も線も無し、札だけを木の面の下の真ん中に浮かせる (木の面・段の札は枠の下まで)。寄せは札の分を下に空けて数える (use-tree-flow の BAR_GAP) -->
  <div data-tree-unset-strip class="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex h-11 items-center justify-center gap-2">
  <!-- 途中の未設定の 1 枚 (札の上に浮かせる、U-05f) -->
  <div v-if="nudge.length && !shut" data-tree-mid-card role="status" class="pointer-events-auto absolute bottom-full mb-1 flex w-[440px] max-w-[calc(100%-1rem)] flex-col gap-1.5 rounded-xl border-2 border-amber-400/80 bg-[#1c160c]/95 px-3 py-2 text-amber-100 shadow-[0_0_16px_rgba(251,191,36,0.35)]">
    <div class="flex items-start gap-2">
      <span class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[12px] font-bold text-black">?</span>
      <b class="min-w-0 flex-1 text-[13px] leading-5">{{ midCardHead(mids.length, cants.length) }}</b>
      <button type="button" data-tree-mid-close class="shrink-0 rounded px-1 text-amber-200/80 hover:text-amber-100" :aria-label="tr('閉じる', 'Close')" @click="shut = true">×</button>
    </div>
    <p class="pl-7 text-[12px] leading-4 opacity-80">{{ midCardSub() }}</p>
    <div class="flex gap-2 pl-7">
      <button type="button" data-tree-mid-send class="g-btn sm" @click="sendAsIs">{{ midSendAsIs() }}</button>
      <button type="button" data-tree-mid-where class="g-btn sm" @click="nextMid">{{ midWhere() }}</button>
    </div>
  </div>
  <button v-if="n" type="button" data-tree-unset-bar class="pointer-events-auto flex items-center gap-2 whitespace-nowrap rounded-full border-2 border-rose-500 bg-[#1a0f10]/95 py-1 pl-1.5 pr-3 text-[13px] font-bold text-rose-100 shadow-[0_0_16px_rgba(244,63,94,0.45)] hover:bg-[#2a1416]"
    :title="tr('手も戻りも完成も決めていない箱 (＋ が出ている箱)。押すと順にその箱へ寄る', 'Boxes with no next step, return or finish yet (the ones showing ＋). Click to jump to each in turn')" @click="next">
    <span class="flex size-5 items-center justify-center rounded-full bg-rose-600 text-[12px] text-white">!</span>
    <span>{{ holesCount(n) }}</span>
    <span class="text-rose-300">{{ tr("▸ 次へ", "▸ Next") }}</span>
  </button>
  <button v-if="nudge.length && shut" type="button" data-tree-mid-bar class="pointer-events-auto flex items-center gap-2 whitespace-nowrap rounded-full border-2 border-amber-400/80 bg-[#1c160c]/95 py-1 pl-1.5 pr-3 text-[13px] font-bold text-amber-100 shadow-[0_0_16px_rgba(251,191,36,0.35)] hover:bg-[#2a2010]" @click="nextMid">
    <span class="flex size-5 items-center justify-center rounded-full bg-amber-500 text-[12px] text-black">?</span>
    <span>{{ midChip(mids.length, cants.length) }}</span>
    <span class="text-amber-300">{{ tr("▸ 次へ", "▸ Next") }}</span>
  </button>
  </div>
</template>
