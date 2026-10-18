<!--
  SimStartPick.vue — シミュレーターの始め方 (白から / フラクチャー済みを買う / マジックを買う / 4 MOD のレアを買う / エミュレーターの状態から)。
  前は 1 ベースの欄 (StageSettings.vue) にあった。2026-10-18 オーナー「順番通り勝手に案内する感じで」「ベースを選んだら即 MOD 選択」で、
  狙う MOD を決めた後の段 (StageSimPanel.vue の 3) に移した。白以外は 2 狙う MOD の最初の 1 つが固定 MOD になる。
  アイテムレベルもここで (オーナー「MOD 選んだ後なら、選んだ MOD が付く下限のアイテムレベルをデフォで置ける」): 狙いの段が全部付く一番低いレベルを最初に入れ、それ以上から選ぶ
-->
<script setup lang="ts">
import { computed, onMounted } from "vue";
import { SIM_ILVL_MAX } from "./use-stage-base";
import { htcBaseInfo } from "../../services/htc/patch";
import { jaSkill } from "../../i18n/skills-ja";
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
/** 狙いの段が全部付く一番低いアイテムレベル (狙いの下限の段の MOD レベルの一番高い物) */
const needIlvl = computed(() => Math.max(1, ...s.simTargets.value.map((t) => s.data.value?.mods.get(t.modId)?.tiers[t.minTierIndex]?.ilvl ?? 1)));
const ILVL_CHOICES = computed(() => Array.from({ length: Math.max(0, SIM_ILVL_MAX - needIlvl.value + 1) }, (_, i) => needIlvl.value + i));
// 3 に来た時: まだ選んでいない (2 の間の一番上のまま) か、下限より低ければ下限を入れる。エミュレーターの状態からは、そのアイテムのレベルのまま
onMounted(() => { if (s.simStart.value !== "item" && (s.itemLevel.value === SIM_ILVL_MAX || s.itemLevel.value < needIlvl.value)) s.itemLevel.value = needIlvl.value; });
/** 付与スキルの候補 (2 つ以上ある時だけ選ばせる。1 つに決まっているベースは選ぶ物が無い) */
const grants = computed(() => htcBaseInfo()[s.base.value]?.grants ?? []);
/** 手打ちの状態の MOD (札の下に 1 行) */
const startItemMods = computed(() => {
  const it = s.simStartItem.value;
  return it ? [...it.prefixes, ...it.suffixes].map((m) => `${m.fractured ? tr("[固定] ", "[Fractured] ") : ""}${modText(m)} (${m.tierName})`) : [];
});
</script>

<template>
  <div class="flex flex-col gap-2">
  <span class="flex flex-wrap items-center gap-1 text-[12px] max-md:grid max-md:w-full max-md:grid-cols-1">
    <span class="mr-1 text-[var(--exile-color-text-secondary)]">{{ tr("始め方", "Start") }}</span>
    <button v-for="x in (s.simStartItem.value ? [...START_KINDS, ITEM_KIND] : START_KINDS)" :key="x.k" type="button" class="g-tab !min-h-[30px] !px-3 max-md:!min-h-10" :class="s.simStart.value === x.k ? 'on' : ''" :title="tr(x.hint, x.hintEn)" @click="s.simStart.value = x.k"><Icon v-if="x.k === 'fractured'" name="lock" class="size-3.5 shrink-0" />{{ tr(x.label, x.labelEn) }}</button>
    <span v-if="s.simStart.value === 'item'" class="text-[11px] opacity-70 max-md:w-full">{{ s.simStartItem.value?.rarity === "rare" ? tr("レア", "Rare") : s.simStartItem.value?.rarity === "magic" ? tr("マジック", "Magic") : tr("ノーマル", "Normal") }} · {{ startItemMods.length ? startItemMods.join(" / ") : tr("MOD なし", "No mods") }}</span>
    <HelpTip v-else-if="s.simStart.value !== 'white' && s.simStart.value !== 'magic'" :text="tr('フラクチャー (固定) される MOD は、2 狙う MOD で最初に足した物', 'The fractured mod is the first one added in step 2 (Target mods)')" />
  </span>
  <!-- 付与スキル (候補から 1 つ付くベースだけ。クラフトでは変えられないので、買うベースを決める物) -->
  <span v-if="grants.length > 1" class="flex flex-wrap items-center gap-2 text-[12px]">
    <span class="text-[var(--exile-color-text-secondary)]">{{ tr("付与スキル", "Granted skill") }}</span>
    <select data-sim-grant class="h-[30px] max-w-full cursor-pointer rounded border bg-black/60 px-1.5 max-md:h-10" :class="s.simGrant.value ? 'border-white/15 text-white/85' : 'border-amber-300/70 text-amber-100'" :value="s.simGrant.value ?? ''" @change="s.simGrant.value = ($event.target as HTMLSelectElement).value || null">
      <option value="">{{ tr(`選ぶ (${grants.length} 種)`, `Choose (${grants.length})`) }}</option>
      <option v-for="g in grants" :key="g.en" :value="g.en">{{ tr(jaSkill(g.en), g.en) }}{{ g.level ? ` (Lv ${g.level})` : "" }}</option>
    </select>
    <span class="text-[11px] opacity-60">{{ tr("クラフトでは変わらない。買うベースを決める物", "Crafting can't change it; it decides which base you buy") }}</span>
  </span>
  <!-- アイテムレベル (エミュレーターの状態からは、そのアイテムのレベルのまま) -->
  <span v-if="s.simStart.value !== 'item'" class="flex flex-wrap items-center gap-2 text-[12px]">
    <span class="text-[var(--exile-color-text-secondary)]">{{ tr("アイテムレベル", "Item Level") }}</span>
    <select data-sim-ilvl class="h-[30px] cursor-pointer rounded border border-white/15 bg-black/60 px-1.5 tabular-nums text-white/85 max-md:h-10" :value="s.itemLevel.value" @change="s.itemLevel.value = Number(($event.target as HTMLSelectElement).value)">
      <option v-for="lv in ILVL_CHOICES" :key="lv" :value="lv">{{ lv }}</option>
    </select>
    <span class="text-[11px] opacity-60">{{ tr(`狙いが全部付く一番低いレベルは ${needIlvl}`, `Lowest level where every target can roll: ${needIlvl}`) }}</span>
  </span>
  </div>
</template>
