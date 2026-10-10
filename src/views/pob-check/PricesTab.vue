<!--
  PricesTab.vue — 火力チェックのタブ「値段」(2026-10-03。旧 忍者ビルドコピー BuildCopy.vue の本体を移した)

  オーナー 2026-10-03「忍者ビルドコピーは火力チェックに統合。値段は『取る』ボタンを押した分だけ (自動では走らない)。ビルドコピーの画面は無くす」。
  元の要望 (2026-09-26):「装備から何から何までトータル何神かかるかと、それぞれトレード2へ行けるようにリスト化。ルーンはルーンで何にいくら、
  被ってる奴は ×3。サポジェムの特にリネージュサポートだけ抜き出して値段。UI はシンプルかつ分かりやすく」。
    コードの貼り付け欄は無い。火力チェックが読んだ PoB コード (自分 = lastSource.code / 相手 = targetCode) を受け取り、
    コードが変わったら解析だけ自動 (ローカル、通信なし)。値段 (poe.ninja / poe2scout / 取引所) は「値段を取る」を押した時だけ。
    自分と相手は useBuildCopy を 1 つずつ持つ (取った値段を別々に残す)。取引所は 1 つずつなので、片方が取っている間はもう片方は押せない。
    views/build-copy/useBuildCopy.ts        解析・値段・合計 (ティアは useRareTiers、取引所は useAutoPrices)
    services/build-copy/*                   PoB の読み方、相場、レアの検索の組み方と自動取得
    components/build-copy/BuildItemRow      装備 1 つ (値段・どこで取れたか・トレード2へ・MOD とティア)
    components/build-copy/BuildBulkTable    ルーン / リネージュサポートの表 (× 個数)
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import CurrencyPicker from "../../components/vaal-scales/CurrencyPicker.vue";
import BuildItemRow from "../../components/build-copy/BuildItemRow.vue";
import BuildBulkTable from "../../components/build-copy/BuildBulkTable.vue";
import BuildProgress from "../../components/build-copy/BuildProgress.vue";
import { displayCurrency } from "../../state/display-currency";
import { useBuildCopy } from "../build-copy/useBuildCopy";
import { tradeButton, tradeLock } from "../../state/trade-lock";

const props = defineProps<{
  /** 自分 = 火力チェックが読んだ PoB コード (読み直し・全部戻すで変わる) */
  mineCode: string | null;
  /** 相手 = 「比べる相手」を読み込んだ時のコード。無ければ「相手」は選べない */
  targetCode: string | null;
}>();

const mine = useBuildCopy("mine");
const other = useBuildCopy("target");
type Who = "mine" | "target";
const who = ref<Who>("mine");
const b = computed(() => (who.value === "mine" ? mine : other));
/** 今見ていない方 (取引所を使っていたら、こちらのボタンは押せない) */
const rest = computed(() => (who.value === "mine" ? other : mine));

// コードが変わったら解析だけ (ローカル)。値段はここでは取らない
watch(() => props.mineCode, (c) => void mine.load(c ?? ""), { immediate: true });
watch(
  () => props.targetCode,
  (c) => {
    void other.load(c ?? "");
    // 相手を外したら自分に戻す
    if (!c && who.value === "target") who.value = "mine";
  },
  { immediate: true },
);

