/**
 * 掲示板 (2026-10-16 最初の段、docs/roadmap-2026-10.md「掲示板の作り」。オーナー「クラフトの相談や自慢系、意見交換の場所にしたい」)。
 *   GET  /board.json?tag=&before=   … 1 つのタイムライン (新しい順、30 件ずつ)。Cloudflare のキャッシュに 45 秒 (読みの負荷はほぼ 0)
 *   POST /board/post   { uid, name, text, tag?, parent? (返信先), att? (貼ったアイテム), website? (bot よけ) } … 書き込み・返信。1 端末 1 分 1 件・1 時間 10 件、禁止の言葉は弾く
 *   POST /board/like   { uid, id } … いいね (もう一度で外す)。1 端末 1 時間 120 回まで
 *   POST /board/hit    { uid, base, ilvl, cur, n, modId, ti, v, p } … 当たりの速報の札 (エミュレーターがクソレアの線より下を引いた時。名前は出さない。1 端末 1 時間に 1 件)
 *   POST /board/report { uid, id } … 通報 (同じ端末は 1 回)。REPORT_HIDE 件で自動で隠す
 *   POST /board/delete { id, ban? } (ヘッダー x-exiledesk-key) … オーナーが消す。ban で書いた端末を書けなくする
 *   GET  /board/all.json (ヘッダー x-exiledesk-key) … 隠した物・端末の印も込みの一覧 (オーナー用)
 * 置き場は D1 (binding LOGS、表は migrations/0004_board.sql・0006_board_replies.sql)。KV は増やさない。
 * 2 段目 (2026-10-16 オーナー「掲示板強化」): 返信 (1 段だけ。返信が付くと書き込みが上に上がる)・いいね・エミュレーターのアイテムを貼る
 * 画面には時刻・件数・閲覧数・人ごとの印を出さない (オーナー「過疎ってるって思われたくない」「連投しても別の人が投稿してる感じ」)。
 * 中では端末の番号 (uid) と IP の短いハッシュを持つので、通報・消す・書けなくするはできる
 */
import type { Fetch } from "./types";
import { UID_RE } from "./forget";

/** タグ (書く時に 1 つ)。画面の言葉は src/services/board/board-api.ts */
export const BOARD_TAGS = ["advice", "show", "beginner", "expert"] as const;
export type BoardTag = (typeof BOARD_TAGS)[number];
const TAG_JA: Record<BoardTag, string> = { advice: "相談", show: "自慢", beginner: "初心者に優しく", expert: "上級者に聞きたい" };

export const MAX_TEXT = 1000;
export const MAX_NAME = 20;
const PAGE = 30;
/** 連投よけ (1 端末 1 分 1 件・1 時間 10 件。同じ IP も同じ数で数える) */
const PER_MINUTE = 1;
const PER_HOUR = 10;
/** 当たりの速報は 1 端末 1 時間に 1 件まで (2026-10-16 オーナー「1 ID 1 時間に 1 回まで」)、同じ物 (ベース・MOD・段) は 1 日 1 回 */
const HITS_PER_HOUR = 1;
const HIT_SAME_MS = 24 * 3600e3;
/** 通報がこの数で自動で隠す */
export const REPORT_HIDE = 3;
/** 一覧のキャッシュ (秒) */
export const LIST_TTL = 45;

/**
 * 禁止の言葉 (比べる前に NFKC・小文字・空白抜きにする)。荒らし・誹謗・性的な言葉の代表だけ。足す時はここに
 * (個人情報 = メール・電話番号・外のリンクは別の決まりで弾く)
 */
// 普通の言葉の一部になる短い物 (しね = 楽しねー、rmt = warmth、かたわ = かたわら) は入れない
const NG_WORDS = [
  "死ね", "氏ね", "殺す", "ころす", "殺害予告", "きちがい", "キチガイ", "気違い", "ガイジ", "池沼", "つんぼ",
  "支那", "ちょん公", "土人", "ニガー", "nigger", "nigga", "faggot", "retard", "killyourself",
  "まんこ", "ちんぽ", "ちんこ", "セックス", "porn", "ポルノ", "援交", "パパ活",
  "リアルマネートレード", "代行します", "格安で売ります",
];
const norm = (s: string): string => s.normalize("NFKC").toLowerCase().replace(/[\s​-‍﻿]+/g, "");
const NG_NORM = NG_WORDS.map(norm);
/** 外のリンク (exiledesk.com だけ許す)・メール・電話番号・Discord の招待 */
const URL_RE = /(https?:\/\/|www\.)[^\s]+/gi;
const MAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
/** 電話番号 (0 で始まる 10〜11 桁。1 億 = 100000000 のような数は前に数字があるので当たらない) */
const PHONE_RE = /(?<![\d.,])0\d{1,4}[-( ]?\d{1,4}[-) ]?\d{4}(?![\d.,])/g;
const hasPhone = (s: string): boolean => (s.match(PHONE_RE) ?? []).some((m) => { const d = m.replace(/\D/g, "").length; return d === 10 || d === 11; });
const INVITE_RE = /discord(\.gg|app\.com\/invite|\.com\/invite)/i;

