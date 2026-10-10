/**
 * craft-stage-help.ts — クラフトステージの棚の詳細カードに出す「ステージでの動き」(2026-09-28、ADR-001)
 *
 * オーナー:「ステージでのカレンシー詳細カードは文字だけでいいから、どんな挙動するオーブやお告げなのか細かく書いてくれ。今簡易的だから」。
 * ゲームの公式の説明文 (currency-hover-ja.json、クライアント原本) とは別に、このステージ (= 計算機と同じ規則) で
 * **実際にどう動くか**を書く。規則の本体は services/craft-stage/apply-*.ts。ここを変えたら向こうも見る。
 */
import { ARCHITECT_DESTROY_P, INFUSER_CORRUPT_P } from "../services/craft-stage/apply-extra";
import { GNAWED_MAX_ILVL } from "../services/craft-stage/apply-currency";
import { fillModText } from "../services/htc/mod-text";
import { tierDisplayRanges } from "../services/mods/stat-scale";
import { essenceTarget } from "../services/craft-stage/apply-essence";
import { essenceLevelOf } from "../vendor/poe2htc/optimizer/cost";
import { enchantPool } from "../services/craft-stage/apply-vaal";
import { isRune, runeEffectFor, runeNameOf, runeOf, socketCapOf } from "../services/craft-stage/stage-runes";
import { ruleLines } from "../services/augment-rules";
import { maxQualityOf } from "../services/craft-stage/stage-core";
import { desecrationBoneFor } from "../vendor/poe2htc/engine/probability";
import { CHANCE_UNIQUE_P, isShard, JEWELLER_TO, QUALITY_MAX, QUALITY_STEP, QUALITY_TARGET, SHARD_TO_ORB, SHARDS_PER_ORB } from "../services/craft-stage/apply-act";
import { CURRENCY_FLOOR, type PatchData } from "../vendor/poe2htc/engine/types";
import { CATALYSTS as HTC_CATALYSTS } from "../services/htc/quality";
import { enOf } from "./craft-stage-shelf";
import type { StageItem } from "../services/craft-stage/types";
import { lang, tr } from "../i18n/lang";

/** 英語の画面か (2026-10-10 英語版) */
const isEn = (): boolean => lang.value === "en";

const FLOOR = (kind: "transmute" | "regal", s: string): string => {
  const f = CURRENCY_FLOOR[kind];
  if (isEn()) {
    const tailEn = "(groups without such a tier use their top tier; can't be used below that Item Level)";
    return s === "greater" ? `Greater: only tiers with mod level ${f.greater}+ ${tailEn}` : s === "perfect" ? `Perfect: only tiers with mod level ${f.perfect}+ ${tailEn}` : "";
  }
  const tail = "(上の段が無い系統は一番上の段。アイテムレベルが下限未満の品には使えない)";
  return s === "greater" ? `上級: 付く MOD は MOD レベル ${f.greater} 以上のティアだけ ${tail}` : s === "perfect" ? `完全: 付く MOD は MOD レベル ${f.perfect} 以上のティアだけ ${tail}` : "";
};
const strengthOf = (key: string): string => (key.endsWith("_greater") ? "greater" : key.endsWith("_perfect") ? "perfect" : "base");
const ADD = "付く MOD は、その側の普通の MOD の置き場から、付いている系統を除き、アイテムレベル以下のティアの重みで引く (計算機と同じ)";
const add = (): string => tr(ADD, "New mods are rolled by weight from that side's normal mod pool, excluding groups already on the item and tiers above the Item Level");

