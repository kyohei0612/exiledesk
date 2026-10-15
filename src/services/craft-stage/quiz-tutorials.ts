/**
 * quiz-tutorials.ts — クラフトのチュートリアル 4 本 (2026-10-16、ADR-003 のクイズのレシピの見本)。
 *
 * オーナー 2026-10-14「クラフトチュートリアルにする。全部クイズ形式 (次はどれを打つ? を選ばせて案内)。無難でどの装備でも使える物を 4 本」
 * (メモ recipe-showcase): 武器 = 決闘のワンド、防具 = 手袋 (コルの狩り入り、途中でアストリッド)、指輪 = 洗練されたブリーチリング
 * (全耐性フラクチャー + 耐性 2)、アミュレット = 不在のアミュレット。
 *
 * 1 本 = クイズのレシピ (quiz-recipe.ts の型そのまま) + 答えごとの「なぜ」。画面 (StageTutorial.vue) は今のアイテムに当たる答えを
 * 正解として、ほかの答えを混ぜた選択肢で「この時は?」と聞く。打ち方はシミュレーターと同じ applyQuizAction。
 * 資料で決まらない所は assumed (画面に「仮」) に書く。外のサイトは見ていない (手元の字幕とクライアントのデータだけ)。
 * 値段は使わない (費用は出さず、打った数だけ出す)。
 */
import type { QuizAction, QuizRecipe, QuizRule, QuizSlot } from "./quiz-recipe";

/** 日本語と英語の組 (画面の言葉。ゲームの言葉はキーからクライアントの名前で出す) */
export type JaEn = readonly [string, string];
export interface TutorialRule extends QuizRule {
  /** この手を打つ理由 (正解の後に出す) */
  why: JaEn;
  /** 資料で決まらず仮にした手 (画面に「仮」) */
  assumed?: JaEn;
}
export interface QuizTutorial {
  id: string;
  /** 部位の見出し (武器・防具・指輪・アミュレット) */
  part: JaEn;
  /** ここで覚えること (1 行) */
  learn: JaEn;
  recipe: QuizRecipe;
  /** 使った資料 (動画の id・メモ) */
  source: string;
  /** 仮にした所 (チュートリアル全体) */
  assumed: JaEn[];
  /** 画面で回す運の種 (この種で最後まで行くことをテストで確かめる) */
  seed: number;
}

const slot = (id: string, side: QuizSlot["side"], mods: string[], kind: QuizSlot["kind"] = "normal", minTierIndex = 0): QuizSlot =>
  ({ id, side, mods: mods.map((modId) => ({ modId, minTierIndex })), kind });
const rule = (when: TutorialRule["when"], a: QuizAction, why: JaEn, assumed?: JaEn): TutorialRule => ({ when, do: a, why, ...(assumed ? { assumed } : {}) });
const RESTART = { restart: true } as const;

/**
 * 武器: 決闘のワンド。SaVeQ のグリムピラーのワンド (qdyfBnzqBLo) の流れ:
 * 冷気スペルのレベル付きのマジックを買う → スペルダメージのグレーターエッセンス → 左手のネクロマンシー + 君主のお告げで冒涜 (プレ) →
 * 発現で元素ダメージ (外れは光のお告げ) → 偉大なる高貴なお告げ + 上級の高貴で 2 つ → 残りを高貴
 */
