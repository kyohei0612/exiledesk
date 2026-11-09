<!--
  DailyPlayBar.vue — 挑戦の帯のボタン (D-37・D-37i、11-09 にお題の名前の右へ移した)。レシピに保存 (木を開いた後)・MOD 一覧・諦める・一覧へ戻る。
  MOD 一覧は共通の表 (ModTable) をお題のベース・アイテムレベルの何も付いていない品で開く (D-37d)。諦めるは確かめの窓から (D-37b)
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { tr } from "../../i18n/lang";
import { craftStage as s } from "../../state/craft-stage";
import { freshItem } from "../../services/craft-stage/engine";
import ModalShell from "../../components/ui/ModalShell.vue";
import ModTable from "../../components/for-share/mod-list/ModTable.vue";
import { goDaily } from "./daily-open";
import type { DailyAim } from "./daily-api";
import DailyGiveUpAsk from "./DailyGiveUpAsk.vue";
import DailySaveRecipe from "./DailySaveRecipe.vue";
import type { DailyTopic } from "./daily-api";

/** tree = 木を開いた後 (「レシピに保存」を出す、D-36b) */
const props = defineProps<{ id: string; base: string; ilvl: number; aims: readonly DailyAim[]; fractured?: string; ended: boolean; tree?: boolean; topic?: DailyTopic; /** 開発版の見本 (dev=giveup): 諦めるの窓を開いて出す */ devGiveUp?: boolean; /** 開発版の見本 (?dev=): 諦めてもサーバーに送らない */ dev?: boolean }>();
const listOpen = ref(false);
const asking = ref(!!props.devGiveUp);
/** 何も付いていない品 (MOD 一覧の中身、D-37d) */
const blank = computed(() => { const d = s.data.value; try { return d ? freshItem(d, props.base, props.ilvl, "rare") : null; } catch { return null; } });
</script>

<template>
  <div class="daily-band2" data-daily-band2>
    <!-- 狙いの文の札は出さない (始め方・フラクチャーの画面の完成形のカードで見える、D-37l) -->
    <div class="daily-band2-btns">
      <DailySaveRecipe v-if="tree && topic" :topic="topic" />
      <button type="button" class="g-btn sm" data-daily-modlist @click="listOpen = true">{{ tr("MOD 一覧", "Mod list") }}</button>
      <!-- 木を開いた後の「諦める」は完成形のカードの下 (DailyPlay、D-37m 11-10)。帯に残すのはフラクチャーを選ぶ画面だけ (右の欄が無い) -->
      <button v-if="!ended && !tree" type="button" class="g-btn sm" data-daily-giveup @click="asking = true">{{ tr("諦める", "Give up") }}</button>
      <button type="button" class="g-btn sm" data-daily-leave :title="tr('時間は止まらない', 'The clock keeps running')" @click="goDaily({ view: 'list' })">{{ tr("一覧へ戻る", "Back to the list") }}</button>
    </div>

    <ModalShell :open="listOpen" :title="tr('このベースに付く MOD (何も付いていない状態)', 'Mods for this base (nothing attached)')" width="w-[1100px] max-w-[96vw]" @close="listOpen = false">
      <div data-daily-modlist-body class="p-2"><ModTable v-if="blank" overlay :data="s.data.value" :item="blank" /></div>
    </ModalShell>
    <DailyGiveUpAsk :id="id" :open="asking" :dev="dev" @close="asking = false" @done="asking = false; goDaily({ view: 'list' })" />
  </div>
</template>
