/**
 * _htc-test-prices.mjs — 検算で使う固定の相場 (2026-09-23 の相場、神 = 506 高貴)
 *
 * 取引所・相場は叩かない。値段の違いで検算の結果が揺れないように固定で持つ。
 */
export const D = 506;
const div = (v) => v * D;
export const prices = {
  currency: {
    divine: D, chaos: div(0.128), chaos_greater: div(0.377), chaos_perfect: div(8.252),
    exalt: div(0.002), exalt_greater: div(0.009), exalt_perfect: div(2.958), annul: div(0.730),
    "essence:breach": div(1.307),
    catalyst_life: div(0.021), catalyst_mana: div(0.047), catalyst_defences: div(0.022), catalyst_physical: div(0.017),
    catalyst_fire: div(0.064), catalyst_cold: div(0.049), catalyst_lightning: div(0.055), catalyst_chaos: div(0.030),
    catalyst_attack: div(0.372), catalyst_caster: div(0.968), catalyst_speed: div(0.351), catalyst_attribute: div(0.021),
    catalyst_minion: div(0.054),
    desecrate: div(0.338), desecrate_ancient: div(5.75),
    "essence:perfect:Rings/PerfectEssence_MaximumManaIncreasePercent": div(0.034),
  },
  omens: {
    OmenofCatalysingExaltation: div(0.057), OmenofDextralExaltation: div(0.033), OmenofSinistralExaltation: div(0.069),
    OmenofDextralErasure: div(9.516), OmenofSinistralErasure: div(16.286),
    // 消去のお告げ (消去用。前は消去の値段に抹消 = カオス用の値を使っていた)。2026-09-24 アプリの相場
    OmenofDextralAnnulment: div(10.124), OmenofSinistralAnnulment: div(18.144),
    OmenofSinistralCrystallisation: div(0.384), OmenofDextralCrystallisation: div(0.431),
    OmenofWhittling: div(12.336), OmenofLight: div(7.687), OmenofSinistralNecromancy: div(0.003),
    OmenofDextralNecromancy: div(0.006), OmenofAbyssalEchoes: div(0.188),
    // 偉大なる高貴のお告げ (1 回で 2 つ足す)。2026-09-24 アプリの相場
    OmenofGreaterExaltation: div(0.017),
  },
};
