/**
 * trade2 クエリの名前を、開くサイト / 叩く API の言語に合わせる (2026-09-12)
 *
 * 実測 (オーナーの Chrome + curl):
 *   - jp.pathofexile.com のトレードは www で作った検索 ID も、英語名の ?q= も「検索状態の読み込みに失敗」になる
 *   - jp の API (jp.pathofexile.com/api/trade2) は英語名を "Unknown item base type" で弾き、日本語名なら通る
 *   → JP サイト設定のときは API も jp に投げ、type / name をクライアント由来の日本語名に置き換える。
 * stat の ID・カテゴリ・フィルタ名はサイト共通なので触らない。
 */
import gemsRaw from "../../i18n/gems-client.json";
import itemsJaClient from "../../i18n/items-ja-client.json";
import itemsJa from "../../i18n/items-ja.json";
import uniqueNamesJa from "../../i18n/unique-names-ja.json";
import { trade2Site } from "./league";

const GEM_JA: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const g of gemsRaw as { en: string; ja: string }[]) m.set(g.en, g.ja);
  return m;
})();
const ITEMS_JA = itemsJaClient as Record<string, string>;
const ITEMS_JA2 = itemsJa as Record<string, string>;
const UNIQUE_JA = uniqueNamesJa as Record<string, string>;

/** ベース / ジェム名の英名 → 日本語名。辞書に無ければそのまま */
export function jaTypeName(en: string): string {
  return GEM_JA.get(en) ?? ITEMS_JA[en] ?? ITEMS_JA2[en] ?? en;
}
/** ユニーク名の英名 → 日本語名 */
export function jaUniqueName(en: string): string {
  return UNIQUE_JA[en] ?? en;
}

interface QueryLike {
  query?: { type?: unknown; name?: unknown } & Record<string, unknown>;
}

function mapOption(v: unknown, f: (s: string) => string): unknown {
  if (typeof v === "string") return f(v);
  if (v && typeof v === "object" && typeof (v as { option?: unknown }).option === "string") {
    return { ...(v as Record<string, unknown>), option: f((v as { option: string }).option) };
  }
  return v;
}

/** 現在のサイト設定が jp なら type / name を日本語化した複製を返す。www ならそのまま */
export function localizeQueryForSite(body: unknown): unknown {
  if (trade2Site() !== "jp" || !body || typeof body !== "object") return body;
  const q = JSON.parse(JSON.stringify(body)) as QueryLike;
  if (q.query) {
    if (q.query.type !== undefined) q.query.type = mapOption(q.query.type, jaTypeName);
    if (q.query.name !== undefined) q.query.name = mapOption(q.query.name, jaUniqueName);
  }
  return q;
}
