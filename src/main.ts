import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";
import { startLogSender } from "./services/telemetry/log-sender";

createApp(App).mount("#app");
// 分析用の記録 (2026-10-09。開発中は送らない)
if (!import.meta.env.DEV) startLogSender("app");
// 開発版だけ: 画面の幅からはみ出した物に赤い枠 (utils/overflow-guard.ts、2026-10-13)
if (import.meta.env.DEV) void import("./utils/overflow-guard").then((m) => m.startOverflowGuard());
