/**
 * presets.ts — お試し用の実物 2 つ (2026-09-22)
 *
 * 画面の動きを見るための種で、**ここに貼り付けたのと同じ物を手で入れても同じ結果になります**。
 *
 * オーナー指示 2026-09-23:「太陽のアミュとスタッフ消していい。とりあえず方針固まるまで
 * テストは指輪で行おうかな」。**方針が固まるまでこの 1 つだけ**にする。
 */

export interface Preset {
  id: string;
  label: string;
  text: string;
}

const NL = String.fromCharCode(10);

export const PRESETS: readonly Preset[] = [
  {
    id: "ring",
    label: "死体の円環 (ニーモニックリング)",
    text: [
      "アイテムクラス: 指輪",
      "レアリティ: レア",
      "死体の円環",
      "ニーモニックリング",
      "--------",
      "品質 (マナモッド): +40%",
      "--------",
      "アイテムレベル: 80",
      "--------",
      "最大マナが8%増加する",
      "--------",
      "スペルのマナコスト効率が29%増加する",
      "最大マナ +247",
      "知性 +30",
      "全ての元素耐性 +13%",
      "最大マナが8%増加する",
      "キャストスピードが20%増加する",
    ].join(NL),
  },
];

/**
 * 0 から組む見本 (ベースから選ぶ道)。オーナー 2026-09-23:「最初から 0 の状態からやりたい。
 * いまネタバレありだからね (貼り付けだと完成品が見える)」。
 * 狙いと段は死体の円環と同じ。マナコスト効率 (樹 MOD) は固定済みで買う前提なので、プレの枠を 1 つ使うだけ。
 */
export interface ZeroPreset {
  id: string;
  label: string;
  baseType: string;
  itemLevel: number;
  /** modId と段 (`mod.tiers` の添字。大きいほど良い) */
  picks: Array<{ modId: string; tierIndex: number }>;
  quality: 20 | 40;
  qualityTag: string | null;
  fixedPrefix: number;
  fixedSuffix: number;
}

export const ZERO_PRESETS: readonly ZeroPreset[] = [
  {
    id: "ring-zero",
    label: "ニーモニックリング (0 から / 樹 MOD は固定済みで買う)",
    baseType: "Mnemonic Ring",
    itemLevel: 80,
    picks: [
      { modId: "Rings/IncreasedMana", tierIndex: 11 },
      { modId: "Rings/PerfectEssence_MaximumManaIncreasePercent", tierIndex: 0 },
      { modId: "Rings/Intelligence", tierIndex: 6 },
      { modId: "Rings/AllResistances", tierIndex: 3 },
      { modId: "Rings/IncreasedCastSpeed", tierIndex: 3 },
    ],
    quality: 40,
    qualityTag: "mana",
    fixedPrefix: 1,
    fixedSuffix: 0,
  },
];
