<!--
  TreeTabs.vue — 木のタブ (2026-10-22 始め方を並べるタブ → 10-24 オーナー「タブは人が押した時だけ増やし、新しいツリーを最初から任意で作る」)。
  タブごとに別の木 (0 完成形の設定も別、use-tree の switchTab は写さない)。＋ で全くの白紙の木を足してベース選びから。
  名前は「ツリー①」… (ベースに関係なく空いている一番小さい番号)、ダブルクリックでその場で変える (Enter・枠の外で決める、Esc で取り消し、空なら番号の名前へ)。
  「コピー」= 今の木を丸ごと写して新しいタブで開く (名前は「〜 のコピー」、元は変えない)。10-24 夜オーナー
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import ModListWin from "../../../components/for-share/mod-list/ModListWin.vue";
import { craftStage as s } from "../../../state/craft-stage";
import { freshItem } from "../../../services/craft-stage/engine";
import { treeHidden } from "../use-sim-shelf";
import { flag } from "../../../web/release-flags";
import Icon from "../../../components/ui/Icon.vue";
import { tr } from "../../../i18n/lang";
import { useTree } from "./use-tree";
import { askLeave, openTreePage, treeStep } from "../../../web/page";
import { autoName, quickSave, unsaved } from "./tree-save";
import { saveTreeRecipe } from "../../../state/simulator/tree-recipes";

const emit = defineEmits<{ switched: [] }>();
/** compact = 木の枠の上の 1 行の帯の中 (SimTreePage、10-26 夜オーナー「1 行で」): 新しいツリー・コピーを道具の列と同じ平たいボタンにし、名前は帯が広い時だけ */
defineProps<{ compact?: boolean }>();
const FLAT = "flex h-8 min-w-8 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md bg-[#15110c]/95 px-1.5 ring-1 ring-white/10 text-[12px] text-sim-body hover:bg-white/10 hover:text-white";
const t = useTree();
/** 帯の「MOD 一覧」(スイッチ simModList、PC の帯だけ): 棚 + MOD の表の窓 (共通の ModListWin)。見るだけで木には何もしない */
const MOD_WIN = flag("simModList");
const modWin = ref(false);
/** 窓で見る品 = 木のベース・アイテムレベルの何も付いていない品 (確率を確かめるだけの窓。箱とはつながない、オーナー 11-12「アイテムカードに何もついてない状態で見たい」) */
const modItem = computed(() => { const d = s.data.value; try { return modWin.value && d && !t.needBase.value ? freshItem(d, t.doc.value.base, t.doc.value.itemLevel, "rare") : null; } catch { return null; } });
/** タブを替えた後の段の URL を画面に合わせる (完成形の設定のページから替えて木へ戻った時に sim-base のまま残らない。ベース選びの白紙のタブは sim-base) */
function syncStep(): void {
  const to = t.goalPage.value === 1 ? "base" : t.goalPage.value === 2 ? "mods" : "tree";
  if (treeStep.value !== "tree" && treeStep.value !== to) openTreePage(to);
}
function go(i: number): void { t.switchTab(i); syncStep(); emit("switched"); }
function add(): void { t.addTab(); emit("switched"); }
function copy(): void { t.copyTab(); syncStep(); emit("switched"); }
/**
 * タブを閉じる。そのタブの木が作りかけなら 3 択 (保存して進む = そのタブの木を自動の名前で保存、開いているタブならレシピへ上書き。10-26 オーナー「タブを × で閉じる」も)
 */
function close(i: number): void {
  const go = (): void => { t.closeTab(i); syncStep(); emit("switched"); };
  const active = i === t.active.value, d = active ? t.doc.value : t.tabDocs.value[i];
  if (!d || !unsaved(d, active)) { go(); return; }
  askLeave(go, () => { if (active) quickSave(); else saveTreeRecipe(autoName(d), d); });
}
/** 名前を変えているタブ (null = 変えていない) */
const editing = ref<number | null>(null);
const input = ref<HTMLInputElement[]>([]);
function startRename(i: number): void {
  if (i !== t.active.value) go(i);
  editing.value = i;
  void nextTick(() => { const el = input.value[0]; el?.focus(); el?.select(); });
}
/** 決める (Enter・枠の外)。Esc は取り消し */
function endRename(v: string | null): void {
  if (editing.value === null) return;
  editing.value = null;
  if (v !== null && v.trim() !== t.tabLabel(t.active.value)) t.renameTab(v);
}
/**
 * 枠の外を押したら決める。木の枠 (Vue Flow) は押した時の既定の動きを止めるので、欄から blur が来ず開いたままだった (10-24 夜 21 本目の台本)。
 * 共通の use-dismiss は「外 = 取り消し」なので使わず、名前の欄だけここで見る
 */
