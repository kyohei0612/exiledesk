<!--
  TreeGoalCard.vue — ツリーの枠の左上の「0 完成形の設定」を完成形のアイテム枠で出す形 (TreeGoalNode の次の形、スイッチ goalCard。OK までは本番は TreeGoalNode)。
  10-25 オーナー「ここ完成の時のアイテム枠の表示がいいな そしたら見ながら作れる」: 中身は完成形のアイテム枠 (箱に乗せた時と同じ StageItemCard、
  use-tree の goalItem)。「ベースの所にベースボタン、その下に MOD ボタン」: ベースは名前の帯の右、MOD は MOD の上の区切り線の右に重ねる (枠の外にボタンの列は作らない)。
  見出しの行で畳める (畳んだかは見る人の手元だけ)
-->
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import Icon from "../../../components/ui/Icon.vue";
import StageItemCard from "../../../components/for-share/item/StageItemCard.vue";
import { jaTypeName } from "../../../i18n/item-names-ja";
import { tr } from "../../../i18n/lang";
import { useTree } from "./use-tree";
import { rarityName } from "./tree-names";

const t = useTree();
const RGB = "242,210,122";
const CARD_W = 320;
const FOLD_KEY = "exiledesk.tree.goalFolded";
const rarity = computed(() => rarityName(t.goalRarity.value));
const n = computed(() => t.goals.value.length);
const marks = computed(() => t.goals.value.filter((a) => a.fractured).map((a) => a.modId));
const left = computed(() => t.goalItem.value?.left ?? []);
const folded = ref(((): boolean => { try { return localStorage.getItem(FOLD_KEY) === "1"; } catch { return false; } })());
function toggleFold(): void { folded.value = !folded.value; try { localStorage.setItem(FOLD_KEY, folded.value ? "1" : "0"); } catch { /* 手元に残らないだけ */ } }

/** ボタンの高さ: ベース = 名前の帯のすぐ下の種類の行、MOD = MOD の上の区切り線 (最後の .st-sep) の次の最初の行 (右の段の列は空いている)。MOD がまだ無ければ区切り線 */
const wrap = ref<HTMLElement | null>(null);
const baseTop = ref<number | null>(null);
const modTop = ref<number | null>(null);
function place(): void {
  const card = wrap.value?.querySelector<HTMLElement>("[data-stage-card]");
  const mid = (e: HTMLElement | null | undefined, inner = false): number | null => (card && e ? card.offsetTop + (inner ? (e.offsetParent as HTMLElement | null)?.offsetTop ?? 0 : 0) + e.offsetTop + e.offsetHeight / 2 : null);
  const kind = card?.querySelector<HTMLElement>(".st-head")?.nextElementSibling?.firstElementChild as HTMLElement | null | undefined;
  baseTop.value = mid(kind);
  const seps = card?.querySelectorAll<HTMLElement>(".st-sep");
  const sep = seps?.length ? seps[seps.length - 1]! : null;
  const row = (sep?.nextElementSibling as HTMLElement | null)?.querySelector<HTMLElement>("p");
  modTop.value = row ? card!.offsetTop + row.getBoundingClientRect().top - card!.getBoundingClientRect().top + row.offsetHeight / 2 : mid(sep);
}
onMounted(place);
watch([() => t.goalItem.value, folded], () => void nextTick(place));
</script>

<template>
  <div data-tree-goal class="pointer-events-auto max-w-[calc(100vw-2rem)] select-none rounded-xl border-[1.5px] bg-gradient-to-b from-[#221b10]/95 to-[#120e08]/95 p-1.5 text-[12px] shadow-[0_6px_20px_rgba(0,0,0,0.6)]"
    :style="{ borderColor: `rgba(${RGB},${t.goalPage.value ? 0.95 : 0.7})`, width: `${CARD_W + 14}px` }">
    <button type="button" data-tree-goal-fold class="flex h-6 w-full items-center gap-1.5 rounded-md px-0.5 text-left hover:bg-white/[0.04]" :aria-expanded="!folded" :title="folded ? tr('完成形のアイテムを出す', 'Show the final item') : tr('畳む', 'Collapse')" @click="toggleFold">
      <span class="flex size-5 shrink-0 items-center justify-center rounded-md" :style="{ background: `rgba(${RGB},0.18)`, color: `rgb(${RGB})` }"><Icon name="pin" class="size-3.5" /></span>
      <span class="shrink-0 text-[11px] font-bold tracking-wide" :style="{ color: `rgb(${RGB})` }">{{ tr("0 完成形の設定", "0 Final item") }}</span>
      <span v-if="folded" class="min-w-0 flex-1 truncate text-[11px] opacity-80">{{ tr(jaTypeName(t.doc.value.base), t.doc.value.base) }} · {{ n ? tr(`狙い ${n} つ`, `${n} target(s)`) : tr("MOD はまだ", "No mods yet") }}</span>
      <span v-else class="ml-auto shrink-0 text-[11px] opacity-70">{{ tr(`Lv ${t.doc.value.itemLevel}${t.doc.value.ilvlFit ? " 適正" : ""}`, `ilvl ${t.doc.value.itemLevel}${t.doc.value.ilvlFit ? " fit" : ""}`) }}</span>
      <span class="shrink-0 text-[10px] opacity-70">{{ folded ? "▸" : "▾" }}</span>
    </button>
    <div v-if="!folded" ref="wrap" class="relative mt-1 max-h-[calc(100vh-14rem)] overflow-y-auto overflow-x-hidden">
      <StageItemCard v-if="t.goalItem.value" :item="t.goalItem.value.item" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="CARD_W" compact :fracture-group="marks" tier-at-least />
      <!-- ベースは名前の帯のすぐ下の右、MOD は最初の MOD の行の右 (10-25 オーナー「ベースのとこにベースボタン、その下に MOD ボタン」) -->
      <button v-if="baseTop != null" type="button" data-tree-goal-open="base" class="g-btn sm absolute right-1.5 z-10 -translate-y-1/2" :style="{ top: `${baseTop ?? 0}px` }" :title="tr('ベース・レアリティ・アイテムレベルを選ぶ', 'Choose the base, rarity and item level') + ` (${rarity})`" @click="t.goalPage.value = 1">{{ tr("ベース", "Base") }}</button>
      <button v-if="modTop != null" type="button" data-tree-goal-open="mods" class="g-btn sm absolute right-1.5 z-10 -translate-y-1/2" :style="{ top: `${modTop}px` }" :title="tr('完成の MOD を決める (狙いにする・フラクチャーの印)', 'Set the final mods (targets and fracture marks)')" @click="t.goalPage.value = 2">{{ tr("MOD", "Mods") }}</button>
      <!-- カードの枠に乗らない狙い (TreeGoalPage と同じ。どれかが付けば当たり) -->
      <p v-for="a in left" :key="a.modId" data-tree-goal-over-row class="mt-0.5 min-w-0 truncate px-1 text-[11px]" :class="a.fractured ? 'text-mod-fractured' : 'text-[#c8c8ff]'" :title="a.reason">+ {{ a.fractured ? "✦ " : "" }}{{ t.startModLabel(a, true) }}</p>
    </div>
  </div>
</template>
