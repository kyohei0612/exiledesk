// Web 版の入口 (2026-10-07)。アプリ版の App.vue は使わず、クラフトステージだけを載せる殻 (WebApp.vue) を出す
import { createApp, watchEffect } from "vue";
import { tr } from "../i18n/lang";
import "../style.css";
import WebApp from "./WebApp.vue";
import { startTracking } from "./track";
import { startLogSender } from "../services/telemetry/log-sender";
import { applyNoLogParam, noLog } from "../utils/no-log";
import { setMarketLoader } from "../state/market-store";
import { loadBoot } from "./boot";
import type { CurrencyItem, League } from "../api/poe2scout";

// この端末は記録しない (?nolog=1 / 0 で切り替え、no-log.ts)。印を読んでから記録を始める
applyNoLogParam();
// 操作の印 (段階・滞在・エラー) を始めてから画面を出す (cookie なし)
startTracking();
// 相場はサーバーが 1 時間おきに取った物を /boot.json で受け取る (ブラウザから poe2scout を引かない。boot.ts)
setMarketLoader(async () => {
  const b = await loadBoot();
  return b?.market?.items?.length ? { leagues: b.market.leagues as League[], items: b.market.items as CurrencyItem[] } : null;
});
createApp(WebApp).mount("#app");
// タブの題は言語に合わせる (web.html の題は日本語の既定。2026-10-10 英語の巡回で見つかった)
watchEffect(() => { document.title = tr("ExileDesk Web — PoE2 クラフトステージ", "ExileDesk Web — PoE2 Craft Stage"); });
// 分析用の記録 (開発中は送らない)
if (!import.meta.env.DEV) startLogSender("web");
// Web Analytics (訪問数)。記録しない端末と開発中は読み込まない (前は web.html に直に書いていて、オーナーの PC の訪問も数えていた)
if (!import.meta.env.DEV && !noLog()) {
  const s = document.createElement("script");
  s.defer = true;
  s.src = "https://static.cloudflareinsights.com/beacon.min.js";
  s.dataset.cfBeacon = JSON.stringify({ token: "72192ac351aa4259ad607ec32e069cfb" });
  document.head.appendChild(s);
}
