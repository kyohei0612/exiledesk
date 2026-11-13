/**
 * daily-api.ts — デイリーのサーバーの口 (D-56、server/live/src/daily/)。画面はここしか呼ばない。
 * 一覧 (GET /daily.json) は reactive な控え `daily.remote` に入れ、画面は同期の関数で読む。書く口 (名前・スタート・提出・札・投稿) は async。
 * この端末に残すのは名前の控え (nickId + 引き継ぎコード)・挑戦の写しと木 (D-32「木は端末に残す」)・自分の投稿 (D-15) だけ。
 * 時刻の式 (16:00 区切り・14:50 締め切り・1 時間) は server/live/src/daily/time.ts と同じ (直す時は両方)。時刻と 1 日 1 回の正はサーバー (D-32)
 */
import { reactive, toRaw } from "vue";
import type { PatchData } from "../../services/craft-stage/engine";
import type { StartFrom } from "../../services/simulator/tree/tree-model";
import { WEB_API_BASE } from "../../web/config";
import { floorAims, SLOTS, type GenAim } from "./daily-gen";
import { boxCheck } from "./daily-check";
import type { PostSrc } from "./daily-post-src";
import type { PostCard } from "./daily-post-card";
import { awardsOf, shownAward, type Award, type DayResult } from "./daily-titles";
import { byScore, rankCmp } from "./daily-score";
import { DEV_BUILD, flag } from "../../web/release-flags";

export const TIME_LIMIT_MS = 60 * 60 * 1000;
/** 順位に載る完成率の下限 (%、D-02)。11-09 から 1 人でも完成すれば載る (100 人回しなので 1%、前は 90) */
export const SOLVE_RATE = 1;
export const NICK_MAX = 12;
/** 名前の幅の上限 (D-51a、スイッチ nickWidth、サーバーの nick.ts と同じ): 全角 10 字 = 半角 20 字。半角 = U+0000〜00FF・半角カナ */
export const NICK_WIDTH_MAX = 20;
export const nickWidth = (s: string): number => [...s].reduce((n, c) => { const p = c.codePointAt(0)!; return n + (p <= 0xff || (p >= 0xff61 && p <= 0xff9f) ? 1 : 2); }, 0);
/** 曜日の部位の名前 (D-05、0 = 月) */
export const SLOT_NAMES: readonly { ja: string; en: string }[] = SLOTS.map(({ ja, en }) => ({ ja, en }));

export type DailyAim = GenAim;
/** 一覧に出す形。aims は締めた日だけ入る (D-32b) */
export type DailyTopic = { id: string; day: string; dayNo: number; base: string; baseJa: string; ilvl: number; modCount: number; slot: number; tries: number; sample: boolean; fromBox: boolean; aims?: DailyAim[] };
export type DailyRecord = { cost: number; rate: number; ms: number; at: number };
/** startedAt = スタートを押した時刻 (サーバーの時計、D-32)。seed・prices はお題に固定した種と相場の写し (D-34)。fractured・from・tree はこの端末だけ */
export type DailyTry = { topicId: string; startedAt: number; aims: DailyAim[]; /** 終わった = 諦めた (D-37b) か提出した (D-35c)。木は見るだけ、提出できない */ ended?: boolean; /** 提出して終わった (D-35c) */ submitted?: boolean; seed?: number; prices?: unknown; fractured?: string; /** 始め方 (D-37j)。無ければ (a) フラクチャー済みから */ from?: StartFrom; tree?: string; /** レシピに写しで保存した時の打ち方 (D-36b・D-36c、この端末だけ) */ saved?: string; best?: DailyRecord; last?: DailyRecord; /** 提出の一言 (D-35e、この端末の控え。空 = 後から消した) */ note?: string; /** 後から一言を置いた時刻 (D-35e、少しの間だけ順位の自分の行に重ねる) */ noteAt?: number };
/** views = そのレシピを開いた人の数 (D-50e、1 人も開いていない行には無い) */
export type DailyRankRow = { name: string; cost: number; rate: number; ms: number; me?: boolean; views?: number; /** 提出の一言 (D-35e、無い人は無し) */ note?: string };
/** 提出の一言の字数の上限 (D-35e、サーバーの SUBMIT_NOTE_MAX と同じ) */
export const SUBMIT_NOTE_MAX = 40;
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

