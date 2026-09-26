<!--
  WatchTable.vue — 監視中の一覧 (期待値 / 3 条件の最安と捣き速度 / 並べ替え)
  2026-09-19 に GemWatch.vue から切り出した。中身は変えていない。
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import BaseCard from "../../components/decor/BaseCard.vue";
import { GEMS } from "../gem-corrupt/useGemCorrupt";
import { SALE_KEYS, SALE_KEY_LABEL, watchKey } from "../gem-corrupt/row-query";
import { expectedValueOf } from "../gem-corrupt/expected-value";
import { jaSkill } from "../../i18n/skills-ja";
import { flowSentence, fmtSellTime, summarizeFlow, type FlowStore } from "../../services/market-flow";
import { averageExalted, displayCurrency, medianExalted, MEDIAN_MIN_SALES } from "../../state/display-currency";
import { openGemCorrupt } from "../../state/app-nav";
import type { WatchGem } from "../../state/watch-settings";

const props = defineProps<{
  gems: WatchGem[];
  flowStore: FlowStore | null;
  /** 期待値を出す回数 (上の「回数」プルダウン。オーナー指示 2026-09-20:「5 ずつ 100 まで回数した時の期待値収益」) */
  attempts?: number;
}>();
const emit = defineEmits<{ remove: [en: string]; openSold: [en: string, key: (typeof SALE_KEYS)[number] | null] }>();
const gems = computed(() => props.gems);
const flowStore = computed(() => props.flowStore);
const openSold = (en: string, key: (typeof SALE_KEYS)[number] | null): void => emit("openSold", en, key);
const remove = (en: string): void => emit("remove", en);

/**
 * 期待値を出す時の試行回数。既定 30 (オーナー指示 2026-09-17:「期待値は 30 回回した時の期待値で」)。
 * 2026-09-20 からは画面の「回数」プルダウンで 5〜100 に変えられる (props.attempts)。
 */
const EV_ATTEMPTS = computed(() => (props.attempts && props.attempts > 0 ? props.attempts : 30));

/** スピリットジェムかどうか (期待値の素材が別物なので要る) */
const SPIRIT = new Map(GEMS.map((g) => [g.en, g.spirit]));

/**
 * 1 行分の計算。期待値は実売の中央値をジェムコラプトの賭けの式に入れて出し、画面には今の最安値を出す。
 * 「1 回回したら手元にいくら残るか」(期待値) を出す (オーナー指示 2026-09-17)。
 */
const scoredGems = computed(() => {
  return gems.value.map((gem) => {
    const cs = cells(gem.name);
    // 見出しを押した時の並べ替えと、21 / 23% を買う経路の**仕入れ値**は、画面に出ている今の最安値
    const price: Record<(typeof SALE_KEYS)[number], number | null> = { level21: null, quality23: null, finished: null };
    for (const c of cs) price[c.key] = c.cheapest;
    // 売値は**実売の中央値**で計算する (画面に出す最安値ではない。オーナー指示 2026-09-18:
    // 「並び順だけ上から 3 つの平均で期待値を出すだけ」。2026-09-26 監査で平均 → 中央値)
    // 売れた実績が無い条件は **売値 0 (売れない)** として計算する
    // (オーナー指示 2026-09-19:「判定待ちは売れてない判定でおｋ。売れない = 遅いでおｋだし、
    //  遅いは 0 として期待値出して」)。追跡記録そのものが無い条件だけ null にして、
    // 3 条件とも記録が無いジェムは今まで通り「—」にする (見ていないだけで、売れないとは言えないため)。
    // この 0 はあくまで**売値**。以前は同じ値を 21 / 23% を買う経路の仕入れ値にも使っていたので、
    // 売れていない条件を 0 で買えることになり、30 回で +16,000 高貴のような偽の黒字が出ていた (2026-09-26 監査)
    const sale: Record<(typeof SALE_KEYS)[number], number | null> = { level21: null, quality23: null, finished: null };
    for (const c of cs) sale[c.key] = c.soldExalted ?? (c.records > 0 ? 0 : null);
    const e = expectedValueOf({ spirit: SPIRIT.get(gem.name) ?? false, en: gem.name }, sale, price);
    // 売値が 1〜2 件の実売から出ている条件 (根拠が薄い)
    const thinKeys = cs.filter((c) => c.soldThin).map((c) => c.label);
    return {
      ...gem,
      cells: cs,
      price,
      thinKeys,
      /** 30 回回した時の期待収支 */
      ev: e ? e.ev * EV_ATTEMPTS.value : null,
      /** 1 回あたりの期待収支 */
      evPer1: e?.ev ?? null,
      evRoute: e?.route.label ?? "",
      evRoi: e?.roi ?? null,
      evUpfront: e?.route.upfront ?? null,
    };
  });
});

