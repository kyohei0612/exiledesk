/**
 * 操作の印 (2026-10-07 オーナー「どこでつまずいたか・離脱・どこから来たか・スマホか PC か、よく使われる指標を全部」)。
 * Web 版が POST /event で送る (cookie なし。uid は localStorage の乱数、sid はタブごとの乱数、個人の情報は無い)。
 * Workers Analytics Engine に 1 行ずつ書き (無料 10 万/日、3 か月残る)、日報で SQL API から集計する。
 *
 *   blob1 = 印の名前 (open / mode:sim / sim:base / … / error)   blob2 = sid   blob3 = uid
 *   blob4 = 端末 (pc / mobile)   blob5 = どこから (ホスト名 / direct)   blob6 = 国   blob7 = 新規なら "1"   blob8 = 補足 (error の文など)
 *   double1 = 1   double2 = 開いてから何秒目か (2026-10-10。印をまとめて送るようにしたので、滞在は着いた時刻ではなくこれで測る)
 */
import { forgottenUids, notForgotten } from "./forget";
import type { Env, Fetch } from "./types";

export const DATASET = "exiledesk_events";
const ID_RE = /^[A-Za-z0-9_-]{6,40}$/;
const NAME_RE = /^[a-z0-9:_.-]{1,40}$/;
const MAX_EVENTS = 50;

export interface EventBatch { uid: string; sid: string; first?: boolean; dev?: string; ref?: string; ev: Array<{ n: string; x?: string; s?: number }> }

/** 届いた物を確かめて整える (駄目なら null) */
export function parseBatch(body: unknown): EventBatch | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.uid !== "string" || !ID_RE.test(b.uid) || typeof b.sid !== "string" || !ID_RE.test(b.sid)) return null;
  if (!Array.isArray(b.ev) || !b.ev.length) return null;
  const ev: EventBatch["ev"] = [];
  for (const e of b.ev.slice(0, MAX_EVENTS)) {
    if (!e || typeof e !== "object") continue;
    const n = (e as { n?: unknown }).n, x = (e as { x?: unknown }).x, sec = (e as { s?: unknown }).s;
    if (typeof n !== "string" || !NAME_RE.test(n)) continue;
    ev.push({ n, ...(typeof x === "string" && x ? { x: x.slice(0, 120) } : {}), ...(typeof sec === "number" && sec >= 0 && sec < 86_400 * 2 ? { s: Math.round(sec) } : {}) });
  }
  if (!ev.length) return null;
  const dev = b.dev === "mobile" ? "mobile" : "pc";
  const ref = typeof b.ref === "string" ? b.ref.toLowerCase().replace(/[^a-z0-9.-]/g, "").slice(0, 60) || "direct" : "direct";
  return { uid: b.uid, sid: b.sid, first: b.first === true, dev, ref, ev };
}

/** Analytics Engine に書く (binding が無ければ何もしない) */
export function writeEvents(env: Env, batch: EventBatch, country: string): number {
  if (!env.EVENTS) return 0;
  // 目印 (index) は印ごとに別にする。同じ目印に一度にたくさん書くと Analytics Engine が間引いて (代表 1 件 × 重み) しまい、
  // 「開いた」などの印が消えて見えた (2026-10-10 まとめて送る形の再現で 1,837 件中 1,516 行に間引かれた)
  batch.ev.forEach((e, i) => {
    env.EVENTS!.writeDataPoint({ blobs: [e.n, batch.sid, batch.uid, batch.dev ?? "pc", batch.ref ?? "direct", country, batch.first ? "1" : "0", e.x ?? ""], doubles: [1, e.s ?? 0], indexes: [`${batch.sid}.${e.s ?? 0}.${i}`] });
  });
  return batch.ev.length;
}

