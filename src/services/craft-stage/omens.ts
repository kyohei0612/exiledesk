/**
 * クラフトステージ: お告げと、それが掛かる手の種類 (2026-09-27、ADR-001)
 *
 * id は price-keys.json の omens キー。側のある物の意味は計算機の [[omens.ts]] (htc) と同じ (左 = プレ / 右 = サフィ)。
 * 手の種類は apply-currency.ts の kindOf。1 つの手に何枚でも重ねられる (大いなる高貴 + 左の高貴 など)。
 */
export const OMEN_FOR: Readonly<Record<string, readonly string[]>> = {
  exalt: ["OmenofSinistralExaltation", "OmenofDextralExaltation", "OmenofGreaterExaltation", "OmenofCatalysingExaltation"],
  regal: ["OmenofSinistralCoronation", "OmenofDextralCoronation"],
  alchemy: ["OmenofSinistralAlchemy", "OmenofDextralAlchemy"],
  chaos: ["OmenofWhittling", "OmenofSinistralErasure", "OmenofDextralErasure"],
  annul: ["OmenofSinistralAnnulment", "OmenofDextralAnnulment", "OmenofGreaterAnnulment", "OmenofLight"],
  essence_perfect: ["OmenofSinistralCrystallisation", "OmenofDextralCrystallisation"],
  desecrate: ["OmenofSinistralNecromancy", "OmenofDextralNecromancy", "OmenoftheSovereign", "OmenoftheLiege", "OmenoftheBlackblooded"],
  reveal: ["OmenofAbyssalEchoes"],
  vaal: ["OmenofCorruption", "OmenofPutrefaction"],
  divine: ["OmenofSanctification"],
};
/** 棚に出す順 (手の種類ごと) */
export const OMEN_SHELF: readonly string[] = Object.values(OMEN_FOR).flat();
/** 効果の規則をまだ入れていない物 (結果の表を確かめてから。棚には出すが打つと理由を返す) */
export const UNMODELLED_OMENS: readonly string[] = ["OmenofCorruption", "OmenofPutrefaction", "OmenofSanctification"];
/** 勢力のお告げ → 冒涜の MOD のタグ (エンジンの DES_BOSS_TAG と同じ) */
export const FACTION_TAG: Readonly<Record<string, string>> = {
  OmenoftheSovereign: "ulaman_mod", OmenoftheLiege: "amanamu_mod", OmenoftheBlackblooded: "kurgal_mod",
};
