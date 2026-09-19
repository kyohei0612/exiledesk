<script setup lang="ts">
import { onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import LeftSidebar from "./components/LeftSidebar.vue";
import CenterContent from "./components/CenterContent.vue";
import UpdateToast from "./components/UpdateToast.vue";
import LoginGate from "./components/LoginGate.vue";
import { useKeyboardShortcuts } from "./composables/useKeyboardShortcuts";
import { ensureCraftV2Started } from "./state/craft-v2-store";
import { ensurePobBundleFresh } from "./services/pob-bundle";
import { ensureClientLogRotated } from "./services/client-log";
import { startWatchAutoRefresh } from "./state/gem-watch-auto";
import { startSessionWatch } from "./state/poe-session";
import { isTauriRuntime } from "./utils/isTauriRuntime";

// 2026-09-14: 画面から別の画面へ飛べるよう、表示中の画面は共有状態 (state/app-nav.ts) に置く
import { activeNav } from "./state/app-nav";

// Phase A.8: グローバルナビ系 (Ctrl+1/2, Ctrl+,, Ctrl+Q) を bind。
// 画面固有系 (/, ↑↓, s, r, f) は registerHandler を経由して
// 各画面側 (CurrencyRanking / EconDashboard) から差し込む。
// 2026-05-23: Ctrl+, で設定画面に遷移 (Phase 設定画面)。
useKeyboardShortcuts({
  activeNav,
  onOpenSettings: () => {
    activeNav.value = "settings";
  },
});

// 2026-05-23 シームレス徹底:
//   起動時に MOD 一覧 (クラフト発見 V2) の fetch を背景で開始する。
//   ユーザーが MOD 一覧画面を開かなくても、勝手にキャッシュ即時表示 → 差分更新が走るので
//   画面遷移時に「取得待ち」が発生しにくい。
//   `ensureCraftV2Started` は冪等 (initialBootStarted ガード) なので、複数回呼んでも安全。
onMounted(() => {
  // 中身が描けたのでウィンドウを出してもらう (白い窓を見せないため、起動時は隠してある)
  if (isTauriRuntime()) void invoke("show_main_window").catch(() => {});
  void ensureCraftV2Started();
  // PoB 同梱物: 30 日空いていたら manifest を確認して自動更新 (未インストールなら PoB 画面で案内)
  void ensurePobBundleFresh();
  // ゲームログ: 前回の消し込みから 7 日経っていれば診断 → 履歴保存 → 本体を空に
  void ensureClientLogRotated();
  // 捌き速度: 追跡する銘柄 (自動ジェム監視の設定で決まる) を 1 日 1 回そろえ直す。
  // 出品の追跡そのものは Rust 側が周期 (既定 8 時間) ごとに回す
  startWatchAutoRefresh();
  // ログイン状態を読む。未ログインなら LoginGate が前に出る (枠が半分だとすぐ制限に当たるため)
  startSessionWatch();
});
</script>

<template>
  <div class="flex h-screen w-screen">
    <LeftSidebar
      :active="activeNav"
      @update:active="activeNav = $event"
      class="w-52 shrink-0 border-r border-[var(--exile-color-border-subtle)]"
    />

    <CenterContent :active-nav="activeNav" class="flex-1" />

    <UpdateToast />
    <!-- 未ログインだと trade2 の枠が半分でレート制限に当たるので、起動時に前へ出して促す (2026-09-20) -->
    <LoginGate />
  </div>
</template>
