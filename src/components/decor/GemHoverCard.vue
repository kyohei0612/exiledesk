<!--
  GemHoverCard.vue — スキルジェム / リネージュサポートの名前にカーソルを乗せた時のカード (2026-09-26)

  オーナー:「スキルジェム関連にも同じように、名前の下に下線で詳細カード、仕組み同じにして」
  「リネージュサポはゲーム内表記くらい詳しく書いて。スキルジェムも同じくらい詳しく」「品質と追加品質は分けて、それぞれ」。
  ゲームのジェムのカードの並び: 種類とタグ → 装備条件 → (レベルの数値) コスト・クールダウン・効果 → 説明 → 品質 → フレーバー。
  レベルは 1 / 20 / 21 を切り替えて見る (全部並べると縦に長すぎる)。最初は 20。
  中身は [[gem-hover.ts]] (クライアント原本、scripts/build-gem-hover-ja.mjs)。下線からさらに奥へ辿れる ([[RichText.vue]])。
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import GameItemCard from "./GameItemCard.vue";
import RichText from "./RichText.vue";
import GemLevelBlock from "./GemLevelBlock.vue";
import { gemHoverOf, loadGemHover, type GemLevelInfo } from "../../services/gem-hover";

const props = defineProps<{ en: string; x: number; y: number; layerKey: number; pinned: boolean; z: number }>();
onMounted(() => void loadGemHover());

const gem = computed(() => gemHoverOf(props.en));
/** 種類の行 (「スキルジェム · スピリット」「リネージュサポートジェム」) */
const kindLine = computed(() => {
  const g = gem.value;
  if (!g) return "";
  const k = g.k === "support" ? (g.lineage ? "リネージュサポートジェム" : "サポートジェム") : g.k === "meta" ? "メタジェム" : "スキルジェム";
  return [k, g.s ? "スピリット" : ""].filter(Boolean).join(" · ");
});
/** 能力値の配分 (「筋力 100%」) */
const attrLine = computed(() => {
  const r = gem.value?.req;
  if (!r) return "";
  return [r.str ? `筋力 ${r.str}%` : "", r.dex ? `器用さ ${r.dex}%` : "", r.int ? `知性 ${r.int}%` : ""].filter(Boolean).join(" · ");
});

/** どのレベルを見るか (無ければ 20、それも無ければ最後) */
const pick = ref<number | null>(null);
const levels = computed(() => gem.value?.at ?? []);
const current = computed<GemLevelInfo | null>(() => {
  const ls = levels.value;
  if (!ls.length) return null;
  const want = pick.value ?? 20;
  return ls.find((l) => l.g === want) ?? ls[ls.length - 1]!;
});
/** 装備条件のレベル (そのジェムレベルの要求、無ければジェムの最低) */
const reqLv = computed(() => current.value?.req || gem.value?.req?.lv || gem.value?.lv || 0);
function subLevel(at: GemLevelInfo[] | undefined): GemLevelInfo | null {
  if (!at?.length) return null;
  const g = current.value?.g;
  return at.find((l) => l.g === g) ?? at[at.length - 1]!;
}
function paras(t: string | undefined): string[] {
  return (t ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}
</script>

<template>
  <GameItemCard :show="true" :x="x" :y="y" :name="gem?.n ?? en" tone="gem" :width="420" :layer-key="layerKey" :pinned="pinned" :z="z">
    <template v-if="gem">
      <p class="g-dim text-[12px]">{{ kindLine }}</p>
      <p v-if="gem.tags?.length" class="g-white text-[12px]">{{ gem.tags.join(", ") }}</p>
      <!-- レベルの切り替え (ゲームは今のレベルの数値だけを出す) -->
      <div v-if="levels.length > 1" class="flex justify-center gap-1 mt-1.5">
        <button
          v-for="l in levels"
          :key="l.g"
          type="button"
          class="px-2 py-0.5 rounded border text-[11px] leading-none"
          :class="current?.g === l.g ? 'border-[#1ba29b] text-[#5fd3cb] bg-[#10201f]' : 'border-[#333] text-[#8a8a8a] hover:text-[#cfcfcf]'"
          @click.stop="pick = l.g"
        >
          レベル {{ l.g }}
        </button>
      </div>
      <p v-else-if="current" class="g-dim text-[12px]">レベル {{ current.g }}</p>
      <p v-if="reqLv" class="g-dim mt-1">装備条件: <span class="g-white">レベル {{ reqLv }}</span><template v-if="attrLine"> · {{ attrLine }}</template></p>
      <template v-if="current">
        <div class="g-sep" />
        <GemLevelBlock :lv="current" />
        <template v-for="(st, si) in current.sets ?? []" :key="'set' + si">
          <p class="g-head2 mt-1.5">{{ st.l }}</p>
          <GemLevelBlock :lv="st" />
        </template>
      </template>
      <template v-if="gem.d">
        <div class="g-sep" />
        <p v-for="(p, i) in paras(gem.d)" :key="'d' + i" class="g-desc text-left text-[13px]" :class="i > 0 ? 'mt-1.5' : ''"><RichText :text="p" /></p>
      </template>
      <!-- 付随するスキル (シールドウェーブなど)。同じレベルの数値 -->
      <template v-for="(sb, si) in gem.sub ?? []" :key="'s' + si">
        <div class="g-sep" />
        <p class="g-head2">{{ sb.n }}</p>
        <p v-if="sb.d" class="g-desc text-left text-[12.5px]"><RichText :text="sb.d" /></p>
        <GemLevelBlock v-if="subLevel(sb.at)" :lv="subLevel(sb.at)!" />
      </template>
      <!-- 品質と追加の品質は分けて出す (オーナー 2026-09-26「それぞれ分けてカード内に表示」) -->
      <template v-if="gem.q?.length">
        <div class="g-sep" />
        <p class="g-head2">{{ gem.qh || "品質による追加の効果" }}<span v-if="gem.qq" class="g-dim text-[10.5px]"> (品質 {{ gem.qq }}%)</span></p>
        <p v-for="(q, i) in gem.q" :key="'q' + i" class="g-mod"><RichText :text="q" /></p>
      </template>
      <template v-if="gem.q2?.length">
        <div class="g-sep" />
        <p class="g-head2">{{ gem.q2h || "追加の品質の効果" }}<span v-if="gem.qq" class="g-dim text-[10.5px]"> (品質 {{ gem.qq }}%)</span></p>
        <p v-for="(q, i) in gem.q2" :key="'q2' + i" class="g-mod"><RichText :text="q" /></p>
      </template>
      <template v-if="gem.fl">
        <div class="g-sep" />
        <p class="g-flavour">{{ gem.fl }}</p>
      </template>
    </template>
    <p v-else class="g-dim text-[12px]">説明のデータがありません</p>
  </GameItemCard>
</template>
