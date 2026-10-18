/**
 * topic-courses-adv.ts — 上級のコース: 損をせずに確率を上げる小技 (2026-10-18 オーナー「上級では小テクの紹介、損しないで確率上げたりするような奴」「現実的に起こる MOD 群で試したい」)。
 * 1 コース = 1 つの小技。始めの状態は動画やビルドで本当に狙う MOD (靴・サファイア・金のアミュレット)。運の手は本当の確率のまま (外れたら「もう一度」)。
 * 作りは topic-courses.ts と同じ (start / prep / startMods / omens / chain)。prep の force:… は作った MOD・冒涜の MOD を決まった形で置く手、rune:… ははめる手、qset:… は品質を決める手
 */
import type { JaEn } from "./quiz-tutorials";
import type { Force } from "./stage-core";
import type { StageItem } from "./types";
import type { TopicCourse, TopicStep } from "./topic-courses";

const S = (use: string, note: JaEn, omens?: string[]): TopicStep => ({ use, note, ...(omens ? { omens } : {}) });
const H = (use: string, note: JaEn, how: JaEn[], prep?: string[] | StageItem["rarity"]): TopicStep =>
  ({ use, note, how, ...(typeof prep === "string" ? { start: prep } : prep ? { prep } : {}) });
const ALWAYS = (st: TopicStep): TopicStep => ({ ...st, prepAlways: true });
const BT = (mod: string, tier: string, x: Partial<Force> = {}): Force => ({ mod: `Boots_str/${mod}`, tier, ...x });
const JI = (mod: string): Force => ({ mod: `Jewels_int/${mod}`, tier: "T1" });
const AM = (mod: string, tier: string): Force => ({ mod: `Amulets/${mod}`, tier });
/** 雷耐性を固定してしまった靴 (サフィックス満杯) */
const BOOTS_FR: Force[] = [BT("MovementVelocity", "T2"), BT("IncreasedLife", "T3"), BT("LocalArmourAndStunThreshold", "T3"), BT("LightningResistance", "T1", { fractured: true }), BT("FireResistance", "T3"), BT("ColdResistance", "T3")];
/** 軽蔑の当たり (「サフィックスモッド +1 個」がプレフィックスに) を置く手 */
const CONTEMPT = "force:Jewels_int/Emotion_CraftedJewelAdditionalSuffixAllowed|T1|n";
/** ブリーチのエッセンスの「品質の最大値 +20%」を置く手 */
const BREACH = "force:Amulets/PerfectEssence_LocalMaximumQuality|T1|e";

