<!--
  AddGemCard.vue — 自動ジェム監視の「ジェムを足す」(検索して監視に入れる)
  GemWatch.vue から切り出し (2026-09-26)。見た目・文言・動きは変えていない。
  検索欄の文字は親が持つ (監視に入れた後に親が空にするため、v-model:query)。
-->
<script setup lang="ts">
import GemName from "../../components/decor/GemName.vue";
import { computed } from "vue";
import BaseCard from "../../components/decor/BaseCard.vue";
import { searchGems } from "../gem-corrupt/search";

defineProps<{ manual: string[] }>();
const query = defineModel<string>("query", { required: true });
const emit = defineEmits<{ (e: "add", en: string): void }>();

// ---- 検索 (ジェムコラプトの賭けと同じ関数。正規表現も使える) ----
const search = computed(() => searchGems(query.value));
const matches = computed(() => search.value.hits);
// 副作用のない computed から取る (以前は matches の中で ref を書いていて、欄を空にしても警告が残った)
const regexError = computed(() => search.value.regexError);
</script>

<template>
  <BaseCard class="mb-4">
    <div class="p-4 pl-5">
      <h3 class="font-display tracking-[0.06em] text-[var(--exile-color-accent-focus)] text-[13px] mb-2">ジェムを足す</h3>
      <label class="block text-[11px] text-[var(--exile-color-text-secondary)] mb-1">ジェム (日本語 / 英語 / 正規表現)</label>
      <input v-model="query" type="text" placeholder="例: アーク / Cast on / ^ヘラルド" class="num w-96 max-w-full" />
      <p v-if="regexError" class="text-[10px] text-amber-300 mt-1">正規表現として読めないので、普通の文字で探しています ({{ regexError }})</p>
      <ul v-if="matches.length" class="mt-2 border border-[var(--exile-color-border-subtle)] rounded divide-y divide-[var(--exile-color-border-subtle)] max-w-xl">
        <li v-for="g in matches" :key="g.en" class="flex items-center justify-between gap-3 px-3 py-1.5 text-[12px]">
          <span>
            <GemName :en="g.en" :label="g.ja" />
            <span class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ g.en }}<span v-if="g.kind === 'meta'"> · メタジェム</span></span>
          </span>
          <button
            v-if="!manual.includes(g.en)"
            type="button"
            class="px-2 py-0.5 rounded border border-[var(--exile-color-border-brass)] text-[11px] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)]"
            @click="emit('add', g.en)"
          >
            監視に入れる
          </button>
          <span v-else class="text-[11px] text-[var(--exile-color-text-tertiary)]">監視中</span>
        </li>
      </ul>
    </div>
  </BaseCard>
</template>
