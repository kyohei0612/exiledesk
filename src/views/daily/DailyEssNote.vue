<!--
  DailyEssNote.vue — 完成形のカードの下の注意書き「エッセンスで代用可」(D-37e3、スイッチ dailyEssNote)。
  完成の判定は MOD の種類と段だけで付けた手を問わない (D-35b) ので、エッセンスで付けた同じ MOD も完成になる事を知らせる。
  共通のカードの部品は触らず、デイリーの側でカードの下に置く (始め方・フラクチャーの画面、木の右の欄、お題のページ)。見た目は始め方の窓の注意書き (D-37j) と同じ金の縦線の枠。
  字は判定に合わせる: 値の下の端で比べる判定 (D-35b ⑤、スイッチ dailyLowHit) が入っている時は、合金も入れて「値の下限」の言い方
-->
<script setup lang="ts">
import { tr } from "../../i18n/lang";
import { flag } from "../../web/release-flags";
</script>

<template>
  <p v-if="flag('dailyEssNote')" class="daily-ess-note" data-daily-ess-note role="note">
    <template v-if="flag('dailyLowHit')"><b>{{ tr("エッセンス・合金で代用可。", "Essences and Alloys are allowed.") }}</b>{{ tr("同じ MOD なら、値の下限がお題の段の下限以上で完成になります。", " The same mod counts when its minimum value is at least the minimum of the required tier.") }}</template>
    <template v-else><b>{{ tr("エッセンスで代用可。", "Essences are allowed.") }}</b>{{ tr("同じ MOD がエッセンスにある時は、エッセンスで付けても完成になります。", " If an Essence gives the same mod, applying it that way also counts.") }}</template>
  </p>
</template>
