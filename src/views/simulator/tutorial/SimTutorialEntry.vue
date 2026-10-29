<!--
  SimTutorialEntry.vue — シミュのベース選び (?page=sim-base) のチュートリアルの入口 (2026-10-26 夜オーナー「初めても 2 回目以降もベースのどこかにチュートリアルを表示」)。
  いつも出す 1 本の帯。押すと不在のアミュレット (✦ スペル +3 のフラクチャー済み) の木を開いて案内を始める (use-sim-tutorial)。
  スマホの形 (1280 未満、U-53) は木を描かない質問の組み方なので出さない (ブラック 13 代目 案 A)。開発中はスイッチ simTutorial の下
-->
<script setup lang="ts">
import { tr } from "../../../i18n/lang";
import { jaTypeName } from "../../../i18n/item-names-ja";
import { flag } from "../../../web/release-flags";
import { startTutorial } from "./use-sim-tutorial";
import { TUT_BASE } from "./tut-route";

const on = flag("simTutorial");
</script>

<template>
  <div v-if="on" data-tut-entry class="flex min-w-0 items-center gap-3 rounded-lg border border-amber-400/50 bg-amber-500/[0.07] px-3 py-2 max-md:hidden">
    <p class="min-w-0 flex-1 break-words text-[14px]">
      <b class="text-amber-200">{{ tr("チュートリアル", "Tutorial") }}:</b>
      {{ tr(`${jaTypeName(TUT_BASE)} (フラクチャー済み) から作る`, `Craft from a fractured ${TUT_BASE}`) }}
      <span class="block text-[12px] opacity-70">{{ tr("押す所が光るので、順に押していくと完成まで組めて 100 人回せます", "Click where it glows, step by step, to build the route to the finished item and run it 100 times") }}</span>
    </p>
    <button type="button" data-tut-start class="g-btn-red min-h-10 shrink-0 px-4" @click="startTutorial">{{ tr("始める", "Start") }}</button>
  </div>
</template>
