/**
 * daily-api.ts — デイリーのサーバーの口 (D-56) と同じ形の関数。今はサーバーが無いので中身はこのブラウザの localStorage (D-90)。
 * サーバーができたら関数の中だけを fetch に替える。画面はここしか呼ばない。お題の狙いは startTry か締めた日だけ返す (伏せる、D-32b)。
 * 日は 16:00 JST 区切り (D-01)、スタートは 14:50 まで、挑戦は実際の時計で 1 時間 (D-32)。お題は箱が先、無ければ週の予定 (D-84・D-06)。
 * 型のファイルは今はサーバーに無いので手の辞書の見本 (D-80)。順位の相手と札は見本で意味は無い (daily-samples)
 */
import type { PatchData } from "../../services/craft-stage/engine";
import { goalBlock } from "../../services/simulator/sim-engine";
import { classOfBase, devSamples, floorAims, planWeek, slotOfClass, SLOTS, topicOfPlan, type DailySample, type GenAim, type PlanDay, type PlanHistory } from "./daily-gen";
import { awardsOf, shownAward, type Award, type DayResult } from "./daily-titles";
import { SAMPLE_TITLES, sampleRank } from "./daily-samples";

export const TIME_LIMIT_MS = 60 * 60 * 1000;
/** 解決の完成率 (%、D-02) */
export const SOLVE_RATE = 90;
export const NICK_MAX = 12;
/** 曜日の部位の名前 (D-05、0 = 月) */
export const SLOT_NAMES: readonly { ja: string; en: string }[] = SLOTS.map(({ ja, en }) => ({ ja, en }));

export type DailyAim = GenAim;
/** 一覧に出す形。aims は締めた日だけ入る (D-32b) */
export type DailyTopic = { id: string; day: string; dayNo: number; base: string; baseJa: string; ilvl: number; modCount: number; slot: number; tries: number; sample: boolean; fromBox: boolean; aims?: DailyAim[] };
export type DailyRecord = { cost: number; rate: number; ms: number; at: number };
/** startedAt = スタートを押した時刻 (サーバーの時計、D-32) */
export type DailyTry = { topicId: string; startedAt: number; aims: DailyAim[]; fractured?: string; tree?: string; best?: DailyRecord; last?: DailyRecord };
export type DailyRankRow = { name: string; cost: number; rate: number; ms: number; me?: boolean };
export type DailyNick = { name: string; code: string };
/** status: ok = 機械の確かめを通って箱の中、no = 落ちた (why に訳)、used = お題に出た (D-20) */
export type DailyBoxItem = { id: string; at: number; note: string; base: string; baseJa: string; ilvl: number; aims: DailyAim[]; status: "ok" | "no" | "used"; why?: string };
/** 出たお題の控え (daily_topics の写し)。箱から出た物は boxId、予定から出た物は sampleId */
type Shown = { base: string; slot: number; cls: string; boxId?: string; sampleId?: string };
type Db = { nick?: DailyNick; names: Record<string, string>; tries: Record<string, DailyTry>; box: DailyBoxItem[]; shown: Record<string, Shown>; titlePick?: string; awards?: Award[] };

const KEY = "exiledesk.daily.v3";
const empty = (): Db => ({ names: {}, tries: {}, box: [], shown: {} });
function load(): Db { try { return { ...empty(), ...(JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Db> | null) }; } catch { return empty(); } }
function store(d: Db): void { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* 覚えられなくてもその場は動く */ } }

const JST = 9 * 3600_000, H16 = 16 * 3600_000, DAY = 24 * 3600_000;
/** スタートの締め切り = 16:00 から 22 時間 50 分 = 14:50 (D-01) */
const START_CLOSE = 22 * 3600_000 + 50 * 60_000;
/** 16:00 JST 区切りの日の番号。その日の 16:00 の日付で呼ぶ */
export const dayNoOf = (now: number): number => Math.floor((now + JST - H16) / DAY);
const dayName = (no: number): string => new Date(no * DAY).toISOString().slice(0, 10);
const dayNoOfName = (s: string): number => Math.round(Date.parse(`${s}T00:00:00Z`) / DAY);
/** 0 = 月 */
const weekdayOf = (no: number): number => (new Date(no * DAY).getUTCDay() + 6) % 7;
/** その日が始まる時刻 (16:00 JST) */
const startAt = (no: number): number => no * DAY + H16 - JST;
const idOf = (no: number): string => `d${dayName(no)}`;
const noOfId = (id: string): number | null => (/^d\d{4}-\d\d-\d\d$/.test(id) ? dayNoOfName(id.slice(1)) : null);
/** 今スタートできる時間か (16:00〜14:50) */
export const canStartAt = (now: number): boolean => (now + JST - H16) % DAY < START_CLOSE;

