<!--
  TreeCanvas.vue — 木の枠の中の描き面 (Vue Flow と箱・線・打つ手の札・合流の線・回した層・＋の線・段の札)。SimTreePage から切り出した (11-14、S-09c)。
  面ごとの作り (視点・畳み・並べ・段ごとの出し・線・合流・帯・＋) は use-tree-surface.ts、手と窓は置き場 (SimTreePage) の物を page で受け取る。
  スイッチ tabKeep の中はタブごとに 1 枚 (置き場が v-show で並べる)、外は 1 枚
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { VueFlow } from "@vue-flow/core";
import Icon from "../../../components/ui/Icon.vue";
import TreeBox from "./TreeBox.vue";
import TreeStripFold from "./TreeStripFold.vue";
import TreeHandChip from "./TreeHandChip.vue";
import TreeMergeLayer from "./TreeMergeLayer.vue";
import TreeRunLayer from "./TreeRunLayer.vue";
import TreeLaneTags from "./TreeLaneTags.vue";
import { LINE } from "./use-tree-edges";
import { laneBandW } from "./tree-lane-band";
import { BOX_H, BOX_W, type TreeBox as Box, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { tr } from "../../../i18n/lang";
import { flag } from "../../../web/release-flags";
import { useTreeSurface, type PageCtx } from "./use-tree-surface";
import { spotArc, spotCss, type SpotArc } from "./tree-spot-arc";

type Lane = { text: string };
type ChipEdge = { chip?: unknown };
const props = defineProps<{ tabKey: number; page: PageCtx }>();
const root = ref<HTMLElement | null>(null);
// 置き場の手と窓 (全部の面で同じ物) と、この面の作り (テンプレートは切り出す前と同じ名前で使う。ref は上の段なので自動で外れる)
const { t, hand, panel, jt, glowOf, tr100, issueOf, startDrag, onAim, removeHandOf, clearBack, onDone, onFail, openIssues, goBack, startLink, goIssue, onPaneClick, onNodeClick } = props.page;
const { flowId, pageZ, grid, lanes, v, sf, doc, plus, backLabel, viewOnly, zoom, inv, bd, onPlus, hoverBox, shownEdges, edgeHot, rv, posOf, chipRoom, passes, merged, linesAll, shown, plusLine } = useTreeSurface(props.tabKey, props.page, root);
/** (S-142j ③、スイッチ hitsSide) 乗せている手の札 (その手の ↩ の畳みの戻り先へ青い線を出す) */
const hoverChip = ref<string | null>(null);
/**
 * (S-142j ③、スイッチ linkChipHover) 同じ枠へ・同じ中身の箱の続きへの緑の線と ↩ の青い線は描かず、手の札に乗せた時だけ、ほかを暗くして札から行き先の箱へ弧の矢印を流し、
 * 行き先の箱を照らす (緑 = 同じ枠・青 = ↩)。11-14 オーナー「これも青と同じくホバー時に出るよーにしようか」「弧を描いた矢印でアニメーションつけてここにいくよーみたいな感じで」
 */
type LinkTo = { link?: boolean };
const hideLink = (o: LinkTo): boolean => !!o.link && flag("linkChipHover");
type SpotEdge = { id: string; jx: number; jy: number; to: Array<{ id: string; link?: boolean }>; backLines?: Array<{ id: string }> };
const spot = computed((): { arcs: SpotArc[]; css: string } | null => {
  const id = hoverChip.value, e = id && flag("linkChipHover") ? (shownEdges.value as SpotEdge[]).find((x) => x.id === id) : null;
  if (!e) return null;
  const ts = [...e.to.filter((o) => o.link).map((o) => ({ id: o.id, back: false })), ...(e.backLines ?? []).map((l) => ({ id: l.id, back: true }))].filter((x) => doc.value.boxes[x.id]);
  if (!ts.length) return null;
  // 何本も出る時は、札の出口を行き先の左右の順に 16 ずつ並べる (交わらない。11-14 オーナー「戻るの線クロスなってるやん」)
  const order = ts.map((x) => posOf(doc.value.boxes[x.id]!).x).map((x, i) => [x, i] as const).sort((a, z) => a[0] - z[0]).map(([, i]) => i);
  const arcs = ts.map((x, i) => ({ ...x, d: spotArc(e.jx + (order.indexOf(i) - (ts.length - 1) / 2) * 16, e.jy, posOf(doc.value.boxes[x.id]!), v.flow.findNode(x.id)?.dimensions.height || BOX_H) }));
  return { arcs, css: spotCss(e.id, e.id, arcs) };
});
const backLinesOf =(id: string | null): Array<{ id: string; d: string }> => (id ? (shownEdges.value.find((e: { id: string }) => e.id === id) as { backLines?: Array<{ id: string; d: string }> } | undefined)?.backLines ?? [] : []);
</script>

<template>
  <!-- 面の外枠 (段の札と描き面。置き場の v-show はこの外の枠に掛ける)。段の札の列は木の面 (点々の地) の左端に重ねる (11-11 オーナー、前は置き場) -->
  <div ref="root" data-tree-surface class="contents">
  <TreeLaneTags v-if="!t.needBase.value" inside :style="{ zoom: 1 / pageZ }" :lanes="lanes" :ty="v.flow.viewport.value.y" :k="v.flow.viewport.value.zoom" />
  <component :is="'style'" v-if="spot">{{ spot.css }}</component>
  <div data-tree-canvas data-overflow-ok :data-spot="spot ? hoverChip : undefined" class="absolute inset-0" :class="hand ? 'cursor-grab' : ''" :style="{ zoom: 1 / pageZ, ...grid, ...(flag('laneEdge') && !t.needBase.value ? { clipPath: `inset(0 0 0 ${laneBandW(lanes.map((l: Lane) => l.text), v.flow.viewport.value.zoom)}px)` } : {}) }" @wheel="v.onWheel">
    <VueFlow :id="flowId" :default-viewport="{ x: 0, y: 0, zoom: pageZ }" :min-zoom="v.minZoom.value" :max-zoom="v.maxZoom.value"
      :nodes-draggable="false" :nodes-connectable="false" :elements-selectable="false"
      :pan-on-drag="true" :pan-on-scroll="false" :zoom-on-scroll="false" :zoom-activation-key-code="null" :zoom-on-double-click="false" :zoom-on-pinch="false"
      :delete-key-code="null" :selection-key-code="null" :multi-selection-key-code="null" :auto-pan-on-node-drag="true"
      @pane-click="onPaneClick" @node-click="onNodeClick">
      <template #node-box="{ id }">
        <TreeStripFold v-if="sf.folds.value.has(id)" :head="id" v-bind="sf.countsOf(id)" />
        <TreeBox v-else-if="doc.boxes[id]" :box="doc.boxes[id]!" :removable="!!doc.boxes[id]?.parent"                :selected="panel?.id === id || plus?.target === id" :back-label="backLabel(doc.boxes[id]!)" :view-only="viewOnly || hand || jt.grayOf(doc.boxes[id]!) || jt.dimOf(doc.boxes[id]!)" :gray="jt.grayOf(doc.boxes[id]!) || jt.dimOf(doc.boxes[id]!)" :guide="jt.targetOf(doc.boxes[id]!)" :settled="jt.settledOf(doc.boxes[id]!)" :glow="glowOf(doc.boxes[id]!) || plus?.target === id" :plus-far="viewOnly && !hand && !jt.grayOf(doc.boxes[id]!) && !jt.dimOf(doc.boxes[id]!) ? 1 / zoom : undefined" :swamp="tr100.shown.value && tr100.result.value?.loopAt?.[id] ? Math.max(1, 1 / zoom) : 0" :issue="jt.idealGrayOf(doc.boxes[id]!) ? null : issueOf(doc.boxes[id]!)" :inv="inv" :bands="bd.bandsFor(id)" @quit="bd.onQuit(id)" :band-on="viewOnly && !hand && !jt.grayOf(doc.boxes[id]!) && !jt.dimOf(doc.boxes[id]!)" @band="(x, e) => (viewOnly ? (panel = { kind: 'hand', id: x }) : bd.onBand(x, e))"                @drag="startDrag(doc.boxes[id]!, $event)" @aim="onAim(doc.boxes[id]!)" @plus="(k, e) => onPlus(doc.boxes[id]!, k, e)" @remove="removeHandOf(id)"
          @clear-back="t.edit((d: TreeDoc) => clearBack(d, id))" @done="onDone(doc.boxes[id]!)" @fail="onFail(doc.boxes[id]!)"
          @note="panel = { kind: 'note', id }" @base="t.goalPage.value = 1" @issue="openIssues" @back-go="goBack(doc.boxes[id]!)" @checked="t.edit((d: TreeDoc) => { delete d.boxes[id]!.check; })" @hover="(on) => (hoverBox = on ? id : hoverBox === id ? null : hoverBox)" />
      </template>
      <!-- Vue Flow の倍率と移動が掛かる層: 線は箱の後ろ (z-index -1)、打つ手の札・引っ張る線・戻りの弧は箱の前 -->
      <template #zoom-pane>
        <svg data-tree-lines class="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" style="z-index: -1">
          <!-- 札 → 下の箱は矢印なしで箱の上の縁までまっすぐ (箱 → 札の線と同じ形、10-25 オーナー「ここと同じにしようか」) -->
          <g v-for="e in shownEdges" :key="e.id" data-tree-edge :data-edge-id="e.id" :data-hot="edgeHot(e) || undefined" :opacity="hoverBox && !edgeHot(e) ? 0.3 : 1" :filter="edgeHot(e) ? 'drop-shadow(0 0 4px rgba(243,194,107,0.9))' : undefined">
            <path :d="e.stem" :stroke="e.stemColor" :stroke-width="edgeHot(e) ? 3.5 : 2" fill="none" />
            <path v-for="o in e.to.filter((x: LinkTo) => !hideLink(x))" :key="o.id" :data-tree-link-line="o.link || undefined" :d="o.d" :stroke="o.color" :stroke-width="edgeHot(e) && (edgeHot(e) === 'parent' || o.id === hoverBox) ? 3.5 : o.w ?? 2" stroke-linejoin="round" fill="none" />
          </g>
          <!-- ↩ の畳みの戻り先への青い線は、手の札に乗せた時だけ (S-142j ③、11-14 オーナー「戻る時は手の札からカーソルホバーで青で表示したら？」) -->
          <path v-for="l in flag('linkChipHover') ? [] : backLinesOf(hoverChip)" :key="`back-${l.id}`" data-tree-back-line :data-back-to="l.id" :d="l.d" :stroke="LINE.back" stroke-width="3" stroke-linejoin="round" fill="none" filter="drop-shadow(0 0 4px rgba(95,208,224,0.8))" />
        </svg>
        <!-- (スイッチ linkChipHover) 乗せた手の札から行き先の箱への弧の矢印 (流れる点線。札の後ろ・箱の前) -->
        <svg v-if="spot" data-tree-spot class="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" style="z-index: 4">
          <defs>
            <marker id="tree-spot-green" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#6fd08c" /></marker>
            <marker id="tree-spot-blue" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" :fill="LINE.back" /></marker>
          </defs>
          <path v-for="a in spot.arcs" :key="a.id" data-tree-spot-arc :data-spot-to="a.id" :data-spot-back="a.back || undefined" class="tree-spot-flow" :d="a.d" :stroke="a.back ? LINE.back : '#6fd08c'" stroke-width="4" stroke-linecap="round" fill="none"
            :marker-end="a.back ? 'url(#tree-spot-blue)' : 'url(#tree-spot-green)'" :style="{ filter: a.back ? 'drop-shadow(0 0 6px rgba(95,208,224,0.9))' : 'drop-shadow(0 0 6px rgba(111,208,140,0.9))' }" />
        </svg>
        <!-- 矢印の上の札 = 打つ手 (押すと替える・消す)。戻りの矢印だけの箱から流れ込む線 -->
        <!-- 段の目印 (木の左の外、当たりの箱の揃った狙いの数) -->
        <TreeStripFold v-for="f in rv.done.value ? sf.opens.value : []" :key="`refold-${f.head}`" :head="f.head" :fold="{ ...posOf(doc.boxes[f.head]!), inv }" @toggle="sf.toggle(f.head)" />
        <TreeHandChip v-for="e in shownEdges.filter((x: ChipEdge) => x.chip)" :key="`hand-${e.id}`" :id="e.id" :hand="e.hand" :split="e.split" :x="e.jx" :y="e.jy" :inv="inv" :off="hand" :room="chipRoom.get(e.id) ?? 340" :lane="e.lane" :links="flag('linkChipHover') && hoverChip === e.id ? e.links : 0" :backs="flag('linkChipHover') && hoverChip === e.id ? e.backs : 0" @mouseenter="hoverChip = e.id" @mouseleave="hoverChip = hoverChip === e.id ? null : hoverChip" @open="panel = { kind: e.hand ? 'hand' : 'split', id: e.id }" />
        <!-- 品質だけ上げた後 (箱無し) で次の手がまだ無い所の＋ (押すと次の手の棚) -->
        <button v-for="b in rv.done.value ? passes.filter((x: Box) => !x.hand && !x.back) : []" :key="`pass-${b.id}`" type="button" data-tree-pass-next :data-box-id="b.id" class="nodrag nopan pointer-events-auto absolute z-[5] flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-amber-400/70 bg-[#1d1812] text-amber-200 hover:bg-amber-500/30"
          :class="viewOnly || hand ? '!pointer-events-none opacity-60' : ''" :style="{ left: `${posOf(b).x + BOX_W / 2}px`, top: `${posOf(b).y}px`, scale: String(inv) }" :title="tr('次に打つ手を足す', 'Add the next craft')" @click="startLink(b)"><Icon name="plus" class="size-4" /></button>
        <TreeMergeLayer v-if="merged && rv.done.value" :lines="merged.lines" :paths="merged.paths" :hover="hoverBox" :sel="panel?.id ?? null" :show-all="linesAll" @hover="(id) => (hoverBox = id)" />
        <TreeRunLayer v-if="(tr100.result.value || tr100.walk.value) && tr100.shown.value && rv.done.value" :result="tr100.result.value" :walk="tr100.walk.value" :k="1 / zoom" :boxes="shown" :pos-of="posOf" :edges="shownEdges" :lines="merged?.lines ?? []" :paths="merged?.paths ?? new Map()" :height-of="(id: string) => v.flow.findNode(id)?.dimensions.height ?? 0" @go="goIssue" />
        <!-- 引っ張っている＋の線と、戻り先の札に乗せた時の線は箱の前 (相手の箱の上まで見える) -->
        <svg v-if="plusLine" class="pointer-events-none absolute left-0 top-0 z-10 overflow-visible" width="1" height="1">
          <defs><marker id="tree-arrow-drag" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" :fill="LINE.back" /></marker></defs>
          <path v-if="plusLine" data-tree-plus-line :d="plusLine" :stroke="LINE.back" stroke-width="3" stroke-linecap="round" fill="none" marker-end="url(#tree-arrow-drag)" />
        </svg>
      </template>
    </VueFlow>
  </div>
  </div>
</template>

<style scoped>
/* (スイッチ linkChipHover) 弧の矢印は札から行き先へ点線が流れる。動きを減らす設定では止める */
.tree-spot-flow { stroke-dasharray: 14 10; animation: tree-spot-flow 0.9s linear infinite; }
@keyframes tree-spot-flow { to { stroke-dashoffset: -24; } }
@media (prefers-reduced-motion: reduce) { .tree-spot-flow { animation: none; } }
</style>