/** 本文・名前に使えない物があれば理由 (通れば null) */
export function ngReason(text: string): string | null {
  const n = norm(text);
  if (NG_NORM.some((w) => w && n.includes(w))) return "使えない言葉が入っています";
  const nk = text.normalize("NFKC");
  for (const u of nk.match(URL_RE) ?? []) if (!/^(https?:\/\/)?(www\.)?exiledesk\.com(\/|$)/i.test(u)) return "外のリンクは貼れません";
  if (INVITE_RE.test(nk)) return "外のリンクは貼れません";
  if (MAIL_RE.test(nk) || hasPhone(nk.replace(/[‐－―]/g, "-"))) return "メールアドレス・電話番号は書けません";
  return null;
}

/** 文字の掃除 (見えない制御文字を外す。改行は 2 つまで続けてよい) */
const clean = (s: string): string => s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f‪-‮⁦-⁩]/g, "").replace(/\n{3,}/g, "\n\n").trim();

/**
 * 貼ったアイテム (エミュレーターの今のアイテムを縮めた物)。b = ベースの英語名、i = アイテムレベル、r = レア度、
 * m = MOD [modId, 段の添字, 値, "p" | "s", 印 ("f" = フラクチャー・"d" = 冒涜)]、c = コラプト。文は見る側の画面が自分のデータで作る
 */
export interface BoardAtt { b: string; i: number; r: "normal" | "magic" | "rare" | "unique"; m: Array<[string, number, number[], "p" | "s", string]>; c?: 1 }
export function parseAtt(x: unknown): BoardAtt | null | false {
  if (x == null) return null;
  if (typeof x !== "object" || JSON.stringify(x).length > 3000) return false;
  const a = x as Record<string, unknown>;
  const b = typeof a.b === "string" && /^[A-Za-z][A-Za-z' ,-]{1,60}$/.test(a.b) ? a.b : null;
  const i = typeof a.i === "number" && Number.isInteger(a.i) && a.i >= 1 && a.i <= 100 ? a.i : null;
  const r = ["normal", "magic", "rare", "unique"].includes(a.r as string) ? (a.r as BoardAtt["r"]) : null;
  if (!b || i == null || !r || !Array.isArray(a.m) || a.m.length > 12) return false;
  const m: BoardAtt["m"] = [];
  for (const e of a.m) {
    if (!Array.isArray(e) || e.length !== 5) return false;
    const [id, ti, v, side, fl] = e;
    if (typeof id !== "string" || !/^[A-Za-z0-9_/]{2,100}$/.test(id)) return false;
    if (typeof ti !== "number" || !Number.isInteger(ti) || ti < 0 || ti > 60) return false;
    if (!Array.isArray(v) || v.length > 6 || !v.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e7)) return false;
    if (side !== "p" && side !== "s") return false;
    if (typeof fl !== "string" || !/^[fd]{0,2}$/.test(fl)) return false;
    m.push([id, ti, v as number[], side, fl]);
  }
  return { b, i, r, m, ...(a.c === 1 ? { c: 1 as const } : {}) };
}

