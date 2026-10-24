<!--
  TreeTabs.vue — 木のタブ (2026-10-22 始め方を並べるタブ → 10-24 オーナー「タブは人が押した時だけ増やし、新しいツリーを最初から任意で作る」)。
  タブごとに別の木 (0 完成形の設定も別、use-tree の switchTab は写さない)。名前はベース名 (同じベースが 2 つ目からは番号)。＋ で全くの白紙の木を足してベース選びから
-->
<script setup lang="ts">
import { computed } from "vue";
import Icon from "../../../components/ui/Icon.vue";
import { tr } from "../../../i18n/lang";
import { jaTypeName } from "../../../i18n/item-names-ja";
import { useTree } from "./use-tree";

const emit = defineEmits<{ switched: [] }>();
const t = useTree();
function go(i: number): void { t.switchTab(i); emit("switched"); }
function add(): void { t.addTab(); emit("switched"); }
function close(i: number): void { t.closeTab(i); emit("switched"); }
/** タブの名前 = ベース名 (ベースを選ぶ前の白紙は「新しいツリー」)。同じベースの 2 つ目からは「 2」「 3」 */
const names = computed(() => {
  const seen = new Map<string, number>();
  return t.tabDocs.value.map((d0, i) => {
    const d = i === t.active.value ? t.doc.value : d0;
    if (!d.baseChosen && Object.keys(d.boxes).length <= 1 && !d.memoAims?.length) return tr("新しいツリー", "New tree");
    const n = (seen.get(d.base) ?? 0) + 1;
    seen.set(d.base, n);
    const name = tr(jaTypeName(d.base), d.base);
    return n > 1 ? `${name} ${n}` : name;
  });
});
</script>

<template>
  <div data-tree-tabs class="flex min-w-0 items-center gap-1.5 overflow-x-auto">
    <!-- 文は中の span で右を … で切る (g-tab は真ん中寄せなので、ボタンで切ると頭と終わりが両側から切れた。タブは縮めて「新しいツリー」を押し出さない、10-23 モンキー 6) -->
    <span v-for="(_, i) in t.tabDocs.value" :key="i" class="flex min-w-[96px] shrink items-center">
      <button type="button" data-tree-tab :data-tab-i="i" class="g-tab !min-h-[30px] min-w-0 max-w-[320px] !px-3 !text-[13px]" :class="i === t.active.value ? 'on' : ''" :title="names[i]" @click="go(i)"><span class="block min-w-0 truncate">{{ names[i] }}</span></button>
      <button v-if="t.tabDocs.value.length > 1" type="button" data-tree-tab-close class="-ml-1 flex size-6 shrink-0 items-center justify-center rounded opacity-50 hover:bg-white/10 hover:opacity-100" :title="tr('このタブの木を閉じる', 'Close this tab’s tree')" @click="close(i)"><Icon name="x" class="size-3.5" /></button>
    </span>
    <button type="button" data-tree-tab-add class="g-btn sm inline-flex shrink-0 items-center gap-1" :aria-label="tr('新しいツリー', 'New tree')" :title="tr('新しいツリーを白紙から作る (ベース選びから)', 'Start a new tree from scratch (choose a base first)')" @click="add"><Icon name="plus" class="size-3.5" /><span class="max-md:hidden">{{ tr("新しいツリー", "New tree") }}</span></button>
  </div>
</template>
