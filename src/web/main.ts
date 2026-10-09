// Web 版の入口 (2026-10-07)。アプリ版の App.vue は使わず、クラフトステージだけを載せる殻 (WebApp.vue) を出す
import { createApp } from "vue";
import "../style.css";
import WebApp from "./WebApp.vue";
import { startTracking } from "./track";
import { startLogSender } from "../services/telemetry/log-sender";

// 操作の印 (段階・滞在・エラー) を始めてから画面を出す (cookie なし)
startTracking();
createApp(WebApp).mount("#app");
// 分析用の記録 (開発中は送らない)
if (!import.meta.env.DEV) startLogSender("web");
