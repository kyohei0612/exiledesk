/**
 * omens.ts — 側のあるお告げの id と、ブリーチの MOD の系統 (2026-09-26)
 *
 * シミュレーター・1 手ずつ・自動の組み立て・画面で同じ表を使う (前は 7 か所に写してあった)。
 * プレ = 左側 (Sinistral)、サフィ = 右側 (Dextral)。画面に出す名前は [[labels.ts]] の `jaOfOmen` で引く。
 */
export const OMEN = {
  /** 高貴のお告げ = 次の高貴がその側に足す */
  exalt: { prefix: "OmenofSinistralExaltation", suffix: "OmenofDextralExaltation" },
  /** 消去のお告げ = 次の消去がその側だけを消す */
  annul: { prefix: "OmenofSinistralAnnulment", suffix: "OmenofDextralAnnulment" },
  /** 抹消のお告げ = 次のカオスが消すのをその側だけに (足す側は選べない。poe2db で確認 2026-09-24) */
  erasure: { prefix: "OmenofSinistralErasure", suffix: "OmenofDextralErasure" },
  /** 結晶化のお告げ = 次のパーフェクトエッセンスが消すのをその側だけに */
  crystallisation: { prefix: "OmenofSinistralCrystallisation", suffix: "OmenofDextralCrystallisation" },
  /** ネクロマンシーのお告げ = 次の冒涜をその側に */
  necromancy: { prefix: "OmenofSinistralNecromancy", suffix: "OmenofDextralNecromancy" },
} as const;

/** ブリーチのエッセンスが付ける「品質の最大値 +20%」の系統 */
export const BREACH_FAMILY = "LocalMaximumQuality";
