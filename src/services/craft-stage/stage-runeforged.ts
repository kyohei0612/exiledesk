/**
 * stage-runeforged.ts — ベースのルーンフォージ版 (Runeforged ○○) とワードの値 (E-78、2026-11-08 深夜)
 *
 * ルーンワードは元の防御から換算する式が無く、ルーンフォージ版ごとに決まった値 (正は poe2db の防具の部位ページ、元のベースは poe2db の Runeforging のレシピの Cost、11-09)。
 * 同じ元から値の違う版が作れる物がある (Grasping Mail・Sacrificial Regalia は 4 つずつ) ので全部を返し、どれを出すかは画面が選ぶ (既定は 1 つ目)。
 * 版の名前は元と違う事がある (Cassis Helm → Runeforged Gladiatorial Helm)。ユニークからだけ作れる版・poe2db にレシピの無い版は入れない (オーナー 11-09「B」)
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
