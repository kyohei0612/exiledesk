/**
 * search.ts — ジェム名の検索 (ジェムコラプトの賭け / 自動ジェム監視 共通、2026-09-18)
 *
 * レビュー指摘: 同じ GEMS を同じ並びで返す検索が 2 か所にあり、片方だけ正規表現が効いていた。
 * オーナー指示 (2026-09-17):「検索はジェムコラの検索と同じで、少し入れたら対象のジェムが表示されて、
 * 正規表現で入れれるように」→ 両方ここを使う。
 *
 *   - 正規表現として読めるならそれで (大文字小文字は区別しない)、駄目なら普通の部分一致
 *   - 先頭一致を上に、あとは日本語名順。最大 12 件
 */
import { GEMS, type GemInfo } from "./useGemCorrupt";

export interface GemSearch {
  hits: GemInfo[];
  /** 正規表現として読めなかった時のエラー文 (部分一致で探した印)。読めたなら "" */
  regexError: string;
}

export function searchGems(query: string, limit = 12): GemSearch {
  const q = query.trim();
  if (!q) return { hits: [], regexError: "" };
  const lower = q.toLowerCase();
  let test: (g: GemInfo) => boolean;
  let regexError = "";
  try {
    const re = new RegExp(q, "i");
    test = (g) => re.test(g.ja) || re.test(g.en);
  } catch (e) {
    regexError = e instanceof Error ? e.message : String(e);
    test = (g) => g.ja.toLowerCase().includes(lower) || g.en.toLowerCase().includes(lower);
  }
  const hits = GEMS.filter(test);
  hits.sort((a, b) => {
    const as = a.ja.toLowerCase().startsWith(lower) || a.en.toLowerCase().startsWith(lower) ? 0 : 1;
    const bs = b.ja.toLowerCase().startsWith(lower) || b.en.toLowerCase().startsWith(lower) ? 0 : 1;
    return as - bs || a.ja.localeCompare(b.ja, "ja");
  });
  return { hits: hits.slice(0, limit), regexError };
}
