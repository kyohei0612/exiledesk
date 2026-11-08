/**
 * サイトが決めた・借りた・推定した値の見分け (U-46、2026-11-08 オーナー「こういうデータこっちで決めてますみたいな所全て変える」)。
 * 説明の窓の行 (カレンシー・お告げの「このステージでの動き」) は文字列なので、言い回しで見分けて行の頭に DataNote の印を出す。
 * 「等しく (均一)」もゲームは公表していないサイトの決めなので印を付ける (11-09 オーナー「付けておk」)。
 * 新しい説明に非公表・借りた値を書く時は、下のどれかの言い回しを入れる (入れれば印が付く)。
 */
import { tr } from "../../i18n/lang";

const SITE_DATA_RE = /公式の値は出ていない|公開されていない|公開値なし|公表していない|Craft of Exile|コミュニティ|実測|説明文に決め方が無い|等しく|均一|not published|no official|community|the text doesn't say|equally|uniform/i;

export const isSiteData = (line: string): boolean => SITE_DATA_RE.test(line);

/** 札の説明: 「・」の縦の箇条書きの行 (1 本の文字列なら 1 行)。出どころ・何が仮か・どう見ればよいか を 1 行ずつ (11-09 オーナー「区切った方が良いね」) */
export type NoteLines = string | readonly string[];

/** 札の既定の説明 */
export const SITE_DATA_HINT = (): string[] => [
  tr("ゲームが公表していない値", "Not published by the game"),
  tr("サイトがコミュニティのデータから借りたか、決めた値", "Borrowed from community data or chosen by the site"),
  tr("目安として見る", "Treat it as an estimate"),
];