/**
 * 並べ替え。売れる速さは関係なく、押した列の数字だけで並べる (オーナー 2026-09-26:「売れる速度関係なく並び替えは機能させて。
 * 期待値順、早さ優先でごちゃごちゃするから値段順でおｋ」。前は「速い」物を先に出してから数字で並べていた)。
 *   期待値: 期待値の高い順 / レベル 21・品質 23%・完成品: その条件の今の最安値の高い順
 * 記録が増えれば勝手に並び替わる (flowStore が変われば再計算される)
 */
type SortMode = "ev" | (typeof SALE_KEYS)[number];
const sortBy = ref<SortMode>("ev");
const sortedGems = computed(() => {
  const mode = sortBy.value;
  const rows = scoredGems.value.slice();
  const num = (v: number | null): number => (v == null ? Number.NEGATIVE_INFINITY : v);
  const key = (g: (typeof rows)[number]): number => num(mode === "ev" ? g.ev : g.price[mode]);
  rows.sort((a, b) => (key(a) !== key(b) ? key(b) - key(a) : num(b.ev) - num(a.ev) || a.name.localeCompare(b.name)));
  return rows;
});
// 回数のプルダウンを変えたら文も変わるように computed にする (起動時の回数で固まっていた。2026-09-26 監査)
const SORT_NOTE = computed<Record<SortMode, string>>(() => ({
  ev: `期待値 (${EV_ATTEMPTS.value} 回回した時の手残り) の高い順。売値は実際に売れた値段の中央値で、売れた実績が無い条件は「売れない = 0」として計算します (判定待ちも同じ扱い)。21 / 23% を買う経路の仕入れ値は今の最安値です。`,
  level21: "レベル 21 の今の最安値の高い順。",
  quality23: "品質 23% の今の最安値の高い順。",
  finished: "完成品の今の最安値の高い順。",
}));
function sortHead(mode: SortMode): string {
  return sortBy.value === mode ? "text-[var(--exile-color-accent-focus)]" : "hover:text-[var(--exile-color-text-secondary)]";
}

