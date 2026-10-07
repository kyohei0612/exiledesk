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
export function trailText(context: unknown, max = 14): string {
  const trail = (context as { trail?: unknown })?.trail;
  if (!Array.isArray(trail) || !trail.length) return "";
  return trail.slice(-max).map((e) => {
    const n = String((e as { n?: unknown })?.n ?? "?");
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

export async function listFeedback(kv: KVNamespace, limit = 100): Promise<Feedback[]> {
  const l = await kv.list({ prefix: PREFIX, limit });
  const out: Feedback[] = [];
  for (const k of l.keys) { const v = (await kv.get(k.name, "json")) as Feedback | null; if (v) out.push(v); }
  return out;
}

/** 添付から「今の状態」を 1 行に (手で打つ / シミュレーション・ベース・手数・狙いとパターンの数・エラーの数) */
export function stateLine(context: unknown): string {
  if (!context || typeof context !== "object") return "";
  const c = context as { version?: string; mode?: string; base?: string; itemLevel?: number; hand?: { steps?: number } | null; sim?: { targets?: unknown[]; patterns?: unknown[] } | null; errors?: unknown[]; market?: { error?: string | null } };
  const parts = [
    c.version ? `v${c.version}` : "",
    c.mode === "sim" ? "シミュレーション" : c.mode === "hand" ? "手で打つ" : "",
    c.base ? `${c.base}${c.itemLevel ? ` ilvl${c.itemLevel}` : ""}` : "",
    c.hand?.steps ? `手で ${c.hand.steps} 手` : "",
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
export async function notifyDiscord(webhook: string, fb: Feedback, fetchFn: Fetch): Promise<boolean> {
  const head = fb.kind === "bug" ? "🐛 バグ" : "💡 要望";
  const trail = trailText(fb.context);
  const state = stateLine(fb.context);
  const firstErr = (fb.context as { errors?: Array<{ msg?: string }> } | null)?.errors?.[0]?.msg;
  // 日本時間で (Discord は文字列をそのまま出すので、ここで +9 時間)
  const jst = new Date(Date.parse(fb.at) + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
  const content = [
    `**${head}** ${fb.contact ? `(${fb.contact}) ` : ""}${jst} JST · id ${fb.id}`,
    fb.text.slice(0, 1200),
    state ? `状態: ${state}` : "",
    trail ? `流れ: ${trail}` : "",
    firstErr ? `直近のエラー: ${String(firstErr).slice(0, 160)}` : "",
    fb.context ? "添付の JSON に 手順 (同じ seed で再生できる plan)・レシピ・エラーの詳細が入っています" : "",
  ].filter(Boolean).join("\n").slice(0, 1950);
  try {
    const form = new FormData();
    form.append("payload_json", JSON.stringify({ content, allowed_mentions: { parse: [] } }));
    if (fb.context) form.append("files[0]", new Blob([JSON.stringify(fb, null, 1)], { type: "application/json" }), `feedback-${fb.id}.json`);
    const r = await fetchFn(webhook, { method: "POST", body: form });
    return r.ok;
  } catch { return false; }
}
