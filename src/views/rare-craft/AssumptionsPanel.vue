<!--
  AssumptionsPanel.vue — 前提 (確率や重みをここで変えられる)
  2026-09-19 に RareCraft.vue から切り出した。中身は変えていない。
-->
<script setup lang="ts">
import { ref } from "vue";
import BaseCard from "../../components/decor/BaseCard.vue";
import { METRIC_LABEL, METRIC_UNIT, type Metric } from "./sim";
import type { useRareCraft } from "./useRareCraft";

const props = defineProps<{ c: ReturnType<typeof useRareCraft> }>();
const c = props.c;
const showAssumptions = ref(false);
const condKeys = (conds: Partial<Record<Metric, number>>): Metric[] => Object.keys(conds) as Metric[];
function setNormalShare(ev: Event): void {
  const v = Number((ev.target as HTMLInputElement).value);
  if (Number.isFinite(v)) c.normalShare.value = Math.min(100, Math.max(0, v)) / 100;
}
</script>

<template>
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <button type="button" class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base flex items-center gap-2" @click="showAssumptions = !showAssumptions">
          <span>{{ showAssumptions ? "▲" : "▼" }}</span>
          <span>前提 (売値の段の条件と計算の入力。ここで変えられます)</span>
        </button>
        <div v-if="showAssumptions" class="mt-3 grid grid-cols-1 @4xl:grid-cols-2 gap-4 text-[12px]">
          <div class="space-y-2">
            <div class="text-[11px] text-[var(--exile-color-text-secondary)]">売値の段 (trade2 の検索条件。変えるとその分だけ取り直す)</div>
            <div v-for="b in c.buckets.value" :key="b.key" class="flex items-center gap-3 flex-wrap">
              <span class="text-[var(--exile-color-text-tertiary)] w-8">段 {{ b.key.toUpperCase() }}</span>
              <label v-for="k in condKeys(b.conds)" :key="k" class="inline-flex items-center gap-1">
                {{ METRIC_LABEL[k] }}
                <input v-model.number="b.conds[k]" type="number" min="0" step="5" class="num w-20" />
                <span class="text-[var(--exile-color-text-tertiary)]">{{ METRIC_UNIT[k] }}+</span>
              </label>
            </div>
            <div class="flex items-center gap-3 flex-wrap">
              <span class="text-[var(--exile-color-text-tertiary)] w-8">外れ</span>
              <label v-for="k in condKeys(c.floorConds.value)" :key="k" class="inline-flex items-center gap-1">
                {{ METRIC_LABEL[k] }}
                <input v-model.number="c.floorConds.value[k]" type="number" min="0" step="5" class="num w-20" />
                <span class="text-[var(--exile-color-text-tertiary)]">{{ METRIC_UNIT[k] }}+</span>
              </label>
            </div>
            <button type="button" class="text-[11px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]" @click="c.resetThresholds">既定値に戻す</button>
            <div class="text-[11px] text-[var(--exile-color-text-secondary)] pt-2">計算の入力</div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 items-center">
              <label>ベースの ilvl (これ以下の MOD だけ付く)</label><input v-model.number="c.ilvl.value" type="number" min="1" max="100" step="1" class="num" />
              <label>品質 % (防御にだけ効く)</label><input v-model.number="c.quality.value" type="number" min="0" max="30" step="1" class="num" />
              <label>冒涜 3 択の 2・3 つ目が通常の MOD になる確率 %</label><input :value="Math.round(c.normalShare.value * 100)" type="number" min="0" max="100" step="5" class="num" @change="setNormalShare" />
              <template v-if="c.recipe.value.id === 'es-helmet'">
                <label>ベースの素の ES (先祖のティアラ 109 / カマサのティアラ 101)</label><input v-model.number="c.baseEs.value" type="number" min="0" step="1" class="num" />
              </template>
            </div>
          </div>
          <div class="text-[11px] text-[var(--exile-color-text-secondary)] leading-relaxed space-y-1">
            <p>
              手順 (0.5 の「クラフト MOD 1 + 冒涜 1」): マジックベースの MOD 1 つ → グレーターエッセンス (クラフト MOD 枠、レア化) → 肋骨で冒涜 3 択 (耐性 + 混沌耐性を優先して選ぶ) →
              高貴なオーブ 1 個 + 偉大なる高貴なお告げで MOD を 2 つ足す (空きは 1 つ残る)。付く MOD は poe2db の推定重みに比例、ロール値は範囲内で一様、同じ系統は重ならない。
            </p>
            <p>重み: poe2db の値 (PoE1 で同系統だった MOD の重み。PoE2 の新 MOD と冒涜は 1 = 一様)。ティア値と「どの装備に付くか」はクライアントの MOD 表。GGG は PoE2 の重みを公開していない。</p>
            <p>兜 / 手袋 / 靴の冒涜 MOD は接尾辞だけ (クライアントの MOD 表) なので、ネクロマンシーのお告げは使わない。</p>
            <p>
              冒涜の 3 択: 1 つはアビス専用 MOD (全部 MOD レベル 65、一様)、残り 2 つはそれぞれ左の確率で同じ側の通常の MOD (poe2db の重み)。コミュニティ (Sift の冒涜ガイド) の推定で、GGG は公開していない。
              古代の肋骨は候補を MOD レベル 40 以上に絞る。アビスの反響のお告げは、最初の 3 択の一番いい物の点数 (耐性 + 混沌耐性の重み付き) が「引き直した時の平均」より低ければ 1 回引き直す。お告げは引き直さなくても消費する前提。
            </p>
            <p>売値の段: trade2 の擬似 stat (ライフ合計 / 元素耐性合計 / 混沌耐性合計 / 移動速度) と ES の値で検索した最安。1 回ぶんの結果は満たす段のうち一番高い売値で、どれにも届かなければ外れの最安で売る。外れの条件にも届かない物は売れない (0) 扱い。</p>
            <p><strong>ルーンは既定で「なし」。</strong>完成品は普通ルーンを外して並べるので、売値の段も出品されているルーン抜きの値です。こちらにだけルーンを足して比べると、そのぶん上の段に当たったことになって売値を高く見積もります。差したまま並べる時だけルーンを選んでください (選ぶと素材にも入ります)。</p>
            <p>ルーンと品質はシミュレーションのあとに足す (ソケット 2 本ぶん)。ES = (素の ES + フラット ES) × (1 + %ES + ルーン) × (1 + 品質) ── <strong>品質は枠に足すのではなく最後に掛ける</strong> (2026-09-22 に実物 2 個で確定)。品質は鎧鍛冶の端材で上げる前提で、1 個 +1% として品質の数だけ素材に入れる。ベースはソケット 2 以上で買うので熟練工のオーブは使わない。</p>
            <p>規格外だけを扱う理由 (2026-09-14 の JP 相場): ソケット 1 の完成品は 1〜18 カオスで 3 レシピとも赤字、ソケット 2 は同じ条件で 37〜139 カオス。売値は最安値なので、出品が少ない段は「トレード2へ」で並びを見てから作ること。</p>
          </div>
        </div>
      </div>
    </BaseCard>
</template>
