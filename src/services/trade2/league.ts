/**
 * poe.ninja の snapshot_name → trade2 API のリーグ ID 変換
 *
 * craft-discovery-v2.ts から切り出し (2026-09-07)。
 *
 * 変換規則:
 *   1. 永続リーグ ("standard" / "hardcore") だけ直接マップ
 *   2. それ以外は kebab → スペース + 単語頭文字大文字化 (stopword は小文字維持)
 *   3. 先頭の "hc-" / "ssf-" / "hc-ssf-" は "HC " / "SSF " / "HC SSF " に変換
 *
 * 実データ (2026-09-07):
 *   "forbidden-rites" → "Forbidden Rites" / "hc-forbidden-rites" → "HC Forbidden Rites"
 * trade2 の正式 ID 一覧: https://www.pathofexile.com/api/trade2/data/leagues
 * (SSF リーグはトレード不可のため trade2 側には存在しない)
 */

import { localizeQueryForSite } from "./localize";

const TRADE_LEAGUE_STOPWORDS = new Set(["of", "the", "and", "or", "in", "a", "an", "to", "for"]);

function titleCaseLeagueWords(words: string[]): string {
  return words
    .filter((w) => w.length > 0)
    .map((w, i) => {
      if (i > 0 && TRADE_LEAGUE_STOPWORDS.has(w.toLowerCase())) {
        return w.toLowerCase();
      }
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

export function snapshotNameToTradeLeague(snapshotName: string): string {
  if (!snapshotName) return "Standard";

  const PERMANENT: Record<string, string> = { standard: "Standard", hardcore: "Hardcore" };
  const permanent = PERMANENT[snapshotName.toLowerCase()];
  if (permanent) return permanent;

  // HC/SSF は prefix。剥がす順序は長い方から (hc-ssf- が hc- にもマッチするのを防ぐ)。
  let core = snapshotName.toLowerCase();
  let prefix = "";
  if (core.startsWith("hc-ssf-")) {
    core = core.slice("hc-ssf-".length);
    prefix = "HC SSF ";
  } else if (core.startsWith("ssf-")) {
    core = core.slice("ssf-".length);
    prefix = "SSF ";
  } else if (core.startsWith("hc-")) {
    core = core.slice("hc-".length);
    prefix = "HC ";
  }
  const words = core.split("-").filter((w) => w.length > 0);
  return prefix + titleCaseLeagueWords(words);
}

/**
 * 検索条件 JSON をそのまま載せた trade2 サイトの URL (API を叩かない = レート制限に当たらない)。
 * サイト側が `?q=` を読んで検索を実行し、圧縮 URL に置き換える (2026-09-08 実ブラウザで確認)。
 */
export function trade2QueryUrl(tradeLeague: string, query: unknown): string {
  return `${trade2HomeUrl(tradeLeague)}?q=${encodeURIComponent(JSON.stringify(toSiteQuery(localizeQueryForSite(query))))}`;
}

/**
 * サイトの URL 状態は `type` / `name` を文字列で持つ (API は {discriminator, option} も受けるがサイトの ?q= は
 * 文字列しか解釈しない場合がある — オーナー報告「トレード2へで検索に失敗する」2026-09-12)。
 */
function toSiteQuery(query: unknown): unknown {
  if (!query || typeof query !== "object") return query;
  const q = JSON.parse(JSON.stringify(query)) as { query?: Record<string, unknown> };
  const inner = q.query;
  if (inner && typeof inner === "object") {
    for (const k of ["type", "name"]) {
      const v = inner[k];
      if (v && typeof v === "object" && "option" in (v as Record<string, unknown>)) {
        inner[k] = (v as { option: unknown }).option;
      }
    }
  }
  return q;
}

/**
 * ブラウザで開く trade2 サイト。オーナー指示 (2026-09-12) で既定は日本語サイト (jp)。
 * jp はボット確認 (Cloudflare) を挟むことがあり、その後に検索が消える環境もあるので設定で www に切り替えられる。
 * API (`/api/trade2/...`) は www 固定のまま (constants/trade2.ts)。検索 ID とリーグ ID は両サイト共通。
 */
export type Trade2Site = "jp" | "www";
export const TRADE2_SITE_KEY = "exiledesk.trade2.site";
export function trade2Site(): Trade2Site {
  try {
    return localStorage.getItem(TRADE2_SITE_KEY) === "www" ? "www" : "jp";
  } catch {
    return "jp";
  }
}
export function setTrade2Site(site: Trade2Site): void {
  try {
    localStorage.setItem(TRADE2_SITE_KEY, site);
  } catch {
    /* 保存できなくても既定 (jp) で動く */
  }
}
export function trade2SiteOrigin(): string {
  return trade2Site() === "www" ? "https://www.pathofexile.com" : "https://jp.pathofexile.com";
}

/** trade2 サイトの検索ホーム URL (手動検索へのフォールバック) */
function trade2HomeUrl(tradeLeague: string): string {
  return `${trade2SiteOrigin()}/trade2/search/poe2/${encodeURIComponent(tradeLeague)}`;
}
