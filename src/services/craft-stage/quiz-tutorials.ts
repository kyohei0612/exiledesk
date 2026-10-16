/**
 * quiz-tutorials.ts — クラフトのチュートリアル 4 本 (2026-10-16、ADR-003 のクイズのレシピの見本)。
 *
 * オーナー 2026-10-14「クラフトチュートリアルにする。全部クイズ形式 (次はどれを打つ? を選ばせて案内)。無難でどの装備でも使える物を 4 本」
 * (メモ recipe-showcase): 武器 = 決闘のワンド、防具 = 手袋 (コルの狩り + アストリッド)、指輪 = 洗練されたブリーチリング
 * (全耐性フラクチャー + 触媒で耐性 2)、アミュレット = 不在のアミュレット (全部入りのコース)。
 * 2026-10-16 オーナー:
 *   - 「100% 完成させたらいい、最安値は気にしなくていいけど出来るだけ安いルート」
 *   - 「命令通りに ○○ をするには? と質問を投げかけて 3 択に。明確に ○× できる」→ 答えごとに ask (問い) と decoys (外れ 2 つと理由)
 *   - 「どのクラフトでも小テク付き」: ワンド = エッセンスでレア化と勢力のお告げ、手袋 = 4 MOD のフラクチャーベースとアストリッド、
 *     指輪 = 触媒 (品質を溜めて触媒の高貴、種類を替えると 0 から)、アミュレット = 3 MOD + 未発現でフラクチャー 3 分の 1・冒涜・エッセンスのリロール・カオススパム
 *
 * 1 本 = クイズのレシピ (quiz-recipe.ts の型そのまま) + 答えごとの問い・理由・外れ。打ち方はシミュレーターと同じ applyQuizAction。
 * 資料で決まらない所は assumed (画面に「仮」) に書く。値段は使わない (費用は出さず、打った数だけ出す)。
 */
import type { QuizAction, QuizRecipe, QuizRule, QuizSlot } from "./quiz-recipe";

/** 日本語と英語の組 (画面の言葉。ゲームの言葉はキーからクライアントの名前で出す) */
export type JaEn = readonly [string, string];
/** 外れの選択肢と、なぜ違うか */
export interface TutorialDecoy { do: QuizAction; why: JaEn }
export interface TutorialRule extends QuizRule {
  /** 問い (「○○をするには?」) */
  ask: JaEn;
  /** この手を打つ理由 (正解の後に出す) */
  why: JaEn;
  /** 外れの選択肢 2 つ (正解と合わせて 3 択) */
  decoys: readonly [TutorialDecoy, TutorialDecoy];
  /** 資料で決まらず仮にした手 (画面に「仮」) */
  assumed?: JaEn;
}
export interface QuizTutorial {
  id: string;
  /** 作る難しさ (1 入門 / 2 初級 / 3 中級 / 4 上級)。一覧は難しさごとに並べる (2026-10-17 オーナー「作成難易度順に、難易度ごとに表示」) */
  level: 1 | 2 | 3 | 4;
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
const d = (a: QuizAction, ja: string, en: string): TutorialDecoy => ({ do: a, why: [ja, en] });
const rule = (when: TutorialRule["when"], a: QuizAction, ask: JaEn, why: JaEn, decoys: readonly [TutorialDecoy, TutorialDecoy], assumed?: JaEn): TutorialRule =>
  ({ when, do: a, ask, why, decoys, ...(assumed ? { assumed } : {}) });
const RESTART = { restart: true } as const;
const use = (k: string, ...omens: string[]): QuizAction => (omens.length ? { use: k, omens } : { use: k });

// よく使う外れ
const DIVINE_LOCK = d(use("divine"), "神のオーブは数値を振り直すだけ。MOD は固定されない", "A Divine Orb only rerolls values; it locks nothing");
const ANNUL_LOCK = d(use("annul"), "消去は MOD を 1 つ消すだけ。狙いが消えることもある", "Annulment just removes a random mod, maybe the target");
const ANNUL_FRACTURED = d(use("annul"), "固定した MOD は消去で消えない", "Fractured mods can't be annulled");
const FRACTURE_TWICE = d(use("fracture"), "フラクチャーは 1 つのアイテムに 1 回まで", "Only one Fracture per item");
const CHAOS_ANY = d(use("chaos"), "カオスは消す MOD を選べず、すぐ別の MOD を足す", "Chaos can't choose what it removes and adds a new mod right away");

/**
 * 武器: 決闘のワンド。SaVeQ のグリムピラーのワンド (qdyfBnzqBLo) の流れ:
 * 冷気スペルのレベル付きのマジックを買う → スペルダメージのグレーターエッセンス → 左手のネクロマンシー + 君主のお告げで冒涜 (プレ) →
 * 発現で元素ダメージ (外れは光のお告げ) → 偉大なる高貴なお告げ + 上級の高貴で 2 つ → 残りを高貴
 */
function wand(): QuizTutorial {
  const W = "Wands/";
  const ESS = "essence:greater:" + W + "Essence_WeaponCasterDamagePrefix";
  return {
    id: "wand", level: 1, part: ["武器", "Weapon"],
    learn: ["エッセンスでレアにする・側と勢力のお告げで冒涜を狙う・外れは光のお告げ", "Essence to rare, desecrate with side + faction omens, Omen of Light on a miss"],
    source: "SaVeQ qdyfBnzqBLo (data-cache/saveq-subtitles), IgQX6EZtUyo",
    seed: 3,
    assumed: [
      ["ベースは決闘のワンド (動画はベースを言っていない)", "Base is Dueling Wand (the video does not name the base)"],
      ["始めは「冷気スペルのレベル」だけのマジックを買う形 (動画はプレフィックスも付いたマジックを買っている)", "Starts from a magic wand with only Cold Spell level (the video buys magic wands that also have a prefix)"],
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
          rule({ r: "m", E: 0 }, use(ESS),
            ["マジックのワンドを、スペルダメージ付きのレアにするには?", "Turn the magic wand into a rare with Spell Damage?"],
            ["マジックにグレーターエッセンスを打つと、スペルダメージが確実に付いてレアになる", "A Greater Essence on a magic item turns it rare with Spell Damage guaranteed"],
            [d(use("regal"), "王者のオーブでもレアになるが、付く MOD はランダム", "A Regal Orb also makes it rare, but the mod is random"),
              d(use("alchemy"), "錬金はノーマルにしか使えない", "Alchemy only works on normal items")]),
          rule({ r: "r", C: 0, "p.hid": 0, "p.bad": 0, "p.n": 1 }, use("desecrate", "OmenofSinistralNecromancy", "OmenoftheLiege"),
            ["プレフィックスにアマナムの冒涜 MOD (元素ダメージ) を狙うには?", "Aim for an Amanamu desecrated prefix (Elemental Damage)?"],
            ["元素ダメージはアマナムの冒涜のプレフィックス。左手のネクロマンシーでプレフィックスに、君主のお告げで候補をアマナムだけに", "Elemental Damage is an Amanamu desecrated prefix: Sinistral Necromancy for the prefix side, Omen of the Liege for Amanamu-only options"],
            [d(use("desecrate", "OmenofDextralNecromancy", "OmenoftheLiege"), "右手のネクロマンシーはサフィックスに付ける", "Dextral Necromancy puts it on the suffix side"),
              d(use("desecrate", "OmenofSinistralNecromancy", "OmenoftheSovereign"), "支配者のお告げはウラマン。元素ダメージはアマナム", "Omen of the Sovereign is Ulaman; Elemental Damage is Amanamu")]),
          rule({ "p.hid": 1 }, { reveal: { echoes: false } },
            ["未発現の冒涜 MOD から狙いを取るには?", "Get the target out of the unrevealed desecrated mod?"],
            ["発現して 3 つの中に元素ダメージがあれば取る (動画は反響のお告げを使わない)", "Reveal and take Elemental Damage if it is among the 3 (the video skips Abyssal Echoes)"],
            [d(use("annul", "OmenofLight"), "光のお告げは冒涜の MOD を消す。まず発現して中身を見る", "Omen of Light removes desecrated mods; reveal it first"), DIVINE_LOCK]),
          rule({ "p.bad": 1 }, use("annul", "OmenofLight"),
            ["外れた冒涜 MOD だけを消すには?", "Remove only the wrong desecrated mod?"],
            ["光のお告げ + 消去で冒涜だけ消して、もう一度骨から", "Omen of Light + Annulment removes only the desecrated mod; then desecrate again"],
            [d(use("annul", "OmenofSinistralAnnulment"), "左の消去はプレフィックスのどれか。エッセンスのスペルダメージまで消えることがある", "Sinistral Annulment hits any prefix, the essence mod included"), CHAOS_ANY]),
          rule({ C: 2, n: 3 }, use("exalt_greater", "OmenofGreaterExaltation"),
            ["空いた 3 枠のうち 2 つをまとめて埋めるには?", "Fill 2 of the 3 open slots at once?"],
            ["偉大なる高貴なお告げで上級の高貴が 2 つ付ける。段の低い MOD も出ない", "Omen of Greater Exaltation makes the Greater Exalted Orb add 2 mods, and no low tiers"],
            [d(use("exalt"), "普通の高貴は 1 つずつ", "A plain Exalted Orb adds only 1"),
              d(use("chaos_greater"), "カオスは消してから付ける。今ある MOD が減る", "Chaos removes a mod before adding one")]),
          rule({ C: 2, n: 5 }, use("exalt"),
            ["最後の 1 枠を埋めるには?", "Fill the last slot?"],
            ["最後の 1 枠は普通の高貴で埋める", "Fill the last slot with an Exalted Orb"],
            [d(use("exalt_greater", "OmenofGreaterExaltation"), "空きが 1 つだと 1 つしか付かない。高くつくだけ", "With one slot it only adds 1; it just costs more"),
              d(use("annul"), "消去は MOD を減らす", "Annulment removes a mod")],
            ["動画は 2 つ付けて終わり (始めのマジックにプレフィックスが付いていたため)", "The video stops after 2 mods (its magic base already had a prefix)"]),
        ],
      }],
    },
  };
}

