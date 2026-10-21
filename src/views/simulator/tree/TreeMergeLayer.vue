<!--
  TreeMergeLayer.vue — まとめて見せる箱の札と、札から行き先へ流れ込む線 (tree-merge.ts。Vue Flow の zoom-pane の中)。
  札 = 戻りの矢印だけの箱 (結果の名前だけ。押すとその箱の編集のポップアップ)。線: 当たりの札 = 進む色 (行き先が 1 か所ならいつも出す)。
  外れ・消えたの札 = 戻りの色で、既定は線無し (乗せた箱・札の線だけ濃く出す、帯の「線を全部表示」で全部。オーナー 10-22 の案 A)
  結果の見せ方の案 (tree-merge.ts の RES): &res=a = 札を箱と同じ印・色の 2 行に / &res=b = 札にせず箱 (線は箱の下から、札は描かない)
-->
<script setup lang="ts">
import { computed } from "vue";
import { PILL_H, PILL_W, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import Icon from "../../../components/ui/Icon.vue";
import { RES, sizeOf, type MergeLine } from "./tree-merge";
import { useTree } from "./use-tree";
import { OUT_LOOK, outName } from "./tree-names";
import { tr } from "../../../i18n/lang";

const props = defineProps<{ doc: TreeDoc; pills: readonly string[]; lines: readonly MergeLine[]; paths: ReadonlyMap<string, string>; hover: string | null; showAll: boolean; inv: number; off: boolean }>();
const emit = defineEmits<{ open: [id: string]; hover: [id: string | null] }>();
const t = useTree();
const COLOR = { fwd: "#a39a88", back: "#5fd0e0" } as const;
/** 札の色 (箱と同じ、tree-names.ts の OUT_LOOK) */
const rgb = (id: string): string => OUT_LOOK[props.doc.boxes[id]!.out].c;
const pillSet = computed(() => new Set(props.pills));
const size = (id: string): { w: number; h: number } => sizeOf(pillSet.value, id);

/** 乗せた箱・札に関わる線 (札そのもの・行き先・札の親) */
const hot = (l: MergeLine): boolean => !!props.hover && (l.pill === props.hover || l.to === props.hover || l.parent === props.hover);
/** 行き先が 1 か所に決まる当たりの札 (2 つ目の当たり → 同じ形の箱) の線はいつも出す。行き先が分かれる物 (狙いが消えた後の取り直し) は乗せた時・全部表示の時 */
const single = computed(() => { const n = new Map<string, number>(); for (const l of props.lines) n.set(l.pill, (n.get(l.pill) ?? 0) + 1); return n; });
const shown = computed(() => props.lines.filter((l) => (l.kind === "fwd" && single.value.get(l.pill) === 1) || props.showAll || hot(l)));
const opacity = (l: MergeLine): number => (hot(l) ? 1 : l.kind === "fwd" ? 0.85 : 0.55);
const label = (id: string): string => { const b = props.doc.boxes[id]!; return b.out === "hit" && b.aim ? t.aimLabel(b.aim) : outName(b.out); };
/** 行き先の名前 (乗せた時の説明) */
const dest = (id: string): string => props.lines.filter((l) => l.pill === id).map((l) => (l.to === "start" ? tr("始めに戻る", "Back to start") : label(l.to))).join(" / ");
</script>

<template>
  <svg data-tree-merge-lines class="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" style="z-index: -1">
    <defs>
      <marker v-for="(c, k) in COLOR" :id="`tree-merge-${k}`" :key="k" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" :fill="c" /></marker>
    </defs>
    <path v-for="l in shown.filter((x) => !hot(x))" :key="l.id" data-tree-merge-line :data-kind="l.kind" :d="paths.get(l.id)" :stroke="COLOR[l.kind]" :stroke-opacity="opacity(l)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" :marker-end="`url(#tree-merge-${l.kind})`" />
  </svg>
  <!-- 乗せた物の線は箱の前に濃く -->
  <svg v-if="hover" class="pointer-events-none absolute left-0 top-0 z-10 overflow-visible" width="1" height="1">
    <path v-for="l in shown.filter(hot)" :key="l.id" data-tree-merge-hot :d="paths.get(l.id)" :stroke="COLOR[l.kind]" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none" :marker-end="`url(#tree-merge-${l.kind})`" />
  </svg>
  <!-- &res=a: 箱と同じ印・色・地の 2 行 (1 行目 = 印 + 結果の名前、2 行目 = 当たりは付く MOD、ほかは行き先) -->
  <button v-for="id in RES === 'a' ? pills : []" :key="id" type="button" data-tree-pill :data-box-id="id" class="nodrag nopan pointer-events-auto absolute z-[4] flex flex-col justify-center rounded-lg border-[1.5px] bg-gradient-to-b from-[#1d1812] to-[#110e0a] px-1.5 text-left text-[12px] hover:from-[#2a2117]"
    :class="off ? '!pointer-events-none' : ''" :style="{ left: `${doc.boxes[id]!.x}px`, top: `${doc.boxes[id]!.y}px`, width: `${PILL_W}px`, height: `${size(id).h}px`, borderColor: `rgba(${rgb(id)},0.55)`, boxShadow: `0 0 0 1px rgba(${rgb(id)},0.18), 0 0 12px rgba(${rgb(id)},0.16)`, scale: String(inv), transformOrigin: 'center top' }"
    :title="tr(`${label(id)} → ${dest(id)} (このアイテムで続ける箱。押すと編集)`, `${label(id)} → ${dest(id)} (the box this item continues from. Click to edit)`)"
    @pointerenter="emit('hover', id)" @pointerleave="emit('hover', null)" @click.stop="emit('open', id)">
    <span class="flex h-5 min-w-0 items-center gap-1">
      <span class="flex size-4 shrink-0 items-center justify-center rounded" :style="{ background: `rgba(${rgb(id)},0.18)`, color: `rgb(${rgb(id)})` }"><Icon :name="OUT_LOOK[doc.boxes[id]!.out].icon" class="size-3" /></span>
      <span class="truncate text-[11px] font-bold tracking-wide" :style="{ color: `rgb(${rgb(id)})` }">{{ outName(doc.boxes[id]!.out) }}</span>
    </span>
    <span class="block h-5 truncate leading-5" :class="doc.boxes[id]!.out === 'hit' ? 'text-[#c8c8ff]' : 'text-cyan-200'">{{ doc.boxes[id]!.out === "hit" ? label(id) : `↩ ${dest(id)}` }}</span>
  </button>
  <button v-for="id in RES === 'a' ? [] : pills" :key="id" type="button" data-tree-pill :data-box-id="id" class="nodrag nopan pointer-events-auto absolute z-[4] flex items-center gap-1 truncate rounded-full border-[1.5px] bg-[#16120d] px-2.5 text-left text-[12px] font-semibold hover:bg-[#241c12]"
    :class="off ? '!pointer-events-none' : ''" :style="{ left: `${doc.boxes[id]!.x}px`, top: `${doc.boxes[id]!.y}px`, width: `${PILL_W}px`, height: `${PILL_H}px`, borderColor: `rgba(${rgb(id)},0.7)`, color: `rgb(${rgb(id)})`, scale: String(inv), transformOrigin: 'center top' }"
    :title="tr(`${label(id)} → ${dest(id)} (このアイテムで続ける箱。押すと編集)`, `${label(id)} → ${dest(id)} (the box this item continues from. Click to edit)`)"
    @pointerenter="emit('hover', id)" @pointerleave="emit('hover', null)" @click.stop="emit('open', id)">
    <span aria-hidden="true" class="shrink-0 opacity-80">{{ doc.boxes[id]!.out === "hit" ? "→" : "↩" }}</span><span class="min-w-0 truncate">{{ label(id) }}</span>
  </button>
</template>
