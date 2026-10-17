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
import type { Force } from "./stage-core";
import { essenceShelf } from "../../state/craft-stage-shelf";

/** how = 案内に出すやさしい箇条書き (2026-10-17 オーナー「赤ちゃんに説明するくらい簡単に」)。無い手はカードの公式の説明と決まりの文を出す */
/** prep = 今のアイテムにこの手が打てない時、白 (start があればそのレア度の MOD 0 個) から打ってこの手が打てる状態を作る手 ([] = 白。craft-lesson.ts) */
/** start = この手はいつも MOD 0 個のこのレア度から (付ける手。2026-10-17 オーナー「ついてるの多くてややこしい、付くときカオス以外は 0 から」) */
export interface TopicStep { use: string; omens?: string[]; note: JaEn; how?: JaEn[]; prep?: string[]; start?: StageItem["rarity"]; /** 打てても毎回 prep から (消去は MOD 4 つから。2026-10-17 オーナー「4 MOD くらいあったらわかる」) */ prepAlways?: boolean;
  /** start と一緒に: 毎回この MOD だけ付けて始める (神は数字の幅が分かりやすい MOD 1 つ。2026-10-17 オーナー「神は 1 MOD で見た方が良い」) */
  startMods?: Force[];
  /** この手だけ別のベースで (特殊なエッセンスは部位が決まっている。2026-10-17)。無ければコースのベース */
  base?: string;
  /** 同じ手の中で続けて打つ手 (アビス → 骨 → 発現。前の手を打つまで押せない。2026-10-17 オーナー「発現までセットで」) */
  chain?: TopicStep[] }
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
const H = (use: string, note: JaEn, how: JaEn[], prep?: string[] | StageItem["rarity"]): TopicStep =>
  ({ use, note, how, ...(typeof prep === "string" ? { start: prep } : prep ? { prep } : {}) });
/** 打てても毎回 prep から始める手 (消去・フラクチャーは MOD 4 つから) */
const ALWAYS = (st: TopicStep): TopicStep => ({ ...st, prepAlways: true });
/** MOD 1 つの黄から毎回 (カオスの入れ替えを見る。2026-10-17 オーナー「カオスは 1 MOD でおk」) */
const ONE_MOD = (st: TopicStep): TopicStep => ({ ...st, prep: ["exalt"], prepAlways: true });
const RESET = H("reset", ["白に戻す", "Reset to white (Normal)"], [["アイテムを最初の白 (ノーマル) の状態に戻す (練習用のボタン)", "Puts the item back to a fresh white (Normal) one (a practice button)"]]);

