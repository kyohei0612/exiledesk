<!--
  VariantsPanel.vue — 選択肢の比較 (エッセンス × 肋骨 × 反響 × 高貴なオーブ × お告げ × ルーン)
  RareCraft.vue から切り出し (2026-09-26)。中身は変えていない。
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import BaseCard from "../../components/decor/BaseCard.vue";
import { evClass, money, pct } from "./ui";
import type { useRareCraft } from "./useRareCraft";

const props = defineProps<{ c: ReturnType<typeof useRareCraft> }>();
const c = props.c;
const showAllVariants = ref(false);

const variantRows = computed(() => (showAllVariants.value ? c.variants.value : c.variants.value.slice(0, 12)));
/** 比較表は横に収めるため短い名前にする (フル名は title) */
const shortExalt: Record<string, string> = { normal: "通常", greater: "上級", perfect: "完全" };
const shortEssence = (label: string): string => label.match(/\((.+)\)$/)?.[1] ?? label.replace("のグレーターエッセンス", "");
/** エッセンスを選べるレシピだけエッセンスの列を出す */
const essenceCol = computed(() => c.essences.value.filter((e) => e.ok).length > 1);
const shortRune = (label: string): string => (label === "ルーンなし" ? "—" : label.replace(/ \(.+\)$/, "").replace("のグレータールーン", " G").replace("のパーフェクトルーン", " P").replace("ファルウルの追跡のルーン", "追跡"));
</script>

<template>
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <div class="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
          <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">選択肢の比較 (エッセンス × 肋骨 × 反響 × 高貴なオーブ × お告げ × ルーン)</h2>
          <span class="text-[11px] text-[var(--exile-color-text-secondary)]">期待収支の高い順。ベースは上の選択のまま。高貴なオーブは毎回 偉大なる高貴なお告げ と一緒に 1 個使って 2 つ足す</span>
        </div>
        <p v-if="c.variants.value.length === 0" class="text-[12px] text-[var(--exile-color-text-tertiary)]">相場が揃うと出ます (不足: {{ c.missing.value.join("、") || "取得中" }})</p>
        <template v-else>
          <table class="w-full text-[12px] break-words">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th v-if="essenceCol" class="text-left font-normal pb-1 pr-2">エッセンス</th>
                <th class="text-left font-normal pb-1">冒涜</th>
                <th class="text-left font-normal pb-1 pl-2">高貴なオーブ</th>
                <th class="text-left font-normal pb-1 pl-2">ルーン</th>
                <th class="text-right font-normal pb-1 pl-2">1 回の費用</th>
                <th class="text-right font-normal pb-1 pl-2">期待売上</th>
                <th class="text-right font-normal pb-1 pl-2">期待収支</th>
                <th class="text-right font-normal pb-1 pl-2">黒字の確率</th>
                <th class="text-right font-normal pb-1 pl-2">一番高い段</th>
                <th class="pb-1"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(v, i) in variantRows"
                :key="v.key"
                class="border-t border-[var(--exile-color-border-subtle)] tabular-nums"
                :class="[v.current ? 'text-[var(--exile-color-accent-focus)]' : '', i === 0 ? 'bg-emerald-500/10' : '']"
              >
                <td v-if="essenceCol" class="py-1 pr-2" :title="v.labels.essence">{{ shortEssence(v.labels.essence) }}</td>
                <td class="py-1 pr-2" :title="`${v.labels.rib} / 反響: ${v.labels.echo}`">{{ v.rib === "ancient" ? "古代" : "保存" }}{{ v.echo === "echoes" ? " + 反響" : "" }}</td>
                <td class="py-1 pl-2" :title="`${v.labels.exalt} + 偉大なる高貴なお告げ / ${v.labels.side}`">{{ shortExalt[v.exalt] }}{{ v.side === "suffix" ? " 右側" : "" }}{{ v.count < c.EXALT_ADDS ? ` (${v.count} つ)` : "" }}</td>
                <td class="py-1 pl-2" :title="v.labels.rune">{{ shortRune(v.labels.rune) }}</td>
                <td class="py-1 pl-2 text-right">{{ money(v.cost) }}</td>
                <td class="py-1 pl-2 text-right">{{ money(v.expectedSale) }}</td>
                <td class="py-1 pl-2 text-right" :class="evClass(v.ev)">{{ money(v.ev, true) }}</td>
                <td class="py-1 pl-2 text-right">{{ pct(v.pProfit) }}</td>
                <td class="py-1 pl-2 text-right">{{ pct(v.pTop) }}</td>
                <td class="py-1 pl-2 text-right">
                  <span v-if="i === 0" class="text-[10px] px-1 rounded bg-emerald-500/20 text-emerald-300">最も得</span>
                  <button v-if="!v.current" type="button" class="ml-1 text-[10px] underline text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-accent-focus)]" @click="c.selectVariant(v.key)">これにする</button>
                  <span v-else class="ml-1 text-[10px] text-[var(--exile-color-text-tertiary)]">選択中</span>
                </td>
              </tr>
            </tbody>
          </table>
          <button v-if="c.variants.value.length > 12" type="button" class="mt-2 text-[11px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]" @click="showAllVariants = !showAllVariants">
            {{ showAllVariants ? "▲ 上位 12 件だけ" : `▼ 全 ${c.variants.value.length} 件を見る` }}
          </button>
          <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-2">
            冒涜 = 肋骨 (保存 / 古代) と アビスの反響のお告げ の有無。古代の肋骨は冒涜の候補を MOD レベル 40 以上に絞る (通常の MOD の低いティアが出なくなる)。反響は最初の 3 択の一番いい物が「引き直した時の平均」より悪ければ引き直す。
            高貴なオーブの「右側」= 右側の高貴なお告げ (サフィックスだけに付ける)。一番高い段 = 取れた売値が一番高い段で売る確率。比較表は 2,500 回ずつの試算なので、上の「1 回あたり」(2 万回) と少しずれます。
          </p>
          <p v-if="c.unpricedOptions.value.length" class="text-[11px] text-amber-300 mt-1">相場が無いので比較に出ていない素材: {{ c.unpricedOptions.value.join("、") }}</p>
        </template>
      </div>
    </BaseCard>
</template>