/** お告げの動き */
const OMEN: Record<string, string[]> = {
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
  OmenoftheSovereign: ["次の骨の発現の候補を **ウラマンの MOD だけ** にする (MOD ごとに等しく)", "武器または宝飾品だけ (防具には使えない)"],
  OmenoftheLiege: ["次の骨の発現の候補を **アマナムの MOD だけ** にする", "武器または宝飾品だけ"],
  OmenoftheBlackblooded: ["次の骨の発現の候補を **クルガルの MOD だけ** にする", "武器または宝飾品だけ"],
  OmenofPutrefaction: ["次の骨は **フラクチャー以外の MOD を全部外し**、枠いっぱい (普通 6 つ) を未発現の MOD にして **コラプト** する", "発現で出るのは普通の MOD だけ (冒涜専用の勢力の MOD は出ない)", "古びた骨でもティアの下限は掛からない"],
  OmenofAbyssalEchoes: ["次の発現で、候補 3 つを **1 回だけ引き直せる**", "引き直さなくても、その発現で使い切る"],
  OmenofCorruption: ["次のヴァールオーブの「変化なし」を外す (残り 3 つから等しく)", "アクセサリーの 4 つ目 (ソケットの代わりの変化なし) は外れない", "0.5.0 で入手できなくなった"],
  OmenoftheBlessed: ["次の神のオーブは **暗黙 MOD だけ** を振り直す (明示 MOD は変わらない)", "このステージは暗黙 MOD の数値を持たないので、打っても見た目は変わらない (神のオーブとお告げの費用だけ数える)"],
  OmenofChance: ["次の可能性のオーブは **アイテムを壊さない**", "外れた時はノーマルのまま残る (オーブは使う)"],
  OmenoftheAncients: ["次の可能性のオーブは、そのベースのユニークではなく **同じアイテムクラスのランダムなユニーク** になる", "ベースもそのユニークのベースに変わる", "可能性のお告げと重ねると壊れない"],
  OmenofSanctification: ["次の神のオーブをレアに使うと **聖別** する: MOD ごとに 0.78〜1.22 倍 (0.01 刻み) を掛けて丸める", "聖別したアイテムは、以後手を加えられない"],
};
/** お告げの動き (英語の画面) */
const OMEN_EN: Record<string, string[]> = {
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
  OmenofSinistralNecromancy: ["The next Bone (Desecration) adds the Unrevealed mod as **a prefix**"],
  OmenofDextralNecromancy: ["The next Bone (Desecration) adds the Unrevealed mod as **a suffix**"],
  OmenoftheSovereign: ["The next Bone's reveal options are **Ulaman mods only** (equal per mod)", "Weapons and jewellery only (not armour)"],
  OmenoftheLiege: ["The next Bone's reveal options are **Amanamu mods only**", "Weapons and jewellery only"],
  OmenoftheBlackblooded: ["The next Bone's reveal options are **Kurgal mods only**", "Weapons and jewellery only"],
  OmenofPutrefaction: ["The next Bone **removes all non-Fractured mods**, fills every slot (usually 6) with Unrevealed mods and **corrupts** the item", "Reveals only offer normal mods (no faction Desecrated mods)", "No tier floor even with an Ancient Bone"],
  OmenofAbyssalEchoes: ["On the next reveal, the 3 options can be **rerolled once**", "Consumed by that reveal even if you don't reroll"],
  OmenofCorruption: ["Removes the \"no change\" outcome from the next Vaal Orb (equal among the other 3)", "The 4th jewellery outcome (no change instead of a socket) stays", "No longer obtainable since 0.5.0"],
  OmenoftheBlessed: ["The next Divine Orb rerolls **only implicit mods** (explicit mods unchanged)", "Implicit values aren't tracked here, so nothing visibly changes (only the cost of the Divine Orb and Omen is counted)"],
  OmenofChance: ["The next Orb of Chance **won't destroy the item**", "On failure the item stays Normal (the orb is still used)"],
  OmenoftheAncients: ["The next Orb of Chance turns it into **a random Unique of the same Item Class**, not just this base", "The base changes to that Unique's base", "Stacked with Omen of Chance, the item isn't destroyed"],
  OmenofSanctification: ["The next Divine Orb on a Rare **sanctifies** it: each mod is multiplied by x0.78-1.22 (0.01 steps) and rounded", "Sanctified items can't be modified afterwards"],
};

