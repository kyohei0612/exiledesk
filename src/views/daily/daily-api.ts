/**
 * daily-api.ts — デイリーのサーバーの口 (D-56、server/live/src/daily/)。画面はここしか呼ばない。
 * 一覧 (GET /daily.json) は reactive な控え `daily.remote` に入れ、画面は同期の関数で読む。書く口 (名前・スタート・提出・札・投稿) は async。
 * この端末に残すのは名前の控え (nickId + 引き継ぎコード)・挑戦の写しと木 (D-32「木は端末に残す」)・自分の投稿 (D-15) だけ。
 * 時刻の式 (16:00 区切り・14:50 締め切り・1 時間) は server/live/src/daily/time.ts と同じ (直す時は両方)。時刻と 1 日 1 回の正はサーバー (D-32)
 */
import { reactive, toRaw } from "vue";
import type { PatchData } from "../../services/craft-stage/engine";
import { WEB_API_BASE } from "../../web/config";
import { floorAims, SLOTS, type GenAim } from "./daily-gen";
import { boxCheck } from "./daily-check";
import { awardsOf, shownAward, type Award, type DayResult } from "./daily-titles";

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
/** startedAt = スタートを押した時刻 (サーバーの時計、D-32)。seed・prices はお題に固定した種と相場の写し (D-34)。fractured・tree はこの端末だけ */
export type DailyTry = { topicId: string; startedAt: number; aims: DailyAim[]; seed?: number; prices?: unknown; fractured?: string; tree?: string; best?: DailyRecord; last?: DailyRecord };
export type DailyRankRow = { name: string; cost: number; rate: number; ms: number; me?: boolean };
export type DailyNick = { id: string; name: string; code: string };
/** status: wait = 受けた (16:00 の台本が機械の確かめをする)、ok = 通って箱の中、no = 落ちた (why に訳)、used = お題に出た (D-20) */
export type DailyBoxItem = { id: string; at: number; note: string; base: string; baseJa: string; ilvl: number; aims: DailyAim[]; status: "wait" | "ok" | "no" | "used"; why?: string };
type Title = { ja: string; en: string; rank: number };
type WeekDay = { id: string; wd: number; md: string; today: boolean; t: DailyTopic | null };
/** GET /daily.json の形 (server/live/src/daily/api.ts の dailyJson) */
type Remote = { now: number; today: string; yesterday: string; week: WeekDay[]; yesterdayTopic: DailyTopic | null; ranks: Record<string, DailyRankRow[]>; yesterdayTop: DailyRankRow[]; titles: Record<string, Title> };
type Local = { nick?: DailyNick; tries: Record<string, DailyTry>; box: DailyBoxItem[]; titlePick?: string; awards?: Award[] };

const KEY = "exiledesk.daily.v4";
function loadLocal(): Local {
  const empty: Local = { tries: {}, box: [] };
  try { return { ...empty, ...(JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Local> | null) }; } catch { return empty; }
}
function save(): void { try { localStorage.setItem(KEY, JSON.stringify(toRaw(daily.local))); } catch { /* 覚えられなくてもその場は動く */ } }

/** 画面が読む控え。remote = 最後に読んだ GET /daily.json、failed = 読めなかった */
export const daily = reactive<{ remote: Remote | null; failed: boolean; local: Local }>({ remote: null, failed: false, local: loadLocal() });

