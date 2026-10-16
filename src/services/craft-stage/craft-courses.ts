/**
 * craft-courses.ts — クラフトのコース (2026-10-17 オーナー「チュートリアルは白紙、今まで読んだ字幕のクラフト方法を難易度順に、それぞれ 1 から作らせる」)。
 *
 * 決まり (オーナー 2026-10-17):
 *   - 遊ぶ人はエミュレーターで自分で打つ (作り方は自由)。教えるのは「付ける順番」と「その MOD はこれで狙う」だけ
 *   - 中級までは 1 発で付く狙い方を教える。上級は外れた時の消去の道も出す
 *   - 難しさ順に並べるが、どれからでも始められる
 *   - どのコースも白のベースから
 *
 * 1 コース = 動画 1 本 (ベース・アイテムレベル・付ける順番)。進み具合は今のアイテムで見る ([[craft-course.ts]] の state)。
 */
import type { JaEn } from "./quiz-tutorials";
import { assignSlots, type QuizSlot } from "./quiz-recipe";
import type { StageItem } from "./types";

/** 使う物 (カレンシー・エッセンス・骨などのキー + 掛けるお告げ) */
export interface CourseUse { key: string; omens?: string[] }
/** 付ける順番の 1 つ */
export interface CourseStep {
  /** 見出し (MOD の名前で足りない時。「マジックにする」「残りは何でも」など) */
  title?: JaEn;
  /** この段で揃える物: rarity = レアリティになれば済み / slots = この札が全部付けば済み (mods が空の札は何でも良い) */
  rarity?: "magic" | "rare";
  /** rarity と一緒に: MOD が 1 つも無いこと (空のマジック) */
  empty?: boolean;
  slots?: QuizSlot[];
  /** これで狙う (並べた順に使う。2 つ目以降は前の手の後) */
  how: CourseUse[];
  /** 狙い方の説明 */
  why: JaEn;
  /** 外れた時・打てない時の道 (上級は消去の道。中級までは打てない時だけ) */
  miss?: { how: CourseUse[]; why: JaEn };
}
export interface CraftCourse {
  id: string;
  /** 1 入門 / 2 初級 / 3 中級 / 4 上級 */
  level: 1 | 2 | 3 | 4;
  part: JaEn;
  /** 動画 (YouTube の id と、誰の何の動画か) */
  video: { id: string; title: JaEn };
  base: string;
  itemLevel: number;
  /** ここで覚えること (1 行) */
  learn: JaEn;
  steps: CourseStep[];
  /** 動画と変えた所 (画面に「仮」) */
  assumed?: JaEn[];
}

const slot = (id: string, side: QuizSlot["side"], mods: string[], kind: QuizSlot["kind"] = "normal"): QuizSlot =>
  ({ id, side, mods: mods.map((modId) => ({ modId, minTierIndex: 0 })), kind });

/**
 * 入門: 決闘のワンド。SaVeQ のグリムピラーのワンド (qdyfBnzqBLo) の流れを白から:
 * 変成でマジック → 魔法のグレーターエッセンスでスペルダメージ (レアに) → 骨 + 左手のネクロマンシー + 君主のお告げで元素ダメージ → 残りは高貴
 */
function wand(): CraftCourse {
  const W = "Wands/";
  return {
    id: "wand", level: 1, part: ["武器", "Weapon"],
    video: { id: "qdyfBnzqBLo", title: ["SaVeQ のワンド", "SaVeQ's wand"] },
    base: "Dueling Wand", itemLevel: 82,
    learn: ["エッセンスで確実に付けてレアに・勢力のお告げで冒涜を狙う", "Essence for a sure mod and rare, faction omen for the desecration"],
    steps: [
      { title: ["空のマジックにする", "Make it an empty magic"], rarity: "magic", empty: true, how: [{ key: "transmute" }, { key: "annul" }],
        why: ["変成のオーブでマジックにして、付いた MOD は消去のオーブで消しておく (マジックのまま)。後のエッセンスや骨と同じ系統の MOD がぶつかって打てなくなるのを防ぐ", "Transmute to magic, then annul the mod it added (it stays magic). This keeps a same-group mod from blocking the essence or the bone later"] },
      { slots: [slot("E", "prefix", [W + "Essence_WeaponCasterDamagePrefix"], "essence")], how: [{ key: "essence:greater:" + W + "Essence_WeaponCasterDamagePrefix" }],
        why: ["マジックに魔法のグレーターエッセンスを打つと、スペルダメージが 1 発で付いてレアになる", "A Greater Essence of Sorcery on a magic item adds Spell Damage in one go and makes it rare"] },
      { slots: [slot("C", "prefix", [W + "Desecrated_WeaponDamageTypePrefix"], "desecrated")], how: [{ key: "desecrate", omens: ["OmenofSinistralNecromancy", "OmenoftheLiege"] }, { key: "reveal" }],
        why: ["元素ダメージはアマナムの冒涜のプレフィックス。骨に左手のネクロマンシー (プレフィックスに) と君主のお告げ (候補をアマナムだけに) を掛け、発現で選ぶ (候補 3 つに必ず入る)", "Elemental Damage is an Amanamu desecrated prefix: Sinistral Necromancy (prefix) + Omen of the Liege (Amanamu only) on the bone, then pick it on reveal (it is always among the 3)"] },
      { title: ["残りは何でも", "The rest can be anything"], slots: [slot("F", "prefix", []), slot("G", "suffix", []), slot("H", "suffix", [])], how: [{ key: "exalt_greater", omens: ["OmenofGreaterExaltation"] }, { key: "exalt" }],
        why: ["偉大なる高貴なお告げを掛けた上級の高貴で 2 つまとめて、最後の 1 つは普通の高貴で", "Greater Exalted Orb with Omen of Greater Exaltation adds 2 at once, then a plain Exalted Orb for the last one"] },
    ],
    assumed: [["動画は冷気スペルのレベル付きのマジックを買っている。ここでは白から、変成の MOD は消してから", "The video buys a magic wand with Cold Spell level; here you start from white and annul the transmuted mod"]],
  };
}

export const CRAFT_COURSES: CraftCourse[] = [wand()];

/** 段ごとに済んだか (札は全部の段をまとめて当てる。1 つの MOD を 2 つの札に数えない) */
export function courseProgress(c: CraftCourse, it: StageItem): boolean[] {
  const all: QuizSlot[] = c.steps.flatMap((x) => x.slots ?? []);
  const st = assignSlots(it, all).state;
  const own = c.steps.map((x) => {
    if (x.rarity) {
      const r = x.rarity === "magic" ? it.rarity === "magic" || it.rarity === "rare" : it.rarity === "rare";
      return r && (!x.empty || it.prefixes.length + it.suffixes.length === 0);
    }
    return (x.slots ?? []).every((sl) => (st[sl.id] ?? 0) >= (sl.kind === "fractured" ? 3 : 2));
  });
  // 後ろの段が済んでいれば前の段も済み (空のマジックはレアになったら空でなくなる。前の段に戻さない)
  return own.map((d, i) => d || own.slice(i + 1).some((x, j) => x && !c.steps[i + 1 + j]!.rarity && (c.steps[i + 1 + j]!.slots ?? []).some((sl) => sl.mods.length > 0)));
}
