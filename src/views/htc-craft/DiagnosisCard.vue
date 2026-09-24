<script setup lang="ts">
/**
 * DiagnosisCard.vue — MOD 解析 + ベース診断 (2026-09-24)
 *
 * オーナー:「MOD 解析も別に表示せずに、MOD 解析 + ベース診断まで直通で通していいよ。その結果だけ
 * 分かりやすく簡潔に表示したらおけ」。細かい表は HtcCraftLab の「詳しく」に畳んである。
 *
 * 3 枚 (オーナー 2026-09-24:「ベースの所で複数選択で開始フラクチャー選びたい。その時点で検索かけたいから取得は手動。
 * 完成品こそ一番ゆるく。真ん中は結果表示、取得後に表示する形で徐々に」):
 *   ベース (固定済みにして始める MOD を選んで「探す」) / 始め方の結果 (取れた物から安い順) / 完成品と比べる
 * 取引所へは「探す」を押した時だけ ([[useStartSearch.ts]])。
 */
import { computed } from "vue";
import { sideLimits } from "../../services/htc/bridge";
import { jaOfPastedLine } from "../../services/htc/mod-text";
import { openExternal } from "../../services/trade2/open-external";
import { zeroStart } from "./craft-settings";
import TreeFracturePanel from "./TreeFracturePanel.vue";
import SearchChecks from "./SearchChecks.vue";
import ModBreakdown from "./ModBreakdown.vue";
import { MAX_STARTS, useStartSearch } from "./useStartSearch";
import { useFinishedCompare } from "./useFinishedCompare";
import type { useHtcCraft } from "./useHtcCraft";

const props = defineProps<{ c: ReturnType<typeof useHtcCraft> }>();
const c = props.c;
const baseType = computed(() => c.item.value?.baseType ?? zeroStart.value.baseType);
const baseJa = computed(() => c.item.value?.baseText ?? c.bases.value.find((b) => b.current)?.ja ?? baseType.value ?? "");
const lim = computed(() => (c.data.value ? sideLimits(c.data.value, baseType.value) : { prefix: 3, suffix: 3 }));
/** 別のベースの方が合う時だけ 2 つまで (枠が違う・暗黙がタダ・品質の上限) */
const others = computed(() => c.bases.value.filter((b) => b.fits && !b.current && (b.maxQualityPlus || b.implicits.length)).slice(0, 2));
const quality = computed(() => c.item.value?.quality ?? zeroStart.value.quality);
/** 英語の行 (忍者のコピー) は日本語に */
const ja = (t: string): string => jaOfPastedLine(t) ?? t;
/** 完成品を買うのと作るのと (始め方で選んだ物の初動を足す) */
const fin = useFinishedCompare(c, computed(() => ss.chosen.value?.best?.cost ?? null));
/** 始め方: 選んで押した時だけ探す。候補を全部取ったら完成品を 1 本 */
const ss = useStartSearch(c, async () => { if (fin.query.value && !fin.found.value) await fin.search(); });
/** 候補をプレ / サフィに分ける (中は確率の高い順のまま) */
const candGroups = computed(() => [
  { title: "プレフィックス", list: ss.candidates.value.filter((x) => x.side === "P") },
  { title: "サフィックス", list: ss.candidates.value.filter((x) => x.side === "S") },
].filter((g) => g.list.length));
const pctOf = (p: number): string => `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`;
/** 取引所へ投げる回数の目安 (検索 + 取得で 2 回ずつ) */
const calls = computed(() => ss.checked.value.length * 6 + (fin.query.value && !fin.found.value ? 2 : 0));
</script>