/**
 * 防具: 手袋 (コルの狩り + アストリッド)。SaVeQ の手袋 (T7R90v2JvFI) の流れ:
 * 4 MOD のベースでスキルのレベルをフラクチャー (外れは買い直し) → 左の消去と左の完全な高貴でフラットダメージを 3 つ →
 * アストリッドの創造性 (作った MOD 2 つ) → 右の結晶化 + エッセンスでクリダメと攻撃速度 (結晶化は右の MOD を 1 つ消すので外れたらやり直し)
 */
function gloves(): QuizTutorial {
  const G = "Gloves_dex_int/";
  const FLAT = ["PhysicalDamage", "FireDamage", "ColdDamage", "LightningDamage"].map((x) => G + x);
  const LEVEL = G + "Rune_marksman_IncreaseSocketedGemLevel__projectile_skill_gem_level";
  const CRIT = "essence:perfect:" + G + "PerfectEssence_CriticalStrikeMultiplier";
  const SPEED = "essence:perfect:" + G + "PerfectEssence_IncreasedAttackSpeed";
  const critWrong = [
    d(use(CRIT, "OmenofSinistralCrystallisation"), "左の結晶化はプレフィックスを消す。フラットダメージが減る", "Sinistral Crystallisation removes a prefix (flat damage)"),
    d(use(CRIT), "お告げ無しだと、プレフィックスのフラットダメージが消えることがある", "Without an omen it may remove a flat damage prefix"),
  ] as const;
  return {
    id: "gloves", level: 3, part: ["防具", "Armour"],
    learn: ["4 MOD のベースをフラクチャー・側のお告げで消去と高貴・アストリッドでエッセンス 2 つ・結晶化", "Fracture a 4-mod base, side omens for Annul/Exalt, Astrid for 2 essences, Crystallisation"],
    source: "SaVeQ T7R90v2JvFI (data-cache/saveq-subtitles), メモ recipe-showcase",
    seed: 2,
    assumed: [
      ["コルの狩りはソケットバウンドで置き換えられない (クライアントの説明文)。ソケット 2 つ (規格外) の 2 つ目にアストリッドを差す (2026-10-16 オーナー「2 ソケにしたらええ」)", "Kolr's Hunt is socket-bound and can't be replaced (client text), so Astrid's Creativity goes into the 2nd socket of an Exceptional base (owner, 2026-10-16)"],
      ["フラクチャーする MOD はコルの狩りの「全ての投射物スキルのレベル」(動画は近接のレベル)。コルの狩りの MOD の重みは公開データに無く仮", "The fractured mod is Kolr's Hunt's Projectile Skills level (the video uses Melee). Kolr's Hunt mod weights are not public (assumed)"],
      ["2 つ目のエッセンスは適応の合金 (ルーンワードが最大値未満の間アタックスピード)。動画は印からの冒涜で、「エッセンスか合金ならどれでも良い」と言っている", "The 2nd one is Adaptive Alloy (Attack Speed while missing Runic Ward). The video desecrates via the mark and says any essence or alloy works"],
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
          rule({ A: 2, fx: 0 }, use("fracture"),
            ["投射物スキルのレベルを、消えない土台にするには?", "Lock Projectile Skills level so it never goes away?"],
            ["MOD が 4 つのレアにフラクチャー。4 分の 1 で狙いが固定され、固定した MOD は消えない土台になる", "Fracture a 4-mod rare: 1 time in 4 the target locks, and a fractured mod never goes away"],
            [DIVINE_LOCK, d(use("exalt"), "高貴は MOD を足すだけ。それに 5 つになるとフラクチャーの当たりが 5 分の 1 に下がる", "Exalted only adds a mod, and with 5 mods the Fracture odds drop to 1 in 5")]),
          rule({ fx: 1, A: [0, 1, 2] }, RESTART,
            ["違う MOD が固定された。どうする?", "The wrong mod got fractured. What now?"],
            ["安いベースなので次のベースを買う", "Bases are cheap, so buy the next one"],
            [ANNUL_FRACTURED, FRACTURE_TWICE]),
          rule({ A: 3, "p.junk": [1, 2, 3] }, use("annul", "OmenofSinistralAnnulment"),
            ["プレフィックスの狙い以外を消すには?", "Remove the unwanted prefixes?"],
            ["左の消去のお告げでプレフィックスだけ消す", "Omen of Sinistral Annulment removes a prefix only"],
            [d(use("annul", "OmenofDextralAnnulment"), "右の消去はサフィックスを消す", "Dextral Annulment removes a suffix"), CHAOS_ANY]),
          rule({ A: 3, "p.junk": 0, "p.free": [1, 2, 3] }, use("exalt_perfect", "OmenofSinistralExaltation"),
            ["プレフィックスに段の高いフラットダメージを足すには?", "Add a high-tier flat damage prefix?"],
            ["左の高貴のお告げでプレフィックスに付ける。完全な高貴は段の高い物だけ", "Omen of Sinistral Exaltation adds a prefix; the Perfect Exalted Orb only rolls high tiers"],
            [d(use("exalt", "OmenofDextralExaltation"), "右の高貴はサフィックスに付く", "Dextral Exaltation adds a suffix"),
              d(use("exalt"), "普通の高貴はサフィックスにも付き、段も低い物が出る", "A plain Exalted Orb can land on suffixes and low tiers")]),
          rule({ A: 3, B: 2, C: 2, D: 2, aug: 1 }, use("rune:Astrid's Creativity"),
            ["エッセンスの MOD を 2 つ持てるようにするには?", "Allow 2 essence mods?"],
            ["エッセンスの MOD は普通 1 つまで。アストリッドの創造性を空いたソケットに差すと 2 つになる", "Only 1 essence mod is allowed; Astrid's Creativity in the free socket allows 2"],
            [d(use("artificer"), "熟練工はソケットを足すだけ。2 つ目のソケットはもうある", "Artificer's adds a socket; the 2nd socket is already there"),
              d(use("rune:Greater Iron Rune"), "鉄のルーンは物理ダメージを足すだけ", "An Iron Rune only adds physical damage")]),
          rule({ A: 3, B: 2, C: 2, D: 2, aug: 2, E: 0, "s.junk": [1, 2] }, use(CRIT, "OmenofDextralCrystallisation"),
            ["固定を残したまま、サフィックスにクリダメのエッセンスを入れるには?", "Put the Critical Damage essence on a suffix, keeping the fractured mod?"],
            ["右側の結晶化のお告げで、エッセンスが消す MOD をサフィックスに絞る (固定は消えない)", "Omen of Dextral Crystallisation makes the essence remove a suffix (the fractured one stays)"],
            critWrong),
          rule({ A: 3, B: 2, C: 2, D: 2, aug: 2, E: 2, F: 0, "s.junk": 1 }, use(SPEED, "OmenofDextralCrystallisation"),
            ["2 つ目のエッセンスの枠に攻撃速度を入れるには?", "Add Attack Speed in the 2nd essence slot?"],
            ["合金もエッセンスと同じく右の結晶化で。消えるのは外れかクリダメのどちらか (半々)", "The alloy works like an essence: with Dextral Crystallisation it removes either the junk suffix or Critical Damage (50/50)"],
            [d(use(SPEED, "OmenofSinistralCrystallisation"), "左の結晶化はプレフィックスのフラットダメージを消す", "Sinistral Crystallisation removes a flat damage prefix"),
              d(use("exalt", "OmenofDextralExaltation"), "高貴だと攻撃速度が付くとは限らない。合金なら確実", "An Exalted Orb won't guarantee Attack Speed; the alloy does")],
            ["2 つ目は適応の合金にした。動画は印からの冒涜", "The 2nd one is Adaptive Alloy; the video desecrates via the mark instead"]),
          rule({ A: 3, B: 2, C: 2, D: 2, aug: 2, "s.junk": 0, "s.free": [1, 2] }, use("exalt", "OmenofDextralExaltation"),
            ["結晶化で消す物がサフィックスに無い。先にどうする?", "Nothing on the suffixes for Crystallisation to remove. What first?"],
            ["結晶化はサフィックスを 1 つ消す前提。消す物が無ければ右の高貴で 1 つ足しておく", "Crystallisation needs a suffix to remove: add one with Dextral Exaltation first"],
            [d(use("annul", "OmenofDextralAnnulment"), "消すと減るだけ。消す物を増やしたい", "Annulling only removes more; we need one more suffix"),
              d(use(CRIT, "OmenofDextralCrystallisation"), "消す物が無いと結晶化の側から消せない", "With nothing to remove, Crystallisation can't work on that side")],
            ["動画には無い手 (結晶化で消す物を用意する)", "Not in the video (prepares a suffix for Crystallisation to remove)"]),
          rule({ A: 3, B: 2, C: 2, D: 2, aug: 2, E: 0, F: 2, "s.junk": 1 }, use(CRIT, "OmenofDextralCrystallisation"),
            ["消えたクリダメを付け直すには?", "Re-apply the lost Critical Damage?"],
            ["攻撃速度は付いた。クリダメが消えていればもう一度右の結晶化 + エッセンス", "Attack Speed is on; if Critical Damage got removed, apply it again with Dextral Crystallisation"],
            critWrong),
        ],
      }],
    },
  };
}

