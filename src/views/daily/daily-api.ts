/**
 * daily-api.ts — デイリーのサーバーの口 (D-56) と同じ形の関数。今はサーバーが無いので中身はこのブラウザの localStorage (D-90)。
 * サーバーができたら関数の中だけを fetch に替える。画面はここしか呼ばない。お題の狙いは startTry で初めて返す (伏せる、D-32b)。
 * 今週のお題は端末が組む (daily-gen)。順位の相手と先週の札は見本で意味は無い (daily-samples)。
 */
import type { PatchData } from "../../services/craft-stage/engine";
import { generateTopic, LEVELS, type GenAim, type GenTopic } from "./daily-gen";
import { LAST_WEEK, sampleRank } from "./daily-samples";

export const TIME_LIMIT_MS = 60 * 60 * 1000;
/** 解決の完成率 (%、D-02) */
export const SOLVE_RATE = 90;
export const NICK_MAX = 12;
const TOP10 = [10, 7, 5, 3, 3, 3, 3, 3, 3, 3];

export type DailyAim = GenAim;
/** 一覧に出す形 (狙いは入れない) */
export type DailyTopic = { id: string; day: string; by: string; base: string; baseJa: string; ilvl: number; modCount: number; level: number; tries: number; sample: boolean };
export type DailyRecord = { cost: number; rate: number; ms: number; at: number };
/** usedMs = 挑戦のページを開いていた時間の合計 (D-32) */
export type DailyTry = { topicId: string; usedMs: number; aims: DailyAim[]; fractured?: string; tree?: string; best?: DailyRecord; last?: DailyRecord };
export type DailyRankRow = { name: string; cost: number; rate: number; ms: number; me?: boolean };
export type DailyWeekRow = { name: string; points: number; me?: boolean };
export type DailyNick = { name: string; code: string };
export type DailyBoxItem = { id: string; at: number; note: string; base: string; baseJa: string; ilvl: number; aims: DailyAim[]; status: "wait" | "ok" };
type Db = { nick?: DailyNick; names: Record<string, string>; tries: Record<string, DailyTry>; box: DailyBoxItem[] };

const KEY = "exiledesk.daily.v2";
const empty = (): Db => ({ names: {}, tries: {}, box: [] });
function load(): Db { try { return { ...empty(), ...(JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Db> | null) }; } catch { return empty(); } }
function store(d: Db): void { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* 覚えられなくてもその場は動く */ } }

const JST = 9 * 3600_000, H7 = 7 * 3600_000, DAY = 24 * 3600_000;
/** 7:00 JST 区切りの日の番号 */
export const dayNoOf = (now: number): number => Math.floor((now + JST - H7) / DAY);
const dayName = (no: number): string => new Date(no * DAY).toISOString().slice(0, 10);
/** 0 = 月 */
const weekdayOf = (no: number): number => (new Date(no * DAY).getUTCDay() + 6) % 7;

/** 今週の 7 日 (月〜日、7:00 JST 区切り)。一覧の棚の並び */
export const weekDays = (now: number): { id: string; wd: number; md: string; today: boolean }[] => {
  const t = dayNoOf(now), m = t - weekdayOf(t);
  return Array.from({ length: 7 }, (_, i) => ({ id: `g${dayName(m + i)}`, wd: i, md: dayName(m + i).slice(5).replace("-", "/"), today: m + i === t }));
};

/** 今週の生成のお題 (新しい順。先頭が今日) */
let week: { key: number; list: GenTopic[] } | null = null;
function weekTopics(data: PatchData, now: number): GenTopic[] {
  const today = dayNoOf(now);
  if (week?.key === today) return week.list;
  const monday = today - weekdayOf(today), list: GenTopic[] = [], recent: string[] = [];
  for (let no = monday; no <= today; no++) {
    const g = generateTopic(data, dayName(no), weekdayOf(no), recent);
    if (g) { list.unshift(g); recent.unshift(g.typeId); }
  }
  week = { key: today, list };
  return list;
}
const fromGen = (g: GenTopic, baseJa: (en: string) => string): DailyTopic => ({ id: `g${g.day}`, day: g.day.slice(5).replace("-", "/"), by: "", base: g.base, baseJa: baseJa(g.base), ilvl: g.ilvl, modCount: g.aims.length, level: g.level, tries: 0, sample: true });
const fromBox = (b: DailyBoxItem): DailyTopic => ({ id: b.id, day: new Date(b.at).toISOString().slice(5, 10).replace("-", "/"), by: load().nick?.name ?? "", base: b.base, baseJa: b.baseJa, ilvl: b.ilvl, modCount: b.aims.length, level: 2, tries: 0, sample: false });

/** GET /daily.json の topics。先頭が今日のお題、残りは新しい順の溜まり */
export function listTopics(data: PatchData, baseJa: (en: string) => string, now = Date.now()): DailyTopic[] {
  return [...weekTopics(data, now).map((g) => fromGen(g, baseJa)), ...load().box.filter((b) => b.status === "ok").map(fromBox)];
}
/** POST /daily/start が返す狙い */
export function aimsOfTopic(data: PatchData, id: string, now = Date.now()): DailyAim[] | null {
  return load().box.find((b) => b.id === id)?.aims ?? weekTopics(data, now).find((g) => `g${g.day}` === id)?.aims ?? null;
}

