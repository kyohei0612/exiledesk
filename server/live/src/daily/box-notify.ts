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

/** 1 件流す。流せたら true (webhook が無い・失敗は false、投げない) */
export async function notifyBox(webhook: string | undefined, p: BoxPost, nickName: string | null, fetchFn: Fetch = fetch): Promise<boolean> {
  const hook = (webhook ?? "").trim();
  if (!hook) return false;
  try {
    const form = new FormData();
    form.append("payload_json", JSON.stringify({ content: boxContent(p, nickName), allowed_mentions: { parse: [] } }));
    const r = await fetchFn(hook, { method: "POST", body: form });
    return r.ok;
  } catch { return false; }
}