/** SQL API (読み。1 日 1 万回まで無料)。失敗は投げる */
export async function sql<T = Record<string, unknown>>(env: Env, query: string, fetchFn: Fetch = fetch): Promise<T[]> {
  if (!env.CF_ANALYTICS_TOKEN || !env.CF_ACCOUNT_ID) throw new Error("CF_ANALYTICS_TOKEN が無い");
  const r = await fetchFn(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`, { method: "POST", headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}` }, body: query });
  if (!r.ok) throw new Error(`sql ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const j = (await r.json()) as { data?: T[] };
  return j.data ?? [];
}

const ts = (iso: string): string => `toDateTime('${iso.slice(0, 19).replace("T", " ")}')`;
const range = (since: string, until: string): string => `timestamp >= ${ts(since)} AND timestamp < ${ts(until)}`;

/** 段階 (到達した人の数で見る)。シミュレーション側と手で打つ側 */
export const FUNNEL_SIM = ["open", "mode:sim", "sim:base", "sim:targets", "sim:order", "sim:pattern", "sim:run", "sim:done", "trade:open"] as const;
export const FUNNEL_HAND = ["open", "mode:hand", "hand:use", "trade:open"] as const;
export const STEP_JA: Record<string, string> = {
  "open": "開いた", "mode:sim": "シミュレーション", "mode:hand": "手で打つ", "sim:base": "ベース", "sim:targets": "狙い", "sim:order": "順番", "sim:pattern": "手順",
  "sim:run": "回した", "sim:done": "完成", "trade:open": "取引所", "hand:use": "打った", "recipe:save": "レシピ保存", "feedback:open": "要望を開いた", "feedback:sent": "要望を送った", "error": "JS エラー", "ping": "滞在",
};

/**
 * PC / スマホの 1 人ずつの滞在時間 (分、その日の訪問の合計)。滞在 = 開いてから最後の印 (操作・1 分おきの「表示中」) まで。
 * 2026-10-12 オーナー「1 分未満 ● 人・5 分以上 ● 人・30 分以上 ● 人、1 分以上使ってくれた人の割合、最後に合計」
 */
export interface Dwell { people: number; under1: number; over5: number; over30: number; totalMin: number; maxMin: number }
export function dwellOf(mins: readonly number[]): Dwell | null {
  if (!mins.length) return null;
  return { people: mins.length, under1: mins.filter((x) => x < 1).length, over5: mins.filter((x) => x >= 5).length, over30: mins.filter((x) => x >= 30).length, totalMin: mins.reduce((x, y) => x + y, 0), maxMin: Math.max(...mins) };
}
export interface Summary {
  sessions: number; users: number; newSessions: number; bounce: number | null; medianMinutes: number | null;
  /** PC / スマホの滞在時間 (2026-10-12 オーナー「日報に滞在時間、表示中の印で本当の滞在時間」) */
  dwell?: { pc: Dwell | null; mobile: Dwell | null };
  /** エミュレーターのベース (人数)・カレンシー (回数) の順位と、1 人で一番打った手数 (端末で数えた印 base / cur / steps、2026-10-12 から) */
  emu?: { bases: Array<[string, number]>; currencies: Array<[string, number]>; maxSteps: number };
  /** 1 人の手数 (半分・4 人に 1 人) と、PC / スマホの 1 人あたりの手数 (端末で数えた steps の印) */
  steps?: { median: number; p75: number; pc: number | null; mobile: number | null };
  /** 人が来た時間 (日本時間の時、訪問の数の多い順に 3 つ) */
  peakHours?: Array<[number, number]>;
  byEvent: Map<string, { sessions: number; users: number; count: number }>;
  refs: Array<[string, number]>; devices: Array<[string, number]>; countries: Array<[string, number]>;
  /** 流入元の印 (utm の source|medium|campaign、人の数の多い順に 6 つ。2026-10-16) */
  utms?: Array<[string, number]>;
  errors: Array<[string, number]>;
  /** 中身の見えないエラー (Script error. @:0)。X などのアプリ内ブラウザが足したスクリプトの物で、こちらでは直せない (2026-10-10) */
  extErrors: { count: number; sessions: number } | null;
  wau: number | null;
  /** 集計で失敗した問い合わせ (0 が「無い」のか「取れなかった」のかを日報で分かるように) */
  warnings: string[];
}

/** 昨日のまとめ (SQL を数本。1 本ずつ失敗しても他は続ける) */
export async function summarize(env: Env, since: string, until: string, weekSince: string, fetchFn: Fetch = fetch): Promise<Summary> {
  const out: Summary = { sessions: 0, users: 0, newSessions: 0, bounce: null, medianMinutes: null, byEvent: new Map(), refs: [], devices: [], countries: [], errors: [], extErrors: null, wau: null, warnings: [] };
  const q = async <T,>(query: string): Promise<T[]> => { try { return await sql<T>(env, query, fetchFn); } catch (e) { const w = String(e).slice(0, 160); console.warn("summarize:", w); if (out.warnings.length < 3) out.warnings.push(w); return []; } };
  const D = env.EVENTS_DATASET ?? DATASET;
  // 記録しない端末は集計から除く (forget.ts。Analytics Engine は消せないので WHERE で)
  // 開発版 (localhost から開いた分) は数えない (2026-10-10: 前の送り方では開発版も本番に印を送っていて、1 日 113 訪問が混ざっていた)
  const skip = notForgotten(await forgottenUids(env)) + ` AND blob5 != 'localhost' AND blob5 != '127.0.0.1'`;
  const w = range(since, until) + skip;
  for (const r of await q<{ n: string; s: number; u: number; c: number }>(`SELECT blob1 AS n, count(DISTINCT blob2) AS s, count(DISTINCT blob3) AS u, SUM(_sample_interval) AS c FROM ${D} WHERE ${w} GROUP BY n`)) {
    out.byEvent.set(r.n, { sessions: Number(r.s), users: Number(r.u), count: Number(r.c) });
  }
  const open = out.byEvent.get("open");
  out.sessions = open?.sessions ?? 0; out.users = open?.users ?? 0;
  for (const r of await q<{ f: string; s: number }>(`SELECT blob7 AS f, count(DISTINCT blob2) AS s FROM ${D} WHERE ${w} AND blob1 = 'open' GROUP BY f`)) if (r.f === "1") out.newSessions = Number(r.s);
  const engaged = await q<{ s: number }>(`SELECT count(DISTINCT blob2) AS s FROM ${D} WHERE ${w} AND blob1 NOT IN ('open', 'ping', 'stay', 'base', 'cur', 'steps', 'error', 'utm') AND blob1 NOT LIKE 'lang:%'`);
  if (out.sessions && engaged[0]) out.bounce = Math.max(0, 1 - Number(engaged[0].s) / out.sessions);
  // 滞在の中央値 (Analytics Engine の SQL は quantiles が無いので quantileWeighted。それも無ければ平均)
  // 滞在 = 着いた時刻の差と「開いてから何秒目か」(double2) の大きい方 (まとめて送ると着いた時刻は全部同じになる。2026-10-10)。
  // Analytics Engine の SQL は型の違う 2 つを比べられないので、訪問ごとに両方取ってここで中央値を出す
  // 滞在は「数える時間 (since〜until) の中の分」だけ (2026-10-13 オーナー「日報、計測ミスない？」: 日をまたいで開きっぱなしのタブが、
  // 開いた時からの通算 (開いてから何秒目か・見ていた秒数の合計) で数えられ「一番長くいた人 45 時間」になっていた)。
  //  - 開いてから何秒目か (double2) は、数え物の印 (base / cur / steps は手の数、stay は見ていた秒数) を除き、時間の中の最大 − 最小
  //  - 見ていた秒数 (stay) は、時間の中の最大 − 時間の前の最大 (1 週間まで遡る)
  //  - どちらも数える時間の長さを超えない (1 人に何タブあっても、その人の合計も同じく超えない)
  const COUNTS = `'base', 'cur', 'steps', 'stay'`;
  const winMin = Math.max(1, (new Date(until).getTime() - new Date(since).getTime()) / 60000);
  const per = await q<{ blob2: string; u: string; d: string; a: number | string; a0: number | string; b: number | string }>(`SELECT blob2, blob3 AS u, blob4 AS d, max(double2) AS a, min(double2) AS a0, toUnixTimestamp(max(timestamp)) - toUnixTimestamp(min(timestamp)) AS b FROM ${D} WHERE ${w} AND blob1 NOT IN (${COUNTS}) GROUP BY blob2, blob3, blob4 LIMIT 20000`);
  const minOf = (r: { a: number | string; a0: number | string; b: number | string }): number => Math.min(winMin, Math.max((Number(r.a) || 0) - (Number(r.a0) || 0), Number(r.b) || 0) / 60);
  const mins = per.map(minOf).sort((x, y) => x - y);
  if (mins.length) out.medianMinutes = mins[Math.floor((mins.length - 1) / 2)]!;
  const stayIn = await q<{ sid: string; u: string; d: string; s: number | string }>(`SELECT blob2 AS sid, blob3 AS u, blob4 AS d, max(double2) AS s FROM ${D} WHERE ${w} AND blob1 = 'stay' GROUP BY sid, u, d LIMIT 20000`);
  const weekBefore = new Date(new Date(since).getTime() - 7 * 86400e3).toISOString();
  const stayBefore = new Map((await q<{ sid: string; s: number | string }>(`SELECT blob2 AS sid, max(double2) AS s FROM ${D} WHERE ${range(weekBefore, since)}${skip} AND blob1 = 'stay' GROUP BY sid LIMIT 20000`)).map((r) => [r.sid, Number(r.s)]));
  const stay = new Map(stayIn.map((r) => [r.sid, Math.min(winMin, Math.max(0, Number(r.s) - (stayBefore.get(r.sid) ?? 0)) / 60)]));
  const minOfVisit = (r: { blob2?: string; a: number | string; a0: number | string; b: number | string }): number => stay.get(String(r.blob2)) ?? minOf(r);
  // 1 人ずつ (端末の番号 × PC / スマホ) にその日の訪問を足す。stay だけ送ってきた訪問 (他の印が無い) も入れる
  const person = new Map<string, { d: string; m: number }>();
  const seen = new Set<string>();
  const addP = (u: string, d: string, m: number): void => { const k = `${u}|${d}`; const x = person.get(k); if (x) x.m = Math.min(winMin, x.m + m); else person.set(k, { d, m }); };
  for (const r of per) { seen.add(r.blob2); addP(r.u, r.d, minOfVisit(r)); }
  for (const r of stayIn) if (!seen.has(r.sid)) addP(r.u, r.d, stay.get(r.sid) ?? 0);
  const ps = [...person.values()];
  const bases = (await q<{ k: string; n: number }>(`SELECT blob8 AS k, count(DISTINCT blob3) AS n FROM ${D} WHERE ${w} AND blob1 = 'base' GROUP BY k ORDER BY n DESC LIMIT 5`)).map((r): [string, number] => [r.k, Number(r.n)]);
  const curs = (await q<{ k: string; n: number }>(`SELECT blob8 AS k, SUM(double2 * _sample_interval) AS n FROM ${D} WHERE ${w} AND blob1 = 'cur' GROUP BY k ORDER BY n DESC LIMIT 5`)).map((r): [string, number] => [r.k, Number(r.n)]);
  const st = (await q<{ u: string; d: string; n: number }>(`SELECT blob3 AS u, blob4 AS d, SUM(double2 * _sample_interval) AS n FROM ${D} WHERE ${w} AND blob1 = 'steps' GROUP BY u, d LIMIT 20000`)).map((r) => ({ d: r.d, n: Number(r.n) }));
  const maxSteps = st.reduce((a, r) => Math.max(a, r.n), 0);
  if (bases.length || curs.length || st.length) out.emu = { bases, currencies: curs, maxSteps };
  if (st.length) {
    const a = st.map((r) => r.n).sort((x, y) => x - y);
    const at = (p: number): number => a[Math.floor((a.length - 1) * p)]!;
    const avg = (d: string): number | null => { const x = st.filter((r) => (d === "mobile" ? r.d === "mobile" : r.d !== "mobile")); return x.length ? Math.round(x.reduce((s, r) => s + r.n, 0) / x.length) : null; };
    out.steps = { median: at(0.5), p75: at(0.75), pc: avg("pc"), mobile: avg("mobile") };
  }
  // 来た時間 (訪問の最初の時刻を日本時間の時に)。SQL の関数の違いを避けて、時刻だけ取ってここで数える
  const opens = await q<{ t: number | string }>(`SELECT blob2, toUnixTimestamp(min(timestamp)) AS t FROM ${D} WHERE ${w} AND blob1 = 'open' GROUP BY blob2 LIMIT 20000`);
  if (opens.length) {
    const h = new Array<number>(24).fill(0);
    for (const r of opens) h[Math.floor((Number(r.t) + 9 * 3600) / 3600) % 24]!++;
    out.peakHours = h.map((v, i): [number, number] => [i, v]).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]).slice(0, 3);
  }
  out.dwell = { pc: dwellOf(ps.filter((x) => x.d !== "mobile").map((x) => x.m)), mobile: dwellOf(ps.filter((x) => x.d === "mobile").map((x) => x.m)) };
  // by = 数える物 (blob2 = 訪問、blob3 = 人)。どこから来たかは日報で「〜人」と書くので人で数える (2026-10-13: 訪問で数えていて、足すと訪問の数になっていた)
  const top = async (col: string, by = "blob2"): Promise<Array<[string, number]>> => (await q<{ k: string; s: number }>(`SELECT ${col} AS k, count(DISTINCT ${by}) AS s FROM ${D} WHERE ${w} AND blob1 = 'open' GROUP BY k ORDER BY s DESC LIMIT 6`)).map((r) => [r.k || "—", Number(r.s)]);
  // 端末・国も人で数える (2026-10-14 オーナー「これは正しい数字か」: 端末だけ訪問の回数で、滞在の行 (人) と混ざって読みにくかった)
  out.refs = await top("blob5", "blob3"); out.devices = await top("blob4", "blob3"); out.countries = await top("blob6", "blob3");
  out.utms = (await q<{ k: string; s: number }>(`SELECT blob8 AS k, count(DISTINCT blob3) AS s FROM ${D} WHERE ${w} AND blob1 = 'utm' GROUP BY k ORDER BY s DESC LIMIT 6`)).map((r): [string, number] => [r.k, Number(r.s)]);
  // よその物: 中身の見えないエラー・ext: の印・ウォレット・ユーザースクリプト (2026-10-11)・拡張機能が差し込んだスクリプト (injectedScript、2026-10-14)
  const EXT = `(blob8 LIKE 'Script error%@:0' OR blob8 LIKE 'ext:%' OR blob8 LIKE '%window.ethereum%' OR blob8 LIKE '%userscript%' OR blob8 LIKE '%.user.js%' OR blob8 LIKE '%response.msg%' OR blob8 LIKE '%injectedScr%')`;
  out.errors = (await q<{ k: string; s: number }>(`SELECT blob8 AS k, count(DISTINCT blob2) AS s FROM ${D} WHERE ${w} AND blob1 = 'error' AND NOT (${EXT}) GROUP BY k ORDER BY s DESC LIMIT 3`)).map((r) => [r.k, Number(r.s)]);
  const ext = await q<{ c: number; s: number }>(`SELECT SUM(_sample_interval) AS c, count(DISTINCT blob2) AS s FROM ${D} WHERE ${w} AND blob1 = 'error' AND ${EXT}`);
  if (ext[0] && Number(ext[0].c) > 0) out.extErrors = { count: Number(ext[0].c), sessions: Number(ext[0].s) };
  // シミュレーションの印は、その訪問でシミュレーターを開いていた時だけ数える。前の Web 版はエミュレーターでベースを選んでも sim:base を立てていたので、
  // シミュレーターを開いていない訪問の sim:base はエミュレーターのベース選び (hand:base) に回す (2026-10-11 オーナー「正しい日報に」)
  const sids = async (n: string): Promise<Set<string>> => new Set((await q<{ s: string }>(`SELECT blob2 AS s FROM ${D} WHERE ${w} AND blob1 = '${n}' GROUP BY s LIMIT 20000`)).map((r) => r.s));
  const simOpen = await sids("mode:sim");
  const simBase = await sids("sim:base");
  if (simBase.size) {
    const handBase = await sids("hand:base");
    for (const x of simBase) if (!simOpen.has(x)) handBase.add(x);
    out.byEvent.set("hand:base", { sessions: handBase.size, users: handBase.size, count: handBase.size });
  }
  // Web 版はシミュレーターを閉じているので、開いた印だけでベースまで行った訪問が無ければ一瞬開いた扱い (前に開いていた人) として数えない
  if (![...simBase].some((x) => simOpen.has(x))) out.byEvent.delete("mode:sim");
  for (const n of ["sim:base", "sim:targets", "sim:order", "sim:pattern", "sim:run", "sim:done"]) {
    if (!out.byEvent.has(n)) continue;
    const real = [...(n === "sim:base" ? simBase : await sids(n))].filter((x) => simOpen.has(x)).length;
    if (real) out.byEvent.set(n, { ...out.byEvent.get(n)!, sessions: real }); else out.byEvent.delete(n);
  }
  const wau = await q<{ u: number }>(`SELECT count(DISTINCT blob3) AS u FROM ${D} WHERE ${range(weekSince, until)}${skip} AND blob1 = 'open'`);
  if (wau[0]) out.wau = Number(wau[0].u);
  return out;
}

/** その間に来た人 (開いた印の端末の数。記録しない端末と開発版は除く)。取れなければ null。訪問者の表示 (1 時間おき) 用 (2026-10-11) */
/** by: "users" = 人 (端末ごと 1 人)、"visits" = 訪問 (同じ人の 2 回目も数える。画面の「本日の訪問者」、2026-10-15 オーナー「同じ人も数えていいのに」) */
export async function usersBetween(env: Env, since: string, until: string, fetchFn: Fetch = fetch, by: "users" | "visits" = "users"): Promise<number | null> {
  try {
    const D = env.EVENTS_DATASET ?? DATASET;
    const skip = notForgotten(await forgottenUids(env)) + ` AND blob5 != 'localhost' AND blob5 != '127.0.0.1'`;
    const r = await sql<{ u: number }>(env, `SELECT count(DISTINCT ${by === "visits" ? "blob2" : "blob3"}) AS u FROM ${D} WHERE ${range(since, until)}${skip} AND blob1 = 'open'`, fetchFn);
    return r[0] ? Number(r[0].u) : 0;
  } catch (e) { console.warn("usersBetween:", String(e).slice(0, 160)); return null; }
}

/** 段階の文: 開いた 50 → ベース 30 → … と、一番減った所 */
export function funnelText(sum: Summary, steps: readonly string[]): string {
  const n = steps.map((s) => sum.byEvent.get(s)?.sessions ?? 0);
  if (!n[0]) return "—";
  const parts = steps.map((s, i) => `${STEP_JA[s] ?? s} ${n[i]}`);
  let worst = -1, worstDrop = 0;
  for (let i = 1; i < n.length; i++) { const prev = n[i - 1]!; if (prev >= 5) { const drop = 1 - n[i]! / prev; if (drop > worstDrop) { worstDrop = drop; worst = i; } } }
  const note = worst > 0 && worstDrop >= 0.3 ? ` ← 一番減った所: ${STEP_JA[steps[worst - 1]!]}→${STEP_JA[steps[worst]!]} (-${Math.round(worstDrop * 100)}%)` : "";
  return parts.join(" → ") + note;
}