/** 次の切り替え (16:00) と今日のスタートの締め切り (14:50) までの ms。締め切りを過ぎたら close は 0 */
export function untilRefresh(now: number): { next: number; close: number } {
  const into = (now + JST - H16) % DAY;
  return { next: DAY - into, close: Math.max(0, START_CLOSE - into) };
}

// --- 型のファイルと週の予定 (D-80b・D-06) ---

/** 型のファイルを読む口 (GET /daily/samples の形)。サーバーができるまでは手の辞書の見本 */
let samplesMemo: DailySample[] | null = null;
export function weekSamples(data: PatchData): { list: DailySample[]; sample: boolean } {
  samplesMemo ??= devSamples(data);
  return { list: samplesMemo, sample: true };
}
const historyBefore = (d: Db, no: number): PlanHistory =>
  Object.entries(d.shown).filter(([day]) => dayNoOfName(day) < no).sort(([a], [b]) => a.localeCompare(b)).map(([, s]) => ({ slot: s.slot, cls: s.cls, base: s.base }));
let planMemo: { monday: number; size: number; days: Array<PlanDay | null> } | null = null;
/** その週の予定 (月〜日)。週の取得の時に先に決める物 (daily_plan) */
function weekPlan(data: PatchData, monday: number): Array<PlanDay | null> {
  const d = load(), size = Object.keys(d.shown).filter((day) => dayNoOfName(day) < monday).length;
  if (planMemo?.monday === monday && planMemo.size === size) return planMemo.days;
  const w = weekSamples(data), days = planWeek(data, Array.from({ length: 7 }, (_, i) => dayName(monday + i)), w.list, historyBefore(d, monday), w.sample);
  planMemo = { monday, size, days };
  return days;
}

/** 16:00 に出すお題を決める (D-84): ① 箱にその日の予定のベース ② 箱から抽選 ③ 予定。決めた物は控えに書き、後から変えない */
function settle(data: PatchData, no: number): Shown | null {
  const d = load(), day = dayName(no);
  if (d.shown[day]) return d.shown[day]!;
  const plan = weekPlan(data, no - weekdayOf(no))[weekdayOf(no)] ?? null;
  const box = d.box.filter((b) => b.status === "ok" && b.at < startAt(no));
  const pick = box.find((b) => plan && b.base === plan.base) ?? (box.length ? box[Math.abs(Math.imul(no, 2654435761)) % box.length]! : null);
  let s: Shown | null = null;
  if (pick) {
    const cls = classOfBase(pick.base) ?? "";
    s = { base: pick.base, slot: slotOfClass(cls) ?? weekdayOf(no), cls, boxId: pick.id };
    pick.status = "used";
  } else if (plan) s = { base: plan.base, slot: plan.slot, cls: classOfBase(plan.base) ?? "", sampleId: plan.sampleId };
  if (!s) return null;
  d.shown[day] = s;
  store(d);
  return s;
}
function aimsOf(data: PatchData, no: number): { aims: DailyAim[]; ilvl: number; sample: boolean } | null {
  const s = settle(data, no);
  if (!s) return null;
  if (s.boxId) { const b = load().box.find((x) => x.id === s.boxId); return b ? { aims: b.aims, ilvl: b.ilvl, sample: false } : null; }
  const plan = weekPlan(data, no - weekdayOf(no))[weekdayOf(no)];
  const g = plan ? topicOfPlan(data, plan, weekSamples(data).list) : null;
  return g ? { aims: g.aims, ilvl: g.ilvl, sample: true } : null;
}

/** お題 1 つ (GET /daily.json の 1 行)。まだ来ていない日は null */
export function topicOfId(data: PatchData, baseJa: (en: string) => string, id: string, now = Date.now()): DailyTopic | null {
  const no = noOfId(id);
  if (no == null || no > dayNoOf(now)) return null;
  const s = settle(data, no), a = s ? aimsOf(data, no) : null;
  if (!s || !a) return null;
  const closed = no < dayNoOf(now);
  return { id, day: dayName(no).slice(5).replace("-", "/"), dayNo: no, base: s.base, baseJa: baseJa(s.base), ilvl: a.ilvl, modCount: a.aims.length, slot: s.slot, tries: 0, sample: a.sample, fromBox: !!s.boxId, ...(closed ? { aims: a.aims } : {}) };
}
export const todayId = (now = Date.now()): string => idOf(dayNoOf(now));
export const yesterdayId = (now = Date.now()): string => idOf(dayNoOf(now) - 1);

