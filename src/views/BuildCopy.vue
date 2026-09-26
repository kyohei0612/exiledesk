<!--
  BuildCopy.vue — 忍者ビルドコピー (2026-09-26)

  オーナー:「ビルドを真似するときに忍者の UI 使いづらすぎて、こっちのアプリでコピペしたい」
  「装備から何から何までトータル何神かかるかと、それぞれトレード2へ行けるようにリスト化。ルーンはルーンで何にいくら、
   被ってる奴は ×3。スキル関係はいいとして、サポジェムの特にリネージュサポートだけ抜き出して値段。UI はシンプルかつ分かりやすく」。
  poe.ninja のビルドページの「PoB のコード」を貼る → 装備・ジュエル・フラスコ/チャーム・ルーン・リネージュサポートの一覧と合計。
    views/build-copy/useBuildCopy.ts        読み込み・値段・合計
    services/build-copy/pob.ts              PoB のコードを読む
    services/build-copy/prices.ts           ユニーク (poe.ninja) / カレンシー (poe2scout) / レアの検索
    components/build-copy/BuildItemTable     装備の表
    components/build-copy/BuildBulkTable     ルーン / リネージュサポートの表 (× 個数)
-->
<script setup lang="ts">
import BaseCard from "../components/decor/BaseCard.vue";
import CurrencyPicker from "../components/vaal-scales/CurrencyPicker.vue";
import BuildItemTable from "../components/build-copy/BuildItemTable.vue";
import BuildBulkTable from "../components/build-copy/BuildBulkTable.vue";
import { displayCurrency } from "../state/display-currency";
import { useBuildCopy } from "./build-copy/useBuildCopy";

const b = useBuildCopy();
const money = (ex: number) => displayCurrency.money(ex);
</script>

