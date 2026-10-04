<!--
  BuildItemHoverCard.vue — 忍者ビルドコピーの装備の名前にカーソルを乗せた時のカード (2026-09-26)

  オーナー:「これも同じように詳細カードよろしくね、ゲーム内仕様の」。
  ゲームのアイテム画面の並び: 名前とベース → 部位・品質・アイテムレベル → 差したルーン → 固有 → 明示 → コラプト。
  枠と位置決めは [[GameItemCard.vue]] (ユニーク・カレンシー・ジェムと共通)。MOD 文の日本語はクライアント原本 ([[unique-mod-ja.ts]])。
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { openTierSearch } from "../../services/pob-check/tier-search";
import GameItemCard from "../decor/GameItemCard.vue";
import RichText from "../decor/RichText.vue";
import ItemArt from "../decor/ItemArt.vue";
import { jaUniqueText, loadUniqueHoverDict } from "../../services/mods/unique-mod-ja";
import { jaTypeName, jaUniqueName } from "../../services/trade2/localize";
import { jaCurrency } from "../../i18n/currencies-ja";
import type { BuildItem } from "../../services/build-copy/pob";
import passivesJa from "../../i18n/passives-ja-client.json";

/** エンチャントの行の日本語。アノイントの「Allocates ○○」はゲームと同じ「○○を割り当てる」(ノードの名前はクライアントの日本語) */
const PASSIVE_JA = passivesJa as Record<string, string>;
const enchantJa = (l: string): string => {
  const m = /^Allocates (.+)$/.exec(l);
  return m ? `${PASSIVE_JA[m[1]!] ?? m[1]}を割り当てる` : jaUniqueText(l);
};

const props = defineProps<{ item: BuildItem; x: number; y: number; layerKey: number; pinned: boolean; z: number }>();
onMounted(() => void loadUniqueHoverDict());

const unique = computed(() => props.item.rarity === "UNIQUE" || props.item.rarity === "RELIC");
const tone = computed(() => (unique.value ? "unique" : props.item.rarity === "RARE" ? "rare" : props.item.rarity === "MAGIC" ? "magic" : "currency"));
// レアの固有名はでたらめな組み合わせで日本語が無いので、見出しはベースの日本語名、固有名は下に小さく
const name = computed(() => (unique.value ? jaUniqueName(props.item.name) : props.item.base ? jaTypeName(props.item.base) : props.item.name));
/**
 * 取引所で探す (2026-10-05 オーナー「ホバーしたカードにそのままトレード 2 行けるように、オーグメントなし・品質効果なし・そのティアで」)。
 * ピン留めしたカードで押せる。レア・マジックはティアの下限、ユニークは名前 + ベース
 */
const tradeNote = ref("");
const tradeBusy = ref(false);
async function onTrade(): Promise<void> {
  if (!props.item.raw || tradeBusy.value) return;
  tradeBusy.value = true;
  tradeNote.value = "";
  try {
    tradeNote.value = (await openTierSearch({ raw: props.item.raw, rarity: props.item.rarity, name: props.item.name, base: props.item.base })).note;
  } catch (e) {
    tradeNote.value = e instanceof Error ? e.message : String(e);
  } finally {
    tradeBusy.value = false;
  }
}
const sub = computed(() => (unique.value && props.item.base ? jaTypeName(props.item.base) : null));
</script>

<template>
  <GameItemCard :show="true" :x="x" :y="y" :name="name" :sub="sub" :tone="tone" :width="400" :layer-key="layerKey" :pinned="pinned" :z="z">
    <p class="g-dim text-[12px]">{{ item.slot }}<template v-if="item.rarity === 'RARE' && item.name"> · {{ item.name }}</template></p>
    <!-- ゲーム内の絵 (ユニークはユニークの絵、他はベースの絵。無ければ出さない)。ユニーク装備価格推移のカードと同じく頭に (2026-10-03) -->
    <div class="flex justify-center">
      <ItemArt :name="item.name" :base="item.base" :rarity="item.rarity" :size="96" class="my-1.5 drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]" />
    </div>
    <p v-if="item.quality" class="g-dim">品質: <span class="g-mod">+{{ item.quality }}%</span></p>
    <p v-if="item.itemLevel" class="g-dim">アイテムレベル: <span class="g-white">{{ item.itemLevel }}</span></p>
    <template v-if="item.runes.length">
      <div class="g-sep" />
      <p v-for="(r, i) in item.runes" :key="'r' + i" class="g-dim">ソケット: <span class="g-white">{{ jaCurrency(r) }}</span></p>
    </template>
    <!-- エンチャント (アノイントなど)。ゲームのカードと同じく固有の上 (2026-10-05 オーナー「ホバーでもアノイント見れる?」) -->
    <template v-if="item.enchants?.length">
      <div class="g-sep" />
      <p v-for="(m, i) in item.enchants" :key="'e' + i" class="text-[#b8daf2]"><RichText :text="enchantJa(m)" /></p>
    </template>
    <template v-if="item.implicits.length">
      <div class="g-sep" />
      <p v-for="(m, i) in item.implicits" :key="'i' + i" class="g-mod"><RichText :text="jaUniqueText(m)" /></p>
    </template>
    <div class="g-sep" />
    <p v-for="(m, i) in item.mods" :key="'m' + i" class="g-mod"><RichText :text="jaUniqueText(m)" /></p>
    <p v-if="!item.mods.length" class="g-dim">MOD なし</p>
    <template v-if="item.corrupted">
      <div class="g-sep" />
      <p class="text-[#d20000]">コラプト</p>
    </template>
    <!-- 取引所で探す (PoB の文面がある時だけ。ピン留めすると押せる) -->
    <template v-if="item.raw && item.kind !== 'flask' && item.kind !== 'charm'">
      <div class="g-sep" />
      <div class="flex flex-wrap items-center justify-center gap-2 text-[12px]">
        <button
          v-if="pinned"
          type="button"
          class="rounded border border-[#8a7a4a] px-2.5 py-0.5 text-[#ffd479] hover:bg-[#4a3a1a] disabled:opacity-50"
          :disabled="tradeBusy"
          :title="unique ? '名前 + ベースで取引所を開く' : 'ルーン・品質の底上げを抜いた、付いている MOD のティアの下限で取引所を開く'"
          @click.stop="onTrade"
        >{{ tradeBusy ? "開いています…" : unique ? "取引所で探す ↗" : "このティアで取引所 ↗" }}</button>
        <span v-else class="g-dim">ピン留めすると取引所で探せます</span>
        <span v-if="tradeNote" class="g-dim">{{ tradeNote }}</span>
      </div>
    </template>
  </GameItemCard>
</template>
