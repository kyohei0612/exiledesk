/**
 * craft-course.ts — いま遊んでいるクラフトのコース (2026-10-17、[[craft-courses.ts]])。
 * 始めは動画と同じ状態 (買ったベース) をエミュレーターの始めの MOD として置く。打つのはいつものエミュレーター (作り方は自由)。
 * 付ける順番のどこまで済んだか・今やる手 (今の状況に当たるレシピの手) を出す
 */
import { computed, ref, watch } from "vue";
import { craftStage as s } from "./craft-stage";
import { fullSockets } from "./stage-steps";
import { buyStart } from "../services/craft-stage/quiz-recipe";
import { startFrom } from "../services/craft-stage/run-plan";
import { mulberry32 } from "../services/htc/rng";
import { courseMove, courseSlots, courseState, type CraftCourse } from "../services/craft-stage/craft-courses";
import type { Force } from "../services/craft-stage/stage-core";
import { endTopic } from "./craft-topic";

export const course = ref<CraftCourse | null>(null);
/** 使ったベースの数 (次のベースを買って作り直した回数 + 1) */
export const courseBases = ref(1);

/** 始めの状態を置く (動画と同じ: 買ったベースはその MOD を始めの MOD に、白はソケットとルーンだけ) */
function placeStart(c: CraftCourse): void {
  const d = s.data.value;
  if (!d) return;
  s.stashEmu(); // エミュレーターの状態を取っておく (チュートリアルを抜けたら戻す)
  s.reset();
  const st = c.recipe.start;
  const extra = { ...("sockets" in st && st.sockets ? { sockets: st.sockets } : {}), ...("runes" in st && st.runes?.length ? { runes: st.runes } : {}) };
  let mods: Force[] = [];
  if (st.kind === "bought") {
    const it = buyStart(d, c.recipe, mulberry32(s.seed.value));
    mods = [...it.prefixes, ...it.suffixes].map((m) => ({ mod: m.modId, ...(m.tierName ? { tier: m.tierName } : {}), ...(m.fractured ? { fractured: true } : {}) }));
  }
  if (!mods.length && !Object.keys(extra).length) return;
  s.startMods.value = mods;
  const rarity = st.kind === "bought" && st.rarity ? { rarity: st.rarity } : {};
  s.item.value = { ...fullSockets(startFrom(d, c.recipe.base, c.recipe.itemLevel, { mods, ...extra, ...rarity }, s.seed.value - 1)), rollSeed: s.seed.value - 1 };
}

/** コースを始める: ベースとアイテムレベルを決めて、動画と同じ始めの状態から */
export function startCourse(c: CraftCourse): void {
  endTopic();
  course.value = c;
  courseBases.value = 1;
  s.base.value = c.recipe.base;
  s.itemLevel.value = c.recipe.itemLevel;
  s.mode.value = "hand";
  placeStart(c);
}
/** 次のベースを買って作り直す (レシピの「買い直す」) */
export function restartCourse(): void {
  const c = course.value;
  if (!c) return;
  courseBases.value++;
  placeStart(c);
}
export function endCourse(): void { course.value = null; }
// ほかのベースにしたらコースは終わり
watch(() => s.base.value, (b) => { if (course.value && b !== course.value.recipe.base) course.value = null; });

/** 付ける順番 (札ごとに済んだか・今の段) と、今やる手 */
export const courseView = computed(() => {
  const c = course.value, it = s.item.value;
  if (!c || !it) return null;
  const st = courseState(c, it);
  const slots = courseSlots(c).map((sl) => ({ sl, done: (st[sl.id] ?? 0) >= (sl.kind === "fractured" ? 3 : 2) }));
  const cur = slots.findIndex((x) => !x.done);
  const done = cur < 0;
  return { slots: slots.map((x, i) => ({ ...x, current: i === cur })), done, move: done ? null : courseMove(c, it) };
});
