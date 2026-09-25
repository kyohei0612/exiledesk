<script setup lang="ts">
/**
 * ItemCard.vue — ゲームのアイテム画面そっくりの絵 (日本語) (2026-09-26)
 *
 * オーナー:「POE2 のリング開いた時に出る画面みたいなリングの日本語 MOD 版。現状どういう完成図なのかとか、
 * 1 から作る人のリングでステップごとに何の MOD ができるのか最新手順の奴を表示し続ければ便利」
 * 「ベース名もしっかり日本語で、品質やらカタリストなら POE2 表現でマナモッド品質とか付けて」
 * 「あまりにも UI ブス」→ ゲームの意匠に寄せた: 金の二重枠、黒〜濃茶のグラデ見出し、セリフ体、端が消える区切り線。
 * MOD の小見出し (『プレフィックス MOD "Zaffre" (T1) — マナ』) はゲームの Alt 表示と同じで、`detail` の時だけ。
 * 中身は [[item-card-data.ts]] が作る (完成図 = 狙い、STEP の時の形 = SimState)。ここは見た目だけ
 */
import type { CardMod } from "./item-card-data";

defineProps<{
  name?: string | null;
  base: string;
  ilvl?: number | null;
  quality?: number | null;
  qualityLabel?: string | null;
  implicits?: readonly string[];
  mods: readonly CardMod[];
  /** 小見出し (段・タグ) を出す (ゲームの Alt 表示) */
  detail?: boolean;
  footer?: string | null;
}>();
/** MOD の色 (ゲームの青が基本。固定 / 冒涜 / クラフト / 外れ は分ける) */
const COLOR: Record<NonNullable<CardMod["tone"]>, string> = {
  normal: "text-[#8888ff]",
  fixed: "text-[#a29160]",
  desecrated: "text-[#c58cff]",
  crafted: "text-[#b4b4ff]",
  tree: "text-[#e879f9]",
  junk: "text-[#c0504d]",
  keep: "text-[#d9b96a]",
  cannot: "text-[#c0504d]",
};
</script>

<template>
  <div class="poe-card select-text text-center">
    <!-- 見出し (レアは黄色。金の線で挟む) -->
    <div class="poe-head">
      <span class="poe-orn poe-orn-l" /><span class="poe-orn poe-orn-r" />
      <p v-if="name" class="poe-name">{{ name }}</p>
      <p class="poe-name" :class="name ? 'poe-base' : ''">{{ base }}</p>
    </div>
    <div class="px-4 pb-2.5 pt-2">
      <p v-if="quality != null && quality > 0" class="poe-dim">{{ qualityLabel ?? "品質" }}: <span class="poe-val">+{{ quality }}%</span></p>
      <p v-if="ilvl != null" class="poe-dim">アイテムレベル: <span class="poe-white">{{ ilvl }}</span></p>
      <template v-if="implicits?.length">
        <div class="poe-sep" />
        <p v-for="x in implicits" :key="x" class="poe-mod text-[#8888ff]">{{ x }}</p>
      </template>
      <div class="poe-sep" />
      <p v-if="!mods.length" class="poe-dim">MOD なし</p>
      <div v-for="m in mods" :key="m.key" class="poe-row" :class="m.fixed ? 'poe-fixed' : ''">
        <p v-if="detail && m.head" class="poe-sub">{{ m.head }}</p>
        <p class="poe-mod" :class="COLOR[m.tone ?? 'normal']">{{ m.text }}</p>
      </div>
      <template v-if="footer">
        <div class="poe-sep" />
        <p class="poe-dim text-[11px]">{{ footer }}</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* ゲームのアイテム画面の意匠。フォントは明朝 (ゲームは Fontin) */
.poe-card {
  font-family: "Noto Serif JP", "Yu Mincho", "YuMincho", "Hiragino Mincho ProN", Georgia, serif;
  background: linear-gradient(180deg, #0d0d10 0%, #050506 100%);
  border: 1px solid #6a5630;
  box-shadow: inset 0 0 0 1px #000, inset 0 0 0 2px #2a2214, 0 0 0 1px #000, 0 6px 24px rgba(0, 0, 0, 0.7);
  border-radius: 3px;
  font-size: 13.5px;
  line-height: 1.45;
}
.poe-head {
  position: relative;
  padding: 7px 24px 6px;
  background: linear-gradient(180deg, #3d3116 0%, #221b0c 55%, #0f0c05 100%);
  border-bottom: 1px solid #8a7040;
  box-shadow: inset 0 1px 0 #a8895a, inset 0 -1px 0 #3a2f18;
}
.poe-orn { position: absolute; top: 50%; width: 14px; height: 14px; margin-top: -7px; border: 1px solid #b09660; transform: rotate(45deg); background: radial-gradient(#5a4622, #1a1409); }
.poe-orn-l { left: 6px; }
.poe-orn-r { right: 6px; }
.poe-name { color: #ffff77; font-weight: 700; font-size: 16px; letter-spacing: 0.04em; text-shadow: 0 0 6px rgba(255, 255, 119, 0.25); }
.poe-base { font-size: 14px; font-weight: 600; }
.poe-dim { color: #7f7f7f; }
.poe-val { color: #8888ff; }
.poe-white { color: #fff; }
.poe-sep { height: 1px; margin: 6px 0; background: linear-gradient(90deg, transparent, #7a6538 20%, #7a6538 80%, transparent); }
.poe-row { padding: 1px 4px; }
.poe-mod { font-size: 13.5px; }
.poe-sub { color: #8a8a8a; font-size: 10.5px; line-height: 1.2; margin-top: 3px; }
/* 固定 (フラクチャー) は薄い金の帯 */
.poe-fixed { background: linear-gradient(90deg, rgba(162, 145, 96, 0.22), rgba(162, 145, 96, 0.06) 60%, transparent); border-left: 2px solid #a29160; border-radius: 2px; }
</style>
