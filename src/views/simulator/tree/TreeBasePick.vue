<!--
  TreeBasePick.vue — ツリーの右の欄: 木のベースとアイテムレベルを選ぶ (2026-10-22、前は金の指輪 ilvl 82 に固定)。
  一覧はクラフト台と同じ共通の BaseCatalog。アイテムレベルだけ替えるなら木はそのまま、ベースを替えると白紙から (下の箱があれば 1 回確かめる。1 つ戻すで戻せる)
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import BaseCatalog from "../../../components/items/BaseCatalog.vue";
import NumStep from "../../../components/NumStep.vue";
import { craftStage as s } from "../../../state/craft-stage";
import { jaTypeName } from "../../../i18n/item-names-ja";
import { tr } from "../../../i18n/lang";
import { startOf } from "../../../services/simulator/tree/tree-model";
import { useTree } from "./use-tree";

const emit = defineEmits<{ close: [] }>();
const t = useTree();
/** 始まりの MOD の数 (ベースを替えると消える) */
const startMods = computed(() => startOf(t.doc.value).mods.length);
/** 開いたら今のベースのカードを欄の真ん中へ (一覧は片手武器から始まり、指輪まで送らないと見えない。上の題とアイテムレベルは貼り付けてある) */
const root = ref<HTMLElement | null>(null);
onMounted(() => requestAnimationFrame(() => requestAnimationFrame(() => {
  root.value?.querySelector(`[data-rec="base:${CSS.escape(t.doc.value.base)}"]`)?.scrollIntoView({ block: "center" });
})));

const ILVL_MIN = 1;
const ILVL_MAX = 100;
const ilvl = ref<number | null>(t.doc.value.itemLevel);
/** 欄の数を木へ (範囲の外・空欄は入れない) */
function setIlvl(v: number | null): void {
  ilvl.value = v;
  if (v === null || v < ILVL_MIN || v > ILVL_MAX) return;
  if (t.doc.value.ilvlFit) t.setFit(false); // 手で入れたら適正から外れる
  t.setBase(t.doc.value.base, Math.round(v));
}
/** 適正に戻す (狙いの段が全部付く一番低いレベルに自動で合わせる) */
function useFit(): void { t.setFit(true); ilvl.value = t.doc.value.itemLevel; }
/** 替えると下の箱が消えるベース (確かめ待ち) */
const asking = ref<string | null>(null);
function pick(en: string): void {
  if (en === t.doc.value.base) return;
  if (t.lostOnBase.value > 0 || startMods.value) { asking.value = en; return; }
  apply(en);
}
function apply(en: string): void {
  asking.value = null;
  t.setBase(en, t.doc.value.itemLevel);
  emit("close");
}
</script>

<template>
  <!-- 高さは中身なり (min-h-0 で欄の高さに縮めると、上の sticky が根の箱の外へ出られない) -->
  <div ref="root" data-tree-base-pick class="flex shrink-0 flex-col gap-3">
    <!-- 題・アイテムレベル・確かめは欄の上に貼り付ける (一覧を下に送っても見える。欄の余白 p-3 の分を覆う) -->
    <div class="sticky -top-3 z-10 -mx-3 -mt-3 flex flex-col gap-3 bg-[#16130f] px-3 pb-2 pt-3 shadow-[0_6px_12px_rgba(0,0,0,0.5)]">
      <div class="flex items-center gap-2">
        <b class="flex-1 text-[14px]">{{ tr("ベースとアイテムレベル", "Base and item level") }}</b>
        <button type="button" class="g-btn sm" @click="emit('close')">{{ tr("閉じる", "Close") }}</button>
      </div>
      <label class="flex items-center gap-2 text-[13px]">
        <span class="flex-1">{{ tr("アイテムレベル", "Item level") }}<span v-if="t.doc.value.ilvlFit" class="ml-1 text-[12px] text-amber-200">{{ tr(`${t.doc.value.itemLevel} (適正)`, `${t.doc.value.itemLevel} (fit)`) }}</span></span>
        <button type="button" data-tree-ilvl-fit class="g-tab !min-h-[28px] !px-2.5 !text-[12px]" :class="t.doc.value.ilvlFit ? 'on' : ''" :title="tr('狙いの MOD の段が全部付く一番低いレベルに自動で合わせる (狙いを足すたびに変わる)', 'Follow the lowest level where every target tier can roll (updates as you add targets)')" @click="useFit">{{ tr("適正", "Fit") }}</button>
        <NumStep :model-value="t.doc.value.ilvlFit ? t.doc.value.itemLevel : ilvl" integer width="w-20" :placeholder-value="t.doc.value.itemLevel" @update:model-value="setIlvl" />
      </label>
      <!-- ベースを替えると下の箱が消える時だけ、1 回確かめる (札の編集の「下の n 箱が消える」と同じ) -->
      <div v-if="asking" data-tree-base-ask class="rounded-md border border-rose-400/60 bg-[#2a1416] p-2 text-[13px] shadow-[0_6px_16px_rgba(0,0,0,0.6)]">
        <p>{{ tr(`${jaTypeName(asking)} の白紙から組み直します。今の木 (箱 ${t.lostOnBase.value} 個${startMods ? "・始まりの MOD" : ""}) が消えます (1 つ戻すで戻せます)。`, `Start over from a blank ${asking}. This tree (${t.lostOnBase.value} box(es)${startMods ? ", starting mods" : ""}) will be removed (Undo brings it back).`) }}</p>
        <div class="mt-2 flex justify-end gap-2">
          <button type="button" class="g-btn sm" @click="asking = null">{{ tr("やめる", "Cancel") }}</button>
          <button type="button" data-tree-base-ok class="g-btn sm" @click="apply(asking!)">{{ tr("替える", "Change") }}</button>
        </div>
      </div>
    </div>
    <BaseCatalog :data="s.data.value" :selected="t.doc.value.base" @pick="pick" />
  </div>
</template>
