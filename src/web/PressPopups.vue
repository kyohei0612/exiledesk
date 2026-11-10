<!--
  PressPopups.vue — 人が次に押した時に出すポップアップを 1 か所に置く (WebApp.vue に 1 つ)。出す順と「同時に 2 つは出さない」は web/force-update.ts。
  強制更新 (U-35、スイッチ forceUpdate) と 要望への返事 (U-36、スイッチ replyPopup)
-->
<script setup lang="ts">
import ForceUpdateAsk from "./ForceUpdateAsk.vue";
import ReplyAsk from "./ReplyAsk.vue";
import { FORCE_ON } from "./force-update";
import { REPLY_POPUP } from "../state/feedback-replies";
</script>

<template>
  <ForceUpdateAsk v-if="FORCE_ON" />
  <ReplyAsk v-if="REPLY_POPUP" />
</template>
