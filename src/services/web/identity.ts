/**
 * identity.ts — Web 版の「この端末」と「名前」(2026-10-16)。ログインは無く、このブラウザに覚える。
 * 掲示板 (wip/board の src/services/board/board-api.ts の boardUid / boardName / rememberName) と同じキー・同じ作りにしてある:
 *   端末の番号 = exiledesk.web.uid (使い方の記録・要望と同じ。無ければ同じ式で作る)、名前 = exiledesk.board.name。
 * 両方を main に入れる時は、掲示板の方もここを使う形にまとめる (名前の長さは掲示板 20 字・今日のお題 12 字で違う)
 */
import { ref } from "vue";

const UID_KEY = "exiledesk.web.uid";
const NAME_KEY = "exiledesk.board.name";

export function webUid(): string {
  try {
    const v = localStorage.getItem(UID_KEY);
    if (v) return v;
    const u = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
    localStorage.setItem(UID_KEY, u);
    return u;
  } catch { return ""; }
}

/** 名前 (掲示板・今日のお題で共通) */
export const webName = ref((() => { try { return localStorage.getItem(NAME_KEY) ?? ""; } catch { return ""; } })());
export function rememberName(v: string): void {
  webName.value = v;
  try { if (v) localStorage.setItem(NAME_KEY, v); else localStorage.removeItem(NAME_KEY); } catch { /* 覚えられなくてよい */ }
}
