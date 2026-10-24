/**
 * engine-sim.ts — シミュの入口 (2026-10-22 深夜 オーナー: エンジンに足した物は要望を出した側の画面だけが使う。案は docs/org/emulator/notes/2026-10-22-entry-split-plan.md)。
 * シミュの要望で足した、核 (engine.ts) に無い機能を並べる (中身は engine-sim/)。読むのはシミュ・チュートリアル・解析 (エミュは読まない)。
 * 核の関数の言い換え・包み直しはここに置かない (シミュが engine.ts の元の関数を直に呼ぶ。2026-10-23 オーナー「元からエンジンにあった物をシミュが勝手に自前で作っただけ」)。
 * 線引き: 結果が変わる物 (付き方・確率・固定される MOD・打てるか) はエンジン、見え方と操作は画面 (オーナー 10-23)。
 * エミュも欲しくなった物はブラックが決めて engine.ts へ上げる。ここは名前を並べるだけ。`export *` の束ねを作らない (engine.ts と同じ)
 */

// カタリストを品質が最大になるまで打つ (何個打ったかも。核の applyCurrency は 1 回 = 1 個で、最大まで数える手は無い)
export { catalystTagOf, catalystFull, fillCatalyst } from "./engine-sim/hand-effect";
// MOD の無いマジックに 1 回足す時の候補の組 (どれか 1 つ) の付きやすさと等級の落とし方 (start-cost の式。核の addHitOdds は 1 つの狙いだけ)
export type { MagicAddOdds, AddGrade } from "./engine-sim/magic-odds";
export { magicAddOdds, anyOfAddOdds, addGradeFor, ADD_GRADES } from "./engine-sim/magic-odds";
// スパムの道 (増強・カオス・高貴) で始めのアイテムから狙いに着くまでの平均の使った物と着いた割合 (核の route-race の routeRun と同じ打ち方。シミュのツリーのベースの値段・解析君)
export type { SpamCounts, SpamTarget } from "./engine-sim/spam-counts";
export { spamCounts } from "./engine-sim/spam-counts";
// 1 手の行き先の一覧 (消える・付く・未発現・フラクチャーの枝ごとの割合と打った後のアイテム)。枝が STEP_OUTCOMES_MAX を超える手 (錬金など 3 つ以上足す) は数え上げない
export type { StepOutcome } from "./engine-sim/outcomes";
export { stepOutcomes, stepOutcomesOrTooMany, STEP_OUTCOMES_MAX } from "./engine-sim/outcomes";
// エッセンスの見出しの文 (チュートリアルの動画)
export { essenceNameEn, headingHits } from "./engine-sim/essence-parts";

// シミュ・チュートリアル・解析が読んでいた物 (2026-10-23 エンジンの仕分け、付け替えの対応表 docs/org/emulator/notes/2026-10-23-sim-import-map.md)
export { NEGATIVE_WORDS } from "./stage-core";
export { ALL_OMEN_SPECS } from "./spec/run-spec";
export { factionCandidates } from "./spec/parts";
export { armourReduction, esTimeline, attackRow, deflectChance, evadeChance, KIND_COLOR, KIND_JA, layersOf } from "./defence";
// フラクチャーの候補から始めのアイテム (候補のどれかが ✦ のレア + 外れ 3) と、狙いを付けられる所まで付けた形 (枠を超えた残りを返す)。オーナーの決め 10-23
export type { TierMod } from "./engine-sim/start-fracture";
export { fractureStart, placeMods } from "./engine-sim/start-fracture";
// 完成形の狙いの組にもう 1 つ足せるか (枠・系統・アイテムレベル・冒涜 1 つまで・クラフト MOD の上限。足せなければ理由の文、10-24 シミュ部長 19 本目)
export { goalBlock } from "./engine-sim/start-fracture";
// ベースを替えた時に狙い・始まりの MOD を新しいベースの同じ MOD・段へ読み替える (部位ごとに id と段の数が違う。オーナー 10-24)
export type { CarriedAims } from "./engine-sim/carry-aims";
export { carryAims } from "./engine-sim/carry-aims";
