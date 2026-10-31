<!--
  DailyPlay.vue — 挑戦のページ (D-30〜D-36)。お題を開いて 1 時間。順番: フラクチャーを選ぶ → シミュの木 → 100 人回す → 提出。
  木は SimTreePage をそのまま中に置き、上の帯だけここの物 (D-31)。外す部品は daily-skin.css が隠す (D-90。シミュ部長の切り出しまでの形、D-41)。
  木はこのブラウザに覚え、開き直すと戻る。時間はこのページを開いている間だけ進む (D-32)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { tr } from "../../i18n/lang";
import { baseArt } from "../../components/art/base-art";
import { craftStage as s } from "../../state/craft-stage";
import { openDailyPage, treeStep } from "../../web/page";
import SimTreePage from "../simulator/tree/SimTreePage.vue";
import { useTree } from "../simulator/tree/use-tree";
import { recipeCardOf } from "../simulator/recipe-card";
import { toRecipeV1 } from "../../services/simulator/tree/tree-recipe-v1";
import type { TreeDoc } from "../../services/simulator/tree/tree-model";
import { fillTopicDoc } from "./daily-aims";
import { aimsOfTopic, getTry, SOLVE_RATE, startTry, submitTry, TIME_LIMIT_MS, updateTry, type DailyAim, type DailyTopic, type DailyTry } from "./daily-api";

const props = defineProps<{ topic: DailyTopic }>();
const t = useTree();
const tryOf = ref<DailyTry | null>(getTry(props.topic.id));
const treeOn = ref(false);
const sent = ref<{ rate: number; cost: number; solved: boolean } | null>(null);
const art = computed(() => baseArt(props.topic.base));

/** 開いている間の時間を足す。寝ていた分は数えない (1 回 2 分まで) */
const used = ref(tryOf.value?.usedMs ?? 0);
let lastTick = Date.now();
const tick = setInterval(() => {
  const n = Date.now(), dt = Math.min(120_000, n - lastTick);
  lastTick = n;
  if (!tryOf.value || over.value) return;
  used.value += dt;
  tryOf.value.usedMs = used.value;
  updateTry(props.topic.id, { usedMs: used.value });
}, 1000);
const left = computed(() => (tryOf.value ? TIME_LIMIT_MS - used.value : TIME_LIMIT_MS));
const over = computed(() => left.value <= 0);
const clock = computed(() => { const s2 = Math.max(0, Math.ceil(left.value / 1000)); const m = Math.floor(s2 / 60); return `${String(m).padStart(2, "0")}:${String(s2 % 60).padStart(2, "0")}`; });
/** 残りの割合 (導火線の長さ、D-60b) */
const fuse = computed(() => Math.max(0, Math.min(1, left.value / TIME_LIMIT_MS)));
const heat = computed(() => (left.value < 60_000 ? "last" : left.value < 600_000 ? "near" : ""));

/** スタートを押してここへ来た時に挑戦が始まる。データが来るまで待つ */
function begin(): void {
  if (tryOf.value) return;
  const d = s.data.value, a = d ? aimsOfTopic(d, props.topic.id) : null;
  if (a?.length) tryOf.value = startTry(props.topic.id, a);
}
watch(() => s.data.value, begin, { immediate: true });

/** 選ぶ前の字。t.aimShort はベースの木で読むのでここでベースを開く */
const aimText = (a: DailyAim): string => t.aimShort({ modId: a.modId, tier: a.tier });
const picking = computed(() => !!tryOf.value && !tryOf.value.fractured);
watch(picking, (p) => { if (p) t.startTreeWith(props.topic.base, props.topic.ilvl); }, { immediate: true });

/** お題の木を開く。覚えた木があればそれを、無ければお題から白紙で */
function openTree(): void {
  const x = tryOf.value;
  if (!x?.fractured) return;
  treeStep.value = "tree";
  const saved = x.tree ? (JSON.parse(x.tree) as TreeDoc) : null;
  if (saved) t.open(saved);
  else { t.startTreeWith(props.topic.base, props.topic.ilvl); t.edit((d) => fillTopicDoc(d, x.aims, x.fractured!)); }
  treeOn.value = true;
}
function pick(modId: string): void {
  updateTry(props.topic.id, { fractured: modId });
  tryOf.value = getTry(props.topic.id);
  openTree();
}
onMounted(() => { if (tryOf.value?.fractured) openTree(); });

