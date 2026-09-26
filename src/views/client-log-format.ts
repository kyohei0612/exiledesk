/**
 * ゲームログ診断の表示用の書式 (MB / 件数 / 時刻 / 日付)
 *
 * ClientLog.vue から切り出し (2026-09-26)。ClientLogHistory.vue と共用。
 */
export const mb = (b: number) => (b / 1048576).toFixed(0);
export const num = (n: number) => n.toLocaleString("ja-JP");
export const shortTs = (t: string | null) => (t ? t.slice(5, 16) : "—");
export const dateOf = (sec: number) => new Date(sec * 1000).toLocaleDateString("ja-JP");
