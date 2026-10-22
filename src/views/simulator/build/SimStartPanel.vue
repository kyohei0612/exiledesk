<!--
  SimStartPanel.vue — シミュレーターの入口 ② 始め方を決める (2026-10-22 オーナー、設計 docs/org/simulator/notes/2026-10-22-entry-design.md)。
  ① の完成品から「どの MOD をフラクチャーして始めるか」をパターン (タブ「<MOD> スタート」) にし、パターンごとに始めのアイテムを組む:
  カードは ✦ の MOD から始まり、始めから付いている MOD は下の MOD 一覧の「付ける」/ カードの × (① と同じエンジン)、ほかに何でもよい MOD の数。
  「このスタートでツリーへ」で木の始まりの箱へ。どの道で着くか (フラクチャー済みを買う / 4 MOD でフラクチャー / 白から自作) と値段は始まりの箱が比べる
-->
<script setup lang="ts">
import NumStep from "../../../components/NumStep.vue";
import { tr } from "../../../i18n/lang";
import { activePattern, finished, patterns } from "../../../state/simulator/build-state";
import { addPattern, backToBuild, current, fractureChoices, fracturedOf, nameOfMod, patternToTree, removePattern, selectPattern, setRandom } from "./use-build";

const sideCls = (side: string): string => (side === "prefix" ? "text-[#e0846a]" : "text-[#6aa8e8]");
</script>

<template>
  <section data-sim-start class="g-panel relative p-2 text-[13px]">
    <p class="g-sec-head">
      <b class="g-sec-title">{{ tr("始め方を決める", "How to start") }}</b>
      <span class="g-sec-sub">{{ tr("フラクチャーした後の、最初のアイテムの形", "The first item's shape, after the fracture") }}</span>
      <button type="button" data-sim-start-back class="g-btn sm ml-auto max-md:min-h-10" @click="backToBuild">{{ tr("← 完成品に戻る", "← Back to the item") }}</button>
    </p>
    <!-- パターン (フラクチャーする MOD ごと) -->
    <div v-if="patterns.length" class="mb-2 flex flex-wrap gap-1" role="tablist">
      <span v-for="(p, i) in patterns" :key="i" class="inline-flex min-w-0 max-w-full items-center">
        <button type="button" role="tab" data-sim-start-tab :aria-selected="activePattern === i" class="g-tab !min-h-9 min-w-0 max-w-[260px] !px-3 !text-[12px]" :class="activePattern === i ? 'on' : ''" @click="selectPattern(i)"><span class="truncate">✦ {{ fracturedOf(p) ? nameOfMod(fracturedOf(p)!) : "?" }} {{ tr("スタート", "start") }}</span></button>
        <button type="button" class="g-plain shrink-0 px-1 opacity-50 hover:opacity-100" :title="tr('このパターンを消す', 'Delete this pattern')" @click="removePattern(i)">×</button>
      </span>
    </div>
    <!-- ✦ で始める候補 (完成品の MOD) -->
    <div class="mb-2">
      <p class="mb-1 text-[12px] opacity-70">{{ patterns.length ? tr("別の MOD をフラクチャーするパターンを足す", "Add a pattern that fractures another mod") : tr("フラクチャーして始める MOD を選ぶ", "Choose the mod to fracture first") }}</p>
      <div class="flex flex-wrap gap-1">
        <button v-for="m in fractureChoices" :key="m.modId" type="button" data-sim-start-fracture class="g-plain inline-flex min-w-0 max-w-full items-center gap-1 rounded border border-white/10 bg-black/50 px-2 py-1 text-left text-[12px] hover:border-amber-300/60 max-md:min-h-10" @click="addPattern(m)">
          <span class="shrink-0 font-bold" :class="sideCls(m.side)">{{ m.side === "prefix" ? "P" : "S" }}{{ m.tierName.replace(/^T/, "") }}</span>
          <span class="min-w-0 truncate text-[#c8c8ff]">{{ nameOfMod(m) }}</span>
          <span class="shrink-0 text-amber-200">✦ {{ tr("で始める", "start") }}</span>
        </button>
        <span v-if="!fractureChoices.length" class="text-[12px] opacity-60">{{ tr("全部パターンにした", "All mods have a pattern") }}</span>
      </div>
    </div>
    <template v-if="current">
      <p class="mb-1 text-[12px] leading-snug text-[var(--exile-color-text-secondary)]">{{ tr("始めから付いている MOD は下の MOD 一覧の「付ける」、外すのはアイテムの ×。何でもよい MOD (狙いでない MOD) が付いているなら、その数も", "Add mods the start already has with “Add” in the list below, remove with the item's ×. If it also has mods you don't care about, set how many") }}</p>
      <div class="space-y-1">
        <div v-for="m in current.mods" :key="m.modId" data-sim-start-mod class="flex min-w-0 items-center gap-2 rounded bg-black/40 px-2 py-1">
          <span class="w-9 shrink-0 text-[12px] font-bold tabular-nums" :class="sideCls(m.side)">{{ m.side === "prefix" ? "P" : "S" }}{{ m.tierName.replace(/^T/, "") }}</span>
          <span class="min-w-0 flex-1 truncate text-[#c8c8ff]">{{ nameOfMod(m) }}</span>
          <span v-if="m.fractured" class="shrink-0 rounded-sm bg-amber-500/25 px-1 text-[10px] text-amber-100">✦ {{ tr("フラクチャー", "Fractured") }}</span>
          <span v-else-if="finished.some((f) => f.modId === m.modId)" class="shrink-0 rounded-sm bg-white/10 px-1 text-[10px] opacity-80">{{ tr("狙い", "Target") }}</span>
        </div>
      </div>
      <div class="mt-2 flex items-center gap-2">
        <span class="text-[12px] opacity-80">{{ tr("何でもよい MOD", "Don't-care mods") }}</span>
        <NumStep data-sim-start-random :model-value="current.random" integer width="w-20" :placeholder-value="0" @update:model-value="(v) => setRandom(Number(v ?? 0))" />
        <span class="text-[11px] opacity-60">{{ tr("個", "") }}</span>
      </div>
      <p v-if="!fracturedOf(current)" class="mt-1.5 text-[12px] text-amber-200">{{ tr("✦ (フラクチャー) の MOD が無い。カードの MOD を外した時は、上の「✦ で始める」で足し直す", "No ✦ (fractured) mod. If you removed it from the item, add it again with “✦ start” above") }}</p>
      <div class="mt-2 flex flex-wrap items-center gap-1.5">
        <p class="min-w-0 flex-1 text-[11px] opacity-70">{{ tr("どの道でこの形に着くか (フラクチャー済みを買う・4 MOD でフラクチャー・白から自作) と値段は、木の始まりの箱で比べる", "How to reach this shape (buy fractured / fracture a 4-mod / craft from white) and its cost are compared in the tree's start box") }}</p>
        <button type="button" data-sim-start-go class="g-btn-red min-h-10 shrink-0 px-3 text-[14px] max-md:w-full" :disabled="!fracturedOf(current)" @click="patternToTree">{{ tr("このスタートでツリーへ →", "Open the tree with this start →") }}</button>
      </div>
    </template>
  </section>
</template>
