<!--
  TreeFractureAsk.vue — フラクチャーの印を付けた時の 2 択 (2026-10-24 夜オーナー「モーダルが出てフラクチャー状態から始めるもしくはフラクチャー前から始める
  (フラクチャー必ず成功で素材、確率 33% 計算で 3 倍とする) 的な説明の元選ばせる」)。選んだ方は start.from (use-tree の setStartFrom)、スタートの箱に出る。
  ツリーの形はどちらも ✦ のレアから (前からは費用だけ: 4 MOD のレアとフラクチャーのオーブを 3 個分、tree-base-cost の four)。Esc・枠の外 = 今のまま閉じる
-->
<script setup lang="ts">
import ModalShell from "../../../components/ui/ModalShell.vue";
import { tr } from "../../../i18n/lang";
import type { StartFrom } from "../../../services/simulator/tree/tree-model";
import { useTree } from "./use-tree";

const emit = defineEmits<{ close: [] }>();
const t = useTree();
const CHOICES: Array<{ k: StartFrom; ja: [string, string]; en: [string, string] }> = [
  { k: "fractured", ja: ["フラクチャー済みから", "✦ が付いたレアを買って始める"], en: ["From a fractured item", "Buy a rare that already has the ✦ mod"] },
  { k: "four", ja: ["フラクチャー前から", "4 MOD のレアにフラクチャー。必ず成功として、素材とオーブは 3 個分 (33%)"], en: ["From before the fracture", "Fracture a 4-mod rare. Counted as a sure success, with materials and orbs ×3 (33%)"] },
];
function pick(k: StartFrom): void { t.setStartFrom(k); emit("close"); }
</script>

<template>
  <ModalShell :open="true" layer="confirm" rec="tree-fracture-ask" :title="tr('フラクチャーの始め方', 'How to start the fracture')" width="w-full max-w-md" body-class="flex flex-col gap-2 px-4 py-3" @close="emit('close')">
    <button v-for="c in CHOICES" :key="c.k" type="button" :data-tree-fracture-from="c.k" class="g-plain flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left hover:bg-white/[0.06]"
      :class="(t.doc.value.start?.from ?? 'fractured') === c.k ? 'border-[var(--exile-color-border-brass)] bg-white/[0.04]' : 'border-white/15'" @click="pick(c.k)">
      <b class="text-[14px]">{{ tr(c.ja[0], c.en[0]) }}</b>
      <span class="text-[12px] opacity-70">{{ tr(c.ja[1], c.en[1]) }}</span>
    </button>
  </ModalShell>
</template>
