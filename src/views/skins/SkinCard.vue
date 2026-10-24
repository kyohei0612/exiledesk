<!--
  SkinCard.vue — コスメティックの一覧のカード 1 枚 (SkinsPage.vue の一覧と、一式の小窓で同じ形。2026-10-25)
  部品 = poe2db のページを新しいタブで開くリンク。一式 = ボタン (押すと中の部品の小窓、@open)。
  絵は元の大きさ (長い辺 128px) まで、引き伸ばさない (オーナー 10-25「画素粗い」)
-->
<script setup lang="ts">
import { ref } from "vue";
import { tr } from "../../i18n/lang";
import type { SkinCardData, SkinOrigin } from "./skins";

defineProps<{ card: SkinCardData }>();
defineEmits<{ open: [] }>();
const originLabel = (o: SkinOrigin): string =>
  o.kind === "pack" ? tr(`パック: ${o.name}`, `Pack: ${o.name}`) : o.kind === "box" ? tr(`ボックス: ${o.name}`, `Box: ${o.name}`) : tr("レースの報酬", "Race reward");
/** 読めなかった絵 (枠だけ残す) */
const broken = ref(false);
const cls = "group relative flex min-w-0 flex-col items-center rounded-xl border border-white/[0.06] bg-black/25 p-4 text-center no-underline transition hover:border-amber-400/40 hover:bg-white/[0.05] max-md:p-2";
</script>

<template>
  <component
    :is="card.set ? 'button' : 'a'"
    v-bind="card.set ? { type: 'button', title: tr('中の部品を見る', 'Show the pieces') } : { href: card.url, target: '_blank', rel: 'noopener noreferrer', title: tr('poe2db で見る', 'Open on poe2db') }"
    data-skins-row
    :data-skins-set="card.set ? '' : undefined"
    :class="cls"
    @click="card.set && $emit('open')"
  >
    <!-- 出どころの札 (取れた物だけ、小さく) -->
    <span v-if="card.origin" data-skins-origin class="absolute left-2 top-2 max-w-[60%] truncate rounded-full px-2 py-0.5 text-[10px]" :class="card.origin.kind === 'pack' ? 'bg-sky-500/20 text-sky-200' : card.origin.kind === 'box' ? 'bg-violet-500/20 text-violet-200' : 'bg-white/10 text-white/70'">{{ originLabel(card.origin) }}</span>
    <span v-if="card.parts" class="absolute right-2 top-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold text-amber-200">{{ tr(`${card.parts} 点`, `${card.parts} pcs`) }}</span>
    <span class="grid h-[136px] w-full place-items-center max-md:h-[120px]">
      <img v-if="card.art && !broken" :src="card.art" alt="" loading="lazy" decoding="async" draggable="false" class="max-h-[128px] max-w-[128px] object-contain transition group-hover:scale-105 max-md:max-h-[112px] max-md:max-w-[112px]" @error="broken = true" />
    </span>
    <span class="mt-2 line-clamp-2 w-full text-[15px] leading-snug text-[var(--exile-color-text-title)] max-md:text-[12px]">{{ card.name }}</span>
    <span v-if="card.sub" class="mt-0.5 block w-full truncate text-[11px] opacity-45 max-md:text-[10px]">{{ card.sub }}</span>
    <span class="mt-0.5 block w-full truncate text-[12px] text-[var(--exile-color-text-secondary)] max-md:text-[11px]">{{ card.kind }}</span>
  </component>
</template>
