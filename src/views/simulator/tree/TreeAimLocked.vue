<!--
  TreeAimLocked.vue — 次に打つ手の窓の狙いの欄で、今その箱で付けられない完成形の狙いをグレーで並べる (11-08 オーナー「狙いMODは必ず表示で付けれないならグレーアウトで
  ホバーしたら付けれない理由を箇条書きで」)。訳は tree-aim-why の aimWhyNot。PC は行に乗せると訳の箇条書きの窓 (HelpTip と同じ見た目、窓の段は 1000 未満 = U の重なりの段)、
  スマホは乗せられないので行の下に小さく出す
-->
<script setup lang="ts">
import { ref } from "vue";
import { toCss } from "../../../utils/zoom";
import { tr } from "../../../i18n/lang";

defineProps<{ rows: Array<{ key: string; label: string; why: string[] }>; /** スマホの狙いのページ (大きい行・訳は行の下) */ big?: boolean }>();

const tip = ref<{ key: string; left: number; top: number } | null>(null);
function show(e: MouseEvent, key: string): void {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  tip.value = { key, left: toCss(r.left), top: toCss(r.bottom) + 4 };
}
</script>

<template>
  <div v-for="r in rows" :key="r.key" data-tree-hand-aim-locked :data-aim="r.key" class="flex min-w-0 flex-col" :aria-label="`${r.label} (${tr('付けられない', 'not available')}: ${r.why.join(' / ')})`" @mouseenter="!big && show($event, r.key)" @mouseleave="tip = null">
    <span class="flex min-w-0 cursor-not-allowed items-center gap-2 opacity-40" :class="big ? 'min-h-11' : 'min-h-7'">
      <input type="checkbox" disabled :class="big ? 'size-5 shrink-0' : ''" />
      <span class="min-w-0" :class="big ? 'break-words' : 'truncate max-[48rem]:overflow-visible max-[48rem]:whitespace-normal max-[48rem]:break-words'">{{ r.label }}</span>
    </span>
    <ul v-if="big" data-tree-hand-aim-why class="mb-1 ml-7 list-disc pl-4 text-[12px] text-[var(--exile-color-text-tertiary)]">
      <li v-for="w in r.why" :key="w">{{ w }}</li>
    </ul>
  </div>
  <Teleport to="body">
    <div v-if="tip" data-tree-hand-aim-why role="tooltip" class="pointer-events-none fixed z-[330] w-[280px] rounded-md border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-elevated)] p-3 text-left text-[13px] leading-relaxed text-[var(--exile-color-text-primary)] shadow-[0_8px_24px_rgba(0,0,0,0.55)]" :style="{ left: `${tip.left}px`, top: `${tip.top}px` }">
      <p class="mb-1 text-[12px] font-bold text-[var(--exile-color-accent-focus)]">{{ tr("今は付けられない", "Can't add this now") }}</p>
      <ul class="list-disc pl-4">
        <li v-for="w in rows.find((x) => x.key === tip!.key)?.why ?? []" :key="w">{{ w }}</li>
      </ul>
    </div>
  </Teleport>
</template>