// ---- 監視中の状態 ----
function cells(en: string) {
  return SALE_KEYS.map((k) => {
    const st = flowStore.value?.states?.[watchKey(en, k)];
    const f = summarizeFlow(st);
    const watched = flowStore.value?.watches?.some((w) => w.key === watchKey(en, k));
    /**
     * 画面に出すのは**今の最安値** (オーナー指示 2026-09-18:
     * 「ここ平均じゃなくて現在の最安値ね表示は。並び順だけ上から 3 つの平均で期待値を出すだけで、
     *   売値の平均を表示は間違ってる」)。巡回のたびに更新される最安 1 件の値段。
     */
    const cheapest =
      st?.cheapest_amount != null && st.cheapest_currency
        ? averageExalted([{ amount: st.cheapest_amount, currency: st.cheapest_currency }])
        : null;
    /**
     * 期待値の売値に使う実売の中央値 (画面には出さない)。
     * 2026-09-26 監査で平均 → 中央値。3 件未満 (1〜2 件) でも使うが、根拠が薄いと印を付ける
     */
    const med = medianExalted(f.soldPrices);
    const parts = [f.gone > 0 ? fmtSellTime(f.medianMin) : "", cheapest != null ? displayCurrency.money(cheapest) : ""].filter(Boolean);
    return {
      key: k,
      /** 期待値に渡す実売の中央値 (高貴建て)。売れた実績が無ければ null */
      soldExalted: med?.value ?? null,
      /** 実売が MEDIAN_MIN_SALES 件未満 (1〜2 件) で、売値の根拠が薄い */
      soldThin: med?.thin ?? false,
      /** 追跡記録の件数 (並んでいる / 確定待ち / 売れた / 不明。付け替えは除く) */
      records: f.gone + f.alive + f.pending + f.unknown,
      /** 並べ替えと表示に使う今の最安値 (高貴建て) */
      cheapest,
      label: SALE_KEY_LABEL[k],
      // 根拠が 3 件未満の判定には「?」を付ける (札しか見えない一覧で区別が付くように。2026-09-20)
      verdict:
        (f.thin ? `${f.label}?` : f.label) ||
        (f.firstLook && f.alive > 0
          ? "次回の取得で判定"
          : f.gone + f.alive + f.pending + f.unknown > 0
            ? `判定待ち ${f.gone + f.alive + f.pending + f.unknown} 件`
            : watched
              ? "巡回待ち"
              : "未登録"),
      // 判定の横: 売れるまでの時間と、今の最安値
      detail: parts.join(" · "),
      title: `${flowSentence(f)}${
        med != null
          ? `。売れた値段の中央値は ${displayCurrency.money(med.value)} (${med.n} 件、期待値の計算に使う値)${med.thin ? `。${MEDIAN_MIN_SALES} 件未満なので根拠が薄い値です` : ""}`
          : ""
      }`,
      tone: f.tone,
      gone: f.gone,
      alive: f.alive,
    };
  });
}
function toneClass(tone: string): string {
  switch (tone) {
    case "fast":
      return "text-emerald-300";
    case "normal":
      return "text-amber-200";
    case "slow":
      return "text-rose-300";
    default:
      return "text-[var(--exile-color-text-tertiary)]";
  }
}
</script>

<template>
    <BaseCard>
      <div class="p-4 pl-5">
        <h3 class="font-display tracking-[0.06em] text-[var(--exile-color-accent-focus)] text-[13px] mb-1">監視中 ({{ gems.length }} ジェム)</h3>
        <!-- 一括取得 / 自動取得の間隔 などの操作 (親から差し込む。オーナー指示 2026-09-20:
             「監視中ジェムに一括取得ボタンと自動取得の間隔プルダウンを置こうか」) -->
        <div class="mb-2"><slot name="controls" /></div>
        <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mb-2">
          {{ SORT_NOTE[sortBy] }}記録が増えると自動で並び替わります (見出しを押すと並べ替えが変わります)。
        </p>
        <p v-if="gems.length === 0" class="text-[12px] text-[var(--exile-color-text-tertiary)]">
          まだ 1 つもありません。下の「ジェムを足す」か、「使用率ランキング」の「監視へ +」で入れてください (7 ジェムまで)。
        </p>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-[12px]">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <!-- 一番左が期待値。見出しを押すとその条件で並べ替える (オーナー指示 2026-09-17) -->
                <th class="text-left font-normal pb-1 whitespace-nowrap">
                  <button type="button" class="underline decoration-dotted" :class="sortHead('ev')" :title="`${EV_ATTEMPTS} 回回した時の手残り (期待値) の高い順に並べる。売値は実際に売れた値段の中央値 (21 / 23% を買う経路の仕入れ値は今の最安値)、素材はジェムコラプトの賭けと同じ (相場と取引所の繰り上げ単価の安い方)、前提の確率は既定値です`" @click="sortBy = 'ev'">
                    期待値{{ sortBy === "ev" ? " ▼" : "" }}
                  </button>
                </th>
                <th class="text-left font-normal pb-1 pl-3">ジェム</th>
                <th class="text-left font-normal pb-1 pl-3">使用状況</th>
                <th v-for="k in SALE_KEYS" :key="k" class="text-left font-normal pb-1 pl-3">
                  <button type="button" class="underline decoration-dotted" :class="sortHead(k)" :title="`${SALE_KEY_LABEL[k]} の今の最安値が高い順に並べる`" @click="sortBy = k">
                    {{ SALE_KEY_LABEL[k] }}{{ sortBy === k ? " ▼" : "" }}
                  </button>
                </th>
                <th class="pb-1 pl-3"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="gem in sortedGems" :key="gem.name" class="border-t border-[var(--exile-color-border-subtle)]">
                <td class="py-1.5 whitespace-nowrap">
                  <span
                    v-if="gem.ev != null"
                    class="text-[12px]"
                    :class="gem.ev > 0 ? 'text-emerald-300' : gem.ev < 0 ? 'text-rose-300' : 'text-[var(--exile-color-text-tertiary)]'"
                    :title="`${EV_ATTEMPTS} 回回した時の期待収支 ${displayCurrency.money(gem.ev, { signed: true, round: 'down' })} (1 回あたり ${displayCurrency.money(gem.evPer1, { signed: true })})
