/**
 * topic-courses-guide.ts — クラフト手順 (段 5): 完成品までを 1 手ずつ (2026-10-20 要望 93d00e7c「確定的な作り方を 1 手ずつ。例: 不在のアミュレットを全スペル +5/6 に」)。
 * 作りは上級 (topic-courses-adv.ts) と同じ。1 本のアイテムを続けて作る (cont)。運の手は成功例を見せ、何 % かを how に書く。
 * 聖別と品質の計算式はオーナーと決着済み (メモ poe2-craft-rules-confirmed の 10-21): 聖別は素の値 × 0.78〜1.22 を四捨五入、表示 = 切り捨て(素 × (1 + 品質))
 */
import type { JaEn } from "./quiz-tutorials";
import type { Force } from "../craft-stage/stage-core";
import type { StageItem } from "../craft-stage/types";
import type { TopicCourse, TopicStep } from "./topic-courses";

const H = (use: string, note: JaEn, how: JaEn[], prep?: string[] | StageItem["rarity"]): TopicStep =>
  ({ use, note, how, ...(typeof prep === "string" ? { start: prep } : prep ? { prep } : {}) });
const AM = (mod: string, tier: string): Force => ({ mod: `Amulets/${mod}`, tier });
const SPELL = "Amulets/GlobalIncreaseSpellSkillGemLevel";
/** 不在のアミュレット: プレフィックスは外れ 1 つだけ、サフィックスに全スペル +3 (T1) とキャストスピード */
const ABSENT_SPELL: Force[] = [AM("IncreasedLife", "T6"), AM("GlobalIncreaseSpellSkillGemLevel", "T1"), AM("IncreasedCastSpeed", "T2")];
/** ブリーチの後 (外れのプレフィックスが品質の最大値 +20% に替わった形) */
const AFTER_BREACH: Force[] = [AM("GlobalIncreaseSpellSkillGemLevel", "T1"), AM("IncreasedCastSpeed", "T2")];
const BREACH = "force:Amulets/PerfectEssence_LocalMaximumQuality|T1|e";

export const GUIDE_COURSES: TopicCourse[] = [
  {
    id: "guide-absent-spell6", level: 5, title: ["不在のアミュレットで全スペル +6", "Absent Amulet: +6 to all Spell Skills"], base: "Absent Amulet", itemLevel: 82, icon: "divine",
    learn: ["全スペル +3 (T1) から: ブリーチで品質の上限 40% → カタリストで 40% → インフューザーで 50% → 聖別。+5 で止めるなら 40% で聖別", "From +3 Spell Skills (T1): Breach for 40% max quality → Catalysts to 40% → Infuser to 50% → Sanctify. Stop at 40% for +5"],
    steps: [
      { ...H("ess:the Breach:perfect", ["品質の上限を 40% に (運なし)", "Max quality to 40% (no luck)"], [
        ["始めは黄 (レア) の不在のアミュレット。サフィックスに「全てのスペルスキルのレベル +3」(T1) とキャストスピード、プレフィックスは何でも良い MOD が 1 つだけ", "Start: a yellow (Rare) Absent Amulet with “+3 to Level of all Spell Skills” (T1) and Cast Speed as suffixes, and only 1 don't-care prefix"],
        ["+3 (T1) を当てる所は上級の「品質を上げてからカオス」で。ここは持っている所から", "Hitting +3 (T1) is in the Advanced course “Quality first, then Chaos”. Here you already have it"],
        ["左側の結晶化のお告げを掛けたブリーチのエッセンス。消えるのはプレフィックスで、プレフィックスは外れ 1 つしか無いので、消えるのは必ずそれ", "Essence of the Breach with Omen of Sinistral Crystallisation removes a prefix. There is only the don't-care one, so that is always the one removed"],
        ["「品質の最大値 +20%」が付いて、品質の上限が 20% から 40% になる", "It adds “+20% to Maximum Quality”: max quality goes from 20% to 40%"],
      ], "rare"), omens: ["OmenofSinistralCrystallisation"], startMods: ABSENT_SPELL },
      { ...H("catalyst_caster", ["キャスターの品質を 40% に (運なし)", "Caster quality to 40% (no luck)"], [
        ["歯擦音のカタリストを連打して、キャスターの品質を上限の 40% まで上げる", "Keep clicking Sibilant Catalysts to raise Caster quality to the 40% cap"],
        ["スペルスキルのレベルはキャスターの MOD。品質の分だけ数字が伸びる (端数は切り捨て)", "Spell Skill levels are Caster mods. Quality raises the number (rounded down)"],
        ["+5 で良いならここで聖別へ: 聖別で素の +3 が 4 になれば 4 × 1.4 = 5.6 で +5", "Fine with +5? Sanctify now: if the base +3 becomes 4, 4 × 1.4 = 5.6 → +5"],
      ], [BREACH]), startMods: AFTER_BREACH, untilMax: true, cont: true },
      { ...H("vaal_infuser_jewellery", ["品質を 50% に (コラプトの危険あり)", "Quality to 50% (risk of Corruption)"], [
        ["ヴァールカタリストのインフューザーは、品質の上限を最大 10% 超えて上げられる。連打で 50% に", "Vaal Catalysing Infuser raises quality up to 10% over the cap. Keep clicking to 50%"],
        ["上限を超える 1 回ごとにコラプトすることがある (公式の値は無く、コミュニティの報告で約 25%)。コラプトしたアイテムは聖別できない", "Each use over the cap can Corrupt the item (no official number; the community reports about 25%). A Corrupted item can't be Sanctified"],
        ["このコースではコラプトしない例を見せる。外れたら、前の手からやり直し", "This course shows a run with no Corruption. If it Corrupts, start over from the previous step"],
      ], [BREACH, "qset:40:caster"]), startMods: AFTER_BREACH, untilMax: true, safe: true, cont: true },
      { ...H("divine", ["聖別で +6 (約 13%)", "Sanctify for +6 (about 13%)"], [
        ["聖別のお告げを掛けた神のオーブ。MOD ごとに素の値を 0.78〜1.22 倍して四捨五入し、聖別済みになる (もうカレンシーで変えられない)", "Divine Orb with Omen of Sanctification: each mod's base value is multiplied by 0.78–1.22 and rounded, and the item becomes Sanctified (no more currency)"],
        ["素の +3 が 4 になるのは倍率 1.17 以上の時 (45 通り中 6 通り、約 13%)", "The base +3 becomes 4 only at 1.17× or more (6 of 45 rolls, about 13%)"],
        ["品質は素の値に掛かる: 素 4 × 1.5 = +6。素 3 なら +4、素 2 なら +3。品質 50% で +5 は出ない", "Quality applies to the base value: 4 × 1.5 = +6. Base 3 gives +4, base 2 gives +3. +5 can't happen at 50%"],
        ["このコースでは素 4 になる例 (+6) を見せる", "This course shows the base becoming 4 (+6)"],
      ], [BREACH, "qset:50:caster"]), omens: ["OmenofSanctification"], startMods: AFTER_BREACH, cont: true, wantValue: { mod: SPELL, value: 4 } },
    ],
  },
];
