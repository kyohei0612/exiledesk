/**
 * topic-courses-adv.ts — 上級のコース: 損をせずに確率を上げる小技 (2026-10-18 オーナー「上級では小テクの紹介、損しないで確率上げたりするような奴」「現実的に起こる MOD 群で試したい」)。
 * 1 コース = 1 つの小技。始めの状態は動画やビルドで本当に狙う MOD (靴・サファイア・金のアミュレット)。運の手は本当の確率のまま (外れたら「もう一度」)。
 * 作りは topic-courses.ts と同じ (start / prep / startMods / omens / chain)。prep の force:… は作った MOD・冒涜の MOD を決まった形で置く手、rune:… ははめる手、qset:… は品質を決める手
 */
import { type Force } from "../craft-stage/engine";
import type { TopicCourse } from "./topic-courses";
import { S, H, ALWAYS } from "./topic-steps";

const BT = (mod: string, tier: string, x: Partial<Force> = {}): Force => ({ mod: `Boots_str/${mod}`, tier, ...x });
const JI = (mod: string): Force => ({ mod: `Jewels_int/${mod}`, tier: "T1" });
const AM = (mod: string, tier: string, x: Partial<Force> = {}): Force => ({ mod: `Amulets/${mod}`, tier, ...x });
/** 雷耐性を固定してしまった靴 (サフィックス満杯) */
const BOOTS_FR: Force[] = [BT("MovementVelocity", "T2"), BT("IncreasedLife", "T3"), BT("LocalArmourAndStunThreshold", "T3"), BT("LightningResistance", "T1", { fractured: true }), BT("FireResistance", "T3"), BT("ColdResistance", "T3")];
/** 軽蔑の当たり (「サフィックスモッド +1 個」がプレフィックスに) を置く手 */
const CONTEMPT = "force:Jewels_int/Emotion_CraftedJewelAdditionalSuffixAllowed|T1|n";
/** 軽蔑の当たりの後のジュエル (一覧から途中の手を選んだ時の始め): 何でも良いプレフィックス 1 つ + 欲しいサフィックス 2 つ。prep の CONTEMPT で「+1 個」が付く */
const JEWEL_HIT: Force[] = [JI("JewelCriticalAilmentEffect"), JI("JewelDamagefromMana"), JI("JewelCriticalDamage")];
/** ブリーチのエッセンスの「品質の最大値 +20%」を置く手 */
const BREACH = "force:Amulets/PerfectEssence_LocalMaximumQuality|T1|e";
/** 強化のエッセンスの「グローバル防御」を置く手 */
const ENHANCE = "force:Amulets/PerfectEssence_AllDefences|T1|e";
/** 不在のアミュレット (プレ 2・サフィ 2): 固定した最大マナ + スペルスキルのレベル・キャストスピード。prep の ENHANCE でプレフィックスが満杯になる */
const ABSENT: Force[] = [AM("IncreasedMana", "T1", { fractured: true }), AM("GlobalIncreaseSpellSkillGemLevel", "T1"), AM("IncreasedCastSpeed", "T2")];

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
        ["骨で紋章を冒涜の MOD にする (発現はしなくて良い)。冒涜の MOD は未発現でも固定されないので、フラクチャーの候補は 3 つになる", "A bone turns the Mark into a Desecrated mod (no need to reveal). Desecrated mods can't be Fractured even unrevealed, so Fracture picks from 3"],
        ["本命が固定される確率は 1/3 (33%) に上がる。このコースでは当たった例 (移動スピードが固定) を見せる", "Movement Speed now has a 1/3 (33%) chance. This course shows a hit (Movement Speed gets Fractured)"],
      ], [])), omens: ["OmenofDextralCrystallisation"], startMods: [BT("MovementVelocity", "T2"), BT("IncreasedLife", "T4"), BT("FireResistance", "T3"), BT("ItemFoundRarityIncrease", "T2")],
      target: "Boots_str/MovementVelocity",
      // 発現はしないでフラクチャー (よくやるのは未発現のまま。2026-10-18 オーナー「発現は別にしなくてもいい、飛ばしてフラクチャー」)
      chain: [S("desecrate", ["骨で冒涜", "Desecrate with a Bone"]), S("fracture", ["フラクチャー (1/3)", "Fracture (1/3)"])] },
    ],
  },
  {
    id: "adv-essence-desecrate", level: 4, title: ["冒涜をエッセンスでやり直す", "Redo Desecrations with an essence"], base: "Absent Amulet", itemLevel: 82,
    learn: ["不在のアミュレットで、骨 → 発現 → 強化のエッセンスを何度でも。光のお告げも結晶化のお告げもいらない", "On an Absent Amulet: bone → reveal → Enhancement essence, as many times as you like. No Omen of Light or crystallisation needed"],
    // 不在のアミュレットの動画 (mjaMYCYl-PI 24:31)。2026-10-18 オーナー「付く方のエッセンスの枠が埋まってるから必ず邪魔な方の MOD を消してくれる、それに合ったエッセンスを使うと無限」「同じ動作 2 回くらい」「ブリーチだとややこしいから他のエッセンスで」
    steps: [
      { ...ALWAYS(H("desecrate", ["骨 → 発現 → エッセンスで元に戻る", "Bone → reveal → essence puts it back"], [
        ["不在のアミュレットはプレフィックスが 2 つまで。今は「固定した最大マナ」と「強化のエッセンス」で満杯", "Absent Amulets hold only 2 prefixes. Now: a Fractured Mana mod + the Enhancement essence mod (full)"],
        ["左のネクロマンシーの骨: 満杯なので、固定していない方 (強化) が冒涜に入れ替わる", "Bone with Sinistral Necromancy: prefixes are full, so the unfractured one (Enhancement) becomes the Desecration"],
        ["発現して、狙い (スピリットなど) が無ければほかを選ぶ", "Reveal; if your target (Spirit etc.) isn't there, pick another"],
        ["強化のエッセンス: 付ける側 (プレフィックス) が満杯なので、プレフィックスから消す。固定した MOD は消えないので、消えるのは必ず冒涜。結晶化のお告げはいらない", "Enhancement essence: its side (prefix) is full, so it removes a prefix. The Fractured one stays, so it's always the Desecration. No crystallisation omen needed"],
        ["これで最初と同じ形に戻る。ボタンも骨に戻るので、そのままもう 1 周。光のお告げを使わずに、狙い (スピリット +50) が出るまで何回でも回せる", "You're back to the start. The buttons go back to the bone, so loop again: repeat until your target (+50 Spirit) shows up, without Omen of Light"],
      ], [ENHANCE])), omens: ["OmenofSinistralNecromancy"], startMods: ABSENT, loop: true, wantReveal: { mod: "Amulets/BaseSpirit", value: 50, from: 2, label: ["スピリット +50", "+50 to Spirit"] }, target: "Amulets/BaseSpirit",
      // エッセンスまで打ったら手の最初に戻って次の周 (loop)。2 周目の発現でスピリット +50 が候補に出て、それを発現したら完了 (wantReveal)
      chain: [S("reveal", ["発現", "Reveal"]), S("ess:Enhancement:perfect", ["強化で冒涜を消す", "Enhancement removes the Desecration"])] },
    ],
  },
  {
    id: "adv-two-essences", level: 4, title: ["サフィックスでエッセンス 2 つ", "Two essences on suffixes"], base: "Vaal Greaves", itemLevel: 82,
    learn: ["サフィックスを固定してしまった時の立て直し。満杯なら消えるのはサフィックスだけ、戦慄と神秘の合金を 2 つそろうまで交互に", "Recovering from a Fractured suffix: when full, only suffixes are removed; alternate Horror and Mystic Alloy"],
    // 時間術の靴 (S-7YHuq3-P4) の「サフィックスを固定した時は、戦慄のエッセンスと神秘の合金を交互に」
    steps: [
      // 1 つの手で 戦慄 → 神秘の合金 を 1 周、2 つそろうまで手の最初に戻ってループ (loop)。3 周目でそろう成功例 (loopUntil)
      // 2026-10-18 オーナー「画面変えずに連続で使えるように、2 つそろうまでループ。3 回くらいループさせてそろえさせて」
      { ...ALWAYS(H("ess:Horror:perfect", ["戦慄と神秘の合金を交互に", "Alternate Horror and Mystic Alloy"], [
        ["雷耐性を固定してしまった靴。サフィックスは満杯 (雷耐性・火耐性・冷気耐性)", "Boots with Lightning Resistance Fractured. Suffixes are full (Lightning, Fire, Cold)"],
        ["満杯の時、エッセンスは付ける側 (サフィックス) から消す。プレフィックスは消えないし、固定した雷耐性も消えない", "When full, an essence removes from its own side (suffix). Prefixes and the Fractured Lightning Resistance are safe"],
        ["戦慄で「ソケットされているアイテムの効果 60%」、神秘の合金で「スピリット +15」。どちらもサフィックスを 1 つ消してから付く", "Horror adds “60% increased effect of Socketed Items”, Mystic Alloy adds “+15 Spirit”. Each removes a suffix first"],
        ["相手のエッセンスの MOD が消えることもある。消えたら、また交互に打つ。アストリッドの創造性で作った MOD は 2 つまで持てるので、いつかは 2 つともそろう", "Sometimes the other essence's mod is the one removed: just keep alternating. With Astrid's Creativity you can hold 2 crafted mods, so both eventually stick"],
        ["2 つそろうまで、戦慄 → 神秘の合金 を繰り返す (ボタンは最初に戻る)", "Repeat Horror → Mystic Alloy until both are on (the buttons go back to the start)"],
      ], ["rune:Astrid's Creativity"])), startMods: BOOTS_FR, loop: true,
      loopUntil: { mods: ["Boots_str/PerfectEssence_SoulCore", "Boots_str/PerfectEssence_BaseSpirit"], from: 3 },
      chain: [S("ess:Mystic Alloy:perfect", ["神秘の合金", "Mystic Alloy"])] },
    ],
  },
  {
    id: "adv-jewel-five", level: 4, title: ["ジュエルの 5 MOD", "5-mod jewels"], base: "Sapphire", itemLevel: 82,
    learn: ["軽蔑で枠を増やして埋めてから「+1 個」を消しても、付いた MOD は残る", "Add a slot with Contempt, fill it, then remove the “+1” mod: the extra mod stays"],
    // ジュエルの動画 (h4dw1U9Od0Y)。2026-10-18 オーナー「1 度付けたら外してもその MOD の効果は残ることの証明」
    // 1 つのジュエルを続けて作る: 2 手目からは次へで前の手のアイテムを引き継ぐ (cont)。prep は一覧から途中の手を選んだ時だけ
    // 運で話がずれる所は成功例 (軽蔑は当たり・冒涜の候補にクリティカルヒット率・左の消去で「+1 個」が消える)。2026-10-18 オーナー「次へで MOD 変わってんの意味わからん」
    steps: [
      { ...H("emotion:Potent Liquid Contempt", ["軽蔑で枠を増やす", "Add a slot with Contempt"], [
        ["欲しいのはサフィックスの「ライフより先にマナで受ける」と「クリティカルダメージボーナス」。プレフィックスの 2 つは何でも良い", "You want the suffixes “damage taken from Mana before Life” and “Critical Damage Bonus”. The 2 prefixes don't matter"],
        ["強力な液化した軽蔑は MOD を 1 つ消して、消えた側に付く。プレフィックスが消えれば「サフィックスモッド +1 個」(当たり)、サフィックスが消えれば「プレフィックスモッド +1 個」(外れ) で 50/50", "Potent Liquid Contempt removes a mod and goes on that side: a prefix → “+1 Suffix Modifier allowed” (hit), a suffix → “+1 Prefix Modifier allowed” (miss). 50/50"],
        ["このコースでは当たり (サフィックスモッド +1 個) の例を見せる", "This course shows the hit (+1 Suffix Modifier allowed)"],
      ], "rare"), startMods: [JI("JewelCriticalAilmentEffect"), JI("JewelOfferingLife"), JI("JewelDamagefromMana"), JI("JewelCriticalDamage")],
      want: { mod: "Jewels_int/Emotion_CraftedJewelAdditionalSuffixAllowed" } },
      { ...ALWAYS(H("desecrate", ["3 つ目のサフィックスを冒涜で", "A 3rd suffix by Desecration"], [
        ["サフィックスが 3 つまで入るようになった", "Suffixes can now hold 3"],
        ["右側のネクロマンシーのお告げを掛けた骨で、3 つ目のサフィックスを足す (ジュエルの骨は頭蓋骨)", "A bone with Omen of Dextral Necromancy adds the 3rd suffix (jewels use Craniums)"],
        ["発現でクリティカルヒット率を選ぶ", "Reveal and pick Critical Hit Chance"],
      ], [CONTEMPT])), omens: ["OmenofDextralNecromancy"], startMods: JEWEL_HIT, cont: true, chain: [S("reveal", ["発現", "Reveal"])],
      target: "Jewels_int/JewelCriticalChance", wantReveal: { mod: "Jewels_int/JewelCriticalChance", from: 1, label: ["クリティカルヒット率", "Critical Hit Chance"] } },
      { ...ALWAYS(H("annul", ["「+1 個」を消しても残る", "Remove the “+1”: the mod stays"], [
        ["プレフィックスは「何でも良い MOD」と「サフィックスモッド +1 個」の 2 つ。左側の消去のお告げで、プレフィックスから 1 つ消す", "Prefixes: a don't-care mod and “+1 Suffix Modifier allowed”. Omen of Sinistral Annulment removes one prefix"],
        ["このコースでは「サフィックスモッド +1 個」が消える例を見せる", "This course shows “+1 Suffix Modifier allowed” being removed"],
        ["消してもサフィックスの 3 つ目は消えない。一度付いた MOD は、枠が戻っても残る", "The 3rd suffix stays. A mod that's already there remains even after the slot goes away"],
      ], [CONTEMPT, "force:Jewels_int/JewelCriticalChance|T1|d"])), omens: ["OmenofSinistralAnnulment"], startMods: JEWEL_HIT, cont: true,
      wantRemoved: "Jewels_int/Emotion_CraftedJewelAdditionalSuffixAllowed" },
      { ...H("exalt", ["5 MOD のジュエル", "A 5-mod jewel"], [
        ["高貴なオーブで、空いたプレフィックスに 1 つ足す", "An Exalted Orb adds a prefix in the open slot"],
        ["サフィックス 3 つ + プレフィックス 2 つで、5 MOD のジュエルの完成", "3 suffixes + 2 prefixes: a 5-mod jewel"],
      ], [CONTEMPT, "force:Jewels_int/JewelCriticalChance|T1|d", "force:Jewels_int/Emotion_CraftedJewelAdditionalSuffixAllowed|T1|x"]), startMods: JEWEL_HIT, cont: true },
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
      ], [BREACH]), startMods: [AM("EnergyShield", "T3"), AM("IncreasedCastSpeed", "T3"), AM("ManaRegeneration", "T3")], untilQuality: 34, cont: true },
      { ...ALWAYS(H("chaos", ["品質を上げてからカオスを回す", "Quality first, then spam Chaos"], [
        ["右側の抹消のお告げを掛けたカオスで、サフィックスだけを入れ替える (プレフィックスのブリーチは消えない)", "Chaos with Omen of Dextral Erasure swaps only suffixes (the Breach prefix stays)"],
        ["このコースでは「全てのスペルスキルのレベル +3」(T1) が付いた例を見せる。品質 34% が掛かって +4 になる", "This course shows a hit: “+3 to Level of all Spell Skills” (T1), which becomes +4 at 34% quality"],
        ["先に品質を上げておけば、当たった MOD がそのまま伸びた数字で出る", "With quality raised first, a hit shows up already boosted"],
      ], [BREACH, "qset:34:caster"])), omens: ["OmenofDextralErasure"], want: { mod: "Amulets/GlobalIncreaseSpellSkillGemLevel", tier: "T1" }, cont: true,
      startMods: [AM("EnergyShield", "T3"), AM("SpellDamage", "T3"), AM("IncreasedCastSpeed", "T3"), AM("ManaRegeneration", "T3"), AM("Intelligence", "T4")] },
    ],
  },
];
