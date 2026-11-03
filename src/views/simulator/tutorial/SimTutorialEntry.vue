<!--
  SimTutorialEntry.vue — シミュのベース選び (?page=sim-base) のチュートリアルの入口 (2026-10-26 夜オーナー「初めても 2 回目以降もベースのどこかにチュートリアルを表示」)。
  段の札の右、「レシピ」の隣の目立たないボタン 1 つ (11-03 オーナー「チュートリアル目立たせなくていいしなんならチュートリアルボタン１つでよさそう」、前は金の帯)。
  押すと不在のアミュレット (✦ スペル +3 のフラクチャー済み) の木を開いて案内を始める (use-sim-tutorial)。中身の説明はホバーの title に。
  PC (1280 以上) だけ出す (11-01 オーナー「あれもPCばんだけだな仕組み的に」、tutorial.md T-23)。開発中はスイッチ simTutorial の下
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
  <button v-if="on" type="button" data-tut-entry data-tut-start class="g-btn sm shrink-0 max-md:hidden"
    :title="tr(`${jaTypeName(TUT_BASE)} (フラクチャー済み) から作る。押す所が光るので、順に押していくと完成まで組めて 100 人回せます`, `Craft from a fractured ${TUT_BASE}. Click where it glows, step by step, to build the route to the finished item and run it 100 times`)"
    @click="startTutorial">{{ tr("チュートリアル", "Tutorial") }}</button>
</template>
