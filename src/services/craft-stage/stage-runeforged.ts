/**
 * stage-runeforged.ts — ベースのルーンフォージ版 (Runeforged ○○) とワードの値 (E-78、2026-11-08 深夜)
 *
 * ルーンワードは元の防御から換算する式が無く、ルーンフォージ版ごとに決まった値 (正は poe2db の防具の部位ページ、PoB の Data/Bases とも 469 件全部同じ)。
 * 同じ名前で値の違う版がある (Runeforged Grasping Mail は 4 つ、6 ベース) ので全部を返し、どれを出すかは画面が選ぶ (既定は 1 つ目)。
 * 表は scripts/build-runeforged.mjs が作る stage-runeforged.json
 */
import raw from "./stage-runeforged.json";

/** ルーンフォージ版 1 つ: 名前 (英語)・ワード・残る防御 (無い防御は持たない) */
export interface Runeforged { name: string; ward: number; armour?: number; evasion?: number; es?: number }

const TABLE = (raw as { bases: Record<string, Runeforged[]> }).bases;

/** 元のベース (英語名) のルーンフォージ版の一覧。無いベース (武器・装飾品・ルーンフォージ版の無い防具) は空 */
export function runeforgedOf(base: string): readonly Runeforged[] { // E-78
  return TABLE[base] ?? [];
}
