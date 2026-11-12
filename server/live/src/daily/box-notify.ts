/**
 * クラフト箱 (投稿の箱) に届いた投稿を Discord に 1 件流す (設計図 D-20b、オーナー 11-12「サーバーから要望と同じような形でクラフト箱に着た奴ディスコードで表示したい」)。
 * 要望と同じ webhook の道 (feedback.ts の notifyDiscord と同じ形 = payload_json、失敗しても投稿は置き場に済んでいるので投げない)。
 * 行き先は秘密 BOX_WEBHOOK (クラフト箱のチャンネル、オーナー 11-12「クラフト箱チャンネルつくったからそっちかな」)、無ければ要望と同じ DISCORD_WEBHOOK。IP は送らない
 */
import type { Fetch } from "../types";

type Aim = { ja?: unknown; en?: unknown; modId?: unknown; tier?: unknown };
export type BoxPost = { id: string; at: number; note: string; base: unknown; baseJa: unknown; ilvl: unknown; aims: unknown[]; status: string; why?: string };

const str = (v: unknown, max: number): string => (typeof v === "string" ? v : "").slice(0, max);

/** Discord に出す文 (2000 字まで)。品の名前・アイテムレベル・狙いの MOD (段つき)・投稿した人・一言・受けたか落ちたか・投稿の id */
export function boxContent(p: BoxPost, nickName: string | null): string {
  const jst = new Date(p.at + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
  const base = str(p.baseJa, 60) || str(p.base, 60) || "?";
  const en = str(p.base, 60);
  const aims = p.aims.slice(0, 12).map((a) => {
    const x = (a ?? {}) as Aim;
    const name = str(x.ja, 120) || str(x.en, 120) || str(x.modId, 80) || "?";
    return `- ${name}${Number.isFinite(Number(x.tier)) ? ` (T${Number(x.tier)})` : ""}`;
  });
  const state = p.status === "no" ? `✕ 落ちた (${p.why === "bad-word" ? "悪口" : p.why ?? "?"})` : "受けた (16:00 の機械の確かめ待ち)";
  return [
    `**📦 クラフト箱** 👤 **${nickName ? nickName.slice(0, 40) : "名前なし"}** · ${jst} JST`,
    `**${base}**${en && en !== base ? ` (${en})` : ""} · アイテムレベル ${Number.isFinite(Number(p.ilvl)) ? Number(p.ilvl) : "?"}`,
    ...aims,
    p.note ? `一言: ${p.note.slice(0, 200)}` : "",
    state,
  ].filter(Boolean).join("\n").slice(0, 1900) + `\n-# 投稿の id ${p.id}`;
}

/**
 * 絵の元 (D-20c): 投稿の確かめの画面のカードの字 (画面が投稿の時に添える、src/views/daily/daily-post-card.ts の PostCard と同じ形)。
 * n = 品の名前、a = ベースの絵のファイル名、h = 種類・アイテムレベル・数値の行、r = MOD の行 (s = 側、g = 札、t = 文、f = フラクチャー)、l = 言語
 */
export type BoxCard = { n: string; a: string | null; h: string[]; r: Array<{ s: "P" | "S"; g: string; t: string; f?: 1 }>; l: "ja" | "en" };

/** 絵を作る配信のサーバー (server/web の /og/<code>.png、シェアのカードと同じ道。中身の並びは server/web/og-card.js の PACK) */
export const CARD_ORIGIN = "https://exiledesk.com";
const PACK_N = 22, PACK_L = 0, PACK_KD = 15, PACK_BX = 21;
const CARD_WAIT_MS = 8000, CARD_MAX_BYTES = 4 * 1024 * 1024;

/** 絵の元を配信のサーバーの絵の道の code に詰める (JSON の配列を deflate-raw → base64url、og-card.js の unpack の逆) */
export async function packCard(card: BoxCard): Promise<string> {
  const arr: Array<string | null> = Array.from({ length: PACK_N }, () => null);
  arr[PACK_L] = card.l; arr[PACK_KD] = "box"; arr[PACK_BX] = JSON.stringify({ n: card.n, a: card.a, h: card.h, r: card.r });
  const bytes = new Uint8Array(await new Response(new Blob([JSON.stringify(arr)]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 配信のサーバーから品の絵を取る。取れない・PNG でない・大きすぎる・遅い時は null (知らせは字だけになる) */
export async function cardPng(card: BoxCard, origin: string, fetchFn: Fetch = fetch): Promise<ArrayBuffer | null> {
  try {
    const code = await packCard(card);
    if (code.length > 7000) return null;
    const r = await fetchFn(`${origin}/og/${code}.png`, { signal: AbortSignal.timeout(CARD_WAIT_MS) });
    if (!r.ok || !(r.headers.get("content-type") ?? "").startsWith("image/png")) return null;
    const buf = await r.arrayBuffer();
    return buf.byteLength > 0 && buf.byteLength <= CARD_MAX_BYTES ? buf : null;
  } catch { return null; }
}

/**
 * 1 件流す。流せたら true (webhook が無い・失敗は false、投げない)。
 * card (絵の元) があれば配信のサーバーで品の絵にしてファイルで付ける (feedback-images.ts の付け方と同じ files[n])。絵が取れなければ字だけの今までの知らせ
 */
export async function notifyBox(webhook: string | undefined, p: BoxPost, nickName: string | null, fetchFn: Fetch = fetch, card: BoxCard | null = null, origin: string = CARD_ORIGIN): Promise<boolean> {
  const hook = (webhook ?? "").trim();
  if (!hook) return false;
  try {
    const png = card ? await cardPng(card, origin, fetchFn) : null;
    const form = new FormData();
    form.append("payload_json", JSON.stringify({ content: boxContent(p, nickName), allowed_mentions: { parse: [] } }));
    if (png) form.append("files[0]", new Blob([png], { type: "image/png" }), `box-${p.id}.png`);
    const r = await fetchFn(hook, { method: "POST", body: form });
    return r.ok;
  } catch { return false; }
}
