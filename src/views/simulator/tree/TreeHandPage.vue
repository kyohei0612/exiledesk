<!--
  TreeHandPage.vue — 次に打つ手の重ね窓 (2026-10-22 オーナー「手を置く所は今の箱の時点のアイテムに付けるイメージ」、前は右の欄)。
  枠は ModalShell、中身は TreeHandShelf (上にその箱の時点のアイテムのカード、下に棚。持ってカードを押すとその手)
-->
<script setup lang="ts">
import ModalShell from "../../../components/ui/ModalShell.vue";
import type { Aim, Hand, HandKind } from "../../../services/simulator/tree/tree-model";
import type { OnlyOut } from "./tree-hand-plan";
import { tr } from "../../../i18n/lang";
import TreeHandShelf from "./TreeHandShelf.vue";
import { computed, ref } from "vue";
import { useTree } from "./use-tree";
import { canHoldMore, holdsAt } from "../../../services/simulator/tree/tree-foresee";

const props = defineProps<{ boxId: string; current: Hand | null }>();
const t = useTree();
/** 予見のハズレ箱 (どれも出なかった) では、次の手を 打つ (リセット) か 持つ (もう 1 つ予見で見る) か選ぶ (S-39 ⑧、スイッチ heldMulti) */
const more = computed(() => canHoldMore(t.doc.value, props.boxId));
const asHeld = ref(!!props.current?.held);
/** 予見の枠の箱では手は「持つ」(S-39、11-05 オーナー「ヒネコラ後は打つじゃなくて持つになる」) */
const hold = computed(() => (more.value ? asHeld.value : holdsAt(t.doc.value, props.boxId)));
const title = computed(() => (hold.value ? (props.current ? tr("持つ手を替える (予見)", "Change the held craft (foresight)") : tr("次に持つ手 (予見で結果が見える)", "Next craft to hold (result is foreseen)")) : props.current ? tr("打つ手を替える", "Change the craft") : tr("次に打つ手", "Next craft")));
const emit = defineEmits<{ pick: [hand: Hand, kind: HandKind, aims: Aim[], preCatalyst: string | null, only: OnlyOut]; clear: []; close: []; aim: [] }>();
/** 持つ / 打つ の選びを手に写す (持つ = held の印。打つは印を外す) */
function pick(hand: Hand, kind: HandKind, aims: Aim[], pre: string | null, only: OnlyOut): void {
  const { held: _h, ...rest } = hand;
  emit("pick", more.value && asHeld.value ? { ...rest, held: true } : rest, kind, aims, pre, only);
}
</script>

<template>
  <ModalShell :open="true" rec="tree-hand" :title="title" :close-title="tr('ツリーへ戻る (Esc / 枠の外を押す)', 'Back to the tree (Esc / click outside)')" width="w-[94%] max-w-[1500px] max-[48rem]:w-full min-[48rem]:h-[88%]" full-on-phone body-class="px-3 pb-3" @close="emit('close')">
    <div v-if="more" class="mb-2 flex flex-wrap items-center gap-2 text-[13px]" data-tree-held-more>
      <span class="text-[var(--c-muted,#a99)]">{{ tr("どれも出なかった時:", "When none hit:") }}</span>
      <button type="button" class="rounded border px-3 py-1" :class="!asHeld ? 'border-amber-400 bg-amber-400/15 text-amber-200' : 'border-white/15 text-white/70'" :aria-pressed="!asHeld" @click="asHeld = false">{{ (!asHeld ? "● " : "") + tr("打つ (リセットなど)", "Use (reset etc.)") }}</button>
      <button type="button" class="rounded border px-3 py-1" :class="asHeld ? 'border-violet-400 bg-violet-400/15 text-violet-200' : 'border-white/15 text-white/70'" :aria-pressed="asHeld" @click="asHeld = true">{{ (asHeld ? "● " : "") + tr("持つ (もう 1 つ予見で見る)", "Hold (foresee one more)") }}</button>
      <span v-if="asHeld" class="text-[12px] text-violet-200/80">{{ tr("前の持つ手でどれも出なかった人が、この手の予見を見て、狙いが出たら打つ", "Players with no hit from the earlier held crafts foresee this one and use it on a hit") }}</span>
    </div>
    <TreeHandShelf :box-id="boxId" :current="current" @pick="pick" @clear="emit('clear')" @close="emit('close')" @aim="emit('aim')" />
  </ModalShell>
</template>
