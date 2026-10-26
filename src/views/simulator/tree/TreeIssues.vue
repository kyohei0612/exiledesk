<!--
  TreeIssues.vue — ルート精査の結果の帯 (SimTreePage から分けた、2026-10-22)。押した時だけ、ツリーの上に浮かべてツリーを押し下げない。
  行を押すとその箱へ寄って一覧を畳む (見出しだけ残す。帯が箱を隠した、10-22 白紙から組んだ試し)
-->
<script setup lang="ts">
import type { CheckIssue } from "../../../services/simulator/tree/tree-check";
import { onBeforeUnmount, onMounted } from "vue";
import { tr } from "../../../i18n/lang";
import BusyTag from "../../../components/ui/BusyTag.vue";

/** busy = 精査の途中 (見出しに進みの札。穴は辿った人から順に足される) */
defineProps<{ issues: CheckIssue[]; lower: boolean; boxName: (id: string) => string; busy?: { text: string; n?: number; of?: number } | null }>();
const fold = defineModel<boolean>("fold", { required: true });
const emit = defineEmits<{ go: [id: string]; close: [] }>();
// Esc で閉じる (10-26 モンキー 7 の 19、メモ feedback-click-outside-cancel)
const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") emit("close"); };
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <!-- 木の枠の外の右の列の上 (10-26 夜オーナー「A でいい」: 木の上に浮かせると引っ張った時に箱を隠した、モンキー 8 の 2) -->
  <div data-tree-issues class="flex max-h-[60%] min-h-0 w-full shrink-0 flex-col gap-1 overflow-y-auto rounded-lg border px-2 py-1.5 text-[12px]"
    :class="[issues.length ? 'border-rose-500/40 bg-[#1c0f10]/95' : busy ? 'border-white/10 bg-[#15110c]/95' : 'border-emerald-500/40 bg-[#0d1a12]/95']">
    <div class="flex items-center gap-2">
      <b :class="issues.length ? 'text-rose-200' : busy ? 'text-[#d8ccb4]' : 'text-emerald-200'">{{ issues.length ? tr(`足りない所 ${issues.length} 件`, `${issues.length} missing`) : busy ? tr("精査中", "Checking") : tr("足りない所は無かった (5 人で全部の枝を通した)", "Nothing missing (all branches walked by 5 runs)") }}</b>
      <!-- 穴と箱の赤い「!」の意味 (10-24 モンキー初めての人の回 5: 書いていなかった) -->
      <BusyTag v-if="busy" :text="busy.text" :n="busy.n" :of="busy.of" />
      <button v-if="issues.length" type="button" data-tree-issues-fold class="g-btn sm ml-auto" @click="fold = !fold">{{ fold ? tr("一覧を開く", "Show list") : tr("畳む", "Fold") }}</button>
      <button type="button" class="g-btn sm" :class="{ 'ml-auto': !issues.length }" @click="emit('close')">{{ tr("閉じる", "Close") }}</button>
    </div>
    <!-- 一覧は木の右に細く (広いとスタートの箱にかぶった、10-26 猿の 6)。説明は見出しの下の 1 行 -->
    <p v-if="issues.length && !fold" data-tree-issues-what class="opacity-70">{{ tr("= 回すと止まる・打てない所 (! の箱)。直すと 100 人回せます。行を押すとその箱へ", "= where runs stop or a craft can't be used (boxes with !). Fix them to run 100. Click a row to go there") }}</p>
    <button v-for="(x, i) in issues" v-show="!fold" :key="i" type="button" data-tree-issue-row class="flex min-h-7 items-center gap-2 rounded px-1 text-left hover:bg-white/5" @click="fold = true; emit('go', x.boxId)">
      <span class="shrink-0 rounded-sm bg-rose-600 px-1.5 text-[11px] font-bold text-white">!</span>
      <span class="max-w-[40%] shrink-0 truncate opacity-70" :title="boxName(x.boxId)">{{ boxName(x.boxId) }}</span>
      <span class="line-clamp-2 min-w-0" :title="x.text">{{ x.text }}</span>
    </button>
  </div>
</template>
