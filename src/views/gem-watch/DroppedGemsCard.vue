<!--
  DroppedGemsCard.vue — 最近外したジェム (8 時間で消える一時置き場。オーナー指示 2026-09-20)
  GemWatch.vue から切り出し (2026-09-26)。見た目・文言・動きは変えていない。
-->
<script setup lang="ts">
import GemName from "../../components/decor/GemName.vue";
import BaseCard from "../../components/decor/BaseCard.vue";
import { forgetDropped } from "../../state/watch-settings";
import { jaGemName } from "./ja-gem-name";

defineProps<{ dropped: { name: string; at: number }[] }>();
const emit = defineEmits<{ (e: "restore", en: string): void }>();
</script>

<template>
  <BaseCard v-if="dropped.length" class="mb-4">
    <div class="p-4 pl-5">
      <h3 class="font-display tracking-[0.06em] text-[var(--exile-color-accent-focus)] text-[13px] mb-1">最近外したジェム ({{ dropped.length }})</h3>
      <p class="text-[11px] text-[var(--exile-color-text-tertiary)] mb-2">
        監視から外した分をしばらく置いておきます (8 時間で消えます)。売れ行きの記録は 7 日残るので、戻せば続きから測れます。
      </p>
      <ul class="flex flex-wrap gap-2">
        <li v-for="d in dropped" :key="d.name" class="flex items-center gap-2 px-2 py-1 rounded border border-[var(--exile-color-border-subtle)] text-[11px]">
          <GemName :en="d.name" :label="jaGemName(d.name)" />
          <button type="button" class="underline text-[var(--exile-color-accent-focus)] hover:opacity-80" @click="emit('restore', d.name)">戻す</button>
          <button type="button" class="underline text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-text-secondary)]" title="ここから消すだけ (監視には入りません)" @click="forgetDropped(d.name)">×</button>
        </li>
      </ul>
    </div>
  </BaseCard>
</template>
