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

/** how = 案内に出すやさしい箇条書き (2026-10-17 オーナー「赤ちゃんに説明するくらい簡単に」)。無い手はカードの公式の説明と決まりの文を出す */
export interface TopicStep { use: string; omens?: string[]; note: JaEn; how?: JaEn[] }
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
const H = (use: string, note: JaEn, how: JaEn[]): TopicStep => ({ use, note, how });
const RESET = H("reset", ["白に戻す", "Reset to white"], [["アイテムを最初の白い状態に戻す (練習用のボタン)", "Puts the item back to a fresh white one (a practice button)"]]);
const EMPTY: TopicStep[] = [
  S("transmute", ["マジックに", "Make it magic"]),
  S("annul", ["消して空のマジックに", "Annul to an empty magic"]),
];

export const TOPIC_COURSES: TopicCourse[] = [
  {
    id: "orbs", level: 1, title: ["基本のオーブを学ぶ", "Learn the basic orbs"], base: "Dueling Wand", itemLevel: 82,
    learn: ["変成・増強・王者・高貴・カオス・消去・神・フラクチャー・錬金と、上級・完全の違い", "Transmute, augment, regal, exalt, chaos, annul, divine, fracture, alchemy, and greater / perfect tiers"],
    steps: [
      H("transmute", ["白 → 青", "White → blue"], [
        ["白いアイテム (ノーマル) が、青いアイテム (マジック) になる", "A white item (Normal) becomes a blue item (Magic)"],
        ["MOD が 1 つ付く。何が付くかは運", "It gets 1 mod. Which one is luck"],
      ]),
      H("augment", ["青に MOD を 1 つ足す", "Add 1 mod to a blue item"], [
        ["青いアイテムに MOD を 1 つ足す。何が付くかは運", "Adds 1 mod to a blue item. Which one is luck"],
        ["青いアイテムの MOD は 2 つまで。もう 2 つある時は使えない", "Blue items hold up to 2 mods. Can't be used when it already has 2"],
      ]),
      H("annul", ["MOD を 1 つ消す", "Remove 1 mod"], [
        ["MOD を 1 つ消す", "Removes 1 mod"],
        ["どれが消えるかは運。自分では選べない", "Which one goes is luck. You can't choose"],
      ]),
      H("augment_greater", ["増強の上級", "Greater Augmentation"], [
        ["増強と同じで、青いアイテムに MOD を 1 つ足す", "Like Augmentation: adds 1 mod to a blue item"],
        ["上級は弱い MOD が付かない (下の MOD レベルより上だけ)", "Greater: no weak mods (only the mod levels shown below)"],
      ]),
      H("regal", ["青 → 黄", "Blue → yellow"], [
        ["青いアイテムが、黄色いアイテム (レア) になる", "A blue item becomes a yellow item (Rare)"],
        ["MOD が 1 つ増える。今付いている MOD はそのまま残る", "It gains 1 mod. The mods it has stay"],
      ]),
      H("exalt", ["黄に MOD を 1 つ足す", "Add 1 mod to a yellow item"], [
        ["黄色いアイテムに MOD を 1 つ足す。何が付くかは運", "Adds 1 mod to a yellow item. Which one is luck"],
        ["黄色いアイテムの MOD は 6 つまで。空きがある時だけ使える", "Yellow items hold up to 6 mods. Only usable when there is room"],
      ]),
      H("exalt_greater", ["高貴の上級", "Greater Exalted Orb"], [
        ["高貴と同じで、黄色いアイテムに MOD を 1 つ足す", "Like the Exalted Orb: adds 1 mod to a yellow item"],
        ["上級は弱い MOD が付かない", "Greater: no weak mods"],
      ]),
      H("exalt_perfect", ["高貴の完全", "Perfect Exalted Orb"], [
        ["高貴と同じで、黄色いアイテムに MOD を 1 つ足す", "Like the Exalted Orb: adds 1 mod to a yellow item"],
        ["完全は強い MOD だけが付く", "Perfect: strong mods only"],
      ]),
      H("chaos", ["1 つ消して 1 つ付ける", "Remove 1, add 1"], [
        ["黄色いアイテムの MOD を 1 つ消して、別の MOD を 1 つ付ける", "Removes 1 mod from a yellow item and adds a different 1"],
        ["どれが消えるかも、何が付くかも運", "Which one goes and which one comes are both luck"],
      ]),
      H("chaos_greater", ["カオスの上級", "Greater Chaos Orb"], [
        ["カオスと同じで、1 つ消して 1 つ付ける", "Like the Chaos Orb: removes 1, adds 1"],
        ["上級は、付く方に弱い MOD が出ない", "Greater: the added mod is never weak"],
      ]),
      H("chaos_perfect", ["カオスの完全", "Perfect Chaos Orb"], [
        ["カオスと同じで、1 つ消して 1 つ付ける", "Like the Chaos Orb: removes 1, adds 1"],
        ["完全は、付く方が強い MOD だけ", "Perfect: the added mod is always strong"],
      ]),
      H("annul", ["MOD を 1 つ消す", "Remove 1 mod"], [
        ["MOD を 1 つ消す。どれが消えるかは運", "Removes 1 mod. Which one is luck"],
        ["消すと空きができて、また MOD を足せる", "That opens a slot, so you can add a mod again"],
      ]),
      H("divine", ["数字だけ振り直す", "Reroll the numbers"], [
        ["MOD の数字だけが変わる (その MOD の幅の中で上がったり下がったり)", "Only the mod numbers change (up or down within that mod's range)"],
        ["MOD の種類と強さの段 (ティア) は変わらない", "The mods and their tiers stay the same"],
      ]),
      H("fracture", ["MOD を 1 つ固定", "Lock 1 mod"], [
        ["MOD を 1 つ固定する。固定した MOD は、もう消えない", "Locks 1 mod. A locked mod can never be removed"],
        ["どれが固定されるかは運", "Which one gets locked is luck"],
        ["使えるのは、黄色いアイテムで MOD が 4 つ以上ある時だけ。1 つのアイテムに 1 回まで", "Only on a yellow item with 4+ mods. Once per item"],
      ]),
      RESET,
      H("transmute_greater", ["変成の上級", "Greater Transmutation"], [
        ["変成と同じで、白 → 青。MOD が 1 つ付く", "Like Transmutation: white → blue with 1 mod"],
        ["上級は弱い MOD が付かない", "Greater: no weak mods"],
      ]),
      H("regal_greater", ["王者の上級", "Greater Regal Orb"], [
        ["王者と同じで、青 → 黄。MOD が 1 つ増える", "Like the Regal Orb: blue → yellow, +1 mod"],
        ["上級は弱い MOD が付かない", "Greater: no weak mods"],
      ]),
      RESET,
      H("transmute_perfect", ["変成の完全", "Perfect Transmutation"], [
        ["変成と同じで、白 → 青。MOD が 1 つ付く", "Like Transmutation: white → blue with 1 mod"],
        ["完全は強い MOD だけが付く", "Perfect: strong mods only"],
      ]),
      H("augment_perfect", ["増強の完全", "Perfect Augmentation"], [
        ["増強と同じで、青いアイテムに MOD を 1 つ足す", "Like Augmentation: adds 1 mod to a blue item"],
        ["完全は強い MOD だけが付く", "Perfect: strong mods only"],
      ]),
      H("regal_perfect", ["王者の完全", "Perfect Regal Orb"], [
        ["王者と同じで、青 → 黄。MOD が 1 つ増える", "Like the Regal Orb: blue → yellow, +1 mod"],
        ["完全は強い MOD だけが付く", "Perfect: strong mods only"],
      ]),
      RESET,
      H("alchemy", ["白か青 → いきなり黄", "White or blue → straight to yellow"], [
        ["白か青のアイテムが、いきなり黄色いアイテムになる", "A white or blue item jumps straight to yellow"],
        ["MOD が 4 つ付く。何が付くかは運 (青に付いていた MOD は付け直し)", "It gets 4 mods, all luck (a blue item's mods are rolled again)"],
      ]),
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
