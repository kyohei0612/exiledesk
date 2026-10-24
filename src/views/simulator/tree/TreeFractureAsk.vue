<!--
  TreeFractureAsk.vue — フラクチャーの印を付けた時の 2 択 (2026-10-24 夜オーナー「モーダルが出てフラクチャー状態から始めるもしくはフラクチャー前から始める
  (フラクチャー必ず成功で素材、確率 33% 計算で 3 倍とする) 的な説明の元選ばせる」「まとめて UI 分かりやすく表示して」「後者選んだ場合必ず白からはじまる」)。
  2 枚のカードを横に並べ、同じ並びの行 (始まり・フラクチャーの費用) で見比べる。枠はアイテムの額 (g-item、ゲームの絵)。
  選んだ方は start.from (use-tree の setStartFrom)、スタートの箱に出る。① = フラクチャーの MOD が 1 つ付いたレアから、② = 白 (ノーマル) から木の中でフラクチャー
  (外れ込みの ×3 は tree-run の FRACTURE_MISS)。Esc・枠の外 = 今のまま閉じる
-->
<script setup lang="ts">
import ModalShell from "../../../components/ui/ModalShell.vue";
import { tr } from "../../../i18n/lang";
import type { StartFrom } from "../../../services/simulator/tree/tree-model";
import { useTree } from "./use-tree";

const emit = defineEmits<{ close: [] }>();
const t = useTree();
type Pair = [string, string];
const ROWS: Pair[] = [["始まり", "Start"], ["フラクチャーの費用", "Fracture cost"]];
const CARDS: Array<{ k: StartFrom; title: Pair; cells: Pair[] }> = [
  { k: "fractured", title: ["フラクチャー済みから", "From fractured"], cells: [["フラクチャーの MOD 1 つが付いたレア", "A rare with 1 fractured mod"], ["無し", "None"]] },
  { k: "four", title: ["フラクチャー前から", "Before the fracture"], cells: [["白 (ノーマル) のベース", "A white (normal) base"], ["必ず成功、素材 ×3 (33%)", "Sure success, materials ×3 (33%)"]] },
];
const on = (k: StartFrom): boolean => (t.doc.value.start?.from ?? "fractured") === k;
function pick(k: StartFrom): void { t.setStartFrom(k); emit("close"); }
</script>

<template>
  <ModalShell :open="true" layer="confirm" rec="tree-fracture-ask" :title="tr('フラクチャーの始め方', 'How to start the fracture')" width="w-full max-w-2xl" body-class="px-4 py-3" @close="emit('close')">
    <div class="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
      <button v-for="c in CARDS" :key="c.k" type="button" :data-tree-fracture-from="c.k" class="g-plain g-item flex flex-col gap-2 px-3 py-2.5 text-left transition"
        :class="on(c.k) ? 'bg-[rgba(163,52,42,0.35)]' : 'bg-black/50 hover:bg-white/[0.06]'" @click="pick(c.k)">
        <b class="text-[15px] text-[var(--exile-color-text-title)]">{{ tr(...c.title) }}</b>
        <dl class="flex flex-col gap-1.5 text-[12px]">
          <div v-for="(r, i) in ROWS" :key="i" class="flex flex-col">
            <dt class="opacity-60">{{ tr(...r) }}</dt>
            <dd :class="i === 0 && c.k === 'fractured' ? 'text-mod-fractured' : ''">{{ tr(...c.cells[i]!) }}</dd>
          </div>
        </dl>
      </button>
    </div>
  </ModalShell>
</template>