export type PostIn = { ok: true; uid: string; name: string; tag: BoardTag | ""; text: string; parent: string | null; att: BoardAtt | null } | { ok: false; why: string };
export function parsePost(body: unknown): PostIn {
  if (!body || typeof body !== "object") return { ok: false, why: "JSON ではない" };
  const b = body as Record<string, unknown>;
  if (typeof b.website === "string" && b.website.trim()) return { ok: false, why: "bot" };
  if (typeof b.uid !== "string" || !UID_RE.test(b.uid)) return { ok: false, why: "端末の番号が無い" };
  // タグは無くてよい (2026-10-16 オーナー「タグなくておけ、自由に書き込める感じで」)。古い画面が送ってきた時だけ形を確かめる
  if (b.tag != null && b.tag !== "" && !BOARD_TAGS.includes(b.tag as BoardTag)) return { ok: false, why: "タグが違う" };
  const text = typeof b.text === "string" ? clean(b.text) : "";
  if (!text) return { ok: false, why: "本文が空" };
  if ([...text].length > MAX_TEXT) return { ok: false, why: `本文は ${MAX_TEXT} 字まで` };
  const name = typeof b.name === "string" ? clean(b.name).replace(/\n/g, " ") : "";
  if ([...name].length > MAX_NAME) return { ok: false, why: `名前は ${MAX_NAME} 字まで` };
  const ng = ngReason(`${name}\n${text}`);
  if (ng) return { ok: false, why: ng };
  const parent = b.parent == null || b.parent === "" ? null : typeof b.parent === "string" && BOARD_ID_RE.test(b.parent) ? b.parent : false;
  if (parent === false) return { ok: false, why: "返信先が違う" };
  const att = parseAtt(b.att);
  if (att === false) return { ok: false, why: "貼ったアイテムの形が違う" };
  return { ok: true, uid: b.uid, name, tag: (b.tag as BoardTag | undefined) || "", text, parent, att };
}