export const ADV_COURSES: TopicCourse[] = [
  {
    id: "adv-fracture", level: 4, title: ["フラクチャーを 33% に", "Fracture at 33%"], base: "Vaal Greaves", itemLevel: 82, icon: "fracture",
    learn: ["アビスのエッセンス → 骨で冒涜を足して、フラクチャーの候補を 4 つから 3 つに減らす", "Add a Desecration (Abyss essence → bone) so Fracture picks from 3 mods instead of 4"],
    // 2026-10-18 オーナー「狙いたい MOD 1 に対して他 3 MOD 適当で、片方深淵エッセンスで冒涜で狙いが 33% へ」
    steps: [
      { ...ALWAYS(H("ess:the Abyss:perfect", ["冒涜の MOD は固定されない", "Desecrated mods can't be Fractured"], [
        ["本命は移動スピード。ほかの 3 つ (最大ライフ・火耐性・レアリティ) は何でも良い MOD", "The one you want is Movement Speed. The other 3 (Life, Fire Resistance, Rarity) don't matter"],
        ["フラクチャーは 4 つのうちどれか 1 つを固定する。このままだと本命が固定されるのは 1/4 (25%)", "Fracture locks 1 of the 4 mods. As is, Movement Speed has a 1/4 (25%) chance"],
        ["右側の結晶化のお告げを掛けたアビスのエッセンスで、サフィックスの 1 つを紋章に置き換える (本命のプレフィックスは消えない)", "Abyss essence with Omen of Dextral Crystallisation turns a suffix into the Mark (your prefix is safe)"],
        ["骨で紋章を冒涜の MOD にして発現する。冒涜の MOD は固定されないので、フラクチャーの候補は 3 つになる", "A bone turns the Mark into a Desecrated mod; reveal it. Desecrated mods can't be Fractured, so Fracture picks from 3"],
        ["本命が固定される確率は 1/3 (33%) に上がる。外れたら「もう一度」", "Now Movement Speed has a 1/3 (33%) chance. If it misses, Try again"],
      ], [])), omens: ["OmenofDextralCrystallisation"], startMods: [BT("MovementVelocity", "T2"), BT("IncreasedLife", "T4"), BT("FireResistance", "T3"), BT("ItemFoundRarityIncrease", "T2")],
      chain: [S("desecrate", ["骨で冒涜", "Desecrate with a Bone"]), S("reveal", ["発現", "Reveal"]), S("fracture", ["フラクチャー (1/3)", "Fracture (1/3)"])] },
    ],
  },
  {
    id: "adv-essence-desecrate", level: 4, title: ["冒涜をエッセンスで消す", "Remove a Desecration with an essence"], base: "Vaal Greaves", itemLevel: 82,
    learn: ["固定した MOD と結晶化のお告げで、冒涜の MOD だけをエッセンスで消す (アストリッドでエッセンス 2 つ目)", "Use a Fractured mod + crystallisation omen so an essence removes only the Desecrated mod (Astrid for a 2nd essence)"],
    // 2026-10-18 オーナー「フラクチャー側に冒涜発現済み、サフィに 3 MOD 置いてエッセンスでリロール。アストリッドでエッセンス 2 個目させる状態に、サフィに 1 クラフト MOD」
    steps: [
      { ...ALWAYS(H("ess:Hysteria:perfect", ["冒涜だけ消して、エッセンスを付ける", "Remove only the Desecration, add an essence"], [
        ["プレフィックスは「固定した最大ライフ」と「冒涜で付いたアーマー」。冒涜の結果がいまいちだった、という状態", "Prefixes: a Fractured Life mod and a Desecrated Armour mod you didn't want"],
        ["サフィックスは満杯で、そのうち 1 つはエッセンスで付けたレアリティ (作った MOD)", "Suffixes are full; one of them is Rarity from an essence (a crafted mod)"],
        ["アストリッドの創造性をはめてあるので、作った MOD を 2 つまで持てる (2 つ目のエッセンスが打てる)", "Astrid's Creativity is socketed, so you can have 2 crafted mods (a 2nd essence works)"],
        ["左側の結晶化のお告げを掛けたヒステリーのエッセンスは、プレフィックスから 1 つ消す。固定した MOD は消えないので、消えるのは必ず冒涜の MOD", "Hysteria with Omen of Sinistral Crystallisation removes a prefix. The Fractured one can't go, so it's always the Desecrated mod"],
        ["冒涜が消えて移動スピード 30% が付く。光のお告げを使わずに、冒涜をやり直せる", "The Desecration is gone and 30% Movement Speed is added: a redo without Omen of Light"],
      ], ["force:Boots_str/Essence_ItemFoundRarityIncrease|T1|e", "rune:Astrid's Creativity"])), omens: ["OmenofSinistralCrystallisation"],
      startMods: [BT("IncreasedLife", "T2", { fractured: true }), BT("LocalArmourAndStunThreshold", "T2", { desecrated: true }), BT("LightningResistance", "T1"), BT("ColdResistance", "T2")] },
    ],
  },
  {
    id: "adv-two-essences", level: 4, title: ["サフィックスでエッセンス 2 つ", "Two essences on suffixes"], base: "Vaal Greaves", itemLevel: 82,
    learn: ["サフィックスを固定してしまった時の立て直し。満杯なら消えるのはサフィックスだけ、戦慄と神秘の合金を交互に", "Recovering from a Fractured suffix: when full, only suffixes are removed; alternate Horror and Mystic Alloy"],
    // 時間術の靴 (S-7YHuq3-P4) の「サフィックスを固定した時は、戦慄のエッセンスと神秘の合金を交互に」
    steps: [
      { ...ALWAYS(H("ess:Horror:perfect", ["満杯のサフィックスに戦慄", "Horror on full suffixes"], [
        ["雷耐性を固定してしまった靴。サフィックスは満杯 (雷耐性・火耐性・冷気耐性)", "Boots with Lightning Resistance Fractured. Suffixes are full (Lightning, Fire, Cold)"],
        ["満杯の時、エッセンスは付ける側 (サフィックス) から消す。プレフィックスは消えない", "When full, an essence removes from the side it adds to (suffix). Prefixes are safe"],
        ["戦慄のエッセンスで、固定していない耐性が 1 つ消えて「ソケットされているアイテムの効果 60%」が付く", "Horror removes an unfractured resistance and adds “60% increased effect of Socketed Items”"],
        ["アストリッドの創造性をはめてあるので、作った MOD は 2 つまで持てる", "Astrid's Creativity is socketed: up to 2 crafted mods"],
      ], ["rune:Astrid's Creativity"])), startMods: BOOTS_FR },
      { ...H("ess:Mystic Alloy:perfect", ["続けて神秘の合金", "Then Mystic Alloy"], [
        ["神秘の合金も、サフィックスから 1 つ消してスピリット +15 を付ける", "Mystic Alloy also removes a suffix and adds +15 Spirit"],
        ["消えるのが戦慄の MOD なら、もう一度戦慄を打つ。交互に打っていれば、いつかは 2 つともそろう", "If it removes the Horror mod, use Horror again. Alternating, you eventually get both"],
      ], ["rune:Astrid's Creativity", "force:Boots_str/PerfectEssence_SoulCore|T1|e"]), startMods: BOOTS_FR },
    ],
  },
  {
    id: "adv-jewel-five", level: 4, title: ["ジュエルの 5 MOD", "5-mod jewels"], base: "Sapphire", itemLevel: 82,
    learn: ["軽蔑で枠を増やして埋めてから「+1 個」を消しても、付いた MOD は残る", "Add a slot with Contempt, fill it, then remove the “+1” mod: the extra mod stays"],
    // ジュエルの動画 (h4dw1U9Od0Y)。2026-10-18 オーナー「1 度付けたら外してもその MOD の効果は残ることの証明」
    steps: [
      { ...H("emotion:Potent Liquid Contempt", ["軽蔑で枠を増やす (50/50)", "Add a slot with Contempt (50/50)"], [
        ["欲しいのはサフィックスの「ライフより先にマナで受ける」と「クリティカルダメージボーナス」。プレフィックスの 2 つは何でも良い", "You want the suffixes “damage taken from Mana before Life” and “Critical Damage Bonus”. The 2 prefixes don't matter"],
        ["強力な液化した軽蔑は MOD を 1 つ消して、消えた側に付く。プレフィックスが消えれば「サフィックスモッド +1 個」(当たり)", "Potent Liquid Contempt removes a mod and goes on that side. If a prefix goes: “+1 Suffix Modifier allowed” (a hit)"],
        ["サフィックスが消えると「プレフィックスモッド +1 個」(外れ)。外れたら「もう一度」", "If a suffix goes: “+1 Prefix Modifier allowed” (a miss). Try again"],
      ], "rare"), startMods: [JI("JewelCriticalAilmentEffect"), JI("JewelOfferingLife"), JI("JewelDamagefromMana"), JI("JewelCriticalDamage")] },
      { ...ALWAYS(H("desecrate", ["3 つ目のサフィックスを冒涜で", "A 3rd suffix by Desecration"], [
        ["当たりの状態から。サフィックスが 3 つまで入る", "From the hit: suffixes can now hold 3"],
        ["右側のネクロマンシーのお告げを掛けた骨で、3 つ目のサフィックスを足す (ジュエルの骨は頭蓋骨)", "A bone with Omen of Dextral Necromancy adds the 3rd suffix (jewels use Craniums)"],
        ["発現でクリティカルヒット率などを選ぶ", "Reveal and pick Critical Hit Chance or similar"],
      ], [CONTEMPT])), omens: ["OmenofDextralNecromancy"], startMods: [JI("JewelDamagefromMana"), JI("JewelCriticalDamage")], chain: [S("reveal", ["発現", "Reveal"])] },
      { ...ALWAYS(H("annul", ["「+1 個」を消しても残る", "Remove the “+1”: the mod stays"], [
        ["左側の消去のお告げで、プレフィックスの「サフィックスモッド +1 個」だけを消す", "Omen of Sinistral Annulment removes only the prefix “+1 Suffix Modifier allowed”"],
        ["消してもサフィックスの 3 つ目は消えない。一度付いた MOD は、枠が戻っても残る", "The 3rd suffix stays. A mod that's already there remains even after the slot goes away"],
        ["これでプレフィックスが 2 つ空く (サフィックス 3 + プレフィックス 2 = 5 MOD にできる)", "Now both prefixes are open (3 suffixes + 2 prefixes = 5 mods)"],
      ], [CONTEMPT, "force:Jewels_int/JewelCriticalChance|T1|d"])), omens: ["OmenofSinistralAnnulment"], startMods: [JI("JewelDamagefromMana"), JI("JewelCriticalDamage")] },
      { ...H("exalt", ["5 MOD のジュエル", "A 5-mod jewel"], [
        ["偉大なる高貴なお告げを掛けた高貴で、空いたプレフィックスに 2 つ足す", "An Exalted Orb with Omen of Greater Exaltation adds 2 prefixes"],
        ["サフィックス 3 つ + プレフィックス 2 つで、5 MOD のジュエルの完成", "3 suffixes + 2 prefixes: a 5-mod jewel"],
      ], [CONTEMPT, "force:Jewels_int/JewelCriticalChance|T1|d"]), omens: ["OmenofGreaterExaltation"], startMods: [JI("JewelDamagefromMana"), JI("JewelCriticalDamage")] },
    ],
  },
  {
    id: "adv-quality-chaos", level: 4, title: ["品質を上げてからカオス", "Quality first, then Chaos"], base: "Gold Amulet", itemLevel: 82,
    learn: ["ブリーチで品質の上限を上げて 34% → カオスで当てたスペルスキルのレベル +3 が +4 に", "Breach for higher max quality, raise to 34%, then Chaos: +3 Spell Skills becomes +4"],
    // 2026-10-18 オーナー「ブリーチ品質はスペルレベル上げる 34% にしてカオススパム後スペルスキル 4 になる流れ」。品質の丸めは切り捨て (34% が境目)
    steps: [
      { ...H("ess:the Breach:perfect", ["品質の上限を 40% に", "Max quality to 40%"], [
        ["ブリーチのエッセンスで「品質の最大値 +20%」を付ける (MOD を 1 つ消してから付く)", "Essence of the Breach adds “+20% to Maximum Quality” (it removes a mod first)"],
        ["品質の上限が 20% から 40% に上がる", "Max quality goes from 20% to 40%"],
      ], "rare"), startMods: [AM("EnergyShield", "T3"), AM("SpellDamage", "T3"), AM("IncreasedCastSpeed", "T3"), AM("ManaRegeneration", "T3")] },
      { ...H("catalyst_caster", ["キャスターの品質を 34% に", "Caster quality to 34%"], [
        ["歯擦音のカタリストで、キャスターの品質を 34% まで上げる (持ったまま連打)", "Raise Caster quality to 34% with Sibilant Catalysts (keep clicking)"],
        ["スペルスキルのレベルはキャスターの MOD。品質は、後から付いた MOD にも掛かる", "Spell Skill levels are Caster mods. Quality also applies to mods added later"],
        ["+3 は品質 34% でちょうど +4 になる (3 × 1.34 = 4.02 の切り捨て)。33% では +3 のまま", "+3 becomes +4 at exactly 34% (3 × 1.34 = 4.02, rounded down). At 33% it stays +3"],
      ], [BREACH]), startMods: [AM("EnergyShield", "T3"), AM("IncreasedCastSpeed", "T3"), AM("ManaRegeneration", "T3")], untilQuality: 34 },
      { ...ALWAYS(H("chaos", ["品質を上げてからカオスを回す", "Quality first, then spam Chaos"], [
        ["右側の抹消のお告げを掛けたカオスで、サフィックスだけを入れ替える (プレフィックスのブリーチは消えない)", "Chaos with Omen of Dextral Erasure swaps only suffixes (the Breach prefix stays)"],
        ["このコースでは「全てのスペルスキルのレベル +3」(T1) が付いた例を見せる。品質 34% が掛かって +4 になる", "This course shows a hit: “+3 to Level of all Spell Skills” (T1), which becomes +4 at 34% quality"],
        ["先に品質を上げておけば、当たった MOD がそのまま伸びた数字で出る", "With quality raised first, a hit shows up already boosted"],
      ], [BREACH, "qset:34:caster"])), omens: ["OmenofDextralErasure"], want: { mod: "Amulets/GlobalIncreaseSpellSkillGemLevel", tier: "T1" },
      startMods: [AM("EnergyShield", "T3"), AM("SpellDamage", "T3"), AM("IncreasedCastSpeed", "T3"), AM("ManaRegeneration", "T3"), AM("Intelligence", "T4")] },
    ],
  },
];
