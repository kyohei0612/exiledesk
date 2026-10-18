// Web 版の入口 (2026-10-07)。アプリ版の App.vue は使わず、クラフトステージだけを載せる殻 (WebApp.vue) を出す
import { createApp, watchEffect } from "vue";
import "../style.css";
import WebApp from "./WebApp.vue";
import { startTracking } from "./track";
import { startLogSender } from "../services/telemetry/log-sender";
import { startPwa } from "./pwa";
import { applyNoLogParam, noLog } from "../utils/no-log";
import { initRecParts } from "../utils/rec-mode";
import { setMarketLoader } from "../state/market-store";
import { loadBoot } from "./boot";
import { pageTitle, startPages } from "./page";
import type { CurrencyItem, League } from "../api/poe2scout";

// この端末は記録しない (?nolog=1 / 0 で切り替え、no-log.ts)。印を読んでから記録を始める
applyNoLogParam();
// 録画モード (?rec=1) の部分ごとの見せる / 隠す (POE2Tube 要望 ㊸)
initRecParts();
// 操作の印 (段階・滞在・エラー) を始めてから画面を出す (cookie なし)
startTracking();
// 相場はサーバーが 1 時間おきに取った物を /boot.json で受け取る (ブラウザから poe2scout を引かない。boot.ts)
setMarketLoader(async () => {
  const b = await loadBoot();
  return b?.market?.items?.length ? { leagues: b.market.leagues as League[], items: b.market.items as CurrencyItem[] } : null;
});
createApp(WebApp).mount("#app");
// タブの題は言語に合わせる (web.html の題は日本語の既定。2026-10-10 英語の巡回で見つかった)
// ページ (使い方・コツ・コース) ごとに題を変える (web/page.ts)
watchEffect(() => { document.title = pageTitle.value; });
startPages();
// 分析用の記録 (開発中は送らない)
if (!import.meta.env.DEV) startLogSender("web");
// ホーム画面に追加 (PWA) とオフライン (public/sw.js)。開発中は登録しない (2026-10-17)
if (!import.meta.env.DEV) startPwa();
// 開発版だけ: 画面の幅からはみ出した物に赤い枠 (utils/overflow-guard.ts、2026-10-13)
if (import.meta.env.DEV) void import("../utils/overflow-guard").then((m) => m.startOverflowGuard());
// Web Analytics (訪問数)。記録しない端末と開発中は読み込まない (前は web.html に直に書いていて、オーナーの PC の訪問も数えていた)
if (!import.meta.env.DEV && !noLog()) {
  const s = document.createElement("script");
  s.defer = true;
  s.src = "https://static.cloudflareinsights.com/beacon.min.js";
  s.dataset.cfBeacon = JSON.stringify({ token: "72192ac351aa4259ad607ec32e069cfb" });
  document.head.appendChild(s);
}
