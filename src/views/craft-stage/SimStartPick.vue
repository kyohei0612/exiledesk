<!--
  SimStartPick.vue — シミュレーターの始め方 (白から / フラクチャー済みを買う / マジックを買う / 4 MOD のレアを買う / エミュレーターの状態から)。
  前は 1 ベースの欄 (StageSettings.vue) にあった。2026-10-18 オーナー「ベースを選んで、アイテムレベルを選んで MOD へ進む。そのあとに始め方を決める工程」で、
  狙う MOD を決めた後の段 (StageSimPanel.vue の 3) に移した。白以外は 2 狙う MOD の最初の 1 つが固定 MOD になる
-->
<script setup lang="ts">
import { computed } from "vue";
import { craftStage as s } from "../../state/craft-stage";
import { modText, tr } from "../../i18n/lang";
import HelpTip from "../../components/ui/HelpTip.vue";
import Icon from "../../components/ui/Icon.vue";

const START_KINDS: Array<{ k: "white" | "fractured" | "four" | "magic"; label: string; hint: string; labelEn: string; hintEn: string }> = [
  { k: "white", label: "白ベースから", hint: "白のベースを買って 1 から作る", labelEn: "From a white base", hintEn: "Buy a white base and craft from scratch" },
  { k: "fractured", label: "フラクチャー済みを買う", hint: "フラクチャーの MOD が 1 つ付いたベースを買う。フラクチャーの MOD は 2 狙う MOD で最初に足した物", labelEn: "Buy fractured", hintEn: "Buy a base with 1 fractured mod: the first mod added in step 2 (Target mods)" },
  { k: "magic", label: "マジックを買う", hint: "狙う MOD の最初のプレフィックス 1 つ・サフィックス 1 つが付いたマジックを買う (段は狙いの下限)", labelEn: "Buy a magic", hintEn: "Buy a magic item with the first target prefix and suffix (at their minimum tier)" },
  { k: "four", label: "4 MOD のレアを買う", hint: "3 MOD + 狙い 1 のレアを買って、骨の壁を足してからフラクチャー (当たり 1/3)", labelEn: "Buy a 4-mod rare", hintEn: "Buy a rare with 3 mods + 1 target, block with an Abyssal Bone, then use a Fracturing Orb (1/3 hit)" },
];
/** 手打ちから持ってきた時だけ出る札 */
const ITEM_KIND = { k: "item" as const, label: "エミュレーターの状態から", hint: "エミュレーターの今のアイテムから先を回す", labelEn: "From the Emulator item", hintEn: "Continue from the current Emulator item" };
/** 手打ちの状態の MOD (札の下に 1 行) */
const startItemMods = computed(() => {
  const it = s.simStartItem.value;
  return it ? [...it.prefixes, ...it.suffixes].map((m) => `${m.fractured ? tr("[固定] ", "[Fractured] ") : ""}${modText(m)} (${m.tierName})`) : [];
});
</script>

<template>
  <span class="flex flex-wrap items-center gap-1 text-[12px] max-md:grid max-md:w-full max-md:grid-cols-1">
    <span class="mr-1 text-[var(--exile-color-text-secondary)]">{{ tr("始め方", "Start") }}</span>
    <button v-for="x in (s.simStartItem.value ? [...START_KINDS, ITEM_KIND] : START_KINDS)" :key="x.k" type="button" class="g-tab !min-h-[30px] !px-3 max-md:!min-h-10" :class="s.simStart.value === x.k ? 'on' : ''" :title="tr(x.hint, x.hintEn)" @click="s.simStart.value = x.k"><Icon v-if="x.k === 'fractured'" name="lock" class="size-3.5 shrink-0" />{{ tr(x.label, x.labelEn) }}</button>
    <span v-if="s.simStart.value === 'item'" class="text-[11px] opacity-70 max-md:w-full">{{ s.simStartItem.value?.rarity === "rare" ? tr("レア", "Rare") : s.simStartItem.value?.rarity === "magic" ? tr("マジック", "Magic") : tr("ノーマル", "Normal") }} · {{ startItemMods.length ? startItemMods.join(" / ") : tr("MOD なし", "No mods") }}</span>
    <HelpTip v-else-if="s.simStart.value !== 'white' && s.simStart.value !== 'magic'" :text="tr('フラクチャー (固定) される MOD は、2 狙う MOD で最初に足した物', 'The fractured mod is the first one added in step 2 (Target mods)')" />
  </span>
</template>
