/**
 * craft-topic.ts — いま遊んでいる「動作を学ぶコース」(2026-10-17、[[topic-courses.ts]])。
 * 並べた手を 1 つずつ、エミュレーターで実際に打ってもらう。打った手が今の手と合えば次へ。白に戻すのは案内のボタンで。
 * 名前・説明・打つ処理はエミュレーターの物をそのまま使う (2026-10-17 オーナー「エンジンや名前・説明は全部エミュレーターから」)
 */
import { computed, ref, watch } from "vue";
import { craftStage as s } from "./craft-stage";
import { splitOmens } from "../services/craft-stage/run-plan";
import { topicKey, type TopicCourse } from "../services/craft-stage/topic-courses";

export const topic = ref<TopicCourse | null>(null);
/** 今の手の番号 (steps.length で完成) */
export const topicAt = ref(0);
/**
 * 今の手を打ち終えた (結果を見ている)。打っても手は進めず、「次へ」で進む
 * (2026-10-17 オーナー「次へがやっぱり必要、打った瞬間次にすすむから」)
 */
export const topicUsed = ref(false);
watch([topic, topicAt], () => { topicUsed.value = false; }, { flush: "sync" });
/** 次の手へ (最後の手なら完了) */
export function topicNext(): void { if (topic.value && topicUsed.value) topicAt.value++; }

export function startTopic(c: TopicCourse, onStart?: () => void): void {
  onStart?.();
  topic.value = null;
  s.base.value = c.base;
  s.itemLevel.value = c.itemLevel;
  s.mode.value = "hand";
  s.reset();
  // コースは白にしてから付ける (1 つ前に戻るの始めの状態 = 白。craft-lesson.ts)
  topicAt.value = 0;
  topic.value = c;
}
export function endTopic(): void { topic.value = null; }
/** 手を選び直す (押した手から) */
export function goTopic(i: number): void { if (topic.value) topicAt.value = Math.max(0, Math.min(topic.value.steps.length, i)); }
/** 白に戻す手 (案内のボタン) */
export function topicReset(): void { s.reset(); topicAt.value++; }
// ほかのベースにしたらコースは終わり
watch(() => s.base.value, (b) => { if (topic.value && b !== topic.value.base) topic.value = null; });

/** 今の手 (と、実際に打つキー) */
export const topicStep = computed(() => {
  const c = topic.value, it = s.item.value, d = s.data.value;
  if (!c || topicAt.value >= c.steps.length) return null;
  const st = c.steps[topicAt.value]!;
  return { step: st, key: it && d ? topicKey(st, d, it) : null };
});
export const topicDone = computed(() => !!topic.value && topicAt.value >= topic.value.steps.length);

// 打った手が今の手と合えば「打ち終えた」(発現はどの候補でも。お告げは全部掛かっていること)。進むのは「次へ」で
watch(() => s.log.value.length, (n, old) => {
  const cur = topicStep.value;
  if (!cur || n <= (old ?? 0)) return;
  const e = s.log.value[n - 1];
  if (!e) return;
  const want = cur.step.use === "reveal" ? e.out.currency.startsWith("reveal") : e.out.currency === cur.key;
  const omensOk = (cur.step.omens ?? []).every((o) => splitOmens(e.out.omen).includes(o) || (o === "OmenofAbyssalEchoes" && e.out.currency.endsWith(":reroll")));
  if (want && omensOk && e.out.applied) topicUsed.value = true;
});
