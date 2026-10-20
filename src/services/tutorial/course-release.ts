// どのコースを出すか (StageCourses.vue の一覧と、URL の ?course= で開く時の両方。2026-10-18 使い方・コツのページ)
import type { TopicCourse } from "./topic-courses";

/** オーナーの合格が出た段だけ出す (開発版でも。2026-10-17 オーナー「他まだ合格できてないから非表示、即出せるように」)。合格したら足す */
export const OPEN_LEVELS: number[] = [1];
/** 本番に出すコース (合格したコースだけ。2026-10-17 基本のオーブだけ OK、エッセンスはまだ)。手元の dev は OPEN_LEVELS の段を全部 */
export const RELEASED = new Set(["orbs", "essence", "desecrate", "omens", "catalyst", "emotion", "adv-fracture", "adv-essence-desecrate", "adv-two-essences", "adv-jewel-five", "adv-quality-chaos"]);
const DEV_BUILD = import.meta.env.DEV; // 開発版 (deploy:web-dev) も本番と同じ表示 (2026-10-17 オーナー「表示は本番用でおk」)。手元の dev だけ全部
/** 開発版 (deploy:web-dev) でだけ出す、オーナーに見てもらい中のコース (合格したら RELEASED へ移す) */
export const REVIEW = new Set<string>(["guide-absent-spell6"]); // クラフト手順 (2026-10-20 要望 93d00e7c)
const DEV_PREVIEW = import.meta.env.VITE_DEV_PREVIEW === "1";
export const courseShown = (c: TopicCourse): boolean => (DEV_BUILD ? OPEN_LEVELS.includes(c.level) : RELEASED.has(c.id)) || (DEV_PREVIEW && REVIEW.has(c.id));