export const TOPIC_COURSES: TopicCourse[] = [
  {
    id: "orbs", level: 1, title: ["基本のオーブを学ぶ", "Learn the basic orbs"], base: "Dueling Wand", itemLevel: 82,
    learn: ["変成・増強・王者・錬金術・高貴・カオス・消去・フラクチャー・神と、上級・完全の違い", "Transmute, augment, regal, alchemy, exalt, chaos, annul, fracture, divine, and greater / perfect tiers"],
    steps: [
      // 並び: 変成 → 増強 → 王者 → 錬金術 → 高貴 → カオス → 消去 → フラクチャー → 神で完了。上級・完全は通常の直後 (2026-10-17 オーナー「最後は神のオーブで完了」)。
      // 白に戻す手は無し。今のアイテムに打てない時は prep の手で打てる状態を作る (オーナー「つどつどリセット掛けておk、今の手が打てる手に再現」)
      H("transmute", ["白 (ノーマル) → 青 (マジック)", "White (Normal) → blue (Magic)"], [
        ["白いアイテム (ノーマル) が、青いアイテム (マジック) になる", "A white (Normal) item becomes a blue (Magic) item"],
        ["MOD が 1 つ付く。何が付くかは運", "It gets 1 mod. Which one is luck"],
      ], "normal"),
      H("transmute_greater", ["変成の上級", "Greater Transmutation"], [
        ["変成と同じで、白 (ノーマル) → 青 (マジック)。MOD が 1 つ付く", "Like Transmutation: white (Normal) → blue (Magic) with 1 mod"],
        ["上級は、決まった MOD レベル未満の MOD は付かない (下に出る数字)", "Greater: mods below a set mod level can't roll (the number shown below)"],
      ], "normal"),
      H("transmute_perfect", ["変成の完全", "Perfect Transmutation"], [
        ["変成と同じで、白 (ノーマル) → 青 (マジック)。MOD が 1 つ付く", "Like Transmutation: white (Normal) → blue (Magic) with 1 mod"],
        ["完全は、上級より高い MOD レベル未満の MOD は付かない (下に出る数字)", "Perfect: mods below an even higher mod level can't roll (the number shown below)"],
      ], "normal"),
      H("augment", ["青 (マジック) に MOD を 1 つ足す", "Add 1 mod to a blue (Magic) item"], [
        ["青いアイテム (マジック) に MOD を 1 つ足す。何が付くかは運", "Adds 1 mod to a blue (Magic) item. Which one is luck"],
        ["青いアイテム (マジック) の MOD は、プレフィックス 1 つ + サフィックス 1 つの 2 つまで", "Blue (Magic) items hold up to 2 mods: 1 prefix + 1 suffix"],
        ["空いている方のどちらかに、ランダムで付く。2 つとも埋まっている時は使えない", "It goes into whichever side is open, at random. Can't be used when both are filled"],
      ], "magic"),
      H("augment_greater", ["増強の上級", "Greater Augmentation"], [
        ["増強と同じで、青いアイテム (マジック) に MOD を 1 つ足す", "Like Augmentation: adds 1 mod to a blue (Magic) item"],
        ["上級は、決まった MOD レベル未満の MOD は付かない (下に出る数字)", "Greater: mods below a set mod level can't roll (the number shown below)"],
      ], "magic"),
      H("augment_perfect", ["増強の完全", "Perfect Augmentation"], [
        ["増強と同じで、青いアイテム (マジック) に MOD を 1 つ足す", "Like Augmentation: adds 1 mod to a blue (Magic) item"],
        ["完全は、上級より高い MOD レベル未満の MOD は付かない (下に出る数字)", "Perfect: mods below an even higher mod level can't roll (the number shown below)"],
      ], "magic"),
      H("regal", ["青 (マジック) → 黄 (レア)", "Blue (Magic) → yellow (Rare)"], [
        ["青いアイテム (マジック) が、黄色いアイテム (レア) になる", "A blue (Magic) item becomes a yellow (Rare) item"],
        ["MOD が 1 つ増える。今付いている MOD はそのまま残る", "It gains 1 mod. The mods it has stay"],
      ], "magic"),
      H("regal_greater", ["王者の上級", "Greater Regal Orb"], [
        ["王者と同じで、青 (マジック) → 黄 (レア)。MOD が 1 つ増える", "Like the Regal Orb: blue (Magic) → yellow (Rare), +1 mod"],
        ["上級は、決まった MOD レベル未満の MOD は付かない (下に出る数字)", "Greater: mods below a set mod level can't roll (the number shown below)"],
      ], "magic"),
      H("regal_perfect", ["王者の完全", "Perfect Regal Orb"], [
        ["王者と同じで、青 (マジック) → 黄 (レア)。MOD が 1 つ増える", "Like the Regal Orb: blue (Magic) → yellow (Rare), +1 mod"],
        ["完全は、上級より高い MOD レベル未満の MOD は付かない (下に出る数字)", "Perfect: mods below an even higher mod level can't roll (the number shown below)"],
      ], "magic"),
      // 錬金術は青から (付いていた MOD が付け直しになるのを見せる。2026-10-17 オーナー「錬金術は青から打たせて」)
      ALWAYS(H("alchemy", ["青 (マジック) → いきなり黄 (レア)", "Blue (Magic) → straight to yellow (Rare)"], [
        ["青いアイテム (マジック) が、いきなり黄色いアイテム (レア) になる。白いアイテム (ノーマル) にも使える", "A blue (Magic) item jumps straight to yellow (Rare); works on white (Normal) items too"],
        ["MOD が 4 つ付く。何が付くかは運", "It gets 4 mods, all luck"],
        ["青 (マジック) に付いていた MOD は消えて、全部付け直しになる", "The blue (Magic) item's mods are removed and all 4 are rolled fresh"],
      ], ["transmute"])),
      H("exalt", ["黄 (レア) に MOD を 1 つ足す", "Add 1 mod to a yellow (Rare) item"], [
        ["黄色いアイテム (レア) に MOD を 1 つ足す。何が付くかは運", "Adds 1 mod to a yellow (Rare) item. Which one is luck"],
        ["黄色いアイテム (レア) の MOD は 6 つまで。空きがある時だけ使える", "Yellow (Rare) items hold up to 6 mods. Only usable when there is room"],
      ], "rare"),
      H("exalt_greater", ["高貴の上級", "Greater Exalted Orb"], [
        ["高貴と同じで、黄色いアイテム (レア) に MOD を 1 つ足す", "Like the Exalted Orb: adds 1 mod to a yellow (Rare) item"],
        ["上級は、決まった MOD レベル未満の MOD は付かない (下に出る数字)", "Greater: mods below a set mod level can't roll (the number shown below)"],
      ], "rare"),
      H("exalt_perfect", ["高貴の完全", "Perfect Exalted Orb"], [
        ["高貴と同じで、黄色いアイテム (レア) に MOD を 1 つ足す", "Like the Exalted Orb: adds 1 mod to a yellow (Rare) item"],
        ["完全は、上級より高い MOD レベル未満の MOD は付かない (下に出る数字)", "Perfect: mods below an even higher mod level can't roll (the number shown below)"],
      ], "rare"),
      ONE_MOD(H("chaos", ["1 つ消して 1 つ付ける", "Remove 1, add 1"], [
        ["黄色いアイテム (レア) の MOD を 1 つ消して、別の MOD を 1 つ付ける", "Removes 1 mod from a yellow (Rare) item and adds a different 1"],
        ["どれが消えるかも、何が付くかも運", "Which one goes and which one comes are both luck"],
      ], "rare")),
      ONE_MOD(H("chaos_greater", ["カオスの上級", "Greater Chaos Orb"], [
        ["カオスと同じで、1 つ消して 1 つ付ける", "Like the Chaos Orb: removes 1, adds 1"],
        ["上級は、付く方に決まった MOD レベル未満の MOD は出ない (下に出る数字)", "Greater: the added mod can't be below a set mod level (the number shown below)"],
      ], "rare")),
      ONE_MOD(H("chaos_perfect", ["カオスの完全", "Perfect Chaos Orb"], [
        ["カオスと同じで、1 つ消して 1 つ付ける", "Like the Chaos Orb: removes 1, adds 1"],
        ["完全は、付く方に上級より高い MOD レベル未満の MOD は出ない (下に出る数字)", "Perfect: the added mod can't be below an even higher mod level (the number shown below)"],
      ], "rare")),
      ALWAYS(H("annul", ["MOD を 1 つ消す", "Remove 1 mod"], [
        ["MOD を 1 つ消す。どれが消えるかは運 (自分では選べない)", "Removes 1 mod. Which one is luck (you can't choose)"],
        ["消すと空きができて、また MOD を足せる", "That opens a slot, so you can add a mod again"],
      ], ["alchemy"])),
      ALWAYS(H("fracture", ["MOD を 1 つ固定", "Lock 1 mod"], [
        ["MOD を 1 つ固定する。固定した MOD は、もう消えない", "Locks 1 mod. A locked mod can never be removed"],
        ["どれが固定されるかは運", "Which one gets locked is luck"],
        ["使えるのは、黄色いアイテム (レア) で MOD が 4 つ以上ある時だけ。1 つのアイテムに 1 回まで", "Only on a yellow (Rare) item with 4+ mods. Once per item"],
      ], ["alchemy"])),
      { ...H("divine", ["数字だけ振り直す", "Reroll the numbers"], [
        ["MOD の数字だけが変わる (その MOD の幅の中で上がったり下がったり)", "Only the mod numbers change (up or down within that mod's range)"],
        ["例: 最大マナ +(35-54) の MOD なら、35 から 54 の間で数字が変わる", "Example: a Maximum Mana +(35-54) mod rerolls to anything from 35 to 54"],
        ["MOD の種類と強さの段 (ティア) は変わらない", "The mods and their tiers stay the same"],
      ], "magic"), startMods: [{ mod: "Wands/IncreasedMana", tier: "T8" }] },
    ],
  },
  {
    id: "essence", level: 1, title: ["エッセンスを学ぶ", "Learn essences"], base: "Secured Wraps", itemLevel: 82,
    learn: ["グレーター (マジック → レア)・パーフェクト・結晶化のお告げ・合金と、特殊なエッセンス (戦慄・ヒステリー・アビス・錯乱・狂気・ブリーチ)", "Greater (Magic → Rare), Perfect, crystallisation omens, alloys, and the special essences (Horror, Hysteria, Abyss, Delirium, Insanity, Breach)"],
    // 2026-10-17 オーナー「仕組みはオーブを学ぶと一緒。使うのはグレーターとパーフェクトの挙動、色んなエッセンスの紹介も込み。特殊なエッセンスは必ず触らせたい」
    // 「エッセンスは MOD が確実に付くから、そこはしっかり記入」。特殊なエッセンスは部位が決まっているので、手ごとにベースを替える (base)
    steps: [
      ALWAYS(H("ess:Opulence:greater", ["青 (マジック) → 黄 (レア) + 決まった MOD", "Blue (Magic) → yellow (Rare) + a set mod"], [
        ["青いアイテム (マジック) が黄色いアイテム (レア) になり、エッセンスの MOD が必ず 1 つ付く (運ではない)", "A blue (Magic) item becomes yellow (Rare), and the essence's mod is always added (no luck involved)"],
        ["今付いている MOD はそのまま残る", "The mods it already has stay"],
        ["レッサー → 普通 → グレーターの順に、同じ MOD がより高いティアで付く", "Lesser → normal → Greater add the same mod at higher and higher tiers"],
      ], ["transmute"])),
      ALWAYS(H("ess:the Body:greater", ["付く MOD は種類で決まる", "The mod depends on the essence"], [
        ["肉体のエッセンスはライフ、絢爛はアイテムレアリティ … と、必ず付く MOD はエッセンスの種類で決まっている (下の緑の枠)", "Body adds life, Opulence adds item rarity … each essence always adds its own mod (green box below)"],
        ["同じエッセンスでも、部位によって付く MOD が違うことがある", "The same essence can add a different mod on a different item type"],
      ], ["transmute"])),
      ALWAYS(H("ess:the Infinite:greater", ["候補の中から 1 つ", "One of several"], [
        ["無限のエッセンスは、付く MOD の候補が複数ある (下の緑の枠)", "The Infinite essence has several possible mods (green box below)"],
        ["候補のどれか 1 つが必ず付く。どれになるかは運", "One of them is always added; which one is luck"],
      ], ["transmute"])),
      ALWAYS(H("ess:Grounding:perfect", ["黄 (レア) の MOD を 1 つ消して、決まった MOD を付ける", "Remove 1 from a yellow (Rare) item, add a set mod"], [
        ["パーフェクトは黄色いアイテム (レア) に使う", "Perfect essences are used on yellow (Rare) items"],
        ["MOD をランダムに 1 つ消して、エッセンスの MOD を必ず 1 つ付ける", "Removes 1 random mod, then always adds the essence's mod"],
        ["付ける側 (プレフィックス / サフィックス) が埋まっている時は、その側から消える", "If the side it adds to (prefix / suffix) is full, the removed mod comes from that side"],
      ], ["alchemy"])),
      { ...ALWAYS(H("ess:Opulence:perfect", ["お告げで消す側を決める", "Pick the side to remove with an omen"], [
        ["右側の結晶化のお告げを掛けると、消える MOD がサフィックスからだけになる (左側ならプレフィックスから)", "With Omen of Dextral Crystallisation, the removed mod is a suffix only (Sinistral: prefix only)"],
        ["付くのは、いつも通りエッセンスの MOD (必ず付く)", "The essence's mod is still always added"],
      ], ["alchemy"])), omens: ["OmenofDextralCrystallisation"] },
      ALWAYS(H("ess:Adaptive Alloy:perfect", ["合金 = パーフェクトと同じ", "Alloys work like Perfect essences"], [
        ["合金もパーフェクトエッセンスと同じ動き: 黄 (レア) の MOD を 1 つ消して、合金の MOD を必ず 1 つ付ける", "Alloys work like Perfect essences: remove 1 random mod, always add the alloy's mod"],
        ["エッセンスや合金で付く MOD は、1 つのアイテムに 1 つまで (アストリッドの創造性のルーンをはめると 2 つまで)", "Only 1 essence / alloy mod per item (2 with the Astrid's Creativity rune socketed)"],
      ], ["alchemy"])),
      ALWAYS(H("ess:Horror:perfect", ["特殊: 戦慄 (手袋・靴)", "Special: Horror (gloves, boots)"], [
        ["戦慄のエッセンスは、黄色 (レア) の手袋・靴にだけ使える", "Essence of Horror works on yellow (Rare) gloves and boots only"],
        ["サフィックスに「ソケットされているアイテムの効果が 60% 増加する」が必ず付く (はめたルーンなどの効き目が 1.6 倍)", "Always adds the suffix “60% increased effect of Socketed Items” (socketed runes etc. become 1.6x as strong)"],
        ["動きはパーフェクトと同じ: 1 つ消して付ける", "Works like a Perfect essence: remove 1, add 1"],
      ], ["alchemy"])),
      ALWAYS(H("ess:Hysteria:perfect", ["特殊: ヒステリー", "Special: Hysteria"], [
        ["ヒステリーのエッセンスは、武器以外の黄色いアイテム (レア) に使える", "Essence of Hysteria works on yellow (Rare) non-weapon items"],
        ["必ず付く MOD は部位ごとに違う (手袋なら下の緑の枠の MOD)", "The mod it always adds depends on the item type (for gloves, the green box below)"],
        ["動きはパーフェクトと同じ: 1 つ消して付ける", "Works like a Perfect essence: remove 1, add 1"],
      ], ["alchemy"])),
      { ...ALWAYS(H("ess:the Abyss:perfect", ["特殊: アビス", "Special: Abyss"], [
        ["アビスのエッセンスは「アビサルロードの紋章を身につけている」を必ず付ける (消した MOD の側に付く)", "Essence of the Abyss always adds “Bears the Mark of the Abyssal Lord” (on the side of the removed mod)"],
        ["紋章は、次に骨を使うと冒涜の MOD (未発現) に置き換わる。そのまま発現まで試せる", "The next Bone replaces the Mark with an Unrevealed Desecrated mod; try revealing it right after"],
      ], ["alchemy"])), chain: [S("desecrate", ["骨で冒涜", "Desecrate with a Bone"]), S("reveal", ["発現", "Reveal"])] },
      { ...ALWAYS(H("ess:Delirium:perfect", ["特殊: 錯乱 (胴の防具)", "Special: Delirium (body armour)"], [
        ["錯乱のエッセンスは、黄色 (レア) の胴の防具 (鎧) にだけ使える。ここでは革のベストで試す", "Essence of Delirium works on yellow (Rare) body armour only; here we use a Leather Vest"],
        ["「○○を割り当てる」が必ず付く (○○はパッシブツリーのノータブル)。どのノータブルかは運で、選べない", "Always adds “Allocates (a Notable)”: a notable from the passive tree; which one is luck"],
      ], ["alchemy"])), base: "Leather Vest" },
      { ...ALWAYS(H("ess:Insanity:perfect", ["特殊: 狂気 (ベルト)", "Special: Insanity (belts)"], [
        ["狂気のエッセンスは、黄色 (レア) のベルトにだけ使える。ここではワイドベルトで試す", "Essence of Insanity works on yellow (Rare) belts only; here we use a Wide Belt"],
        ["「コラプト時に、アイテムは 2 個のエンチャントを獲得する」が必ず付く (ヴァールのオーブでエンチャントが付く時に 2 個になる)", "Always adds “On Corruption, Item gains two Enchantments” (a Vaal Orb enchant gives two)"],
      ], ["alchemy"])), base: "Wide Belt" },
      { ...ALWAYS(H("ess:the Breach:perfect", ["特殊: ブリーチ (指輪・アミュレット)", "Special: Breach (rings, amulets)"], [
        ["ブリーチのエッセンスは、黄色 (レア) の指輪・アミュレットにだけ使える。ここでは金の指輪で試す", "Essence of the Breach works on yellow (Rare) rings and amulets only; here we use a Gold Ring"],
        ["プレフィックスに「品質の最大値 +20%」が必ず付く。カタリストで品質を 40% まで上げられる", "Always adds the prefix “+20% to Maximum Quality”, so catalysts can take quality to 40%"],
      ], ["alchemy"])), base: "Gold Ring" },
    ],
  },
  {
    id: "desecrate", level: 2, title: ["冒涜を学ぶ", "Learn desecration"], base: "Gold Ring", itemLevel: 64,
    learn: ["骨 4 種と発現・左右のネクロマンシー・アビスの反響・勢力のお告げ (ウラマン・アマナム・クルガル)・光のお告げ・アビスのエッセンス・腐食のお告げ", "4 bones and revealing, Necromancy, Abyssal Echoes, faction omens (Ulaman, Amanamu, Kurgal), Omen of Light, Essence of the Abyss, Omen of Putrefaction"],
    // 2026-10-17 オーナー「次は冒涜のチュートリアル。勢力系はアマナムとか付ける時はそのアイテムのアマナムだけ一覧で」。
    // 骨 → 発現は 1 つの手 (chain)。冒涜の MOD は 1 つのアイテムに 1 つまでなので、骨の手は毎回 MOD 4 つの黄 (レア) から (ALWAYS)
    steps: [
      { ...ALWAYS(H("desecrate", ["骨 → 発現", "Bone → reveal"], [
        ["骨は黄色 (レア) のアイテムに使う。中身の分からない「未発現の冒涜 MOD」が 1 つ付く", "Bones are used on yellow (Rare) items. They add 1 “Unrevealed Desecrated mod” whose contents are hidden"],
        ["発現は、アイテムの下に出る候補 3 つから 1 つを選んで「確認」", "To reveal, pick 1 of the 3 options under the item and press Confirm"],
        ["空きが無い時は、付ける側の MOD がランダムに 1 つ消えて入れ替わる", "If there's no open slot, a random mod on that side is removed to make room"],
        ["冒涜の MOD は 1 つのアイテムに 1 つまで。骨の種類 (顎骨・肋骨・鎖骨) は部位で決まる (指輪は鎖骨)", "Only 1 Desecrated mod per item. The bone type (Jawbone, Rib, Collarbone) depends on the item (rings use Collarbones)"],
      ], ["alchemy"])), chain: [S("reveal", ["発現", "Reveal"])] },
      { ...ALWAYS(H("desecrate_gnawed", ["噛み切られた骨", "Gnawed bone"], [
        ["噛み切られた骨は、アイテムレベル 64 以下のアイテムにだけ使える", "Gnawed bones work only on items of item level 64 or lower"],
        ["候補の出方は保存された骨と同じ", "The options are the same as with a Preserved bone"],
      ], ["alchemy"])), chain: [S("reveal", ["発現", "Reveal"])] },
      { ...ALWAYS(H("desecrate_ancient", ["古びた骨", "Ancient bone"], [
        ["古びた骨は、発現の候補が MOD レベル 40 以上の物だけになる", "With an Ancient bone, the reveal options are only mods of mod level 40 or higher"],
      ], ["alchemy"])), chain: [S("reveal", ["発現", "Reveal"])] },
      { ...ALWAYS(H("desecrate_altered", ["変質した鎖骨", "Altered Collarbone"], [
        ["変質した鎖骨は、装飾品 (指輪・アミュレットなど) にだけ使える", "Altered Collarbones work only on jewellery (rings, amulets and so on)"],
        ["発現の候補に、異界の MOD も入る", "The reveal options can also include Otherworldly mods"],
      ], ["alchemy"])), chain: [S("reveal", ["発現", "Reveal"])] },
      { ...ALWAYS(H("desecrate", ["お告げで付く側を決める", "Pick the side with an omen"], [
        ["左側のネクロマンシーのお告げを掛けると、未発現の MOD がプレフィックスに付く (右側ならサフィックス)", "With Omen of Sinistral Necromancy, the Unrevealed mod goes to a prefix (Dextral: suffix)"],
        ["その側が埋まっている時は、その側の MOD がランダムに 1 つ消えて入れ替わる", "If that side is full, a random mod on that side is replaced"],
      ], ["alchemy"])), omens: ["OmenofSinistralNecromancy"], chain: [S("reveal", ["発現", "Reveal"])] },
      { ...ALWAYS(H("desecrate", ["発現の候補を引き直す", "Reroll the reveal options"], [
        ["発現の前にアビスの反響のお告げを掛けると、候補 3 つを 1 回だけ引き直せる", "Apply Omen of Abyssal Echoes before revealing to reroll the 3 options once"],
        ["発現の手のボタンを押すとお告げが掛かる。候補の窓の右下の回る矢印で引き直せる", "Press the Reveal button to apply the omen; the circular arrow at the bottom right of the options rerolls them"],
      ], ["alchemy"])), chain: [S("reveal", ["発現 (反響)", "Reveal (Echoes)"], ["OmenofAbyssalEchoes"])] },
      { ...ALWAYS(H("desecrate", ["勢力: ウラマン", "Faction: Ulaman"], [
        ["支配者のお告げを掛けると、発現の候補がウラマンの MOD だけになる", "With Omen of the Sovereign, the reveal options are Ulaman mods only"],
        ["このアイテムに付くウラマンの MOD は下の一覧", "The Ulaman mods this item can get are listed below"],
      ], ["alchemy"])), omens: ["OmenoftheSovereign"], chain: [S("reveal", ["発現", "Reveal"])] },
      { ...ALWAYS(H("desecrate", ["勢力: アマナム", "Faction: Amanamu"], [
        ["君主のお告げを掛けると、発現の候補がアマナムの MOD だけになる", "With Omen of the Liege, the reveal options are Amanamu mods only"],
        ["このアイテムに付くアマナムの MOD は下の一覧", "The Amanamu mods this item can get are listed below"],
      ], ["alchemy"])), omens: ["OmenoftheLiege"], chain: [S("reveal", ["発現", "Reveal"])] },
      { ...ALWAYS(H("desecrate", ["勢力: クルガル", "Faction: Kurgal"], [
        ["ブラックブラッドのお告げを掛けると、発現の候補がクルガルの MOD だけになる", "With Omen of the Blackblooded, the reveal options are Kurgal mods only"],
        ["このアイテムに付くクルガルの MOD は下の一覧", "The Kurgal mods this item can get are listed below"],
      ], ["alchemy"])), omens: ["OmenoftheBlackblooded"], chain: [S("reveal", ["発現", "Reveal"])] },
      { ...ALWAYS(H("annul", ["冒涜の MOD だけを消す", "Remove only the Desecrated mod"], [
        ["光のお告げを掛けた消去は、冒涜の MOD (未発現も) だけを消す", "Annulment with Omen of Light removes only the Desecrated mod (Unrevealed too)"],
        ["ほかの MOD は消えない。冒涜をやり直したい時に使う", "Other mods stay. Use it to redo a Desecration"],
      ], ["alchemy", "desecrate"])), omens: ["OmenofLight"] },
      { ...ALWAYS(H("ess:the Abyss:perfect", ["アビス → 骨 → 発現", "Abyss → bone → reveal"], [
        ["アビスのエッセンスで「アビサルロードの紋章を身につけている」が必ず付く", "Essence of the Abyss always adds “Bears the Mark of the Abyssal Lord”"],
        ["骨を使うと、紋章が未発現の冒涜 MOD に入れ替わる (側は紋章の側)", "A Bone then replaces the Mark with an Unrevealed Desecrated mod (on the Mark's side)"],
        ["紋章からの冒涜は、MOD レベルがアイテムレベルの 4 割以上の物だけ", "Desecrations from the Mark only offer mods of at least 40% of the item level"],
      ], ["alchemy"])), chain: [S("desecrate", ["骨で冒涜", "Desecrate with a Bone"]), S("reveal", ["発現", "Reveal"])] },
      { ...ALWAYS(H("desecrate", ["腐食のお告げ", "Omen of Putrefaction"], [
        ["腐食のお告げを掛けた骨は、MOD を全部消して、空き全部に未発現の MOD を付ける (最大 6 つ)", "A Bone with Omen of Putrefaction removes every mod and fills every slot with Unrevealed mods (up to 6)"],
        ["アイテムはコラプトする (もう手を加えられない)。発現で付くのは普通の MOD だけ", "The item becomes Corrupted (no further changes). Reveals offer normal mods only"],
      ], ["alchemy"])), omens: ["OmenofPutrefaction"] },
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
