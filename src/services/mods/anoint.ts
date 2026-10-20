/**
 * anoint.ts — 注油 (アノイント、液化した感情でアミュレットにノータブルを割り当てる) の一覧 (2026-10-20 J4 ③)。
 *
 * 一覧は src/data/delirium-notables.json (poe2db の /jp/Notable のうち、液化した感情のレシピがある物 = 注油できるノータブル、2026-10-17。
 * 錯乱のエッセンスの「ランダムなノータブルを割り当てる」と同じ一覧)。貼り付けの文は英語「Allocates <名前>」、日本語「<名前> を割り当てる」
 * (mod-text-ja.json の Allocates … の行と同じ形)。
 */
import notables from "../../data/delirium-notables.json";

const LIST = (notables as { list: Array<{ en: string; ja: string }> }).list;
const BY_EN = new Map(LIST.map((n) => [n.en.toLowerCase(), n]));
const BY_JA = new Map(LIST.map((n) => [n.ja, n]));

/** 注油できるノータブルの一覧 */
export function anointNotables(): ReadonlyArray<{ en: string; ja: string }> {
  return LIST;
}

/** 貼り付けの 1 行が注油 (Allocates <ノータブル>) ならそのノータブル、違えば null */
export function anointOfLine(line: string): { en: string; ja: string } | null {
  const en = /^Allocates\s+(.+?)\s*$/i.exec(line);
  if (en) return BY_EN.get(en[1]!.toLowerCase()) ?? null;
  const ja = /^(.+?)\s*を割り当てる$/.exec(line);
  return ja ? BY_JA.get(ja[1]!.trim()) ?? null : null;
}