// 前提は変えられない (D-34): 完成形・始まりの窓を開かせず、1 つ戻すで白紙へ抜けた時は戻す
watch(() => t.goalPage.value, (p) => { if (treeOn.value && p) t.goalPage.value = 0; });
watch(() => t.startPage.value, (p) => { if (treeOn.value && p) t.startPage.value = false; });
let saveT = 0;
watch(() => t.doc.value, (d) => {
  if (!treeOn.value) return;
  if (d.base !== props.topic.base || !d.memoAims?.length) { openTree(); return; }
  clearTimeout(saveT);
  saveT = window.setTimeout(() => updateTry(props.topic.id, { tree: JSON.stringify(toRecipeV1(d)) }), 500);
});
// 別の場所の木を持ち込まない (D-36): 貼り付けは入力欄の外では届かせない
const noPaste = (e: ClipboardEvent): void => { if (!(e.target as HTMLElement | null)?.closest?.("input, textarea")) e.stopPropagation(); };
window.addEventListener("paste", noPaste, true);
onBeforeUnmount(() => { clearInterval(tick); clearTimeout(saveT); window.removeEventListener("paste", noPaste, true); });

/** 今の木の 100 人の結果 (recipe-card の控え。組み替えると消える) */
const run = computed(() => { if (!treeOn.value) return null; const c = recipeCardOf(t.doc.value); return c.n === 100 && c.p != null && c.c != null ? { rate: c.p, cost: c.c } : null; });
function submit(): void {
  const r = run.value;
  if (!r || over.value) return;
  const a = submitTry(props.topic.id, r.cost, r.rate);
  if (!a.ok) return;
  tryOf.value = getTry(props.topic.id);
  sent.value = { ...r, solved: r.rate >= SOLVE_RATE };
}
const best = computed(() => tryOf.value?.best ?? null);
</script>

<template>
  <div data-daily-play :data-daily-heat="heat || undefined">
    <header class="daily-band">
      <div class="daily-band-topic">
        <img v-if="art" :src="art" alt="" />
        <div class="min-w-0"><p class="name truncate text-[18px] text-[var(--exile-color-text-title)]">{{ tr(topic.baseJa, topic.base) }}</p><button type="button" class="text-[13px] underline opacity-60 hover:opacity-100" data-daily-leave @click="openDailyPage({ view: 'list' })">{{ tr("一覧へ (時間は止まる)", "To the list (pauses the clock)") }}</button></div>
      </div>
      <div class="daily-time" data-daily-time><b>{{ clock }}</b></div>
      <div class="daily-band-score">
        <div><b data-daily-cost>{{ run ? `${run.cost} ${tr("神", "div")}` : "—" }}</b><small>{{ tr("1 個の費用", "Cost per item") }}</small></div>
        <div><b data-daily-rate>{{ run ? `${run.rate}%` : "—" }}</b><small>{{ tr(`完成率 (${SOLVE_RATE}% で解決)`, `Finished (${SOLVE_RATE}% solves)`) }}</small></div>
        <button type="button" class="g-btn-red" data-daily-submit :disabled="!run || over" :title="over ? tr('時間切れ', 'Time is up') : !run ? tr('100 人回すと提出できる', 'Run 100 crafters to submit') : ''" @click="submit">{{ tr("提出する", "Submit") }}</button>
      </div>
      <div class="daily-fuse" :style="{ '--fuse': fuse }"><i /></div>
    </header>

    <p v-if="over" data-daily-over class="daily-note">{{ tr("時間切れ。木は見られるが、提出はできない。", "Time is up. You can still view the tree, but not submit.") }}</p>
    <p v-else-if="sent" data-daily-sent class="daily-note">
      {{ sent.solved ? tr(`提出した: ${sent.cost} 神 (完成率 ${sent.rate}%)。解決。時間内ならもっと安くできる。`, `Submitted: ${sent.cost} div (${sent.rate}% finished). Solved. You can still go cheaper in time.`) : tr(`提出した: 完成率 ${sent.rate}% で未解決。${SOLVE_RATE}% まで上げる。`, `Submitted: ${sent.rate}% finished, unsolved. Reach ${SOLVE_RATE}%.`) }}
      <span v-if="best">{{ tr(`今の記録 ${best.cost} 神`, `Best ${best.cost} div`) }}</span>
    </p>

    <section v-if="picking" data-daily-frac class="daily-frac">
      <h2 class="g-brush daily-hero-title">{{ tr("どの MOD をフラクチャーして始めるか", "Choose the mod to fracture") }}</h2>
      <p class="mb-3 text-[14px] opacity-70">{{ tr("フラクチャー済みのレアから始める。ここまでの費用は数えない。", "You start from a fractured rare. This part costs nothing.") }}</p>
      <ul>
        <li v-for="a in tryOf!.aims" :key="a.modId"><button type="button" class="daily-frac-row" data-daily-frac-pick :data-mod="a.modId" @click="pick(a.modId)">{{ aimText(a) }}<small>{{ tr(`T${a.tier} 以上`, `T${a.tier}+`) }}</small></button></li>
      </ul>
    </section>
    <SimTreePage v-else-if="treeOn" />
    <p v-else class="daily-note">{{ tr("読み込み中", "Loading") }}</p>
  </div>
</template>
