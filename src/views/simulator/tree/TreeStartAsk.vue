<!--
  TreeStartAsk.vue — ② 完成の MOD から ③ ツリーへ行く時の「フラクチャーから始めるか、白ベースから始めるか」(10-26 夜オーナー「ツリーへ行くボタンを押した時に、
  『フラクチャーから始めるか、白ベースから始めるか』を選ぶポップアップを出して、そこで決める形に統一」)。どの入口 (普通・貼り付け・エミュから) でも同じ。
  フラクチャーから = 完成の狙いから 1 つ選び、その MOD が ✦ のレアから (start.from fractured)。白ベースから = フラクチャーの印を全部外す (白 = ノーマル)。
  前に選んでいた方 (印のある狙い) に既定の印。Esc・枠の外・× = 何も変えず ② に残る。前の「印を付けた時の 2 択」(TreeFractureAsk) はこれにまとめた
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import ModalShell from "../../../components/ui/ModalShell.vue";
import { tr } from "../../../i18n/lang";
import { aimKey, migrateStart, startRarity, type Aim } from "../../../services/simulator/tree/tree-model";
import { useTree } from "./use-tree";

const emit = defineEmits<{ done: []; close: [] }>();
const t = useTree();
/** 今の選び (印のある狙いの 1 つ目。無ければ白) */
const pick = ref<string | null>((() => { const m = t.goals.value.find((a) => a.fractured); return m ? aimKey(m) : null; })());
const goals = computed(() => t.goals.value);
/** 決める: 選んだ狙いだけに印 (ほかの印は外す)、白なら印を全部外す。1 回の編集 (1 つ戻すで戻せる) */
function decide(): void {
  const k = pick.value;
  t.edit((d) => {
    const list: Aim[] = d.memoAims ?? [];
    for (const a of list) { if (k && aimKey(a) === k) a.fractured = true; else delete a.fractured; }
    d.memoAims = list;
    migrateStart(d);
    if (k) d.start!.from = "fractured";
    d.start!.mods = d.start!.mods.filter((m) => !list.some((a) => a.fractured && a.modId === m.modId));
    d.start!.rarity = startRarity(d);
  });
  emit("done");
}
</script>

<template>
  <ModalShell :open="true" layer="confirm" rec="tree-start-ask" :title="tr('どこから始める?', 'Where to start?')" width="w-full max-w-xl" body-class="px-4 py-3" @close="emit('close')">
    <div data-tree-start-ask class="flex flex-col gap-3 text-[13px]">
      <!-- フラクチャーから: 完成の狙いから 1 つ -->
      <section class="g-item flex flex-col gap-2 bg-black/50 px-3 py-2.5">
        <b class="text-[15px] text-[var(--exile-color-text-title)]">{{ tr("フラクチャーから", "From a fractured mod") }}</b>
        <p class="text-[12px] opacity-70">{{ tr("選んだ MOD が ✦ (フラクチャー) で付いたレアから始める", "Start from a rare with the picked mod fractured (✦)") }}</p>
        <label v-for="a in goals" :key="aimKey(a)" data-tree-start-ask-mod class="flex min-w-0 cursor-pointer items-start gap-2 rounded px-1.5 py-1 hover:bg-white/[0.06]" :class="pick === aimKey(a) ? 'bg-[rgba(163,52,42,0.35)]' : ''">
          <input v-model="pick" type="radio" name="tree-start-ask" :value="aimKey(a)" class="mt-1 shrink-0" />
          <span class="min-w-0 break-words" :class="pick === aimKey(a) ? 'text-mod-fractured' : 'text-[#c8c8ff]'">{{ pick === aimKey(a) ? "✦ " : "" }}{{ t.aimLabel(a) }}</span>
        </label>
      </section>
      <!-- 白ベースから -->
      <label data-tree-start-ask-white class="g-item flex cursor-pointer items-start gap-2 bg-black/50 px-3 py-2.5 hover:bg-white/[0.06]" :class="pick === null ? 'bg-[rgba(163,52,42,0.35)]' : ''">
        <input v-model="pick" type="radio" name="tree-start-ask" :value="null" class="mt-1.5 shrink-0" />
        <span class="flex min-w-0 flex-col gap-1">
          <b class="text-[15px] text-[var(--exile-color-text-title)]">{{ tr("白ベースから", "From a white base") }}</b>
          <span class="text-[12px] opacity-70">{{ tr("フラクチャー無しの白 (ノーマル) のベースから始める", "Start from a white (normal) base without a fracture") }}</span>
        </span>
      </label>
      <div class="flex justify-end gap-2">
        <button type="button" class="g-btn sm" @click="emit('close')">{{ tr("やめる", "Cancel") }}</button>
        <button type="button" data-tree-start-ask-go class="g-btn-red min-h-10 px-4" @click="decide">{{ tr("これで始める (ツリーへ)", "Start (to the tree)") }}</button>
      </div>
    </div>
  </ModalShell>
</template>
