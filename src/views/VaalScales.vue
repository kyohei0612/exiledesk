<!--
  VaalScales.vue — ヴァールの天秤 (2026-10-03 統合)

  オーナー「被ってる機能・要らん機能を整理、似た物は一緒に。今は器用貧乏」の決定分。
  それまでサイドバーの「ヴァールの天秤 ▶」の下に 4 画面 (アドニアの賭け / ジェムコラプトの賭け / 自動ジェム監視 / 規格外の賭け、2026-10-09 に削除)
  が並んでいたのを、1 画面にして上のタブで切り替える。各タブの中身は元の view をそのまま置く (ロジックは触らない)。

  タブの中身は <KeepAlive> で保つ: 切り替えても入力や取得結果が消えないように。
  (自動ジェム監視は onActivated / onDeactivated で 20 秒ごとの読み直しを始めたり止めたりするので、
   v-show より KeepAlive の方が、見ていないタブの読み直しが止まって都合がいい)
  どのタブを開いているかは state/app-nav.ts の vaalScalesTab (他の画面から「ジェムコラプトのタブへ」と飛べるように)。
-->
<script setup lang="ts">
import { computed, type Component } from "vue";
import TabBar from "../components/ui/TabBar.vue";
import { VAAL_SCALES_TABS, vaalScalesTab, type VaalScalesTab } from "../state/app-nav";
import Overquality from "./Overquality.vue";
import GemCorrupt from "./GemCorrupt.vue";
import GemWatch from "./GemWatch.vue";

const views: Record<(typeof VAAL_SCALES_TABS)[number]["id"], Component> = {
  overquality: Overquality,
  "gem-corrupt": GemCorrupt,
  "gem-watch": GemWatch,
};
const current = computed<Component>(() => views[vaalScalesTab.value]);
</script>

<template>
  <!-- 背景は各タブの view が自分で塗る (元の画面のまま)。ここはタブの帯だけ (帯の見た目は components/ui/TabBar.vue で 4 画面共通) -->
  <div class="min-h-full flex flex-col bg-[var(--exile-color-bg-canvas)] text-[var(--exile-color-text-primary)]">
    <TabBar icon="⚖" title="ヴァールの天秤" :tabs="VAAL_SCALES_TABS" :model-value="vaalScalesTab" @update:model-value="vaalScalesTab = $event as VaalScalesTab" />
    <div class="flex-1">
      <KeepAlive>
        <component :is="current" />
      </KeepAlive>
    </div>
  </div>
</template>
