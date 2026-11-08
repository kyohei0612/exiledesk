/**
 * omen-words.ts — お告げの効き方の説明 (日英) と棚の一言 (日英) (2026-11-07 ジン jin-base3、デザイン部長 design-own の頼み。オーナー「全て」= 説明文の数字・効き方もエンジンから)。
 * 前は画面 (state/for-share/craft-stage-help-text.ts の OMEN / OMEN_EN、ShelfButton.vue の OMEN_TAG) が手で持っていた文をここへ移した。
 * 数字は決まりの関数から (触媒の高貴の倍率 = htc/catalysing-multiplier.ts、聖別の幅 = stage-tuning.ts)。側の一言はお告げの層の効き目 (omenSideOf) から作る。
 * 今のゲームに無いお告げ (REMOVED_OMENS) も、説明の窓で名前を引いた時のために残す。** で囲んだ所は強調 (画面がそのまま描く)
 */
import { CATALYSING_OVER_RATIO, CATALYSING_PER_PCT, catalysingMultiplier } from "../../htc/catalysing-multiplier";
import { BASE_MAX_QUALITY } from "../../htc/quality";
import { SANCTIFY_MAX, SANCTIFY_MIN } from "../stage-tuning";
import { omenSideOf } from "./omen-layer";
import { OMEN_KEY } from "./omen-keys";

/** 触媒の高貴の数字 (説明文に出す丸め) */
const CAT = {
  per: CATALYSING_PER_PCT,
  over: +(CATALYSING_PER_PCT * CATALYSING_OVER_RATIO).toFixed(2),
  at20: `${BASE_MAX_QUALITY}%`,
  x20: +catalysingMultiplier(BASE_MAX_QUALITY).toFixed(1),
  x45: Math.round(catalysingMultiplier(45)),
};
/** 聖別の倍率の幅 (×100 の値) */
const SAN_JA = `${SANCTIFY_MIN / 100}〜${SANCTIFY_MAX / 100}`;
const SAN_EN = `x${SANCTIFY_MIN / 100}-${SANCTIFY_MAX / 100}`;

/** 結晶化のお告げが効く物 (説明文の「コラプトのエッセンス」が何か分からない、2026-10-16 初心者の目での点検)。合金はオーナーがゲームで確認済み */
const CRYSTAL_ALSO = "コラプトのエッセンス = **ヒステリー・狂気・戦慄・錯乱のエッセンス**。**合金** (適応の合金など) にも効く";
const CRYSTAL_ALSO_EN = "Corrupted Essences = **Hysteria, Insanity, Horror and Delirium**. Also works with **Alloys** (Adaptive Alloy and so on)";

