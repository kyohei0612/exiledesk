<script setup lang="ts">
/**
 * TreeVeilCheck.vue — 骨 (冒涜) の手の窓の「発現させる」☑ (10-27 夜オーナー、スイッチ boneLater)。既定は無し = 未発現のまま次へ (結果は「未発現の冒涜が付いた」)。
 * 高貴・カオスの窓と同じ並び (狙う MOD の ☑ = 完成の狙い → これ → 狙い無し、10-28 オーナー「誰がそこに表示しろって」)。
 * 発現させるがオンの時は「ほかの MOD を選ぶ」: 完成形に無い MOD (置き石) を、いつもの MOD 一覧 (TreeModPick) の窓で発現で出うる MOD から選ぶ。選んだ物は ☑ の一覧に足す (add)。PC・スマホで同じ部品
 */
import { computed, ref } from "vue";
import TreeModPick from "./TreeModPick.vue";
import { revealAimsOf } from "./tree-reveal-aims";
import { useTree } from "./use-tree";
import { craftStage as s } from "../../../state/craft-stage";
import type { Aim, Hand } from "../../../services/simulator/tree/tree-model";
import type { StageItem } from "../../../services/craft-stage/engine";
import { tr } from "../../../i18n/lang";

/** noCheck = 後から打つ発現の手 (発現させるの ☑ は出さず「ほかの MOD を選ぶ」だけ) */
const props = defineProps<{ modelValue: boolean; big?: boolean; noCheck?: boolean; boxId: string; item: StageItem | null; hand: Hand | null }>();
const emit = defineEmits<{ "update:modelValue": [boolean]; add: [Aim] }>();
const t = useTree();
const picking = ref(false);
/** 発現で出うる MOD (完成の狙いは窓の ☑ にもうあるので、モーダルは全部から選ぶ) */
const allow = computed(() => { const d = s.data.value; return picking.value && d && props.item && props.hand ? revealAimsOf(d, t.doc.value, props.boxId, props.item, { ...props.hand, veil: "pick" }).map((a) => a.modId) : []; });
function pick(a: Aim): void { picking.value = false; emit("add", a); }
</script>

<template>
  <!-- 並びと形は隣の狙いの行と同じ (PC は min-h-7 gap-2、スマホは枠付きの min-h-11 gap-3) -->
  <label v-if="!noCheck" data-tree-hand-veil class="flex cursor-pointer items-center" :class="big ? 'min-h-11 gap-3 rounded-lg border border-white/10 bg-black/20 px-3' : 'min-h-7 gap-2'">
    <input type="checkbox" class="shrink-0" :class="big ? 'size-5' : ''" :checked="modelValue" @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)" />
    <span class="min-w-0 break-words">{{ tr("発現させる (無しなら未発現のまま次へ)", "Reveal it now (off = leave it unrevealed)") }}</span>
  </label>
  <button v-if="modelValue" type="button" data-tree-hand-veil-more class="g-btn sm self-start" :class="big ? '!min-h-11' : ''" @click="picking = true">{{ tr("ほかの MOD を選ぶ (完成形に無い MOD)", "Pick another mod (not in the final item)") }}</button>
  <div v-if="picking" data-tree-hand-veil-pick class="fixed inset-0 z-[340] flex items-center justify-center bg-black/60 p-3" @click.self="picking = false">
    <div class="g-panel flex max-h-[85vh] w-full max-w-[520px] min-w-0 flex-col p-3">
      <TreeModPick class="min-h-0 flex-1" mode="hit" :current="null" :allow="allow" :title="tr('発現で選ぶ MOD (完成形に無い物も)', 'Mod to pick when revealing (including ones not in the final item)')" autofocus @pick="pick" @close="picking = false" />
    </div>
  </div>
</template>