/** 当たりの速報の中身 (画面が自分のデータで文にする。サーバーは形だけ確かめる = 好きな文字は載らない) */
export interface BoardHit { base: string; ilvl: number; cur: string; n: number; modId: string; ti: number; v: number[]; p: number }
const HIT_CUR_RE = /^(transmute|augment|regal|alchemy|exalt|chaos)(_greater|_perfect)?$/;
export type HitIn = { ok: true; uid: string; hit: BoardHit } | { ok: false; why: string };
export function parseHit(body: unknown): HitIn {
  if (!body || typeof body !== "object") return { ok: false, why: "JSON ではない" };
  const b = body as Record<string, unknown>;
  if (typeof b.uid !== "string" || !UID_RE.test(b.uid)) return { ok: false, why: "端末の番号が無い" };
  const int = (x: unknown, lo: number, hi: number): number | null => (typeof x === "number" && Number.isInteger(x) && x >= lo && x <= hi ? x : null);
  const base = typeof b.base === "string" && /^[A-Za-z][A-Za-z' ,-]{1,60}$/.test(b.base) ? b.base : null;
  const cur = typeof b.cur === "string" && HIT_CUR_RE.test(b.cur) ? b.cur : null;
  const modId = typeof b.modId === "string" && /^[A-Za-z0-9_/]{2,100}$/.test(b.modId) ? b.modId : null;
  const ilvl = int(b.ilvl, 1, 100), n = int(b.n, 1, 1_000_000), ti = int(b.ti, 0, 60);
  const v = Array.isArray(b.v) && b.v.length <= 6 && b.v.every((x) => typeof x === "number" && Number.isFinite(x) && Math.abs(x) < 1e7) ? (b.v as number[]) : null;
  const p = typeof b.p === "number" && b.p > 0 && b.p <= 0.01 ? b.p : null;
  if (!base || !cur || !modId || ilvl == null || n == null || ti == null || !v || p == null) return { ok: false, why: "形が違う" };
  return { ok: true, uid: b.uid, hit: { base, ilvl, cur, n, modId, ti, v, p } };
}

/** IP の短いハッシュ (連投よけ・書けなくするだけに使う。元には戻せない) */
export async function iphOf(ip: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`exiledesk-board|${ip}`));
  return [...new Uint8Array(d).slice(0, 6)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const count = async (db: D1Database, sql: string, ...args: unknown[]): Promise<number> =>
  (await db.prepare(sql).bind(...args).first<{ n: number }>())?.n ?? 0;

/** 書けなくした端末か */
export async function banned(db: D1Database, uid: string, iph: string): Promise<boolean> {
  return (await count(db, "SELECT count(*) AS n FROM board_bans WHERE uid = ? OR iph = ?", uid, iph)) > 0;
}

/** 返信は会話になるので書き込みとは別に数える (15 秒に 1 件・1 時間 30 件) */
const REPLY_GAP_MS = 15e3;
const REPLIES_PER_HOUR = 30;
/** 書き込み・返信の連投よけ (通れば null) */
export async function allowPost(db: D1Database, uid: string, iph: string, now = Date.now(), reply = false): Promise<string | null> {
  if (await banned(db, uid, iph)) return "この端末からは書き込めません";
  const which = reply ? "parent IS NOT NULL" : "parent IS NULL";
  const n = (since: number): Promise<number> => count(db, `SELECT count(*) AS n FROM board_posts WHERE kind = 'post' AND ${which} AND (uid = ? OR iph = ?) AND at > ?`, uid, iph, now - since);
  if (reply) {
    if ((await n(REPLY_GAP_MS)) >= 1) return "続けて返信できるのは 15 秒に 1 件";
    if ((await n(3600e3)) >= REPLIES_PER_HOUR) return `返信しすぎ (1 時間に ${REPLIES_PER_HOUR} 件まで)`;
    return null;
  }
  if ((await n(60e3)) >= PER_MINUTE) return "続けて書けるのは 1 分に 1 件";
  if ((await n(3600e3)) >= PER_HOUR) return `書きすぎ (1 時間に ${PER_HOUR} 件まで)`;
  return null;
}

/** 当たりの札の数の決まり (通れば null)。同じ物は tag の欄に「ベース|MOD|段」を入れて重ねない */
export const hitKey = (h: BoardHit): string => `${h.base}|${h.modId}|${h.ti}`;
export async function allowHit(db: D1Database, uid: string, iph: string, h: BoardHit, now = Date.now()): Promise<string | null> {
  if (await banned(db, uid, iph)) return "banned";
  if ((await count(db, "SELECT count(*) AS n FROM board_posts WHERE kind = 'hit' AND (uid = ? OR iph = ?) AND at > ?", uid, iph, now - 3600e3)) >= HITS_PER_HOUR) return "多すぎ";
  if ((await count(db, "SELECT count(*) AS n FROM board_posts WHERE kind = 'hit' AND uid = ? AND tag = ? AND at > ?", uid, hitKey(h), now - HIT_SAME_MS)) > 0) return "同じ物";
  return null;
}

export interface BoardRow { id: string; at: number; kind: "post" | "hit"; uid: string; iph: string; name: string; tag: string; body: string; reports: number; hidden: number; parent: string | null; bump: number | null; likes: number; att: string | null }
/** 画面に出す 1 件 (時刻・端末の印は出さない)。返信は replies に古い順 */
export type BoardPostItem = { id: string; kind: "post"; name: string; tag: string; text: string; likes: number; att?: BoardAtt; parent?: string; replies?: BoardPostItem[] };
export type BoardItem = BoardPostItem | { id: string; kind: "hit"; hit: BoardHit };

const newId = (): string => crypto.randomUUID().replace(/-/g, "").slice(0, 10);

/** 返信先が書けるか (ある・隠していない・返信ではない)。通れば null */
export async function replyTarget(db: D1Database, parent: string): Promise<string | null> {
  const r = await db.prepare("SELECT parent, hidden, kind FROM board_posts WHERE id = ?").bind(parent).first<Pick<BoardRow, "parent" | "hidden" | "kind">>();
  if (!r || r.hidden !== 0) return "返信先がありません";
  if (r.parent || r.kind !== "post") return "返信には返信できません";
  return null;
}
export async function savePost(db: D1Database, p: { uid: string; iph: string; name: string; tag: BoardTag | ""; text: string; parent?: string | null; att?: BoardAtt | null }, now = Date.now()): Promise<BoardPostItem> {
  const id = newId();
  const att = p.att ? JSON.stringify(p.att) : null;
  await db.prepare("INSERT INTO board_posts (id, at, kind, uid, iph, name, tag, body, parent, bump, att) VALUES (?, ?, 'post', ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, now, p.uid, p.iph, p.name, p.tag, p.text, p.parent ?? null, now, att).run();
  // 返信が付いたら書き込みを上に (タイムラインは bump の新しい順)
  if (p.parent) await db.prepare("UPDATE board_posts SET bump = ? WHERE id = ?").bind(now, p.parent).run();
  return { id, kind: "post", name: p.name, tag: p.tag, text: p.text, likes: 0, ...(p.att ? { att: p.att } : {}), ...(p.parent ? { parent: p.parent } : {}) };
}
export async function saveHit(db: D1Database, uid: string, iph: string, h: BoardHit, now = Date.now()): Promise<BoardItem> {
  const id = newId();
  await db.prepare("INSERT INTO board_posts (id, at, kind, uid, iph, name, tag, body, bump) VALUES (?, ?, 'hit', ?, ?, '', ?, ?, ?)").bind(id, now, uid, iph, hitKey(h), JSON.stringify(h), now).run();
  return { id, kind: "hit", hit: h };
}

const postOf = (r: Pick<BoardRow, "id" | "name" | "tag" | "body" | "likes" | "att" | "parent">): BoardPostItem => {
  let att: BoardAtt | undefined;
  try { att = r.att ? (JSON.parse(r.att) as BoardAtt) : undefined; } catch { att = undefined; }
  return { id: r.id, kind: "post", name: r.name, tag: r.tag, text: r.body, likes: r.likes ?? 0, ...(att ? { att } : {}), ...(r.parent ? { parent: r.parent } : {}) };
};
const itemOf = (r: Pick<BoardRow, "id" | "kind" | "name" | "tag" | "body" | "likes" | "att" | "parent">): BoardItem | null => {
  if (r.kind === "post") return postOf(r);
  try { return { id: r.id, kind: "hit", hit: JSON.parse(r.body) as BoardHit }; } catch { return null; }
};

/** 1 つの書き込みに付ける返信の数の上限 (それ以上は古い方から) */
const REPLIES_MAX = 50;
/**
 * タイムライン (返信は書き込みの中に。並びは bump = 最後に返信が付いた時刻の新しい順)。tag で絞ると書き込みだけ。before = その id より前
 */
export async function listBoard(db: D1Database, tag: string | null, before: string | null): Promise<{ items: BoardItem[]; more: boolean }> {
  const where = ["hidden = 0", "parent IS NULL"];
  const args: unknown[] = [];
  if (tag) { where.push("tag = ?"); args.push(tag); }
  if (before) { where.push("coalesce(bump, at) < (SELECT coalesce(bump, at) FROM board_posts WHERE id = ?)"); args.push(before); }
  const r = await db.prepare(`SELECT id, kind, name, tag, body, likes, att, parent FROM board_posts WHERE ${where.join(" AND ")} ORDER BY coalesce(bump, at) DESC LIMIT ?`).bind(...args, PAGE + 1).all<BoardRow>();
  const rows = (r.results ?? []).slice(0, PAGE);
  const items = rows.map(itemOf).filter((x): x is BoardItem => !!x);
  const ids = items.filter((x) => x.kind === "post").map((x) => x.id);
  if (ids.length) {
    const rr = await db.prepare(`SELECT id, kind, name, tag, body, likes, att, parent FROM board_posts WHERE hidden = 0 AND parent IN (${ids.map(() => "?").join(",")}) ORDER BY at ASC`).bind(...ids).all<BoardRow>();
    const by = new Map<string, BoardPostItem[]>();
    for (const x of rr.results ?? []) { const l = by.get(x.parent!) ?? []; l.push(postOf(x)); by.set(x.parent!, l); }
    for (const it of items) if (it.kind === "post" && by.has(it.id)) it.replies = by.get(it.id)!.slice(-REPLIES_MAX);
  }
  return { items, more: (r.results ?? []).length > PAGE };
}

/** いいね (同じ端末は 1 件に 1 回。もう一度押すと外す)。今の数と押した状態を返す */
const LIKES_PER_HOUR = 120;
export async function toggleLike(db: D1Database, id: string, uid: string, now = Date.now()): Promise<{ ok: boolean; likes: number; liked: boolean; why?: string }> {
  const row = await db.prepare("SELECT likes, hidden, kind FROM board_posts WHERE id = ?").bind(id).first<Pick<BoardRow, "likes" | "hidden" | "kind">>();
  if (!row || row.hidden !== 0 || row.kind !== "post") return { ok: false, likes: 0, liked: false, why: "無い" };
  if ((await count(db, "SELECT count(*) AS n FROM board_likes WHERE uid = ? AND at > ?", uid, now - 3600e3)) >= LIKES_PER_HOUR) return { ok: false, likes: row.likes, liked: false, why: "多すぎ" };
  const ins = await db.prepare("INSERT OR IGNORE INTO board_likes (post_id, uid, at) VALUES (?, ?, ?)").bind(id, uid, now).run();
  const liked = (ins.meta?.changes ?? 0) > 0;
  if (!liked) await db.prepare("DELETE FROM board_likes WHERE post_id = ? AND uid = ?").bind(id, uid).run();
  const likes = Math.max(0, row.likes + (liked ? 1 : -1));
  await db.prepare("UPDATE board_posts SET likes = ? WHERE id = ?").bind(likes, id).run();
  return { ok: true, likes, liked };
}

/** オーナー用の一覧 (隠した物・通報の数・端末の印の頭 6 文字も) */
export async function listAll(db: D1Database, limit = 200): Promise<Array<BoardItem & { at: string; uid: string; reports: number; hidden: number }>> {
  const r = await db.prepare("SELECT * FROM board_posts ORDER BY at DESC LIMIT ?").bind(limit).all<BoardRow>();
  return (r.results ?? []).flatMap((x) => { const it = itemOf(x); return it ? [{ ...it, at: new Date(x.at).toISOString(), uid: x.uid.slice(0, 6), reports: x.reports, hidden: x.hidden }] : []; });
}

/** 通報。同じ端末は 1 件に 1 回。REPORT_HIDE 件で隠す (隠したら true) */
export async function reportPost(db: D1Database, id: string, uid: string, now = Date.now()): Promise<{ ok: boolean; hidden: boolean }> {
  const row = await db.prepare("SELECT id, reports, hidden FROM board_posts WHERE id = ?").bind(id).first<Pick<BoardRow, "id" | "reports" | "hidden">>();
  if (!row) return { ok: false, hidden: false };
  const ins = await db.prepare("INSERT OR IGNORE INTO board_reports (post_id, uid, at) VALUES (?, ?, ?)").bind(id, uid, now).run();
  if (!(ins.meta?.changes ?? 0)) return { ok: true, hidden: row.hidden !== 0 };
  const n = row.reports + 1;
  const hide = row.hidden === 0 && n >= REPORT_HIDE;
  await db.prepare(`UPDATE board_posts SET reports = ?${hide ? ", hidden = 1" : ""} WHERE id = ?`).bind(n, id).run();
  return { ok: true, hidden: hide };
}

/** オーナーが消す (行は残して隠す = 後から見直せる)。ban なら書いた端末を書けなくする */
export async function removePost(db: D1Database, id: string, ban: boolean, now = Date.now()): Promise<boolean> {
  const row = await db.prepare("SELECT uid, iph FROM board_posts WHERE id = ?").bind(id).first<Pick<BoardRow, "uid" | "iph">>();
  if (!row) return false;
  await db.prepare("UPDATE board_posts SET hidden = 2 WHERE id = ?").bind(id).run();
  if (ban) await db.prepare("INSERT OR REPLACE INTO board_bans (uid, iph, at) VALUES (?, ?, ?)").bind(row.uid, row.iph, now).run();
  return true;
}

export const BOARD_ID_RE = /^[a-f0-9]{10}$/;

/** 一覧のキャッシュの鍵 (タグごと。書いた・消した時に消す) */
export const listCacheKey = (tag: string | null, before: string | null): Request =>
  new Request(`https://board.cache/board.json?tag=${tag ?? ""}&before=${before ?? ""}`, { method: "GET" });
export async function purgeLists(): Promise<void> {
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  if (!cache) return;
  await Promise.all([null, ...BOARD_TAGS].map((t) => cache.delete(listCacheKey(t, null)).catch(() => false)));
}

/**
 * 新しい書き込み・自動で隠した物を Discord に (要望と同じウェブフック。失敗しても保存は済んでいるので投げない)。
 * 端末の印 (uid の頭 6 文字) と書き込みの id は消す時に使う
 */
export async function notifyBoardDiscord(webhook: string, ev: { kind: "post"; item: BoardPostItem; uid: string } | { kind: "hidden"; id: string }, fetchFn: Fetch, now = Date.now()): Promise<boolean> {
  const jst = new Date(now + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
  const content = ev.kind === "post"
    ? `**🗨 掲示板${ev.item.parent ? ` (返信 → ${ev.item.parent})` : ""}** ${ev.item.tag ? `[${TAG_JA[ev.item.tag as BoardTag] ?? ev.item.tag}] ` : ""}${ev.item.name || "名無しのエグザイル"} 👤 **${ev.uid.slice(0, 6)}** · ${jst} JST\n${ev.item.text.slice(0, 1500)}${ev.item.att ? `\n📎 ${ev.item.att.b} (iLv ${ev.item.att.i}, MOD ${ev.item.att.m.length})` : ""}\n-# 書き込みの id ${ev.item.id}`
    : `**🚫 掲示板** 通報が ${REPORT_HIDE} 件で隠しました · ${jst} JST\n-# 書き込みの id ${ev.id}`;
  try {
    const r = await fetchFn(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content, allowed_mentions: { parse: [] } }) });
    return r.ok;
  } catch { return false; }
}
