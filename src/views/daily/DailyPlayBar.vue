<!--
  DailyPlayBar.vue — 挑戦の帯の下の段 (D-37、オーナー 11-05 の B = 2 段)。狙いを全部並べたまま + MOD 一覧・諦める・一覧へ戻る。
  MOD 一覧は共通の表 (ModTable) をお題のベース・アイテムレベルの何も付いていない品で開く (D-37d)。諦めるは確かめの窓から (D-37b)
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { tr } from "../../i18n/lang";
import { craftStage as s } from "../../state/craft-stage";
import { freshItem, tierRankLabel } from "../../services/craft-stage/engine";
import ModalShell from "../../components/ui/ModalShell.vue";
import ModTable from "../../components/for-share/mod-list/ModTable.vue";
import { goDaily } from "./daily-open";
import type { DailyAim } from "./daily-api";
import { useTree } from "../simulator/tree/use-tree";
import DailyGiveUpAsk from "./DailyGiveUpAsk.vue";

/** side = 木の右の列の中 (D-37i)。狙いの行は出さずボタンだけ */
const props = defineProps<{ id: string; base: string; ilvl: number; aims: readonly DailyAim[]; fractured?: string; ended: boolean; side?: boolean }>();
/** 狙いの字は木・フラクチャー選びと同じ (段の幅は「以上」の幅) */
const t = useTree();
const aimText = (a: DailyAim): string => t.aimShort({ modId: a.modId, tier: a.tier });
const listOpen = ref(false);
const asking = ref(false);
/** 何も付いていない品 (MOD 一覧の中身、D-37d) */
const blank = computed(() => { const d = s.data.value; try { return d ? freshItem(d, props.base, props.ilvl, "rare") : null; } catch { return null; } });
</script>

<template>
  <div class="daily-band2" data-daily-band2>
    <span v-if="!side" class="daily-band2-head">{{ tr("狙い", "Targets") }}</span>
    <ul v-if="!side" class="daily-aims" data-daily-play-aims>
      <li v-for="a in aims" :key="a.modId" :class="a.modId === fractured ? 'frac' : ''">{{ aimText(a) }} <small>{{ tierRankLabel(a.tier) }}{{ a.modId === fractured ? tr("・フラクチャー", " · fractured") : "" }}</small></li>
    </ul>
    <div class="daily-band2-btns">
      <button type="button" class="g-btn sm" data-daily-modlist @click="listOpen = true">{{ tr("MOD 一覧", "Mod list") }}</button>
      <button v-if="!ended" type="button" class="g-btn sm" data-daily-giveup @click="asking = true">{{ tr("諦める", "Give up") }}</button>
      <button type="button" class="g-btn sm" data-daily-leave :title="tr('時間は止まらない', 'The clock keeps running')" @click="goDaily({ view: 'list' })">{{ tr("一覧へ戻る", "Back to the list") }}</button>
    </div>

    <ModalShell :open="listOpen" :title="tr('このベースに付く MOD (何も付いていない状態)', 'Mods for this base (nothing attached)')" width="w-[1100px] max-w-[96vw]" @close="listOpen = false">
      <div data-daily-modlist-body class="p-2"><ModTable v-if="blank" overlay :data="s.data.value" :item="blank" /></div>
    </ModalShell>
    <DailyGiveUpAsk :id="id" :open="asking" @close="asking = false" @done="asking = false; goDaily({ view: 'list' })" />
  </div>
</template>