/** 開発版だけ (D-37h): 手元の置き場が `pnpm daily:reset` で消されたら (控えの名前がサーバーに無い)、控えを捨てて同じ名前で作り直す。読み込みごとに 1 回 */
let devChecked = false;
async function devFollowReset(): Promise<void> {
  const n = daily.local.nick;
  if (devChecked || !n) return;
  devChecked = true;
  const r = await call<DailyNick | { error: string }>("/daily/nick", { name: n.name, code: n.code });
  if (!r || !("error" in r) || r.error !== "wrong") return;
  daily.local = { tries: {}, box: [] };
  save();
  await createNick(n.name);
}

/** 一覧を読み直す (ページを開いた時・16:00 を越えた時)。端のキャッシュで 60 秒は古いことがある (D-56)。自分の投稿の状態も読む */
export async function refreshDaily(): Promise<void> {
  if (import.meta.env.DEV) await devFollowReset();
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
  daily.local.tries[id] = { ...(r as DailyTry), ...(same && had?.fractured ? { fractured: had.fractured } : {}), ...(same && had?.from ? { from: had.from } : {}), ...(same && had?.tree ? { tree: had.tree } : {}), ...(same && had?.saved ? { saved: had.saved } : {}) };
  save();
  return daily.local.tries[id]!;
}
/**
 * 端末の控えが終わった挑戦 (時間切れ・諦めた・提出した) の時、サーバーに行がまだあるかを聞く (POST /daily/mine、読むだけ。11-10)。
 * 置き場でリセットされて行が無ければ控えを捨て、一覧のボタンを「始める」に戻す。つながらない・古いサーバー (404) の時は控えのまま
 */
export async function recheckTry(id: string): Promise<void> {
  const a = auth();
  if (!a || !daily.local.tries[id]) return;
  const r = await call<{ has?: boolean }>("/daily/mine", { ...a, id });
  if (r?.has === false && daily.local.tries[id]) { delete daily.local.tries[id]; save(); }
}
export function updateTry(id: string, patch: Partial<Pick<DailyTry, "fractured" | "from" | "tree" | "saved">>): void {
  const t = daily.local.tries[id];
  if (t) { Object.assign(t, patch); save(); }
}
/** POST /daily/giveup (D-37b)。提出なしで終える。始め直しはできない (D-33)。始めていない時も諦めの印を置く (今日の順位のレシピを見る前、D-50c)。終えられたら true */
export async function giveUpTry(id: string): Promise<boolean> {
  const a = auth();
  if (!a) return false;
  const r = await call<(DailyTry & { error?: undefined }) | { ended?: undefined; error: string }>("/daily/giveup", { ...a, id });
  if (!r?.ended) return false;
  const t = daily.local.tries[id];
  if (t) t.ended = true;
  else daily.local.tries[id] = r;
  save();
  return true;
}
/** 今日のお題にまだ挑戦できるか (始めていない・14:50 まで、または時間が残り諦めていない)。今日の順位のレシピを見る前の窓を出すか (D-50c) */
export function canStillTry(id: string, now = Date.now()): boolean {
  if (id !== todayId(now)) return false;
  const t = daily.local.tries[id];
  return t ? !t.ended && leftMs(t, now) > 0 : canStartAt(now);
}
/** 残り時間 (実際の時計、ページを閉じても進む) */
export const leftMs = (t: DailyTry, now = Date.now()): number => t.startedAt + TIME_LIMIT_MS - now;
/** POST /daily/submit。1 回だけで、出したら挑戦は終わり (D-35c)。木 (recipe) も一緒に送る (D-55、検算 D-58 の材料)。1 時間 + 30 秒を過ぎたらサーバーが断る */
export async function submitTry(id: string, cost: number, rate: number, note = "", now = Date.now()): Promise<{ ok: boolean; best: DailyRecord | null; /** 一言が悪口・URL で断られた (D-35e) */ badNote?: boolean }> {
  const a = auth(), t = daily.local.tries[id];
  if (!a || !t) return { ok: false, best: t?.best ?? null };
  const r = await call<{ ok?: boolean; best?: DailyRecord | null; error?: string }>("/daily/submit", { ...a, id, cost, rate, recipe: t.tree ?? null, ...(note.trim() ? { note: note.trim() } : {}) });
  if (r?.error === "note") return { ok: false, best: t.best ?? null, badNote: true };
  // 前に出していた (別の画面・別の PC) 時も終わりの印を付ける
  if (r?.error === undefined && (r as { done?: boolean } | null)?.done) { t.ended = true; t.submitted = true; save(); }
  if (!r?.ok) return { ok: false, best: t.best ?? null };
  t.ended = true;
  t.submitted = true;
  t.last = { cost, rate, ms: now - t.startedAt, at: now };
  if (note.trim()) t.note = note.trim();
  if (r.best) t.best = r.best; else delete t.best;
  save();
  return { ok: true, best: t.best ?? null };
}
/** 提出の後から一言を足す・直す・消すか (D-35e): 今日のお題で、この端末から提出して順位に載る記録がある時 */
export const canEditNote = (id: string, now = Date.now()): boolean => id === todayId(now) && !!daily.local.tries[id]?.submitted && !!daily.local.tries[id]?.best;
/** 置いた一言を自分の行に重ねる間 (順位の表は 60 秒の写し、D-35e) */
const NOTE_FRESH_MS = 120_000;
/** POST /daily/note (D-35e)。空で消す。返り: ok / bad (悪口・URL) / fail (つながらない・今日でない・提出していない) */
export async function noteTry(id: string, note: string, now = Date.now()): Promise<"ok" | "bad" | "fail"> {
  const a = auth(), t = daily.local.tries[id];
  if (!a || !t) return "fail";
  const r = await call<{ ok?: boolean; note?: string | null; error?: string }>("/daily/note", { ...a, id, note: note.trim() });
  if (r?.error === "note") return "bad";
  if (!r?.ok) return "fail";
  t.note = r.note ?? "";
  t.noteAt = now;
  save();
  return "ok";
}
/**
 * POST /daily/live (D-57b): 挑戦中の最新の木 (端末の控えの tree = 提出と同じ形) と動作の列をサーバーへ置く。呼ぶのは daily-live.ts だけ (15 秒まとめ・離れる時)。
 * last = 離れる時 (ページが閉じても届くよう keepalive)。返り: true = 置けた、false = もう受けない (終わった挑戦・名前が違う)、null = つながらない・古いサーバー
 * 端末で「記録しない」を選んだ人 (Y-63) からは送らない (false = 止める。LIVE_NO_LOG、オーナー 11-13)
 */
