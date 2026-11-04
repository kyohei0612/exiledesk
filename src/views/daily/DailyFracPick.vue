<!--
  DailyFracPick.vue — フラクチャーする MOD を選ぶ画面 (D-37c)。狙いをシミュ / エミュと同じ完成形のカード (StageItemCard、use-tree の goalItem) で見せ、
  横 (狭い幅は下) の行で選ぶ。行にホバーするとカードのその MOD が光る。ここまでの費用は数えない (D-03)
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { tr } from "../../i18n/lang";
import StageItemCard from "../../components/for-share/item/StageItemCard.vue";
import { useTree } from "../simulator/tree/use-tree";
import type { DailyAim } from "./daily-api";

const props = defineProps<{ base: string; ilvl: number; aims: readonly DailyAim[] }>();
const emit = defineEmits<{ pick: [modId: string] }>();
const t = useTree();
const hover = ref<string | null>(null);
/** 完成形のカードはお題の狙いを付けた形 (木の完成形と同じ作り)。選んだ後の木はお題から作り直すので、ここで狙いを入れても残らない */
onMounted(() => {
  t.startTreeWith(props.base, props.ilvl);
  t.edit((d) => { d.memoAims = props.aims.map((a) => ({ modId: a.modId, tier: a.tier })); d.goal = { rarity: "rare" }; delete d.ilvlFit; });
});
const card = computed(() => t.goalItem.value?.item ?? null);
const aimText = (a: DailyAim): string => t.aimShort({ modId: a.modId, tier: a.tier });
</script>

<template>
  <section data-daily-frac class="daily-frac">
    <h2 class="daily-frac-title">{{ tr("どの MOD をフラクチャーして始めるか", "Choose the mod to fracture") }}</h2>
    <p class="mb-4 text-[14px] opacity-70">{{ tr("完成形 (左のカード) のうち 1 つをフラクチャー済みにしたレアから始める。ここまでの費用は数えない。", "You start from a rare with one of the finished mods (card on the left) already fractured. This part costs nothing.") }}</p>
    <div class="daily-frac-body">
      <div class="daily-frac-card" data-daily-frac-card>
        <StageItemCard v-if="card" :item="card" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="400" compact tier-at-least :focus="hover" />
        <p v-else class="text-[14px] opacity-70">{{ tr("読み込み中", "Loading") }}</p>
      </div>
      <ul class="daily-frac-list" :aria-label="tr('フラクチャーする MOD', 'Mod to fracture')">
        <li v-for="a in aims" :key="a.modId">
          <button type="button" class="daily-frac-row" data-daily-frac-pick :data-mod="a.modId" @mouseenter="hover = a.modId" @mouseleave="hover = null" @focus="hover = a.modId" @blur="hover = null" @click="emit('pick', a.modId)">
            <span>{{ aimText(a) }}</span><small>{{ tr(`T${a.tier} 以上`, `T${a.tier}+`) }}</small>
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>