function wand(): QuizTutorial {
  const W = "Wands/";
  return {
    id: "wand", part: ["武器", "Weapon"],
    learn: ["エッセンスでレアにする・側と勢力のお告げで冒涜を狙う・外れは光のお告げ", "Essence to rare, desecrate with side + faction omens, Omen of Light on a miss"],
    source: "SaVeQ qdyfBnzqBLo (data-cache/saveq-subtitles), IgQX6EZtUyo",
    seed: 3,
    assumed: [
      ["ベースは決闘のワンド (動画はベースを言っていない)", "Base is Dueling Wand (the video does not name the base)"],
      ["始めは「冷気スペルのレベル」だけのマジックを買う形 (動画はプレも付いたマジックを買っている)", "Starts from a magic wand with only Cold Spell level (the video buys magic wands that also have a prefix)"],
      ["完成の残り 3 つは何でも良い (動画は付いた物をそのまま売っている)", "The last 3 mods can be anything (the video sells whatever lands)"],
    ],
    recipe: {
      v: 3, name: "Dueling Wand", base: "Dueling Wand", itemLevel: 82,
      start: { kind: "bought", rarity: "magic", mods: [{ mod: W + "GlobalIncreaseColdSpellSkillGemLevelWeapon" }], price: 1 },
      routes: [{
        id: "main",
        goal: [
          slot("A", "suffix", [W + "GlobalIncreaseColdSpellSkillGemLevelWeapon"]),
          slot("E", "prefix", [W + "Essence_WeaponCasterDamagePrefix"], "essence"),
          slot("C", "prefix", [W + "Desecrated_WeaponDamageTypePrefix"], "desecrated"),
          slot("F", "prefix", []),
          slot("G", "suffix", []),
          slot("H", "suffix", []),
        ],
        rules: [
          rule({ r: "m", E: 0 }, { use: "essence:greater:" + W + "Essence_WeaponCasterDamagePrefix" },
            ["マジックにグレーターエッセンスを打つと、スペルダメージが確実に付いてレアになる", "A Greater Essence on a magic item turns it rare with Spell Damage guaranteed"]),
          rule({ r: "r", C: 0, "p.hid": 0, "p.bad": 0, "p.n": 1 }, { use: "desecrate", omens: ["OmenofSinistralNecromancy", "OmenoftheLiege"] },
            ["元素ダメージはアマナムの冒涜のプレ。左手のネクロマンシーでプレに、君主のお告げでアマナムだけに絞る", "Elemental Damage is an Amanamu desecrated prefix: Sinistral Necromancy puts it on the prefix side, Omen of the Liege limits it to Amanamu"]),
          rule({ "p.hid": 1 }, { reveal: { echoes: false } },
            ["3 つの中に元素ダメージがあれば取る (動画は反響のお告げを使わない)", "Take Elemental Damage if it is among the 3 (the video skips Abyssal Echoes)"]),
          rule({ "p.bad": 1 }, { use: "annul", omens: ["OmenofLight"] },
            ["外れの冒涜は光のお告げ + 消去で冒涜だけ消して、もう一度骨から", "Remove the unwanted desecrated mod with Omen of Light + Annulment, then desecrate again"]),
          rule({ C: 2, n: 3 }, { use: "exalt_greater", omens: ["OmenofGreaterExaltation"] },
            ["偉大なる高貴なお告げで上級の高貴が 2 つ付ける。残りの枠をまとめて埋める", "Omen of Greater Exaltation makes the Greater Exalted Orb add 2 mods at once"]),
          rule({ C: 2, n: 5 }, { use: "exalt" },
            ["最後の 1 枠は普通の高貴で埋める", "Fill the last slot with an Exalted Orb"],
            ["動画は 2 つ付けて終わり (始めのマジックにプレが付いていたため)", "The video stops after 2 mods (its magic base already had a prefix)"]),
        ],
      }],
    },
  };
}

/**
 * 防具: 手袋 (コルの狩り入り、途中でアストリッド)。SaVeQ の手袋 (T7R90v2JvFI) の流れ:
 * 4 MOD のベースでスキルのレベルをフラクチャー (外れは買い直し) → 左の消去と左の完全な高貴でフラットダメージを 3 つ →
 * アストリッドの創造性 (作った MOD 2 つ) → 右の結晶化 + エッセンスでクリダメと耐性 (結晶化は右の MOD を 1 つ消すので外れたらやり直し)
 */