function onDocDown(e: PointerEvent): void {
  const el = input.value[0];
  if (el && !el.contains(e.target as Node)) endRename(el.value);
}
watch(editing, (v) => {
  if (v !== null) document.addEventListener("pointerdown", onDocDown, true);
  else document.removeEventListener("pointerdown", onDocDown, true);
});
onBeforeUnmount(() => document.removeEventListener("pointerdown", onDocDown, true));
</script>

<template>
  <div data-tree-tabs class="flex items-center gap-1.5">
    <!-- タブは縮めない (幅で形を変えない。入らない幅は上の帯ごと横に送る、11-08 夜オーナー「pxみじけーやつは苦労させろ精神」) -->
    <span class="flex items-center gap-1.5">
    <!-- 文は中の span で右を … で切る (g-tab は真ん中寄せなので、ボタンで切ると頭と終わりが両側から切れた。タブは縮めて「新しいツリー」を押し出さない、10-23 モンキー 6) -->
    <span v-for="(_, i) in t.tabDocs.value" :key="i" class="flex min-w-[96px] shrink-0 items-center">
      <input v-if="editing === i" ref="input" data-tree-tab-name-input :value="t.tabLabel(i)" class="h-[30px] w-40 rounded border border-amber-400/60 bg-black/50 px-2 text-[13px] outline-none"
        @keydown.enter.prevent="endRename(($event.target as HTMLInputElement).value)" @keydown.esc.stop.prevent="endRename(null)" @blur="endRename(($event.target as HTMLInputElement).value)" />
      <button v-else type="button" data-tree-tab :data-tab-i="i" class="g-tab !min-h-[30px] min-w-0 max-w-[320px] !px-3 !text-[13px] max-[48rem]:max-w-full max-[48rem]:whitespace-normal" :class="i === t.active.value ? 'on' : ''" :title="tr(`${t.tabLabel(i)} (ダブルクリックで名前を変える)`, `${t.tabLabel(i)} (double-click to rename)`)" @click="go(i)" @dblclick="startRename(i)"><span class="block min-w-0 truncate max-[48rem]:overflow-visible max-[48rem]:whitespace-normal max-[48rem]:break-words">{{ t.tabLabel(i) }}</span></button>
      <button v-if="t.tabDocs.value.length > 1" type="button" data-tree-tab-close class="-ml-1 flex size-6 shrink-0 items-center justify-center rounded opacity-50 hover:bg-white/10 hover:opacity-100" :title="tr('このタブの木を閉じる', 'Close this tab’s tree')" @click="close(i)"><Icon name="x" class="size-3.5" /></button>
    </span>
    </span>
    <template v-if="compact">
      <button type="button" data-tree-tab-add :class="FLAT" :aria-label="tr('新しいツリー', 'New tree')" :title="tr('新しいツリーを白紙から作る (ベース選びから)', 'Start a new tree from scratch (choose a base first)')" @click="add"><Icon name="plus" class="size-4" /><span class="">{{ tr("新規", "New") }}</span></button>
      <button type="button" data-tree-tab-copy :class="FLAT" :aria-label="tr('コピー', 'Copy')" :title="tr('今のツリーを丸ごと写して新しいタブで開く (元は変わらない)', 'Copy this whole tree into a new tab (the original stays)')" @click="copy"><Icon name="copy" class="size-4" /><span class="">{{ tr("コピー", "Copy") }}</span></button>
      <button v-if="MOD_WIN && !t.needBase.value" type="button" data-tree-modlist :class="FLAT" :title="tr('このベースに付く MOD とカレンシーの棚 (棚の物を押すと、それで付く MOD だけと確率)', 'Mods for this base with the currency shelf (pick a currency to see only what it can roll)')" @click="modWin = true"><span>{{ tr("MOD 一覧", "Mod list") }}</span></button>
      <ModListWin v-if="MOD_WIN" :open="modWin" :blank="modItem" :hidden="treeHidden" @close="modWin = false" />
    </template>
    <template v-else>
      <button type="button" data-tree-tab-add class="g-btn sm inline-flex shrink-0 items-center gap-1" :aria-label="tr('新しいツリー', 'New tree')" :title="tr('新しいツリーを白紙から作る (ベース選びから)', 'Start a new tree from scratch (choose a base first)')" @click="add"><Icon name="plus" class="size-3.5" /><span class="max-[48rem]:hidden">{{ tr("新しいツリー", "New tree") }}</span></button>
      <button type="button" data-tree-tab-copy class="g-btn sm shrink-0" :title="tr('今のツリーを丸ごと写して新しいタブで開く (元は変わらない)', 'Copy this whole tree into a new tab (the original stays)')" @click="copy">{{ tr("コピー", "Copy") }}</button>
    </template>
  </div>
</template>