const money = (ex: number) => displayCurrency.money(ex);
const a = computed(() => b.value.auto);
/** 今取っている品物の名前 (進み具合に出す) */
const currentName = computed(() => {
  const i = a.value.current.value;
  const r = i == null ? null : b.value.items.value.find((x) => x.i === i);
  return r ? `${r.item.slot} ${r.nameJa}` : null;
});
/** 合計の内訳 (ユニーク / レア / ルーン / リネージュ) */
const parts = computed(() => {
  const sum = (xs: Array<number | null>) => xs.reduce<number>((s, v) => s + (v ?? 0), 0);
  const x = b.value;
  return [
    { label: "ユニーク", value: sum(x.items.value.filter((r) => r.src === "unique").map((r) => r.price)) },
    { label: "レア", value: sum(x.items.value.filter((r) => r.src === "rare").map((r) => r.price)) },
    { label: "ルーン・ソウルコア", value: sum(x.runes.value.map((r) => (r.unit ?? 0) * r.count)) },
    { label: "リネージュサポート", value: sum(x.lineage.value.map((r) => (r.unit ?? 0) * r.count)) },
  ];
});
/** 取っている途中 (相場を読んでいる / 取引所を回っている) */
const fetching = (x: typeof mine) => x.pricing.value || x.auto.all.value;
/** どちらかが取引所を使っている (行の「取り直す」も止める) */
const anyBusy = computed(() => mine.pricing.value || mine.auto.busy.value || other.pricing.value || other.auto.busy.value);
/**
 * 取るボタン (使用中 = 中止 / 中止した = 再開 / 他が使用中 = 押せない。オーナー 2026-09-27)。
 * もう片方 (自分 ↔ 相手) が取っている間も押せない (取引所の使用権は "build-copy" 1 つを 2 つで分け合うので、重ねると持ち主が入れ替わる)
 */
const tb = computed(() => {
  if (fetching(rest.value) || rest.value.auto.busy.value) return { label: `${who.value === "mine" ? "相手" : "自分"}の値段を取っています`, disabled: true, action: "start" as const };
  if (b.value.pricing.value) return { label: "取得中…", disabled: true, action: "start" as const };
  return tradeButton("build-copy", b.value.fetched.value ? "値段を取り直す" : "値段を取る");
});
function onTrade(): void {
  const act = tb.value.action;
  if (act === "stop") tradeLock.stop("build-copy");
  else void b.value.fetchPrices(act === "resume");
}
</script>

