import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";
import { startLogSender } from "./services/telemetry/log-sender";

createApp(App).mount("#app");
// 分析用の記録 (2026-10-09。開発中は送らない)
if (!import.meta.env.DEV) startLogSender("app");
