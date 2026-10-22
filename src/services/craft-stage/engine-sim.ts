/**
 * engine-sim.ts — シミュの入口 (2026-10-22 深夜 オーナー: エンジンに足した物は要望を出した側の画面だけが使う。案は docs/org/emulator/notes/2026-10-22-entry-split-plan.md)。
 * シミュの要望で足した物 (シミュの自前の式を入口へ、B1〜B16・C) を並べる。読むのはシミュ・チュートリアル・解析 (エミュは読まない)。
 * 核 (形・打つ・読む・置き場・確率・名簿・乱数) は engine.ts から取る。エミュも欲しくなった物はブラックが決めて engine.ts へ上げる (ここと engine-emu.ts に同じ名前を並べない)。
 * ここは名前を並べるだけ (中身は元のファイル)。`export *` の束ねを作らない (engine.ts と同じ)
 */

// 段の換算 (段の番号 ↔ 段の名前の T・狙いが全部付く一番低いアイテムレベル・段の札の文字)
export { tierIndexOf, tierRankOf, tierNoOf, minIlvlFor, tierRankLabel } from "./tier-rank";
// 当たりの判定 (sameText = 同じ系統で文も同じ別の modId も当たり)・外れ・付いている狙いの組
export type { AimHitOpts } from "./aim-odds";
export { hits as aimHits, aimHeldOn, isAimMod, junkOf, heldSetOf } from "./aim-odds";
// 1 手の前後で狙い (段の名前の T) がどう変わったか・行き先を狙いで分ける・この手で付きうる狙い (クラフト台の % = heldOdds の窓口)
export type { TierAim, AimDiff, AimDiffOpts } from "./aim-reach";
export { aimDiff, outcomesByAim, reachableAims } from "./aim-reach";
// 手の働き (足す・入れ替え・消す…) とカタリストを最大まで入れる
export type { CurrencyEffect } from "./hand-effect";
export { effectOf, catalystTagOf, catalystFull, fillCatalyst, catalystForMod } from "./hand-effect";
// その手が打てるか (お告げ・触媒の前のカタリスト込み)・手のお告げを今の手 / 続けて打つ発現に分ける
export type { UseSpec } from "./can-use";
export { canUse, handOmens, isCatalystKey, CATALYSING_OMEN } from "./can-use";
// 手を 1 回打つ (触媒の前のカタリスト・フラクチャーで固定する MOD・骨の後の発現込み) と、発現で候補を選んで打つ
export type { HandSpec, HandResult } from "./hand-use";
export { applyHand, revealBy, ABYSSAL_ECHO_OMEN } from "./hand-use";
// 始めのアイテムを指名の MOD (段の名前の T)・ルーン・乱数の MOD の数で作る (断られたら理由を返す)
export type { StartMod, StartWith } from "./start-with";
export { startWith, START_FRACTURE_MAX } from "./start-with";
// MOD の無いマジックに 1 回足す時の候補の組 (どれか 1 つ) の付きやすさと等級の落とし方 (start-cost の式)
export type { MagicAddOdds, AddGrade } from "./magic-odds";
export { magicAddOdds, anyOfAddOdds, addGradeFor, ADD_GRADES } from "./magic-odds";
// 使い方 (hit = カレンシーで付く当たり / start = 始まりに置ける) の MOD の群れ
export { modListForUse, MOD_USE_GROUPS } from "./mod-list";
// そのアイテムのベースに差せるルーン (今のゲームに有る物、効果つき)
export { runesFor } from "./rune-choice";
// 貼り付けの MOD の素の値の文
export { modRawText } from "./item-text";
