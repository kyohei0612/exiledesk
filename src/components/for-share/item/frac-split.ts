/**
 * frac-split.ts — 複数フラクチャーを完成形のカードで枠ごとの行に開く時の短い名前 (S-11c、スイッチ fracSplit)。
 * 「4から71の雷ダメージをアタックに追加する」「22から37の冷気ダメージを…」「25から37の火ダメージを…」→「雷 / 冷気 / 火」。
 * 数を抜き、全部に共通の頭と尻を落とす (日本語は字ごと、英語は語ごと)。落とすと空や重なりが出る時は数を抜いただけの文のまま。
 */
/** 数を抜いた文 (「XからYの」「(a-b)」「+12%」) */
function bare(t: string): string {
  return t
    .replace(/[+-]?\d+(?:\.\d+)?\s*から\s*[+-]?\d+(?:\.\d+)?の/g, "")
    .replace(/[+-]?\([^)]*\)%?/g, "")
    .replace(/[+-]?\d+(?:\.\d+)?%?/g, "")
    .replace(/^Adds\s+to\s+/, "Adds ")
    .replace(/\s+/g, " ")
    .trim();
}
export function fracNames(texts: readonly string[]): string[] {
  const b = texts.map(bare);
  if (b.length < 2) return b;
  const en = b.every((s) => /^[\x20-\x7e]*$/.test(s));
  const parts = b.map((s) => (en ? s.split(" ") : [...s]));
  const first = parts[0]!;
  let pre = 0;
  while (parts.every((p) => pre < p.length && p[pre] === first[pre])) pre++;
  let suf = 0;
  while (parts.every((p) => suf < p.length - pre && p[p.length - 1 - suf] === first[first.length - 1 - suf])) suf++;
  const cut = parts.map((p) => p.slice(pre, p.length - suf).join(en ? " " : "").trim());
  return cut.every(Boolean) && new Set(cut).size === cut.length ? cut : b;
}
