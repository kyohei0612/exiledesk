<!--
  UniqueHoverCard.vue — ユニーク装備価格推移の名前にカーソルを乗せた時のカード (2026-09-26)

  オーナー:「カーソルホバーでそのアイテムの画像をちゃんとゲーム内のホバーと同じで、アイテム画像と MOD の効果を表示させて。
  MOD が変わるところは伏字でもなんでもおｋ」「英語混在してて分かりづらい。クライアントのデータベースにのっとって日本語に全て訳して」
  「武器なのか防具なのか、アミュレットなのかセプターなのかも」。
  枠と位置決めは [[GameItemCard.vue]] (カレンシーランキングと共通)。MOD 文の下線 (キーワード) からさらに説明を開ける ([[RichText.vue]])。文面の日本語は [[unique-mod-ja.ts]]。
  数字の幅は「(100-150)」のまま出す。「どれかが付く」行 (poe.ninja の optional) は薄く出す。
  防御値の見出しはゲームの MOD 文に出てくる語だけ日本語にする (確かめられない語は英語のまま)。
-->
<script setup lang="ts">
import { computed, onMounted } from "vue";
import GameItemCard from "../decor/GameItemCard.vue";
import RichText from "../decor/RichText.vue";
import { jaItemClass, jaUniqueText, loadUniqueHoverDict } from "../../services/mods/unique-mod-ja";
import { stripRichTextMarkers } from "../../services/mods/normalize";
import { NINJA_UNIQUE_KINDS } from "../../api/ninja-economy";
import type { UniqueRow } from "../../views/unique-trend/useUniqueTrend";

const props = defineProps<{ row: UniqueRow | null; x: number; y: number; layerKey: number; pinned: boolean; z: number }>();

onMounted(() => void loadUniqueHoverDict());

/** 防御値・要求の見出し (ゲームの MOD 文で使われている語) */
const LABEL: Record<string, string> = {
  "Energy Shield": "エナジーシールド",
  Armour: "アーマー",
  "Evasion Rating": "回避力",
  "Runic Ward": "ルーンワード",
  "Block chance": "ブロック率",
  "Chance to Block": "ブロック率",
  "Physical Damage": "物理ダメージ",
  "Critical Hit Chance": "クリティカルヒット率",
  Spirit: "スピリット",
  Level: "レベル",
  Str: "筋力",
  Dex: "器用さ",
  Int: "知性",
  Strength: "筋力",
  Dexterity: "器用さ",
  Intelligence: "知性",
};
/** 「見出し: 値」を日本語の見出しに */
function labelLine(text: string): { label: string; value: string } {
  const plain = stripRichTextMarkers(text);
  const i = plain.indexOf(": ");
  if (i < 0) return { label: "", value: jaUniqueText(text) };
  const en = plain.slice(0, i);
  return { label: LABEL[en] ?? en, value: plain.slice(i + 2) };
}

/** 種類 (「武器 · セプター」) */
const kindLine = computed(() => {
  const r = props.row;
  if (!r) return "";
  const group = NINJA_UNIQUE_KINDS.find((k) => k.kind === r.kind)?.ja ?? "";
  const cls = jaItemClass(r.baseEn);
  return [group, cls].filter(Boolean).join(" · ");
});
const properties = computed(() => (props.row?.hover.properties ?? []).map((m) => labelLine(m.text)));
const requirements = computed(() =>
  (props.row?.hover.requirements ?? []).map((m) => {
    const l = labelLine(m.text);
    return l.label ? `${l.label} ${l.value}` : l.value;
  }),
);
const implicits = computed(() => (props.row?.hover.implicit ?? []).map((m) => ({ text: jaUniqueText(m.text), optional: !!m.optional })));
const explicits = computed(() => (props.row?.hover.explicit ?? []).map((m) => ({ text: jaUniqueText(m.text), optional: !!m.optional })));
const flavour = computed(() => {
  const f = props.row?.hover.flavour ?? "";
  return f ? jaUniqueText(f).split(/\r?\n/) : [];
});
</script>

<template>
  <GameItemCard :show="!!row" :x="x" :y="y" :name="row?.nameJa ?? ''" :sub="row ? row.baseJa || row.baseEn : null" tone="unique" :layer-key="layerKey" :pinned="pinned" :z="z">
    <template v-if="row">
      <p v-if="kindLine" class="g-dim text-[12px] mb-1">{{ kindLine }}</p>
      <img v-if="row.icon" :src="row.icon" :alt="row.nameJa" class="mx-auto max-h-36 object-contain mb-2" referrerpolicy="no-referrer" />
      <p v-for="(p, i) in properties" :key="'p' + i" class="g-dim">
        <template v-if="p.label">{{ p.label }}: </template><span class="g-white">{{ p.value }}</span>
      </p>
      <p v-if="requirements.length" class="g-dim">要求 <span class="g-white">{{ requirements.join(", ") }}</span></p>
      <template v-if="implicits.length">
        <div class="g-sep" />
        <p v-for="(m, i) in implicits" :key="'i' + i" class="g-mod" :class="m.optional ? 'opacity-60' : ''"><RichText :text="m.text" /></p>
      </template>
      <div class="g-sep" />
      <p v-for="(m, i) in explicits" :key="'e' + i" class="g-mod" :class="m.optional ? 'opacity-60' : ''"><RichText :text="m.text" /></p>
      <template v-if="flavour.length">
        <div class="g-sep" />
        <p v-for="(l, i) in flavour" :key="'f' + i" class="g-flavour">{{ l }}</p>
      </template>
      <p v-if="explicits.some((m) => m.optional)" class="g-dim text-[10px] mt-2">薄い行はどれかが付く MOD</p>
    </template>
  </GameItemCard>
</template>
