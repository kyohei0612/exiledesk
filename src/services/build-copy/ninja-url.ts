/**
 * poe.ninja のビルドページの URL の読み方 (2026-09-26)
 *
 * オーナー:「URL からも読めるようにして」。
 *   URL: https://poe.ninja/poe2/builds/<リーグ>/character/<アカウント>/<キャラ名>?…
 *   実際に poe.ninja へ取りに行くのは services/pob-check/api.ts の toPobCode (Rust の ninja_build_character、応答の pathOfBuildingExport = PoB コード)。
 *   2026-10-03 忍者ビルドコピーを火力チェックへ統合したので、ここは URL の形を見るだけ。
 *   (items / jewels / skills から装備を組み立てる読み方は、PoB コードの無いキャラは火力チェックが読めないので外した)
 */

/** URL から リーグ / アカウント / キャラ名 を取り出す。形が違えば null */
export function parseNinjaUrl(text: string): { league: string; account: string; name: string } | null {
  const m = text.trim().match(/poe\.ninja\/poe2\/builds\/([^/?#]+)\/character\/([^/?#]+)\/([^/?#]+)/);
  if (!m) return null;
  return { league: decodeURIComponent(m[1]!), account: decodeURIComponent(m[2]!), name: decodeURIComponent(m[3]!) };
}
