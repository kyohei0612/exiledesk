<!--
  SimBuildPanel.vue — シミュレーターの入口 ① 完成品を作る (2026-10-22 オーナー「完成形をまず作る。エミュのエンジンをフル稼働で、まんま移植だけど、
  カレンシーで付けずに MOD を選んでもらう。これでエミュからシミュにさっと行けるようになる」。設計 docs/org/simulator/notes/2026-10-22-entry-design.md)。
  クラフト台の棚の所に出す。付ける = 下の MOD 一覧 (クラフト台と同じ StageModList) の段の表の「付ける」、外す = アイテムのカードの ×。
  付けられる / 付けられないの判定はエンジンのまま。できた完成品の MOD を欲しい MOD にしてクラフトの道 (ツリー) へ
-->
<script setup lang="ts">
import { computed } from "vue";
import { craftStage as s } from "../../../state/craft-stage";
import { modText, tr } from "../../../i18n/lang";
import { openTreePage } from "../../../web/page";
import { useTree } from "../tree/use-tree";
import type { Aim } from "../../../services/simulator/tree/tree-model";
import type { StageMod } from "../../../services/craft-stage/engine";
import { simBuild } from "../../../state/simulator/build-state";

const mods = computed<StageMod[]>(() => (s.item.value ? [...s.item.value.prefixes, ...s.item.value.suffixes] : []));
/** 完成品の MOD → 欲しい MOD (段は T1 が一番良い数え方。未発現は数えない) */
const aims = computed<Aim[]>(() => {
  const d = s.data.value;
  if (!d) return [];
  return mods.value.filter((m) => !m.unrevealed).map((m) => ({ modId: m.modId, tier: (d.mods.get(m.modId)?.tiers.length ?? m.tierIndex + 1) - m.tierIndex }));
});
function toTree(): void {
  const it = s.item.value;
  if (!it) return;
  useTree().startTreeWith(it.base, s.itemLevel.value, aims.value);
  simBuild.value = false;
  openTreePage();
}
const mark = (m: StageMod): string => [m.fractured ? tr("フラクチャー", "Fractured") : "", m.desecrated ? tr("冒涜", "Desecrated") : "", m.unrevealed ? tr("未発現", "Unrevealed") : ""].filter(Boolean).join(" · ");
</script>

<template>
  <section data-sim-build class="g-panel relative p-2 text-[13px]">
    <p class="g-sec-head">
      <b class="g-sec-title">{{ tr("完成品を作る", "Build the finished item") }}</b>
      <span class="g-sec-sub">{{ tr("MOD を選んで付ける (カレンシーは使わない)", "Pick mods to add (no currency)") }}</span>
    </p>
    <p class="mb-2 text-[12px] leading-snug text-[var(--exile-color-text-secondary)]">{{ tr("下の MOD 一覧で MOD を押して段の表を開き「付ける」(普通・フラクチャー・冒涜・エッセンス)。外すのはアイテムの MOD の ×。付けられるかはクラフト台と同じ決まり", "Open a mod's tier table in the list below and press “Add” (normal / fractured / desecrated / essence). Remove with the × on the item's mod. Same rules as the craft stage") }}</p>
    <div class="space-y-1">
      <div v-for="m in mods" :key="m.modId + m.tierIndex" data-sim-build-mod class="flex min-w-0 items-center gap-2 rounded bg-black/40 px-2 py-1">
        <span class="w-9 shrink-0 text-[12px] font-bold tabular-nums" :class="m.side === 'prefix' ? 'text-[#e0846a]' : 'text-[#6aa8e8]'">{{ m.side === "prefix" ? "P" : "S" }}{{ (m.tierName ?? "").replace(/^T/, "") }}</span>
        <span class="min-w-0 flex-1 truncate text-[#c8c8ff]" :title="modText(m)">{{ modText(m) }}</span>
        <span v-if="mark(m)" class="shrink-0 rounded-sm bg-white/10 px-1 text-[10px] opacity-80">{{ mark(m) }}</span>
      </div>
      <p v-if="!mods.length" class="py-1 text-[12px] opacity-60">{{ tr("まだ MOD が無い", "No mods yet") }}</p>
    </div>
    <div class="mt-2 flex flex-wrap items-center gap-1.5">
      <button type="button" class="g-btn sm max-md:min-h-10" :disabled="!mods.length && !s.log.value.length" @click="s.reset()">{{ tr("白に戻す", "Reset to white") }}</button>
      <button type="button" data-sim-build-go class="g-btn-red ml-auto min-h-10 px-3 text-[14px] max-md:w-full" :disabled="!aims.length" :title="tr('この MOD を欲しい MOD にして、このベースのクラフトの道 (ツリー) を開く', 'Open the craft route tree for this base with these mods as wanted mods')" @click="toTree">{{ tr("この完成品でシミュレーターへ →", "Simulate this item →") }}</button>
    </div>
  </section>
</template>