/**
 * 指輪: 洗練されたブリーチリング。全耐性をフラクチャー + 耐性 2 (オーナー 2026-10-14「全耐性 1 つフラクチャー + 耐性 2」)。
 * 耐性 2 つは触媒で (2026-10-16 オーナー「指輪は触媒関連、特にクラフトで使うような仕組みでクイズ進行」):
 * ゾフのカタリストで火の品質 → 触媒の高貴 + 右の高貴のお告げで火耐性 → トゥルのカタリスト (種類を替えると品質は 0 から) で冷気耐性
 */
function ring(): QuizTutorial {
  const R = "Rings/";
  const CAT_DEXTRAL = use("exalt", "OmenofCatalysingExaltation", "OmenofDextralExaltation");
  return {
    id: "ring", level: 2, part: ["指輪", "Ring"],
    learn: ["フラクチャー・触媒で品質を溜めて触媒の高貴・種類を替えると品質は 0 から", "Fracture, build catalyst quality for Catalysing Exaltation, switching catalyst types resets quality"],
    source: "メモ recipe-showcase (オーナーの指定)、触媒の倍率は Craft of Exile の式",
    seed: 1,
    assumed: [
      ["2 つの耐性は火と冷気 (オーナーの指定は「耐性 2」だけ)", "The 2 resistances are Fire and Cold (the owner only said “2 resistances”)"],
      ["プレフィックスは何でも良い (相場で決める所)", "Prefixes can be anything (depends on the market)"],
    ],
    recipe: {
      v: 3, name: "Refined Breach Ring", base: "Refined Breach Ring", itemLevel: 82,
      start: { kind: "bought", mods: [{ mod: R + "AllResistances" }], fill: { prefix: 2, suffix: 2 }, price: 1 },
      routes: [{
        id: "main",
        goal: [
          slot("A", "suffix", [R + "AllResistances"], "fractured"),
          slot("B", "suffix", [R + "FireResistance"]),
          slot("C", "suffix", [R + "ColdResistance"]),
          slot("P", "prefix", []), slot("Q", "prefix", []), slot("S", "prefix", []),
        ],
        rules: [
          rule({ A: 2, fx: 0 }, use("fracture"),
            ["全耐性を消えない土台にするには?", "Lock All Resistances as a permanent base?"],
            ["全耐性の付いた 4 MOD のレアにフラクチャー。4 分の 1 で全耐性が固定される", "Fracture a 4-mod rare with All Resistances: 1 in 4 it gets locked"],
            [DIVINE_LOCK, ANNUL_LOCK]),
          rule({ fx: 1, A: [0, 1, 2] }, RESTART,
            ["違う MOD が固定された。どうする?", "The wrong mod got fractured. What now?"],
            ["次のベースを買う", "Buy the next base"],
            [ANNUL_FRACTURED, FRACTURE_TWICE]),
          rule({ A: 3, "s.junk": [1, 2] }, use("annul", "OmenofDextralAnnulment"),
            ["サフィックスの狙い以外を消すには?", "Remove the unwanted suffixes?"],
            ["右の消去のお告げでサフィックスだけ消す", "Omen of Dextral Annulment removes a suffix only"],
            [d(use("annul", "OmenofSinistralAnnulment"), "左の消去はプレフィックスを消す", "Sinistral Annulment removes a prefix"), CHAOS_ANY]),
          rule({ A: 3, B: 0, "s.junk": 0 }, use("catalyst_fire"),
            ["火耐性を付きやすくする準備は?", "Prepare to make Fire Resistance more likely?"],
            ["ゾフのカタリストで火の品質を上限まで溜める (この指輪は暗黙の「品質の最大値 +25%」で 45%)。火のタグの MOD (火耐性) が重く引かれるようになる", "Fill fire quality to the cap with Xoph's Catalysts (45% on this ring thanks to its +25% maximum quality implicit): fire-tagged mods (Fire Resistance) get weighted up"],
            [d(use("catalyst_cold"), "トゥルのカタリストは冷気の MOD を重くする", "Tul's Catalyst boosts cold mods"),
              d(use("exalt", "OmenofDextralExaltation"), "品質が無いと、火耐性も他のサフィックスと同じ確率", "Without quality, Fire Resistance is as likely as any other suffix")]),
          rule({ A: 3, B: 0, "s.junk": 0, cat: "fire" }, CAT_DEXTRAL,
            ["火の品質を使って、サフィックスに火耐性を狙うには?", "Use the fire quality to aim Fire Resistance on a suffix?"],
            ["触媒の高貴のお告げで品質の分だけ火の MOD を重く (品質 45% で 8 倍)、右の高貴のお告げでサフィックスに。品質は使い切る", "Catalysing Exaltation weights fire mods by the quality (8x at 45% quality), Dextral Exaltation puts it on a suffix. The quality is used up"],
            [d(use("exalt", "OmenofCatalysingExaltation"), "側のお告げが無いとプレフィックスに付くこともある", "Without a side omen it may land on a prefix"),
              d(use("exalt", "OmenofDextralExaltation"), "触媒の高貴のお告げが無いと品質は効かない", "Without Catalysing Exaltation the quality does nothing")]),
          rule({ A: 3, B: 2, C: 0, "s.junk": 0 }, use("catalyst_cold"),
            ["次は冷気耐性。品質をどうする?", "Next is Cold Resistance. What about the quality?"],
            ["トゥルのカタリストで冷気の品質を溜める。種類の違うカタリストは品質を 0 から積み直す (前の品質は消える)", "Build cold quality with Tul's Catalysts. A different catalyst type starts over from 0 (the old quality is gone)"],
            [d(use("catalyst_fire"), "火の品質は冷気耐性には効かない", "Fire quality doesn't help Cold Resistance"),
              d(CAT_DEXTRAL, "品質が 0 だと触媒の高貴の倍率がかからない", "At 0 quality Catalysing Exaltation boosts nothing")]),
          rule({ A: 3, B: 2, C: 0, "s.junk": 0, cat: "cold" }, CAT_DEXTRAL,
            ["冷気の品質で、サフィックスに冷気耐性を狙うには?", "Use the cold quality to aim Cold Resistance on a suffix?"],
            ["火の時と同じく、触媒の高貴 + 右の高貴のお告げ", "Same as before: Catalysing + Dextral Exaltation"],
            [d(use("exalt", "OmenofCatalysingExaltation"), "側のお告げが無いとプレフィックスに付くこともある", "Without a side omen it may land on a prefix"),
              d(use("chaos"), "カオスは今あるサフィックスを消すことがある", "Chaos may remove a suffix you already have")]),
          rule({ A: 3, B: 2, C: 2, "p.free": [1, 2, 3] }, use("exalt"),
            ["サフィックスが揃った。プレフィックスを埋めるには?", "Suffixes are done. Fill the prefixes?"],
            ["サフィックスに空きが無いので、普通の高貴はプレフィックスに付く", "No suffix room is left, so a plain Exalted Orb goes to the prefixes"],
            [d(use("exalt", "OmenofDextralExaltation"), "右の高貴はサフィックスに付けたい時。サフィックスはもう満杯", "Dextral Exaltation is for suffixes, which are full"),
              d(use("chaos"), "カオスは揃ったサフィックスを消すことがある", "Chaos may remove a finished suffix")]),
        ],
      }],
    },
  };
}

