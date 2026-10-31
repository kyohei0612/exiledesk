<!--
  PhoneViewRoute.vue — シミュのスマホの既定の画面 = 完成までの道を縦に並べる (S-94h、スイッチ phoneView)。「箱 → 手 → 箱」を上から下へ、枝は見出しを付けて全部を順に。
  箱と手の札は PC の実物の部品 (押せない)。どの箱を出すかは view-route.ts。戻るだけの枝は「詳細」の全体図 (PhoneViewMap)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { BOX_W } from "../../../services/simulator/tree/tree-model";
import { shapeSampleOf } from "../../../services/simulator/tree/tree-sample-shape";
import type { TreeRunResult } from "../../../services/simulator/tree/tree-run";
import TreeBox from "../tree/TreeBox.vue";
import TreeHandChip from "../tree/TreeHandChip.vue";
import { backLabelOf, runText, stepOf } from "../tree/tree-fail";
import { headOf } from "../tree/tree-names";
import { useTree } from "../tree/use-tree";
import { craftStage as s } from "../../../state/craft-stage";
import { tr } from "../../../i18n/lang";
import { qualityLines, routeSteps } from "./view-route";

const props = defineProps<{ /** 回した結果 (箱に人数を添える) */ result?: TreeRunResult | null }>();
const t = useTree();
const doc = t.doc;
const steps = computed(() => routeSteps(doc.value));
/** 箱の上の 1 行: 品質と回した人数 */
function above(id: string): string {
  const d = s.data.value;
  return [...qualityLines(d ? shapeSampleOf(d, doc.value, id) : null), runText(props.result, id)].filter(Boolean).join(" · ");
}
const title = (id: string): string => headOf(doc.value.boxes[id]!, t.aimShort);
/** 箱の幅 316px が入らない画面だけ倍率で縮める (文は切らない、S-92 の例外) */
const fit = (): number => Math.min(1, (window.innerWidth - 32) / BOX_W);
const zoom = ref(fit());
const onResize = (): void => { zoom.value = fit(); };
onMounted(() => window.addEventListener("resize", onResize));
onBeforeUnmount(() => window.removeEventListener("resize", onResize));
</script>

<template>
  <p v-if="!steps" data-phone-view-noroute class="rounded-md border border-amber-300/30 px-3 py-2 text-center text-[13px] text-amber-100">{{ tr("足りない所があるので回せない。PC で直す", "Can't run: this tree has gaps. Fix it on a PC") }}</p>
  <div v-else data-phone-view-route class="mx-auto flex flex-col pt-3" :style="{ width: `${BOX_W}px`, zoom }">
    <template v-for="(st, i) in steps" :key="`${st.kind}-${st.id}-${i}`">
      <template v-if="st.kind === 'box'">
        <p v-if="above(st.id)" data-map-run class="pb-3 text-center text-[13px] font-bold text-amber-100">{{ above(st.id) }}</p>
        <TreeBox class="pointer-events-none" :box="doc.boxes[st.id]!" :removable="false" :picking="false" :selected="false" :back-label="backLabelOf(doc, doc.boxes[st.id]!)" view-only />
      </template>
      <!-- 手: 線の上に PC と同じ札。戻るだけの枝がある手には印だけ -->
      <div v-else-if="st.kind === 'hand'" data-phone-view-hand class="relative h-[84px]">
        <span class="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-[#a39a88]/70" />
        <TreeHandChip :id="st.id" :hand="doc.boxes[st.id]!.hand" :split="doc.boxes[st.id]!.split?.length" :x="BOX_W / 2" :y="34" :inv="1" off :room="BOX_W" />
        <span v-if="st.miss" data-phone-view-miss class="absolute bottom-3 right-0 rounded-sm bg-rose-900/70 px-1 text-[11px] text-rose-100">{{ tr("外れあり", "Can miss") }}</span>
      </div>
      <!-- 枝の見出し: どの結果の道か (枝は切り替えず全部並べる) -->
      <p v-else-if="st.kind === 'branch'" data-phone-view-branch class="mb-3 mt-4 rounded-md border border-amber-300/40 bg-amber-300/10 px-2 py-1 text-[13px] font-bold text-amber-100">{{ tr(`枝 ${st.no}`, `Branch ${st.no}`) }} · {{ title(st.id) }}</p>
      <!-- もう出した箱へ合流 (同じ箱を 2 度出さない) -->
      <p v-else data-phone-view-join class="my-2 rounded-md border border-cyan-300/30 px-2 py-1.5 text-center text-[12px] text-cyan-100">{{ tr(`↪ ${stepOf(doc, st.id)} 段目「${title(st.id)}」と同じ道へ`, `↪ Joins step ${stepOf(doc, st.id)} "${title(st.id)}"`) }}</p>
    </template>
    <p data-phone-view-route-note class="py-3 text-center text-[12px] text-sim-dim">{{ tr("外れた時の道は詳細で", "Miss paths are in Details") }}</p>
  </div>
</template>
