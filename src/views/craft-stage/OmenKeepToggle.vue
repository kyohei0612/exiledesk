<!--
  OmenKeepToggle.vue — 掛けたお告げを「打っても外さない」の切り替え (2026-10-17 要望 aef329b8
  「お告げの ON・OFF を切り替えられるように。削減のお告げを ON にしながらカオスを連打することが多い」)。
  ON の間は、打った手で使ったお告げも掛けたまま (使った分の費用は毎回足す)。お告げの欄とお告げのタブに同じ物。選んだ値はこの端末に覚える
-->
<script setup lang="ts">
import { watch } from "vue";
import { craftStage as s } from "../../state/craft-stage";
import { tr } from "../../i18n/lang";

const KEY = "exiledesk.craftStage.omenKeep";
try { if (localStorage.getItem(KEY) === "1") s.omenKeep.value = true; } catch { /* 覚えないだけ */ }
watch(s.omenKeep, (v) => { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* 覚えないだけ */ } });
</script>

<template>
  <label data-omen-keep class="inline-flex cursor-pointer select-none items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px]" :class="s.omenKeep.value ? 'border-orange-400/60 bg-orange-500/20 text-orange-100' : 'border-white/15 text-white/60 hover:bg-white/5'" :title="tr('ON の間は、打ってもお告げを外さずに掛けたまま (使った分の費用は毎回足す)', 'While ON, omens stay active after use (their cost is still added each time)')" @click.stop>
    <input v-model="s.omenKeep.value" type="checkbox" class="size-3 accent-orange-500" />
    {{ tr("打ってもお告げを外さない", "Keep omens after use") }}
  </label>
</template>
