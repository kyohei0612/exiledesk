<!--
  TreeForeseeRows.vue — 予見の枠の中の結果の行 (S-39、開発版だけ。11-05 オーナー「予見って見えるのね…アイテムを使わん状態で持った状態で次の結果が分かるのよだから予見の枠」)。
  持った手の結果 (エンジンの分け方そのまま = 結果の箱) を行で並べ、行ごとに「使う / 使わない」。使う行は枠の下の結果の箱へ (費用はそこで)、
  使わない行は 1 つの箱 (枠のつづき) にまとまり、そこで「進む」で別の手を持つ (tree-foresee の setSeen・regroupSeen)
-->
<script setup lang="ts">
import { computed } from "vue";
import type { TreeBox } from "../../../services/simulator/tree/tree-model";
import { setSeen } from "../../../services/simulator/tree/tree-foresee";
import { tr } from "../../../i18n/lang";
import { useTree } from "./use-tree";
import { headOf, OUT_LOOK } from "./tree-names";
import { pctText, useTreeOdds } from "./tree-odds";

const props = defineProps<{ box: TreeBox; /** 押せる物を隠す時 (戻り先を選んでいる・一望) */ quiet: boolean }>();
const t = useTree();
const odds = useTreeOdds();
const rows = computed(() => props.box.outs.flatMap((id) => {
  const b = t.doc.value.boxes[id];
  if (!b) return [];
  // 使う行で下に手のある箱は、使わないにする前に下の手を消す (使わない行は打つ前のアイテムのまま枠のつづきへ進むので、下の手と合わない)
  const locked = !b.seen && (!!b.hand || b.outs.length > 0);
  return [{ id, seen: !!b.seen, locked, head: headOf(b, t.aimShort), c: OUT_LOOK[b.out].c, pct: odds.value.get(id) ?? null }];
}));
</script>

<template>
  <div data-tree-foresee-rows class="mt-2 flex flex-col gap-1 rounded-md border border-violet-400/30 bg-violet-950/30 p-1.5 text-[12px]">
    <p class="text-[11px] text-violet-200/80">{{ tr("見えた結果ごとに使うか決める", "Decide per foreseen result") }}</p>
    <div v-for="r in rows" :key="r.id" data-tree-foresee-row :data-row-of="r.id" class="flex min-w-0 items-center gap-1">
      <span class="min-w-0 flex-1 truncate font-semibold" :style="{ color: `rgb(${r.c})` }" :title="r.head">{{ r.head }}</span>
      <span v-if="r.pct != null" class="shrink-0 tabular-nums opacity-70">{{ pctText(r.pct) }}</span>
      <span class="flex shrink-0 overflow-hidden rounded border border-violet-400/40" :class="quiet ? 'pointer-events-none' : ''">
        <button type="button" data-tree-foresee-use class="nodrag h-6 px-1.5" :class="r.seen ? 'text-violet-200/70 hover:bg-violet-500/15' : 'bg-amber-500/25 font-bold text-amber-100'"
          :title="tr('この結果なら持った手を使う (枠を出て結果の箱へ、費用はここで払う)', 'Use the held craft on this result (leaves the frame; the cost is paid here)')" @click.stop="r.seen && t.edit((d) => setSeen(d, r.id, false))">{{ tr("使う", "Use") }}</button>
        <button type="button" data-tree-foresee-skip class="nodrag h-6 border-l border-violet-400/40 px-1.5" :class="[r.seen ? 'bg-violet-500/30 font-bold text-violet-100' : 'text-violet-200/70 hover:bg-violet-500/15', r.locked ? 'cursor-not-allowed opacity-40' : '']"
          :title="r.locked ? tr('この結果の箱の下に手がある。使わないにするなら先に下の手を消す', 'This result already has a next craft. Remove it first to mark it Not used') : tr('この結果なら使わない (アイテムはこのまま、同じ予見の枠で次を持つ)', 'Don’t use it on this result (the item stays; hold another craft in the same frame)')"
          @click.stop="!r.seen && !r.locked && t.edit((d) => setSeen(d, r.id, true))">{{ tr("使わない", "Skip") }}</button>
      </span>
    </div>
  </div>
</template>