/** お告げの動き (日本語の画面) */
const HELP_JA: Readonly<Record<string, readonly string[]>> = {
  OmenofSinistralExaltation: ["次の高貴なオーブは **プレフィックスだけ** に足す", "プレフィックスが埋まっていると打てない"],
  OmenofDextralExaltation: ["次の高貴なオーブは **サフィックスだけ** に足す", "サフィックスが埋まっていると打てない"],
  OmenofGreaterExaltation: ["次の高貴なオーブは MOD を **2 つ** 足す (空きが 1 つなら 1 つ)", "左右の高貴のお告げと重ねられる"],
  // 大いなる高貴と重ねた時は 2 つとも重く引く (クラフト配信者 (やマン先生) の説明、2026-10-09 オーナーが確認済みの決まり)
  OmenofCatalysingExaltation: [`次の高貴なオーブは、品質 (カタリスト) の種類に合う MOD を **重く** 引く。倍率は 1 + ${CAT.per} × 品質 (**${CAT.at20} で ${CAT.x20} 倍**)、${CAT.at20} を超えた分は 1% ごとに +${CAT.over} (45% で ${CAT.x45} 倍。Craft of Exile の式)`, "**大いなる高貴のお告げと重ねると、足す 2 つとも重く引く** (クラフト配信者の説明。公式の値は出ていない)", "打つと品質を全部使い切って 0 に戻る", "品質が無いと打てない (指輪・アミュレットだけ)"],
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
  OmenofSinistralCrystallisation: ["次のパーフェクト / コラプトのエッセンスは **プレフィックスから** 消してから付ける", CRYSTAL_ALSO, "足す側が埋まっていて、お告げが反対側を指すと打てない"],
  OmenofDextralCrystallisation: ["次のパーフェクト / コラプトのエッセンスは **サフィックスから** 消してから付ける", CRYSTAL_ALSO],
  OmenofSinistralNecromancy: ["次の骨 (冒涜) は未発現の MOD を **プレフィックス** に付ける"],
  OmenofDextralNecromancy: ["次の骨 (冒涜) は未発現の MOD を **サフィックス** に付ける"],
  OmenoftheSovereign: ["次の骨の発現の候補を **ウラマンの MOD だけ** にする (MOD ごとに等しく)", "武器・宝飾品・矢筒 (防具・ジュエルには使えない。矢筒は説明文に無いが Craft of Exile でも使える)"],
  OmenoftheLiege: ["次の骨の発現の候補を **アマナムの MOD だけ** にする", "武器・宝飾品・矢筒"],
  OmenoftheBlackblooded: ["次の骨の発現の候補を **クルガルの MOD だけ** にする", "武器・宝飾品・矢筒"],
  OmenofPutrefaction: ["次の骨は **フラクチャー以外の MOD を全部外し**、枠いっぱい (普通 6 つ) を未発現の MOD にして **コラプト** する", "発現で出るのは普通の MOD だけ (冒涜専用の勢力の MOD は出ない)", "古びた骨でもティアの下限は掛からない"],
  OmenofAbyssalEchoes: ["次の発現で、候補 3 つを **1 回だけ引き直せる**", "引き直さなくても、その発現で使い切る"],
  OmenoftheBlessed: ["次の神のオーブは **暗黙 MOD だけ** を振り直す (明示 MOD は変わらない)"],
  OmenofSanctification: [`次の神のオーブをレアに使うと **聖別** する: 数値を振り直してから、MOD ごとに ${SAN_JA} 倍 (0.01 刻み) を掛けて丸める (段の上限を超えることもある)`, "聖別したアイテムは、以後手を加えられない"],
};
/** お告げの動き (英語の画面) */
const HELP_EN: Readonly<Record<string, readonly string[]>> = {
  OmenofSinistralExaltation: ["The next Exalted Orb adds **only a prefix**", "Can't be used when prefixes are full"],
  OmenofDextralExaltation: ["The next Exalted Orb adds **only a suffix**", "Can't be used when suffixes are full"],
  OmenofGreaterExaltation: ["The next Exalted Orb adds **2 mods** (1 if only 1 slot is open)", "Stacks with Sinistral / Dextral Exaltation"],
  OmenofCatalysingExaltation: [`The next Exalted Orb rolls mods matching the Catalyst quality type **with higher weight**: 1 + ${CAT.per} × quality (**${CAT.x20}x at ${CAT.at20}**), +${CAT.over} per 1% above ${CAT.at20} (${CAT.x45}x at 45%; the Craft of Exile formula)`, "**Stacked with Greater Exaltation, both added mods are weighted** (from a crafting streamer; no official value)", "Consumes all quality (back to 0)", "Needs quality (Rings and Amulets only)"],
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
  OmenofSinistralCrystallisation: ["The next Perfect / Corrupted Essence removes **a prefix** before adding its mod", CRYSTAL_ALSO_EN, "Can't be used if the Essence's side is full and the Omen points to the other side"],
  OmenofDextralCrystallisation: ["The next Perfect / Corrupted Essence removes **a suffix** before adding its mod", CRYSTAL_ALSO_EN],
  OmenofSinistralNecromancy: ["The next Abyssal Bone (Desecration) adds the Unrevealed mod as **a prefix**"],
  OmenofDextralNecromancy: ["The next Abyssal Bone (Desecration) adds the Unrevealed mod as **a suffix**"],
  OmenoftheSovereign: ["The next Abyssal Bone's reveal options are **Ulaman mods only** (equal per mod)", "Weapons, jewellery and quivers (not armour or jewels)"],
  OmenoftheLiege: ["The next Abyssal Bone's reveal options are **Amanamu mods only**", "Weapons, jewellery and quivers"],
  OmenoftheBlackblooded: ["The next Abyssal Bone's reveal options are **Kurgal mods only**", "Weapons, jewellery and quivers"],
  OmenofPutrefaction: ["The next Abyssal Bone **removes all non-Fractured mods**, fills every slot (usually 6) with Unrevealed mods and **corrupts** the item", "Reveals only offer normal mods (no faction Desecrated mods)", "No tier floor even with an Ancient Jawbone / Rib / Collarbone"],
  OmenofAbyssalEchoes: ["On the next reveal, the 3 options can be **rerolled once**", "Consumed by that reveal even if you don't reroll"],
  OmenoftheBlessed: ["The next Divine Orb rerolls **only implicit mods** (explicit mods unchanged)"],
  OmenofSanctification: [`The next Divine Orb on a Rare **sanctifies** it: values are rerolled, then each mod is multiplied by ${SAN_EN} (0.01 steps) and rounded (can exceed the tier's range)`, "Sanctified items can't be modified afterwards"],
};

/** 側の無いお告げの一言 (側のお告げはお告げの層の効き目から作る、tagOf) */
const TAG: Readonly<Record<string, readonly [string, string]>> = {
  [OMEN_KEY.greater]: ["2 つ付く", "Adds 2"], [OMEN_KEY.catalysing]: ["品質で重く", "Quality-weighted"],
  [OMEN_KEY.light]: ["冒涜を消す", "Removes desecrated"], [OMEN_KEY.whittling]: ["最低を消す", "Removes lowest"],
  OmenoftheSovereign: ["ウラマン", "Ulaman"], OmenoftheLiege: ["アマナム", "Amanamu"], OmenoftheBlackblooded: ["クルガル", "Kurgal"],
  [OMEN_KEY.putrefaction]: ["全部冒涜", "All desecrated"], [OMEN_KEY.echoes]: ["引き直し", "Reroll"],
};

/** お告げの効き方の説明 (行の並び、日英)。知らないお告げは null */
export function omenHelp(key: string): { ja: readonly string[]; en: readonly string[] } | null {
  const ja = HELP_JA[key];
  return ja ? { ja, en: HELP_EN[key] ?? ja } : null;
}
/**
 * 棚のお告げのアイコンの下の一言 (日英)。側のお告げ (左右の高貴・消去・抹消・結晶化・ネクロマンシー) は効き目 (付ける側 / 消す側) から、
 * それ以外は TAG。無ければ null (祝福・聖別・今のゲームに無いお告げは一言なし)
 */
export function omenTag(key: string): { ja: string; en: string } | null {
  const { add, remove } = omenSideOf(key);
  if (add) return add === "prefix" ? { ja: "プレフィックスに付く", en: "Adds prefix" } : { ja: "サフィックスに付く", en: "Adds suffix" };
  if (remove) return remove === "prefix" ? { ja: "プレフィックスを消す", en: "Removes prefix" } : { ja: "サフィックスを消す", en: "Removes suffix" };
  const t = TAG[key];
  return t ? { ja: t[0], en: t[1] } : null;
}