<template>
  <div class="mb-3 text-xs">
    <!-- MOD 解析: 種類ごと・プレ / サフィごと (オーナー 2026-09-24) -->
    <ModBreakdown :c="c" />
    <div class="grid gap-2 lg:grid-cols-3">
      <!-- ベース + 固定済みにして始める MOD を選ぶ -->
      <section class="rounded-lg border border-white/15 bg-white/[0.04] p-3">
        <p class="mb-1 opacity-50">ベース</p>
        <p class="text-sm font-bold">{{ baseJa }}</p>
        <p class="opacity-70">プレ {{ lim.prefix }} / サフィ {{ lim.suffix }} 枠 ・ 品質 {{ quality }}%</p>
        <p v-if="c.dropOnly.value.length" class="mt-1">
          樹 MOD (固定済みで買う): <b>{{ c.dropOnly.value.map((d) => ja(d.text)).join(" / ") }}</b>
        </p>
        <p v-if="c.slots.value?.impossible" class="mt-1 text-rose-300">{{ c.slots.value.note }}</p>
        <p v-for="b in others" :key="b.baseType" class="mt-1 opacity-60">
          別のベースなら: {{ b.ja }} ({{ b.maxQualityPlus ? `品質上限 +${b.maxQualityPlus}%` : b.implicits.join(" / ") }})
        </p>

        <div v-if="ss.candidates.value.length" class="mt-3 border-t border-white/10 pt-2">
          <p class="mb-1 font-bold">固定済み (フラクチャー) にして始める MOD
            <span v-if="!c.dropOnly.value.length" class="font-normal opacity-50">{{ MAX_STARTS }} つまで</span>
          </p>
          <!-- 樹 MOD がある時は樹 MOD の固定だけ (スパムで消えるので必ず固定。選ばせない) -->
          <p v-if="c.dropOnly.value.length" class="opacity-80">
            🔒 樹 MOD を固定 <span class="opacity-60">(樹 MOD はクラフトで付け直せず、スパムや消去で消えるので必ず固定。ほかの MOD は選べません)</span>
          </p>
          <!-- プレ / サフィに分けて、ベースに付く確率の高い順 (オーナー 2026-09-24) -->
          <template v-else>
            <div v-for="g in candGroups" :key="g.title" class="mb-1">
              <p class="opacity-60">{{ g.title }} <span class="opacity-70">(% = その側に 1 回付けて出る確率、狙いの段以上)</span></p>
              <label v-for="x in g.list" :key="x.key" class="flex items-center gap-1 pl-1" :class="ss.locked(x.key) ? 'opacity-40' : ''">
                <input v-model="ss.checked.value" type="checkbox" :value="x.key" :disabled="ss.locked(x.key) || ss.busy.value" />
                <span class="flex-1">{{ x.name }}</span>
                <b class="tabular-nums">{{ x.chance != null ? pctOf(x.chance) : "?" }}</b>
              </label>
            </div>
          </template>
          <button type="button" class="mt-2 rounded border border-sky-600 px-2 py-0.5 disabled:opacity-40" :disabled="ss.busy.value || !ss.checked.value.length" @click="ss.searchAll()">
            {{ ss.busy.value ? "探しています…" : c.dropOnly.value.length ? "取引所で探す (樹 MOD + 完成品)" : `取引所で探す (${ss.checked.value.length} つ + 完成品)` }}
          </button>
          <p class="mt-1 opacity-50">1 つにつき 固定済み / 固定無し・厳しい / ゆるい の 3 本。取引所へ約 {{ calls }} 回 (5 分 20 回まで、30 分は覚えておく)</p>
        </div>
      </section>

      <!-- 始め方の結果 (取れた物から、初動の安い順) -->
      <section class="rounded-lg border border-white/15 bg-white/[0.04] p-3">
        <p class="mb-1 opacity-50">始め方 (初動の安い順)</p>
        <p v-if="!ss.rows.value.some((r) => r.res || r.waiting)" class="opacity-50">{{ c.dropOnly.value.length ? "左の「取引所で探す」" : "左で MOD を選んで「取引所で探す」" }}を押すと、取れた物からここに出ます</p>
        <div v-for="r in ss.rows.value" :key="r.key" class="mb-2" :class="!r.res && !r.waiting ? 'opacity-40' : ''">
          <label class="flex items-center gap-2">
            <input type="radio" :checked="ss.chosen.value?.key === r.key" :disabled="!r.best" @change="ss.choose(r.key)" />
            <b>{{ r.name }}</b>
            <span class="ml-auto">
              <span v-if="r.waiting" class="opacity-70">取得中…</span>
              <span v-else-if="r.res === 'error'" class="text-rose-300">取れず</span>
              <b v-else-if="r.best" class="text-[13px]">{{ c.money(r.best.cost!) }}</b>
              <span v-else-if="r.res" class="opacity-60">どれも選べない</span>
              <span v-else class="opacity-50">まだ</span>
            </span>
          </label>
          <div v-for="o in r.sub" :key="o.id" class="pl-5" :class="o.cost == null ? 'opacity-50' : ''">
            {{ o.label }}: <b>{{ o.cost != null ? c.money(o.cost) : o.status }}</b>
            <button v-if="o.link" type="button" class="ml-1 text-sky-300 underline" @click="openExternal(o.link.url)">{{ o.link.text }} →</button>
            <span v-if="o.note" class="block pl-2 opacity-50">{{ o.note }}</span>
          </div>
        </div>
        <SearchChecks v-if="c.treeResult.value" :c="c" />
      </section>

      <!-- 完成品を買うのと比べる。条件は一番ゆるく (MOD だけ、固定済みかは問わない) -->
      <section class="rounded-lg border border-white/15 bg-white/[0.04] p-3">
        <p class="mb-1 flex items-center gap-2 opacity-50">
          完成品と比べる
          <button v-if="fin.query.value && !ss.busy.value" type="button" class="rounded border border-sky-600 px-1 opacity-100" :disabled="fin.busy.value" @click="fin.search()">
            {{ fin.busy.value ? "探しています…" : fin.found.value ? "探し直す" : "完成品だけ探す" }}
          </button>
        </p>
        <p>
          完成品を買う: <b class="text-[13px]">{{ fin.buyCost.value != null ? c.money(fin.buyCost.value) : fin.found.value ? "出品なし" : fin.busy.value ? "取得中…" : "まだ" }}</b>
          <!-- 取引所に無い時だけ手で埋める -->
          <span v-if="fin.found.value && fin.found.value.min == null" class="ml-1 opacity-80">
            手で入れる <input v-model.number="fin.manual.value" type="number" min="0" class="num w-14" /> 神
          </span>
          <button v-if="fin.found.value?.url" type="button" class="ml-1 text-sky-300 underline" @click="openExternal(fin.found.value.url)">{{ fin.found.value.total }} 件 →</button>
        </p>
        <p class="opacity-50">条件は MOD だけ (固定済みかどうかは問わない)</p>
        <p class="mt-1">作る見込み: <b class="text-[13px]">{{ fin.craftCost.value != null && ss.chosen.value ? c.money(fin.craftCost.value) : "-" }}</b></p>
        <p class="opacity-50">始め方の初動 + {{ fin.craftBasis.value }}。目安で、下の作り方で回すと正確になります</p>
        <p v-if="fin.verdict.value && ss.chosen.value" class="mt-2 rounded bg-black/20 px-2 py-1">
          → <b :class="fin.verdict.value.buy ? 'text-amber-300' : 'text-emerald-300'">{{ fin.verdict.value.buy ? "完成品を買う" : "作る" }}</b>
          方が {{ c.money(fin.verdict.value.diff) }} 安い
        </p>
        <p v-if="fin.error.value" class="mt-1 text-rose-300">{{ fin.error.value }}</p>
      </section>
    </div>

    <details v-if="c.treeResult.value" class="mt-2">
      <summary class="cursor-pointer opacity-50">固定済み・固定無しの詳しい表</summary>
      <TreeFracturePanel :c="c" />
    </details>
  </div>
</template>
