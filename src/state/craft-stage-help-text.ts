/**
 * craft-stage-help-text.ts — 棚の詳細カードの説明の表 (お告げ・apply-extra.ts の物)。craft-stage-help.ts から分けた (2026-10-16、500 行の決まり)
 */
import { ARCHITECT_DESTROY_P, INFUSER_CORRUPT_P } from "../services/craft-stage/apply-extra";


/** お告げの動き */
export const OMEN: Record<string, string[]> = {
  OmenofSinistralExaltation: ["次の高貴なオーブは **プレフィックスだけ** に足す", "プレフィックスが埋まっていると打てない"],
  OmenofDextralExaltation: ["次の高貴なオーブは **サフィックスだけ** に足す", "サフィックスが埋まっていると打てない"],
  OmenofGreaterExaltation: ["次の高貴なオーブは MOD を **2 つ** 足す (空きが 1 つなら 1 つ)", "左右の高貴のお告げと重ねられる"],
  // 大いなる高貴と重ねた時は 2 つとも重く引く (クラフト配信者 (やマン先生) の説明、2026-10-09 オーナーが確認済みの決まり)
  OmenofCatalysingExaltation: ["次の高貴なオーブは、品質 (カタリスト) の種類に合う MOD を **重く** 引く (品質が高いほど重い。品質 1.5% で約 1.7 倍・40% で約 7.6 倍、指輪 200 個の実測から)", "**大いなる高貴のお告げと重ねると、足す 2 つとも重く引く**", "打つと品質を全部使い切って 0 に戻る", "品質が無いと打てない (指輪・アミュレットだけ)"],
  OmenofSinistralCoronation: ["次の王者のオーブは **プレフィックスだけ** に足す"],
  OmenofDextralCoronation: ["次の王者のオーブは **サフィックスだけ** に足す"],
  OmenofSinistralAlchemy: ["次の錬金術のオーブは **プレフィックスを上限まで** (3 つ) 付け、残りをサフィックスに"],
  OmenofDextralAlchemy: ["次の錬金術のオーブは **サフィックスを上限まで** (3 つ) 付け、残りをプレフィックスに"],
  OmenofWhittling: ["次のカオスオーブは、**MOD レベルが一番低い** MOD を消す (同じなら等しく)", "足す方はいつもどおり"],
  OmenofSinistralErasure: ["次のカオスオーブは **プレフィックスから** 消す", "足す側は選べない (空いている側の重みで決まる)"],
  OmenofDextralErasure: ["次のカオスオーブは **サフィックスから** 消す", "足す側は選べない"],
  OmenofSinistralAnnulment: ["次の消去のオーブは **プレフィックスから** 消す"],
  OmenofDextralAnnulment: ["次の消去のオーブは **サフィックスから** 消す"],
  OmenofGreaterAnnulment: ["次の消去のオーブは MOD を **2 つ** 消す", "左右の消去のお告げと重ねられる"],
  OmenofLight: ["次の消去のオーブは **冒涜の MOD だけ** を消す (未発現でも)", "冒涜の MOD が無いと打てない"],
  OmenofSinistralCrystallisation: ["次のパーフェクト / コラプトのエッセンスは **プレフィックスから** 消してから付ける", "足す側が埋まっていて、お告げが反対側を指すと打てない"],
  OmenofDextralCrystallisation: ["次のパーフェクト / コラプトのエッセンスは **サフィックスから** 消してから付ける"],
  OmenofSinistralNecromancy: ["次の骨 (冒涜) は未発現の MOD を **プレフィックス** に付ける"],
  OmenofDextralNecromancy: ["次の骨 (冒涜) は未発現の MOD を **サフィックス** に付ける"],
  OmenoftheSovereign: ["次の骨の発現の候補を **ウラマンの MOD だけ** にする (MOD ごとに等しく)", "武器・宝飾品・矢筒 (防具・ジュエルには使えない。矢筒は説明文に無いが Craft of Exile でも使える)"],
  OmenoftheLiege: ["次の骨の発現の候補を **アマナムの MOD だけ** にする", "武器・宝飾品・矢筒"],
  OmenoftheBlackblooded: ["次の骨の発現の候補を **クルガルの MOD だけ** にする", "武器・宝飾品・矢筒"],
  OmenofPutrefaction: ["次の骨は **フラクチャー以外の MOD を全部外し**、枠いっぱい (普通 6 つ) を未発現の MOD にして **コラプト** する", "発現で出るのは普通の MOD だけ (冒涜専用の勢力の MOD は出ない)", "古びた骨でもティアの下限は掛からない"],
  OmenofAbyssalEchoes: ["次の発現で、候補 3 つを **1 回だけ引き直せる**", "引き直さなくても、その発現で使い切る"],
  OmenoftheBlessed: ["次の神のオーブは **暗黙 MOD だけ** を振り直す (明示 MOD は変わらない)"],
  OmenofSanctification: ["次の神のオーブをレアに使うと **聖別** する: MOD ごとに 0.78〜1.22 倍 (0.01 刻み) を掛けて丸める", "聖別したアイテムは、以後手を加えられない"],
};
/** お告げの動き (英語の画面) */
export const OMEN_EN: Record<string, string[]> = {
  OmenofSinistralExaltation: ["The next Exalted Orb adds **only a prefix**", "Can't be used when prefixes are full"],
  OmenofDextralExaltation: ["The next Exalted Orb adds **only a suffix**", "Can't be used when suffixes are full"],
  OmenofGreaterExaltation: ["The next Exalted Orb adds **2 mods** (1 if only 1 slot is open)", "Stacks with Sinistral / Dextral Exaltation"],
  OmenofCatalysingExaltation: ["The next Exalted Orb rolls mods matching the Catalyst quality type **with higher weight** (more quality = heavier; ~1.7x at 1.5%, ~7.6x at 40%, measured from 200 rings)", "**Stacked with Greater Exaltation, both added mods are weighted**", "Consumes all quality (back to 0)", "Needs quality (Rings and Amulets only)"],
  OmenofSinistralCoronation: ["The next Regal Orb adds **only a prefix**"],
  OmenofDextralCoronation: ["The next Regal Orb adds **only a suffix**"],
  OmenofSinistralAlchemy: ["The next Orb of Alchemy fills **prefixes to the max** (3), the rest as suffixes"],
  OmenofDextralAlchemy: ["The next Orb of Alchemy fills **suffixes to the max** (3), the rest as prefixes"],
  OmenofWhittling: ["The next Chaos Orb removes the mod with the **lowest mod level** (ties are equal)", "The added mod rolls as usual"],
  OmenofSinistralErasure: ["The next Chaos Orb removes **a prefix**", "The added side can't be chosen (decided by open-side weights)"],
  OmenofDextralErasure: ["The next Chaos Orb removes **a suffix**", "The added side can't be chosen"],
  OmenofSinistralAnnulment: ["The next Orb of Annulment removes **a prefix**"],
  OmenofDextralAnnulment: ["The next Orb of Annulment removes **a suffix**"],
  OmenofGreaterAnnulment: ["The next Orb of Annulment removes **2 mods**", "Stacks with Sinistral / Dextral Annulment"],
  OmenofLight: ["The next Orb of Annulment removes **only the Desecrated mod** (even if Unrevealed)", "Can't be used without a Desecrated mod"],
  OmenofSinistralCrystallisation: ["The next Perfect / Corrupted Essence removes **a prefix** before adding its mod", "Can't be used if the Essence's side is full and the Omen points to the other side"],
  OmenofDextralCrystallisation: ["The next Perfect / Corrupted Essence removes **a suffix** before adding its mod"],
  OmenofSinistralNecromancy: ["The next Abyssal Bone (Desecration) adds the Unrevealed mod as **a prefix**"],
  OmenofDextralNecromancy: ["The next Abyssal Bone (Desecration) adds the Unrevealed mod as **a suffix**"],
  OmenoftheSovereign: ["The next Abyssal Bone's reveal options are **Ulaman mods only** (equal per mod)", "Weapons, jewellery and quivers (not armour or jewels)"],
  OmenoftheLiege: ["The next Abyssal Bone's reveal options are **Amanamu mods only**", "Weapons, jewellery and quivers"],
  OmenoftheBlackblooded: ["The next Abyssal Bone's reveal options are **Kurgal mods only**", "Weapons, jewellery and quivers"],
  OmenofPutrefaction: ["The next Abyssal Bone **removes all non-Fractured mods**, fills every slot (usually 6) with Unrevealed mods and **corrupts** the item", "Reveals only offer normal mods (no faction Desecrated mods)", "No tier floor even with an Ancient Jawbone / Rib / Collarbone"],
  OmenofAbyssalEchoes: ["On the next reveal, the 3 options can be **rerolled once**", "Consumed by that reveal even if you don't reroll"],
  OmenoftheBlessed: ["The next Divine Orb rerolls **only implicit mods** (explicit mods unchanged)"],
  OmenofSanctification: ["The next Divine Orb on a Rare **sanctifies** it: each mod is multiplied by x0.78-1.22 (0.01 steps) and rounded", "Sanctified items can't be modified afterwards"],
};

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
    `壊れる ${Math.round(ARCHITECT_DESTROY_P * 100)}%。足すエンチャントは今のと同じグループの物は出ない。手順の outcome "destroyed" / "changed" で指定できる`,
  ],
  cultivation: [
    "**コラプトしたユニーク** を、**同じ種類の別のユニーク** に変える (クライアントの説明文)",
    "ヴァールユニークは「MOD を最大 2 つ置き換える」だが、ユニークの MOD の表が無いのでこのステージでは扱わない",
  ],
  siphoner: ["**コラプトしたレアの宝飾品** にキル閾値を付ける。閾値に届くとランダムな MOD を吸って、他の MOD の数値が上がる (クライアントの説明文)", "閾値の数や上がり幅は公開されていないので、このステージでは付いたことだけ出す"],
  mirror: ["アイテムの **ミラー化した写し** を作る (クライアントの説明文)", "ミラーしたアイテムにはもう何も使えない"],
  hinekora: ["次に使うカレンシーの **結果を予見** できるようにする (クライアントの説明文)", "アイテムを何かで変えると予見は消える"],
  extraction: ["装備を **壊して**、差してある (ソケットバウンドでない) オーグメントを取り戻す (クライアントの説明文)"],
  flux_fire: ["アイテム上の全ての **冷気・雷耐性** の MOD を同じ強さの **火耐性** に変える (クライアントの説明文)", "対応のさせ方は公開されていないので、同じ段の順位・段の中の同じ位置で置き換える (仮定)"],
  flux_cold: ["アイテム上の全ての **火・雷耐性** の MOD を同じ強さの **冷気耐性** に変える (クライアントの説明文)", "対応のさせ方は公開されていないので、同じ段の順位・段の中の同じ位置で置き換える (仮定)"],
  flux_lightning: ["アイテム上の全ての **火・冷気耐性** の MOD を同じ強さの **雷耐性** に変える (クライアントの説明文)", "対応のさせ方は公開されていないので、同じ段の順位・段の中の同じ位置で置き換える (仮定)"],
  flux_chaos: ["アイテム上の全ての **火・冷気・雷耐性** の MOD を同じ強さの **混沌耐性** に変える (クライアントの説明文)", "対応のさせ方は公開されていないので、同じ段の順位・段の中の同じ位置で置き換える (仮定)"],
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
const NOT_PUBLIC_EN = "The mapping isn't public, so mods are replaced at the same tier rank and roll position (assumption)";
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
    `Destroy chance ${Math.round(ARCHITECT_DESTROY_P * 100)}%. The new enchantment can't be from the same group as the current one. Set it with the step outcome "destroyed" / "changed"`,
  ],
  cultivation: [
    "Turns a **Corrupted Unique** into **another Unique of the same Item Class** (game description)",
    "Vaal Uniques \"replace up to 2 modifiers\", but Unique mod tables aren't available, so that isn't handled here",
  ],
  siphoner: ["Adds a kill threshold to **Corrupted Rare jewellery**. When reached it absorbs a random mod and raises the others (game description)", "Threshold and gains aren't public, so only the threshold itself is shown here"],
  mirror: ["Creates a **Mirrored copy** of the item (game description)", "Mirrored items can't be modified"],
  hinekora: ["Lets you **foresee the result** of the next currency you use (game description)", "Changing the item in any way clears the foresight"],
  extraction: ["**Destroys** the equipment and recovers its (non socket-bound) augments (game description)"],
  flux_fire: ["Turns all **Cold / Lightning Resistance** mods on the item into **Fire Resistance** of the same strength (game description)", NOT_PUBLIC_EN],
  flux_cold: ["Turns all **Fire / Lightning Resistance** mods on the item into **Cold Resistance** of the same strength (game description)", NOT_PUBLIC_EN],
  flux_lightning: ["Turns all **Fire / Cold Resistance** mods on the item into **Lightning Resistance** of the same strength (game description)", NOT_PUBLIC_EN],
  flux_chaos: ["Turns all **Fire / Cold / Lightning Resistance** mods on the item into **Chaos Resistance** of the same strength (game description)", NOT_PUBLIC_EN],
};
