/**
 * デイリーの時計 (D-01・D-32)。src/views/daily/daily-api.ts と同じ決まり: 日は 16:00 JST 区切り、スタートは 14:50 まで、挑戦は実際の時計で 1 時間。
 * 時刻は全部サーバーの時計 (端末の報告に頼らない、D-32)
 */
const JST = 9 * 3600_000, H16 = 16 * 3600_000, DAY = 24 * 3600_000;
const START_CLOSE = 22 * 3600_000 + 50 * 60_000;
export const TIME_LIMIT_MS = 60 * 60 * 1000;
/** 提出はサーバーの始めた時刻から 1 時間 + 30 秒まで (D-56) */
export const SUBMIT_GRACE_MS = 30_000;
/** 解決の完成率 (%、D-02) */
export const SOLVE_RATE = 90;

export const dayNoOf = (now: number): number => Math.floor((now + JST - H16) / DAY);
export const dayName = (no: number): string => new Date(no * DAY).toISOString().slice(0, 10);
export const dayNoOfName = (s: string): number => Math.round(Date.parse(`${s}T00:00:00Z`) / DAY);
/** 0 = 月 */
export const weekdayOf = (no: number): number => (new Date(no * DAY).getUTCDay() + 6) % 7;
/** その日が始まる時刻 (16:00 JST) */
export const startAt = (no: number): number => no * DAY + H16 - JST;
export const idOf = (no: number): string => `d${dayName(no)}`;
export const noOfId = (id: string): number | null => (/^d\d{4}-\d\d-\d\d$/.test(id) ? dayNoOfName(id.slice(1)) : null);
export const canStartAt = (now: number): boolean => (now + JST - H16) % DAY < START_CLOSE;
/** その日の週 (月曜の day) */
export const weekOf = (no: number): string => dayName(no - weekdayOf(no));

/** 回す種 (D-34)。同じ日なら同じ種 */
export function seedOfDay(day: string): number {
  let h = 2166136261;
  for (const c of `seed:${day}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
