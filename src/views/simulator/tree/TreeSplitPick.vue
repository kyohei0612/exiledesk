<!--
  TreeSplitPick.vue — ツリーの右の欄: 分かれ目 (打たずに分ける、2026-10-22 オーナー OK) の行。上の行から見て、最初に合った行の下の箱へ進む。
  画面で選べる条件は 3 つ + 最後の「それ以外」(条件は tree-run の split: heldCount・junk)。行ごとに下に箱ができ、その箱に次の手か ↩ (既にある箱へ) を付ける
-->
<script setup lang="ts">
import { computed } from "vue";
import NumStep from "../../../components/NumStep.vue";
import { addSplitRow, clearSplit, removeSplitRow, setSplitWhen, type SplitWhen } from "../../../services/simulator/tree/tree-model";
import { tr } from "../../../i18n/lang";
import { useTree } from "./use-tree";
import { splitWhenText } from "./tree-names";

const props = defineProps<{ boxId: string; /** 重ね窓の中 (題の行は枠の物) */ embedded?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const t = useTree();
const rules = computed(() => t.doc.value.boxes[props.boxId]?.split ?? []);

type Kind = "held" | "none" | "junk";
type Side = "prefix" | "suffix" | "any";
interface Row { kind: Kind | null; n: number; side: Side }
/** 行の条件を画面の形に (画面で作れない組み合わせは kind null = 文だけ出す) */
function rowOf(w: SplitWhen): Row {
  const keys = Object.keys(w);
  if (keys.length === 1 && w.heldCount) return w.heldCount[0] === 0 && w.heldCount[1] === 0 ? { kind: "none", n: 0, side: "suffix" } : { kind: "held", n: w.heldCount[0], side: "suffix" };
  const sides = Object.keys(w.junk ?? {}) as Side[];
  if (keys.length === 1 && sides.length === 1) return { kind: "junk", n: w.junk![sides[0]!]![0], side: sides[0]! };
  return { kind: null, n: 0, side: "suffix" };
}
const whenOf = (r: Row): SplitWhen => (r.kind === "none" ? { heldCount: [0, 0] } : r.kind === "junk" ? { junk: { [r.side]: [Math.max(1, r.n), 99] } } : { heldCount: [Math.max(1, r.n), 99] });
function setRow(i: number, patch: Partial<Row>): void {
  const r = { ...rowOf(rules.value[i]!.when), ...patch };
  if (patch.kind === "junk" && !patch.n) r.n = 2;
  if (patch.kind === "held" && !patch.n) r.n = 2;
  t.edit((d) => setSplitWhen(d, props.boxId, i, whenOf(r)));
}
const addRow = (): void => t.edit((d) => addSplitRow(d, props.boxId, { heldCount: [2, 99] }));
const removeRow = (i: number): void => t.edit((d) => removeSplitRow(d, props.boxId, i));
function stop(): void { t.edit((d) => clearSplit(d, props.boxId)); emit("close"); }
const KINDS: Array<[Kind, string, string]> = [["held", "狙いが n つ以上", "n+ targets"], ["none", "狙いが 1 つも無い", "No targets yet"], ["junk", "外れが n つ以上", "n+ misses"]];
const SIDES: Array<[Side, string, string]> = [["suffix", "サフィ", "Suffix"], ["prefix", "プレ", "Prefix"], ["any", "どちらか", "Any"]];
</script>

<template>
  <div data-tree-split-pick class="flex min-h-0 flex-1 flex-col gap-3 text-[13px]">
    <div v-if="!embedded" class="flex items-center gap-2">
      <b class="flex-1 text-[14px]">◇ {{ tr("分かれ目 (打たずに分ける)", "Split (no craft)") }}</b>
      <button type="button" class="g-btn sm" @click="emit('close')">{{ tr("閉じる", "Close") }}</button>
    </div>
    <p class="text-[11px] opacity-65">{{ tr("上の行から見て、最初に合った行の下の箱へ進む。下の箱に次の手か ↩ (既にある箱へ) を付ける", "Rows are checked from the top; the first match goes to the box below it. Give that box a craft or a ↩ return") }}</p>
    <ol class="flex flex-col gap-1.5">
      <li v-for="(r, i) in rules" :key="r.to ?? i" data-tree-split-row class="flex flex-col gap-1 rounded-md bg-white/[0.04] p-2">
        <template v-if="i < rules.length - 1 && rowOf(r.when).kind">
          <div class="flex items-center gap-1.5">
            <span class="shrink-0 opacity-60">{{ i + 1 }}.</span>
            <select data-tree-split-kind class="h-7 min-w-0 flex-1 rounded-md border border-white/15 bg-black/40 px-1 text-[12px]" :value="rowOf(r.when).kind!" @change="setRow(i, { kind: ($event.target as HTMLSelectElement).value as Kind })">
              <option v-for="k in KINDS" :key="k[0]" :value="k[0]">{{ tr(k[1], k[2]) }}</option>
            </select>
            <button type="button" class="shrink-0 px-1 opacity-60 hover:opacity-100" :title="tr('この行を消す (下の箱も消える)', 'Remove this row (and the box below)')" @click="removeRow(i)">×</button>
          </div>
          <div v-if="rowOf(r.when).kind !== 'none'" class="flex items-center gap-1.5 pl-4">
            <select v-if="rowOf(r.when).kind === 'junk'" data-tree-split-side class="h-7 rounded-md border border-white/15 bg-black/40 px-1 text-[12px]" :value="rowOf(r.when).side" @change="setRow(i, { side: ($event.target as HTMLSelectElement).value as Side })">
              <option v-for="sd in SIDES" :key="sd[0]" :value="sd[0]">{{ tr(sd[1], sd[2]) }}</option>
            </select>
            <span class="text-[12px] opacity-70">n =</span>
            <NumStep data-tree-split-n :model-value="rowOf(r.when).n" integer width="w-16" :placeholder-value="2" @update:model-value="(v) => v != null && v >= 1 && setRow(i, { n: Math.round(v) })" />
          </div>
        </template>
        <span v-else class="text-teal-100">{{ i + 1 }}. {{ splitWhenText(r.when) }}</span>
      </li>
    </ol>
    <button type="button" data-tree-split-add class="g-btn sm self-start" @click="addRow">{{ tr("＋ 行を足す", "+ Add a row") }}</button>
    <button type="button" class="g-btn sm mt-auto self-start" :title="tr('ふつうの箱に戻す (行の箱と、その下も消える)', 'Back to a plain box (row boxes and below are removed)')" @click="stop">{{ tr("分かれ目をやめる", "Remove the split") }}</button>
  </div>
</template>
