<!--
  PhoneOverview.vue — スマホ版の「完成形と全体図」の重ね窓 (10-26 夜オーナー「完成形はミニマップ (全体図) を開いた時に、完成図の下にミニマップみたいに」
  「完成図は表に出さない」)。並びは PC の右の列と同じ = 上に完成形 (アイテムの枠・ベース / MOD)、その下に全体図。
  下の帯の 1 行「完成形と全体図 開く ▴」で開く (map-fold)。戻り先を選んでいる間 (mapPick) はいつも開き、全体図の箱を押すと箱の重ね窓 (その上に重なる) で「ここへ戻す」
-->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import ModalShell from "../../../components/ui/ModalShell.vue";
import { simSheet } from "./sim-sheet";
import StageItemCard from "../../../components/for-share/item/StageItemCard.vue";
import { useGoalShown } from "../tree/use-goal-shown";
import { useTree } from "../tree/use-tree";
import { jaTypeName } from "../../../i18n/item-names-ja";
import { tr } from "../../../i18n/lang";
import { mapPick } from "./use-phone-quiz";
import { mapFolded, setMapFold } from "./map-fold";
import PhoneMap from "./PhoneMap.vue";

const t = useTree();
const shown = useGoalShown();
const open = computed(() => !mapFolded.value || !!mapPick.value);
const marks = computed(() => t.goals.value.filter((a) => a.fractured).map((a) => a.modId));
/** カードの幅 = 窓の中いっぱい (左右の余白 12 ずつ)。上限は付けない (10-26 夜オーナー「枠は最大限」) */
const cardW = (typeof window === "undefined" ? 375 : window.innerWidth) - 24;
/** 帯の小さなボタン (完成形の札と同じ形、指で押せる高さ 40px) */
const PILL = "shrink-0 rounded-md border border-[#c9a45c]/60 bg-gradient-to-b from-[#3a2c14] to-[#1a1309] px-3 text-[13px] font-bold leading-[38px] text-[#f2d27a]";
/** 全体図の所 (戻り先を選ぶ時はここまで送る。320 では完成形のカードの下で窓の外だった) */
const mapEl = ref<HTMLElement | null>(null);
watch(() => mapPick.value?.from, async (f) => { if (!f) return; await nextTick(); mapEl.value?.scrollIntoView({ block: "start" }); }, { immediate: true });
function close(): void { mapPick.value = null; setMapFold(true); }
// 殻は共通の ModalShell の下から出る形 (U-15・U-21、11-07 オーナー OK): Esc・後ろを押す・後ろのページの止め・重なりの段 z-300 は共通の物
</script>

<template>
  <ModalShell :open="open" sheet sheet-top="pt-[8vh]" :label="tr('完成形と全体図', 'Final item and overview')" :panel-class="simSheet()" body-class="px-3 pb-3 pt-2" @close="close">
      <div data-phone-overview>
        <!-- 完成形 (PC の右の列の一番上と同じ、アイテムの枠) -->
        <section v-if="!mapPick" data-phone-goal class="flex min-w-0 flex-col items-center gap-2 text-center">
          <p class="flex max-w-full items-center justify-center gap-2 text-[14px]"><b class="shrink-0 text-[#f2d27a]">{{ tr("完成形", "Final item") }}</b><span class="min-w-0 break-words text-sim-body">{{ tr(jaTypeName(t.doc.value.base), t.doc.value.base) }}</span></p>
          <StageItemCard :row-group="shown.groups.value" v-if="t.goalItem.value && t.goals.value.length" data-phone-goal-card :item="shown.item.value ?? t.goalItem.value.item" :row-tags="shown.tags.value" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="cardW" compact :fracture-group="marks" tier-at-least />
          <p v-else class="text-[12px] text-sim-dim">{{ tr("MOD はまだ (MOD で決める)", "No mods yet (set them with Mods)") }}</p>
          <span class="flex justify-center gap-2">
            <button type="button" data-phone-goal-open="base" :class="PILL" @click="t.goalPage.value = 1">{{ tr("ベース", "Base") }}</button>
            <button type="button" data-phone-goal-open="mods" :class="PILL" @click="t.goalPage.value = 2">MOD</button>
          </span>
        </section>
        <!-- 全体図 (完成形の下) -->
        <div ref="mapEl" class="mt-3 scroll-mt-2"><PhoneMap /></div>
      </div>
    <template #footer>
        <button type="button" data-phone-overview-close class="g-btn !min-h-11 flex-1" @click="close">{{ tr("閉じる", "Close") }}</button>
    </template>
  </ModalShell>
</template>
