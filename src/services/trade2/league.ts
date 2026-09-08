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
  return `${trade2HomeUrl(tradeLeague)}?q=${encodeURIComponent(JSON.stringify(query))}`;
}

/** trade2 サイトの検索ホーム URL (手動検索へのフォールバック) */
function trade2HomeUrl(tradeLeague: string): string {
  return `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(tradeLeague)}`;
}
