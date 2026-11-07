/**
 * お告げの名前 (price-keys.json の omens キー) のうち、エンジンが名前で指す物の定数 (2026-11-07 ジン jin-base、E-27)。
 * 側のあるお告げは名前で指さず omenFor(手の種類, 側) で引く (omen-layer.ts)。中身はどれも OmenSpec の key と同じ (見張り tests/omen-layer.test.ts)。
 * 何も読み込まない (土台の stage-tuning.ts からも読むので、読み込みの輪を作らない)
 */
export const OMEN_KEY = {
  /** 光のお告げ (消去は冒涜の MOD だけ、E-68) */
  light: "OmenofLight",
  /** アビスの反響 (発現の候補をもう 1 組、E-69) */
  echoes: "OmenofAbyssalEchoes",
  /** 大いなる高貴 (2 つ付ける、E-31) */
  greater: "OmenofGreaterExaltation",
  /** 触媒の高貴 (品質の種類の MOD を重く、E-32) */
  catalysing: "OmenofCatalysingExaltation",
  /** 腐食 (単体で効く、E-69) */
  putrefaction: "OmenofPutrefaction",
  /** 削減 (MOD レベルの一番低い物を消す、E-33) */
  whittling: "OmenofWhittling",
  /** 聖別 (神のオーブを聖別に置き換える、E-35) */
  sanctification: "OmenofSanctification",
  /** 祝福 (暗黙だけ振り直す、E-39) */
  blessed: "OmenoftheBlessed",
} as const;
