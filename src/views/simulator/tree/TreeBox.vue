<!--
  TreeBox.vue — ツリーの箱 1 つ (2026-10-22 表面だけ)。始まり (フラクチャー) / 当たり / 外れ / 外れが消えた / 狙いが消えた。
  当たりは押すと MOD を選ぶ、横の＋で当たりを足す、下の＋で次の手。外れ・消えたの箱は消せない。数字 (通った人数・ここまでの費用) はまだ「—」
-->
<script setup lang="ts">
import { computed } from "vue";
import Icon from "../../../components/ui/Icon.vue";
import { BOX_H, BOX_W, type TreeBox } from "../../../services/simulator/tree/tree-model";
import { tr } from "../../../i18n/lang";
import { jaTypeName } from "../../../i18n/item-names-ja";
import { TREE_BASE, TREE_ILVL, useTree } from "./use-tree";

const props = defineProps<{ box: TreeBox; x: number; y: number; removable: boolean; picking: boolean; selected: boolean; backLabel: string }>();
const emit = defineEmits<{
  drag: [e: PointerEvent]; aim: []; next: []; addHit: []; remove: []; back: []; clearBack: []; done: []; target: [];
}>();
const t = useTree();

const TAG: Record<TreeBox["out"], [string, string, string]> = {
  start: ["始まり", "Start", "bg-sky-500/25 text-sky-100"],
  hit: ["当たり", "Hit", "bg-amber-500/25 text-amber-100"],
  junk: ["外れ", "Miss", "bg-rose-500/25 text-rose-100"],
  junkGone: ["外れが消えた", "Miss removed", "bg-slate-400/25 text-slate-100"],
  lost: ["狙いが消えた", "Target lost", "bg-violet-500/25 text-violet-100"],
};
const tag = computed(() => TAG[props.box.out]);
const frame = computed(() => (props.box.done ? "border-amber-300 shadow-[0_0_14px_rgba(255,200,110,0.45)]"
  : props.box.out === "hit" ? "border-amber-500/60" : props.box.out === "junk" ? "border-rose-500/50" : props.box.out === "start" ? "border-sky-400/60" : "border-white/25"));
const doneText = computed(() => (props.box.done === "main" ? tr("完成 (本命)", "Done (main)") : props.box.done === "compromise" ? tr("完成 (妥協)", "Done (compromise)") : tr("完成にする", "Mark done")));
const free = computed(() => !props.box.hand && !props.box.back && !props.box.done);

function down(e: PointerEvent): void {
  if (props.picking) return;
  if ((e.target as HTMLElement).closest("button")) return;
  emit("drag", e);
}
</script>

