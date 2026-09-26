<script setup lang="ts">
import { onMounted, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import LeftSidebar from "./components/LeftSidebar.vue";
import CenterContent from "./components/CenterContent.vue";
import UpdateToast from "./components/UpdateToast.vue";
import LoginGate from "./components/LoginGate.vue";
import WatchReplaceDialog from "./components/WatchReplaceDialog.vue";
import ConfirmDialog from "./components/ConfirmDialog.vue";
import FetchBusyBar from "./components/FetchBusyBar.vue";
import { useKeyboardShortcuts } from "./composables/useKeyboardShortcuts";
import { ensureCraftV2Started } from "./state/craft-v2-store";
import { ensurePobBundleFresh } from "./services/pob-bundle";
import { ensureClientLogRotated } from "./services/client-log";
import { startWatchAutoRefresh } from "./state/gem-watch-auto";
import { startSessionWatch } from "./state/poe-session";
import { startFetchBusyWatch } from "./state/fetch-busy";
import { importFlowSeed } from "./services/flow-seed";
import { isTauriRuntime } from "./utils/isTauriRuntime";

/**
 * 画面全体を「最小の窓 (1660 幅) で組んだ絵」として扱い、窓が広ければそのまま拡大する (オーナー 2026-09-26:「ウィンドウ
 * 小さくしても大きくしても変わらない感じで」「今の最小 px に合わせた UI に」)。前は広い窓でタブごとに横へ伸びたり
 * (表が間延び)、クラフト計算機だけ左に寄って右が空いたりしていた。窓の最小は tauri.conf.json の minWidth 1660
 */
const DESIGN_WIDTH = 1660;
/** 外枠の大きさ (拡大前の CSS ピクセル)。100vw / 100vh は拡大で窓より大きくなり、右と下が切れていたので実寸 ÷ 拡大率で持つ */
const frame = ref({ w: DESIGN_WIDTH, h: 900 });
function fitZoom(): void {
  const z = Math.max(1, window.innerWidth / DESIGN_WIDTH);
  document.documentElement.style.zoom = String(z);
  frame.value = { w: window.innerWidth / z, h: window.innerHeight / z };
}
fitZoom();
window.addEventListener("resize", fitZoom);

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
  // 同梱の捌き速度データを取り込む (サブ機の初期データ。自分で測った分は消さない)
  void importFlowSeed();
  // 取得 (自動巡回 / 一括 / 追加時) が走っているかを見張る。走っている間は他の取得を押せなくし、
  // 画面の下に何が走っているかを出す (オーナー指示 2026-09-20)
  startFetchBusyWatch();
});
</script>

<template>
  <div class="flex" :style="{ width: `${frame.w}px`, height: `${frame.h}px` }">
    <LeftSidebar
      :active="activeNav"
      @update:active="activeNav = $event"
      class="w-52 shrink-0 border-r border-[var(--exile-color-border-subtle)]"
    />

    <CenterContent :active-nav="activeNav" class="flex-1" />

    <UpdateToast />
    <!-- 未ログインだと trade2 の枠が半分でレート制限に当たるので、起動時に前へ出して促す (2026-09-20) -->
    <LoginGate />
    <!-- 監視の枠が埋まっている時に「どれと入れ替えるか」を聞く (2026-09-20) -->
    <WatchReplaceDialog />
    <!-- 「よろしいですか?」は OS の素のダイアログでなくアプリの中で描く (2026-09-21) -->
    <ConfirmDialog />
    <!-- 取得中は他の取得を押せなくするので、何が走っているかを下に出す (2026-09-20) -->
    <FetchBusyBar />
  </div>
</template>
