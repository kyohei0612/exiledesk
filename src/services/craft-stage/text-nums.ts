/**
 * クラフトステージ: MOD の文面の数値を別の値に差し替える (2026-10-02)
 *
 * 聖別 ([[apply-vaal.ts]] の applySanctify) とカタリストの品質で伸びた後の文 ([[stage-core.ts]] の boostedMod) が
 * stage-core の retext を通して使うので、ここに 1 つ (同じ物を 2 つ持たない)。
 * retext はデータにその MOD があれば雛形 (英語の「#」の位置・日本語の雛形) から文を作り直すので、ここは雛形が無い時の予備:
 * 「同じ数字をすべて置換」はしない (Rings/LightRadiusAndManaRegeneration「5% increased Light Radius / #% Mana Regen」で
 * マナ再生が 5 の時に Light Radius の 5 まで書き換わる) で、値の並び順に「その値と同じ数字」だけを順に差し替える
 * (固定の数字は、値の並びの次と一致しなければ素通り)
 */
export function swapNums(text: string, from: readonly number[], to: readonly number[]): string {
  let i = 0;
  return text.replace(/\d+(?:\.\d+)?/g, (s) => (i < from.length && Number(s) === Math.abs(from[i]!) ? String(Math.abs(to[i++]!)) : s));
}