/**
 * アミュレット: 不在のアミュレット。全部入りのコース (2026-10-16 オーナー「ガチ構築クラフトでフラクチャー、冒涜、
 * カオススパム、エッセンスリロールも学ばしたい。深淵エッセンス冒涜の 3 MOD フラクチャーとか」):
 * 3 MOD のアミュレットに冒涜で未発現を足して 4 MOD (未発現・冒涜はフラクチャーで選ばれない) → スピリットが 3 分の 1 で固定 →
 * 壁の未発現を光のお告げで外す → サフィをカオススパム (右の抹消) で全元素耐性 → 空いたサフィに冒涜、発現 (反響) で全てのスキルのレベル
 * (外れは光のお告げで消して冒涜し直す) → プレの外れを左の結晶化 + エッセンスでグローバル防御 (固定のスピリットは消えないので必ず外れが消える)。
 * 不在のアミュレットはプレ 2・サフィ 2 まで。
 * エッセンスは 2026-10-16 オーナー「グローバル防御にしようか」(前は受けたダメージのライフ回収、サフィ)
 */
function amulet(): QuizTutorial {
  const A = "Amulets/";
  const ESS = "essence:perfect:" + A + "PerfectEssence_AllDefences";
  const DES = use("desecrate", "OmenofDextralNecromancy", "OmenoftheSovereign");
  const desWrong = [
    d(use("desecrate", "OmenofDextralNecromancy", "OmenoftheLiege"), "君主のお告げはアマナム。スキルのレベルはウラマン", "Omen of the Liege is Amanamu; the skill level is Ulaman"),
    d(use("desecrate", "OmenofSinistralNecromancy", "OmenoftheSovereign"), "左手のネクロマンシーはプレフィックスに付ける", "Sinistral Necromancy puts it on the prefix side"),
  ] as const;
  return {
    id: "amulet", level: 4, part: ["アミュレット", "Amulet"],
    learn: ["未発現で 3 分の 1 のフラクチャー・光のお告げで壁を外す・カオススパム・冒涜と反響・固定を盾に結晶化でエッセンス", "1-in-3 Fracture with an unrevealed wall, Omen of Light to drop the wall, chaos spam, desecration + Echoes, essence with Crystallisation behind the fractured mod"],
    source: "メモ recipe-showcase (オーナー「基礎が詰まって殿堂入り」「ガチ構築クラフト」)",
    seed: 4,
    assumed: [
      ["固定する MOD はスピリット、冒涜の狙いは「全てのスキルのレベル +1」、カオススパムの狙いは全元素耐性 (エッセンスはオーナーの指定でグローバル防御、不在のアミュレットはプレフィックス 2 つまでなのでカオススパムはサフィックス)", "Spirit as the fractured mod, “+1 to Level of all Skills” as the desecration target, all Elemental Resistances for the chaos spam (the Global Defences essence is the owner's pick; Absent Amulet has only 2 prefixes, so the chaos spam is on a suffix)"],
    ],
    recipe: {
      v: 3, name: "Absent Amulet", base: "Absent Amulet", itemLevel: 82,
      start: { kind: "bought", mods: [{ mod: A + "BaseSpirit" }], fill: { prefix: 2, suffix: 1 }, price: 1 },
      routes: [{
        id: "main",
        goal: [
          slot("A", "prefix", [A + "BaseSpirit"], "fractured"),
          slot("E", "prefix", [A + "PerfectEssence_AllDefences"], "essence"),
          slot("S", "suffix", [A + "AllResistances"]),
          slot("B", "suffix", [A + "Desecrated_IncreaseSocketedGemLevel"], "desecrated"),
        ],
        rules: [
          rule({ A: 2, fx: 0, des: 0 }, use("desecrate"),
            ["フラクチャーは冒涜の MOD を選ばない。3 MOD のうちにフラクチャーの当たりを 3 分の 1 にする小テクは?", "Fracture never picks a Desecrated mod. The trick to make the Fracture odds 1 in 3 with 3 mods?"],
            ["空いたサフィックスに冒涜で未発現の MOD を足して 4 MOD にする。未発現は 4 つの数に入るのにフラクチャーでは選ばれない (壁)", "Desecrate the open suffix: the unrevealed mod counts toward the 4 but is never fractured (a wall)"],
            [d(use("exalt"), "普通の MOD を足すと 4 分の 1 になる", "A normal mod makes it 1 in 4"), DIVINE_LOCK]),
          rule({ A: 2, fx: 0, des: 1 }, use("fracture"),
            ["スピリットを固定するには?", "Lock the Spirit?"],
            ["未発現の冒涜は選ばれないので、残り 3 つから 3 分の 1 でスピリットが固定される", "The unrevealed mod is skipped, so Spirit locks 1 time in 3"],
            [d({ reveal: { echoes: true } }, "発現すると普通の冒涜 MOD になる。未発現のうちにフラクチャーする", "Revealing gains nothing here; fracture while it's still unrevealed"), DIVINE_LOCK]),
          rule({ fx: 1, A: [0, 1, 2] }, RESTART,
            ["違う MOD が固定された。どうする?", "The wrong mod got fractured. What now?"],
            ["次のベースを買う", "Buy the next base"],
            [ANNUL_FRACTURED, FRACTURE_TWICE]),
          rule({ A: 3, S: 0, "s.hid": 1 }, use("annul", "OmenofLight"),
            ["壁の役目は終わった。サフィックスをカオススパムするために、未発現の冒涜だけ外すには?", "The wall has done its job. Remove only the unrevealed mod so the suffix can be chaos spammed?"],
            ["光のお告げ + 消去で冒涜の MOD だけ消す。冒涜が残っているとカオスで消えることもあり、狙いの冒涜は後で付け直す", "Omen of Light + Annulment removes only the desecrated mod; the real desecration comes later"],
            [d({ reveal: { echoes: true } }, "発現するとサフィックスが 2 つ埋まり、カオススパムで当たりも消える", "Revealing fills both suffixes, and the chaos spam would hit it"),
              d(use("annul"), "お告げ無しの消去はプレフィックスやサフィックスの外れを消すこともあり、壁が残る", "Plain Annulment may hit a junk prefix or suffix and leave the wall")]),
          rule({ A: 3, S: 0, "s.hid": 0, "s.bad": 0, des: 0 }, use("chaos", "OmenofDextralErasure"),
            ["サフィックスの外れを全元素耐性に変えるには?", "Turn the junk suffix into all Elemental Resistances?"],
            ["右の抹消のお告げ + カオスでサフィックスだけ振り直す (カオススパム)。プレフィックスは満杯なので、足される MOD もサフィックス", "Dextral Erasure + Chaos rerolls only a suffix (chaos spam); prefixes are full, so the new mod is a suffix too"],
            [d(use("chaos"), "お告げ無しのカオスはプレフィックスの外れも消す。プレフィックスは後でエッセンスの置き場", "Chaos without an omen may hit the prefix, which is saved for the essence"),
              d(use("chaos", "OmenofSinistralErasure"), "左の抹消はプレフィックスを消す", "Sinistral Erasure removes a prefix")]),
          rule({ A: 3, S: 2, "s.hid": 1 }, { reveal: { echoes: true } },
            ["未発現の MOD を、なるべく狙いが出るように発現するには?", "Reveal the unrevealed mod with the best chance at the target?"],
            ["アビスの反響のお告げを掛けて発現。3 つに狙いが無ければもう 3 つ見られる", "Reveal with Omen of Abyssal Echoes: if the 3 options miss, you see 3 more"],
            [d({ reveal: { echoes: false } }, "反響のお告げが無いと、外れた時にもう 3 つ見られない", "Without Abyssal Echoes there's no second set of 3"),
              d(use("annul", "OmenofLight"), "光のお告げは冒涜を消す。まず中身を見る", "Omen of Light removes the desecrated mod; look inside first")]),
          rule({ A: 3, "s.bad": 1 }, use("annul", "OmenofLight"),
            ["外れた冒涜 MOD だけを消すには?", "Remove only the wrong desecrated mod?"],
            ["光のお告げ + 消去で冒涜の MOD だけ消す。耐性は残る", "Omen of Light + Annulment removes only the desecrated mod; the resistances stay"],
            [d(use("annul", "OmenofDextralAnnulment"), "右の消去は全元素耐性を消すこともある", "Dextral Annulment may remove the resistances instead"), CHAOS_ANY]),
          rule({ A: 3, S: 2, B: 0, "s.free": 1, "s.hid": 0, "s.bad": 0 }, DES,
            ["空いたサフィックスにウラマンの冒涜 MOD (スキルのレベル) を狙うには?", "Aim an Ulaman desecrated suffix (skill level) in the open slot?"],
            ["右手のネクロマンシーでサフィックスに、支配者のお告げでウラマンだけに", "Dextral Necromancy for the suffix side, Omen of the Sovereign for Ulaman only"],
            desWrong),
          rule({ A: 3, S: 2, B: 2, E: 0, "p.junk": 1 }, use(ESS, "OmenofSinistralCrystallisation"),
            ["プレフィックスはスピリットと外れ 1 つ。外れをグローバル防御のエッセンスに置き換えるには?", "Prefixes are Spirit and 1 junk mod. Swap the junk for the Global Defences essence?"],
            ["左の結晶化 + エッセンス。固定のスピリットは消えないので、消えるのは必ず外れ", "Sinistral Crystallisation + essence. The fractured Spirit can't be removed, so it always hits the junk"],
            [d(use(ESS), "お告げ無しだと完成したサフィックスが消えることもある", "Without an omen it may remove a finished suffix"),
              d(use("annul", "OmenofSinistralAnnulment"), "消去は消すだけ。エッセンスは入らない", "Annulment only removes; no essence goes in")]),
        ],
      }],
    },
  };
}

