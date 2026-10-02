<!--
  VaalScales.vue — ヴァールの天秤 (2026-10-03 統合)

  オーナー「被ってる機能・要らん機能を整理、似た物は一緒に。今は器用貧乏」の決定分。
  それまでサイドバーの「ヴァールの天秤 ▶」の下に 4 画面 (アドニアの賭け / ジェムコラプトの賭け / 自動ジェム監視 / 規格外の賭け)
  が並んでいたのを、1 画面にして上のタブで切り替える。各タブの中身は元の view をそのまま置く (ロジックは触らない)。

  タブの中身は <KeepAlive> で保つ: 切り替えても入力や取得結果が消えないように。
  (自動ジェム監視は onActivated / onDeactivated で 20 秒ごとの読み直しを始めたり止めたりするので、
   v-show より KeepAlive の方が、見ていないタブの読み直しが止まって都合がいい)
  どのタブを開いているかは state/app-nav.ts の vaalScalesTab (他の画面から「ジェムコラプトのタブへ」と飛べるように)。
-->
<script setup lang="ts">
import { computed, type Component } from "vue";
import { VAAL_SCALES_TABS, vaalScalesTab } from "../state/app-nav";
import Overquality from "./Overquality.vue";
import GemCorrupt from "./GemCorrupt.vue";
import GemWatch from "./GemWatch.vue";
import RareCraft from "./RareCraft.vue";

const views: Record<(typeof VAAL_SCALES_TABS)[number]["id"], Component> = {
  overquality: Overquality,
  "gem-corrupt": GemCorrupt,
  "gem-watch": GemWatch,
  "rare-craft": RareCraft,
};
const current = computed<Component>(() => views[vaalScalesTab.value]);
</script>

<template>
  <!-- 背景は各タブの view が自分で塗る (元の画面のまま)。ここはタブの帯だけ -->
  <div class="min-h-full flex flex-col bg-[var(--exile-color-bg-canvas)] text-[var(--exile-color-text-primary)]">
    <div
      class="px-6 pt-3 flex items-end gap-1 border-b border-[var(--exile-color-border-subtle)]"
      role="tablist"
      aria-label="ヴァールの天秤"
    >
      <span class="mr-3 pb-2 font-display text-[13px] tracking-[0.08em] text-[var(--exile-color-text-secondary)]" aria-hidden="true">⚖ ヴァールの天秤</span>
      <button
        v-for="t in VAAL_SCALES_TABS"
        :key="t.id"
        type="button"
        role="tab"
        :aria-selected="vaalScalesTab === t.id"
        class="px-3 py-1.5 -mb-px flex items-center gap-1.5 border-b-2 text-[12px] tracking-[0.04em] transition"
        :class="
          vaalScalesTab === t.id
            ? 'border-[var(--exile-color-accent-focus)] text-[var(--exile-color-accent-focus)]'
            : 'border-transparent text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-text-primary)]'
        "
        @click="vaalScalesTab = t.id"
      >
        <span class="inline-block text-center" aria-hidden="true">{{ t.icon }}</span>
        <span class="whitespace-nowrap">{{ t.label }}</span>
      </button>
    </div>
    <div class="flex-1">
      <KeepAlive>
        <component :is="current" />
      </KeepAlive>
    </div>
  </div>
</template>
