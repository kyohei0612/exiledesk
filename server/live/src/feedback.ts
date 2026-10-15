/**
 * 要望・バグの受け取り (2026-10-07 オーナー「要望バグの送信もできるようにしたい」)。
 *   POST /feedback  { kind: "request" | "bug", text, contact?, context?, website? (bot よけ、空でないと捨てる) }
 *   GET  /feedback.json (ヘッダー x-exiledesk-key: <REFRESH_KEY>)  … 新しい順の一覧 (オーナー用)
 * KV に 90 日残し、DISCORD_WEBHOOK があれば Discord にも流す。同じ IP から 1 時間 10 件まで
 */
import type { Fetch } from "./types";
import { appendImages, type ImageIn } from "./feedback-images";

export interface Feedback {
  id: string;
  at: string;
  kind: "request" | "bug";
  text: string;
  contact: string;
  /** 画面の状態 (ベース・狙い・パターンなど。送る側が付ける) */
  context: unknown;
  ua: string;
  ip: string;
  /** 付いた画像の id (D1 の fb_images、feedback-images.ts)。後から足した物も入る */
  images?: string[];
}

const MAX_TEXT = 4000;
const MAX_CONTACT = 200;
const MAX_CONTEXT = 96 * 1024;
const PER_HOUR = 10;
/** 連投よけ: 同じ IP は 1 分に 1 件 (2026-10-07 オーナー「1 分レートで連続で送れないように」) */
const PER_MINUTE = 1;
const KEEP_DAYS = 90;
const PREFIX = "fb:";

export type Parsed = { ok: true; kind: Feedback["kind"]; text: string; contact: string; context: unknown } | { ok: false; why: string };

/** 届いた本文を確かめる (bot よけの欄は空でないと捨てる) */
export function parseFeedback(body: unknown): Parsed {
  if (!body || typeof body !== "object") return { ok: false, why: "JSON ではない" };
  const b = body as Record<string, unknown>;
  if (typeof b.website === "string" && b.website.trim()) return { ok: false, why: "bot" };
  const kind = b.kind === "bug" ? "bug" : b.kind === "request" ? "request" : null;
  if (!kind) return { ok: false, why: "kind は request か bug" };
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (!text) return { ok: false, why: "本文が空" };
  if (text.length > MAX_TEXT) return { ok: false, why: `本文は ${MAX_TEXT} 字まで` };
  const contact = typeof b.contact === "string" ? b.contact.trim().slice(0, MAX_CONTACT) : "";
  let context: unknown = null;
  if (b.context != null) {
    const s = JSON.stringify(b.context);
    if (s.length > MAX_CONTEXT) return { ok: false, why: "添付が大きすぎる" };
    context = b.context;
  }
  return { ok: true, kind, text, contact, context };
}

/** 同じ IP の数 (KV)。1 分に 1 件・1 時間に 10 件を超えたら理由を返す (通れば null) */
export async function allowIp(kv: KVNamespace, ip: string, now = Date.now()): Promise<string | null> {
  const minKey = `fbmin:${ip}:${Math.floor(now / 60e3)}`;
  if (Number((await kv.get(minKey)) ?? 0) >= PER_MINUTE) return "続けて送れるのは 1 分に 1 件";
  const hourKey = `fbip:${ip}:${Math.floor(now / 3600e3)}`;
  const n = Number((await kv.get(hourKey)) ?? 0);
  if (n >= PER_HOUR) return "送りすぎ (1 時間に 10 件まで)";
  await kv.put(minKey, "1", { expirationTtl: 120 });
  await kv.put(hourKey, String(n + 1), { expirationTtl: 3700 });
  return null;
}

/** 添付の「直前の流れ」(Web 版が付ける: 印の名前と何秒前か) を 1 行に */
/** 流れの記録の名前 → 日本語 (2026-10-12 オーナー「普通に日本語で報告して欲しい」)。無い物はそのまま */
const TRAIL_JA: Record<string, string> = {
  open: "開いた", "mode:hand": "エミュレーターに切り替え", "mode:sim": "シミュレーターに切り替え",
  "hand:base": "ベースを選んだ", "hand:use": "最初の 1 手を打った",
  "sim:base": "ベースを選んだ (シミュレーター)", "sim:targets": "狙いを選んだ", "sim:order": "順番を決めた", "sim:pattern": "パターンを作った",
  "sim:run": "シミュレーションを回した", "sim:run:step": "1 手だけ回した", "sim:run:one": "1 本だけ回した", "sim:done": "シミュレーションが終わった",
  "recipe:save": "レシピを保存", "trade:open": "取引所を開いた", error: "エラー", ping: "表示中",
  "feedback:open": "要望の窓を開いた", "feedback:sent": "要望を送った",
  "share:copy": "手順を共有した", "share:open": "共有の手順から開いた",
};
export function trailText(context: unknown, max = 14): string {
  const trail = (context as { trail?: unknown })?.trail;
  if (!Array.isArray(trail) || !trail.length) return "";
  return trail.slice(-max).map((e) => {
    const raw = String((e as { n?: unknown })?.n ?? "?");
    const n = TRAIL_JA[raw] ?? raw;
    const ago = Number((e as { ago?: unknown })?.ago);
    return Number.isFinite(ago) ? `${n} (${ago >= 60 ? `${Math.round(ago / 60)}分` : `${Math.round(ago)}秒`}前)` : n;
  }).join(" → ");
}