<template>
  <div data-tree-box :data-box-id="box.id" class="absolute select-none rounded-lg border-2 bg-[#15120e]/95 px-2 py-1.5 text-[12px]"
    :class="[frame, picking ? 'cursor-pointer ring-2 ring-cyan-400/70 hover:ring-cyan-300' : 'cursor-grab', selected ? 'outline outline-2 outline-offset-2 outline-amber-300/70' : '']"
    :style="{ left: `${x}px`, top: `${y}px`, width: `${BOX_W}px`, height: `${BOX_H}px` }"
    @pointerdown="down" @click="picking && emit('target')">
    <div class="flex items-center gap-1">
      <span class="rounded-sm px-1.5 py-px text-[11px] font-bold" :class="tag[2]">{{ tr(tag[0], tag[1]) }}</span>
      <span v-if="box.done" class="rounded-sm bg-amber-400/30 px-1 text-[10px] font-bold text-amber-100">{{ doneText }}</span>
      <button v-if="removable && !picking" type="button" class="ml-auto opacity-60 hover:opacity-100" :title="tr('この当たりを消す', 'Remove this hit')" @click.stop="emit('remove')"><Icon name="x" class="size-3.5" /></button>
    </div>

    <!-- 中身: 始まり = ベースとフラクチャー / 当たり = 付く MOD -->
    <div class="mt-1 min-w-0">
      <template v-if="box.out === 'start'">
        <p class="truncate font-bold">{{ tr(jaTypeName(TREE_BASE), TREE_BASE) }} <span class="font-normal opacity-70">{{ tr(`レベル ${TREE_ILVL}`, `ilvl ${TREE_ILVL}`) }}</span></p>
        <button type="button" class="block w-full truncate text-left text-[#c8c8ff] hover:underline" :title="t.fractureLabel(t.doc.value.fracture)" @click.stop="!picking && emit('aim')">
          {{ t.doc.value.fracture ? `${tr("フラクチャー", "Fractured")}: ${t.fractureLabel(t.doc.value.fracture)}` : tr("＋ フラクチャーする MOD を選ぶ", "+ Pick the mod to fracture") }}
        </button>
      </template>
      <button v-else-if="box.out === 'hit'" type="button" class="block w-full truncate text-left hover:underline" :class="box.aim ? 'text-[#c8c8ff]' : 'text-amber-300'" :title="t.aimLabel(box.aim)" @click.stop="!picking && emit('aim')">
        {{ box.aim ? t.aimLabel(box.aim) : tr("＋ 付く MOD を選ぶ", "+ Pick the mod") }}
      </button>
      <p v-else class="truncate opacity-60">{{ box.out === "junk" ? tr("当たり以外が付いた", "Anything but a hit") : box.out === "junkGone" ? tr("外れの MOD が消えた", "A miss mod was removed") : tr("狙いの MOD が消えた", "A target mod was removed") }}</p>
    </div>

    <!-- 数字はまだ繋がない (100 人回すのは次の手) -->
    <p class="mt-0.5 text-[11px] tabular-nums opacity-55">{{ tr("通った — 人 · ここまで — 神", "— people · — div so far") }}</p>

    <!-- 下の行: 戻りの矢印・完成 -->
    <div class="absolute inset-x-2 bottom-1 flex items-center gap-1 text-[11px]">
      <template v-if="box.back">
        <span class="min-w-0 flex-1 truncate text-cyan-200">↩ {{ backLabel }}</span>
        <button v-if="!picking" type="button" class="opacity-60 hover:opacity-100" :title="tr('戻りの矢印を外す', 'Remove the return arrow')" @click.stop="emit('clearBack')"><Icon name="x" class="size-3" /></button>
      </template>
      <template v-else-if="!box.hand && box.out !== 'start' && !picking">
        <button v-if="!box.done" type="button" class="rounded border border-cyan-400/40 px-1 text-cyan-200 hover:border-cyan-300" @click.stop="emit('back')">{{ tr("↩ 戻る", "↩ Return") }}</button>
        <button v-if="box.out === 'hit'" type="button" class="rounded border border-amber-400/40 px-1 text-amber-200 hover:border-amber-300" @click.stop="emit('done')">{{ doneText }}</button>
      </template>
    </div>

    <!-- 横の＋ = 当たりを足す (どれか 1 つが叶う) -->
    <button v-if="box.out === 'hit' && !picking" type="button" data-tree-add-hit class="absolute -right-4 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full border-2 border-amber-400/70 bg-[#1d1812] text-amber-200 hover:bg-amber-500/30"
      :title="tr('当たりを横に足す (どれか 1 つが叶えば当たり)', 'Add another hit beside (any one counts)')" @click.stop="emit('addHit')"><Icon name="plus" class="size-4" /></button>
    <!-- 下の＋ = 次に打つ手 -->
    <button v-if="free && !picking" type="button" data-tree-next class="absolute -bottom-4 left-1/2 flex size-7 -translate-x-1/2 items-center justify-center rounded-full border-2 border-amber-400/70 bg-[#1d1812] text-amber-200 hover:bg-amber-500/30"
      :title="tr('次に打つ手を足す', 'Add the next craft')" @click.stop="emit('next')"><Icon name="plus" class="size-4" /></button>
  </div>
</template>
