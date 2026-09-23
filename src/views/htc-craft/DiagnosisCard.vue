<script setup lang="ts">
/**
 * DiagnosisCard.vue — MOD 解析 + ベース診断の結果だけを短く (2026-09-24)
 *
 * オーナー:「MOD 解析も別に表示せずに、MOD 解析 + ベース診断まで直通で通していいよ。その結果だけ
 * 分かりやすく簡潔に表示したらおけ」。細かい表は HtcCraftLab の「詳しく」に畳んである。
 */
import { computed, nextTick, watch } from "vue";
import { sideLimits } from "../../services/htc/bridge";
import { jaOfPastedLine } from "../../services/htc/mod-text";
import { openExternal } from "../../services/trade2/open-external";
import { zeroStart } from "./craft-settings";
import TreeFracturePanel from "./TreeFracturePanel.vue";
import SearchChecks from "./SearchChecks.vue";
import FractureCandidates from "./FractureCandidates.vue";
import { useFractureChoice } from "./useFractureChoice";
import { useFinishedCompare } from "./useFinishedCompare";
import type { useHtcCraft } from "./useHtcCraft";

const props = defineProps<{ c: ReturnType<typeof useHtcCraft> }>();
const c = props.c;
const baseType = computed(() => c.item.value?.baseType ?? zeroStart.value.baseType);
const baseJa = computed(() => c.item.value?.baseText ?? c.bases.value.find((b) => b.current)?.ja ?? baseType.value ?? "");
const lim = computed(() => (c.data.value ? sideLimits(c.data.value, baseType.value) : { prefix: 3, suffix: 3 }));
const fixed = computed(() => c.fracturedTargets.value.map((t) => c.stepTarget([t.modId])));
const fixedIds = computed(() => new Set(c.fracturedTargets.value.map((t) => t.modId)));
const targets = computed(() => c.rows.value.filter((r) => !fixedIds.value.has(r.modId)));
/** 別のベースの方が合う時だけ 2 つまで (枠が違う・暗黙がタダ・品質の上限) */
const others = computed(() => c.bases.value.filter((b) => b.fits && !b.current && (b.maxQualityPlus || b.implicits.length)).slice(0, 2));
const quality = computed(() => c.item.value?.quality ?? zeroStart.value.quality);
/** 英語の行 (忍者のコピー) は日本語に */
const ja = (t: string): string => jaOfPastedLine(t) ?? t;
/** その MOD の段 (良い順、ilvl で付かない段は出さない) */
const tiersOf = (modId: string): Array<{ i: number; label: string }> => {
  const m = c.data.value?.mods.get(modId);
  const lv = c.item.value?.itemLevel ?? zeroStart.value.itemLevel;
  return (m?.tiers ?? []).map((t, i) => ({ i, ilvl: t.ilvl, label: `T${m!.tiers.length - i} 以上 (${(t.ranges ?? []).map((x) => `${x[0]}-${x[1]}`).join(" / ")})` }))
    .filter((t) => t.ilvl <= lv).reverse();
};
/** フラクチャー品から始めるか、無し品から作るか */
const fc = useFractureChoice(c);
/** 完成品を買うのと作るのと */
const fin = useFinishedCompare(c, computed(() => fc.chosen.value?.cost ?? null));
/**
 * MOD 解析の時点で取引所を取りに行く (オーナー 2026-09-24:「取得分かれてるけど、そもそも MOD 解析の時点で
 * 取得始めておけ」)。固定済み・固定無しの 3 本 → 完成品の 1 本の順 (門番が 10 秒間隔にそろえる)。
 * 自動は解析し直した時と、固定済みの MOD を替えた時だけ。段を変えた時はボタンで取り直す (変えるたびに叩かないため)
 */
// 固定済みの MOD を替えた時 (「これで始める」) も取り直す (取り直す物が変わるので)
watch(() => [c.item.value, c.base.value, c.fracturedTargets.value.map((t) => t.modId).join(",")], async () => {
  await nextTick();
  if (c.treePlan.value && !fc.searched.value) await fc.search();
  if (fin.query.value && !fin.found.value) await fin.search();
}, { immediate: true });
</script>

