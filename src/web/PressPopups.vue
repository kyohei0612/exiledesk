<!--
  PressPopups.vue — 人が次に押した時に出すポップアップを 1 か所に置く (WebApp.vue に 1 つ)。出す順と「同時に 2 つは出さない」は web/force-update.ts。
  強制更新 (U-35、スイッチ forceUpdate)・初めての人の言語選び (U-37、スイッチ langAsk。これだけ開いてすぐ)・要望への返事 (U-36、スイッチ replyPopup)
-->
<script setup lang="ts">
import ForceUpdateAsk from "./ForceUpdateAsk.vue";
import ReplyAsk from "./ReplyAsk.vue";
import LangAsk from "./LangAsk.vue";
import { flag } from "./release-flags";
import { FORCE_ON } from "./force-update";
import { REPLY_POPUP } from "../state/feedback-replies";
</script>

<template>
  <ForceUpdateAsk v-if="FORCE_ON" />
  <!-- 言語選び (U-37、スイッチ langAsk) は開いてすぐ。出している間は更新・返事を出さない -->
  <LangAsk v-if="flag('langAsk')" />
  <ReplyAsk v-if="REPLY_POPUP" />
</template>
