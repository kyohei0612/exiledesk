<!--
  RankingTable.vue — 1 アイテム = 1 行、値段 + 過去 7 日
  値段はこの画面だけの表示通貨で 1 種類 (最安値 = 神 → カオス → 高貴)。横の「取引の推奨」は一番安く交換できる通貨 (最安値なら高貴も込み、通貨を選んでいればカオスと神で安い方)。
  オーナー指示 2026-09-26:「0.003 神とか 3 種類並ぶと気持ち悪いし目移りする。カレンシーは 1 種類に統一」
  CurrencyRanking.vue から切り出し (2026-09-07)。行ホバーは親へ emit (効果カード表示用)。
-->
<script setup lang="ts">
import { computed } from "vue";
import type { ItemTrend, RankedItem } from "../../api/poe2scout";
import { jaCurrency } from "../../i18n/currencies-ja";
import { fmt } from "../../views/currency/format";
import { rankingCurrency } from "../../state/display-currency";
import Sparkline from "./Sparkline.vue";

const props = defineProps<{
  rows: RankedItem[];
  divineIcon: string;
  chaosIcon: string;
  exaltedIcon: string;
  loading7d: boolean;
  rowTrend: (p: RankedItem) => ItemTrend | undefined;
}>();
const emit = defineEmits<{ hover: [p: RankedItem, ev: MouseEvent]; move: [ev: MouseEvent]; leave: [] }>();

const JA = { divine: "神", chaos: "カオス", exalted: "高貴" } as const;
type Cur = keyof typeof JA;
/**
 * 行ごとの値段 (2026-09-26 オーナー:「前提は適正のルールで表示。一番安く取引できるのを横に 1 つ置いとこか、取引時の推奨カレンシー」)。
 *   main: 相場の値段を表示通貨で (最安値なら 神 → 1 未満はカオス → 1 カオス未満は高貴)
 *   rec:  取引所のペアで一番安く交換できる通貨 (カオスと神で安い方)。「51.4/個 カオス」の形。
 *         値段の列と同じ通貨の時と、ペアが薄い / 無い時は null (「—」)
 */
const cells = computed(() => {
  const m = new Map<string, { main: { value: number; cur: Cur; label: string }; rec: { value: number; cur: Cur; label: string } | null }>();
  for (const p of props.rows) {
    const u = rankingCurrency.unit(p.exaltedPrice);
    // 最安値の時は高貴のペアも込み (通貨を選んでいる時はカオスと神だけ。この画面だけの表示通貨、2026-10-04)
    const bp = rankingCurrency.withExalted.value ? (p.bestPayAny ?? p.bestPay) : p.bestPay;
    m.set(p.apiId, {
      main: { value: u.value, cur: u.cur, label: u.label },
      // 値段の列と同じ通貨なら出さない (オーナー 2026-09-26「推奨が同じなら表示はいらない、ハイフンで」)
      rec: bp && bp.currency !== u.cur ? { value: bp.perUnit, cur: bp.currency, label: JA[bp.currency] } : null,
    });
  }
  return m;
});
function iconOf(c: Cur): string {
  return c === "divine" ? props.divineIcon : c === "chaos" ? props.chaosIcon : props.exaltedIcon;
}
</script>

