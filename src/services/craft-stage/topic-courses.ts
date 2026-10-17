/**
 * topic-courses.ts — 動作を学ぶコース (入門〜中級。2026-10-17 オーナー「入門初級中級では小テクを全て紹介する形、タイトルは学べる動作。
 * 冒涜を学ぶなら冒涜のカレンシー全部体験 + 解説。エッセンス・カタリスト・お告げ周り、関連を一気に立て続けに紹介」)。
 *
 * 1 コース = 1 つのアイテムに、並べた手を順に打つ。どの手も、前の手まで打った状態なら必ず打てる並びにしてある
 * (tests/topic-courses.test.ts で 200 回ずつ確かめる)。note は大きく出す要点 1 行 (2026-10-17 オーナー「入門は要点でっかく表示のみ」)、細かい説明はエミュレーターのカードの文を「詳しく」に。
 * use の特別なキー: reset = 白に戻す / reveal = 発現 (どれを選んでも良い) / ess:<名前>:<段> = そのアイテムのエッセンス (棚から引く)
 */
import type { JaEn } from "./quiz-tutorials";
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import type { StageItem } from "./types";
import { essenceShelf } from "../../state/craft-stage-shelf";

export interface TopicStep { use: string; omens?: string[]; note: JaEn }
export interface TopicCourse {
  id: string;
  level: 1 | 2 | 3;
  title: JaEn;
  learn: JaEn;
  base: string;
  itemLevel: number;
  steps: TopicStep[];
}

const S = (use: string, note: JaEn, omens?: string[]): TopicStep => ({ use, note, ...(omens ? { omens } : {}) });
const RESET = S("reset", ["白に戻す", "Reset to white"]);
const EMPTY: TopicStep[] = [
  S("transmute", ["マジックに", "Make it magic"]),
  S("annul", ["消して空のマジックに", "Annul to an empty magic"]),
];

