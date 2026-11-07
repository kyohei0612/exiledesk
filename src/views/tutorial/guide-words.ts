/**
 * guide-words.ts — チュートリアルのコースの画面 (一覧 StageCourses・動作を学ぶ StageTopicGuide・クラフト手順 StageCourseGuide) で同じ文を 1 か所に (G-1 V-3 J-46・J-53、11-07)。
 * 前は画面ごとの写しで、級 4 の英語が Advanced と Hard で食い違い、段の札の剥がし方 (正規表現) も 2 画面に別々にあった。
 */
import { aimLabel, type PatchData } from "../../services/craft-stage/engine";
import type { JaEn } from "../../services/tutorial/quiz-tutorials";

/** コースの級の名前と札の色 (5 = クラフト手順。一覧の見出しは複数形の別の文) */
export const COURSE_LEVEL: Record<1 | 2 | 3 | 4 | 5, { label: JaEn; chip: string }> = {
  1: { label: ["入門", "Intro"], chip: "bg-emerald-500/25 text-emerald-100" },
  2: { label: ["初級", "Easy"], chip: "bg-sky-500/25 text-sky-100" },
  3: { label: ["中級", "Medium"], chip: "bg-amber-500/25 text-amber-100" },
  4: { label: ["上級", "Advanced"], chip: "bg-rose-500/25 text-rose-100" },
  5: { label: ["クラフト手順", "Crafting guide"], chip: "bg-violet-500/25 text-violet-100" },
};
/** 級の番号から (無い番号は undefined。画面は ! で読んでいた) */
export const courseLevel = (n: number): { label: JaEn; chip: string } | undefined => COURSE_LEVEL[n as 1 | 2 | 3 | 4 | 5];

/**
 * 狙いの MOD の名前から段の札「(T n 以上)」を外した文 (段を問わない狙い・候補の一覧)。エンジンの aimLabel に札なしの口が無いので、
 * 書式 (mod-list.ts の aimLabel の後ろの括弧) を読むのはここ 1 か所だけ (書式を変えた時に直すのもここ。札なしの口はエンジンに頼む)
 */
const TIER_TAG = / \((T\d+ 以上|T\d+\+)\)$/;
export const aimNameBare = (d: PatchData | null, a: { modId: string; minTierIndex: number; label: string }): string => aimLabel(d, a).replace(TIER_TAG, "");
