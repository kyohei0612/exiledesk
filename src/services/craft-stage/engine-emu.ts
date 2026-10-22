/**
 * engine-emu.ts — エミュ (クラフト台の画面) の入口 (2026-10-22 深夜 オーナー: エンジンに足した物は要望を出した側の画面だけが使う。案は docs/org/emulator/notes/2026-10-22-entry-split-plan.md)。
 * エミュの要望で足した物を並べる。読むのはエミュの画面 (src/views/craft-stage・src/state/emulator) だけ (シミュ・チュートリアル・解析は読まない)。
 * 核 (形・打つ・読む・置き場・確率・名簿・乱数) は engine.ts から取る。シミュも欲しくなった物はブラックが決めて engine.ts へ上げる (ここと engine-sim.ts に同じ名前を並べない)。
 * エミュの画面が今入口を通さず読んでいる物 (docs/org/emu/notes/2026-10-22-engine-direct-imports.md) は、エミュ部長の要望が来た所からここへ足す。
 * ここは名前を並べるだけ (中身は元のファイル)。`export *` の束ねを作らない (engine.ts と同じ)
 */

// 持っている物を打つ前に光らせる物 (変わる候補の MOD と付く空き)
export type { UsePreview } from "./spec/preview";
export { previewUse } from "./spec/preview";
// そのお告げを今掛けられるか (掛けると打てない・意味が無いお告げの理由。お告げの欄の灰色)
export { omenBlock } from "./omen-block";
// お告げの下の設定 (触媒の高貴の品質 1% ごとの倍率) と、重みを直せる MOD の既定の重み・推定で埋めた印
export { tunedCatalysingMultiplier, CATALYSING_PER_PCT, defaultWeightOf } from "./stage-tuning";
export { OVERRIDDEN } from "../htc/weight-overrides";
// 聖別の数値の下限・上限 (聖別の帯)
export { SANCTIFY_MIN, SANCTIFY_MAX } from "./apply-vaal";
