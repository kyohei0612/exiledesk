/**
 * craft-lesson.ts — チュートリアルのコースを遊んでいる間の決まり (2026-10-17 オーナー)。
 * - 打ったら持った物を離す (「付けたらここでは即消しておk、連打する機会ないから」)
 * - 「1 つ前に戻る」(「1 手戻すとかチュートリアルの仕様になってない」「MOD 一覧の横に 1 つ前に戻るボタン」):
 *   動作を学ぶコースは手ごとの始めの状態を控えておき、手の番号ごと戻す (白に戻す手も戻せる)。
 *   クラフトのコースは進み具合をアイテムから数えるので、いつもの 1 手戻す
 * - ベース・アイテムレベルはコースが決めるので、ベースの帯 (StageSettings) はコースの間は出さない
 * - 最後までやったコースは「クリア」(ブラウザに残す。キーはコースの id だけなので、手や文が変わるアップデートでも消えない。
 *   2026-10-17 オーナー「クリアしたのに…みたいなかんじになるから A 型の細かい連中は」)
 */
import { computed, ref, watch } from "vue";
import { craftStage as s } from "./craft-stage";
import { course, courseView, endCourse } from "./craft-course";
import { endTopic, topic, topicAt, topicDone, topicUsed } from "./craft-topic";
import { fullSockets } from "./stage-steps";
import { topicKey } from "../services/craft-stage/topic-courses";
import { freshItem, startFrom } from "../services/craft-stage/run-plan";
import { applyCurrency } from "../services/craft-stage/apply-currency";
import { mulberry32 } from "../services/htc/rng";
import type { StageItem } from "../services/craft-stage/types";

export const inLesson = computed(() => !!topic.value || !!course.value);
/** コースを終える (タブを押した時) */
export function endLesson(): void { endTopic(); endCourse(); }
/** 動作を学ぶコースの間はカレンシーの棚を出さない (使う物は今の手の枠から持つ。実践のコースは棚を出す。2026-10-17 オーナー「チュートリアルではカレンシーは表示しないでおk、実践くらいじゃね」) */
export const inTopic = computed(() => !!topic.value);

// ── クリア (topic:<id> / course:<id>) ─────────────────────────
const CLEAR_KEY = "exiledesk.tutorialCleared.v1";
function loadCleared(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLEAR_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export const cleared = ref<Set<string>>(new Set(loadCleared()));
function markCleared(id: string): void {
  if (cleared.value.has(id)) return;
  cleared.value = new Set([...cleared.value, id]);
  try { localStorage.setItem(CLEAR_KEY, JSON.stringify([...cleared.value])); } catch { /* 残せない環境では今回だけ */ }
}
watch(topicDone, (d) => { if (d && topic.value) markCleared(`topic:${topic.value.id}`); });
watch(() => courseView.value?.done, (d) => { if (d && course.value) markCleared(`course:${course.value.id}`); });

watch(() => s.log.value.length, (n, old) => { if (inLesson.value && n > (old ?? 0)) s.hold(null); });

/** 動作を学ぶコースの手ごとの始めの状態 (最後 = 今の手の始め) */
interface Snap { at: number; item: typeof s.item.value; log: typeof s.log.value; startMods: typeof s.startMods.value; omens: string[] }
const snaps: Snap[] = [];
const now = (): Snap => ({ at: topicAt.value, item: s.item.value, log: s.log.value, startMods: s.startMods.value, omens: [...s.omens.value] });
// 手の番号が変わったら (打って次へ・白に戻す・一覧から選ぶ・始め)、その手の始めとして控える。戻した時は控えない
let restoring = false;
watch([topic, topicAt], ([t], [oldT]) => {
  if (!t) { snaps.length = 0; prepared.value = false; return; }
  if (t !== oldT) snaps.length = 0;
  else if (restoring) return;
  prepared.value = false;
  preparedAt = -1;
  snaps.push(now());
}, { flush: "sync" });

/**
 * 今の手が今のアイテムに打てない時は、白から prep の手を打って打てる状態を作る (工程には積まない。前の手で起きたことは残す)。
 * 2026-10-17 オーナー「わざわざ白に戻すようなボタン不要、つどつどリセット掛けておk。レア以上のチュートリアルは今の手が打てる手に再現してあげる」
 */
export const prepared = ref(false);
/** 用意した手の番号 (1 つの手で 1 回だけ。持ち直しても振り直さない) */
let preparedAt = -1;
/**
 * 今の手の枠で持った時に呼ぶ (手が進んだ時ではない: 打った結果をアイテムに残して見せるため。
 * 2026-10-17 オーナー「高貴打ったら MOD がでない」= 打った直後に次の手の用意で MOD 0 個に戻っていた)
 */
export function prepareStep(): void {
  if (preparedAt === topicAt.value) return;
  preparedAt = topicAt.value;
  const c = topic.value, d = s.data.value, it = s.item.value, st = c?.steps[topicAt.value];
  if (!c || !d || !it || !st) return;
  // 付ける手はいつも MOD 0 個のそのレア度から (もうそうなっていれば今のまま)
  if (st.start && !st.prep) {
    if (!st.startMods && it.rarity === st.start && !it.prefixes.length && !it.suffixes.length) return;
    const fresh = st.startMods ? startFrom(d, c.base, c.itemLevel, { rarity: st.start, mods: st.startMods }, Math.floor(Math.random() * 1e9)) : freshItem(d, c.base, c.itemLevel, st.start);
    s.item.value = { ...fullSockets(fresh), rollSeed: it.rollSeed };
    prepared.value = true;
    return;
  }
  if (!st.prep) return;
  const key = topicKey(st, d, it);
  if (key && !s.usable(key) && !st.prepAlways) return;
  const g = mulberry32(Math.floor(Math.random() * 1e9));
  let next: StageItem = { ...fullSockets(freshItem(d, c.base, c.itemLevel, st.start)), rollSeed: it.rollSeed };
  for (const k of st.prep) { const r = applyCurrency(d, next, k, g, []); if (r.applied) next = { ...r.item, rollSeed: it.rollSeed }; }
  s.item.value = next;
  prepared.value = true;
}

function restore(x: Snap): void {
  restoring = true;
  s.item.value = x.item;
  s.log.value = x.log;
  s.startMods.value = x.startMods;
  s.omens.value = [...x.omens];
  topicAt.value = x.at;
  topicUsed.value = false;
  prepared.value = false;
  restoring = false;
}

/** 戻れるか */
export const canLessonBack = computed(() => (topic.value ? topicAt.value > 0 || s.log.value.length > 0 : s.log.value.length > 0));

/** 1 つ前に戻る。今の手の途中で別の手を打っていたら、先に今の手の始めへ */
export function lessonBack(): void {
  s.hold(null);
  if (!topic.value) { if (s.log.value.length) s.undo(); return; }
  const top = snaps[snaps.length - 1];
  if (top && (top.log !== s.log.value || top.item !== s.item.value)) { restore(top); return; }
  if (snaps.length < 2) return;
  snaps.pop();
  restore(snaps[snaps.length - 1]!);
}
