<!--
  RevealPanel.vue — クラフトステージの冒涜の発現 (2026-09-27、ADR-001)

  骨で付いた未発現の冒涜 MOD を、候補 3 つから選んで発現する (ゲームの「魂の井戸」と同じ)。選ぶと reveal:N の手になる。
  深淵の残響のお告げを掛けてあれば 1 回だけ引き直せる (引き直した方から選ぶと reveal:N:reroll)。
  候補は次の手の seed で引いてあるので、見せた候補と選んだ手の結果は一致する ([[craft-stage.ts]] の offers)。
-->
<script setup lang="ts">
import { ref, watch } from "vue";
import { craftStage } from "../../state/craft-stage";

const rerolled = ref(false);
watch(() => craftStage.log.value.length, () => (rerolled.value = false));
const left = () => { const it = craftStage.item.value; return it ? [...it.prefixes, ...it.suffixes].filter((m) => m.unrevealed).length : 0; };
const canReroll = () => craftStage.omens.value.includes("OmenofAbyssalEchoes");
function pick(i: number): void {
  craftStage.use(`reveal:${i + 1}${rerolled.value ? ":reroll" : ""}`);
}
</script>

<template>
  <section v-if="craftStage.offers.value && !craftStage.replay.value" class="w-[380px] rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-[12px]">
    <p class="mb-2 flex items-center justify-between">
      <b class="text-rose-200">魂の井戸で発現 — 1 つ選ぶ<span v-if="left() > 1" class="ml-1 font-normal opacity-70">(未発現 残り {{ left() }})</span></b>
      <button
        v-if="canReroll() && !rerolled"
        type="button"
        class="rounded-lg border border-violet-400/60 px-2 py-0.5 text-violet-200 hover:bg-violet-500/15"
        title="深淵の残響のお告げ: 候補を 1 回だけ引き直す"
        @click="rerolled = true"
      >引き直す</button>
      <span v-else-if="rerolled" class="text-violet-200">引き直した候補</span>
    </p>
    <div class="space-y-1.5">
      <button
        v-for="(m, i) in rerolled ? craftStage.offers.value.reroll : craftStage.offers.value.first"
        :key="`${rerolled}-${m.modId}`"
        type="button"
        class="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-left hover:border-rose-300/60 hover:bg-rose-500/10"
        @click="pick(i)"
      >
        <span class="text-mod-desecrated">{{ m.textJa }}</span>
        <span class="shrink-0 text-[10px] opacity-60">{{ m.side === "prefix" ? "プレ" : "サフィ" }} {{ m.tierName }}</span>
      </button>
    </div>
  </section>
</template>
