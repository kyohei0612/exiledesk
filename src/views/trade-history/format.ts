/**
 * format.ts — 取引履歴の書式と日付の区切り (純粋関数)
 *
 * 「いつの分か」はローカルの日付境界で決める (時間の引き算ではなく日付で仕分ける。2026-09-16)。
 *
 * 2026-09-19 に TradeHistory.vue (689 行) から切り出した。中身は変えていない。
 */
export const DAY_MS = 86_400_000;

export const pad2 = (n: number): string => String(n).padStart(2, "0");

/** その日の 0:00 (ローカル) */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 日をまとめるキー ("2026-09-19") */
export const dayKey = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const WEEK_JA = ["日", "月", "火", "水", "木", "金", "土"];

/** "9/16 (火)" */
export function dayLabel(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} (${WEEK_JA[d.getDay()]})`;
}

/** "09/19 22:04" */
export function fmtTime(ms: number): string {
  if (!ms) return "—";
  const d = new Date(ms);
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 日付ごとにまとめた一覧では時刻だけ出す */
export function fmtHM(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 数は整数ならそのまま、端数があれば小数 2 桁 */
export const fmtAmount = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** レアリティの色 (クライアントと同じ配色) */
export function rarityClass(r: string): string {
  switch (r) {
    case "Unique":
      return "text-amber-500";
    case "Rare":
      return "text-yellow-200";
    case "Magic":
      return "text-indigo-300";
    case "Gem":
      return "text-teal-300";
    default:
      return "";
  }
}
