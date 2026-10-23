<!--
  TreeNote.vue — ツリーの右の欄: 箱ごとの短いメモ (2026-10-22 オーナー「軽いメモ」)。箱の小さな印から開く・試し打ちの欄の「メモ」から書く。
  欄を離れた時・閉じる時に保存 (1 つ戻すが 1 文字ずつにならないよう)。空にすると消える
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { setNote } from "../../../services/simulator/tree/tree-model";
import { useTree } from "./use-tree";
import { tr } from "../../../i18n/lang";

const props = defineProps<{ boxId: string; /** 重ね窓の中 (題の行は枠の物) */ embedded?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const t = useTree();
const text = ref(t.doc.value.boxes[props.boxId]?.note ?? "");
function save(): void { if ((t.doc.value.boxes[props.boxId]?.note ?? "") !== text.value) t.edit((d) => setNote(d, props.boxId, text.value)); }
onBeforeUnmount(save);
/** 開いたらすぐ打てるよう文字欄に的を入れる (重ね窓の枠が先に自分に的を取るので一拍おく。前は打った字がどこにも入らなかった、10-23 モンキー 8) */
const area = ref<HTMLTextAreaElement | null>(null);
onMounted(() => setTimeout(() => area.value?.focus(), 0));
</script>

<template>
  <div data-tree-note class="flex flex-col gap-2 text-[13px]">
    <div v-if="!embedded" class="flex items-center gap-2">
      <b class="flex-1 text-[14px]">{{ tr("この箱のメモ", "Note for this box") }}</b>
      <button type="button" class="g-btn sm" @click="save(); emit('close')">{{ tr("閉じる", "Close") }}</button>
    </div>
    <textarea ref="area" v-model="text" data-tree-note-text rows="5" class="w-full rounded-md border border-white/15 bg-black/40 px-2 py-1 outline-none focus:border-amber-400/60" :placeholder="tr('例: ここで外れたら作り直す方が安い', 'e.g. Rebuilding is cheaper if this misses')" @blur="save" />
    <button v-if="text" type="button" class="g-btn sm self-start" @click="text = ''; save()">{{ tr("メモを消す", "Delete note") }}</button>
  </div>
</template>
