/** raw-text.ts — 貼り付けの MOD の素の値の文 (B16。item-text.ts から分けた。シミュの貼り付けが消えたら消す) */
import type { ItemTextMod } from "../item-text-types";

/**
 * 貼った MOD の文の数字を、出てくる順に素の値 (values) へ差し替えた文 (J8、MOD の数字は素の値で出す。2026-10-22 シミュの SimPasteRead の式を入口へ、B16)。
 * 数字は貼ったままの値 (shownValues) と同じ順で並んでいる。上乗せが無い・数が合わない時は貼ったままの文
 */
export function modRawText(m: ItemTextMod): string {
  if (!m.boosts.length || m.values.length !== m.shownValues.length) return m.text;
  let i = 0;
  return m.text.replace(/\d+(?:\.\d+)?/g, (x) => {
    if (i < m.shownValues.length && Number(x) === m.shownValues[i]) return String(m.values[i++]);
    return x;
  });
}