<template>
  <div class="mb-3 text-xs">
    <!-- 3 枚並べる: ベース / 始め方 / 完成品と比べる (2026-09-24 リリースに向けた見直し: 縦に長かった) -->
    <div class="grid gap-2 lg:grid-cols-3">
      <!-- ベース -->
      <section class="rounded-lg border border-white/15 bg-white/[0.04] p-3">
        <p class="mb-1 opacity-50">ベース</p>
        <p class="text-sm font-bold">{{ baseJa }}</p>
        <p class="opacity-70">プレ {{ lim.prefix }} / サフィ {{ lim.suffix }} 枠 ・ 品質 {{ quality }}%</p>
        <p v-if="fixed.length" class="mt-1">固定済み: {{ fixed.join(" / ") }}</p>
        <p v-if="c.dropOnly.value.length" class="mt-1">
          樹 MOD (固定済みで買う): <b>{{ c.dropOnly.value.map((d) => ja(d.text)).join(" / ") }}</b>
        </p>
        <p v-if="c.skipped.value.length > c.dropOnly.value.length" class="mt-1 text-rose-300">
          このベースでは作れない MOD: {{ c.skipped.value.map(ja).join(" / ") }}
        </p>
        <p v-if="c.slots.value?.impossible" class="mt-1 text-rose-300">{{ c.slots.value.note }}</p>
        <p v-for="b in others" :key="b.baseType" class="mt-1 opacity-60">
          別のベースなら: {{ b.ja }} ({{ b.maxQualityPlus ? `品質上限 +${b.maxQualityPlus}%` : b.implicits.join(" / ") }})
        </p>
      </section>

      <!-- 始め方。初動の安い順 (オーナー 2026-09-24)。固定済み / 固定無し・厳しい / ゆるい。ベースは買う物 -->
      <section class="rounded-lg border border-white/15 bg-white/[0.04] p-3">
        <p class="mb-1 flex items-center gap-2 opacity-50">
          始め方 (初動の安い順)
          <button v-if="!fc.searched.value && c.treePlan.value" type="button" class="rounded border border-sky-600 px-1 opacity-100" :disabled="fc.busy.value" @click="fc.search()">
            {{ fc.busy.value ? "探しています…" : "探す" }}
          </button>
        </p>
        <p v-if="!fc.options.value.length" class="opacity-60">固定済みの MOD が無いので、素のベースから</p>
        <label v-for="o in fc.options.value" :key="o.id" class="mb-0.5 block" :class="o.cost == null ? 'opacity-50' : ''">
          <input type="radio" :checked="fc.chosen.value?.id === o.id" :disabled="o.cost == null" @change="fc.choose(o.id)" />
          {{ o.label }}: <b class="text-[13px]">{{ o.cost != null ? c.money(o.cost) : o.status }}</b>
          <!-- 取引所で見つからない時は手で埋める (オーナー 2026-09-24:「足りない情報は手動で」) -->
          <span v-if="o.manual" class="ml-1 opacity-80">
            手で入れる <input v-model.number="fc.manual.value" type="number" min="0" class="num w-14" /> 神
          </span>
          <button v-if="o.link" type="button" class="ml-1 text-sky-300 underline" @click.prevent="openExternal(o.link.url)">{{ o.link.text }} →</button>
          <span v-if="o.note" class="block pl-5 opacity-50">{{ o.note }}</span>
        </label>
        <p v-if="fc.error.value" class="mt-1 text-rose-300">{{ fc.error.value }}</p>
        <!-- どの MOD を固定済みにして始めるか (オーナー 2026-09-24) / 3 本の条件と結果 (確認用) -->
        <FractureCandidates :c="c" />
        <SearchChecks :c="c" />
      </section>

      <!-- 完成品を買うのと比べる (オーナー 2026-09-24:「完成品か比較対象ないよね」) -->
      <section class="rounded-lg border border-white/15 bg-white/[0.04] p-3">
        <p class="mb-1 flex items-center gap-2 opacity-50">
          完成品と比べる
          <button v-if="!fin.found.value && fin.query.value" type="button" class="rounded border border-sky-600 px-1 opacity-100" :disabled="fin.busy.value || fc.busy.value" @click="fin.search()">
            {{ fin.busy.value ? "探しています…" : fc.busy.value ? "順番待ち…" : "探す" }}
          </button>
        </p>
        <p>
          完成品を買う: <b class="text-[13px]">{{ fin.buyCost.value != null ? c.money(fin.buyCost.value) : fin.found.value ? "出品なし" : fin.busy.value || fc.busy.value ? "取得中…" : "まだ" }}</b>
          <!-- 取引所に無い時だけ手で埋める -->
          <span v-if="fin.found.value && fin.found.value.min == null" class="ml-1 opacity-80">
            手で入れる <input v-model.number="fin.manual.value" type="number" min="0" class="num w-14" /> 神
          </span>
          <button v-if="fin.found.value?.url" type="button" class="ml-1 text-sky-300 underline" @click="openExternal(fin.found.value.url)">{{ fin.found.value.total }} 件 →</button>
        </p>
        <p>作る見込み: <b class="text-[13px]">{{ fin.craftCost.value != null ? c.money(fin.craftCost.value) : "-" }}</b></p>
        <p class="opacity-50">始め方の初動 + {{ fin.craftBasis.value }}。目安で、下の作り方で回すと正確になります</p>
        <p v-if="fin.verdict.value" class="mt-2 rounded bg-black/20 px-2 py-1">
          → <b :class="fin.verdict.value.buy ? 'text-amber-300' : 'text-emerald-300'">{{ fin.verdict.value.buy ? "完成品を買う" : "作る" }}</b>
          方が {{ c.money(fin.verdict.value.diff) }} 安い
        </p>
        <p v-if="fin.error.value" class="mt-1 text-rose-300">{{ fin.error.value }}</p>
      </section>
    </div>

    <!-- 作る MOD と狙う段 (オーナー 2026-09-24:「一応ティア選べるようにね、最初で」) -->
    <section class="mt-2 rounded-lg border border-white/15 bg-white/[0.04] p-3">
      <p class="mb-1 opacity-50">作る MOD {{ targets.length }} つ と狙う段 (段はツリーの手でも選び直せる)</p>
      <div class="grid gap-x-6 gap-y-1 md:grid-cols-2">
        <div v-for="r in targets" :key="r.modId" class="flex items-center gap-2">
          <span class="flex-1">{{ r.text }}</span>
          <select v-if="tiersOf(r.modId).length > 1" class="rounded border border-white/20 bg-black/30 px-1"
            :value="c.targets.value.find((t) => t.modId === r.modId)?.minTierIndex ?? 0"
            @change="c.setTier(r.modId, Number(($event.target as HTMLSelectElement).value))">
            <option v-for="t in tiersOf(r.modId)" :key="t.i" :value="t.i">{{ t.label }}</option>
          </select>
          <span v-else class="opacity-50">確定</span>
        </div>
      </div>
    </section>

    <details v-if="c.treeResult.value" class="mt-2">
      <summary class="cursor-pointer opacity-50">固定済み・固定無しの詳しい表</summary>
      <TreeFracturePanel :c="c" />
    </details>
  </div>
</template>
