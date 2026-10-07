/**
 * 要望・バグの受け取り (2026-10-07 オーナー「要望バグの送信もできるようにしたい」)。
 *   POST /feedback  { kind: "request" | "bug", text, contact?, context?, website? (bot よけ、空でないと捨てる) }
 *   GET  /feedback.json?key=<REFRESH_KEY>  … 新しい順の一覧 (オーナー用)
 * KV に 90 日残し、DISCORD_WEBHOOK があれば Discord にも流す。同じ IP から 1 時間 10 件まで
 */
import type { Fetch } from "./types";

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
}

const MAX_TEXT = 4000;
const MAX_CONTACT = 200;
const MAX_CONTEXT = 24 * 1024;
const PER_HOUR = 10;
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

/** 同じ IP の 1 時間の数 (KV。超えたら false) */
export async function allowIp(kv: KVNamespace, ip: string, now = Date.now()): Promise<boolean> {
  const hour = Math.floor(now / 3600e3);
  const key = `fbip:${ip}:${hour}`;
  const n = Number((await kv.get(key)) ?? 0);
  if (n >= PER_HOUR) return false;
  await kv.put(key, String(n + 1), { expirationTtl: 3700 });
  return true;
}

export async function saveFeedback(kv: KVNamespace, fb: Feedback): Promise<void> {
  // 新しい順に並ぶよう、キーは (大きな数 − 時刻)
  const rev = String(9_999_999_999_999 - Date.parse(fb.at)).padStart(13, "0");
  await kv.put(`${PREFIX}${rev}:${fb.id}`, JSON.stringify(fb), { expirationTtl: KEEP_DAYS * 86400 });
}

export async function listFeedback(kv: KVNamespace, limit = 100): Promise<Feedback[]> {
  const l = await kv.list({ prefix: PREFIX, limit });
  const out: Feedback[] = [];
  for (const k of l.keys) { const v = (await kv.get(k.name, "json")) as Feedback | null; if (v) out.push(v); }
  return out;
}

/** Discord に 1 件流す (webhook。失敗しても保存は済んでいるので投げない) */
export async function notifyDiscord(webhook: string, fb: Feedback, fetchFn: Fetch): Promise<boolean> {
  const head = fb.kind === "bug" ? "🐛 バグ" : "💡 要望";
  const ctx = fb.context ? "\n```json\n" + JSON.stringify(fb.context).slice(0, 600) + "\n```" : "";
  const content = `**${head}** ${fb.contact ? `(${fb.contact}) ` : ""}${fb.at.slice(0, 16).replace("T", " ")} UTC\n${fb.text.slice(0, 1200)}${ctx}`.slice(0, 1950);
  try {
    const r = await fetchFn(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content, allowed_mentions: { parse: [] } }) });
    return r.ok;
  } catch { return false; }
}
