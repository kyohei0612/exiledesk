/**
 * trade-error.ts — trade2 / poe.ninja のエラーを短い日本語にする (2026-09-16)
 *
 * オーナー指摘: 「trade2 search HTTP 400 Bad Request: {"error":{"code":2,...}} みたいなのは
 * 日本語で端的に書いて欲しい。どのエラーも UI 上すべて分かりづらい」。
 */

/** 生のエラー文字列 → 画面に出す短い日本語 */
export function tradeErrorJa(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = String(raw);
  if (/Unknown item base type/i.test(s)) return "この名前では検索できません (アイテム名が一致しない)";
  if (/Unknown stat/i.test(s)) return "この条件では検索できません (MOD 名が一致しない)";
  if (/\b429\b|Too Many Requests|rate.?limit/i.test(s)) return "レート制限 (呼び出しが多すぎ)";
  if (/\b1015\b|Cloudflare/i.test(s)) return "Cloudflare にブロックされました";
  if (/\b40[13]\b|Forbidden|Unauthorized/i.test(s)) return "アクセスを拒否されました (ログインか権限)";
  if (/\b404\b|Not Found/i.test(s)) return "見つかりません (リーグ名や URL が古い)";
  if (/\b400\b|Bad Request/i.test(s)) return "検索条件を受け付けてもらえません";
  if (/\b5\d\d\b|Service Unavailable|Bad Gateway|Gateway Time-?out/i.test(s)) return "トレードサイト側のエラー (時間を置くと直ります)";
  if (/timed? ?out|timeout/i.test(s)) return "応答がありません (タイムアウト)";
  if (/network|dns|connect|接続/i.test(s)) return "通信できません (ネットワーク)";
  if (/json|parse/i.test(s)) return "応答を読めません (形式が変わった可能性)";
  // 心当たりが無い物は短く切って出す
  return s.length > 60 ? s.slice(0, 60) + "…" : s;
}

/** "Arc::finished" のようなキーを "アーク (完成品)" に近い形へ。label があればそれを使う */
export function watchLabelOf(key: string, labels: Record<string, string>): string {
  return labels[key] ?? key;
}
