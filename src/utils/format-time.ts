/**
 * format-time.ts — 画面で使う時刻の短い書き方 (2026-09-18)
 *
 * レビュー指摘: 同じ「MM/DD HH:mm」が 5 つのファイルに別々の実装で入っていた。ここに寄せる。
 *   fmtClock(sec)            … "09/17 21:34"   (unix 秒。0 / null は "—")
 *   fmtClock(sec, "time")    … "21:34"
 */
export function fmtClock(sec: number | null | undefined, style: "date" | "time" = "date"): string {
  if (!sec) return "—";
  const d = new Date(sec * 1000);
  const p = (n: number): string => String(n).padStart(2, "0");
  const time = `${p(d.getHours())}:${p(d.getMinutes())}`;
  return style === "time" ? time : `${p(d.getMonth() + 1)}/${p(d.getDate())} ${time}`;
}

/** 秒 → 「2 時間 15 分」「3 日 4 時間」「45 分」 */
export function fmtSpan(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "—";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} 分`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m > 0 ? `${h} 時間 ${m} 分` : `${h} 時間`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d} 日 ${rh} 時間` : `${d} 日`;
}
