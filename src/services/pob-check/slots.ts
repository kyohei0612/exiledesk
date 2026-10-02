/**
 * slots.ts — PoB の装備の欄の名前 → 日本語 (火力チェック)。欄の名前を日本語にする所はここ 1 つ
 * (usePobCheck の変更の記録と ItemSlotCard の見出しで同じ表を使う)
 */
const SLOT_JA: Record<string, string> = {
  "Weapon 1": "武器",
  "Weapon 2": "オフハンド",
  Helmet: "兜",
  "Body Armour": "胴",
  Gloves: "手袋",
  Boots: "靴",
  Amulet: "アミュレット",
  "Ring 1": "指輪 (左)",
  "Ring 2": "指輪 (右)",
  "Ring 3": "指輪 3",
  Belt: "ベルト",
  "Flask 1": "ライフフラスコ",
  "Flask 2": "マナフラスコ",
};

/**
 * 欄の日本語。jewel = ツリーのジュエルの穴、weaponSet = 武器の欄だけ (1 = I / 2 = II)。
 * 「Weapon 1 Swap」は 2 つ目の武器セットなので「武器 (II)」
 */
export function slotJa(slot: string, opts: { jewel?: boolean; weaponSet?: number } = {}): string {
  if (opts.jewel || slot.startsWith("Jewel")) return "ジュエル";
  const charm = /^Charm (\d+)$/.exec(slot);
  if (charm) return `チャーム ${charm[1]}`;
  const swap = /^(Weapon [12]) Swap$/.exec(slot);
  if (swap) return `${SLOT_JA[swap[1]!]} (II)`;
  return (SLOT_JA[slot] ?? slot) + (opts.weaponSet ? " (I)" : "");
}
