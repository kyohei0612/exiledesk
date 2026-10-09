<!--
  SimStepHead.vue — シミュレーションの段の見出し (2026-10-09 UI 作り直し)

  ヴァールの天秤と同じ「番号の丸 + 見出し + ?」。今やっている段は金の丸、終わった段は ✓ で緑、まだの段は灰色。
  右に「ここからやり直す」(終わった段だけ) と、slot side の操作。枠は呼ぶ側 (sim-step のクラス) が持つ。
-->
<script setup lang="ts">
import HelpTip from "../../components/ui/HelpTip.vue";
import Icon from "../../components/ui/Icon.vue";

defineProps<{
  n: number | string;
  title: string;
  done?: boolean;
  current?: boolean;
  help?: string;
  note?: string;
  redo?: boolean;
}>();
const emit = defineEmits<{ redo: [] }>();
</script>

<template>
  <header class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
    <span class="grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-bold tabular-nums" :class="done ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40' : current ? 'bg-[var(--exile-color-accent-focus)] text-black' : 'bg-white/10 text-white/60'">{{ n }}</span>
    <h3 class="g-brush text-[19px] tracking-[0.12em] [text-shadow:0_2px_0_#000]" :class="current || done ? 'text-[var(--exile-color-text-title)]' : 'text-white/60'">{{ title }}</h3>
    <HelpTip v-if="help" :text="help" :title="title" />
    <span v-if="note" class="min-w-0 truncate text-[12px] text-[var(--exile-color-text-secondary)]">{{ note }}</span>
    <span class="ml-auto flex items-center gap-2">
      <slot name="side" />
      <button v-if="redo" type="button" class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-[var(--exile-color-text-secondary)] transition hover:bg-white/5 hover:text-[var(--exile-color-signal-down)]" title="この段から下を決め直す (上の段は残る)。打ち方のパターンと回した結果は消える" @click="emit('redo')"><Icon name="rotate" class="size-3.5" />ここからやり直す</button>
    </span>
  </header>
</template>
