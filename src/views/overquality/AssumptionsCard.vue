<!--
  AssumptionsCard.vue — 前提 (確率は非公開。プレイヤー計測の既定値を画面で変える)
  Overquality.vue から切り出し (2026-09-26)。中身は変えていない。
-->
<script setup lang="ts">
import { ref } from "vue";
import BaseCard from "../../components/decor/BaseCard.vue";
import type { useOverquality } from "./useOverquality";

const props = defineProps<{ o: ReturnType<typeof useOverquality> }>();
const o = props.o;
const showAssumptions = ref(false);
</script>

<template>
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <button type="button" class="text-sm font-bold text-amber-100 flex items-center gap-2" @click="showAssumptions = !showAssumptions">
          <span>{{ showAssumptions ? "▲" : "▼" }}</span>
          <span>前提 (確率は非公開。プレイヤー計測の既定値、ここで変えられます)</span>
        </button>
        <div v-if="showAssumptions" class="mt-3 text-[12px] space-y-2">
          <div class="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 items-center w-max">
            <label>インフューザー 1 回で +2 になる確率</label><input v-model.number="o.params.value.plusTwoChance" type="number" min="0" max="1" step="0.05" class="num w-24" />
            <label>品質 1 ポイント超過ごとのコラプト確率の増分</label><input v-model.number="o.params.value.brickRatePerPoint" type="number" min="0" max="1" step="0.001" class="num w-24" />
          </div>
          <button type="button" class="text-[11px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]" @click="o.resetParams">既定値に戻す</button>
          <p class="text-[11px] text-[var(--exile-color-text-tertiary)] leading-relaxed">
            品質 q (20 以上) でインフューザーを使うと、コラプト確率 = 増分 × (q − 20)。20% ちょうどからの 1 回目は 0 で、21% で約 5%、29% で約 47% (既定)。
            コラプトしなければ +1 (既定 80%) か +2 (20%)、目標を超えた分は目標で止まります。既定の増分 0.052 はコミュニティのインフューザー使用ログ (約 2,300 回) から出た値で、20 → 30 の生存率は約 9.8% になります。
            クライアントにあるのは「最大品質を最大 10% まで超過できるが、一定確率でコラプト化する」の説明文までです。
          </p>
        </div>
      </div>
    </BaseCard>
</template>