<template>
  <!-- 枠は持たない (カレンシーランキングの右の 1 つの枠の中) -->
  <div class="g-plain overflow-hidden">
    <table class="w-full text-base">
      <thead class="bg-[var(--exile-color-bg-surface)] text-xs uppercase tracking-wider text-[var(--exile-color-text-secondary)]">
        <tr>
          <th class="text-left px-3 py-3 whitespace-nowrap">#</th>
          <th class="text-left px-3 py-3 whitespace-nowrap">アイテム</th>
          <th class="text-right px-3 py-3 whitespace-nowrap">値段</th>
          <th class="text-right px-3 py-3 whitespace-nowrap" title="取引所のペアで一番安く交換できる通貨 (カオスと神で安い方。表示通貨が最安値なら高貴も)">取引の推奨</th>
          <th class="text-right px-3 py-3 whitespace-nowrap">
            過去7日間<span v-if="loading7d" class="ml-1 text-[10px] text-[var(--exile-color-text-tertiary)] normal-case">読み込み中…</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <!-- 行の区切りは 1 行おきの薄い地で (1px の線は窓に合わせた拡大で太さがばらついた。2026-10-09) -->
        <tr
          v-for="(p, i) in rows"
          :key="p.apiId"
          class="hover:bg-[var(--exile-color-bg-elevated)] transition"
          :class="i % 2 ? 'bg-white/[0.025]' : ''"
        >
          <td class="px-3 py-3 text-[var(--exile-color-text-secondary)] tabular-nums whitespace-nowrap">{{ i + 1 }}</td>
          <td class="px-3 py-3 whitespace-nowrap">
            <div class="flex items-center gap-2 whitespace-nowrap">
              <img v-if="p.icon" :src="p.icon" :alt="p.text" class="w-6 h-6 object-contain shrink-0" loading="lazy" />
              <!-- 名前に乗せると色が変わる (下線の点線はチカチカするので外した、2026-10-09)。名前にカーソルでゲームと同じカード (ユニーク装備価格推移と同じ。オーナー 2026-09-26「列でホバーしちゃうね」) -->
              <span
                class="g-hover-name text-[var(--exile-color-text-primary)]"
                @mouseenter="(ev) => emit('hover', p, ev)"
                @mousemove="(ev) => emit('move', ev)"
                @mouseleave="emit('leave')"
                >{{ jaCurrency(p.text) }}</span
              >
            </div>
          </td>
          <td class="px-2 py-3 text-right">
            <div class="flex items-center justify-end gap-1 text-sm tabular-nums">
              <span class="text-[var(--exile-color-accent-focus)]">{{ fmt(cells.get(p.apiId)!.main.value) }}</span>
              <img v-if="iconOf(cells.get(p.apiId)!.main.cur)" :src="iconOf(cells.get(p.apiId)!.main.cur)" :alt="cells.get(p.apiId)!.main.label" class="w-5 h-5 object-contain" loading="lazy" />
              <span v-else class="text-xs text-[var(--exile-color-text-secondary)]">{{ cells.get(p.apiId)!.main.label }}</span>
            </div>
          </td>
          <!-- 取引の推奨: 一番安く交換できる通貨 -->
          <td class="px-2 py-3 text-right">
            <div v-if="cells.get(p.apiId)!.rec" class="flex items-center justify-end gap-1 text-xs tabular-nums text-[var(--exile-color-text-secondary)]" :title="`${cells.get(p.apiId)!.rec!.label}で交換するのが一番安い (取引所のペアの値)`">
              <!-- いつも「数字/個」の形 (51.4/個 カオス)。オーナー 2026-09-26「/個にしようか、数字の後」 -->
              <span>{{ fmt(cells.get(p.apiId)!.rec!.value) }}/個</span>
              <img v-if="iconOf(cells.get(p.apiId)!.rec!.cur)" :src="iconOf(cells.get(p.apiId)!.rec!.cur)" :alt="cells.get(p.apiId)!.rec!.label" class="w-4 h-4 object-contain" loading="lazy" />
              <span>{{ cells.get(p.apiId)!.rec!.label }}</span>
            </div>
            <div v-else class="text-xs text-[var(--exile-color-text-tertiary)]" title="値段の列と同じ通貨か、取引所のペアが無い">—</div>
          </td>
          <td class="px-2 py-3">
            <Sparkline v-if="rowTrend(p) && rowTrend(p)!.spark.length >= 2" :trend="rowTrend(p)!" class="gap-2" />
            <div v-else class="text-right text-xs text-[var(--exile-color-text-tertiary)] pr-1">—</div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
