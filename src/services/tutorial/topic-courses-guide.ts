/**
 * topic-courses-guide.ts — クラフト手順 (段 5): 完成品までを 1 手ずつ (2026-10-20 要望 93d00e7c「確定的な作り方を 1 手ずつ。例: 不在のアミュレットを全スペル +5/6 に」)。
 * 作りは上級 (topic-courses-adv.ts) と同じ。1 本のアイテムを続けて作る (cont)。運の手は成功例を見せ、何 % かを how に書く。
 * ヴァールのインフューザー (品質 50%・+6) の手は外した (2026-10-20 オーナー: 運の手で再現できない、no-vaal-chance と同じ線)。+6 は最後の文で品質の帯を案内する。
 * 聖別と品質の計算式はオーナーと決着済み (メモ poe2-craft-rules-confirmed の 10-21): 聖別は素の値 × 0.78〜1.22 を四捨五入、表示 = 切り捨て(素 × (1 + 品質))
 */
import { OMEN_KEY, SANCTIFY_MIN, SANCTIFY_MAX, BASE_MAX_QUALITY, RAISED_MAX_QUALITY, displayedValue, sanctifiedValue, sanctifyChanceAtLeast, type Force } from "../craft-stage/engine";
import type { TopicCourse } from "./topic-courses";
import { H } from "./topic-steps";

const AM = (mod: string, tier: string): Force => ({ mod: `Amulets/${mod}`, tier });
const SPELL = "Amulets/GlobalIncreaseSpellSkillGemLevel";
/** 不在のアミュレット: プレフィックスは外れ 1 つだけ、サフィックスに全スペル +3 (T1) とキャストスピード */
const ABSENT_SPELL: Force[] = [AM("IncreasedLife", "T6"), AM("GlobalIncreaseSpellSkillGemLevel", "T1"), AM("IncreasedCastSpeed", "T2")];
/** ブリーチの後 (外れのプレフィックスが品質の最大値 +20% に替わった形) */
const AFTER_BREACH: Force[] = [AM("GlobalIncreaseSpellSkillGemLevel", "T1"), AM("IncreasedCastSpeed", "T2")];
const BREACH = "force:Amulets/PerfectEssence_LocalMaximumQuality|T1|e";
/**
 * 例の数字 (文の言い回しは教材、数はエンジン = 品質の上限 E-71・品質の表示値 E-72・聖別 E-35、11-07 ブラック 58 の決め)。
 * RAW = 持っている「全てのスペルスキルのレベル +3」(T1) の素の値、GOAL = このコースの狙いの表示 (+5)
 */
const RAW = 3;
const GOAL = 5;
const CAP = RAISED_MAX_QUALITY;
const x = (raw: number, q: number): number => Math.round(raw * (100 + q)) / 100; // 素 × (1 + 品質) の文の数 (4.2・5.6)
/** 品質 CAP で GOAL になる一番小さい素の値 (4) */
const NEED = Array.from({ length: 20 }, (_, i) => RAW + i).find((r) => displayedValue(r, CAP) >= GOAL) ?? RAW;
/** 聖別で素の RAW が NEED になる一番低い倍率 (% の整数、117) と、その割合 (45 通り中 6 通り) */
const K_MIN = Array.from({ length: SANCTIFY_MAX - SANCTIFY_MIN + 1 }, (_, i) => SANCTIFY_MIN + i).find((k) => sanctifiedValue(RAW, k / 100) >= NEED) ?? SANCTIFY_MAX;
const K_ALL = SANCTIFY_MAX - SANCTIFY_MIN + 1;
const K_HIT = SANCTIFY_MAX - K_MIN + 1;
const K_PCT = Math.round(sanctifyChanceAtLeast(K_MIN / 100) * 100);
/** 素の NEED で 1 つ上 (+6) になる品質 (50%) */
const NEXT_Q = Array.from({ length: 100 }, (_, i) => i + 1).find((q) => displayedValue(NEED, q) > GOAL) ?? 100;

