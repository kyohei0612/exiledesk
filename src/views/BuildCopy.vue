<!--
  BuildCopy.vue — 忍者ビルドコピー (2026-09-26)

  オーナー:「ビルドを真似するときに忍者の UI 使いづらすぎて、こっちのアプリでコピペしたい」
  「装備から何から何までトータル何神かかるかと、それぞれトレード2へ行けるようにリスト化。ルーンはルーンで何にいくら、
   被ってる奴は ×3。スキル関係はいいとして、サポジェムの特にリネージュサポートだけ抜き出して値段。UI はシンプルかつ分かりやすく」。
  2026-09-27「クラフト計算機にならって色々色付けてわかりやすくかつシンプルに」「読み込み後の完了まで、いまなにしてますよーって」。
  poe.ninja のビルドページの URL か「PoB のコード」を貼る → ① 読み込み ② 取引所の相場 (進み具合は BuildProgress) → 合計と一覧。
    views/build-copy/useBuildCopy.ts        読み込み・値段・合計 (段は useRareTiers、取引所は useAutoPrices)
    services/build-copy/*                   PoB / poe.ninja の読み方、相場、レアの検索の組み方と自動取得
    components/build-copy/BuildItemRow      装備 1 つ (値段・どこで取れたか・トレード2へ・MOD と段)
    components/build-copy/BuildBulkTable    ルーン / リネージュサポートの表 (× 個数)
-->
<script setup lang="ts">
import { computed } from "vue";
import BaseCard from "../components/decor/BaseCard.vue";
import CurrencyPicker from "../components/vaal-scales/CurrencyPicker.vue";
import BuildItemRow from "../components/build-copy/BuildItemRow.vue";
import BuildBulkTable from "../components/build-copy/BuildBulkTable.vue";
import BuildProgress from "../components/build-copy/BuildProgress.vue";
import { displayCurrency } from "../state/display-currency";
import { useBuildCopy } from "./build-copy/useBuildCopy";

const b = useBuildCopy();
const money = (ex: number) => displayCurrency.money(ex);
const a = b.auto;
/** 今取っている品物の名前 (進み具合に出す) */
const currentName = computed(() => {
  const i = a.current.value;
  const r = i == null ? null : b.items.value.find((x) => x.i === i);
  return r ? `${r.item.slot} ${r.nameJa}` : null;
});
/** 合計の内訳 (ユニーク / レア / ルーン / リネージュ) */
const parts = computed(() => {
  const sum = (xs: Array<number | null>) => xs.reduce<number>((s, v) => s + (v ?? 0), 0);
  return [
    { label: "ユニーク", value: sum(b.items.value.filter((r) => r.src === "unique").map((r) => r.price)) },
    { label: "レア", value: sum(b.items.value.filter((r) => r.src === "rare").map((r) => r.price)) },
    { label: "ルーン・ソウルコア", value: sum(b.runes.value.map((r) => (r.unit ?? 0) * r.count)) },
    { label: "リネージュサポート", value: sum(b.lineage.value.map((r) => (r.unit ?? 0) * r.count)) },
  ];
});
const busy = computed(() => b.loading.value || a.all.value);
</script>

