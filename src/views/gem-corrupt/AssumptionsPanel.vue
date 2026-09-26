<!--
  AssumptionsPanel.vue — 前提 (確率は非公開のためコミュニティ推定。ここで変えられる)
  2026-09-19 に GemCorrupt.vue から切り出し。中身は変えていない。
-->
<script setup lang="ts">
import { ref } from "vue";
import BaseCard from "../../components/decor/BaseCard.vue";
import { pct } from "./ui";
import type { useGemCorrupt } from "./useGemCorrupt";

defineProps<{ g: ReturnType<typeof useGemCorrupt> }>();
const showAssumptions = ref(false);
</script>

<template>
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <button
          type="button"
          class="text-sm font-bold text-amber-100 flex items-center gap-2"
          @click="showAssumptions = !showAssumptions"
        >
          <span>{{ showAssumptions ? "▲" : "▼" }}</span>
          <span>前提 (確率は非公開のためコミュニティ推定。ここで変えられます)</span>
        </button>
        <div v-if="showAssumptions" class="mt-3 grid grid-cols-1 @4xl:grid-cols-2 gap-4 text-[12px]">
          <div class="space-y-2">
            <div class="text-[11px] text-[var(--exile-color-text-secondary)]">ヴァールオーブ (未コラプトのジェムに 1 回)。4 系統の重み (比率で使う)</div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 items-center">
              <label>変化なし</label><input v-model.number="g.params.value.vaalNone" type="number" min="0" step="0.05" class="num" />
              <label>レベル ±1 (半々)</label><input v-model.number="g.params.value.vaalLevel" type="number" min="0" step="0.05" class="num" />
              <label>品質 −3〜+3 (均等)</label><input v-model.number="g.params.value.vaalQuality" type="number" min="0" step="0.05" class="num" />
              <label>ソケット ±1</label><input v-model.number="g.params.value.vaalSockets" type="number" min="0" step="0.05" class="num" />
              <label>品質の段数 (−3〜+3 なら 7)</label><input v-model.number="g.params.value.qualitySteps" type="number" min="2" step="1" class="num" />
            </div>
            <div class="text-[11px] text-[var(--exile-color-text-tertiary)]">
              → レベル +1: {{ pct(g.vaalP.value.levelUp) }} / 品質 23%: {{ pct(g.vaalP.value.qualityTop) }} / 外れ: {{ pct(g.vaalP.value.junk) }}
            </div>
          </div>
          <div class="space-y-2">
            <div class="text-[11px] text-[var(--exile-color-text-secondary)]">コラプトの結晶 (コラプト済みのジェムに)。生き残れば「まだ振っていない系統」だけを振り直す</div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 items-center">
              <label>破壊される確率</label><input v-model.number="g.params.value.crystalDestroy" type="number" min="0" max="1" step="0.05" class="num" />
              <label>外れた生存品の価値 (元の値段の割合)</label><input v-model.number="g.params.value.leftoverFraction" type="number" min="0" max="1" step="0.05" class="num" />
            </div>
            <div class="text-[11px] text-[var(--exile-color-text-tertiary)]">
              レベル 21 から品質 23% を当てる: 生存 × 1/{{ Math.max(2, Math.round(g.params.value.qualitySteps)) - 1 }} /
              品質 23% からレベル +1 を当てる: 生存 × 1/2
            </div>
            <button type="button" class="text-[11px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]" @click="g.resetParams">
              既定値に戻す
            </button>
          </div>
          <div class="@4xl:col-span-2 text-[11px] text-[var(--exile-color-text-tertiary)] leading-relaxed">
            ゲームクライアントにあるのは「コラプトの結晶: コラプト状態のスキルジェムを予測不可能に変化させるか、または破壊する」「穢れにより +1 レベル」
            といった文言と対象アイテム種 (スキル / サポート / メタジェム) までで、確率は入っていません。既定値は 4 系統等確率・品質 7 段階均等・結晶の破壊 50% です。
            レベル上げは「原石」でコラプト後も可能なので、レベルは最後に上げる前提で計算しています (壊れた物にレベル代を払わない)。
          </div>
        </div>
      </div>
    </BaseCard>
</template>