function gloves(): QuizTutorial {
  const G = "Gloves_dex_int/";
  const FLAT = ["PhysicalDamage", "FireDamage", "ColdDamage", "LightningDamage"].map((x) => G + x);
  const LEVEL = G + "Rune_marksman_IncreaseSocketedGemLevel__projectile_skill_gem_level";
  const CRIT = "essence:perfect:" + G + "PerfectEssence_CriticalStrikeMultiplier";
  const SPEED = "essence:perfect:" + G + "PerfectEssence_IncreasedAttackSpeed";
  return {
    id: "gloves", part: ["防具", "Armour"],
    learn: ["フラクチャーで土台・側のお告げで消去と高貴・ルーンで作った MOD を 2 つに・結晶化のエッセンス", "Fracture a base, side omens for Annul/Exalt, a rune for 2 crafted mods, Crystallisation essences"],
    source: "SaVeQ T7R90v2JvFI (data-cache/saveq-subtitles), メモ recipe-showcase",
    seed: 2,
    assumed: [
      ["コルの狩りはソケットバウンドで置き換えられない (クライアントの説明文)。なのでソケット 2 つ (規格外) の 2 つ目にアストリッドを足す形にした", "Kolr's Hunt is socket-bound and can't be replaced (client text), so Astrid's Creativity goes into a 2nd socket (Exceptional base)"],
      ["フラクチャーする MOD はコルの狩りの「全ての投射物スキルのレベル」(動画は近接のレベル)。コルの狩りの MOD の重みは公開データに無く仮", "The fractured mod is Kolr's Hunt's Projectile Skills level (the video uses Melee). Kolr's Hunt mod weights are not public (assumed)"],
      ["動画は深淵の印でアーケインサージを冒涜するが、ここでは冒涜を使わず 2 つ目のエッセンス (攻撃速度) にした", "The video desecrates Arcane Surge via the Abyssal mark; here a 2nd essence (Attack Speed) is used instead"],
      ["フラットダメージは段を問わない (動画は T2 以上)", "Flat damage of any tier (the video wants T2+)"],
    ],
    recipe: {
      v: 3, name: "Secured Wraps", base: "Secured Wraps", itemLevel: 82,
      start: { kind: "bought", mods: [{ mod: LEVEL }], fill: { prefix: 2, suffix: 2 }, sockets: 2, runes: ["Kolr's Hunt"], price: 1 },
      routes: [{
        id: "main",
        goal: [
          slot("A", "suffix", [LEVEL], "fractured"),
          slot("B", "prefix", FLAT), slot("C", "prefix", FLAT), slot("D", "prefix", FLAT),
          slot("E", "suffix", [G + "PerfectEssence_CriticalStrikeMultiplier"], "essence"),
          slot("F", "suffix", [G + "PerfectEssence_IncreasedAttackSpeed"], "essence"),
        ],
        rules: [
          rule({ A: 2, fx: 0 }, { use: "fracture" },
            ["MOD が 4 つの時のフラクチャーは 4 分の 1 で狙いが固定される。固定した MOD は消えない土台になる", "With 4 mods, Fracturing Orb locks the target 1 time in 4. A fractured mod never goes away"]),
          rule({ fx: 1, A: [0, 1, 2] }, RESTART,
            ["違う MOD が固定された。安いベースなので次のベースを買う", "The wrong mod got fractured. Bases are cheap, so buy the next one"]),
          rule({ A: 3, "p.junk": [1, 2, 3] }, { use: "annul", omens: ["OmenofSinistralAnnulment"] },
            ["左の消去のお告げでプレだけ消す。狙い以外のプレを減らす", "Omen of Sinistral Annulment removes a prefix only: clear the unwanted prefixes"]),
          rule({ A: 3, "p.junk": 0, "p.free": [1, 2, 3] }, { use: "exalt_perfect", omens: ["OmenofSinistralExaltation"] },
            ["左の高貴のお告げでプレに付ける。完全な高貴は段の高い物だけ", "Omen of Sinistral Exaltation adds a prefix; the Perfect Exalted Orb only rolls high tiers"]),
          rule({ A: 3, B: 2, C: 2, D: 2, aug: 1 }, { use: "rune:Astrid's Creativity" },
            ["エッセンスの MOD は普通 1 つまで。アストリッドの創造性を空いたソケットに差すと 2 つになる", "Only 1 essence mod is allowed; Astrid's Creativity in the free socket allows 2"]),
          rule({ A: 3, B: 2, C: 2, D: 2, aug: 2, E: 0, "s.junk": [1, 2] }, { use: CRIT, omens: ["OmenofDextralCrystallisation"] },
            ["右側の結晶化のお告げで、エッセンスが消す MOD をサフィに絞る (固定は消えない)", "Omen of Dextral Crystallisation makes the essence remove a suffix (the fractured one stays)"]),
          rule({ A: 3, B: 2, C: 2, D: 2, aug: 2, E: 2, F: 0, "s.junk": 1 }, { use: SPEED, omens: ["OmenofDextralCrystallisation"] },
            ["2 つ目のエッセンスも右の結晶化で。消えるのは外れかクリダメのどちらか (半々)", "Second essence with Dextral Crystallisation too: it removes either the junk suffix or Critical Damage (50/50)"],
            ["2 つ目のエッセンスは攻撃速度 (パーフェクト) にした。動画は印からの冒涜", "The 2nd essence is Attack Speed (Perfect); the video desecrates via the mark instead"]),
          rule({ A: 3, B: 2, C: 2, D: 2, aug: 2, "s.junk": 0, "s.free": [1, 2] }, { use: "exalt", omens: ["OmenofDextralExaltation"] },
            ["結晶化はサフィを 1 つ消す前提。消す物が無ければ右の高貴で 1 つ足しておく", "Crystallisation needs a suffix to remove: add one with Dextral Exaltation first"],
            ["動画には無い手 (結晶化で消す物を用意する)", "Not in the video (prepares a suffix for Crystallisation to remove)"]),
          rule({ A: 3, B: 2, C: 2, D: 2, aug: 2, E: 0, F: 2, "s.junk": 1 }, { use: CRIT, omens: ["OmenofDextralCrystallisation"] },
            ["攻撃速度は付いた。クリダメが消えていればもう一度", "Attack Speed is on; if Critical Damage got removed, apply it again"]),
        ],
      }],
    },
  };
}

