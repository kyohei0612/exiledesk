<!--
  BoardAttCard.vue — 掲示板に貼ったアイテム (2026-10-16 掲示板の 2 段目、オーナー「掲示板強化」)。
  サーバーには縮めた形 (BoardAtt: ベース・アイテムレベル・レア度・MOD の id と段と値) しか無いので、見る人の画面のデータで文にする
  (掲示板の当たりの札と同じ作り)。今のデータに無い MOD は出さない。見るだけ (押しても何もしない)
-->
<script setup lang="ts">
import { computed } from "vue";
import { baseNameOf, modText, tr } from "../../i18n/lang";
import { craftStage } from "../../state/craft-stage";
import { freshItem } from "../../services/craft-stage/run-plan";
import { makeStageMod, withValues } from "../../services/craft-stage/stage-core";
import { baseArt } from "../../services/craft-stage/base-art";
import type { BoardAtt } from "../../services/board/board-api";

const props = defineProps<{ att: BoardAtt }>();
/** レア度の色 (ゲームの名前の色) */
const RARITY: Record<BoardAtt["r"], string> = { normal: "#c8c8c8", magic: "#8888ff", rare: "#ffff77", unique: "#af6025" };
const view = computed(() => {
  const data = craftStage.data.value;
  if (!data) return null;
  let name = props.att.b;
  try { name = baseNameOf(freshItem(data, props.att.b, props.att.i)); } catch { /* 名前だけ英語のまま */ }
  const mods = props.att.m.flatMap(([id, ti, v, side, fl]) => {
    const mod = data.mods.get(id);
    if (!mod || !mod.tiers[ti]) return [];
    try {
      const sm = withValues(makeStageMod(mod, side === "p" ? "prefix" : "suffix", ti, () => 0), mod, () => 0, v);
      return [{ key: `${id}#${ti}`, side, tier: sm.tierName, text: modText(sm), fractured: fl.includes("f"), desecrated: fl.includes("d") }];
    } catch { return []; }
  });
  // プレ → サフィの順 (ゲームのカードと同じ)
  mods.sort((a, b) => (a.side === b.side ? 0 : a.side === "p" ? -1 : 1));
  return { name, mods, art: baseArt(props.att.b) };
});
</script>

<template>
  <div v-if="view" data-board-att class="mt-1.5 max-w-[420px] rounded-md border bg-black/50 px-2.5 py-2 text-[12px]" :style="{ borderColor: `${RARITY[att.r]}66` }">
    <div class="flex items-center gap-2">
      <img v-if="view.art" :src="view.art" alt="" class="size-8 shrink-0 object-contain" />
      <b class="min-w-0 flex-1 truncate text-[13px]" :style="{ color: RARITY[att.r] }">{{ view.name }}</b>
      <span class="shrink-0 text-[11px] tabular-nums text-[var(--exile-color-text-tertiary)]">iLv {{ att.i }}</span>
    </div>
    <ul v-if="view.mods.length" class="mt-1 space-y-0.5">
      <li v-for="m in view.mods" :key="m.key" class="flex min-w-0 items-baseline gap-1.5">
        <span class="w-7 shrink-0 text-[11px] font-bold tabular-nums" :class="m.side === 'p' ? 'text-[#e0846a]' : 'text-[#6aa8e8]'">{{ m.side === "p" ? "P" : "S" }}{{ m.tier.replace(/^T/, "") }}</span>
        <span class="min-w-0 break-words" :class="m.fractured ? 'text-[#a29162]' : m.desecrated ? 'text-[#9fc07a]' : 'text-[var(--color-rarity-magic)]'">{{ m.text }}<span v-if="m.fractured" class="ml-1 text-[10px] opacity-80">{{ tr("フラクチャー", "Fractured") }}</span><span v-if="m.desecrated" class="ml-1 text-[10px] opacity-80">{{ tr("冒涜", "Desecrated") }}</span></span>
      </li>
    </ul>
    <p v-else class="mt-1 text-[var(--exile-color-text-tertiary)]">{{ tr("MOD なし", "No mods") }}</p>
    <p v-if="att.c" class="mt-0.5 font-bold text-[#d20000]">{{ tr("コラプト", "Corrupted") }}</p>
  </div>
</template>
