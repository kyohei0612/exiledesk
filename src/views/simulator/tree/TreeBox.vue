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

const props = defineProps<{ box: TreeBox; x: number; y: number; removable: boolean; picking: boolean; selected: boolean; backLabel: string; /** 縮めて見ている時: 押せる物を出さず、押すとそこへ寄る */ viewOnly?: boolean; /** 上の札の一覧で選んだ札を使っている */ glow?: boolean; /** ルート精査で見つかった穴 (文) */ issue?: string | null;
  /** 縮めた時の倍率の逆数 (押せる物だけこれで大きさを戻し、画面の上で 24px 以上を保つ。オーナー 10-22「縮めても押せる物は小さくならない」) */ inv?: number }>();
const emit = defineEmits<{
  drag: [e: PointerEvent]; aim: []; remove: []; back: []; clearBack: []; done: []; target: []; focus: []; note: []; spam: [];
  /** 戻り先の札に乗せた / 外した・押した */
  backHover: [on: boolean]; backGo: [];
  /** ＋を押した (押すだけ = 足す、長押しで引っ張る = 箱の上で離すとつなぐ。決めるのはページ) */
  plus: [kind: "side" | "next", e: PointerEvent];
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
/** 押せる物を隠す時 (戻り先を選んでいる・一望) */
const quiet = computed(() => props.picking || !!props.viewOnly);
const k = computed(() => Math.max(1, props.inv ?? 1));
/** 押せる物を倍率の逆数で戻す (origin = 大きくする軸。まとまりごとに端を軸にして、隣と重ならないように) */
const keep = (origin: string): Record<string, string> => (k.value > 1 ? { scale: String(k.value), transformOrigin: origin } : {});

function down(e: PointerEvent): void {
  if (quiet.value) return;
  if ((e.target as HTMLElement).closest("button")) return;
  emit("drag", e);
}
</script>


<template>
  <!-- 押せる物は全部 24px 以上 (2026-10-22 押しにくい所の洗い出し、notes/2026-10-22-tree-ui-click-audit.md) -->
  <div data-tree-box :data-box-id="box.id" class="absolute select-none rounded-lg border-2 bg-[#15120e]/95 px-2 py-1 text-[12px]"
    :class="[frame, picking || viewOnly ? 'cursor-pointer' : 'cursor-grab', picking ? 'ring-2 ring-cyan-400/70 hover:ring-cyan-300' : '', selected ? 'outline outline-2 outline-offset-2 outline-amber-300/70' : '', glow ? 'ring-4 ring-amber-300/80 shadow-[0_0_18px_rgba(255,200,110,0.6)]' : '', issue ? '!border-rose-500 shadow-[0_0_16px_rgba(244,63,94,0.55)]' : '']"
    :style="{ left: `${x}px`, top: `${y}px`, width: `${BOX_W}px`, height: `${BOX_H}px` }"
    @pointerdown="down" @click="picking ? emit('target') : viewOnly && emit('focus')">
    <!-- 縮めている時 (k > 1) は押せる物の行を倍率分高くし、まだ「—」だけの数字の行は隠す (箱が小さくても押せる物どうしが重ならない) -->
    <div class="flex items-center gap-1" :style="{ height: `${24 * k}px` }">
      <span class="rounded-sm px-1.5 py-px text-[11px] font-bold" :class="tag[2]">{{ tr(tag[0], tag[1]) }}</span>
      <span v-if="box.done" class="rounded-sm bg-amber-400/30 px-1 text-[10px] font-bold text-amber-100">{{ doneText }}</span>
      <span v-if="issue" data-tree-issue class="rounded-sm bg-rose-600 px-1.5 text-[11px] font-bold text-white" :title="issue">!</span>
      <span class="flex-1" />
      <span class="flex items-center" :style="keep('right center')">
      <button v-if="box.note && !quiet" type="button" data-tree-note-mark class="flex size-6 items-center justify-center rounded text-amber-300 hover:bg-white/10" :title="box.note" @click.stop="emit('note')"><Icon name="pencil" class="size-3.5" /></button>
      <button v-if="removable && !quiet" type="button" class="-mr-1 flex size-6 items-center justify-center rounded opacity-60 hover:bg-white/10 hover:opacity-100" :title="tr('この当たりを消す', 'Remove this hit')" @click.stop="emit('remove')"><Icon name="x" class="size-3.5" /></button>
      </span>
    </div>

    <!-- 中身: 始まり = ベースとフラクチャー / 当たり = 付く MOD (右の＋に掛からない幅) -->
    <div class="min-w-0">
      <template v-if="box.out === 'start'">
        <p class="truncate font-bold leading-5">{{ tr(jaTypeName(TREE_BASE), TREE_BASE) }} <span class="font-normal opacity-70">{{ tr(`レベル ${TREE_ILVL}`, `ilvl ${TREE_ILVL}`) }}</span></p>
        <button type="button" class="block w-full truncate text-left text-[#c8c8ff] hover:underline" :class="quiet ? 'pointer-events-none' : ''" :style="{ height: `${24 * k}px`, lineHeight: `${24 * k}px` }" :title="t.fractureLabel(t.doc.value.fracture)" @click.stop="!quiet && emit('aim')">
          {{ t.doc.value.fracture ? `${tr("フラクチャー", "Fractured")}: ${t.fractureLabel(t.doc.value.fracture)}` : tr("＋ フラクチャーする MOD を選ぶ", "+ Pick the mod to fracture") }}
        </button>
      </template>
      <button v-else-if="box.out === 'hit'" type="button" class="block w-[calc(100%-14px)] truncate text-left hover:underline" :style="{ height: `${24 * k}px`, lineHeight: `${24 * k}px` }" :class="[box.aim ? 'text-[#c8c8ff]' : 'text-amber-300', quiet ? 'pointer-events-none' : '']" :title="t.aimLabel(box.aim)" @click.stop="!quiet && emit('aim')">
        {{ box.aim ? t.aimLabel(box.aim) : tr("＋ 付く MOD を選ぶ", "+ Pick the mod") }}
      </button>
      <p v-else class="truncate leading-6 opacity-60">{{ box.out === "junk" ? tr("当たり以外が付いた", "Anything but a hit") : box.out === "junkGone" ? tr("外れの MOD が消えた", "A miss mod was removed") : tr("狙いの MOD が消えた", "A target mod was removed") }}</p>
    </div>

    <!-- 数字はまだ繋がない (100 人回すのは次の手) -->
    <p v-if="k === 1" class="text-[11px] tabular-nums opacity-55">{{ tr("通った — 人 · ここまで — 神", "— people · — div so far") }}</p>

    <!-- 下の行: 戻りの矢印・完成 (下の＋は箱の外なので重ならない) -->
    <div class="pointer-events-none absolute inset-x-2 bottom-1 flex h-6 items-center gap-1 text-[11px] *:pointer-events-auto" :style="k > 1 ? { right: 'auto', width: `${(BOX_W - 16 - (box.out === 'hit' ? 22 : 0)) / k}px`, ...keep('left bottom') } : {}">
      <template v-if="box.back">
        <!-- 戻り先の札: 乗せると戻りの線が出て戻り先が光る、押すとそこへ寄る (線は既定で引かない、10-22) -->
        <button type="button" data-tree-back-tag class="flex h-6 min-w-0 flex-1 items-center truncate rounded px-1 text-left text-cyan-200 hover:bg-cyan-400/15" :title="tr(`戻り先: ${backLabel} (押すとそこへ寄る)`, `Returns to: ${backLabel} (click to go there)`)"
          @pointerenter="emit('backHover', true)" @pointerleave="emit('backHover', false)" @focus="emit('backHover', true)" @blur="emit('backHover', false)" @click.stop="!quiet && emit('backGo')">↩ {{ backLabel }}</button>
        <button v-if="!quiet" type="button" class="-mr-1 flex size-6 items-center justify-center rounded opacity-60 hover:bg-white/10 hover:opacity-100" :title="tr('戻りの矢印を外す', 'Remove the return arrow')" @click.stop="emit('clearBack')"><Icon name="x" class="size-3" /></button>
      </template>
      <template v-else-if="!box.hand && box.out !== 'start' && !quiet">
        <button v-if="!box.done" type="button" class="h-6 shrink-0 whitespace-nowrap rounded border border-cyan-400/40 px-1.5 text-cyan-200 hover:border-cyan-300" :class="k > 1 ? 'min-w-6' : ''" :title="tr('↩ 戻る (既にある箱を指す)', '↩ Return (point to an existing box)')" @click.stop="emit('back')">{{ k > 1 ? "↩" : tr("↩ 戻る", "↩ Return") }}</button>
        <button v-if="box.out === 'hit'" type="button" class="h-6 shrink-0 whitespace-nowrap rounded border border-amber-400/40 px-1.5 text-amber-200 hover:border-amber-300" @click.stop="emit('done')" :title="doneText">{{ k > 1 && !box.done ? tr("完成", "Done") : doneText }}</button>
        <!-- 外れ・狙いが消えたの行き先に一番使う手 (オーナー 10-22): 当たりのどれかが付くまでカオス -->
        <button v-if="box.out === 'junk' || box.out === 'lost'" type="button" data-tree-spam class="h-6 shrink-0 whitespace-nowrap rounded border border-amber-400/40 px-1.5 text-amber-200 hover:border-amber-300" :title="tr('狙いのどれかが付くまでカオスを打ち続ける。付いたらその当たりの枝へ', 'Keep using Chaos Orbs until any target hits, then follow that hit')" @click.stop="emit('spam')">{{ tr("カオススパム", "Chaos spam") }}</button>
      </template>
    </div>

    <!-- 横の＋ = 当たりを足す (どれか 1 つが叶う) -->
    <button v-if="box.out === 'hit' && !quiet" type="button" data-tree-add-hit :style="k > 1 ? { ...keep('center'), top: 'calc(50% + 4px)' } : {}" class="absolute -right-4 top-1/2 flex size-7 -translate-y-1/2 touch-none items-center justify-center rounded-full border-2 border-amber-400/70 bg-[#1d1812] text-amber-200 hover:bg-amber-500/30"
      :title="tr('当たりを横に足す (どれか 1 つが叶えば当たり)。長押しで引っ張り箱の上で離すとその箱へつなぐ', 'Add another hit beside (any one counts). Hold and drag onto a box to link')" @pointerdown.stop="emit('plus', 'side', $event)"><Icon name="plus" class="size-4" /></button>
    <!-- 下の＋ = 次に打つ手 (箱の下の外。完成・戻るのボタンと重ならない) -->
    <button v-if="free && !quiet" type="button" data-tree-next :style="keep('center')" class="absolute -bottom-[34px] left-1/2 flex size-7 -translate-x-1/2 touch-none items-center justify-center rounded-full border-2 border-amber-400/70 bg-[#1d1812] text-amber-200 hover:bg-amber-500/30"
      :title="tr('次に打つ手を足す。長押しで引っ張り箱の上で離すとその箱へ戻る', 'Add the next craft. Hold and drag onto a box to return there')" @pointerdown.stop="emit('plus', 'next', $event)"><Icon name="plus" class="size-4" /></button>
  </div>
</template>
