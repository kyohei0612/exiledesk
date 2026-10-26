<!--
  TreeBoxMods.vue — ツリーの箱の中の、今のアイテムに付いている MOD の並び (2026-10-26 オーナー「枠は現状のアイテムの枠が表示してあげたら？」
  「枠ない整理しようか被ってるしつくMOD整理してくれ」「スピリットがついたで下にすぐスピリットとか書かんくてええしな」)。
  1 行 1 MOD (P1 / S1 + 短い名前、✦ はフラクチャー)。外れはまとめて「外れ ×n」。枠の上の札と同じ MOD (この箱で付いた狙い) は繰り返さない。
  外れかどうかは乗せた時のカードと同じ tree-row-tags の札で見る (自前で決めない)。全文は乗せた時のカード
-->
<script setup lang="ts">
import { computed } from "vue";
import type { StageItem, StageMod } from "../../../services/craft-stage/engine";
import type { RowTag } from "../../../components/for-share/item/stage-item-row-tag";
import { boxAims, type TreeBox } from "../../../services/simulator/tree/tree-model";
import { modText, tr } from "../../../i18n/lang";
import { modShort } from "./tree-names";

const props = defineProps<{ item: StageItem; tags: ReadonlyMap<string, RowTag> | null; box: TreeBox }>();
const MISS = (t: RowTag | undefined): boolean => t?.tone === "bad" && !!t.replace;
const rows = computed(() => {
  const own = props.box.out === "hit" ? boxAims(props.box).map((a) => a.modId) : [];
  const out: Array<{ key: string; side: "P" | "S"; text: string; fractured: boolean }> = [];
  let miss = 0;
  const each = (ms: readonly StageMod[], side: "P" | "S"): void => {
    for (const m of ms) {
      if (MISS(props.tags?.get(m.modId))) { miss++; continue; }
      if (own.includes(m.modId)) continue;
      out.push({ key: m.modId, side, text: `${side}${(m.tierName ?? "").replace(/^T/, "")} ${modShort(modText(m))}`, fractured: !!m.fractured });
    }
  };
  each(props.item.prefixes, "P");
  each(props.item.suffixes, "S");
  return { out, miss };
});
</script>

<template>
  <ul data-tree-box-mods class="flex flex-col text-[11px] leading-[15px]">
    <li v-for="r in rows.out" :key="r.key" class="truncate" :class="r.fractured ? 'text-mod-fractured' : r.side === 'P' ? 'text-[#e0b09a]' : 'text-[#9ac0e8]'">{{ r.fractured ? "✦ " : "" }}{{ r.text }}</li>
    <li v-if="rows.miss" class="truncate text-rose-300/90">{{ tr(`外れ ×${rows.miss}`, `Miss ×${rows.miss}`) }}</li>
  </ul>
</template>
