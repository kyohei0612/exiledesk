/**
 * course-entry.ts — エミュの画面 (クラフト台) がチュートリアルから取る物の入口 (2026-10-23 ブラック。チュートリアルはエミュの画面の上で動くので差し込み口で繋ぐ)。
 * ここは名前を並べるだけ (中身は元のファイル)。エミュの画面はチュートリアルの state/・views/ を直に読まず、ここから取る
 */
// コースの間か・隠す判定・終わる (CraftStage)
export { courseActive, courseHidesEmulator, courseHidesShelf, endLesson } from "../../state/tutorial/course-host";
// 差し込み口 header / main / under-item / above-shelf / overlay (CraftStage)
export { default as CourseHost } from "./CourseHost.vue";
// 使い方の段の今と手 (RevealPanel・use-stage-base)
export { topic, topicCur, topicStep } from "../../state/tutorial/craft-topic";
// レッスン中か (StageSettings)
export { inLesson } from "../../state/tutorial/craft-lesson";
// コース (use-stage-base)
export { course } from "../../state/tutorial/craft-course";
