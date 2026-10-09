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
import { computed, nextTick, ref, watch, type Component } from "vue";
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

// 3 つのタブは 1 つの枠 (1 つのスクロール) を使うので、タブごとの位置を覚えて戻す (2026-10-10。前は前のタブの位置のまま開いていた)
const scroller = ref<HTMLElement | null>(null);
const scrollOf = new Map<VaalScalesTab, number>();
watch(vaalScalesTab, async (next, prev) => {
  if (scroller.value && prev) scrollOf.set(prev, scroller.value.scrollTop);
  await nextTick();
  if (scroller.value) scroller.value.scrollTop = scrollOf.get(next) ?? 0;
});
</script>

<template>
  <!-- 背景は各タブの view が自分で塗る (元の画面のまま)。ここはタブの帯だけ (帯の見た目は components/ui/TabBar.vue で 4 画面共通) -->
  <div class="h-full flex flex-col overflow-hidden bg-[var(--exile-color-bg-canvas)] text-[var(--exile-color-text-primary)]">
    <TabBar art="vaal" title="ヴァールの天秤" :tabs="VAAL_SCALES_TABS" :model-value="vaalScalesTab" @update:model-value="vaalScalesTab = $event as VaalScalesTab" />
    <!-- 中身は 1 つの枠に (2026-10-10 UI 見直し。カレンシーランキング・取引履歴と同じ形。中のカードは枠を描かずに区切りの絵だけ: game-ui.css) -->
    <div class="flex-1 min-h-0 flex p-4">
      <div ref="scroller" class="g-panel flex-1 min-h-0 overflow-auto">
        <KeepAlive>
          <component :is="current" />
        </KeepAlive>
      </div>
    </div>
  </div>
</template>