export async function saveFeedback(kv: KVNamespace, fb: Feedback): Promise<void> {
  // 新しい順に並ぶよう、キーは (大きな数 − 時刻)
  const rev = String(9_999_999_999_999 - Date.parse(fb.at)).padStart(13, "0");
  await kv.put(`${PREFIX}${rev}:${fb.id}`, JSON.stringify(fb), { expirationTtl: KEEP_DAYS * 86400 });
}

/** 1 件 (id で。キーは fb:<時刻>:<id> なので一覧から引く) */
export async function getFeedback(kv: KVNamespace, id: string): Promise<Feedback | null> {
  const l = await kv.list({ prefix: PREFIX, limit: 1000 });
  const k = l.keys.find((x) => x.name.endsWith(`:${id}`));
  return k ? ((await kv.get(k.name, "json")) as Feedback | null) : null;
}

/**
 * 要望・バグへの返事 (2026-10-11 オーナー「直しましたの返信、次に開いた時に教えたい」)。キーは fbr:<要望の id>、180 日残す。
 * 書くのはオーナー側だけ (POST /feedback/reply + ヘッダー x-exiledesk-key)。読むのは送った本人の画面で、自分の覚えている id だけを聞く (GET /feedback/replies?ids=)
 */
/** askImage: 「画像を下さい」(返事の窓に画像を送るボタンを出す。2026-10-14) */
export interface FeedbackReply { text: string; en?: string; version?: string; askImage?: boolean; at: string }
const REPLY_PREFIX = "fbr:";
const REPLY_DAYS = 180;
export const FEEDBACK_ID_RE = /^[A-Za-z0-9-]{4,16}$/;
export async function saveReply(kv: KVNamespace, id: string, r: Omit<FeedbackReply, "at">): Promise<FeedbackReply> {
  const v: FeedbackReply = { ...r, at: new Date().toISOString() };
  await kv.put(REPLY_PREFIX + id, JSON.stringify(v), { expirationTtl: REPLY_DAYS * 86400 });
  return v;
}
export async function getReplies(kv: KVNamespace, ids: readonly string[]): Promise<Record<string, FeedbackReply>> {
  const out: Record<string, FeedbackReply> = {};
  await Promise.all(ids.filter((x) => FEEDBACK_ID_RE.test(x)).slice(0, 10).map(async (id) => {
    const v = (await kv.get(REPLY_PREFIX + id, "json")) as FeedbackReply | null;
    if (v) out[id] = v;
  }));
  return out;
}

export async function listFeedback(kv: KVNamespace, limit = 100): Promise<Feedback[]> {
  const l = await kv.list({ prefix: PREFIX, limit });
  const out: Feedback[] = [];
  for (const k of l.keys) { const v = (await kv.get(k.name, "json")) as Feedback | null; if (v) out.push(v); }
  return out;
}

/** 添付から「今の状態」を 1 行に (手で打つ / シミュレーション・ベース・手数・狙いとパターンの数・エラーの数) */
/**
 * PC かスマホか (2026-10-12 オーナー「PC かスマホかも出して欲しい」)。画面の幅 (768 px 未満 = スマホの並び、web-phone-layout) で。
 * 前の版の要望にも viewport は入っている
 */
