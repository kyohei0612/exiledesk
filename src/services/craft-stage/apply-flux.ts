/**
 * apply-flux.ts — 耐性のフラックス (2026-10-04 オーナー「カレンシーフルチェック」で、相場に値段があって棚に無かった物)
 *
 * クライアントの説明文: 火炎フラックス「アイテム上の全ての冷気および雷耐性モッドを同等な火耐性モッドに変換する」、
 * 冷却 = 火・雷 → 冷気、雷撃 = 火・冷気 → 雷、虚無 = 火・冷気・雷 → 混沌。
 * 変え方はクライアントの Expedition2ElementalModConversions の耐性の行 (element-convert.ts)。
 * 例: 火耐性 Lv 60 (胴の T3) → 混沌耐性 Lv 68 (T2)、冒涜専用の火 & 混沌耐性 → 混沌耐性 Lv 81 (T1、アイテムレベルに関わらず)。
 * 2026-10-10 要望で分かった (前はアルダーのルーンと同じ「同じ段の順位」で、T3 → T3 にしていた)。表の MOD とエンジンの段は 名前・Lv・数値の幅で突き合わせる。
 * 表に無い MOD (エッセンスで付けた耐性・ベース専用の耐性) も普通の MOD と同じに変わる (2026-10-17 オーナー、element-convert.ts)。数値は段の範囲の中の同じ位置。変える物が無ければ打てない。
 * 使い切りで、ソケットは要らない。コラプト・聖別の後は打てない (普通のカレンシーと同じ)
 * 打つ処理は説明文の分解 (spec/other-specs.ts の FLUX_SPECS、2026-10-17 ADR-004 の残りで移した)。ここは種類の表だけ
 */

export const FLUX: Record<string, { element: string; eats: string[] }> = {
  flux_fire: { element: "fire", eats: ["cold", "lightning"] },
  flux_cold: { element: "cold", eats: ["fire", "lightning"] },
  flux_lightning: { element: "lightning", eats: ["fire", "cold"] },
  flux_chaos: { element: "chaos", eats: ["fire", "cold", "lightning"] },
};
export const isFlux = (key: string): boolean => key in FLUX;
