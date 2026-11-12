/**
 * paste-log.ts — 貼った品の文と、それを読んだ結果を 1 件の組で残す (設計図 D-14c)。
 * オーナー 11-12「元の文ないわ、何貼ったかも追跡できるようにしないと」「その挙動サーバー分析に入れたらいんじゃね変換前と後でじゃないとおえないでしょ」
 * (段に収まらない盾を貼った時、何を貼って何と読まれたのかを後から確かめられなかった)。
 * 前 = 貼った文、後 = 読んだ結果 (ベース・アイテムレベル・レア度・行ごとの MOD と段と値・読めなかった行と訳の種類・読み方の候補の数)。
 * 残す部品はここ 1 つ。読みの部品 (parseItemText) を呼んだ所が where を付けて呼ぶ (デイリーの投稿 = "daily"、シミュの貼って始める = "sim")。
 * 開発版 (dev サーバー) は触った物の記録 (U-33 の devLog → 手元の .dev-logs/) に、文を全部と読んだ結果を毎回残す。本番の作りでは devLog は空 (Y-64)
 */
import type { ItemTextResult } from "../../services/simulator/paste/item-text-types";
import { devLog } from "../../web/dev-log";

export type PasteWhere = "daily" | "sim";

const cut = (s: string, n: number): string => (s.length > n ? s.slice(0, n) : s);

/** 読んだ結果を記録用に小さくまとめる (画面の言葉でなく、エンジンの id と段で。文は行を追えるよう頭だけ) */
export function pasteAfter(r: ItemTextResult): Record<string, unknown> {
  return {
    source: r.source, lang: r.lang, base: r.base?.en ?? null, cls: r.cls, rarity: r.rarity, ilvl: r.itemLevel,
    quality: r.quality ? { value: r.quality.value, tag: r.quality.tag } : null, corrupted: r.corrupted, flags: r.flags.slice(0, 8).map((f) => cut(f, 60)),
    count: r.count,
    mods: r.mods.slice(0, 16).map((m) => ({
      text: cut(m.text, 160), id: m.modId, src: m.source, side: m.side,
      tier: m.tier ? m.tier.label : null, tierName: m.tier?.name ?? null, fits: m.tier ? m.tier.fits : null,
      values: m.values, shown: m.shownValues,
      ...(m.fractured ? { fractured: 1 } : {}), ...(m.desecrated ? { desecrated: 1 } : {}), ...(m.crafted ? { crafted: 1 } : {}), ...(m.unrevealed ? { unrevealed: 1 } : {}),
      ...(m.summed ? { summed: 1 } : {}), ...(m.guess ? { guess: 1 } : {}), ...(m.pasteTier !== undefined ? { pasteTier: m.pasteTier } : {}), ...(m.pasteTierName ? { pasteTierName: cut(m.pasteTierName, 40) } : {}),
    })),
    implicits: r.implicits.slice(0, 8).map((i) => ({ text: cut(i.text, 120), from: i.from })),
    skipped: r.skipped.slice(0, 16).map((s) => ({ line: cut(s.line, 160), code: s.code })),
    readings: r.readings?.length ?? 1,
  };
}

/** 貼って読んだ時に 1 回呼ぶ。開発版は文を全部 (長すぎる物だけ切る) と読んだ結果を手元の記録に残す */
export function logPaste(where: PasteWhere, raw: string, r: ItemTextResult): void {
  try { devLog("paste-read", { where, chars: raw.length, text: cut(raw, 12000), after: pasteAfter(r) }); } catch { /* 記録は落としてよい */ }
}
