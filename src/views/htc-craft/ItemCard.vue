<script setup lang="ts">
/**
 * ItemCard.vue — ゲームのアイテム画面そっくりの絵 (日本語) (2026-09-26)
 *
 * オーナー:「POE2 のリング開いた時に出る画面みたいなリングの日本語 MOD 版。現状どういう完成図なのかとか、
 * 1 から作る人のリングでステップごとに何の MOD ができるのか最新手順の奴を表示し続ければ便利」
 * 「ベース名もしっかり日本語で、品質やらカタリストなら POE2 表現でマナモッド品質とか付けて」
 * 中身は [[item-card-data.ts]] が作る (完成図 = 狙い、STEP の時の形 = SimState)。ここは見た目だけ
 */
import type { CardMod } from "./item-card-data";

defineProps<{
  /** 名前 (レアの名前。無ければベースだけ) */
  name?: string | null;
  base: string;
  ilvl?: number | null;
  /** 品質 (%) と、その表記 (「品質 (マナモッド)」。無ければ「品質」) */
  quality?: number | null;
  qualityLabel?: string | null;
  implicits?: readonly string[];
  mods: readonly CardMod[];
  /** 下の一言 (「STEP 3 の時」など) */
  footer?: string | null;
}>();
/** MOD の色 (ゲームの青が基本。固定 / 冒涜 / クラフト / 外れ は分ける) */
const COLOR: Record<NonNullable<CardMod["tone"]>, string> = {
  normal: "text-[#8f8fff]",
  fixed: "text-[#a29160]",
  desecrated: "text-[#c58cff]",
  crafted: "text-[#b4b4ff]",
  tree: "text-[#e879f9]",
  junk: "text-rose-400/80",
  keep: "text-amber-200/90",
  cannot: "text-rose-300",
};
</script>

<template>
  <div class="item-card select-text rounded border border-[#4a4230] bg-[#08080a]/95 text-center text-[13px] leading-snug shadow-[0_0_18px_rgba(0,0,0,0.6)]">
    <!-- 見出し (レアは黄色) -->
    <div class="rounded-t border-b border-[#4a4230] bg-gradient-to-b from-[#3a3120] to-[#1c1810] px-3 py-1.5">
      <p v-if="name" class="text-[15px] font-bold tracking-wide text-[#ffff77]">{{ name }}</p>
      <p class="font-bold text-[#ffff77]" :class="name ? '' : 'text-[15px]'">{{ base }}</p>
    </div>
    <div class="px-3 py-1.5">
      <!-- 品質 / アイテムレベル -->
      <p v-if="quality != null && quality > 0" class="text-[#7f7f7f]">{{ qualityLabel ?? "品質" }}: <span class="text-[#8f8fff]">+{{ quality }}%</span></p>
      <p v-if="ilvl != null" class="text-[#7f7f7f]">アイテムレベル: <span class="text-white">{{ ilvl }}</span></p>
      <!-- 暗黙 -->
      <template v-if="implicits?.length">
        <hr class="my-1.5 border-[#3a3428]" />
        <p v-for="x in implicits" :key="x" class="text-[#8f8fff]">{{ x }} <span class="text-[10px] text-[#7f7f7f]">(暗黙)</span></p>
      </template>
      <!-- MOD (プレ → サフィ) -->
      <hr class="my-1.5 border-[#3a3428]" />
      <p v-if="!mods.length" class="text-[#7f7f7f]">MOD なし (ノーマル)</p>
      <div v-for="m in mods" :key="m.key" class="py-0.5" :class="m.fixed ? 'rounded bg-[#2a2415]/70' : ''">
        <p v-if="m.head" class="text-[10.5px] text-[#7f7f7f]">{{ m.head }}</p>
        <p :class="COLOR[m.tone ?? 'normal']">
          <span v-if="m.fixed" class="mr-1 rounded bg-[#a29160]/30 px-1 text-[10px] text-[#e8d9a8]">固定</span>{{ m.text }}
        </p>
      </div>
      <template v-if="footer">
        <hr class="my-1.5 border-[#3a3428]" />
        <p class="text-[11px] text-[#9a9a9a]">{{ footer }}</p>
      </template>
    </div>
  </div>
</template>