<template>
  <div class="@container">
    <div class="mb-3 flex flex-wrap items-center gap-3">
      <!-- 自分 / 相手 -->
      <!-- 自分 / 相手 の切り替え (選んでいる方を金で塗る。装備タブの武器セットと同じ見た目。2026-10-03) -->
      <span class="inline-flex overflow-hidden rounded-lg border border-white/15 text-[12px] font-semibold">
        <button
          type="button"
          class="h-7 px-3"
          :class="who === 'mine' ? 'bg-[var(--exile-color-accent-focus)] text-[var(--exile-color-bg-canvas)]' : 'text-[var(--exile-color-text-secondary)] hover:bg-white/10'"
          @click="who = 'mine'"
        >自分</button>
        <button
          type="button"
          class="h-7 px-3 disabled:opacity-40"
          :class="who === 'target' ? 'bg-[var(--exile-color-accent-focus)] text-[var(--exile-color-bg-canvas)]' : 'text-[var(--exile-color-text-secondary)] hover:bg-white/10'"
          :disabled="!targetCode"
          :title="targetCode ? '比べる相手の装備と値段' : '上の「比べる相手」を読み込むと選べます'"
          @click="who = 'target'"
        >相手</button>
      </span>
      <p class="note">
        読み込んだビルドをそろえるのに要る物の一覧。値段は「値段を取る」を押した時だけ取ります (自動では取りません)。
      </p>
      <span class="ml-auto"><CurrencyPicker /></span>
    </div>
    <p v-if="b.error.value" class="mb-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{{ b.error.value }}</p>

    <!-- 進み具合 (相場 → 取引所の相場) -->
    <BuildProgress
      v-if="fetching(b)"
      :loading="b.pricing.value"
      :progress="b.progress.value"
      :auto-all="a.all.value"
      :done="a.done.value"
      :total="a.total.value"
      :current-name="currentName"
      :current-step="a.waiting.value ? '取引所の枠が空くのを待っています (途中で制限にかからず回り切れるように。残りは下のタイマー)' : a.currentStep.value"
      @stop="tradeLock.stop('build-copy')"
    />

    <p v-if="!b.build.value && !b.loading.value && !b.error.value" class="mb-6 text-[12px] text-[var(--exile-color-text-secondary)]">
      {{ who === "mine" ? "ビルドを読み込むと、装備・ルーン・リネージュサポートがここに並びます。" : "相手を読み込むと、相手の装備がここに並びます。" }}
    </p>

    <template v-if="b.build.value && !b.loading.value">
      <!-- 合計: 取引所の相場を取り終えてから (オーナー 2026-09-26「合計表示するのは全部取得終わってから」)。取る前はボタンを促す -->
      <section v-if="!fetching(b)" class="card mb-4 p-3" :class="b.fetched.value ? 'border-emerald-400/40 bg-emerald-500/[0.06]' : ''">
        <div class="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <p class="note">{{ who === "mine" ? "自分" : "相手" }} · {{ b.build.value.ascendancy || b.build.value.className }} · レベル {{ b.build.value.level }}</p>
            <p v-if="b.fetched.value" class="text-3xl font-bold tabular-nums text-emerald-300">合計 {{ money(b.totals.value.sum) }}</p>
            <p v-else class="text-[12px] text-[var(--exile-color-text-secondary)]">「値段を取る」を押すと、poe.ninja / poe2scout の相場と取引所の最安値を取って合計を出します (1 点 10 秒ほど)</p>
          </div>
          <div v-if="b.fetched.value" class="grid flex-1 grid-cols-2 gap-2 @3xl:grid-cols-4">
            <div v-for="p in parts" :key="p.label" class="rounded-lg bg-black/30 px-2 py-1">
              <p class="text-[10px] opacity-60">{{ p.label }}</p>
              <p class="tabular-nums">{{ money(p.value) }}</p>
            </div>
          </div>
          <!-- 取るボタン: 取る前と再開は金の枠 (押してほしい)、取った後は普通の枠 (2026-10-03 他の画面の手動更新と同じ形に) -->
          <button
            type="button"
            :disabled="tb.disabled"
            class="btn btn-outline ml-auto"
            :class="tb.action === 'resume' || !b.fetched.value ? 'btn-accent' : ''"
            title="今のティア・割合で、取引所の相場を取る (再開は取れていない物だけ)"
            @click="onTrade"
          >{{ tb.label }}</button>
        </div>
        <p v-if="b.fetched.value && (b.totals.value.rares || b.totals.value.unknown)" class="mt-2 text-[11px] text-amber-200/90">
          <template v-if="b.totals.value.rares">値段の無いレア {{ b.totals.value.rares }} 点 (出品なし・ジュエル) </template>
          <template v-if="b.totals.value.unknown">· 相場の無い物 {{ b.totals.value.unknown }} 件 </template>
          は合計に入っていません。見た値段を行に打つと足します
        </p>
      </section>

      <!-- 装備 -->
      <div class="sec-title flex-wrap items-center gap-2">
        <span>装備</span>
        <span class="sec-note">値段の札:</span>
        <span class="flex flex-wrap gap-1 text-[10px] font-normal">
          <span class="rounded-full bg-emerald-500/20 px-1.5 text-emerald-300">完成品</span>
          <span class="rounded-full bg-sky-500/20 px-1.5 text-sky-300">ティアを下げて</span>
          <span class="rounded-full bg-amber-500/20 px-1.5 text-amber-200">MOD を外して / 数値なし</span>
          <span class="rounded-full bg-violet-500/20 px-1.5 text-violet-200">取引所の最安値 (ユニーク)</span>
          <span class="rounded-full bg-rose-500/20 px-1.5 text-rose-300">出品なし</span>
        </span>
      </div>
      <div class="mb-4 space-y-2">
        <BuildItemRow
          v-for="r in b.items.value"
          :key="`${who}-${r.i}`"
          :r="r"
          :auto-busy="anyBusy || !!tradeLock.busyOther('build-copy')"
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
      <p class="note mb-6 mt-3">
        ユニーク: poe.ninja の相場 (コラプトしていない純正品)。種類違い・ソケットのある物は取引所で同じ物の最安値 (コラプト問わず) / ルーン・リネージュサポート: poe2scout の相場 /
        レア: 取引所で MOD の組み合わせを数値なしで確かめ、無ければ付きやすい MOD から外す → 選んだティア (品質・防御値・ソケットも) → 1 つ下げ → 2 つ下げ。値段は安い方 5 件の真ん中、数値なしで止まった時は平均。
        「トレード2へ」は値段を取った検索を開きます。ジュエルは手入れのみ。
      </p>
    </template>
  </div>
</template>