入り方: ${gem.evRoute}${gem.evRoi != null ? ` · 利回り ${(gem.evRoi * 100).toFixed(0)}%` : ''}${gem.evUpfront ? ` · 1 回の元手 ${displayCurrency.money(gem.evUpfront, { round: 'up' })} (${EV_ATTEMPTS} 回で ${displayCurrency.money(gem.evUpfront * EV_ATTEMPTS, { round: 'up' })})` : ''}
売値は実際に売れた値段の中央値、21 / 23% の仕入れ値は今の最安値を使っています${gem.thinKeys.length ? `
根拠が薄い売値 (売れたのが ${MEDIAN_MIN_SALES} 件未満): ${gem.thinKeys.join(' / ')}` : ''}`"
                  >
                    <!-- 収入は切り下げ (オーナー指示 2026-09-20:「基本経費は多く、収入は厳しく」) -->
                    {{ displayCurrency.money(gem.ev, { signed: true, round: "down" }) }}
                    <!-- 最も得な入り方 (オーナー指示 2026-09-20:「最も得な期待値 (23% 買った時とか、完成品買った時とか、自作なのか)」) -->
                    <span v-if="gem.evRoute" class="block text-[10px] text-[var(--exile-color-text-tertiary)] whitespace-nowrap">{{ gem.evRoute }}</span>
                  </span>
                  <span v-else class="text-[11px] text-[var(--exile-color-text-tertiary)]" title="売れた記録か素材の相場がまだ足りません">—</span>
                </td>
                <td class="py-1.5 pl-3">
                  {{ jaSkill(gem.name) }}
                  <span class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ gem.name }}</span>
                </td>
                <td class="py-1.5 pl-3 text-[11px] text-[var(--exile-color-text-tertiary)]">{{ gem.note }}</td>
                <td v-for="c in gem.cells" :key="c.key" class="py-1.5 pl-3">
                  <button type="button" class="text-[11px] hover:underline text-left" :class="toneClass(c.tone)" :title="`${c.label}: ${c.title} (押すと記録の一覧)`" @click="openSold(gem.name, c.key)">
                    {{ c.verdict }}<span v-if="c.detail" class="ml-1 text-[10px] text-[var(--exile-color-text-tertiary)]">{{ c.detail }}</span>
                  </button>
                </td>
                <td class="py-1.5 pl-3 text-right whitespace-nowrap">
                  <button type="button" class="text-[11px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]" title="ジェムコラプトの賭けでこのジェムを計算する" @click="openGemCorrupt(gem.name)">計算 ↗</button>
                  <!-- オーナー指示 2026-09-17: 固定は消して、代わりに売り履歴 (3 条件まとめて) を出す -->
                  <button
                    type="button"
                    class="ml-3 text-[11px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]"
                    title="このジェムの売れたリスト (値段・出品者・並んでいた時間) を 3 条件まとめて見る"
                    @click="openSold(gem.name, null)"
                  >
                    📋 売り履歴
                  </button>
                  <!-- 上位から自動で入った分も外せる (オーナー指示 2026-09-20)。外した分は「リストを元に戻す」で戻る -->
                  <button
                    type="button"
                    class="ml-3 text-[11px] underline text-[var(--exile-color-text-tertiary)] hover:text-rose-300"
                    :title="
                      gem.manual
                        ? 'このジェムを監視リストから削除します (記録は残るので、7 日以内に戻せば続きから追えます)'
                        : '使用率ランキングの上位から入った分を外します。次の順位が繰り上がります (「リストを元に戻す」でいつでも戻せます)'
                    "
                    @click="remove(gem.name)"
                  >
                    🗑 リストから削除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </BaseCard>
</template>
