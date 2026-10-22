<!--
  SimBuildPanel.vue — シミュレーターの入口の小さな帯 (2026-10-22 オーナー、設計 docs/org/simulator/notes/2026-10-22-entry-design.md)。
  置き場はクラフト台の棚の上。配置はエミュレーターとまんま同じで、カード・MOD 一覧 (ページの下)・棚はクラフト台の部品のまま (オーナー「独自の UI を表示させなくていい」)。
  ① MOD 決め: MOD 一覧の「付ける」/ カードの × で完成品を組む。6 MOD で自動で次へ (6 未満は「次へ」)。
  ②③ 打つ: 棚のカレンシーを持ってアイテムを押すと、お告げの欄の所に付く MOD の候補 (PathPick.vue)。帯には狙いの一覧 (付いた物はグレー)
-->
<script setup lang="ts">
import { craftStage as s } from "../../../state/craft-stage";
import { modText, tr } from "../../../i18n/lang";
import { buildStage, finished } from "../../../state/simulator/build-state";
import { allHeld, backToBuild, buildCount, held, phase, toPlay, toTree } from "./use-build";
</script>

<template>
  <section v-if="buildStage === 'build'" data-sim-build class="g-panel relative p-2 text-[13px]">
    <p class="g-sec-head">
      <b class="g-sec-title">{{ tr("① 完成品の MOD を決める", "① Choose the finished mods") }}</b>
      <span class="ml-auto tabular-nums opacity-80" data-sim-build-count>{{ buildCount }} / 6</span>
    </p>
    <p class="mb-2 text-[12px] leading-snug text-[var(--exile-color-text-secondary)]">{{ tr("下の MOD 一覧で MOD を押して段の表を開き「付ける」(カレンシーは使わない)。外すのはアイテムの MOD の ×。6 つ付くと次へ進む", "Open a mod's tier table in the list below and press “Add” (no currency). Remove with the × on the item's mod. Moves on when 6 mods are on") }}</p>
    <div class="flex flex-wrap items-center gap-1.5">
      <button type="button" class="g-btn sm max-md:min-h-10" :disabled="!buildCount && !s.log.value.length" @click="s.reset()">{{ tr("白に戻す", "Reset to white") }}</button>
      <button type="button" data-sim-build-go class="g-btn-red ml-auto min-h-10 px-3 text-[14px] max-md:w-full" :disabled="!buildCount" :title="tr('この MOD を狙いにして、カレンシーで道を打つ所へ', 'Use these mods as targets and go on to craft the route with currency')" @click="toPlay">{{ tr("次へ: カレンシーで道を打つ →", "Next: craft the route →") }}</button>
    </div>
  </section>
  <section v-else data-sim-play class="g-panel relative p-2 text-[13px]">
    <p class="g-sec-head">
      <b class="g-sec-title">{{ phase === 2 ? tr("② フラクチャーまでの道", "② Route to the fracture") : tr("③ 完成までの最速の手", "③ Fastest route to done") }}</b>
      <span class="g-sec-sub max-md:hidden">{{ tr("カレンシーを持ってアイテムを押すと、付く MOD を選べる (空打ちも)", "Hold a currency and click the item to choose the mod it adds (or a miss)") }}</span>
      <span class="ml-auto tabular-nums opacity-80">{{ tr(`狙い ${held.filter(Boolean).length}/${finished.length} · ${s.log.value.length} 手`, `targets ${held.filter(Boolean).length}/${finished.length} · ${s.log.value.length} steps`) }}</span>
    </p>
    <div class="flex flex-wrap gap-1.5">
      <span v-for="(m, i) in finished" :key="m.modId" data-sim-target class="inline-flex min-w-0 max-w-full items-center gap-1 rounded border px-1.5 py-0.5 text-[12px]" :class="held[i] ? 'border-white/5 bg-black/20 opacity-40' : 'border-[#c9a96a]/50 bg-[#c9a96a]/10 text-[#c8c8ff]'" :title="held[i] ? tr('付いた', 'On the item') : tr('まだ付いていない', 'Not on yet')">
        <span class="shrink-0 font-bold" :class="m.side === 'prefix' ? 'text-[#e0846a]' : 'text-[#6aa8e8]'">{{ m.side === "prefix" ? "P" : "S" }}{{ m.tier }}</span>
        <span class="min-w-0 truncate">{{ modText(m) }}</span>
        <span v-if="held[i]" class="shrink-0">✓</span>
      </span>
    </div>
    <p v-if="allHeld" data-sim-play-done class="mt-1.5 text-[12px] font-bold text-emerald-200">{{ tr("狙いが全部付いた。この道をツリーへ", "All targets are on. Take this route to the tree") }}</p>
    <div class="mt-2 flex flex-wrap items-center gap-1.5">
      <button type="button" data-sim-play-back class="g-btn sm max-md:min-h-10" @click="backToBuild">{{ tr("← ① MOD 決めに戻る", "← Back to ① mods") }}</button>
      <button type="button" class="g-btn sm max-md:min-h-10" :disabled="!s.log.value.length" @click="s.reset()">{{ tr("白から打ち直す", "Start over from white") }}</button>
      <button type="button" data-sim-play-tree class="g-btn-red ml-auto min-h-10 px-3 text-[14px] max-md:w-full" :disabled="!allHeld" @click="toTree">{{ tr("④ ツリーへ →", "④ To the tree →") }}</button>
    </div>
  </section>
</template>
