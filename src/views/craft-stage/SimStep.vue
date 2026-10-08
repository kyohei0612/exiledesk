<!--
  SimStep.vue — シミュレーションの段 (1 ベース 〜 6 パターン) の枠と見出し (2026-10-09 UI 作り直し)

  ヴァールの天秤と同じ「金の番号の丸 + 見出し + ?」に揃える。終わった段は番号が ✓ になり、右に「ここからやり直す」。
  今やっている段だけ枠を少し明るくして、どこを触ればいいか分かるようにする (初見レビュー「今どこをやればいいか分からない」)。
  使い方: <SimStep :n="2" title="狙う MOD" :done="modsDone" :current="!modsDone" help="…" @redo="goTo('mods')"> 中身 <template #side>右の操作</template> </SimStep>
-->
<script setup lang="ts">
import HelpTip from "../../components/ui/HelpTip.vue";

defineProps<{
  n: number | string;
  title: string;
  /** 決め終わった段 (番号が ✓) */
  done?: boolean;
  /** 今やっている段 (枠を明るく) */
  current?: boolean;
  /** 見出しの横の「?」の説明 */
  help?: string;
  /** 見出しの横の短い要約 (畳んだ時など) */
  note?: string;
  /** 「ここからやり直す」を出す */
  redo?: boolean;
  /** 中の余白を詰める */
  tight?: boolean;
}>();
const emit = defineEmits<{ redo: [] }>();
</script>

<template>
  <section class="sim-step relative rounded-xl border transition-colors" :class="[current ? 'border-[var(--exile-color-border-brass)] bg-[rgba(201,162,90,0.045)]' : 'border-white/10 bg-white/[0.025]', tight ? 'px-4 py-2.5' : 'px-5 py-4']">
    <header class="flex flex-wrap items-center gap-x-2.5 gap-y-1" :class="$slots.default ? 'mb-3' : ''">
      <span class="grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-[12px] font-bold tabular-nums" :class="done ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40' : current ? 'bg-[var(--exile-color-accent-focus)] text-black' : 'bg-white/10 text-white/60'">{{ done ? "✓" : n }}</span>
      <h3 class="text-[15px] font-bold tracking-wide" :class="current || done ? 'text-[var(--exile-color-text-primary)]' : 'text-white/60'">{{ title }}</h3>
      <HelpTip v-if="help" :text="help" :title="title" />
      <span v-if="note" class="min-w-0 truncate text-[12px] text-[var(--exile-color-text-secondary)]">{{ note }}</span>
      <span class="ml-auto flex items-center gap-2">
        <slot name="side" />
        <button v-if="redo" type="button" class="rounded-md px-2 py-0.5 text-[12px] text-[var(--exile-color-text-secondary)] transition hover:bg-white/5 hover:text-[var(--exile-color-text-primary)]" @click="emit('redo')">ここからやり直す</button>
      </span>
    </header>
    <slot />
  </section>
</template>
