/**
 * craft-lesson.ts — チュートリアルのコースを遊んでいる間の決まり (2026-10-17 オーナー)。
 * - 打ったら持った物を離す (「付けたらここでは即消しておk、連打する機会ないから」)
 * - 1 つの手は 1 回だけ。「もう一度」で今の手の始めに戻す (手ごとの始めの状態を控えておく)。
 *   「1 つ前に戻る」は外した (2026-10-17 オーナー「いらんな全てにおいて、もう一度があるんだから」)
 * - ベース・アイテムレベルはコースが決めるので、ベースの帯 (StageSettings) はコースの間は出さない
 * - 最後までやったコースは「クリア」(ブラウザに残す。キーはコースの id だけなので、手や文が変わるアップデートでも消えない。
 *   2026-10-17 オーナー「クリアしたのに…みたいなかんじになるから A 型の細かい連中は」)
 */
import { computed, ref, watch } from "vue";
import { craftStage as s } from "./craft-stage";
import { course, courseView, endCourse } from "./craft-course";
import { endTopic, goTopic, startTopic, topic, topicAt, topicDone, topicSub, topicUsed } from "./craft-topic";
import { fullSockets } from "./stage-steps";
import { topicKey, type TopicCourse } from "../services/craft-stage/topic-courses";
import { freshItem, startFrom } from "../services/craft-stage/run-plan";
import { applyCurrency } from "../services/craft-stage/apply-currency";
import { mulberry32 } from "../services/htc/rng";
import type { StageItem } from "../services/craft-stage/types";
import { isRareChance } from "../utils/format-pct";

export const inLesson = computed(() => !!topic.value || !!course.value);
/** コースを終える (タブを押した時) */
export function endLesson(): void { endTopic(); endCourse(); }
/** コースをやめる: チュートリアルのタブ (コース一覧) に戻る (2026-10-17 オーナー「エミュレーターから開始になってる、タブはチュートリアルから」) */
export function quitLesson(): void { s.hold(null); endLesson(); s.mode.value = "tutorial"; }
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
  // 手が変わったら前の手で掛けたお告げは外す (掛けたまま次へ・一覧から選ぶと残って、反響が無いのに引き直しが出た。2026-10-17 オーナー「冒涜 7 手目で反響使ってないのにリロールできる」)
  s.omens.value = [];
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
  // 手ごとのベース (特殊なエッセンスは部位が決まっている)。違うベースのアイテムなら、打てるかに関係なく用意し直す
  const base = st.base ?? c.base;
  const otherBase = it.base !== base;
  if (s.base.value !== base) s.base.value = base;
  // 付ける手はいつも MOD 0 個のそのレア度から (もうそうなっていれば今のまま)
  if (st.start && !st.prep) {
    if (!otherBase && !st.startMods && it.rarity === st.start && !it.prefixes.length && !it.suffixes.length) return;
    const fresh = st.startMods ? startFrom(d, base, c.itemLevel, { rarity: st.start, mods: st.startMods }, Math.floor(Math.random() * 1e9)) : freshItem(d, base, c.itemLevel, st.start);
    s.item.value = { ...fullSockets(fresh), rollSeed: it.rollSeed };
    prepared.value = true;
    return;
  }
  if (!st.prep) return;
  const key = topicKey(st, d, it);
  if (!otherBase && key && !s.usable(key) && !st.prepAlways) return;
  const g = mulberry32(Math.floor(Math.random() * 1e9));
  // startMods があれば決まった MOD から用意の手を打つ (カタリストは決まった MOD の指輪に火の品質 20%。2026-10-18)
  const from = st.startMods ? startFrom(d, base, c.itemLevel, { rarity: st.start ?? "rare", mods: st.startMods }, Math.floor(Math.random() * 1e9)) : freshItem(d, base, c.itemLevel, st.start);
  let next: StageItem = { ...fullSockets(from), rollSeed: it.rollSeed };
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
  topicSub.value = 0;
  prepared.value = false;
  preparedAt = -1;
  restoring = false;
}


/**
 * 完全の手 (王者・高貴・カオス) は神の演出が出る段 (付いた瞬間の確率が 0.2% 以下) が付くように、次の手の乱数を選んでおく。
 * 裏で試し打ち (quiet: 記録・音なし) → 戻すを繰り返し、当たった乱数を残す。打つのはいつもの処理。
 * 変成・増強の完全はマジックの強い段に 0.2% 以下が無いので選べない (決闘のワンドで一番低いのが 0.415%)。
 * 2026-10-17 オーナー「完全打った時には神の演出入る MOD つけさせてあげるか、せっかくだし」
 */
const RIG = new Set(["regal_perfect", "exalt_perfect", "chaos_perfect"]);
export function rigRare(key: string): void {
  if (!topic.value || !RIG.has(key) || s.usable(key)) return;
  for (let i = 0; i < 1500; i++) {
    const tryRoll = s.rollSeed.value;
    const n = s.log.value.length;
    s.use(key, { quiet: true });
    if (s.log.value.length === n) return;
    const rare = Object.values(s.log.value[s.log.value.length - 1]!.chances ?? {}).some(isRareChance);
    s.undo();
    if (rare) { s.rollSeed.value = tryRoll; return; }
  }
}

/**
 * もう一度: 今の手の始めに戻して、同じ手をもう 1 回 (1 つの手は 1 回だけ打てる。2026-10-17 オーナー「何回も連続で打てちゃうのはだめ、1 回だけ。もう一度ボタンを次への横に」)
 */
export function retryStep(): void {
  s.hold(null);
  const top = snaps[snaps.length - 1];
  if (topic.value && top) restore(top);
}

/**
 * その手から始める (手の一覧を押した時。次へを押した時と同じ: 持っている物を離して、その手が打てるアイテムを用意する)。
 * 2026-10-17 オーナー「入門でコレ知りたいみたいな時もある、クリックできるように。挙動は次へを押した時と同じ」
 */
export function lessonJump(i: number): void {
  if (!topic.value) return;
  s.hold(null);
  goTopic(i);
  prepareStep();
}
/** コース一覧から、そのコースの i 手目から始める */
export function startTopicAt(c: TopicCourse, i: number): void {
  startTopic(c, endCourse);
  lessonJump(i);
}
