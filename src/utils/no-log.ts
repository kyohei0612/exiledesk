/**
 * この端末は記録しない (2026-10-09 オーナー「俺の PC からの訪問もおかしいことになっちゃうから、この PC からのアクセスだけ全部 0 に」)。
 * 印があると、分析用の記録 (log-sender)・操作の印 (web/track.ts)・Web Analytics の beacon のどれも送らない。
 * 端末ごと (localStorage)。Web は ?nolog=1 / ?nolog=0 でも切り替えられる。画面には Web の下の行とアプリの設定に切り替えを置く
 */
import { ref } from "vue";

export const NO_LOG_KEY = "exiledesk.noLog";

function read(): boolean {
  // スマホ用の開発版 (公開しない、scripts/deploy-web-dev.mjs) は記録しない
  if (import.meta.env.VITE_DEV_PREVIEW === "1") return true;
  try { return localStorage.getItem(NO_LOG_KEY) === "1"; } catch { return false; }
}

/** 今の状態 (画面の切り替えの表示用) */
export const noLogOn = ref(read());

/** 送る前に毎回見る (切り替えたらすぐ効く) */
export const noLog = (): boolean => noLogOn.value;

export function setNoLog(v: boolean): void {
  noLogOn.value = v;
  try { if (v) localStorage.setItem(NO_LOG_KEY, "1"); else localStorage.removeItem(NO_LOG_KEY); } catch { /* 覚えられなくても今の間は効く */ }
}

/** URL の ?nolog=1 / ?nolog=0 を読んで覚える (Web の入口で 1 回) */
export function applyNoLogParam(): void {
  try {
    const v = new URLSearchParams(location.search).get("nolog");
    if (v === "1" || v === "0") setNoLog(v === "1");
  } catch { /* 無くてよい */ }
}