export const TOPIC_COURSES: TopicCourse[] = [
  {
    id: "orbs", level: 1, title: ["基本のオーブを学ぶ", "Learn the basic orbs"], base: "Dueling Wand", itemLevel: 82,
    learn: ["変成・増強・王者・高貴・カオス・消去・神・フラクチャー・錬金と、上級・完全の違い", "Transmute, augment, regal, exalt, chaos, annul, divine, fracture, alchemy, and greater / perfect tiers"],
    steps: [
      S("transmute", ["ノーマル → マジック (MOD 1 つ)", "Normal → magic (1 mod)"]),
      S("augment", ["マジックに MOD を 1 つ足す", "Adds 1 mod to a magic item"]),
      S("annul", ["MOD を 1 つ消す", "Removes 1 mod"]),
      S("augment_greater", ["上級は低い段が出ない", "Greater: no low tiers"]),
      S("regal", ["マジック → レア (MOD +1)", "Magic → rare (+1 mod)"]),
      S("exalt", ["レアに MOD を 1 つ足す", "Adds 1 mod to a rare"]),
      S("exalt_greater", ["低い段が出ない", "No low tiers"]),
      S("exalt_perfect", ["高い段だけ", "High tiers only"]),
      S("chaos", ["1 つ消して 1 つ足す", "Removes 1, adds 1"]),
      S("chaos_greater", ["足す方は低い段が出ない", "Added mod: no low tiers"]),
      S("chaos_perfect", ["足す方は高い段だけ", "Added mod: high tiers only"]),
      S("annul", ["消して空きを作る", "Annul to open a slot"]),
      S("divine", ["数値だけ振り直す (段はそのまま)", "Rerolls values only (tiers stay)"]),
      S("fracture", ["MOD を 1 つ固定 (もう消えない)", "Locks 1 mod for good"]),
      RESET,
      S("transmute_greater", ["低い段なしでマジックに", "Magic, no low tiers"]),
      S("regal_greater", ["低い段なしでレアに", "Rare, no low tiers"]),
      RESET,
      S("transmute_perfect", ["高い段だけでマジックに", "Magic, high tiers only"]),
      S("augment_perfect", ["高い段だけ足す", "Adds a high tier only"]),
      S("regal_perfect", ["高い段だけでレアに", "Rare, high tiers only"]),
      RESET,
      S("alchemy", ["ノーマル → レア (MOD 4 つ)", "Normal → rare (4 mods)"]),
    ],
  },
  {
    id: "essence", level: 1, title: ["エッセンスを学ぶ", "Learn essences"], base: "Secured Wraps", itemLevel: 82,
    learn: ["レッサー〜グレーター (マジック → レア)・パーフェクト・コラプト・合金・結晶化のお告げ・アストリッド", "Lesser to greater (magic → rare), perfect, corrupted, alloys, crystallisation omens, Astrid"],
    steps: [
      ...EMPTY,
      S("ess:Opulence:lesser", ["マジック → レア・決まった MOD が付く", "Magic → rare with a fixed mod"]),
      RESET, ...EMPTY,
      S("ess:Opulence:normal", ["同じ MOD で段が上がる", "Same mod, higher tier"]),
      RESET, ...EMPTY,
      S("ess:Opulence:greater", ["さらに高い段", "Higher still"]),
      RESET,
      S("alchemy", ["レアにする (パーフェクトはレアに打つ)", "Make it rare (Perfect goes on rares)"]),
      S("ess:Grounding:perfect", ["1 つ消して決まった MOD を付ける", "Removes 1, adds a fixed mod"]),
      S("rune:Astrid's Creativity", ["エッセンスの MOD を 2 つ持てる", "Allows 2 essence mods"]),
      S("ess:Hysteria:perfect", ["消すのはサフィックスから", "Removes a suffix"], ["OmenofDextralCrystallisation"]),
      RESET,
      S("alchemy", ["もう一度レアに", "Rare again"]),
      S("ess:Adaptive Alloy:perfect", ["合金 = パーフェクトエッセンスと同じ", "Alloy = Perfect Essence"]),
    ],
  },
  {
    id: "desecrate", level: 2, title: ["冒涜を学ぶ", "Learn desecration"], base: "Gold Ring", itemLevel: 64,
    learn: ["骨 4 種・発現・アビスの反響・左右のネクロマンシー・勢力のお告げ・光のお告げ・深淵のエッセンス", "4 bones, revealing, Abyssal Echoes, Necromancy, faction omens, Omen of Light, Essence of the Abyss"],
    steps: [
      S("transmute", ["マジックに", "Make it magic"]),
      S("regal", ["レアに (骨はレアに打つ)", "Rare (bones go on rares)"]),
      S("desecrate_gnawed", ["未発現の冒涜 MOD を 1 つ (アイテムレベル 64 以下)", "1 unrevealed desecrated mod (item level ≤64)"]),
      S("reveal", ["候補 3 つから 1 つ選ぶ", "Pick 1 of 3"]),
      S("annul", ["冒涜の MOD だけ消す", "Removes only the desecrated mod"], ["OmenofLight"]),
      S("desecrate", ["プレフィックスに付ける", "On the prefix side"], ["OmenofSinistralNecromancy"]),
      S("reveal", ["候補を 1 回引き直せる", "Reroll the options once"], ["OmenofAbyssalEchoes"]),
      S("annul", ["冒涜の MOD だけ消す", "Removes only the desecrated mod"], ["OmenofLight"]),
      S("desecrate_ancient", ["サフィックスに・ウラマンだけ", "Suffix, Ulaman only"], ["OmenofDextralNecromancy", "OmenoftheSovereign"]),
      S("reveal", ["ウラマンから選ぶ", "Pick an Ulaman mod"]),
      S("annul", ["冒涜の MOD だけ消す", "Removes only the desecrated mod"], ["OmenofLight"]),
      S("desecrate_altered", ["アマナムだけ (装飾品専用の骨)", "Amanamu only (jewellery bone)"], ["OmenoftheLiege"]),
      S("reveal", ["アマナムから選ぶ", "Pick an Amanamu mod"]),
      S("annul", ["冒涜の MOD だけ消す", "Removes only the desecrated mod"], ["OmenofLight"]),
      S("ess:the Abyss:perfect", ["1 つ消して「深淵の王の印」", "Removes 1, adds the Mark"]),
      S("desecrate", ["印が冒涜 MOD に変わる・クルガルだけ", "The Mark becomes a desecrated mod, Kurgal only"], ["OmenoftheBlackblooded"]),
      S("reveal", ["クルガルから選ぶ", "Pick a Kurgal mod"]),
    ],
  },
  {
    id: "omens", level: 2, title: ["お告げを学ぶ", "Learn omens"], base: "Gold Ring", itemLevel: 82,
    learn: ["高貴 (左右・偉大)・消去 (左右)・カオス (削減・左右の抹消)・神 (祝福・聖別)", "Exalt (sides, greater), annul (sides), chaos (whittling, erasure), divine (blessed, sanctification)"],
    steps: [
      S("transmute", ["マジックに", "Make it magic"]),
      S("regal", ["レアに", "Rare"]),
      S("exalt", ["プレフィックスに足す", "Adds a prefix"], ["OmenofSinistralExaltation"]),
      S("exalt", ["サフィックスに足す", "Adds a suffix"], ["OmenofDextralExaltation"]),
      S("exalt", ["1 回で 2 つ足す", "Adds 2 at once"], ["OmenofGreaterExaltation"]),
      S("annul", ["プレフィックスから消す", "Removes a prefix"], ["OmenofSinistralAnnulment"]),
      S("annul", ["サフィックスから消す", "Removes a suffix"], ["OmenofDextralAnnulment"]),
      S("exalt", ["空きを 2 つ埋める", "Fills 2 slots"], ["OmenofGreaterExaltation"]),
      S("chaos", ["一番低い MOD を消す", "Removes the lowest mod"], ["OmenofWhittling"]),
      S("chaos", ["プレフィックスを入れ替える", "Swaps a prefix"], ["OmenofSinistralErasure"]),
      S("chaos", ["サフィックスを入れ替える", "Swaps a suffix"], ["OmenofDextralErasure"]),
      S("divine", ["暗黙 MOD だけ振り直す", "Rerolls only the implicit"], ["OmenoftheBlessed"]),
      S("divine", ["数値 0.78〜1.22 倍・以後は変更不可", "Values ×0.78–1.22, then locked"], ["OmenofSanctification"]),
    ],
  },
  {
    id: "catalyst", level: 3, title: ["カタリストと品質を学ぶ", "Learn catalysts and quality"], base: "Gold Ring", itemLevel: 82,
    learn: ["カタリストの種類・別の種類は 0 から・触媒の高貴のお告げ", "Catalyst types, a new type restarts from 0, Catalysing Exaltation"],
    steps: [
      S("transmute", ["マジックに", "Make it magic"]),
      S("regal", ["レアに", "Rare"]),
      S("catalyst_fire", ["火の品質 +1〜2%", "Fire quality +1–2%"]),
      S("exalt", ["火の MOD が出やすい・品質は消える", "Fire mods more likely, quality used up"], ["OmenofCatalysingExaltation"]),
      S("catalyst_cold", ["種類を替えると品質は 0 から", "A new type restarts from 0"]),
      S("catalyst_lightning", ["雷", "Lightning"]),
      S("catalyst_chaos", ["混沌", "Chaos"]),
      S("catalyst_physical", ["物理", "Physical"]),
      S("catalyst_attribute", ["能力値", "Attributes"]),
      S("catalyst_speed", ["速度", "Speed"]),
      S("catalyst_caster", ["キャスター", "Caster"]),
      S("catalyst_minion", ["ミニオン", "Minions"]),
      S("catalyst_mana", ["マナ", "Mana"]),
      S("catalyst_life", ["ライフ", "Life"]),
      S("catalyst_defences", ["防御", "Defences"]),
      S("exalt", ["2 つとも出やすい", "Both added mods weighted"], ["OmenofCatalysingExaltation", "OmenofGreaterExaltation"]),
    ],
  },
  {
    id: "emotion", level: 3, title: ["液化した感情を学ぶ", "Learn liquid emotions"], base: "Emerald", itemLevel: 82,
    learn: ["レアのジュエルに 1 つ消して決まった作った MOD を付ける・枠を増やす軽蔑・効果を上げる獰猛", "Removes 1 mod from a rare jewel and adds a fixed crafted mod; Contempt adds a slot, Ferocity raises effect"],
    steps: [
      S("transmute", ["マジックに", "Make it magic"]),
      S("regal", ["レアに (感情はレアのジュエルに)", "Rare (emotions go on rare jewels)"]),
      S("emotion:Liquid Envy", ["1 つ消して決まった MOD を付ける", "Removes 1, adds a fixed crafted mod"]),
      RESET, S("transmute", ["マジックに", "Make it magic"]), S("regal", ["新しいジュエルでレアに", "A new jewel, rare"]),
      S("emotion:Diluted Liquid Ire", ["弱い版", "Weaker version"]),
      RESET, S("transmute", ["マジックに", "Make it magic"]), S("regal", ["レアに", "Rare"]),
      S("emotion:Concentrated Liquid Fear", ["強い版", "Stronger version"]),
      RESET, S("transmute", ["マジックに", "Make it magic"]), S("regal", ["レアに", "Rare"]),
      S("emotion:Potent Liquid Contempt", ["枠を 1 つ増やす", "+1 mod slot"]),
      RESET, S("transmute", ["マジックに", "Make it magic"]), S("regal", ["レアに", "Rare"]),
      S("emotion:Potent Liquid Ferocity", ["反対側の効果を上げる", "Boosts the other side"]),
    ],
  },
];

/**
 * 手の実際のキー: ess:<名前>:<段> はそのアイテムの棚のエッセンス、reveal は 1 つ目を選ぶ (反響のお告げがあれば引き直した方)。
 * reset は呼ぶ側で白に戻す (null)
 */
export function topicKey(st: TopicStep, data: PatchData, it: StageItem): string | null {
  if (st.use === "reset") return null;
  if (st.use === "reveal") return st.omens?.includes("OmenofAbyssalEchoes") ? "reveal:1:reroll" : "reveal:1";
  if (st.use.startsWith("ess:")) {
    const [, name, lvl] = st.use.split(":");
    const g = essenceShelf(data, it).find((x) => x.kind === name);
    return g?.keys.find((k) => k.startsWith(`essence:${lvl}:`)) ?? null;
  }
  return st.use;
}