/** 棚の 1 つの「ステージでの動き」(行の並び)。** で囲んだ所は強調 */
/** apply-extra.ts の物の説明 (クライアントの説明文 + 仮の値) */
const INFUSER_LINE = (ja: string) => [
  `**${ja}** の品質を上げる。上限を **最大 10% 超えられる** が、超えた時に一定確率で **コラプト** する (クライアントの説明文)`,
  `1 回で +1% (ゲームで確認)。コラプトする確率は公開されていない (**未確定**、仮に ${Math.round(INFUSER_CORRUPT_P * 100)}%。手順の outcome "corrupted" / "safe" で指定できる)`,
];
const SACRIFICE_LINE = (ja: string) => [
  `**コラプトしたレア** の ${ja} の **コラプトエンチャントを上位版に上げ**、ランダムな MOD を **1 つ消す** (クライアントの説明文)`,
  "上位版はクライアントの MOD 表の「CorruptionUpgrade…」(元のエンチャントと同じ系統)。エンチャントが無いと使えない",
];
const EXTRA_HELP: Record<string, string[]> = {
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
  `+1% per use (checked in game). The corruption chance isn't public (**unconfirmed**, assumed ${Math.round(INFUSER_CORRUPT_P * 100)}%; set it with the step outcome "corrupted" / "safe")`,
];
const SACRIFICE_LINE_EN = (en: string) => [
  `On **Corrupted Rare** ${en}: **upgrades the Corruption Enchantment** and **removes 1 random mod** (game description)`,
  "The upgrade is the \"CorruptionUpgrade…\" mod in the game's mod table (same group as the original enchantment). Can't be used without an enchantment",
];
const NOT_PUBLIC_EN = "The mapping isn't public, so mods are replaced at the same tier rank and roll position (assumption)";
const EXTRA_HELP_EN: Record<string, string[]> = {
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

export function stageHelp(key: string, data: PatchData | null, item: StageItem | null): string[] {
  const sp = specialEssence(key, item);
  return [...(sp?.notes ?? []), ...stageHelpBase(key, data, item)];
}

function stageHelpBase(key: string, data: PatchData | null, item: StageItem | null): string[] {
  if (OMEN[key]) return [...((isEn() ? OMEN_EN[key] : null) ?? OMEN[key]!), tr("押すと掛けておく (何枚でも)。次に打つ、関係する手でだけ使われる", "Click to apply (stackable). Only consumed by the next currency it affects")];
  const s = strengthOf(key);
  const kind = key.replace(/_(greater|perfect)$/, "");
  switch (kind) {
    case "transmute":
      return [tr("**ノーマル → マジック** にして MOD を 1 つ付ける", "**Normal → Magic**, adds 1 mod"), add(), FLOOR("transmute", s)].filter(Boolean);
    case "augment":
      return [tr("**マジック** で MOD が 1 つの時、空いている側に 1 つ足す (マジックはプレ 1 / サフィ 1 まで)", "On a **Magic** item with 1 mod, adds 1 mod to the open side (Magic: 1 prefix / 1 suffix)"), add(), FLOOR("transmute", s)].filter(Boolean);
    case "regal":
      return [tr("**マジック → レア** にして MOD を 1 つ足す (付いている MOD は残る)", "**Magic → Rare**, adds 1 mod (existing mods stay)"), add(), FLOOR("regal", s)].filter(Boolean);
    case "alchemy":
      return [tr("**ノーマルかマジック → レア** にして MOD を **4 つ** 付ける (マジックの MOD は付け直し)", "**Normal or Magic → Rare** with **4 mods** (Magic mods are rerolled)"), add()];
    case "exalt":
      return [tr("**レア** に MOD を 1 つ足す (プレ・サフィ合わせて空きがある時)", "Adds 1 mod to a **Rare** (needs an open prefix or suffix)"), add(), FLOOR("regal", s), tr("お告げ: 左右の高貴 (足す側) / 偉大なる高貴 (2 つ) / 触媒の高貴 (品質の種類を重く)", "Omens: Sinistral / Dextral Exaltation (side) / Greater Exaltation (2 mods) / Catalysing Exaltation (weights the quality type)")].filter(Boolean);
    case "chaos":
      return [
        tr("**レア** の MOD を 1 つ消して、1 つ足す", "Removes 1 mod from a **Rare** and adds 1"),
        tr("消すのはフラクチャー (固定) 以外から等しく 1 つ", "The removed mod is picked equally from non-Fractured mods"),
        add(),
        s === "greater" ? tr("上級: 足す MOD は MOD レベル 35 以上のティアだけ", "Greater: added mod only from tiers with mod level 35+") : s === "perfect" ? tr("完全: 足す MOD は MOD レベル 50 以上のティアだけ", "Perfect: added mod only from tiers with mod level 50+") : "",
        tr("お告げ: 削減 (一番低い MOD を消す) / 左右の抹消 (消す側)", "Omens: Whittling (removes the lowest mod) / Sinistral / Dextral Erasure (side)"),
      ].filter(Boolean);
    case "annul":
      return [tr("**マジックかレア** の MOD を 1 つ消す (フラクチャー以外から等しく)", "Removes 1 mod from a **Magic or Rare** item (equally among non-Fractured mods)"), tr("お告げ: 左右の消去 (消す側) / 光 (冒涜の MOD だけ)", "Omens: Sinistral / Dextral Annulment (side) / Light (Desecrated mod only)")];
    case "divine":
      return [tr("フラクチャー以外の MOD の **数値だけ** を、そのティアの範囲の中で振り直す (ティアは変わらない)", "Rerolls **only the values** of non-Fractured mods within their tier range (tiers don't change)"), tr("お告げ: 聖別 (0.78〜1.22 倍にして聖別。以後手を加えられない) / 祝福 (暗黙 MOD だけ振り直す)", "Omens: Sanctification (x0.78-1.22 and sanctified; no further changes) / the Blessed (rerolls implicits only)")];
    case "fracture":
      return [tr("**レア** で MOD が **4 つ以上**、まだフラクチャーが無い時", "On a **Rare** with **4+ mods** and no Fractured mod yet"), tr("MOD を 1 つ **固定 (フラクチャー)** する。どれになるかは等しく (未発現の冒涜 MOD は選ばれない)", "**Fractures** 1 random mod (equal chance; Unrevealed Desecrated mods are never picked)"), tr("フラクチャーした MOD は、カオス・消去・エッセンスでも消えない", "Fractured mods can't be removed by Chaos, Annulment or Essences")];
    case "artificer": {
      const n = item ? socketCapOf(item.base, item.cls.category) : 1;
      return [tr("マーシャル武器・ワンド・スタッフ・防具に **ソケットを 1 つ** 足す", "Adds **1 socket** to Martial Weapons, Wands, Staves and Armour"), n ? tr(`このベースは ${n} つまで (胴・両手武器 2 / ほか 1。コラプトで +1)`, `Up to ${n} on this base (Body Armour / Two Handed Weapon 2, others 1; +1 via corruption)`) : tr("このベース (アクセサリー・矢筒・フラスコ) には付けられない", "Can't be added to this base (jewellery, quivers, flasks)")];
    }
    case "vaal": {
      const pool = item ? enchantPool(item).length : 0;
      if (isEn()) {
        return [
          "**Corrupts** the item. No further changes (except reveals)",
          "One of 4 outcomes with equal chance (no public data, assumed equal):",
          "1. No change",
          "2. Rerolls 1-3 mods into new mods (Fractured mods stay)",
          `3. Adds 1 Corrupted enchantment${pool ? ` (equal among ${pool} for this base)` : ""}`,
          "4. Weapons / armour: +1 socket (can exceed the Artificer cap by 1); jewellery: no change",
        ];
      }
      return [
        "アイテムを **コラプト** する。以後手を加えられない (発現だけはできる)",
        "結果は次の 4 つから等しく 1 つ (公開の実測が無いので等分と仮定):",
        "① 変化なし",
        "② MOD を 1〜3 つ、別の新しい MOD に振り直す (フラクチャーは残る)",
        `③ ヴァールのエンチャントを 1 つ付ける${pool ? ` (このベースに付くのは ${pool} 種類から等しく)` : ""}`,
        "④ 武器・防具はソケット +1 (熟練工の上限を 1 つ超えられる)、アクセサリーは変化なし",
      ];
    }
    case "desecrate":
    case "desecrate_ancient":
    case "desecrate_altered":
    case "desecrate_gnawed": {
      const bone = item ? { jawbone: "顎の骨 (武器・矢筒)", rib: "肋骨 (防具)", collarbone: "鎖骨 (アクセサリー)" }[desecrationBoneFor(item.cls.category)] : "";
      if (isEn()) {
        const boneEn = item ? { jawbone: "Jawbone (weapons, quivers)", rib: "Rib (armour)", collarbone: "Collarbone (jewellery)" }[desecrationBoneFor(item.cls.category)] : "";
        return [
          "Adds 1 **Unrevealed Desecrated mod** to a **Rare** (only 1 Desecrated mod per item)",
          "The side is decided by the total weight of possible mods on each side. If both sides are full, it replaces a mod on that side",
          "On reveal you **pick 1 of 3 options**. Desecrated-only mods: 1 option 85% / 2 options 14% / 3 options 1% (always at least 1); the rest are normal mods by weight (no duplicate groups)",
          key === "desecrate_ancient" ? "Ancient Bone: options only from tiers with mod level 40+" : "",
          key === "desecrate_gnawed" ? `Gnawed Bone: only for **Item Level ${GNAWED_MAX_ILVL} or lower** (game data). Same options as a Preserved Bone` : "",
          key === "desecrate_altered" ? "Altered Collarbone: options also include **Otherworldly mods** (jewellery only)" : "",
          boneEn ? `Bone used for this base: ${boneEn}` : "",
          "Omens: Sinistral / Dextral Necromancy (side) / Sovereign, Liege, Blackblooded (faction) / Putrefaction (works alone: replaces all mods with up to 6 Unrevealed Desecrated mods and corrupts; other Omens stay unused) / Abyssal Echoes (reroll the reveal)",
        ].filter(Boolean);
      }
      return [
        "**レア** に **未発現の冒涜 MOD** を 1 つ付ける (冒涜の MOD はアイテムに 1 つまで)",
        "付く側は、その側で出うる MOD の重みの合計で決まる。両側が埋まっていれば、その側の MOD を 1 つ差し替える",
        "発現で **候補 3 つから 1 つ選ぶ**。冒涜専用の MOD は 1 個 85% / 2 個 14% / 3 個 1% (必ず 1 個は入る)、残りは普通の MOD から重みで (系統の被りなし)",
        key === "desecrate_ancient" ? "古びた骨: 候補は MOD レベル 40 以上のティアだけ" : "",
        key === "desecrate_gnawed" ? `噛み切られた骨: **アイテムレベル ${GNAWED_MAX_ILVL} 以下** にだけ使える (クライアントの表)。候補は保存された骨と同じ` : "",
        key === "desecrate_altered" ? "変質した鎖骨: 候補に **異界の MOD** も入る (アクセサリーだけ)" : "",
        bone ? `このベースで使う骨: ${bone}` : "",
        "お告げ: 左右のネクロマンシー (側) / 支配者・君主・ブラックブラッド (勢力で絞る) / 腐食 (単体で効く: 全部の MOD を未発現の冒涜 MOD 最大 6 個に置き換えてコラプト。一緒に掛けた他のお告げは使わずに残る) / アビスの反響 (発現の引き直し)",
      ].filter(Boolean);
    }
  }
  // アクト中に落ちる物 (2026-09-28、要望 ⑧。出典は apply-act.ts)
  if (key in QUALITY_TARGET) {
    const t = QUALITY_TARGET[key]!;
    const st = QUALITY_STEP;
    if (isEn()) {
      return [
        `Raises the quality of **${t.en}** (max ${QUALITY_MAX}%)${key === "etcher" ? ". For wands, staves and sceptres (Blacksmith's Whetstone is for martial weapons)" : ""}${key === "whetstone" ? ". Martial weapons = bows, crossbows, maces, quarterstaves, spears, talismans (not wands, sceptres or staves)" : ""}`,
        `+${key === "gemcutter" ? st.gem : st.item}% per use (any rarity; checked in game)`,
        key === "whetstone" ? "Each 1% quality gives 1% more Physical Damage (Quality on poe2db)" : key === "scrap" ? "Each 1% quality gives 1% more Armour / Evasion / Energy Shield" : key === "bauble" ? "Each 1% quality gives 1% more Life / Mana recovery" : "Quality effects differ per gem",
      ];
    }
    return [
      `**${t.ja}** の品質を上げる (上限 ${QUALITY_MAX}%)${key === "etcher" ? "。ワンド・スタッフ・セプター用 (砥石はマーシャル武器用)" : ""}${key === "whetstone" ? "。マーシャル武器 = 弓・クロスボウ・メイス・クォータースタッフ・槍・タリスマン (ワンド・セプター・スタッフは不可)" : ""}`,
      `1 回で +${key === "gemcutter" ? st.gem : st.item}% (レアリティに関係なし。ゲームで確認)`,
      key === "whetstone" ? "品質 1% ごとに物理ダメージが 1% 増える (poe2db の Quality)" : key === "scrap" ? "品質 1% ごとにアーマー・回避力・エナジーシールドが 1% 増える" : key === "bauble" ? "品質 1% ごとにライフ・マナの回復量が 1% 増える" : "品質の効果はジェムごとに違う",
    ];
  }
  // 2026-09-29 に足した物 (apply-extra.ts)。確率は公開されていないので仮
  const extra = (isEn() ? EXTRA_HELP_EN[key] : null) ?? EXTRA_HELP[key];
  if (extra) return extra;
  if (key === "wisdom") return [tr("**未鑑定** のアイテムを鑑定する (隠れていた MOD が見える)", "Identifies an **unidentified** item (reveals its mods)"), tr("未鑑定のアイテムには、ほかのカレンシーは打てない", "Other currency can't be used on unidentified items")];
  if (key === "chance") {
    if (isEn()) {
      return [
        "Turns a **Normal** item into a **Unique** or **destroys** it (game description)",
        `The Unique chance isn't public (**unconfirmed**, assumed ${Math.round(CHANCE_UNIQUE_P * 100)}%; set the result with the step outcome)`,
        "The Unique is picked equally from this base's Uniques (no public weights)",
      ];
    }
    return [
      "**ノーマル** のアイテムを **ユニーク** にするか、**壊す** (クライアントの説明文)",
      `ユニークになる確率は公開されていない (**未確定**、仮に ${Math.round(CHANCE_UNIQUE_P * 100)}%。手順の outcome で結果を指定できる)`,
      "なるユニークはそのベースのユニークから等しく 1 つ (重みは公開値なし)",
    ];
  }
  if (JEWELLER_TO[key]) {
    const n = JEWELLER_TO[key];
    if (isEn()) return [`Sets a **Skill Gem** to have **${n} Support Gem Sockets** (all at once)`, `Only for gems with fewer than ${n} Support Gem Sockets`, "Can't be used on equipment"];
    return [`**スキルジェム** のサポート枠を **${n} つ** にする (1 つずつではなく一気に)`, `サポート枠が ${n} つ未満のジェムにだけ使える`, "装備には使えない"];
  }
  // ルーン・ソウルコア等 (2026-10-03): 決まり (部位・外せるか・置き換えられるか・数) は説明文から作った表 (augment-rules.ts) のまま
  if (isRune(key)) {
    const eff = item ? runeEffectFor(runeOf(key)!, item.cls.category) : null;
    return [
      ...(eff ? [] : item ? [tr("この部位には効き目が無い", "No effect on this item class")] : []),
      ...ruleLines(runeNameOf(key)),
      tr("空きソケットが無い時は、はまっている物と置き換える (ソケットの絵を押すとそのソケット、アイテムを押すと左から最初の置き換えられる物)", "With no empty socket it replaces a socketed one (click a socket to target it, or the item for the first replaceable one from the left)"),
    ];
  }
  if (isShard(key) && isEn()) return [`**${SHARDS_PER_ORB} shards** make 1 ${SHARD_TO_ORB[key] === "transmute" ? "Orb of Transmutation" : SHARD_TO_ORB[key] === "regal" ? "Regal Orb" : SHARD_TO_ORB[key] === "artificer" ? "Artificer's Orb" : "Orb of Chance"} (game description)`, "Can't be used on items", "In video steps, 1 step = pick up 1 shard"];
  if (isShard(key)) return [`**${SHARDS_PER_ORB} 個** 集めると ${SHARD_TO_ORB[key] === "transmute" ? "変成" : SHARD_TO_ORB[key] === "regal" ? "王者" : SHARD_TO_ORB[key] === "artificer" ? "熟練工" : "可能性"}のオーブ 1 個になる (クライアントの説明文)`, "アイテムには使えない", "動画の手順では 1 手 = 1 個拾う"];
  if (key.startsWith("catalyst_")) {
    const max = item ? maxQualityOf(item) : 20;
    if (isEn()) {
      return [
        `Raises the quality of **Rings and Amulets** **to the cap in one go (${max}% on this item)**. Counted as +1% per Catalyst (same as the calculator; in game 1-2% each, mostly 1%)`,
        "The quality type comes from the Catalyst. **Using a different type restarts quality from 0**",
        "With Omen of Catalysing Exaltation, mods of that type become more likely (quality is consumed). Stacked with Greater Exaltation, both mods are weighted",
      ];
    }
    return [
      // 上限はベースの最大品質 + MOD の「品質の最大値 +N%」(ブリーチのエッセンス) なので「このベースで」ではなく「今のアイテムで」
      `**指輪・アミュレット** の品質を **1 回で上限 (今のアイテムで ${max}%) まで** 上げる。使う数は 1 個 +1% で数える (計算機と同じ。ゲームは 1 個で 1〜2%、ほとんど 1%)`,
      "品質の種類はカタリストで決まる。**別の種類を使うと品質は 0 からやり直し**",
      "触媒の高貴のお告げと組むと、その種類の MOD が付きやすくなる (品質は使い切る)。大いなる高貴のお告げも重ねると 2 つとも付きやすくなる",
    ];
  }
  if (key.startsWith("essence:") && data && item) {
    const t = essenceTarget(data, item, key);
    if (!t) return [tr("このベースには使えないエッセンス", "This Essence can't be used on this base")];
    const tier = t.level === "perfect" ? t.mod.tiers[0] : t.mod.tiers.find((x) => essenceLevelOf(String(x.name ?? "")) === t.level) ?? t.mod.tiers[0];
    // 深淵のエッセンス (2026-10-03)
    if (t.mod.family === "EssenceAbyss" && isEn()) {
      return [
        "Removes 1 mod from a **Rare** and adds the **Mark of the Abyssal Lord** on that side",
        "The next Bone (Desecration) always **replaces the Mark** with an Unrevealed Desecrated mod. Tier floor mod level 33 (assumed: the description only says \"higher tier\")",
        "Can't be used while a Desecrated mod is present (overwrite it first with an Essence or Alloy). The Mark is a crafted mod too (2 allowed with Astrid's Creativity)",
        "Omens: Sinistral / Dextral Crystallisation (removed side = Mark side)",
      ];
    }
    if (t.mod.family === "EssenceAbyss") {
      return [
        "**レア** の MOD を 1 つ消して、消した側に **深淵の王の印** を付ける",
        "次の骨 (冒涜) は必ず **印を置き換えて** 未発現の冒涜 MOD になる。段の下限 MOD レベル 33 (仮: 説明文は「より高い段」だけ)",
        "冒涜の MOD がある間は打てない (先にエッセンス・合金で上書き)。印もクラフト MOD (アストリッドの創造性で 2 つまで持てる)",
        "お告げ: 左右の結晶化 (消す側 = 印の付く側)",
      ];
    }
    if (t.level === "perfect" && isEn()) {
      return [
        "Removes 1 mod from a **Rare**, then adds this mod",
        "The removed mod is picked equally from non-Fractured mods. If this mod's side is full, it removes from that side",
        "Only 1 Essence mod per item (2 with Astrid's Creativity). Can't be used if the same group is already present",
        `Required Item Level: ${tier?.ilvl ?? "?"}`,
        "Omens: Sinistral / Dextral Crystallisation (removed side)",
      ];
    }
    if (isEn()) {
      return [
        "**Magic → Rare** and adds this mod (existing mods stay)",
        "Only 1 Essence mod per item. Can't be used if the same group is already present",
        `Required Item Level: ${tier?.ilvl ?? "?"}`,
        "Use a Perfect Essence on Rares",
      ];
    }
    if (t.level === "perfect") {
      return [
        "**レア** の MOD を 1 つ消してから、この MOD を付ける",
        "消すのはフラクチャー以外から等しく 1 つ。付ける側が埋まっていれば、その側から消す",
        "エッセンスの MOD はアイテムに 1 つまで (アストリッドの創造性で 2 つ)。同じ系統が付いていると打てない",
        `必要なアイテムレベル: ${tier?.ilvl ?? "?"}`,
        "お告げ: 左右の結晶化 (消す側)",
      ];
    }
    return [
      "**マジック → レア** にして、この MOD を付ける (付いている MOD は残る)",
      "エッセンスの MOD はアイテムに 1 つまで。同じ系統が付いていると打てない",
      `必要なアイテムレベル: ${tier?.ilvl ?? "?"}`,
      "レアに使うにはパーフェクトエッセンス",
    ];
  }
  return [];
}

/**
 * 付く MOD だけ (カードの上に色を変えて箇条書き、2026-10-05 オーナー「エッセンスは特に説明欄が見づらいから、ルーンとか特定の MOD が付く奴は
 * 分かりやすい色にそこだけ変えよう」「付く MOD だけ箇条書きで書いてあげたい」)。今のアイテムの部位での物。無い物は空
 */
/**
 * エッセンスの値が普通の MOD (同じ系統・同じ側) のどのティアに当たるか (2026-10-05 オーナー「エッセンスはティアも一応欲しいな、
 * ここからここまでのティアみたいな、もしティア間で被るなら」)。1 つ目の値の範囲が重なるティアを全部。T1 が一番上
 */
function essenceTierSpan(data: PatchData, item: StageItem, mod: { family: string; type: string }, range: readonly number[] | undefined): string | null {
  if (!range || range.length < 2) return null;
  const lo = Math.min(range[0]!, range[1]!), hi = Math.max(range[0]!, range[1]!);
  const pool = item.cls.pools.normal;
  const ids = mod.type === "prefix" ? pool.prefixes : pool.suffixes;
  for (const id of ids) {
    const m = data.mods.get(id);
    if (!m || m.family !== mod.family || !m.tiers.length) continue;
    const n = m.tiers.length;
    const hit: number[] = [];
    m.tiers.forEach((t, i) => {
      const r = t.ranges[0];
      if (!r || r.length < 2) return;
      const a = Math.min(r[0]!, r[1]!), b = Math.max(r[0]!, r[1]!);
      if (a <= hi && lo <= b) hit.push(n - i);
    });
    if (!hit.length) {
      const top = m.tiers[n - 1]!.ranges[0];
      return top && lo > Math.max(top[0]!, top[1]!) ? tr(`普通の MOD の T1 (全 ${n} 段) より上`, `Above normal T1 (of ${n} tiers)`) : null;
    }
    const best = Math.min(...hit), worst = Math.max(...hit);
    return tr(`普通の MOD の ${best === worst ? `T${best}` : `T${worst}〜T${best}`} 相当 (全 ${n} 段)`, `≈ normal ${best === worst ? `T${best}` : `T${worst}-T${best}`} (of ${n} tiers)`);
  }
  return null;
}

export function stageAdds(key: string, data: PatchData | null, item: StageItem | null): { head: string; lines: string[]; tier?: string | null } | null {
  if (!item) return null;
  if (isRune(key)) {
    const eff = runeEffectFor(runeOf(key)!, item.cls.category);
    return eff ? { head: tr(`付く MOD (${eff.catJa})`, `Adds (${eff.cat})`), lines: (isEn() ? eff.en : eff.ja).split("\n").map((x) => x.trim()).filter(Boolean) } : null;
  }
  if (key.startsWith("essence:") && data) {
    const t = essenceTarget(data, item, key);
    if (!t || t.mod.family === "EssenceAbyss") return null;
    const tier = t.level === "perfect" ? t.mod.tiers[0] : t.mod.tiers.find((x) => essenceLevelOf(String(x.name ?? "")) === t.level) ?? t.mod.tiers[0];
    let text = fillModText(t.mod, tier ? tierDisplayRanges(tier) : []);
    // 値の幅が無い固定の MOD (ブリーチの「+20% to Maximum Quality」等) は # が残るので、英語の文の数字で埋める
    if (text.includes("#")) {
      const nums = [...(t.mod.text ?? "").matchAll(/\d+(?:\.\d+)?/g)].map((x) => x[0]);
      text = text.replace(/#/g, () => nums.shift() ?? "#");
    }
    return { head: tr(`付く MOD (${t.side === "prefix" ? "プレフィックス" : "サフィックス"})`, `Adds (${t.side === "prefix" ? "Prefix" : "Suffix"})`), lines: text.split("\n").filter(Boolean), tier: tier ? essenceTierSpan(data, item, t.mod, tier.ranges[0]) : null };
  }
  return null;
}

/**
 * MOD の文を棚のボタン用に短く (数値・「増加する」等を外す)。「マナ自動回復レートが#%増加する」→「マナ自動回復」、「火耐性 #%」→「火耐性」、
 * 「#から#の火ダメージを追加する」→「追加火ダメージ」。2026-10-05 オーナー「金額の所、エッセンスは代わりに付く MOD を箇条書きで。マナ自動回復ならマナ自動とかで」
 */
export function shortMod(text: string): string {
  // 英語の文 (英語の画面): 数値・増加などを外して残りを短く (2026-10-10 英語版)
  if (!/[぀-ヿ一-鿿]/.test(text)) return text.split(/\s*\/\s*|\n/).map(shortModEn).filter(Boolean).join(" / ");
  return text.split(/\s*\/\s*|\n/).map((raw) => {
    let s = raw.replace(/\([^)]*\)/g, "#").replace(/\d+(\.\d+)?/g, "#").trim();
    let m: RegExpExecArray | null;
    if ((m = /^#から#の(.+)を追加する$/.exec(s))) return `追加${m[1]}`;
    if ((m = /^(.*?)ダメージの#%を追加(.+)として獲得する$/.exec(s))) return `${m[1] ? `${m[1].replace(/の$/, "")}の` : ""}${m[2]}獲得`;
    if ((m = /^受けた(.*)ダメージの#%をライフとして回収する$/.exec(s))) return `${m[1] || ""}被ダメ回収`;
    if ((m = /^#から#の(.+)$/.exec(s))) return m[1]!;
    s = s.replace(/^プレイヤーに対する(ヒットは)?/, "").replace(/の#%?を/g, "を").replace(/(が|を)?#?%?(増加|減少|上昇)する$/, "").replace(/#%?(の|個の)?/g, "").replace(/[#%+]/g, "").replace(/レート$/, "").replace(/\s+/g, "").trim();
    return s;
  }).filter(Boolean).join(" / ");
}
/** 英語の MOD の 1 行を短く (「Adds # to # Fire Damage」→「Added Fire Damage」、「#% increased Mana Regeneration Rate」→「Mana Regeneration Rate」) */
function shortModEn(raw: string): string {
  const s = raw.replace(/\([^)]*\)/g, "#").replace(/[+-]?\d+(\.\d+)?/g, "#").replace(/\s+/g, " ").trim();
  let m: RegExpExecArray | null;
  if ((m = /^Adds # to # (.+?)( to Attacks| to Spells)?$/i.exec(s))) return `Added ${m[1]}`;
  if ((m = /^Gain #%? of (.+?) as Extra (.+)$/i.exec(s))) return `Extra ${m[2]}`;
  return s
    .replace(/^[#%+]+ ?/, "")
    .replace(/^(increased|reduced|more|less|to|of) /i, "")
    .replace(/ (increased|reduced)$/i, "")
    .replace(/#%?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 特殊なエッセンス (レアだけ・MOD を 1 つ消して付ける物) の説明 (2026-10-05 オーナー「錯乱ちょっと違うかもな、ランダムなノータブルパッシブ付くし
 * 鎧だけやな。説明しっかり作ろか、細かい所」)。部位は同梱の MOD の表 (perfect_essence) で確かめた。
 * short = 棚の短い名前、groups = カードの「使える装備と付く MOD」(クライアントの文が壊れている・無い物だけ差し替え)、notes = 動きの先頭に足す
 */
const SPECIAL_ESSENCE: Record<string, { short?: string; groups?: Array<{ h: string; l: string[] }>; notes: string[] }> = {
  "Essence of Delirium": {
    short: "ランダムノータブル",
    // クライアントの文は「0 を割り当てる」(ノード名の差し込みが空) なので書き直す
    groups: [{ h: "鎧 (胴の防具) だけ", l: ["ランダムなノータブルパッシブスキルを割り当てる (プレフィックス)"] }],
    notes: [
      "**レアの胴の防具 (鎧) だけ**。他の部位には使えない",
      "付くのは「ランダムなノータブルパッシブスキルを割り当てる」。どのノータブルかはパッシブツリーのノータブルからランダムで、**選べない** (重みは公開値なし)。ゲームでは付いた後「○○を割り当てる」とノード名が出る",
      "数値の無い MOD なので神のオーブで変わらない",
    ],
  },
  "Essence of Horror": {
    short: "オーグメント効果",
    notes: [
      "**レアの手袋・靴だけ**",
      "サフィックスに「ソケットされているオーグメントの効果が 60% 増加する」(固定値)。はめたルーン・ソウルコア等の効き目が 1.6 倍になるので、ソケットの多い物ほど得",
    ],
  },
  "Essence of Hysteria": {
    notes: ["**レアだけ**。部位ごとに付く MOD が違う (下の「使える装備と付く MOD」)。武器には使えない"],
  },
  "Essence of Insanity": {
    short: "コラプトでエンチャ2",
    notes: [
      "**レアのベルトだけ**",
      "サフィックスに「コラプト時に、アイテムは 2 個のエンチャントを獲得する」。ヴァールのオーブでエンチャントが付く結果になった時、1 個ではなく 2 個付く",
    ],
  },
  "Essence of the Breach": {
    notes: ["**レアの指輪・アミュレットだけ**", "プレフィックスに「品質の最大値 +20%」。カタリストで品質を 40% まで盛れる (触媒の MOD がその分強くなる)"],
  },
  "Essence of the Abyss": {
    short: "深淵の王の印",
    groups: [{ h: "防具・装飾品・ベルト など", l: ["アビサルロードの紋章 (深淵の王の印)。次の骨で冒涜 MOD に置き換わる"] }],
    notes: [],
  },
};
/** SPECIAL_ESSENCE の英語 (英語の画面) */
const SPECIAL_ESSENCE_EN: Record<string, { short?: string; groups?: Array<{ h: string; l: string[] }>; notes: string[] }> = {
  "Essence of Delirium": {
    short: "Random Notable",
    groups: [{ h: "Body Armour only", l: ["Allocates a random Notable Passive Skill (prefix)"] }],
    notes: [
      "**Rare Body Armour only**. Can't be used on other slots",
      "Adds \"Allocates a random Notable Passive Skill\". Which Notable is random from the passive tree and **can't be chosen** (no public weights). In game the node name shows after it's added",
      "Has no values, so Divine Orbs don't change it",
    ],
  },
  "Essence of Horror": {
    short: "Augment effect",
    notes: [
      "**Rare Gloves and Boots only**",
      "Suffix \"60% increased effect of Socketed Augment Items\" (fixed). Socketed runes / Soul Cores become 1.6x as strong, so more sockets = more value",
    ],
  },
  "Essence of Hysteria": {
    notes: ["**Rares only**. The added mod depends on the slot (see \"Usable items and added mods\" below). Can't be used on weapons"],
  },
  "Essence of Insanity": {
    short: "2 enchants on corrupt",
    notes: [
      "**Rare Belts only**",
      "Suffix \"On Corruption, Item gains two Enchantments\". When a Vaal Orb adds an enchantment, it adds 2 instead of 1",
    ],
  },
  "Essence of the Breach": {
    notes: ["**Rare Rings and Amulets only**", "Prefix \"+20% to Maximum Quality\". Catalysts can then push quality to 40% (catalyst mods get stronger accordingly)"],
  },
  "Essence of the Abyss": {
    short: "Mark of the Abyssal Lord",
    groups: [{ h: "Armour, jewellery, belts etc.", l: ["Mark of the Abyssal Lord. Replaced by a Desecrated mod with the next Bone"] }],
    notes: [],
  },
};
export function specialEssence(key: string, item: StageItem | null) {
  if (!key.startsWith("essence:")) return null;
  const en = enOf(key, item);
  return (isEn() ? SPECIAL_ESSENCE_EN[en] : null) ?? SPECIAL_ESSENCE[en] ?? null;
}

/** 棚のボタンの値段の代わりに出す、付く MOD の短い名前 (エッセンス・カタリスト)。無い物は null (値段のまま) */
export function shelfTag(key: string, data: PatchData | null, item: StageItem | null): string[] | null {
  const sp = specialEssence(key, item);
  if (sp?.short) return [sp.short];
  if (key.startsWith("essence:")) {
    const a = stageAdds(key, data, item);
    return a ? a.lines.map(shortMod) : null;
  }
  if (key.startsWith("catalyst_")) {
    const en = enOf(key, item);
    const c = HTC_CATALYSTS.find((x) => x.en === en);
    if (c && isEn()) { const e = /\((.+?)( Modifiers)?\)/.exec(c.label.en); return e ? [e[1]!] : null; }
    const m = c ? /\((.+?)(モッド)?\)/.exec(c.label.ja) : null;
    return m ? [`${m[1]}系`] : null;
  }
  return null;
}
