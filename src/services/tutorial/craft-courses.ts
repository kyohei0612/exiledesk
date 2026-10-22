/**
 * craft-courses.ts — クラフトのコース (2026-10-17 オーナー「チュートリアルは白紙、今まで読んだ字幕のクラフト方法を難易度順に、それぞれ 1 から作らせる」)。
 *
 * 決まり (オーナー 2026-10-17):
 *   - 遊ぶ人はエミュレーターで自分で打つ (作り方は自由)。教えるのは「付ける順番」と「その MOD はこれで狙う」だけ
 *   - 中級までは 1 発で付く狙い方を、上級は外れた時の消去の道も (元のレシピの「この時はこれ」がそのまま道になる)
 *   - 難しさ順に並べるが、どれからでも始められる
 *
 * 1 コース = 動画 (か見本) 1 本のクイズのレシピ (quiz-tutorials.ts / quiz-samples.ts)。始めは動画と同じ状態 (買ったベース) を置く。
 * 付ける順番 = 完成の形の札の並び。今やる手 = 今のアイテムの状況に当たるレシピの手 (ruleFor)。
 * レシピはどれも 200 人で完成 100% を確かめてある (tests/tutorial/craft-courses.test.ts)
 */
import type { JaEn } from "./quiz-tutorials";
import { amuletCourse, bootsCourse, glovesCourse, spearCourse, wandCourse, type CourseRecipe } from "./course-recipes";
import { assignSlots, routeOf, ruleFor, situationOf, type QuizAction, type QuizRecipe, type QuizSlot } from "../simulator/quiz-recipe";
import { type StageItem } from "../craft-stage/engine";

export interface CraftCourse {
  id: string;
  /** 1 入門 / 2 初級 / 3 中級 / 4 上級 */
  level: 1 | 2 | 3 | 4;
  part: JaEn;
  /** 元の動画 (無ければ見本) */
  video: { id: string | null; title: JaEn };
  learn: JaEn;
  recipe: QuizRecipe;
  /** レシピの手ごとの説明 (並びはレシピの rules と同じ。無い手は手の名前だけ) */
  why: Array<JaEn | undefined>;
  assumed: JaEn[];
}

const fromCourse = (id: string, level: CraftCourse["level"], part: JaEn, video: CraftCourse["video"], learn: JaEn, r: CourseRecipe): CraftCourse =>
  ({ id, level, part, video, learn, recipe: r.recipe, why: r.why, assumed: r.assumed });

/**
 * 入門〜中級は必ず付く手だけ (course-recipes.ts)。上級 (外れの道あり。フラクチャー・触媒・液化した感情など) は
 * 2026-10-17 オーナー「入門・中級をやってから上級に取り掛かる」で後から (元のレシピは quiz-tutorials.ts / quiz-samples.ts に残してある)
 */
export const CRAFT_COURSES: CraftCourse[] = [
  fromCourse("wand", 1, ["武器", "Weapon"], { id: "qdyfBnzqBLo", title: ["SaVeQ のワンド", "SaVeQ's wand"] },
    ["エッセンスで確実に付けてレアに・勢力のお告げで冒涜を狙う", "Essence for a sure mod and rare, faction omen for the desecration"], wandCourse()),
  fromCourse("spear", 2, ["武器", "Weapon"], { id: "7V0WBMOGbPg", title: ["出血の槍", "Bleed spear"] },
    ["擦傷のエッセンス・ブラックブラッドのお告げで冒涜・偉大なる高貴のお告げ", "Abrasion essence, Blackblooded desecration, Greater Exaltation"], spearCourse()),
  fromCourse("amulet", 3, ["アミュレット", "Amulet"], { id: null, title: ["見本 (金のアミュレット)", "Example (Gold Amulet)"] },
    ["MOD 1 つのレアをパーフェクトエッセンスで置き換える・クルガルの冒涜", "Replace the only mod with a Perfect Essence, Kurgal desecration"], amuletCourse()),
  fromCourse("gloves", 3, ["防具", "Armour"], { id: "T7R90v2JvFI", title: ["SaVeQ の手袋", "SaVeQ's gloves"] },
    ["アストリッドでエッセンス 2 つ・左の結晶化で外れだけを消す", "Two essences with Astrid, Sinistral Crystallisation to remove only the throwaway"], glovesCourse()),
  fromCourse("boots", 3, ["防具", "Armour"], { id: "S-7YHuq3-P4", title: ["時間術の靴", "Chronomancy boots"] },
    ["絢爛のエッセンスでレアに・アストリッド・神秘の合金と結晶化でスピリット", "Opulence essence to rare, Astrid, Spirit with crystallisation"], bootsCourse()),
];

/** 付ける順番の札 (完成の形の並び。途中だけ使う札は外す) */
export const courseSlots = (c: CraftCourse): QuizSlot[] => c.recipe.routes[0]!.goal.filter((s) => !s.temp);
/** 札ごとの状態 (0 無い / 1 段が低い / 2 付いている / 3 固定) */
export function courseState(c: CraftCourse, it: StageItem): Record<string, number> {
  return assignSlots(it, routeOf(c.recipe, it).goal).state;
}
/** 今やる手 (今の状況に当たるレシピの手) と、その手の番号 */
export function courseMove(c: CraftCourse, it: StageItem): { action: QuizAction; index: number } | null {
  const route = routeOf(c.recipe, it);
  const r = ruleFor(route.rules, situationOf(it, route.goal));
  return r ? { action: r.do, index: route.rules.indexOf(r) } : null;
}
