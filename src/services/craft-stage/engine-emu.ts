/**
 * engine-emu.ts — エミュ (クラフト台の画面) の入口 (2026-10-22 深夜 オーナー: エンジンに足した物は要望を出した側の画面だけが使う。案は docs/org/emulator/notes/2026-10-22-entry-split-plan.md)。
 * エミュの要望で足した物を並べる。読むのはエミュの画面 (src/views/craft-stage・src/state/emulator) だけ (シミュ・チュートリアル・解析は読まない)。
 * 核 (形・打つ・読む・置き場・確率・名簿・乱数) は engine.ts から取る。シミュも欲しくなった物はブラックが決めて engine.ts へ上げる (ここと engine-sim.ts に同じ名前を並べない)。
 * エミュの画面が今入口を通さず読んでいる物 (docs/org/emu/notes/2026-10-22-engine-direct-imports.md) は、エミュ部長の要望が来た所からここへ足す。
 * ここは名前を並べるだけ (中身は元のファイル)。`export *` の束ねを作らない (engine.ts と同じ)
 */

// 持っている物を打つ前に光らせる物 (変わる候補の MOD と付く空き)
export type { UsePreview } from "./for-emu/preview";
export { previewUse } from "./for-emu/preview";
// 重みを直せる MOD の既定の重み・推定で埋めた印 (MOD 一覧の重みの札)
export { defaultWeightOf } from "./stage-tuning";
export { OVERRIDDEN } from "../htc/weight-overrides";
