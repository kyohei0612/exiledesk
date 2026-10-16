/**
 * craft-course.ts — いま遊んでいるクラフトのコース (2026-10-17、[[craft-courses.ts]])。
 * エミュレーターのアイテムを見て、付ける順番のどこまで済んだか・次はどれかを出す。打つのはいつものエミュレーター (作り方は自由)
 */
import { computed, ref, watch } from "vue";
import { craftStage as s } from "./craft-stage";
import { courseProgress, type CraftCourse } from "../services/craft-stage/craft-courses";

export const course = ref<CraftCourse | null>(null);

/** コースを始める: ベースとアイテムレベルを決めて白から */
export function startCourse(c: CraftCourse): void {
  course.value = c;
  s.base.value = c.base;
  s.itemLevel.value = c.itemLevel;
  s.mode.value = "hand";
  s.reset();
}
export function endCourse(): void { course.value = null; }
// ほかのベースにしたらコースは終わり
watch(() => s.base.value, (b) => { if (course.value && b !== course.value.base) course.value = null; });

/** 段ごとの済み・今の段 (済んでいない一番上) */
export const courseSteps = computed(() => {
  const c = course.value;
  if (!c) return [];
  const it = s.item.value;
  const done = it ? courseProgress(c, it) : c.steps.map(() => false);
  const cur = done.findIndex((d) => !d);
  return c.steps.map((x, i) => ({ step: x, done: done[i]!, current: i === cur }));
});
export const courseDone = computed(() => courseSteps.value.length > 0 && courseSteps.value.every((x) => x.done));