<template>
  <div class="h-full overflow-auto p-4 @container">
    <div class="mb-4 flex items-start justify-between gap-4">
      <div>
        <h1 class="font-display text-xl tracking-[0.08em] text-[var(--exile-color-accent-focus)]">忍者ビルドコピー</h1>
        <p class="mt-1 text-xs text-[var(--exile-color-text-secondary)]">poe.ninja のビルドページの URL か「PoB のコード」を貼ると、そろえるのに要る物と値段を一覧にします。</p>
      </div>
      <CurrencyPicker />
    </div>

    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <textarea
          v-model="b.code.value"
          rows="2"
          placeholder="poe.ninja のビルドページの URL か、PoB のコード (eNrt… で始まる長い文字列) を貼る"
          class="w-full rounded border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-canvas)] px-3 py-2 font-mono text-[12px] focus:border-[var(--exile-color-accent-focus)] focus:outline-none"
        />
        <div class="mt-2 flex items-center gap-3">
          <button
            type="button"
            :disabled="busy || !b.code.value.trim()"
            class="rounded border border-[var(--exile-color-border-brass)] px-4 py-1.5 text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-40"
            @click="b.load()"
          >
            {{ busy ? "読み込み中…" : "読み込む" }}
          </button>
          <button
            v-if="(b.build.value || b.code.value) && !b.loading.value"
            type="button"
            class="rounded border border-[var(--exile-color-border-subtle)] px-3 py-1.5 text-[12px] text-[var(--exile-color-text-secondary)] hover:border-[var(--exile-color-accent-focus)] hover:text-[var(--exile-color-accent-focus)]"
            title="貼ったコードと読み込んだ一覧を消す"
            @click="b.clear()"
          >
            リセット
          </button>
          <span v-if="b.error.value" class="text-[12px] text-rose-300">{{ b.error.value }}</span>
        </div>
      </div>
    </BaseCard>

    <!-- 進み具合 (読み込み → 取引所の相場) -->
    <BuildProgress
      v-if="busy"
      :loading="b.loading.value"
      :progress="b.progress.value"
      :auto-all="a.all.value"
      :done="a.done.value"
      :total="a.total.value"
      :current-name="currentName"
      :current-step="a.currentStep.value"
      @stop="a.stop()"
    />

    <template v-if="b.build.value && !b.loading.value">
      <!-- 合計: 取引所の相場を取り終えてから (オーナー 2026-09-26「合計表示するのは全部取得終わってから」) -->
      <section v-if="!a.all.value" class="mb-4 rounded-xl border border-emerald-400/40 bg-emerald-500/[0.06] p-3">
        <div class="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <p class="text-[11px] opacity-70">{{ b.build.value.ascendancy || b.build.value.className }} · レベル {{ b.build.value.level }}</p>
            <p class="text-3xl font-bold tabular-nums text-emerald-300">合計 {{ money(b.totals.value.sum) }}</p>
          </div>
          <div class="grid flex-1 grid-cols-2 gap-2 @3xl:grid-cols-4">
            <div v-for="p in parts" :key="p.label" class="rounded-lg bg-black/30 px-2 py-1">
              <p class="text-[10px] opacity-60">{{ p.label }}</p>
              <p class="tabular-nums">{{ money(p.value) }}</p>
            </div>
          </div>
          <button type="button" class="rounded-lg border border-white/20 px-2 py-1 text-[11px] hover:bg-white/5" title="今の段・割合で、取引所の相場を全部取り直す" @click="a.run()">相場を取り直す</button>
        </div>
        <p v-if="b.totals.value.rares || b.totals.value.unknown" class="mt-2 text-[11px] text-amber-200/90">
          <template v-if="b.totals.value.rares">値段の無いレア {{ b.totals.value.rares }} 点 (出品なし・ジュエル) </template>
          <template v-if="b.totals.value.unknown">· 相場の無い物 {{ b.totals.value.unknown }} 件 </template>
          は合計に入っていません。見た値段を行に打つと足します
        </p>
      </section>

      <!-- 装備 -->
      <div class="mb-2 flex flex-wrap items-center gap-2 text-[10px]">
        <b class="text-sm">装備</b>
        <span class="opacity-60">値段の札:</span>
        <span class="rounded-full bg-emerald-500/20 px-1.5 text-emerald-300">完成品</span>
        <span class="rounded-full bg-sky-500/20 px-1.5 text-sky-300">段を下げて</span>
        <span class="rounded-full bg-amber-500/20 px-1.5 text-amber-200">MOD を外して / 数値なし</span>
        <span class="rounded-full bg-violet-500/20 px-1.5 text-violet-200">取引所の最安値 (ユニーク)</span>
        <span class="rounded-full bg-rose-500/20 px-1.5 text-rose-300">出品なし</span>
      </div>
      <div class="mb-4 space-y-2">
        <BuildItemRow
          v-for="r in b.items.value"
          :key="r.i"
          :r="r"
          :auto-busy="a.busy.value"
          @trade="b.tradeItem(r)"
          @link="b.tradeLink"
          @tier="(k, t) => b.pickTier(r.i, k, t)"
          @lower="b.lowerTiers(r.i)"
          @raise="b.raiseTiers(r.i)"
          @reset="b.resetTiers(r.i)"
          @manual="(amt, cur) => b.setManual(r.i, amt, cur)"
          @auto="a.run(r.i)"
        />
      </div>
      <div class="grid grid-cols-1 gap-4 @5xl:grid-cols-2">
        <BuildBulkTable title="ルーン・ソウルコア" :rows="b.runes.value" empty="差しているルーンはありません" />
        <BuildBulkTable title="リネージュサポート" :rows="b.lineage.value" gem empty="リネージュサポートは使っていません" />
      </div>
      <p class="mt-3 text-[10px] text-[var(--exile-color-text-tertiary)]">
        ユニーク: poe.ninja の相場 (コラプトしていない純正品)。種類違い・ソケットのある物は取引所で同じ物の最安値 (コラプト問わず) / ルーン・リネージュサポート: poe2scout の相場 /
        レア: 取引所で MOD の組み合わせを数値なしで確かめ、無ければ付きやすい MOD から外す → 選んだ段 (品質・防御値・ソケットも) → 1 段下げ → 2 段下げ。値段は安い方 5 件の真ん中、数値なしで止まった時は平均。
        「トレード2へ」は値段を取った検索を開きます。ジュエルは手入れのみ。
      </p>
    </template>
  </div>
</template>
