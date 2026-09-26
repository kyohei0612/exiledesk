/**
 * 履歴 API の応答を表示用の 1 件に読む
 *
 * trade-history.ts から切り出し (2026-09-26)。
 */
import type { TradeEntry } from "./store";

const RARITY_BY_FRAME: Record<number, string> = { 0: "Normal", 1: "Magic", 2: "Rare", 3: "Unique", 4: "Gem", 5: "Currency" };

function toMs(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw < 2_000_000_000 ? raw * 1000 : raw;
  if (typeof raw === "string" && raw.trim()) {
    const p = Date.parse(raw);
    return Number.isFinite(p) ? p : 0;
  }
  return 0;
}

/** API の 1 件を表示用に絞る (形が変わっても落ちないよう、ありそうなキーを順に見る) */
export function parseEntry(raw: unknown): TradeEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, any>;
  const item = (r.item ?? r.data?.item ?? {}) as Record<string, any>;
  const time = toMs(r.time ?? r.listedAt ?? r.date);
  const price = (r.price ?? {}) as Record<string, any>;
  const amount = typeof price.amount === "number" ? price.amount : typeof r.amount === "number" ? r.amount : null;
  const currency = typeof price.currency === "string" ? price.currency : typeof r.currency === "string" ? r.currency : null;
  const name = typeof item.name === "string" ? item.name : "";
  const typeLine = typeof item.typeLine === "string" ? item.typeLine : typeof item.baseType === "string" ? item.baseType : "";
  if (!time && !name && !typeLine) return null;
  const rarity = typeof item.rarity === "string" ? item.rarity : (RARITY_BY_FRAME[item.frameType as number] ?? "");
  const id = typeof item.id === "string" ? item.id : typeof r.item_id === "string" ? r.item_id : "";
  return {
    key: id ? `${id}|${time}` : `${name}|${typeLine}|${time}|${amount ?? ""}${currency ?? ""}`,
    time,
    amount,
    currency,
    name,
    typeLine,
    icon: typeof item.icon === "string" ? item.icon : null,
    rarity,
    stack: typeof item.stackSize === "number" ? item.stackSize : null,
    ilvl: typeof item.ilvl === "number" ? item.ilvl : null,
  };
}

export function listOf(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  const b = body as Record<string, unknown> | null;
  if (Array.isArray(b?.result)) return b.result as unknown[];
  if (Array.isArray(b?.entries)) return b.entries as unknown[];
  return [];
}