/** 行き先。開発の時だけ手元の口 (`pnpm dev:daily-api` が立てる wrangler dev、VITE_DAILY_API で替えられる)。本番は WEB_API_BASE */
const API = import.meta.env.DEV ? ((import.meta.env.VITE_DAILY_API as string | undefined) ?? "http://localhost:8797") : WEB_API_BASE;
/** サーバーへ 1 回。POST は text/plain で送る (CORS の下見を出さない、no-log.ts と同じ)。つながらない・200 でない時は null */
async function call<T>(path: string, body?: unknown): Promise<T | null> {
  try {
    const r = await fetch(`${API}${path}`, body === undefined ? { credentials: "omit" } : { method: "POST", credentials: "omit", headers: { "content-type": "text/plain;charset=UTF-8" }, body: JSON.stringify(body) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
}
const auth = (): { nickId: string; code: string } | null => { const n = daily.local.nick; return n ? { nickId: n.id, code: n.code } : null; };

/** 一覧を読み直す (ページを開いた時・16:00 を越えた時)。端のキャッシュで 60 秒は古いことがある (D-56)。自分の投稿の状態も読む */
export async function refreshDaily(): Promise<void> {
  const r = await call<Remote>("/daily.json");
  daily.failed = !r;
  if (r) daily.remote = r;
  const ids = daily.local.box.filter((b) => b.status === "wait" || b.status === "ok").map((b) => b.id);
  if (!ids.length) return;
  const st = await call<{ box: Array<{ id: string; status: DailyBoxItem["status"]; why: string | null }> }>(`/daily/box.json?ids=${ids.join(",")}`);
  for (const x of st?.box ?? []) {
    const b = daily.local.box.find((y) => y.id === x.id);
    if (b) { b.status = x.status; if (x.why) b.why = x.why; else delete b.why; }
  }
  save();
}

const JST = 9 * 3600_000, H16 = 16 * 3600_000, DAY = 24 * 3600_000;
/** スタートの締め切り = 16:00 から 22 時間 50 分 = 14:50 (D-01) */
const START_CLOSE = 22 * 3600_000 + 50 * 60_000;
/** 16:00 JST 区切りの日の番号。その日の 16:00 の日付で呼ぶ */
export const dayNoOf = (now: number): number => Math.floor((now + JST - H16) / DAY);
const idOf = (no: number): string => `d${new Date(no * DAY).toISOString().slice(0, 10)}`;
/** 今スタートできる時間か (16:00〜14:50) */
export const canStartAt = (now: number): boolean => (now + JST - H16) % DAY < START_CLOSE;
/** 次の切り替え (16:00) と今日のスタートの締め切り (14:50) までの ms。締め切りを過ぎたら close は 0 */
export function untilRefresh(now: number): { next: number; close: number } {
  const into = (now + JST - H16) % DAY;
  return { next: DAY - into, close: Math.max(0, START_CLOSE - into) };
}
export const todayId = (now = Date.now()): string => idOf(dayNoOf(now));

// --- お題と棚 (GET /daily.json) ---

const withJa = (t: DailyTopic, baseJa: (en: string) => string): DailyTopic => ({ ...t, baseJa: baseJa(t.base) });
/** 今週の棚 (月〜日、16:00 区切り)。来ていない日はお題無しで曜日の部位だけ (D-60d) */
export function weekBoard(baseJa: (en: string) => string): WeekDay[] {
  return (daily.remote?.week ?? []).map((d) => ({ ...d, t: d.t ? withJa(d.t, baseJa) : null }));
}
/** お題 1 つ。サーバーが返すのは今週と昨日だけ。無ければ null */
export function topicOfId(baseJa: (en: string) => string, id: string): DailyTopic | null {
  const r = daily.remote;
  const t = r?.week.find((d) => d.id === id)?.t ?? (r?.yesterdayTopic?.id === id ? r.yesterdayTopic : null);
  return t ? withJa(t, baseJa) : null;
}

// --- 挑戦 (D-32・D-33・D-56) ---

export const getTry = (id: string): DailyTry | null => daily.local.tries[id] ?? null;
export type StartError = "notToday" | "closed" | "nick" | "net";
/** POST /daily/start。今日のお題だけ、14:50 まで、1 日 1 回 (もう始めていれば同じ挑戦が返り、始め直せない)。ここで初めて MOD が来る */
export async function startTry(id: string): Promise<DailyTry | StartError> {
  const a = auth();
  if (!a) return "nick";
  const r = await call<(DailyTry & { error?: undefined }) | { error: string }>("/daily/start", { ...a, id });
  if (!r) return "net";
  // 合言葉が通らない = サーバーにこの名前が無い (置き場を作り直した等)。端末の名前を消して決め直してもらう
  if (r.error === "nick") { delete daily.local.nick; save(); return "nick"; }
  if (r.error !== undefined) return r.error === "closed" ? "closed" : "notToday";
  // 木を引き継ぐのは同じ挑戦 (始めた時刻が同じ) の時だけ
  const had = daily.local.tries[id], same = had?.startedAt === (r as DailyTry).startedAt;
  daily.local.tries[id] = { ...(r as DailyTry), ...(same && had?.fractured ? { fractured: had.fractured } : {}), ...(same && had?.tree ? { tree: had.tree } : {}) };
  save();
  return daily.local.tries[id]!;
}
export function updateTry(id: string, patch: Partial<Pick<DailyTry, "fractured" | "tree">>): void {
  const t = daily.local.tries[id];
  if (t) { Object.assign(t, patch); save(); }
}
/** 残り時間 (実際の時計、ページを閉じても進む) */
export const leftMs = (t: DailyTry, now = Date.now()): number => t.startedAt + TIME_LIMIT_MS - now;
/** POST /daily/submit。何回でも出せて、記録は解決の中で一番安い物。木 (recipe) も一緒に送る (D-55、検算 D-58 の材料)。1 時間 + 30 秒を過ぎたらサーバーが断る */
export async function submitTry(id: string, cost: number, rate: number, now = Date.now()): Promise<{ ok: boolean; best: DailyRecord | null }> {
  const a = auth(), t = daily.local.tries[id];
  if (!a || !t) return { ok: false, best: t?.best ?? null };
  const r = await call<{ ok?: boolean; best?: DailyRecord | null; error?: string }>("/daily/submit", { ...a, id, cost, rate, recipe: t.tree ?? null });
  if (!r?.ok) return { ok: false, best: t.best ?? null };
  t.last = { cost, rate, ms: now - t.startedAt, at: now };
  if (r.best) t.best = r.best; else delete t.best;
  save();
  return { ok: true, best: t.best ?? null };
}

// --- 順位と称号 (D-50・D-54・D-100〜103) ---

/** 順位 (D-50)。解決だけ、費用の安い順、同じなら先の人。サーバーの表は 60 秒古いことがあるので、自分の記録はこの端末の物で上書きする */
export function rankOf(id: string): DailyRankRow[] {
  const me = daily.local.nick?.name, best = daily.local.tries[id]?.best;
  const rows = (daily.remote?.ranks[id] ?? []).filter((r) => !(best && r.name === me)).map((r) => (r.name === me ? { ...r, me: true } : r));
  if (best && me) rows.push({ name: me, cost: best.cost, rate: best.rate, ms: best.ms, me: true });
  return rows.sort((a, b) => a.cost - b.cost);
}
/** 卓の右 = 昨日の上位 3 人 (D-60d) */
export const yesterdayTop = (): DailyRankRow[] => (daily.remote ? rankOf(daily.remote.yesterday).slice(0, 3) : []);

/** 日の結果 (daily_results の形)。サーバーに自分の称号を返す口がまだ無いので、締めた日の自分の挑戦からこの端末で数える (TITLES は空、D-103) */
function myResults(): DayResult[] {
  const nick = daily.local.nick, today = daily.remote?.today;
  if (!nick || !today) return [];
  return Object.values(daily.local.tries).flatMap((t) => {
    const top = topicOfId((x) => x, t.topicId);
    if (!top || t.topicId >= today) return [];
    const rows = rankOf(t.topicId), place = t.best ? rows.findIndex((r) => r.me) + 1 : 0;
    return [{ day: t.topicId.slice(1), nick: nick.name, place: place || null, cost: t.best?.cost ?? 0, rate: (t.best ?? t.last)?.rate ?? 0, ms: (t.best ?? t.last)?.ms ?? 0, solvedN: rows.length, enteredN: top.tries, slot: top.slot, base: top.base }];
  });
}
/** 自分の称号 (計算し直して覚える。消した称号は昔の称号で残る)。控えは toRaw に書く (computed の中から呼ばれるので画面を揺らさない) */
export function myAwards(): Award[] {
  const raw = toRaw(daily.local);
  if (!raw.nick) return [];
  const a = awardsOf(raw.nick.name, myResults(), raw.awards ?? []);
  if (JSON.stringify(a) !== JSON.stringify(raw.awards ?? [])) { raw.awards = a; save(); }
  return a;
}
export const myTitlePick = (): string | null => daily.local.titlePick ?? null;
/** POST /daily/title。持っている称号だけ選べる。null で「一番格上」に戻す */
export async function setTitlePick(id: string | null): Promise<boolean> {
  const a = auth();
  if (!a || (id && !myAwards().some((x) => x.id === id))) return false;
  const r = await call<{ ok?: boolean }>("/daily/title", { ...a, titleId: id });
  if (!r?.ok) return false;
  if (id) daily.local.titlePick = id; else delete daily.local.titlePick;
  save();
  return true;
}
/** 名前の横の札 (D-54)。自分は計算した称号、ほかの人はサーバーの札 */
export function titleOfName(name: string): Title | null {
  if (name === daily.local.nick?.name) return shownAward(myAwards(), myTitlePick()) ?? daily.remote?.titles[name] ?? null;
  return daily.remote?.titles[name] ?? null;
}

// --- ニックネーム (D-51・D-52) ---

export const myNick = (): DailyNick | null => daily.local.nick ?? null;
/** 名前の断りの訳 (server/live/src/daily/nick.ts の NickError と同じ)。net = つながらない */
export type NickError = "empty" | "long" | "url" | "reserved" | "bad" | "taken" | "wrong" | "busy" | "net";
async function nickPost(body: { name: string; code?: string }): Promise<DailyNick | NickError> {
  const r = await call<DailyNick | { error: NickError }>("/daily/nick", body);
  if (!r) return "net";
  if ("error" in r) return r.error;
  daily.local.nick = r;
  save();
  return r;
}
/** POST /daily/nick (決める)。引き継ぎコードはここで 1 度だけ返る */
export const createNick = (name: string): Promise<DailyNick | NickError> => nickPost({ name });
/** POST /daily/nick (引き継ぎコードで戻す) */
export const restoreNick = (name: string, code: string): Promise<DailyNick | NickError> => nickPost({ name, code });

// --- 投稿 (D-11〜D-15・D-20) ---

/** 投稿の断りの訳。item・large = 形が悪い、busy = 1 時間 5 件を越えた、net = つながらない */
export type BoxError = "item" | "large" | "busy" | "net";
/**
 * POST /daily/box。段の下限は D-04 (T1 は T1、ほかは T2 以上) に上げ、先にこの端末で機械の確かめ (D-20) をする。
 * 落ちた物は送らずに訳を付けて残し、通った物は送る (サーバーは wait で受け、16:00 の台本がもう一度確かめて ok / no にする)
 */
export async function postBox(data: PatchData, item: Omit<DailyBoxItem, "id" | "at" | "status" | "why">): Promise<DailyBoxItem | BoxError> {
  const aims = floorAims(data, item.base, item.ilvl, item.aims);
  const why = boxCheck(data, { ...item, aims }, daily.local.nick?.name ?? "");
  let b: DailyBoxItem;
  if (why) b = { ...item, aims, id: `x${Date.now().toString(36)}`, at: Date.now(), status: "no", why };
  else {
    const r = await call<DailyBoxItem | { error: BoxError }>("/daily/box", { ...(auth() ?? {}), ...item, aims });
    if (!r) return "net";
    if ("error" in r) return r.error;
    b = r;
  }
  daily.local.box.push(b);
  save();
  return b;
}
export const myBox = (): DailyBoxItem[] => daily.local.box;
