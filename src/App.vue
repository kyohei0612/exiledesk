<script setup lang="ts">
import { bootLog, bootTimed, watchBootLongTasks } from "./utils/boot-timing";
import { uniqueWatch } from "./state/unique-watch";
import { onMounted, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import LeftSidebar from "./components/LeftSidebar.vue";
import CenterContent from "./components/CenterContent.vue";
import UpdateToast from "./components/UpdateToast.vue";
import LoginGate from "./components/LoginGate.vue";
import HoverStack from "./components/decor/HoverStack.vue";
import WatchReplaceDialog from "./components/WatchReplaceDialog.vue";
import ConfirmDialog from "./components/ConfirmDialog.vue";
import FetchBusyBar from "./components/FetchBusyBar.vue";
import AssetPackToast from "./components/AssetPackToast.vue";
import { ensureAssetPacks } from "./services/assets/asset-packs";
import { useKeyboardShortcuts } from "./composables/useKeyboardShortcuts";
import { ensurePobBundleFresh } from "./services/pob-bundle";
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

onMounted(() => {
  // 起動の重さを調べる (2026-10-06): 各処理の時間と、画面が固まった時間を exiledesk.log に (起動から 3 分だけ)
  watchBootLongTasks();
  bootLog("画面の準備ができた (ここまでがスクリプトの読み込み)");
  // 中身が描けたのでウィンドウを出してもらう (白い窓を見せないため、起動時は隠してある)
  if (isTauriRuntime()) void invoke("show_main_window").catch(() => {});
  // 上位 MOD 一覧の準備 (キャッシュの集計で画面が 3〜7 秒固まる) は起動時にしない。使う画面 (クラフト計算機の上位プレイヤーのタブ・
  // 使用率ランキング) を開いた時に始める (2026-10-07 オーナー「アプリ立ち上げの重さの原因突き止めて」→ 起動直後の固まりの 9 割がこれだった)
  // PoB 同梱物: 30 日空いていたら manifest を確認して自動更新 (未インストールなら PoB 画面で案内)
  void bootTimed("PoB の確認", () => ensurePobBundleFresh());
  // 画像パック (ベースの絵・スキンの画像): 要る版と違う時だけ落とす (初回と画像が変わった時だけ。2026-09-29)
  void bootTimed("画像パックの確認", () => ensureAssetPacks());
  // 捌き速度: 追跡する銘柄 (自動ジェム監視の設定で決まる) を 1 日 1 回そろえ直す。
  // 出品の追跡そのものは Rust 側が周期 (既定 8 時間) ごとに回す
  // 開発版 (vite の開発サーバー) では止める: 監視リストの作り直しはインストール版と同じ AppData を書き換え、見回りは取引所を叩く
  // (2026-10-05 オーナー「開発版はデフォで止めておきたい」)。import.meta.env.DEV は本番のビルドでは必ず false なので本体には入らない
  // 使用率ランキングの自動取得 (自動取得の間隔、2026-10-06) もこの中から始まるので、開発版では一緒に止まる
  if (!import.meta.env.DEV) startWatchAutoRefresh();
  // ログイン状態を読む。未ログインなら LoginGate が前に出る (枠が半分だとすぐ制限に当たるため)
  startSessionWatch();
  // 同梱の捌き速度データを取り込む (サブ機の初期データ。自分で測った分は消さない)
  void bootTimed("捌き速度の初期データ", () => importFlowSeed());
  // 取得 (自動巡回 / 一括 / 追加時) が走っているかを見張る。走っている間は他の取得を押せなくし、
  // 画面の下に何が走っているかを出す (オーナー指示 2026-09-20)
  startFetchBusyWatch();
  // ユニークのお気に入りの最安値の見回り (1 分おき。間隔が来ていて取引所が空いていれば取る。2026-09-27)
  if (!import.meta.env.DEV) uniqueWatch.start();
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
    <!-- ユニーク / カレンシーのホバーの重なり (ゲーム内のようにキーワードから奥へ辿れる。2026-09-26) -->
    <HoverStack />
    <!-- 監視の枠が埋まっている時に「どれと入れ替えるか」を聞く (2026-09-20) -->
    <WatchReplaceDialog />
    <!-- 「よろしいですか?」は OS の素のダイアログでなくアプリの中で描く (2026-09-21) -->
    <ConfirmDialog />
    <!-- 取得中は他の取得を押せなくするので、何が走っているかを下に出す (2026-09-20) -->
    <FetchBusyBar />
    <AssetPackToast />
  </div>
</template>
