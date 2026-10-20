/**
 * trade2 クエリの名前を、開くサイト / 叩く API の言語に合わせる (2026-09-12)
 *
 * 実測 (オーナーの Chrome + curl):
 *   - jp.pathofexile.com のトレードは www で作った検索 ID も、英語名の ?q= も「検索状態の読み込みに失敗」になる
 *   - jp の API (jp.pathofexile.com/api/trade2) は英語名を "Unknown item base type" で弾き、日本語名なら通る
 *   → JP サイト設定のときは API も jp に投げ、type / name をクライアント由来の日本語名に置き換える。
 * stat の ID・カテゴリ・フィルタ名はサイト共通なので触らない。
 */
import { jaTypeName, jaUniqueName } from "../../i18n/item-names-ja";
import { trade2Site } from "./league";

// 名前の辞書は i18n/item-names-ja.ts (エンジンも読むので 2026-10-20 手 2 で移した)。ここを読む画面のために並べ直す
export { jaTypeName, jaUniqueName };

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