/**
 * ジュエル: 5 MOD のエメラルド (2026-10-16 オーナー「一応ジュエルね、5 MOD の」)。日本語のジュエル動画 (1svgFNDsOXM、quiz-samples.ts の jewelJp) の流れ:
 * クリ率をフラクチャー → クリダメ → 軽蔑 (サフィの枠 +1) → 右手のネクロマンシーで冒涜 (反響) → 左の消去で軽蔑を外す (サフィ 3 つは残る) →
 * 高貴でプレ → カオスでアタックダメージ (上限を超えたサフィに当たると弾かれる) → 獰猛
 */
function jewel(): QuizTutorial {
  const J = "Jewels_dex/";
  const CONTEMPT = "emotion:Potent Liquid Contempt";
  const FEROCITY = "emotion:Potent Liquid Ferocity";
  return {
    id: "jewel", level: 3, part: ["ジュエル", "Jewel"],
    learn: ["軽蔑でサフィックスの枠を増やす・冒涜で 3 つ目・軽蔑を外してもサフィックス 3 つは残る (5 MOD)・獰猛", "Contempt for an extra suffix, desecrate the 3rd, remove Contempt and keep 3 suffixes (5 mods), Ferocity"],
    source: "日本語のジュエル動画 1svgFNDsOXM (quiz-samples.ts の jewelJp)",
    seed: 5,
    assumed: [
      ["冒涜のサフィックスは攻撃速度・移動速度など動画で狙っていた物のどれか", "The desecrated suffix is any of the ones the video aims for (Attack Speed, Movement Speed and so on)"],
      ["液化した感情 (軽蔑・獰猛) のプレフィックスの版とサフィックスの版は、説明文に決め方が無いのでランダム (付けられる側から等しく)", "Which version (prefix or suffix) a Liquid Emotion gives is not in its text, so it is random among the sides with room"],
    ],
    recipe: {
      v: 3, name: "Emerald", base: "Emerald", itemLevel: 82,
      start: { kind: "bought", mods: [{ mod: J + "JewelAttackCriticalChance" }], fill: { prefix: 2, suffix: 2 }, price: 1 },
      routes: [{
        id: "main",
        goal: [
          slot("A", "suffix", [J + "JewelAttackCriticalChance"], "fractured"),
          slot("B", "suffix", [J + "JewelAttackCriticalDamage"]),
          slot("C", "suffix", ["JewelAttackSpeed", "JewelMovementSpeed", "JewelRadiusSpearCriticalDamage", "JewelRadiusSpearAttackSpeed", "JewelBowSpeed"].map((x) => J + x), "desecrated"),
          slot("D", "prefix", [J + "JewelAttackDamage"]),
          slot("E", "prefix", [J + "Emotion_CraftedJewelSuffixEffect"], "crafted"),
          { ...slot("T", "prefix", [J + "Emotion_CraftedJewelAdditionalSuffixAllowed"], "crafted"), temp: true },
          { ...slot("X", "suffix", [J + "Emotion_CraftedJewelAdditionalPrefixAllowed"], "crafted"), temp: true },
        ],
        rules: [
          rule({ A: 2, fx: 0 }, use("fracture"),
            ["攻撃のクリティカル率を、消えない土台にするには?", "Lock Attack Critical Chance as a permanent base?"],
            ["MOD 4 つのジュエルにフラクチャー。4 分の 1 でクリ率が固定される", "Fracture the 4-mod jewel: 1 in 4 it locks Critical Chance"],
            [DIVINE_LOCK, ANNUL_LOCK]),
          rule({ fx: 1, A: [0, 1, 2] }, RESTART,
            ["違う MOD が固定された。どうする?", "The wrong mod got fractured. What now?"],
            ["次のジュエルを買う", "Buy the next jewel"],
            [ANNUL_FRACTURED, FRACTURE_TWICE]),
          rule({ A: 3, X: 2, B: [0, 2] }, use("annul"),
            ["軽蔑で外れの版 (プレフィックス +1 個まで) が付いた。どうする?", "Contempt gave the wrong version (+1 prefix allowed). What now?"],
            ["消去で消して、もう一度。どちらの版になるかはランダム", "Annul it and try again; which version you get is random"],
            [CHAOS_ANY, DIVINE_LOCK]),
          rule({ A: 3, B: 0, n: 1 }, use("exalt"),
            ["固定のクリ率だけになった。クリダメを狙うには?", "Only the fractured Critical Chance is left. Aim for Critical Damage?"],
            ["高貴で 1 つ足す。外れたらカオスで振り直す", "Add one with an Exalted Orb; reroll it with Chaos if it misses"],
            [d(use("chaos"), "カオスは消せる MOD が要る。固定は消えない", "Chaos needs a mod to remove; the fractured one can not go"), ANNUL_FRACTURED]),
          rule({ A: 3, B: 0, n: 2 }, use("chaos"),
            ["固定 + 外れ 1 つ。クリダメを狙うには?", "Fractured + 1 junk mod. Aim for Critical Damage?"],
            ["カオスで振り直す。固定は消えないので、外れの 1 つだけが入れ替わる", "Chaos rerolls it: the fractured mod stays, only the junk is replaced"],
            [d(use("exalt"), "足すと外れが増えて、カオスの当たりが薄くなる", "Adding more junk makes Chaos less likely to hit"), d(use("annul"), "消すだけでは付かない", "Annulling alone adds nothing")]),
          rule({ A: 3, B: 0, n: [3, 4, 5] }, use("annul"),
            ["外れが溜まった。減らすには?", "Junk piled up. Cut it down?"],
            ["消去で減らしてから、カオスで狙う", "Annul it down, then aim with Chaos"],
            [d(use("exalt"), "増やすと余計に外れる", "Adding more only adds junk"), DIVINE_LOCK]),
          rule({ A: 3, B: 2, T: 0, X: 0, "s.free": 0, "p.n": 0 }, use("exalt"),
            ["次は軽蔑 (MOD を 1 つ消して、枠を 1 つ増やす MOD を付ける) を使う。その前に、消される用のプレフィックスを 1 つ用意するには?", "Next comes Contempt (removes 1 mod and adds a mod that allows 1 more slot). Before that, prepare one prefix to be removed?"],
            ["軽蔑は MOD を 1 つ消してから「+1 個まで」を作る。プレフィックスが無いと必ずクリダメが消されるので、消されてもいいプレフィックスを高貴で 1 つ足しておく (サフィックスは満杯なのでプレフィックスに付く)", "Contempt removes a mod before adding its +1 allowed mod. With no prefix it always removes Critical Damage, so exalt one expendable prefix first (suffixes are full, so it lands on a prefix)"],
            [d(use("chaos"), "カオスは揃ったサフィックスを消すことがある", "Chaos may remove a finished suffix"), d(use(CONTEMPT), "プレフィックスが無いと軽蔑は必ずクリダメを消す", "With no prefix, Contempt always removes Critical Damage")]),
          rule({ A: 3, B: 2, T: 0, X: 0, "s.free": 0, "p.n": 1 }, use(CONTEMPT),
            ["ジュエルのサフィックスの枠を 1 つ増やすには?", "Add one more suffix slot to the jewel?"],
            ["強力な液化した軽蔑。プレフィックス用の「サフィックス +1 個まで」とサフィックス用の「プレフィックス +1 個まで」のどちらかがランダムに付く。サフィックス +1 なら当たり", "Potent Liquid Contempt adds either +1 suffix allowed (prefix version) or +1 prefix allowed (suffix version) at random; +1 suffix is the hit"],
            [d(use(FEROCITY), "獰猛は反対側の MOD の効果を上げる物。枠は増えない", "Ferocity boosts the other side's mods; no extra slot"), d(use("exalt"), "高貴で枠は増えない", "Exalting adds no slot")]),
          rule({ A: 3, B: 2, T: 0, X: 0, "s.free": 0, "p.n": 2 }, use("annul", "OmenofSinistralAnnulment"),
            ["プレフィックスが 2 つある。軽蔑の前に 1 つにするには?", "There are 2 prefixes. Cut to 1 before Contempt?"],
            ["左の消去のお告げでプレフィックスだけ消す", "Omen of Sinistral Annulment removes a prefix only"],
            [d(use("annul", "OmenofDextralAnnulment"), "右の消去はクリダメなどのサフィックスを消す", "Dextral Annulment removes a suffix such as Critical Damage"), CHAOS_ANY]),
          rule({ T: 2, "s.n": 2, "s.hid": 0 }, use("desecrate", "OmenofDextralNecromancy"),
            ["増えたサフィックスの枠に、冒涜の MOD を狙うには?", "Aim a desecrated mod into the new suffix slot?"],
            ["右手のネクロマンシーでサフィックスに冒涜", "Dextral Necromancy desecrates a suffix"],
            [d(use("desecrate", "OmenofSinistralNecromancy"), "左手のネクロマンシーはプレフィックスに付ける", "Sinistral Necromancy puts it on a prefix"), d(use("exalt", "OmenofDextralExaltation"), "普通の MOD になる。狙いは冒涜の MOD", "That adds a normal mod; the target is a desecrated mod")]),
          rule({ T: 2, "s.hid": 1 }, { reveal: { echoes: true } },
            ["未発現の MOD を、なるべく狙いが出るように発現するには?", "Reveal the unrevealed mod with the best chance at the target?"],
            ["アビスの反響のお告げを掛けて発現。外れたらもう 3 つ見られる", "Reveal with Abyssal Echoes: on a miss you see 3 more"],
            [d({ reveal: { echoes: false } }, "反響のお告げが無いと、外れた時にもう 3 つ見られない", "Without Abyssal Echoes there is no second set of 3"), d(use("annul", "OmenofLight"), "光のお告げは冒涜を消す。まず中身を見る", "Omen of Light removes it; look inside first")]),
          rule({ T: 2, "s.bad": 1 }, use("annul", "OmenofLight"),
            ["外れた冒涜 MOD だけを消すには?", "Remove only the wrong desecrated mod?"],
            ["光のお告げ + 消去で冒涜だけ消して、もう一度骨から", "Omen of Light + Annulment removes only the desecrated mod; then desecrate again"],
            [d(use("annul", "OmenofDextralAnnulment"), "右の消去はクリダメが消えることがある", "Dextral Annulment may remove Critical Damage"), CHAOS_ANY]),
          rule({ T: 2, C: 2, "s.n": 3 }, use("annul", "OmenofSinistralAnnulment"),
            ["サフィックスが 3 つ揃った。もう要らない軽蔑はどうする?", "3 suffixes are done. What about the Contempt mod?"],
            ["左の消去で軽蔑 (プレフィックス) を消す。消してもサフィックス 3 つは残る (上限を超えた分は消えない、これで 5 MOD のジュエルになる)", "Remove Contempt (a prefix) with Sinistral Annulment. The 3 suffixes stay even over the limit; this is how the jewel gets 5 mods"],
            [d(use("annul", "OmenofDextralAnnulment"), "右の消去はサフィックスを消す。せっかくの 3 つ目が消える", "Dextral Annulment removes a suffix, losing the 3rd one"), d(use(FEROCITY), "獰猛はまだ。軽蔑を外してプレフィックスの枠を空けてから", "Not Ferocity yet; free the prefix first")]),
          rule({ "s.free": -1, "p.n": [0, 1] }, use("exalt"),
            ["プレフィックスを埋めるには?", "Fill the prefixes?"],
            ["サフィックスは上限を超えているので、高貴はプレフィックスに付く", "Suffixes are over the limit, so Exalted goes to a prefix"],
            [d(use("exalt", "OmenofDextralExaltation"), "右の高貴はサフィックス用。サフィックスはもう満杯", "Dextral Exaltation is for suffixes, which are full"), d(use("chaos"), "カオスはプレフィックスが 2 つになってから", "Chaos comes after the prefixes are filled")]),
          rule({ "s.free": -1, "p.n": 2, D: 0 }, use("chaos"),
            ["プレフィックスにアタックダメージを狙うには?", "Aim Attack Damage on a prefix?"],
            ["カオス。上限を超えたサフィックスに当たると弾かれて何も起きないので、実質プレフィックスだけが振り直される小テク", "Chaos. If it hits an over-the-limit suffix it fails and nothing happens, so in practice only prefixes reroll"],
            [d(use("annul"), "消去だとサフィックスが消えることがある", "Annulment may remove a suffix"), d(use("exalt"), "プレフィックスの枠が空いていない", "No prefix slot is open")]),
          rule({ "s.free": -1, "p.n": 2, D: 2, E: 0 }, use(FEROCITY),
            ["最後に、サフィックスの効果をまとめて上げるには?", "Finally, boost the suffixes all at once?"],
            ["強力な液化した獰猛。サフィックスは上限を超えているので、消えるのはプレフィックスで、空いたプレフィックスに「サフィックスの効果が増加する」が付く (アタックダメージが消えたらカオスからやり直し)", "Potent Liquid Ferocity: suffixes are over the limit, so it removes a prefix and adds increased Suffix effect there (if Attack Damage goes, chaos again)"],
            [d(use(CONTEMPT), "軽蔑は枠を増やす物。もう要らない", "Contempt adds a slot; not needed anymore"), DIVINE_LOCK]),
        ],
      }],
    },
  };
}

export const QUIZ_TUTORIALS: QuizTutorial[] = [wand(), gloves(), ring(), amulet(), jewel()];