/**
 * 指輪: 洗練されたブリーチリング。全耐性をフラクチャー + 耐性 2 (オーナー 2026-10-14「全耐性 1 つフラクチャー + 耐性 2」)。
 * 耐性の 1 つは右の消去と右の高貴で、もう 1 つは右手のネクロマンシーで冒涜の 2 種耐性 (反響のお告げ、外れは光のお告げ)
 */
function ring(): QuizTutorial {
  const R = "Rings/";
  const RES = ["FireResistance", "ColdResistance", "LightningResistance", "ChaosResistance"].map((x) => R + x);
  const DUAL = ["Desecrated_FireAndChaosDamageResistance", "Desecrated_ColdAndChaosDamageResistance", "Desecrated_LightningAndChaosDamageResistance"].map((x) => R + x);
  return {
    id: "ring", part: ["指輪", "Ring"],
    learn: ["フラクチャー・右の消去と右の高貴で 1 つずつ・右手のネクロマンシーと反響で冒涜", "Fracture, Dextral Annul/Exalt one at a time, desecrate with Dextral Necromancy + Echoes"],
    source: "メモ recipe-showcase (オーナーの指定)",
    seed: 1,
    assumed: [
      ["2 つ目の耐性を冒涜の 2 種耐性 (火と混沌など) で取る形は仮 (オーナーの指定は「耐性 2」だけ)", "Taking the 2nd resistance as a desecrated dual resistance is assumed (the owner only said “2 resistances”)"],
      ["プレは何でも良い (相場で決める所)", "Prefixes can be anything (depends on the market)"],
    ],
    recipe: {
      v: 3, name: "Refined Breach Ring", base: "Refined Breach Ring", itemLevel: 82,
      start: { kind: "bought", mods: [{ mod: R + "AllResistances" }], fill: { prefix: 2, suffix: 2 }, price: 1 },
      routes: [{
        id: "main",
        goal: [
          slot("A", "suffix", [R + "AllResistances"], "fractured"),
          slot("B", "suffix", RES),
          slot("C", "suffix", DUAL, "desecrated"),
          slot("P", "prefix", []), slot("Q", "prefix", []), slot("S", "prefix", []),
        ],
        rules: [
          rule({ A: 2, fx: 0 }, { use: "fracture" },
            ["全耐性の付いた 4 MOD のレアにフラクチャー。4 分の 1 で全耐性が固定される", "Fracture a 4-mod rare with All Resistances: 1 in 4 it gets locked"]),
          rule({ fx: 1, A: [0, 1, 2] }, RESTART,
            ["違う MOD が固定された。次のベースを買う", "The wrong mod got fractured. Buy the next base"]),
          rule({ A: 3, "s.junk": [1, 2] }, { use: "annul", omens: ["OmenofDextralAnnulment"] },
            ["右の消去のお告げでサフィだけ消す。狙い以外のサフィを外す", "Omen of Dextral Annulment removes a suffix only: clear the unwanted suffixes"]),
          rule({ A: 3, B: 0, "s.junk": 0, "s.hid": 0, "s.bad": 0, C: 0 }, { use: "exalt", omens: ["OmenofDextralExaltation"] },
            ["右の高貴のお告げでサフィに付ける。耐性が付くまで消去と交互", "Omen of Dextral Exaltation adds a suffix; alternate with Annulment until a resistance lands"]),
          rule({ A: 3, B: 2, C: 0, des: 0, "s.junk": 0, "s.hid": 0, "s.bad": 0 }, { use: "desecrate", omens: ["OmenofDextralNecromancy"] },
            ["右手のネクロマンシーのお告げで冒涜をサフィに。2 種耐性は冒涜にしか無い", "Omen of Dextral Necromancy desecrates a suffix; dual resistances only come from desecration"]),
          rule({ A: 3, B: 2, C: 0, des: 1, "s.hid": 0 }, { use: "annul", omens: ["OmenofLight"] },
            ["冒涜で普通の耐性が付いた。冒涜はアイテムに 1 つまでなので、光のお告げで消して骨からやり直す", "Desecration gave a plain resistance; only 1 desecrated mod is allowed, so remove it with Omen of Light and desecrate again"]),
          rule({ "s.hid": 1 }, { reveal: { echoes: true } },
            ["発現の 3 つに 2 種耐性が無ければ、アビスの反響のお告げでもう 3 つ見る", "If none of the 3 is a dual resistance, Omen of Abyssal Echoes shows 3 more"]),
          rule({ "s.bad": 1 }, { use: "annul", omens: ["OmenofLight"] },
            ["外れの冒涜は光のお告げ + 消去で冒涜だけ消す", "Omen of Light + Annulment removes only the unwanted desecrated mod"]),
          rule({ A: 3, B: 2, C: 2, "p.free": [1, 2, 3] }, { use: "exalt" },
            ["サフィが揃ったら高貴でプレを埋める (サフィに空きが無いのでプレに付く)", "Suffixes are done; Exalted Orbs now fill the prefixes (no suffix room left)"]),
        ],
      }],
    },
  };
}

