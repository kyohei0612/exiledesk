<!--
  DailyFracPick.vue — 始め方とフラクチャー予定の MOD を選ぶ画面 (D-37c・D-37j)。
  1 段目 = どこから始めるか: (a) フラクチャー済みから / (b) 白から確定フラクチャー (文はシミュの始め方の窓 TreeStartAsk と同じ)。
  2 段目 = フラクチャー予定の MOD: 狙いをシミュ / エミュと同じ完成形のカード (StageItemCard、use-tree の goalItem) で見せ、横 (狭い幅は下) の行で選ぶ。
  行にホバーするとカードのその MOD が光る。始めの値段はどちらも数えない (D-03)
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { tr } from "../../i18n/lang";
import StageItemCard from "../../components/for-share/item/StageItemCard.vue";
import { useTree } from "../simulator/tree/use-tree";
import { startFromWords } from "../simulator/tree/tree-names";
import type { StartFrom } from "../../services/simulator/tree/tree-model";
import type { DailyAim } from "./daily-api";

const props = defineProps<{ base: string; ilvl: number; aims: readonly DailyAim[] }>();
const emit = defineEmits<{ pick: [modId: string, from: StartFrom] }>();
const t = useTree();
const hover = ref<string | null>(null);
/** 1 段目で選んだ始め方 (null = まだ選んでいない) */
const from = ref<StartFrom | null>(null);
/** 完成形のカードはお題の狙いを付けた形 (木の完成形と同じ作り)。選んだ後の木はお題から作り直すので、ここで狙いを入れても残らない */
onMounted(() => {
  t.startTreeWith(props.base, props.ilvl);
  t.edit((d) => { d.memoAims = props.aims.map((a) => ({ modId: a.modId, tier: a.tier })); d.goal = { rarity: "rare" }; delete d.ilvlFit; });
});
const card = computed(() => t.goalItem.value?.item ?? null);
const aimText = (a: DailyAim): string => t.aimShort({ modId: a.modId, tier: a.tier });
/** シミュの始め方の窓 (S-13) の (a) / (b) と同じ文 (1 か所 = tree-names の startFromWords、D-xx)。✦ は 1 つなので確定フラクチャーの素材は ×3 */
const FROMS: Array<{ k: StartFrom; title: [string, string]; sub: [string, string] }> = startFromWords(1);
const chosen = computed(() => FROMS.find((o) => o.k === from.value) ?? null);
</script>

<template>
  <section data-daily-frac :data-daily-frac-step="from ? 'mod' : 'from'" class="daily-frac">
    <template v-if="!chosen">
      <h2 class="daily-frac-title">{{ tr("どこから始めるか", "Where to start") }}</h2>
      <p class="mb-4 text-[14px] opacity-70">{{ tr("始め方を選ぶと、次にフラクチャー予定の MOD を選ぶ。ベースの値段は数えない。", "Pick how to start, then the mod you plan to fracture. The base itself costs nothing.") }}</p>
      <ul class="daily-frac-from" :aria-label="tr('始め方', 'How to start')">
        <li v-for="o in FROMS" :key="o.k">
          <button type="button" class="daily-frac-opt" data-daily-frac-from :data-from="o.k" @click="from = o.k">
            <b>{{ tr(...o.title) }}</b><span>{{ tr(...o.sub) }}</span>
          </button>
        </li>
      </ul>
    </template>
    <template v-else>
      <h2 class="daily-frac-title">{{ tr("フラクチャー予定の MOD を選択してください", "Choose the mod you plan to fracture") }}</h2>
      <p class="daily-frac-now mb-4 text-[14px]">
        <span data-daily-frac-chosen>{{ tr(`始め方: ${chosen.title[0]}`, `Start: ${chosen.title[1]}`) }}</span>
        <button type="button" class="g-btn sm" data-daily-frac-back @click="from = null">{{ tr("始め方を選び直す", "Change how to start") }}</button>
      </p>
      <div class="daily-frac-body">
        <div class="daily-frac-card" data-daily-frac-card>
          <StageItemCard v-if="card" :item="card" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="400" compact tier-at-least :focus="hover" />
          <p v-else class="text-[14px] opacity-70">{{ tr("読み込み中", "Loading") }}</p>
        </div>
        <ul class="daily-frac-list" :aria-label="tr('フラクチャー予定の MOD', 'Mod to fracture')">
          <li v-for="a in aims" :key="a.modId">
            <button type="button" class="daily-frac-row" data-daily-frac-pick :data-mod="a.modId" @mouseenter="hover = a.modId" @mouseleave="hover = null" @focus="hover = a.modId" @blur="hover = null" @click="emit('pick', a.modId, chosen.k)">
              <span>{{ aimText(a) }}</span><small>{{ tr(`T${a.tier} 以上`, `T${a.tier}+`) }}</small>
            </button>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>
