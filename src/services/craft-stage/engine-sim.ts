/**
 * engine-sim.ts — シミュの入口 (2026-10-22 深夜 オーナー: エンジンに足した物は要望を出した側の画面だけが使う。案は docs/org/emulator/notes/2026-10-22-entry-split-plan.md)。
 * シミュの要望で足した、核 (engine.ts) に無い機能を並べる (中身は for-sim/)。読むのはシミュ・チュートリアル・解析 (エミュは読まない)。
 * 核の関数の言い換え・包み直しはここに置かない (シミュが engine.ts の元の関数を直に呼ぶ。2026-10-23 オーナー「元からエンジンにあった物をシミュが勝手に自前で作っただけ」)。
 * 線引き: 結果が変わる物 (付き方・確率・固定される MOD・打てるか) はエンジン、見え方と操作は画面 (オーナー 10-23)。
 * エミュも欲しくなった物はブラックが決めて engine.ts へ上げる。ここは名前を並べるだけ。`export *` の束ねを作らない (engine.ts と同じ)
 */

// カタリストを品質が最大になるまで打つ (何個打ったかも。核の applyCurrency は 1 回 = 1 個で、最大まで数える手は無い)
export { catalystTagOf, catalystFull, fillCatalyst } from "./for-sim/hand-effect";
// MOD の無いマジックに 1 回足す時の候補の組 (どれか 1 つ) の付きやすさと等級の落とし方 (start-cost の式。核の addHitOdds は 1 つの狙いだけ)
export type { MagicAddOdds, AddGrade } from "./for-sim/magic-odds";
export { magicAddOdds, anyOfAddOdds, addGradeFor, ADD_GRADES } from "./for-sim/magic-odds";
