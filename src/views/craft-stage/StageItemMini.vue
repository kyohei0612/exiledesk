<!--
  StageItemMini.vue — スマホの手で打つ画面で、アイテムのカードが画面の外に出た時に上に貼るアイテムの要約 (2026-10-09)

  オーナー「手で打つの方もずっとアイテムは表示してた方が良い。下にスクロールしても MOD 付いても見えんからな」。
  名前 (レアリティの色) と MOD を小さく。直前の手で付いた MOD は緑、消えた MOD は取り消し線で 1 手分だけ出す。
-->
<script setup lang="ts">
import { computed } from "vue";
import { baseArt } from "../../services/craft-stage/base-art";
import type { StageItem, StageMod } from "../../services/craft-stage/types";

const props = defineProps<{ item: StageItem; added: StageMod[]; removed: StageMod[] }>();
const NAME = { normal: "text-rarity-normal", magic: "text-rarity-magic", rare: "text-rarity-rare", unique: "text-rarity-unique" } as const;
const art = computed(() => baseArt(props.item.base));
const addedIds = computed(() => new Set(props.added.map((m) => m.modId)));
const mods = computed(() => [...props.item.prefixes.map((m) => ({ m, side: "プ" })), ...props.item.suffixes.map((m) => ({ m, side: "サ" }))]);
</script>

<template>
  <div data-item-mini class="g-plain fixed inset-x-0 top-0 z-[140] max-h-[34vh] overflow-y-auto border-b border-[var(--exile-color-border-brass)] bg-[#0f0c0a]/[0.97] px-3 py-1.5 text-[12px] shadow-[0_8px_18px_rgba(0,0,0,0.7)] backdrop-blur">
    <p class="flex items-center gap-2">
      <img v-if="art" :src="art" alt="" class="size-7 shrink-0 object-contain" draggable="false" />
      <b class="truncate text-[13px]" :class="NAME[item.rarity]">{{ item.unique?.ja ?? item.baseJa }}</b>
      <span class="ml-auto shrink-0 text-[10px] text-[var(--exile-color-text-tertiary)]">iLv {{ item.itemLevel }}</span>
    </p>
    <p v-for="r in mods" :key="r.m.modId" class="flex items-baseline gap-1.5 leading-snug" :class="addedIds.has(r.m.modId) ? 'stage-row-in font-semibold text-emerald-300' : r.m.fractured ? 'text-[#c8b896]' : 'text-rarity-magic'">
      <span class="shrink-0 text-[9px] text-[var(--exile-color-text-tertiary)]">{{ r.side }}</span>
      <span class="min-w-0">{{ r.m.unrevealed ? "未発現の MOD" : r.m.textJa }}</span>
    </p>
    <p v-for="m in removed" :key="'x' + m.modId" class="text-rose-300/80 line-through">{{ m.textJa }}</p>
    <p v-if="!mods.length && !removed.length" class="text-[var(--exile-color-text-tertiary)]">MOD なし</p>
  </div>
</template>
