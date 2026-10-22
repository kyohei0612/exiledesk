<!--
  TreeIssues.vue — ルート精査の結果の帯 (SimTreePage から分けた、2026-10-22)。押した時だけ、ツリーの上に浮かべてツリーを押し下げない。
  行を押すとその箱へ寄って一覧を畳む (見出しだけ残す。帯が箱を隠した、10-22 白紙から組んだ試し)
-->
<script setup lang="ts">
import type { CheckIssue } from "../../../services/simulator/tree/tree-check";
import { tr } from "../../../i18n/lang";
import TreeBusy from "./TreeBusy.vue";

/** busy = 精査の途中 (見出しに進みの札。穴は辿った人から順に足される) */
defineProps<{ issues: CheckIssue[]; lower: boolean; boxName: (id: string) => string; busy?: { text: string; n?: number; of?: number } | null }>();
const fold = defineModel<boolean>("fold", { required: true });
const emit = defineEmits<{ go: [id: string]; close: [] }>();
</script>

<template>
  <div data-tree-issues class="absolute left-3 z-20 flex max-h-[45%] max-w-[calc(100%-24px)] flex-col gap-1 overflow-y-auto rounded-lg border px-2 py-1.5 text-[12px] shadow-[0_6px_20px_rgba(0,0,0,0.6)]"
    :class="[fold ? 'w-max' : 'w-[min(720px,calc(100%-24px))]', issues.length ? 'border-rose-500/40 bg-[#1c0f10]/95' : busy ? 'border-white/10 bg-[#15110c]/95' : 'border-emerald-500/40 bg-[#0d1a12]/95', lower ? 'top-12' : 'top-3']">
    <div class="flex items-center gap-2">
      <b :class="issues.length ? 'text-rose-200' : busy ? 'text-[#d8ccb4]' : 'text-emerald-200'">{{ issues.length ? tr(`穴 ${issues.length} 件`, `${issues.length} issue(s)`) : busy ? tr("精査中", "Checking") : tr("穴は見つからなかった (5 人で全部の枝を通した)", "No issues found (all branches walked by 5 runs)") }}</b>
      <TreeBusy v-if="busy" :text="busy.text" :n="busy.n" :of="busy.of" />
      <button v-if="issues.length" type="button" data-tree-issues-fold class="g-btn sm ml-auto" @click="fold = !fold">{{ fold ? tr("一覧を開く", "Show list") : tr("畳む", "Fold") }}</button>
      <button type="button" class="g-btn sm" :class="{ 'ml-auto': !issues.length }" @click="emit('close')">{{ tr("閉じる", "Close") }}</button>
    </div>
    <button v-for="(x, i) in issues" v-show="!fold" :key="i" type="button" data-tree-issue-row class="flex min-h-7 items-center gap-2 rounded px-1 text-left hover:bg-white/5" @click="fold = true; emit('go', x.boxId)">
      <span class="shrink-0 rounded-sm bg-rose-600 px-1.5 text-[11px] font-bold text-white">!</span>
      <span class="max-w-[40%] shrink-0 truncate opacity-70" :title="boxName(x.boxId)">{{ boxName(x.boxId) }}</span>
      <span class="line-clamp-2 min-w-0" :title="x.text">{{ x.text }}</span>
    </button>
  </div>
</template>