/** 今週の棚 (月〜日、16:00 区切り)。来ていない日はお題無しで曜日の部位だけ (D-60d) */
export function weekBoard(data: PatchData, baseJa: (en: string) => string, now = Date.now()): Array<{ id: string; wd: number; md: string; today: boolean; t: DailyTopic | null }> {
  const t = dayNoOf(now), m = t - weekdayOf(t);
  return Array.from({ length: 7 }, (_, i) => ({ id: idOf(m + i), wd: i, md: dayName(m + i).slice(5).replace("-", "/"), today: m + i === t, t: m + i <= t ? topicOfId(data, baseJa, idOf(m + i), now) : null }));
}

// --- 挑戦 (D-32・D-33・D-56) ---

export const getTry = (id: string): DailyTry | null => load().tries[id] ?? null;
export type StartError = "notToday" | "closed";
/** POST /daily/start。今日のお題だけ、14:50 まで、1 日 1 回 (もう始めていれば同じ挑戦を返し、始め直せない) */
export function startTry(data: PatchData, id: string, now = Date.now()): DailyTry | StartError {
  const d = load();
  if (d.tries[id]) return d.tries[id]!;
  if (id !== todayId(now)) return "notToday";
  if (!canStartAt(now)) return "closed";
  const a = aimsOf(data, dayNoOf(now));
  if (!a) return "notToday";
  d.tries[id] = { topicId: id, startedAt: now, aims: a.aims };
  store(d);
  return d.tries[id]!;
}
export function updateTry(id: string, patch: Partial<Pick<DailyTry, "fractured" | "tree">>): void {
  const d = load();
  if (d.tries[id]) { Object.assign(d.tries[id]!, patch); store(d); }
}
/** 残り時間 (実際の時計、ページを閉じても進む) */
export const leftMs = (t: DailyTry, now = Date.now()): number => t.startedAt + TIME_LIMIT_MS - now;
/** POST /daily/submit。何回でも出せて、記録は解決の中で一番安い物。始めた時刻から 1 時間 + 30 秒を過ぎたら受けない */
export function submitTry(id: string, cost: number, rate: number, now = Date.now()): { ok: boolean; best: DailyRecord | null } {
  const d = load(), t = d.tries[id];
  if (!t || leftMs(t, now) < -30_000) return { ok: false, best: t?.best ?? null };
  const rec: DailyRecord = { cost, rate, ms: now - t.startedAt, at: now };
  t.last = rec;
  if (rate >= SOLVE_RATE && (!t.best || cost < t.best.cost)) t.best = rec;
  store(d);
  return { ok: true, best: t.best ?? null };
}

// --- 順位と称号 (D-50・D-54・D-100〜103) ---

/** 順位 (D-50)。解決だけ、費用の安い順、同じなら先の人 */
export function rankOf(id: string): DailyRankRow[] {
  const d = load(), best = d.tries[id]?.best;
  const rows: DailyRankRow[] = [...sampleRank(id), ...(best && d.nick ? [{ name: d.nick.name, cost: best.cost, rate: best.rate, ms: best.ms, me: true }] : [])];
  return rows.sort((a, b) => a.cost - b.cost);
}
/** 卓の右 = 昨日の上位 3 人 (D-60d) */
export const yesterdayTop = (now = Date.now()): DailyRankRow[] => rankOf(yesterdayId(now)).slice(0, 3);

