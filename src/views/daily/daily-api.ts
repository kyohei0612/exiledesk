/**
 * daily-api.ts — デイリーのサーバーの口 (D-56) と同じ形の関数。今はサーバーが無いので中身はこのブラウザの localStorage (D-90)。
 * サーバーができたら関数の中だけを fetch に替える。画面はここしか呼ばない。お題の狙いは startTry で初めて返す (伏せる、D-32b)。
 * 順位の相手・見本のお題の数字は手で書いた見本で、意味は無い。
 */
import { SAMPLE_TOPICS, type SampleTopic } from "./daily-samples";

export const TIME_LIMIT_MS = 60 * 60 * 1000;
/** 解決の完成率 (%、D-02) */
export const SOLVE_RATE = 90;
export const NICK_MAX = 12;

export type DailyAim = { modId: string; tier: number; ja: string; en: string };
/** 一覧に出す形 (狙いは入れない) */
export type DailyTopic = { id: string; day: string; by: string; base: string; baseJa: string; ilvl: number; modCount: number; tries: number; sample: boolean };
export type DailyRecord = { cost: number; rate: number; ms: number; at: number };
export type DailyTry = { topicId: string; startedAt: number; aims: DailyAim[]; fractured?: string; tree?: string; best?: DailyRecord; last?: DailyRecord };
export type DailyRankRow = { name: string; cost: number; rate: number; ms: number; me?: boolean };
export type DailyNick = { name: string; pass: string };
export type DailyBoxItem = { id: string; at: number; note: string; base: string; baseJa: string; ilvl: number; aims: DailyAim[]; status: "wait" | "ok" };
type Db = { nick?: DailyNick; names: Record<string, string>; tries: Record<string, DailyTry>; box: DailyBoxItem[] };

const KEY = "exiledesk.daily.v1";
const empty = (): Db => ({ names: {}, tries: {}, box: [] });
function load(): Db { try { return { ...empty(), ...(JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Db> | null) }; } catch { return empty(); } }
function store(d: Db): void { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* 覚えられなくてもその場は動く */ } }

const fromBox = (b: DailyBoxItem): DailyTopic => ({ id: b.id, day: new Date(b.at).toISOString().slice(5, 10).replace("-", "/"), by: load().nick?.name ?? "", base: b.base, baseJa: b.baseJa, ilvl: b.ilvl, modCount: b.aims.length, tries: 0, sample: false });
const fromSample = ({ text: _t, rank: _r, ...t }: SampleTopic): DailyTopic => ({ ...t, sample: true });

/** GET /daily.json の topics。先頭が今日のお題、残りは古い順の溜まり */
export function listTopics(): DailyTopic[] {
  return [...SAMPLE_TOPICS.map(fromSample), ...load().box.filter((b) => b.status === "ok").map(fromBox)];
}
export const findTopic = (id: string | null | undefined): DailyTopic | null => listTopics().find((t) => t.id === id) ?? null;
export const sampleText = (id: string): string | null => SAMPLE_TOPICS.find((t) => t.id === id)?.text ?? null;
export const boxAims = (id: string): DailyAim[] | null => load().box.find((b) => b.id === id)?.aims ?? null;

export const getTry = (id: string): DailyTry | null => load().tries[id] ?? null;
/** POST /daily/start。時刻はサーバーが持つ (今は端末の時計)。2 回目は同じ挑戦を返す (Q2 の仮の決め = お題ごとに 1 回) */
export function startTry(id: string, aims: DailyAim[]): DailyTry {
  const d = load();
  d.tries[id] ??= { topicId: id, startedAt: Date.now(), aims };
  store(d);
  return d.tries[id]!;
}
export function updateTry(id: string, patch: Partial<DailyTry>): void {
  const d = load();
  if (d.tries[id]) { Object.assign(d.tries[id]!, patch); store(d); }
}
export const leftMs = (t: DailyTry, now: number): number => t.startedAt + TIME_LIMIT_MS - now;
/** POST /daily/submit。何回でも出せて、記録は解決の中で一番安い物 (Q3 の仮の決め)。締め切りの後は受けない */
export function submitTry(id: string, cost: number, rate: number): { ok: boolean; best: DailyRecord | null } {
  const d = load(), t = d.tries[id];
  if (!t || leftMs(t, Date.now()) < -30_000) return { ok: false, best: t?.best ?? null };
  const rec: DailyRecord = { cost, rate, ms: Date.now() - t.startedAt, at: Date.now() };
  t.last = rec;
  if (rate >= SOLVE_RATE && (!t.best || cost < t.best.cost)) t.best = rec;
  store(d);
  return { ok: true, best: t.best ?? null };
}
/** 順位 (D-50)。解決だけ、費用の安い順、同じなら先の人 */
export function rankOf(id: string): DailyRankRow[] {
  const d = load(), s = SAMPLE_TOPICS.find((t) => t.id === id), best = d.tries[id]?.best;
  const rows: DailyRankRow[] = [...(s?.rank ?? []), ...(best && d.nick ? [{ name: d.nick.name, cost: best.cost, rate: best.rate, ms: best.ms, me: true }] : [])];
  return rows.sort((a, b) => a.cost - b.cost);
}

export const myNick = (): DailyNick | null => load().nick ?? null;
/** 同じ名前の見分け (全角半角・大文字小文字をそろえる、D-52) */
const nameKey = (s: string): string => s.normalize("NFKC").trim().toLowerCase();
const RESERVED = /exiledesk|運営|admin|公式|official/;
const PASS_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newPass(): string {
  const a = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(a, (x) => PASS_ABC[x % PASS_ABC.length]).join("");
}
export type NickError = "empty" | "long" | "url" | "reserved" | "taken" | "wrong";
export function nickError(name: string): NickError | null {
  const k = nameKey(name);
  if (!k || !/[\p{L}\p{N}]/u.test(k)) return "empty";
  if ([...name.trim()].length > NICK_MAX) return "long";
  if (/https?:|www\.|\.[a-z]{2,}\//.test(k)) return "url";
  if (RESERVED.test(k)) return "reserved";
  if (k in load().names) return "taken";
  return null;
}
/** POST /daily/nick (決める)。合言葉はここで 1 度だけ返す */
export function createNick(name: string): DailyNick | NickError {
  const e = nickError(name);
  if (e) return e;
  const d = load(), nick = { name: name.trim(), pass: newPass() };
  d.names[nameKey(name)] = nick.pass;
  d.nick = nick;
  store(d);
  return nick;
}
/** POST /daily/nick (合言葉で戻す) */
export function restoreNick(name: string, pass: string): DailyNick | NickError {
  const d = load(), k = nameKey(name);
  if (d.names[k] !== pass.trim().toUpperCase()) return "wrong";
  d.nick = { name: name.trim(), pass: d.names[k]! };
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
  const JST = 9 * 3600_000, H7 = 7 * 3600_000, DAY = 24 * 3600_000;
  const t = now + JST - H7;
  const daily = DAY - (t % DAY);
  const days = (((new Date(t).getUTCDay() + 6) % 7) * DAY) + (t % DAY);
  return { daily, weekly: 7 * DAY - days };
}