/**
 * アミュレット: 不在のアミュレット (MOD はプレ 2・サフィ 2、マジックは 0 / 0)。メモ recipe-showcase の形:
 * スピリットをフラクチャー → 右の消去でサフィを 1 つ空けて冒涜 (反響) → 外れの冒涜は「右の結晶化 + エッセンス」で消してエッセンスに置き換える
 * (エッセンスで冒涜を消すリロール) → 当たりが付いたらエッセンスで残りのサフィ
 */
function amulet(): QuizTutorial {
  const A = "Amulets/";
  const ESS = "essence:perfect:" + A + "PerfectEssence_DamageTakenGainedAsLife";
  return {
    id: "amulet", part: ["アミュレット", "Amulet"],
    learn: ["枠の少ないベース・冒涜の外れをエッセンスで消すリロール", "A base with fewer slots, and rerolling a bad desecration with an essence"],
    source: "メモ recipe-showcase (オーナー「基礎が詰まって殿堂入り、エッセンスで冒涜を消すリロールも学べる」)",
    seed: 4,
    assumed: [
      ["固定する MOD はスピリット、冒涜の狙いは「全てのスキルのレベル +1」、エッセンスは「受けたダメージのライフ回収」のパーフェクト (オーナーの指定は形だけ)", "Spirit as the fractured mod, “+1 to Level of all Skills” as the desecration target, the Perfect “Damage taken Recouped as Life” essence (the owner only set the shape)"],
      ["2 つ目のプレは何でも良い", "The 2nd prefix can be anything"],
    ],
    recipe: {
      v: 3, name: "Absent Amulet", base: "Absent Amulet", itemLevel: 82,
      start: { kind: "bought", mods: [{ mod: A + "BaseSpirit" }], fill: { prefix: 2, suffix: 2 }, price: 1 },
      routes: [{
        id: "main",
        goal: [
          slot("A", "prefix", [A + "BaseSpirit"], "fractured"),
          slot("P", "prefix", []),
          slot("B", "suffix", [A + "Desecrated_IncreaseSocketedGemLevel"], "desecrated"),
          slot("E", "suffix", [A + "PerfectEssence_DamageTakenGainedAsLife"], "essence"),
        ],
        rules: [
          rule({ A: 2, fx: 0 }, { use: "fracture" },
            ["不在のアミュレットは MOD が 4 つで満杯。満杯の時のフラクチャーは 4 分の 1", "The Absent Amulet is full at 4 mods; Fracturing a full one locks the target 1 time in 4"]),
          rule({ fx: 1, A: [0, 1, 2] }, RESTART,
            ["違う MOD が固定された。次のベースを買う", "The wrong mod got fractured. Buy the next base"]),
          rule({ A: 3, "s.junk": 2 }, { use: "annul", omens: ["OmenofDextralAnnulment"] },
            ["冒涜には空いた枠が要る。右の消去でサフィを 1 つ空ける", "Desecration needs an open slot: free a suffix with Dextral Annulment"]),
          rule({ A: 3, B: 0, "s.free": 1, "s.hid": 0, "s.bad": 0 }, { use: "desecrate", omens: ["OmenofDextralNecromancy", "OmenoftheSovereign"] },
            ["スキルのレベルはウラマンの冒涜のサフィ。右手のネクロマンシーでサフィに、支配者のお告げでウラマンだけに", "+1 to all Skills is an Ulaman desecrated suffix: Dextral Necromancy for the suffix side, Omen of the Sovereign for Ulaman only"]),
          rule({ "s.hid": 1 }, { reveal: { echoes: true } },
            ["狙いが無ければアビスの反響のお告げでもう 3 つ", "No target among the 3? Abyssal Echoes shows 3 more"]),
          rule({ A: 3, "s.bad": 1, E: 0 }, { use: ESS, omens: ["OmenofDextralCrystallisation"] },
            ["外れの冒涜は、右の結晶化 + エッセンスで消してエッセンスの MOD に置き換える (もう 1 つのサフィが消えることもある)", "Replace the bad desecrated mod with an essence using Dextral Crystallisation (it may hit the other suffix instead)"]),
          rule({ A: 3, "s.bad": 1, E: 2 }, { use: "annul", omens: ["OmenofLight"] },
            ["エッセンスがもう付いている時は、光のお告げ + 消去で冒涜だけ消す", "If the essence is already on, remove just the desecrated mod with Omen of Light"]),
          rule({ A: 3, B: 2, E: 0, "s.junk": 1 }, { use: ESS, omens: ["OmenofDextralCrystallisation"] },
            ["当たりが付いた。残りのサフィをエッセンスに (半々で当たりが消える)", "Target landed; turn the other suffix into the essence (50/50 it removes the target instead)"]),
          rule({ A: 3, B: 0, E: 2, "s.junk": 1, "s.hid": 0 }, { use: "annul", omens: ["OmenofDextralAnnulment"] },
            ["エッセンスは付いた。冒涜の枠を右の消去で空ける", "Essence is on; free the slot for desecration with Dextral Annulment"]),
          rule({ A: 3, B: 2, E: 0, "s.free": 1 }, { use: ESS },
            ["空いた枠にエッセンス", "Essence into the open slot"],
            ["空きのあるレアにグレーターエッセンスが打てるかはエンジンの決まりどおり", "Whether a Greater Essence works on a rare with an open slot follows the engine's rule"]),
        ],
      }],
    },
  };
}

export const QUIZ_TUTORIALS: QuizTutorial[] = [wand(), gloves(), ring(), amulet()];
