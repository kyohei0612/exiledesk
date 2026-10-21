<!--
  TreeBasePick.vue — ツリーの右の欄: 木のベースとアイテムレベルを選ぶ (2026-10-22、前は金の指輪 ilvl 82 に固定)。
  一覧はクラフト台と同じ共通の BaseCatalog。アイテムレベルだけ替えるなら木はそのまま、ベースを替えると白紙から (下の箱があれば 1 回確かめる。1 つ戻すで戻せる)
-->
<script setup lang="ts">
import { ref } from "vue";
import BaseCatalog from "../../../components/items/BaseCatalog.vue";
import NumStep from "../../../components/NumStep.vue";
import { craftStage as s } from "../../../state/craft-stage";
import { jaTypeName } from "../../../i18n/item-names-ja";
import { tr } from "../../../i18n/lang";
import { useTree } from "./use-tree";

const emit = defineEmits<{ close: [] }>();
const t = useTree();

const ILVL_MIN = 1;
const ILVL_MAX = 100;
const ilvl = ref<number | null>(t.doc.value.itemLevel);
/** 欄の数を木へ (範囲の外・空欄は入れない) */
function setIlvl(v: number | null): void {
  ilvl.value = v;
  if (v === null || v < ILVL_MIN || v > ILVL_MAX) return;
  t.setBase(t.doc.value.base, Math.round(v));
}
/** 替えると下の箱が消えるベース (確かめ待ち) */
const asking = ref<string | null>(null);
function pick(en: string): void {
  if (en === t.doc.value.base) return;
  if (t.lostOnBase.value > 0) { asking.value = en; return; }
  apply(en);
}
function apply(en: string): void {
  asking.value = null;
  t.setBase(en, t.doc.value.itemLevel);
  emit("close");
}
</script>

<template>
  <div data-tree-base-pick class="flex min-h-0 flex-col gap-3">
    <div class="flex items-center gap-2">
      <b class="flex-1 text-[14px]">{{ tr("ベースとアイテムレベル", "Base and item level") }}</b>
      <button type="button" class="g-btn sm" @click="emit('close')">{{ tr("閉じる", "Close") }}</button>
    </div>
    <label class="flex items-center gap-2 text-[13px]">
      <span class="flex-1">{{ tr("アイテムレベル", "Item level") }}</span>
      <NumStep :model-value="ilvl" integer width="w-20" :placeholder-value="t.doc.value.itemLevel" @update:model-value="setIlvl" />
    </label>
    <!-- ベースを替えると下の箱が消える時だけ、1 回確かめる (札の編集の「下の n 箱が消える」と同じ) -->
    <div v-if="asking" data-tree-base-ask class="rounded-md border border-rose-400/40 bg-rose-500/10 p-2 text-[13px]">
      <p>{{ tr(`${jaTypeName(asking)} の白紙から組み直します。今の木の ${t.lostOnBase.value} 個 (箱・フラクチャー) が消えます (1 つ戻すで戻せます)。`, `Start over from a blank ${asking}. ${t.lostOnBase.value} item(s) of this tree (boxes, fracture) will be removed (Undo brings them back).`) }}</p>
      <div class="mt-2 flex justify-end gap-2">
        <button type="button" class="g-btn sm" @click="asking = null">{{ tr("やめる", "Cancel") }}</button>
        <button type="button" data-tree-base-ok class="g-btn sm" @click="apply(asking!)">{{ tr("替える", "Change") }}</button>
      </div>
    </div>
    <BaseCatalog :data="s.data.value" :selected="t.doc.value.base" @pick="pick" />
  </div>
</template>
