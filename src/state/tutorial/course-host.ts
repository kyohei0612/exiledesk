/**
 * course-host.ts — クラフトステージ (CraftStage.vue) がチュートリアルのコースについて読む物の 1 か所 (2026-10-20 R4 手 2)。
 * CraftStage は craft-lesson.ts の中を直に読まず、ここだけを読む (コースの作りが変わってもエミュの画面の条件が散らない)。
 */
import { endLesson, inLesson, inTopic } from "./craft-lesson";

export { endLesson };
/** コース (トピック・動画のクラフトのコース) の間か。題・タブ・1 手戻す・ページの移りの判定に */
export const courseActive = inLesson;
/** コースの間はエミュの部品 (品質・聖別の帯、MOD を外す、工程、狙う、MOD 一覧、スパムシミュレーターの入口) を隠す */
export const courseHidesEmulator = inLesson;
/** カレンシーの使い方のトピックの間はカレンシーの棚を隠す (トピックの案内に棚がある) */
export const courseHidesShelf = inTopic;
