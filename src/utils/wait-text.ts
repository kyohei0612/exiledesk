/**
 * 待ち時間の表記を 1 か所にまとめる (2026-09-16)
 *
 * オーナー指摘: レート制限の待機は「1676 秒」だと何分待てばいいのか分からない。
 * 上位プレイヤーMOD一覧とクラフト選定ジェムで同じ表記にする。
 */

/** 残り秒数 → "27 分 56 秒" / "45 秒" (1 時間以上は "1 時間 3 分") */
export function waitText(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分 ${s % 60} 秒`;
  const h = Math.floor(m / 60);
  return `${h} 時間 ${m % 60} 分`;
}

/** 残り秒数 → 再開予定時刻 "17:35" (1 分未満なら空文字) */
export function resumeAtText(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  if (s < 60) return "";
  const d = new Date(Date.now() + s * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
