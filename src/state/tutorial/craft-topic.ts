/**
 * craft-topic.ts — いま遊んでいる「動作を学ぶコース」(2026-10-17、[[topic-courses.ts]])。
 * 並べた手を 1 つずつ、エミュレーターで実際に打ってもらう。打った手が今の手と合えば次へ。白に戻すのは案内のボタンで。
 * 名前・説明・打つ処理はエミュレーターの物をそのまま使う (2026-10-17 オーナー「エンジンや名前・説明は全部エミュレーターから」)
 */
import { computed, ref, watch } from "vue";
import { craftStage as s } from "../craft-stage";
import { logRecord } from "../../utils/log-record";
import { splitOmens } from "../../services/craft-stage/engine";
import { topicKey, type TopicCourse } from "../../services/tutorial/topic-courses";

export const topic = ref<TopicCourse | null>(null);
/** 今の手の番号 (steps.length で完成) */
export const topicAt = ref(0);
/**
 * 今の手を打ち終えた (結果を見ている)。打っても手は進めず、「次へ」で進む
 * (2026-10-17 オーナー「次へがやっぱり必要、打った瞬間次にすすむから」)
 */
export const topicUsed = ref(false);
/** 続きのある手 (chain) で、いくつ目まで打ったか (0 = 最初の手から) */
export const topicSub = ref(0);
watch([topic, topicAt], () => { topicUsed.value = false; topicSub.value = 0; }, { flush: "sync" });
/** 次の手へ (最後の手なら完了) */
export function topicNext(): void { if (topic.value && topicUsed.value) topicAt.value++; }

export function startTopic(c: TopicCourse, onStart?: () => void): void {
  onStart?.();
  s.play.value = "lesson"; // チュートリアルの置き場で遊ぶ (エミュレーターの中身はそのまま。白に戻すより先に切り替える)
  logRecord("tutorial", { c: c.id, e: "start" });
  topic.value = null;
  s.base.value = c.base;
  s.itemLevel.value = c.itemLevel;
  s.mode.value = "hand";
  s.reset();
  // コースは白にしてから付ける (1 つ前に戻るの始めの状態 = 白。craft-lesson.ts)
  topicAt.value = 0;
  loopRound.value = 1;
  topic.value = c;
}
export function endTopic(): void { topic.value = null; loopRound.value = 1; }
/** 手を選び直す (押した手から) */
export function goTopic(i: number): void { loopRound.value = 1; if (topic.value) topicAt.value = Math.max(0, Math.min(topic.value.steps.length, i)); }
/** 白に戻す手 (案内のボタン) */
export function topicReset(): void { s.reset(); topicAt.value++; }
// ほかのベースにしたらコースは終わり
// コースの中で使うベース (手ごとの base) なら終わらない
watch(() => s.base.value, (b) => { const c = topic.value; if (c && b !== c.base && !c.steps.some((st) => st.base === b)) topic.value = null; });

/** 今の手 (と、実際に打つキー) */
export const topicStep = computed(() => {
  const c = topic.value, it = s.item.value, d = s.data.value;
  if (!c || topicAt.value >= c.steps.length) return null;
  const st = c.steps[topicAt.value]!;
  return { step: st, key: it && d ? topicKey(st, d, it) : null };
});
/** 今打つ手 (続きのある手なら、その中の今の手) */
export const topicCur = computed(() => {
  const cur = topicStep.value, it = s.item.value, d = s.data.value;
  if (!cur) return null;
  const st = topicSub.value === 0 ? cur.step : cur.step.chain?.[topicSub.value - 1];
  if (!st) return null;
  return { step: st, key: it && d ? topicKey(st, d, it) : null };
});
/** 連打で続ける手がまだ続くか (品質の上限まで / 決めた % まで、まだ打てる間) */
export function keepGoing(st: { untilMax?: boolean; untilQuality?: number }, key: string): boolean {
  if (s.usable(key) !== null) return false;
  if (st.untilMax) return true;
  return st.untilQuality != null && (s.item.value?.quality ?? 0) < st.untilQuality;
}
/** ループの手の何周目か (1 から。手が変わったら 1 に戻す) */
export const loopRound = ref(1);
// コースを始めた・手を選んだ・やめた時も 1 に戻す (手の番号が同じだと戻らず、始め直しても 2 周目のままだった。2026-10-18 オーナー「1 週目でスピリット 50 出る、リセットかかってない」)
watch([topic, topicAt], () => { loopRound.value = 1; });
export const topicDone = computed(() => !!topic.value && topicAt.value >= topic.value.steps.length);

// 打った手が今の手と合えば「打ち終えた」(発現はどの候補でも。お告げは全部掛かっていること)。進むのは「次へ」で
watch(() => s.log.value.length, (n, old) => {
  const cur = topicCur.value, chain = topicStep.value?.step.chain ?? [];
  if (!cur || n <= (old ?? 0)) return;
  const e = s.log.value[n - 1];
  if (!e) return;
  const want = cur.step.use === "reveal" ? e.out.currency.startsWith("reveal") : e.out.currency === cur.key;
  const omensOk = (cur.step.omens ?? []).every((o) => splitOmens(e.out.omen).includes(o) || (o === "OmenofAbyssalEchoes" && e.out.currency.endsWith(":reroll")));
  if (!want || !omensOk || !e.out.applied) return;
  // 発現の手は、未発現の MOD が全部無くなるまで次へ進めない (腐食で最大 6 つ。2026-10-17 オーナー「腐食は全部発現させてから完了に、もったいない体験が」)
  if (cur.step.use === "reveal" && [...e.after.prefixes, ...e.after.suffixes].some((m) => m.unrevealed)) return;
  // 品質を上げる手は上限まで連打で (まだ打てる間は手を終えない。2026-10-18 オーナー「初手は 20% まで上げさせてあげよう連打で」)
  if (cur.key && keepGoing(cur.step, cur.key)) return;
  // ループの手で狙いの MOD を発現したら、続き (エッセンス) を打たずに手を終える (2026-10-18 オーナー「スピリット 50 を発現させて終了」)
  const wr = topicStep.value?.step.wantReveal;
  if (wr && cur.step.use === "reveal" && e.added.some((m) => m.modId === wr.mod && (wr.value == null || m.values[0] === wr.value))) { topicUsed.value = true; return; }
  // ループの手で決めた MOD が全部そろったら手を終える
  const lu = topicStep.value?.step.loopUntil;
  if (lu && lu.mods.every((id) => [...e.after.prefixes, ...e.after.suffixes].some((m) => m.modId === id))) { topicUsed.value = true; return; }
  if (topicSub.value < chain.length) topicSub.value++; // 続きの手へ
  // ループの手は、続き (エッセンス) まで打ったら手の最初に戻して次の周へ (狙いを発現するまで手を終えない。2026-10-18 オーナー「エッセンス選んだあとクリア扱いでグレーアウト、復活させて」)
  else if (topicStep.value?.step.loop) {
    topicSub.value = 0;
    loopRound.value++;
    // その手のお告げは外して、次の周でもう一度押して掛ける (掛けたままだとお告げのボタンがグレーアウトしていた。ゲームでもお告げは 1 回で消える。2026-10-18 オーナー)
    const om = topicStep.value.step.omens ?? [];
    s.omens.value = s.omens.value.filter((o) => !om.includes(o));
  }
  else topicUsed.value = true;
});
