<!--
  HeldOmens.vue — 「○○に掛けられるお告げ」の欄 (2026-10-22 クラフト台から切り出し、オーナー「シミュの表示は全部エンジン軸で、クラフト台を参照させて」)。
  持った物・掛けたお告げ・アイテムは棚の文脈 (useShelf) から取る: クラフト台は既定 (craftStage)、シミュは provideShelf で自分の物を渡すと同じ物が出る。
  お告げのボタン (ShelfButton omen、押すと toggleOmen) + 名前の下の設定 (StageOmenTune) + 横の「MOD 一覧」(mod-list を付けた時だけ、押すと emit modList)。
  持った物に掛けられるお告げが無い時は何も出さない (slot を出すかは呼ぶ側が heldOmensOf で決める)。既定の slot = お告げと同じ並びに足す物 (ツリーの「狙い無し」など、10-22。無ければ今と同じ)。
-->
<script setup lang="ts">
import { computed, watchEffect } from "vue";
import { omenBlock } from "../../../services/craft-stage/engine";
import { tr } from "../../../i18n/lang";
import { nameOf } from "../../../state/craft-stage";
import { useShelf } from "../../../state/for-share/shelf-context";
import ShelfButton from "./ShelfButton.vue";
import StageOmenTune from "./StageOmenTune.vue";
import { heldOmensOf } from "./held-omens";

/** modList: 横に「MOD 一覧」のボタンを出す */
defineProps<{ modList?: boolean }>();
const emit = defineEmits<{ modList: [] }>();
const shelf = useShelf();
const list = computed(() => heldOmensOf(shelf.held.value));
// 掛かっているお告げが、持った物を打てなくする・意味が無い物になったら外す (ボタンは灰色で掛けられない。2026-10-22 オーナー「進行不能」、判定はエンジンの omenBlock)
watchEffect(() => {
  for (const o of list.value) if (shelf.omens.value.includes(o) && omenBlock(shelf.data.value, shelf.item.value, shelf.held.value, shelf.omens.value, o)) shelf.toggleOmen(o);
});
</script>

<template>
  <div v-if="list.length || $slots.default" class="rounded-lg border border-violet-400/25 bg-violet-500/[0.06] p-2" data-held-omens>
    <!-- 横に「MOD 一覧へ」(お告げを選びながら付く MOD を見に行ける。2026-10-11 オーナー「お告げの横にも MOD 一覧へ、楽だ」) -->
    <p class="mb-1 flex items-center gap-2 text-[11px] text-violet-200/80">{{ tr(`${nameOf(shelf.held.value ?? "")} に掛けられるお告げ`, `Omens for ${nameOf(shelf.held.value ?? "")}`) }}<button v-if="modList" type="button" data-rec="mod-list-open" data-rec-part="mod-list-button" class="tbtn-top ml-auto" :title="tr('このベースに付く MOD の一覧へ', 'Go to the mod list')" @click.stop="emit('modList')">{{ tr("MOD 一覧", "Mod list") }}<kbd class="kbd max-md:hidden">Tab</kbd></button></p>
    <div class="flex flex-wrap gap-1.5">
      <div v-for="k in list" :key="k" class="flex flex-col items-center"><ShelfButton :k="k" omen @pick="shelf.toggleOmen($event)" /><StageOmenTune :k="k" /></div>
      <slot />
    </div>
  </div>
</template>

<style scoped>
/* 「MOD 一覧」のボタン: CraftStage の .tbtn-top と同じ見た目 (scoped なのでここにも置く) */
.tbtn-top { display: inline-flex; align-items: center; height: 24px; padding: 0 9px; white-space: nowrap; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 4px; background: rgba(0, 0, 0, 0.35); font-size: 11px; color: rgba(255, 255, 255, 0.82); }
.tbtn-top .kbd { margin-left: 6px; padding: 0 4px; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 3px; font-size: 9.5px; line-height: 14px; opacity: 0.6; }
.tbtn-top:hover { background: rgba(255, 255, 255, 0.08); border-color: rgba(232, 200, 120, 0.55); color: #f3e2b8; }
</style>