export const GUIDE_COURSES: TopicCourse[] = [
  {
    id: "guide-absent-spell5", level: 5, title: ["不在のアミュレットで全スペル +5", "Absent Amulet: +5 to all Spell Skills"], base: "Absent Amulet", itemLevel: 82, icon: "divine",
    learn: [`全スペル +${RAW} (T1) から: ブリーチで品質の上限 ${CAP}% → カタリストで ${CAP}% → 聖別で +${GOAL}`, `From +${RAW} Spell Skills (T1): Breach for ${CAP}% max quality → Catalysts to ${CAP}% → Sanctify for +${GOAL}`],
    steps: [
      { ...H("ess:the Breach:perfect", [`品質の上限を ${CAP}% に (運なし)`, `Max quality to ${CAP}% (no luck)`], [
        [`始めは黄 (レア) の不在のアミュレット。サフィックスに「全てのスペルスキルのレベル +${RAW}」(T1) とキャストスピード、プレフィックスは何でも良い MOD が 1 つだけ`, `Start: a yellow (Rare) Absent Amulet with “+${RAW} to Level of all Spell Skills” (T1) and Cast Speed as suffixes, and only 1 don't-care prefix`],
        [`+${RAW} (T1) を当てる所は上級の「品質を上げてからカオス」で。ここは持っている所から`, `Hitting +${RAW} (T1) is in the Advanced course “Quality first, then Chaos”. Here you already have it`],
        ["左側の結晶化のお告げを掛けたブリーチのエッセンス。消えるのはプレフィックスで、プレフィックスは外れ 1 つしか無いので、消えるのは必ずそれ", "Essence of the Breach with Omen of Sinistral Crystallisation removes a prefix. There is only the don't-care one, so that is always the one removed"],
        [`「品質の最大値 +${CAP - BASE_MAX_QUALITY}%」が付いて、品質の上限が ${BASE_MAX_QUALITY}% から ${CAP}% になる`, `It adds “+${CAP - BASE_MAX_QUALITY}% to Maximum Quality”: max quality goes from ${BASE_MAX_QUALITY}% to ${CAP}%`],
      ], "rare"), omens: ["OmenofSinistralCrystallisation"], startMods: ABSENT_SPELL },
      { ...H("catalyst_caster", [`キャスターの品質を ${CAP}% に (運なし)`, `Caster quality to ${CAP}% (no luck)`], [
        [`歯擦音のカタリストを連打して、キャスターの品質を上限の ${CAP}% まで上げる`, `Keep clicking Sibilant Catalysts to raise Caster quality to the ${CAP}% cap`],
        ["スペルスキルのレベルはキャスターの MOD。品質の分だけ数字が伸びる (端数は切り捨て)", "Spell Skill levels are Caster mods. Quality raises the number (rounded down)"],
        [`今は +${RAW} × ${(100 + CAP) / 100} = ${x(RAW, CAP)} で +${displayedValue(RAW, CAP)}。次の聖別で素の値を ${NEED} にすれば +${displayedValue(NEED, CAP)}`, `Now it shows +${displayedValue(RAW, CAP)} (${RAW} × ${(100 + CAP) / 100} = ${x(RAW, CAP)}). Sanctify the base value to ${NEED} next for +${displayedValue(NEED, CAP)}`],
      ], [BREACH]), startMods: AFTER_BREACH, untilMax: true, cont: true },
      { ...H("divine", [`聖別で +${GOAL} (約 ${K_PCT}%)`, `Sanctify for +${GOAL} (about ${K_PCT}%)`], [
        [`聖別のお告げを掛けた神のオーブ。MOD ごとに素の値を ${SANCTIFY_MIN / 100}〜${SANCTIFY_MAX / 100} 倍して四捨五入し、聖別済みになる (もうカレンシーで変えられない)`, `Divine Orb with Omen of Sanctification: each mod's base value is multiplied by ${SANCTIFY_MIN / 100}–${SANCTIFY_MAX / 100} and rounded, and the item becomes Sanctified (no more currency)`], // 幅はエンジンの聖別の定数 (E-35)
        [`素の +${RAW} が ${NEED} になるのは倍率 ${K_MIN / 100} 以上の時 (${K_ALL} 通り中 ${K_HIT} 通り、約 ${K_PCT}%)`, `The base +${RAW} becomes ${NEED} only at ${K_MIN / 100}× or more (${K_HIT} of ${K_ALL} rolls, about ${K_PCT}%)`],
        [`品質は素の値に掛かる: 素 ${NEED} × ${(100 + CAP) / 100} = ${x(NEED, CAP)} で +${displayedValue(NEED, CAP)}。素 ${NEED - 1} なら +${displayedValue(NEED - 1, CAP)}、素 ${NEED - 2} なら +${displayedValue(NEED - 2, CAP)}`, `Quality applies to the base value: ${NEED} × ${(100 + CAP) / 100} = ${x(NEED, CAP)} → +${displayedValue(NEED, CAP)}. Base ${NEED - 1} gives +${displayedValue(NEED - 1, CAP)}, base ${NEED - 2} gives +${displayedValue(NEED - 2, CAP)}`],
        [`このコースでは素 ${NEED} になる例 (+${displayedValue(NEED, CAP)}) を見せる`, `This course shows the base becoming ${NEED} (+${displayedValue(NEED, CAP)})`],
        [`+${GOAL + 1} には品質 ${NEXT_Q}% が要る (ゲームではヴァールカタリストのインフューザーの運次第)。ここでは品質の帯で上限を ${NEXT_Q}% にすれば +${GOAL + 1} を試せる。聖別の数値も、品質の帯の下の「聖別」の帯で決められる (最大を選べば一番良い振れ方を試せる)`, `+${GOAL + 1} needs ${NEXT_Q}% quality (in the game it depends on luck with a Vaal Catalysing Infuser). Here, set the max to ${NEXT_Q}% on the quality bar to try +${GOAL + 1}. The Sanctified bar under it sets the multiplier too (pick Max for the best roll)`],
      ], [BREACH, `qset:${CAP}:caster`]), omens: [OMEN_KEY.sanctification], startMods: AFTER_BREACH, cont: true, wantValue: { mod: SPELL, value: NEED } },
    ],
  },
];
