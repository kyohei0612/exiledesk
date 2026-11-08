/**
 * craft-stage-help-text.ts — 棚の詳細カードの説明の表 (お告げ・apply-extra.ts の物)。craft-stage-help.ts から分けた (2026-10-16、500 行の決まり)
 */
import { ARCHITECT_DESTROY_P, INFUSER_CORRUPT_P } from "../../services/craft-stage/apply-extra";

/** お告げの動き (日英) はエンジンの omenHelp (spec/omen-words.ts、2026-11-07 ジン部長に移した) */

/** 棚の 1 つの「ステージでの動き」(行の並び)。** で囲んだ所は強調 */
/** apply-extra.ts の物の説明 (クライアントの説明文 + 仮の値) */
const INFUSER_LINE = (ja: string) => [
  `**${ja}** の品質を上げる。上限を **最大 10% 超えられる** が、超えた時に一定確率で **コラプト** する (クライアントの説明文)`,
  `1 回で +1% (ゲームで確認)。上限を超えた時にコラプトする確率は **${Math.round(INFUSER_CORRUPT_P * 100)}%** (公式の値は出ていない。コミュニティの報告で約 ${Math.round(INFUSER_CORRUPT_P * 100)}%)`,
];
const SACRIFICE_LINE = (ja: string) => [
  `**コラプトしたレア** の ${ja} の **コラプトエンチャントを上位版に上げ**、ランダムな MOD を **1 つ消す** (クライアントの説明文)`,
  "上位版はクライアントの MOD 表の「CorruptionUpgrade…」(元のエンチャントと同じ系統)。エンチャントが無いと使えない",
];
export const EXTRA_HELP: Record<string, string[]> = {
  vaal_infuser_jewellery: INFUSER_LINE("指輪・アミュレット"),
  vaal_infuser_armour: INFUSER_LINE("防具"),
  vaal_infuser_martial: INFUSER_LINE("マーシャル武器"),
  vaal_infuser_caster: INFUSER_LINE("ワンド・スタッフ・セプター"),
  sacrifice_jewellery: SACRIFICE_LINE("アミュレット・指輪・ベルト"),
  sacrifice_armour: SACRIFICE_LINE("防具"),
  sacrifice_weapon: SACRIFICE_LINE("武器・矢筒"),
  architect: [
    "**コラプトした装備** (レアリティは問わない) に **2 つ目のエンチャントを足すか、壊す** (説明文・poe2wiki)",
    `壊れる ${Math.round(ARCHITECT_DESTROY_P * 100)}% (公式の値は出ていない、poe2wiki)。足すエンチャントは今のと同じグループの物は出ない。手順の outcome "destroyed" / "changed" で指定できる`,
  ],
  cultivation: [
    "**コラプトしたユニーク** を、**同じ種類の別のユニーク** に変える (クライアントの説明文)",
    "ヴァールユニークは「MOD を最大 2 つ置き換える」だが、ユニークの MOD の表が無いのでこのステージでは扱わない",
  ],
  siphoner: ["**コラプトしたレアの宝飾品** にキル閾値を付ける。閾値に届くとランダムな MOD を吸って、他の MOD の数値が上がる (クライアントの説明文)", "閾値の数や上がり幅は公開されていないので、このステージでは付いたことだけ出す"],
  mirror: ["アイテムの **ミラー化した写し** を作る (クライアントの説明文)", "ミラーしたアイテムにはもう何も使えない"],
  hinekora: ["次に使うカレンシーの **結果を予見** できるようにする (クライアントの説明文)", "アイテムを何かで変えると予見は消える"],
  extraction: ["装備を **壊して**、差してある (ソケットバウンドでない) オーグメントを取り戻す (クライアントの説明文)"],
  flux_fire: ["アイテム上の全ての **冷気・雷耐性** の MOD を同じ強さの **火耐性** に変える (クライアントの説明文)", "対応はゲームの変換表のとおり (段の中の同じ位置の数値に)。エッセンスで付けた耐性も同じように変わる"],
  flux_cold: ["アイテム上の全ての **火・雷耐性** の MOD を同じ強さの **冷気耐性** に変える (クライアントの説明文)", "対応はゲームの変換表のとおり (段の中の同じ位置の数値に)。エッセンスで付けた耐性も同じように変わる"],
  flux_lightning: ["アイテム上の全ての **火・冷気耐性** の MOD を同じ強さの **雷耐性** に変える (クライアントの説明文)", "対応はゲームの変換表のとおり (段の中の同じ位置の数値に)。エッセンスで付けた耐性も同じように変わる"],
  flux_chaos: ["アイテム上の全ての **火・冷気・雷耐性** の MOD を同じ強さの **混沌耐性** に変える (クライアントの説明文)", "対応はゲームの変換表のとおり (段の中の同じ位置の数値に)。エッセンスで付けた耐性も同じように変わる"],
};
/** EXTRA_HELP の英語 (英語の画面) */
const INFUSER_LINE_EN = (en: string) => [
  `Raises the quality of **${en}**. Can go **up to 10% over the cap**, but has a chance to **corrupt** the item when it does (game description)`,
  `+1% per use (checked in game). Chance to corrupt when going over the cap: **${Math.round(INFUSER_CORRUPT_P * 100)}%** (no official value; about ${Math.round(INFUSER_CORRUPT_P * 100)}% per community reports)`,
];
const SACRIFICE_LINE_EN = (en: string) => [
  `On **Corrupted Rare** ${en}: **upgrades the Corruption Enchantment** and **removes 1 random mod** (game description)`,
  "The upgrade is the \"CorruptionUpgrade…\" mod in the game's mod table (same group as the original enchantment). Can't be used without an enchantment",
];
const FLUX_TABLE_EN = "Converted by the game's conversion table (same roll position within the tier). Essence-made resistances convert the same way";
export const EXTRA_HELP_EN: Record<string, string[]> = {
  vaal_infuser_jewellery: INFUSER_LINE_EN("Rings and Amulets"),
  vaal_infuser_armour: INFUSER_LINE_EN("Armour"),
  vaal_infuser_martial: INFUSER_LINE_EN("Martial Weapons"),
  vaal_infuser_caster: INFUSER_LINE_EN("Wands, Staves and Sceptres"),
  sacrifice_jewellery: SACRIFICE_LINE_EN("Amulets, Rings and Belts"),
  sacrifice_armour: SACRIFICE_LINE_EN("Armour"),
  sacrifice_weapon: SACRIFICE_LINE_EN("Weapons and Quivers"),
  architect: [
    "On **Corrupted equipment** (any rarity): **adds a second enchantment or destroys the item** (game description, poe2wiki)",
    `Destroy chance ${Math.round(ARCHITECT_DESTROY_P * 100)}% (no official value; poe2wiki). The new enchantment can't be from the same group as the current one. Set it with the step outcome "destroyed" / "changed"`,
  ],
  cultivation: [
    "Turns a **Corrupted Unique** into **another Unique of the same Item Class** (game description)",
    "Vaal Uniques \"replace up to 2 modifiers\", but Unique mod tables aren't available, so that isn't handled here",
  ],
  siphoner: ["Adds a kill threshold to **Corrupted Rare jewellery**. When reached it absorbs a random mod and raises the others (game description)", "Threshold and gains aren't public, so only the threshold itself is shown here"],
  mirror: ["Creates a **Mirrored copy** of the item (game description)", "Mirrored items can't be modified"],
  hinekora: ["Lets you **foresee the result** of the next currency you use (game description)", "Changing the item in any way clears the foresight"],
  extraction: ["**Destroys** the equipment and recovers its (non socket-bound) augments (game description)"],
  flux_fire: ["Turns all **Cold / Lightning Resistance** mods on the item into **Fire Resistance** of the same strength (game description)", FLUX_TABLE_EN],
  flux_cold: ["Turns all **Fire / Lightning Resistance** mods on the item into **Cold Resistance** of the same strength (game description)", FLUX_TABLE_EN],
  flux_lightning: ["Turns all **Fire / Cold Resistance** mods on the item into **Lightning Resistance** of the same strength (game description)", FLUX_TABLE_EN],
  flux_chaos: ["Turns all **Fire / Cold / Lightning Resistance** mods on the item into **Chaos Resistance** of the same strength (game description)", FLUX_TABLE_EN],
};