export async function livePost(id: string, acts: readonly object[], last = false): Promise<boolean | null> {
  const a = auth(), t = daily.local.tries[id];
  if (!a || !t || t.ended || (LIVE_NO_LOG && optedOut())) return false;
  try {
    const r = await fetch(`${API}/daily/live`, { method: "POST", credentials: "omit", keepalive: last, headers: { "content-type": "text/plain;charset=UTF-8" }, body: JSON.stringify({ ...a, id, tree: t.tree ?? null, acts }) });
    if (!r.ok) return null;
    const j = (await r.json()) as { ok?: boolean; ended?: boolean; error?: string };
    return j.ended || j.error === "nick" || j.error === "notStarted" ? false : j.ok ? true : null;
  } catch { return null; }
}

// --- 順位と称号 (D-50・D-54・D-100〜103) ---

/** その日の順位をスコアで並べるか (D-02b、出すまでは開発版の画面だけ) */
export const rankByScore = (id: string): boolean => byScore(id, DEV_BUILD);
/** 挑戦済み (提出・諦め・時間切れ) の人には今日のお題でも品の絵の代わりに完成形のカード (D-37e2、11-11 オーナー「挑戦済みならここアイテムカード完成形のMOD表示していいのでは挑戦後だし」)。オーナー 11-11 見た目「おｋ」で本番も */
export const TRIED_CARD: boolean = true;
/**
 * 順位 (D-50)。解決だけ、費用の安い順 (D-02b の日からはスコアの小さい順、同じなら使った時間の短い人)、それも同じなら先の人 (サーバーの並びのまま = 安定の並べ替え)。
 * 自分の行はサーバーの数が正 (回し直しで差し替えた数も出す、11-11 ブラック 82)。サーバーの表は 60 秒古いことがあるので、サーバーに自分の行がまだ無い間だけこの端末の記録を足す
 */