export function deviceJa(context: unknown): string {
  const vp = (context as { viewport?: unknown })?.viewport;
  const w = typeof vp === "string" ? Number(vp.split("x")[0]) : NaN;
  return Number.isFinite(w) ? (w < 768 ? "スマホ" : "PC") : "";
}
export function stateLine(context: unknown): string {
  if (!context || typeof context !== "object") return "";
  const hasSummary = Array.isArray((context as { summaryJa?: unknown }).summaryJa) && ((context as { summaryJa: unknown[] }).summaryJa.length > 0);
  const c = context as { version?: string; mode?: string; base?: string; itemLevel?: number; hand?: { steps?: number } | null; sim?: { targets?: unknown[]; patterns?: unknown[] } | null; errors?: unknown[]; market?: { error?: string | null } };
  const parts = [
    c.version ? `v${c.version}` : "",
    deviceJa(context),
    c.mode === "sim" ? "シミュレーター" : c.mode === "hand" ? "エミュレーター" : "",
    c.base && !hasSummary ? `${c.base}${c.itemLevel ? ` ilvl${c.itemLevel}` : ""}` : "",
    c.hand?.steps && !hasSummary ? `${c.hand.steps} 手` : "",
    c.sim ? `狙い ${c.sim.targets?.length ?? 0} · パターン ${c.sim.patterns?.length ?? 0}` : "",
    c.errors?.length ? `JS エラー ${c.errors.length}` : "",
    c.market?.error ? "相場が取れていない" : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

/**
 * Discord に 1 件流す (webhook。失敗しても保存は済んでいるので投げない)。
 * 本文の下に「状態」と「流れ」を 1 行ずつ、全部の添付 (手順の plan・レシピ・エラー) は JSON ファイルで付ける
 * (本人は「バグっぽい」としか書かないので、受けた側がそのまま解析・再現できる分を自動で付ける。2026-10-07 オーナー)
 */
/**
 * 送った人の短い印 (2026-10-12 オーナー「ID が違うのに同じ人？ 同じ人だと分かるように」)。要望の id は 1 件ごとなので、人ごとの印を別に出す。
 * 新しい版は端末の乱数の番号 (context.uid) の頭 6 文字、無い前の版は IP とブラウザの種類から作った短い印 (元には戻せない)。KV は使わない
 */
export async function senderTag(fb: Pick<Feedback, "context" | "ip" | "ua">): Promise<string> {
  const uid = (fb.context as { uid?: unknown } | null)?.uid;
  if (typeof uid === "string" && /^[a-z0-9]{6,40}$/i.test(uid)) return uid.slice(0, 6);
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${fb.ip}|${fb.ua}`));
  return "~" + [...new Uint8Array(d).slice(0, 3)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
export async function notifyDiscord(webhook: string, fb: Feedback, fetchFn: Fetch, images: readonly ImageIn[] = []): Promise<boolean> {
  // 画面では要望とバグを分けない (2026-10-10)。前の版から来た「バグ」だけ印を残す
  const head = fb.kind === "bug" ? "🐛 要望・バグ" : "💬 要望・バグ";
  const state = stateLine(fb.context);
  const firstErr = (fb.context as { errors?: Array<{ msg?: string }> } | null)?.errors?.[0]?.msg;
  // 日本時間で (Discord は文字列をそのまま出すので、ここで +9 時間)
  const jst = new Date(Date.parse(fb.at) + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
  // 画面が付けた日本語のまとめ (何を作っていて、どこまで打ったか)。前の版から来た物には無いので、その時は今まで通り
  const summary = (fb.context as { summaryJa?: unknown } | null)?.summaryJa;
  const sumLines = Array.isArray(summary) ? summary.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 600)) : [];
  const content = [
    `**${head}** ${images.length ? `🖼${images.length} ` : ""}${fb.contact ? `(${fb.contact}) ` : ""}${jst} JST · 送った人 ${await senderTag(fb)} · id ${fb.id}`,
    fb.text.slice(0, 1200),
    "",
    // 短く (2026-10-12 オーナー「長くなるから打った手・最後の手・状態・流れはいらない、JSON だけでいい」): 作っている物と今の MOD・PC かスマホか・エラーだけ。手順と流れは添付の JSON に
    ...sumLines.filter((l) => !/^(打った手|最後の手)/.test(l)),
    sumLines.length ? deviceJa(fb.context) : state ? `状態: ${state}` : "",
    firstErr ? `直近のエラー: ${String(firstErr).slice(0, 160)}` : "",
  ].filter(Boolean).join("\n").slice(0, 1950);
  try {
    const form = new FormData();
    form.append("payload_json", JSON.stringify({ content, allowed_mentions: { parse: [] } }));
    if (fb.context) form.append("files[0]", new Blob([JSON.stringify(fb, null, 1)], { type: "application/json" }), `feedback-${fb.id}.json`);
    appendImages(form, images, fb.id);
    const r = await fetchFn(webhook, { method: "POST", body: form });
    return r.ok;
  } catch { return false; }
}