export const getTry = (id: string): DailyTry | null => load().tries[id] ?? null;
/** POST /daily/start。お題ごとに 1 回 (2 回目は同じ挑戦を返す) */
export function startTry(id: string, aims: DailyAim[]): DailyTry {
  const d = load();
  d.tries[id] ??= { topicId: id, usedMs: 0, aims };
  store(d);
  return d.tries[id]!;
}
export function updateTry(id: string, patch: Partial<DailyTry>): void {
  const d = load();
  if (d.tries[id]) { Object.assign(d.tries[id]!, patch); store(d); }
}
export const leftMs = (t: DailyTry): number => TIME_LIMIT_MS - t.usedMs;
/** POST /daily/submit。何回でも出せて、記録は解決の中で一番安い物。時間切れの後は受けない */
export function submitTry(id: string, cost: number, rate: number): { ok: boolean; best: DailyRecord | null } {
  const d = load(), t = d.tries[id];
  if (!t || leftMs(t) < -30_000) return { ok: false, best: t?.best ?? null };
  const rec: DailyRecord = { cost, rate, ms: t.usedMs, at: Date.now() };
  t.last = rec;
  if (rate >= SOLVE_RATE && (!t.best || cost < t.best.cost)) t.best = rec;
  store(d);
  return { ok: true, best: t.best ?? null };
}
/** 順位 (D-50)。解決だけ、費用の安い順、同じなら先の人 */
export function rankOf(id: string): DailyRankRow[] {
  const d = load(), best = d.tries[id]?.best;
  const rows: DailyRankRow[] = [...(id.startsWith("g") ? sampleRank(id) : []), ...(best && d.nick ? [{ name: d.nick.name, cost: best.cost, rate: best.rate, ms: best.ms, me: true }] : [])];
  return rows.sort((a, b) => a.cost - b.cost);
}
/** 順位 → 週間の点 (D-53) */
export const pointsOf = (place: number): number => TOP10[place] ?? 1;
/** 今週の点の表 (D-53)。ids = 今週のお題 */
export function weekTable(ids: readonly string[]): DailyWeekRow[] {
  const sum = new Map<string, DailyWeekRow>();
  for (const id of ids) rankOf(id).forEach((r, i) => { const x = sum.get(r.name) ?? { name: r.name, points: 0, ...(r.me ? { me: true } : {}) }; x.points += pointsOf(i); sum.set(r.name, x); });
  return [...sum.values()].sort((a, b) => b.points - a.points);
}
/** 先週の順位 (D-54、月曜の締めの daily_weeks)。無ければ null */
export const lastWeekPlace = (name: string): number | null => LAST_WEEK[name] ?? null;

export const myNick = (): DailyNick | null => load().nick ?? null;
/** 同じ名前の見分け (全角半角・大文字小文字をそろえる、D-52) */
const nameKey = (s: string): string => s.normalize("NFKC").trim().toLowerCase();
const RESERVED = /exiledesk|運営|admin|公式|official/;
const CODE_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode(): string {
  const a = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(a, (x) => CODE_ABC[x % CODE_ABC.length]).join("");
}
export type NickError = "empty" | "long" | "url" | "reserved" | "taken" | "wrong";
function nickError(name: string): NickError | null {
  const k = nameKey(name);
  if (!k || !/[\p{L}\p{N}]/u.test(k)) return "empty";
  if ([...name.trim()].length > NICK_MAX) return "long";
  if (/https?:|www\.|\.[a-z]{2,}\//.test(k)) return "url";
  if (RESERVED.test(k)) return "reserved";
  if (k in load().names) return "taken";
  return null;
}
/** POST /daily/nick (決める)。引き継ぎコードはここで 1 度だけ返す */
export function createNick(name: string): DailyNick | NickError {
  const e = nickError(name);
  if (e) return e;
  const d = load(), nick = { name: name.trim(), code: newCode() };
  d.names[nameKey(name)] = nick.code;
  d.nick = nick;
  store(d);
  return nick;
}
/** POST /daily/nick (引き継ぎコードで戻す) */
export function restoreNick(name: string, code: string): DailyNick | NickError {
  const d = load(), k = nameKey(name);
  if (d.names[k] !== code.trim().toUpperCase()) return "wrong";
  d.nick = { name: name.trim(), code: d.names[k]! };
  store(d);
  return d.nick;
}

export function postBox(item: Omit<DailyBoxItem, "id" | "at" | "status">): DailyBoxItem {
  const d = load(), b: DailyBoxItem = { ...item, id: `p${Date.now().toString(36)}`, at: Date.now(), status: "wait" };
  d.box.push(b);
  store(d);
  return b;
}
export const myBox = (): DailyBoxItem[] => load().box;
/** 開発版だけの「通す」(D-90。本物の精査は手元の台本、D-20) */
export function devApprove(id: string): void {
  const d = load(), b = d.box.find((x) => x.id === id);
  if (b) { b.status = "ok"; store(d); }
}

/** 今日の更新 (毎朝 7:00 JST) と週のリセット (月曜 7:00 JST) までの ms */
export function untilRefresh(now: number): { daily: number; weekly: number } {
  const t = now + JST - H7, into = t % DAY;
  return { daily: DAY - into, weekly: 7 * DAY - (weekdayOf(dayNoOf(now)) * DAY + into) };
}
export const levelOf = (i: number): (typeof LEVELS)[number] => LEVELS[i] ?? LEVELS[0];
