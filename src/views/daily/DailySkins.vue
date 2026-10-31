<!--
  DailySkins.vue — 皮の見比べ (?page=daily&q=skins、D-60a)。皮の表の全部を同じ木の見本に当てる。数字は見本。
  文字の濃さが足りない皮は印を出し、日替わりから外れる
-->
<script setup lang="ts">
import { tr } from "../../i18n/lang";
import { SKIN_MIN, SKINS, skinContrast, skinVars } from "./skin/skin";

const BOXES = [
  { x: 96, y: 4, t: () => tr("スタート", "Start"), m: [["fr", "最大ライフ", "Life"]] },
  { x: 8, y: 92, t: () => tr("当たり", "Hit"), m: [["fr", "最大ライフ", "Life"], ["ok", "火耐性", "Fire Res"]] },
  { x: 184, y: 92, t: () => tr("外れ", "Miss"), m: [["fr", "最大ライフ", "Life"], ["no", "外れ MOD", "Junk mod"]] },
] as const;
const emit = defineEmits<{ pick: [string] }>();
</script>

<template>
  <div data-daily-skin-grid class="daily-skin-grid">
    <button v-for="k in SKINS" :key="k.id" type="button" class="daily-skin-card" :style="skinVars(k)" :data-skin-card="k.id" @click="emit('pick', k.id)">
      <span class="daily-skin-head"><b>{{ tr(k.ja, k.en) }}</b><span class="daily-skin-time">41:18</span></span>
      <span class="daily-fuse"><i style="--fuse: 0.69" /></span>
      <span class="daily-skin-tree">
        <svg class="absolute inset-0" width="100%" height="100%"><path d="M144 58V76H56V92M144 76H232V92" fill="none" stroke="var(--skin-line)" stroke-width="2" /></svg>
        <span v-for="b in BOXES" :key="b.x" class="daily-skin-box" :style="{ left: `${b.x}px`, top: `${b.y}px` }">
          <em>{{ b.t() }}</em>
          <span v-for="m in b.m" :key="m[1]" :class="`m-${m[0]}`">{{ tr(m[1], m[2]) }}</span>
        </span>
      </span>
      <small v-if="skinContrast(k) < SKIN_MIN" data-skin-weak class="daily-skin-weak">{{ tr(`字が薄い ${skinContrast(k).toFixed(1)}`, `Low contrast ${skinContrast(k).toFixed(1)}`) }}</small>
    </button>
  </div>
</template>
