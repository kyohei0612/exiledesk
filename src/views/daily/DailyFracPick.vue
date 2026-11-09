<!--
  DailyFracPick.vue — 始め方とフラクチャー予定の MOD を選ぶ画面 (D-37c・D-37j)。
  1 段目 = どこから始めるか: (a) フラクチャー済みから / (b) 白から確定フラクチャー (文はシミュの始め方の窓 TreeStartAsk と同じ)。
  2 段目 = フラクチャー予定の MOD。どちらの段も左にシミュ / エミュと同じ完成形のカード (StageItemCard、use-tree の goalItem)、右 (狭い幅は下) に選ぶ物 (D-37l)。
  カードや行の強調 (行に乗せるとカードの MOD が光る等) は付けない (11-09 オーナー「ハイライトいらんかもな」)。始めの値段はどちらも数えない (D-03)
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { tr } from "../../i18n/lang";
import StageItemCard from "../../components/for-share/item/StageItemCard.vue";
import { useTree } from "../simulator/tree/use-tree";
import { startFromWords } from "../simulator/tree/tree-names";
import { tierRankLabel } from "../../services/craft-stage/engine";
import type { StartFrom } from "../../services/simulator/tree/tree-model";
import type { DailyAim } from "./daily-api";

const props = defineProps<{ base: string; ilvl: number; aims: readonly DailyAim[]; /** 開発版の見本 (dev=frac) だけ: 2 段目から開く */ initialFrom?: StartFrom }>();
const emit = defineEmits<{ pick: [modId: string, from: StartFrom] }>();
const t = useTree();
/** 1 段目で選んだ始め方 (null = まだ選んでいない) */
const from = ref<StartFrom | null>(props.initialFrom ?? null);
/** 完成形のカードはお題の狙いを付けた形 (木の完成形と同じ作り)。選んだ後の木はお題から作り直すので、ここで狙いを入れても残らない */
onMounted(() => {
  t.startTreeWith(props.base, props.ilvl);
  t.edit((d) => { d.memoAims = props.aims.map((a) => ({ modId: a.modId, tier: a.tier })); d.goal = { rarity: "rare" }; delete d.ilvlFit; });
});
const card = computed(() => t.goalItem.value?.item ?? null);
const aimText = (a: DailyAim): string => t.aimShort({ modId: a.modId, tier: a.tier });
/** シミュの始め方の窓 (S-13) の (a) / (b) と同じ文 (1 か所 = tree-names の startFromWords、D-37j)。✦ は 1 つなので確定フラクチャーの素材は ×3 */
const FROMS: Array<{ k: StartFrom; title: [string, string]; sub: [string, string] }> = startFromWords(1);
/** 1 段目の短い文 (D-37l、11-09 オーナー「上に書いてあるの意味わからん」)。細かい文 (FROMS の sub) は押す物の説明に */
const SHORT: Record<StartFrom, { title: [string, string]; sub: [string, string] }> = {
  fractured: { title: ["✦ 付きのレアから", "From a fractured rare"], sub: ["選んだ MOD が最初から固定", "The chosen mod is fixed from the start"] },
  four: { title: ["白いベースから", "From a white base"], sub: ["木の中でフラクチャーを打つ", "Fracture it yourself in the tree"] },
};
const chosen = computed(() => FROMS.find((o) => o.k === from.value) ?? null);
</script>

<template>
  <section data-daily-frac :data-daily-frac-step="from ? 'mod' : 'from'" class="daily-frac">
    <h2 class="daily-frac-title">{{ chosen ? tr("フラクチャー予定の MOD を選択してください", "Choose the mod you plan to fracture") : tr("どこから始めるか", "Where to start") }}</h2>
    <div class="daily-frac-body">
      <!-- 完成形のカード (両方の段で同じ、D-37l) -->
      <div class="daily-frac-card" data-daily-frac-card>
        <StageItemCard v-if="card" :item="card" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="400" compact tier-at-least />
        <p v-else class="text-[14px] opacity-70">{{ tr("読み込み中", "Loading") }}</p>
      </div>
      <div v-if="!chosen" class="min-w-0">
        <ul class="daily-frac-from" :aria-label="tr('始め方', 'How to start')">
          <li v-for="o in FROMS" :key="o.k">
            <button type="button" class="daily-frac-opt" data-daily-frac-from :data-from="o.k" :title="tr(...o.sub)" @click="from = o.k">
              <b>{{ tr(...SHORT[o.k].title) }}</b><span>{{ tr(...SHORT[o.k].sub) }}</span>
            </button>
          </li>
        </ul>
        <p class="mt-3 text-[13px] opacity-70">{{ tr("どちらもベースの値段は数えない。次にフラクチャーする MOD を選ぶ。", "The base costs nothing either way. Next, pick the mod to fracture.") }}</p>
      </div>
      <div v-else class="min-w-0">
        <p class="daily-frac-now mb-3 text-[14px]">
          <span data-daily-frac-chosen>{{ tr(`始め方: ${SHORT[chosen.k].title[0]}`, `Start: ${SHORT[chosen.k].title[1]}`) }}</span>
          <button type="button" class="g-btn sm" data-daily-frac-back @click="from = null">{{ tr("始め方を選び直す", "Change how to start") }}</button>
        </p>
        <ul class="daily-frac-list" :aria-label="tr('フラクチャー予定の MOD', 'Mod to fracture')">
          <li v-for="a in aims" :key="a.modId">
            <button type="button" class="daily-frac-row" data-daily-frac-pick :data-mod="a.modId" @click="emit('pick', a.modId, chosen.k)">
              <span>{{ aimText(a) }}</span><small>{{ tierRankLabel(a.tier) }}</small>
            </button>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