/** 日の結果 (daily_results)。締めた日の自分の挑戦から作る (サーバーでは全員分) */
function myResults(now: number): DayResult[] {
  const d = load();
  if (!d.nick) return [];
  return Object.values(d.tries).flatMap((t) => {
    const no = noOfId(t.topicId), s = no == null ? null : d.shown[dayName(no)];
    if (no == null || no >= dayNoOf(now) || !s) return [];
    const rows = rankOf(t.topicId), place = t.best ? rows.findIndex((r) => r.me) + 1 : null;
    return [{ day: dayName(no), nick: d.nick!.name, place: place || null, cost: t.best?.cost ?? 0, rate: (t.best ?? t.last)?.rate ?? 0, ms: (t.best ?? t.last)?.ms ?? 0, solvedN: rows.length, enteredN: rows.length, slot: s.slot, base: s.base }];
  });
}
/** 自分の称号 (計算し直して覚える。消した称号は昔の称号で残る) */
export function myAwards(now = Date.now()): Award[] {
  const d = load();
  if (!d.nick) return [];
  const a = awardsOf(d.nick.name, myResults(now), d.awards ?? []);
  if (JSON.stringify(a) !== JSON.stringify(d.awards ?? [])) { d.awards = a; store(d); }
  return a;
}
export const myTitlePick = (): string | null => load().titlePick ?? null;
/** POST /daily/title。持っている称号だけ選べる。null で「一番格上」に戻す */
export function setTitlePick(id: string | null): boolean {
  const d = load();
  if (id && !myAwards().some((a) => a.id === id)) return false;
  if (id) d.titlePick = id; else delete d.titlePick;
  store(d);
  return true;
}
/** 名前の横の札 (D-54)。自分は計算した称号、ほかの人は見本 */
export function titleOfName(name: string): { ja: string; en: string; rank: number } | null {
  const me = load().nick?.name;
  if (name === me) return shownAward(myAwards(), myTitlePick());
  return SAMPLE_TITLES[name] ?? null;
}

// --- ニックネーム (D-51・D-52) ---

export const myNick = (): DailyNick | null => load().nick ?? null;
/** 同じ名前の見分け (全角半角・大文字小文字をそろえる、D-52) */
const nameKey = (s: string): string => s.normalize("NFKC").trim().toLowerCase();
const RESERVED = /exiledesk|運営|admin|公式|official/;
/** 悪口の表 (D-20・D-51)。名前と一言の両方で見る */
const BAD = /死ね|しね|氏ね|殺す|ころす|くそ|クソ|ゴミ|カス|きもい|キモい|fuck|shit|bitch|cunt|nigg|retard/i;
export const hasBadWord = (s: string): boolean => BAD.test(s.normalize("NFKC"));
const CODE_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode(): string {
  const a = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(a, (x) => CODE_ABC[x % CODE_ABC.length]).join("");
}
export type NickError = "empty" | "long" | "url" | "reserved" | "bad" | "taken" | "wrong";
function nickError(name: string): NickError | null {
  const k = nameKey(name);
  if (!k || !/[\p{L}\p{N}]/u.test(k)) return "empty";
  if ([...name.trim()].length > NICK_MAX) return "long";
  if (/https?:|www\.|\.[a-z]{2,}\//.test(k)) return "url";
  if (RESERVED.test(k)) return "reserved";
  if (hasBadWord(k)) return "bad";
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

// --- 投稿と機械の確かめ (D-20) ---

/** 機械の確かめ (D-20)。エンジンで作れるか (同じ系統の重なりも goalBlock が見る)・名前と一言に悪口が無いか。落ちたら訳、通れば null */
export function boxCheck(data: PatchData, item: Pick<DailyBoxItem, "base" | "ilvl" | "aims" | "note">, nick: string): string | null {
  if (!item.aims.length) return "no-mods";
  if (hasBadWord(item.note) || hasBadWord(nick)) return "bad-word";
  const done: DailyAim[] = [];
  for (const a of item.aims) {
    const why = goalBlock(data, item.base, item.ilvl, done.map((x) => ({ modId: x.modId, tier: x.tier })), { modId: a.modId, tier: a.tier });
    if (why) return why;
    done.push(a);
  }
  return null;
}
/** POST /daily/box。段の下限は D-04 (T1 は T1、ほかは T2 以上) に上げてから確かめ、通れば箱へ、落ちれば訳を付けて残す (日報の材料) */
export function postBox(data: PatchData, item: Omit<DailyBoxItem, "id" | "at" | "status" | "why">): DailyBoxItem {
  const d = load(), aims = floorAims(data, item.base, item.ilvl, item.aims);
  const why = boxCheck(data, { ...item, aims }, d.nick?.name ?? "");
  const b: DailyBoxItem = { ...item, aims, id: `p${Date.now().toString(36)}`, at: Date.now(), status: why ? "no" : "ok", ...(why ? { why } : {}) };
  d.box.push(b);
  store(d);
  return b;
}
export const myBox = (): DailyBoxItem[] => load().box;
