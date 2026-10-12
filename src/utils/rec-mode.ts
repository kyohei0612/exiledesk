/**
 * 録画モード (POE2Tube 要望 ㊶、2026-10-12)。Web 版を `?rec=1` で開いた時だけ:
 *   - 上の帯の「アプリ版 近日公開」「本日の訪問者」、右のチャンネル欄、一番下の行を隠す (「要望・バグを送る」は残す)
 *   - 使い方の記録・訪問者の数を送らない (no-log.ts が見る。端末の「記録しない」の印は書き換えない)
 *   - 起動直後の窓 (更新しました・要望の返事) を出さない、棚・ベースの詳しいカードを出さない
 *   - 押す所に録画用の固定の目印 `data-rec="…"` (普段も付いているが、見た目は何も変わらない)
 * 普段の人には何も変わらない。URL の ?rec=1 は開いた時に 1 回だけ読む
 */
export const REC: boolean = (() => {
  try { return typeof location !== "undefined" && new URLSearchParams(location.search).get("rec") === "1"; } catch { return false; }
})();