<template>
  <div class="h-full overflow-auto p-4 @container">
    <div class="flex items-start justify-between gap-4 mb-4">
      <div>
        <h1 class="font-display text-xl tracking-[0.08em] text-[var(--exile-color-accent-focus)]">忍者ビルドコピー</h1>
        <p class="text-xs text-[var(--exile-color-text-secondary)] mt-1">poe.ninja のビルドページの URL か「PoB のコード」を貼ると、そろえるのに要る物と値段を一覧にします。</p>
      </div>
      <CurrencyPicker />
    </div>

    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <textarea
          v-model="b.code.value"
          rows="3"
          placeholder="poe.ninja のビルドページの URL か、PoB のコード (eNrt… で始まる長い文字列) を貼る"
          class="w-full rounded bg-[var(--exile-color-bg-canvas)] border border-[var(--exile-color-border-subtle)] px-3 py-2 text-[12px] font-mono focus:outline-none focus:border-[var(--exile-color-accent-focus)]"
        />
        <div class="flex items-center gap-3 mt-2">
          <button
            type="button"
            :disabled="b.loading.value || !b.code.value.trim()"
            class="px-4 py-1.5 rounded border border-[var(--exile-color-border-brass)] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-40"
            @click="b.load()"
          >
            {{ b.loading.value ? "読み込み中…" : "読み込む" }}
          </button>
          <button
            v-if="(b.build.value || b.code.value) && !b.loading.value"
            type="button"
            class="px-3 py-1.5 rounded border border-[var(--exile-color-border-subtle)] text-[12px] text-[var(--exile-color-text-secondary)] hover:border-[var(--exile-color-accent-focus)] hover:text-[var(--exile-color-accent-focus)]"
            title="貼ったコードと読み込んだ一覧を消す"
            @click="b.clear()"
          >
            リセット
          </button>
          <span v-if="b.progress.value" class="text-[12px] text-[var(--exile-color-text-secondary)]">{{ b.progress.value }}</span>
          <span v-if="b.error.value" class="text-[12px] text-amber-300">{{ b.error.value }}</span>
        </div>
      </div>
    </BaseCard>

    <!-- 合計も表も、相場を全部取り終えてから出す (オーナー 2026-09-26「合計表示するのは全部取得終わってから」) -->
    <template v-if="b.build.value && !b.loading.value">
      <!-- 合計 -->
      <BaseCard class="mb-4">
        <div class="p-4 pl-5 flex items-center gap-6 flex-wrap">
          <div>
            <p class="text-[11px] text-[var(--exile-color-text-secondary)]">{{ b.build.value.ascendancy || b.build.value.className }} · レベル {{ b.build.value.level }}</p>
            <!-- 合計は取引所の相場を取り終えてから (途中の合計は出さない) -->
            <p v-if="b.autoAll.value" class="text-lg tabular-nums text-amber-300 mt-0.5">相場を取得中 {{ b.autoDone.value }} / {{ b.autoTotal.value }}…</p>
            <p v-else class="text-2xl tabular-nums text-[var(--exile-color-accent-focus)] mt-0.5">合計 {{ money(b.totals.value.sum) }}</p>
          </div>
          <div class="text-[12px] text-[var(--exile-color-text-secondary)] space-y-0.5">
            <p v-if="!b.autoAll.value && b.totals.value.rares">値段の無いレア {{ b.totals.value.rares }} 点は合計に入っていません (出品が無い物・ジュエル。「トレード2へ」で見た値段を行に打つと足します)</p>
            <!-- レアの相場を自動で (ジュエル以外。取引所の制限を守るので 1 回 10 秒ほど) -->
            <div class="flex items-center gap-2">
              <button
                v-if="!b.autoBusy.value"
                type="button"
                class="px-3 py-1 rounded border border-[var(--exile-color-border-brass)] text-[12px] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)]"
                title="レア (ジュエル以外) は MOD の組み合わせ → 段の順に、種類違いのあるユニークは同じ MOD の物を取引所で探して値段を入れます (取引所の制限を守るので数分かかります)"
                @click="b.autoPrices()"
              >
                相場を取り直す
              </button>
              <template v-else>
                <span class="text-[var(--exile-color-text-tertiary)]">取引所の制限を守るので 1 点 10〜40 秒ほど</span>
                <button type="button" class="px-2 py-0.5 rounded border border-[var(--exile-color-border-subtle)] text-[11px] hover:border-[var(--exile-color-accent-focus)]" @click="b.stopAuto()">止める</button>
              </template>
            </div>
            <p v-if="b.totals.value.unknown">相場の無い物 {{ b.totals.value.unknown }} 件 (合計に入っていません)</p>
          </div>
        </div>
      </BaseCard>

      <BuildItemTable :rows="b.items.value" class="mb-4" @trade="b.tradeItem" @link="b.tradeLink" @tier="b.pickTier" @lower="b.lowerTiers" @raise="b.raiseTiers" @reset="b.resetTiers" @manual="b.setManual" @auto="(i) => b.autoPrices(i)" :auto-busy="b.autoBusy.value" />
      <div class="grid grid-cols-1 @5xl:grid-cols-2 gap-4">
        <BuildBulkTable title="ルーン・ソウルコア" :rows="b.runes.value" empty="差しているルーンはありません" />
        <BuildBulkTable title="リネージュサポート" :rows="b.lineage.value" gem empty="リネージュサポートは使っていません" />
      </div>
      <p class="mt-3 text-[10px] text-[var(--exile-color-text-tertiary)]">
        ユニーク: poe.ninja の相場 (コラプトしていない純正品。種類違いのある物は「相場を取る」で同じ MOD の最安値) / ルーン・リネージュサポート: poe2scout の相場 /
        レア: 読み込んだら取引所で探します (MOD の組み合わせを数値なしで確かめ、無ければ付きやすい MOD から外す → 選んだ段・1 段下げ・2 段下げの順)。値段は安い方から 5 件の真ん中。ジュエルは手入れのみ。
      </p>
    </template>
  </div>
</template>
