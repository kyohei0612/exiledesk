/**
 * topic-courses.ts — 動作を学ぶコース (入門〜中級。2026-10-17 オーナー「入門初級中級では小テクを全て紹介する形、タイトルは学べる動作。
 * 冒涜を学ぶなら冒涜のカレンシー全部体験 + 解説。エッセンス・カタリスト・お告げ周り、関連を一気に立て続けに紹介」)。
 *
 * 1 コース = 1 つのアイテムに、並べた手を順に打つ。どの手も、前の手まで打った状態なら必ず打てる並びにしてある
 * (tests/topic-courses.test.ts で 200 回ずつ確かめる)。説明は手ごとの一言 (note) + エミュレーターのカードの「このステージでの動き」。
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
const RESET = S("reset", ["白に戻して、次の手の準備", "Reset to white for the next move"]);
const EMPTY: TopicStep[] = [
  S("transmute", ["変成のオーブでマジックに", "Make it magic with an Orb of Transmutation"]),
  S("annul", ["付いた MOD を消去で消して、空のマジックに (エッセンスと同じ系統がぶつからないように)", "Annul it to an empty magic (so no same-group mod blocks the essence)"]),
];

export const TOPIC_COURSES: TopicCourse[] = [
  {
    id: "orbs", level: 1, title: ["基本のオーブを学ぶ", "Learn the basic orbs"], base: "Dueling Wand", itemLevel: 82,
    learn: ["変成・増強・王者・高貴・カオス・消去・神・フラクチャー・錬金と、上級・完全の違い", "Transmute, augment, regal, exalt, chaos, annul, divine, fracture, alchemy, and greater / perfect tiers"],
    steps: [
      S("transmute", ["ノーマル → マジック。MOD が 1 つ付く", "Normal → magic with 1 mod"]),
      S("augment", ["マジックに 2 つ目の MOD を足す (マジックはプレフィックス 1・サフィックス 1 まで)", "Adds a 2nd mod to a magic item (magic: 1 prefix + 1 suffix)"]),
      S("annul", ["MOD を 1 つ消す (どれが消えるかは等しく)", "Removes 1 mod (each equally likely)"]),
      S("augment_greater", ["上級は、付く MOD の段に下限がある (低い段が出ない)", "Greater tiers have a minimum mod level (no low tiers)"]),
      S("regal", ["マジック → レア。MOD を 1 つ足す", "Magic → rare, adding 1 mod"]),
      S("exalt", ["レアに MOD を 1 つ足す (最大 6 つ)", "Adds 1 mod to a rare (up to 6)"]),
      S("exalt_greater", ["上級の高貴: 足す MOD の段の下限が上がる", "Greater Exalted: higher minimum tier"]),
      S("exalt_perfect", ["完全な高貴: 段の高い MOD だけ", "Perfect Exalted: only high tiers"]),
      S("chaos", ["MOD を 1 つ消して、1 つ足す (入れ替え)", "Removes 1 mod and adds 1 (a swap)"]),
      S("chaos_greater", ["上級のカオス: 足す方の段の下限が上がる", "Greater Chaos: higher minimum tier for the added mod"]),
      S("chaos_perfect", ["完全なカオス: 足す方は段の高い MOD だけ", "Perfect Chaos: the added mod is high tier only"]),
      S("annul", ["消去をもう一度。空きを作る", "Annul again to open a slot"]),
      S("divine", ["神のオーブ: MOD の数値だけを振り直す (段は変わらない)", "Divine Orb: rerolls values only (tiers stay)"]),
      S("fracture", ["フラクチャー: 4 つ以上の MOD のうち 1 つを固定。固定した MOD はもう消えない", "Fracture: locks 1 of 4+ mods; it can no longer be removed"]),
      RESET,
      S("transmute_greater", ["上級の変成: 段の下限つきでマジックに", "Greater Transmutation: magic with a tier floor"]),
      S("regal_greater", ["上級の王者: 段の下限つきでレアに", "Greater Regal: rare with a tier floor"]),
      RESET,
      S("transmute_perfect", ["完全な変成", "Perfect Transmutation"]),
      S("augment_perfect", ["完全な増強", "Perfect Augmentation"]),
      S("regal_perfect", ["完全な王者", "Perfect Regal"]),
      RESET,
      S("alchemy", ["錬金: ノーマル → レア。MOD が 4 つ付く", "Alchemy: normal → rare with 4 mods"]),
    ],
  },
  {
    id: "essence", level: 1, title: ["エッセンスを学ぶ", "Learn essences"], base: "Secured Wraps", itemLevel: 82,
    learn: ["レッサー〜グレーター (マジック → レア)・パーフェクト・コラプト・合金・結晶化のお告げ・アストリッド", "Lesser to greater (magic → rare), perfect, corrupted, alloys, crystallisation omens, Astrid"],
    steps: [
      ...EMPTY,
      S("ess:Opulence:lesser", ["レッサーエッセンス: マジック → レア。決まった MOD が必ず付く (段は低め)", "Lesser Essence: magic → rare with a fixed mod (low tier)"]),
      RESET, ...EMPTY,
      S("ess:Opulence:normal", ["普通のエッセンス: 同じ MOD でも段が上がる", "Normal Essence: the same mod at a higher tier"]),
      RESET, ...EMPTY,
      S("ess:Opulence:greater", ["グレーターエッセンス: もっと高い段", "Greater Essence: higher still"]),
      RESET,
      S("alchemy", ["パーフェクトエッセンスはレアに打つ。まず錬金でレアに", "Perfect Essences go on rares; alchemy first"]),
      S("ess:Grounding:perfect", ["パーフェクトエッセンス: レアの MOD を 1 つ消してから、決まった MOD を付ける", "Perfect Essence: removes 1 mod from a rare, then adds its mod"]),
      S("rune:Astrid's Creativity", ["エッセンスの MOD は普通 1 つまで。アストリッドの創造性をはめると 2 つ持てる", "Normally 1 essence mod; Astrid's Creativity allows 2"]),
      S("ess:Hysteria:perfect", ["コラプトのエッセンス (ヒステリー)。右の結晶化のお告げで、消す MOD をサフィックスに絞る", "A corrupted essence (Hysteria). Dextral Crystallisation makes it remove a suffix"], ["OmenofDextralCrystallisation"]),
      RESET,
      S("alchemy", ["合金を試すため、もう一度レアに", "Rare again to try an alloy"]),
      S("ess:Adaptive Alloy:perfect", ["合金もパーフェクトエッセンスと同じ扱い (結晶化も効く)", "Alloys work like Perfect Essences (crystallisation works too)"]),
    ],
  },
  {
    id: "desecrate", level: 2, title: ["冒涜を学ぶ", "Learn desecration"], base: "Gold Ring", itemLevel: 64,
    learn: ["骨 4 種・発現・アビスの反響・左右のネクロマンシー・勢力のお告げ・光のお告げ・深淵のエッセンス", "4 bones, revealing, Abyssal Echoes, Necromancy, faction omens, Omen of Light, Essence of the Abyss"],
    steps: [
      S("transmute", ["まずマジックに", "Magic first"]),
      S("regal", ["骨はレアに打つ。王者でレアに", "Bones go on rares; Regal first"]),
      S("desecrate_gnawed", ["噛み切られた骨: 未発現の冒涜 MOD を 1 つ付ける。アイテムレベル 64 以下にだけ使える (このコースは 64 で始める)", "Gnawed bone: adds 1 unrevealed desecrated mod. Only for item level 64 or lower (this course starts at 64)"]),
      S("reveal", ["発現: 候補 3 つから 1 つ選ぶ (カレンシーは要らない)", "Reveal: pick 1 of 3 (no currency)"]),
      S("annul", ["光のお告げ + 消去: 冒涜の MOD だけを消す (冒涜はアイテムに 1 つまでなので、次の骨の前に)", "Omen of Light + Annulment removes only the desecrated mod (only 1 per item)"], ["OmenofLight"]),
      S("desecrate", ["保存された骨 + 左手のネクロマンシー: プレフィックスに付ける", "Preserved bone + Sinistral Necromancy: on the prefix side"], ["OmenofSinistralNecromancy"]),
      S("reveal", ["アビスの反響のお告げを掛けて発現すると、候補 3 つを 1 回だけ引き直せる", "With Omen of Abyssal Echoes you can reroll the 3 options once"], ["OmenofAbyssalEchoes"]),
      S("annul", ["光のお告げで、また冒涜だけ消す", "Omen of Light again"], ["OmenofLight"]),
      S("desecrate_ancient", ["古代の骨 + 右手のネクロマンシー + 支配者のお告げ: サフィックスに、候補はウラマンだけ", "Ancient bone + Dextral Necromancy + Omen of the Sovereign: suffix, Ulaman only"], ["OmenofDextralNecromancy", "OmenoftheSovereign"]),
      S("reveal", ["ウラマンの MOD から選ぶ", "Pick from Ulaman mods"]),
      S("annul", ["光のお告げ", "Omen of Light"], ["OmenofLight"]),
      S("desecrate_altered", ["変質した骨 (装飾品だけ) + 君主のお告げ: 候補はアマナムだけ", "Altered bone (jewellery only) + Omen of the Liege: Amanamu only"], ["OmenoftheLiege"]),
      S("reveal", ["アマナムの MOD から選ぶ", "Pick from Amanamu mods"]),
      S("annul", ["光のお告げ", "Omen of Light"], ["OmenofLight"]),
      S("ess:the Abyss:perfect", ["深淵のエッセンス: MOD を 1 つ消して「深淵の王の印」を付ける", "Essence of the Abyss: removes a mod and adds the Mark of the Abyssal Lord"]),
      S("desecrate", ["印の付いたアイテムに骨: 印が未発現の冒涜 MOD に置き換わる (段の下限が上がる)", "A bone on the Mark replaces it with an unrevealed desecrated mod (higher tier floor)"], ["OmenoftheBlackblooded"]),
      S("reveal", ["ブラックブラッドのお告げを掛けたので、クルガルの MOD から選ぶ", "Blackblooded was applied: pick from Kurgal mods"]),
    ],
  },
  {
    id: "omens", level: 2, title: ["お告げを学ぶ", "Learn omens"], base: "Gold Ring", itemLevel: 82,
    learn: ["高貴 (左右・偉大)・消去 (左右)・カオス (削減・左右の抹消)・神 (祝福・聖別)", "Exalt (sides, greater), annul (sides), chaos (whittling, erasure), divine (blessed, sanctification)"],
    steps: [
      S("transmute", ["まずマジックに", "Magic first"]),
      S("regal", ["レアに", "Make it rare"]),
      S("exalt", ["左の高貴のお告げ: 次の高貴はプレフィックスだけに足す", "Sinistral Exaltation: the next exalt adds a prefix"], ["OmenofSinistralExaltation"]),
      S("exalt", ["右の高貴のお告げ: サフィックスだけに", "Dextral Exaltation: a suffix"], ["OmenofDextralExaltation"]),
      S("exalt", ["偉大なる高貴なお告げ: 1 回で 2 つ足す", "Greater Exaltation: adds 2 at once"], ["OmenofGreaterExaltation"]),
      S("annul", ["左の消去のお告げ: プレフィックスから消す", "Sinistral Annulment: removes a prefix"], ["OmenofSinistralAnnulment"]),
      S("annul", ["右の消去のお告げ: サフィックスから消す", "Dextral Annulment: removes a suffix"], ["OmenofDextralAnnulment"]),
      S("exalt", ["空いた所を埋め直す", "Refill"], ["OmenofGreaterExaltation"]),
      S("chaos", ["削減のお告げ: カオスで消すのは MOD レベルが一番低い物", "Whittling: chaos removes the lowest-level mod"], ["OmenofWhittling"]),
      S("chaos", ["左の抹消のお告げ: カオスで消すのはプレフィックス", "Sinistral Erasure: chaos removes a prefix"], ["OmenofSinistralErasure"]),
      S("chaos", ["右の抹消のお告げ: サフィックス", "Dextral Erasure: a suffix"], ["OmenofDextralErasure"]),
      S("divine", ["祝福のお告げ: 神のオーブで暗黙 MOD だけを振り直す", "Omen of the Blessed: Divine rerolls only the implicit"], ["OmenoftheBlessed"]),
      S("divine", ["聖別のお告げ: 数値を 0.78〜1.22 倍にして聖別。以後は手を加えられない (最後に)", "Sanctification: multiplies values 0.78–1.22 and sanctifies; no more changes (last)"], ["OmenofSanctification"]),
    ],
  },
  {
    id: "catalyst", level: 3, title: ["カタリストと品質を学ぶ", "Learn catalysts and quality"], base: "Gold Ring", itemLevel: 82,
    learn: ["カタリストの種類・別の種類は 0 から・触媒の高貴のお告げ", "Catalyst types, a new type restarts from 0, Catalysing Exaltation"],
    steps: [
      S("transmute", ["まずマジックに", "Magic first"]),
      S("regal", ["レアに (品質は指輪・アミュレット)", "Rare (quality: rings and amulets)"]),
      S("catalyst_fire", ["ゾフのカタリスト: 火の MOD を強化する品質を上限まで", "Xoph's: fire quality up to the cap"]),
      S("exalt", ["触媒の高貴のお告げ: 品質の種類に合う MOD (火) を重く引く。品質は使い切る", "Catalysing Exaltation: weights mods of that type (fire); quality is consumed"], ["OmenofCatalysingExaltation"]),
      S("catalyst_cold", ["トゥルのカタリスト: 冷気。種類を替えると品質は 0 から", "Tul's: cold. A new type restarts from 0"]),
      S("catalyst_lightning", ["エシュのカタリスト: 雷", "Esh's: lightning"]),
      S("catalyst_chaos", ["混沌", "Chaos"]),
      S("catalyst_physical", ["物理", "Physical"]),
      S("catalyst_attribute", ["能力値", "Attributes"]),
      S("catalyst_speed", ["速度", "Speed"]),
      S("catalyst_caster", ["キャスター", "Caster"]),
      S("catalyst_minion", ["ミニオン", "Minions"]),
      S("catalyst_mana", ["マナ", "Mana"]),
      S("catalyst_life", ["ライフ", "Life"]),
      S("catalyst_defences", ["防御", "Defences"]),
      S("exalt", ["偉大なる高貴なお告げと重ねると、足す 2 つとも重く引く", "With Greater Exaltation, both added mods are weighted"], ["OmenofCatalysingExaltation", "OmenofGreaterExaltation"]),
    ],
  },
  {
    id: "emotion", level: 3, title: ["液化した感情を学ぶ", "Learn liquid emotions"], base: "Emerald", itemLevel: 82,
    learn: ["レアのジュエルに 1 つ消して決まった作った MOD を付ける・枠を増やす軽蔑・効果を上げる獰猛", "Removes 1 mod from a rare jewel and adds a fixed crafted mod; Contempt adds a slot, Ferocity raises effect"],
    steps: [
      S("transmute", ["まずマジックに", "Magic first"]),
      S("regal", ["液化した感情はレアのジュエルに", "Liquid emotions go on rare jewels"]),
      S("emotion:Liquid Envy", ["液化した感情: ランダムに 1 つ消して、決まった作った MOD を付ける", "A liquid emotion removes a random mod and adds a fixed crafted mod"]),
      RESET, S("transmute", ["マジックに", "Magic"]), S("regal", ["レアに (作った MOD が付いている間は次の感情を使えないので、新しいジュエルで)", "Rare (no new emotion while a crafted mod is on)"]),
      S("emotion:Diluted Liquid Ire", ["希釈された: 効き目の小さい版", "Diluted: the weaker version"]),
      RESET, S("transmute", ["マジックに", "Magic"]), S("regal", ["レアに", "Rare"]),
      S("emotion:Concentrated Liquid Fear", ["濃縮された: 効き目の大きい版", "Concentrated: the stronger version"]),
      RESET, S("transmute", ["マジックに", "Magic"]), S("regal", ["レアに", "Rare"]),
      S("emotion:Potent Liquid Contempt", ["強力な液化した軽蔑: プレフィックスかサフィックスの枠を 1 つ増やす (どちらの版かはランダム)", "Potent Contempt: +1 prefix or suffix slot (version is random)"]),
      RESET, S("transmute", ["マジックに", "Magic"]), S("regal", ["レアに", "Rare"]),
      S("emotion:Potent Liquid Ferocity", ["強力な液化した獰猛: 反対側の MOD の効果を上げる", "Potent Ferocity: raises the effect of the other side's mods"]),
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