export function rankOf(id: string): DailyRankRow[] {
  const me = daily.local.nick?.name, mine = daily.local.tries[id], best = mine?.best;
  // 後から置いた一言 (D-35e) は置いた直後だけ端末の物を重ねる (サーバーの表が追いつくまで)
  const fresh = mine?.noteAt != null && Date.now() - mine.noteAt < NOTE_FRESH_MS;
  const withNote = (r: DailyRankRow): DailyRankRow => { if (!fresh) return r; const { note: _n, ...rest } = r; return mine!.note ? { ...rest, note: mine!.note } : rest; };
  const rows = (daily.remote?.ranks[id] ?? []).map((r) => (r.name === me ? withNote({ ...r, me: true }) : r));
  if (best && me && !rows.some((r) => r.me)) rows.push({ name: me, cost: best.cost, rate: best.rate, ms: best.ms, me: true, ...(mine?.note ? { note: mine.note } : {}) });
  const score = rankByScore(id);
  return rows.sort((a, b) => rankCmp(a, b, score));
}
/** GET /daily/recipe.json。締めた日の順位の人の木 (exiledesk-recipe/1 の JSON、D-50b)。今日の分・無い時は null */
export async function rankRecipe(id: string, name: string): Promise<string | null> {
  const r = await call<{ recipe?: string | null }>(`/daily/recipe.json?id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}`);
  return r?.recipe ?? null;
}
/** 「記録しない」の端末から挑戦中の控えを送らない (D-57b、オーナー 11-13「やめる」)。出すまでは開発版の画面だけ = 出す時に true */
export const LIVE_NO_LOG: boolean = DEV_BUILD;
/** 端末で「記録しない」を選んだか (utils/no-log.ts の控えと同じ鍵)。手元の開発版・録画の時の「送らない」は見ない = 開発版は手元の口に置くだけなので試せる */
const optedOut = (): boolean => { try { return localStorage.getItem("exiledesk.noLog") === "1"; } catch { return false; } };
/**
 * POST /daily/view (D-50e、スイッチ dailyViews): 順位の行を押してレシピが開けた時に 1 回だけ送る (押した時の 1 回 = Y-100 の例外、D-57)。
 * 名前を決めていれば合言葉つき (運営の側で誰が開いたか分かる)、決めていなければ名前なしで数だけ。自分のレシピは送らない。
 * 端末で「記録しない」を選んだ人 (Y-63) からは送らない。返りは見ない (届かなくても画面は変わらない)
 */
export function viewPost(id: string, name: string): void {
  if (!flag("dailyViews") || optedOut() || name === daily.local.nick?.name) return;
  void call("/daily/view", { ...(auth() ?? {}), id, name });
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
 * POST /daily/box。段の下限は D-04 (全部 T2 以上) に揃え、先にこの端末で機械の確かめ (D-20) をする。
 * 落ちた物は送らずに訳を付けて残し、通った物は送る (サーバーは wait で受け、16:00 の台本がもう一度確かめて ok / no にする)
 */
export async function postBox(data: PatchData, item: Omit<DailyBoxItem, "id" | "at" | "status" | "why">, src?: PostSrc, card?: PostCard): Promise<DailyBoxItem | BoxError> {
  const aims = floorAims(data, item.base, item.ilvl, item.aims);
  const why = boxCheck(data, { ...item, aims }, daily.local.nick?.name ?? "");
  let b: DailyBoxItem;
  if (why) b = { ...item, aims, id: `x${Date.now().toString(36)}`, at: Date.now(), status: "no", why };
  else {
    const r = await call<DailyBoxItem | { error: BoxError }>("/daily/box", { ...(auth() ?? {}), ...item, aims, ...(src ? { src } : {}), ...(card ? { card } : {}) }); // src = 貼った元の文と読んだ結果かエミュから来た印 (D-14c)、card = 確かめのカードの字 = Discord の知らせの絵の元 (D-20c)。サーバーが品の欄の中に残す
    if (!r) return "net";
    if ("error" in r) return r.error;
    b = r;
  }
  daily.local.box.push(b);
  save();
  return b;
}
export const myBox = (): DailyBoxItem[] => daily.local.box;
