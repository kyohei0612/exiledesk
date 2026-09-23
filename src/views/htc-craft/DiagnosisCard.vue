<script setup lang="ts">
/**
 * DiagnosisCard.vue — MOD 解析 + ベース診断の結果だけを短く (2026-09-24)
 *
 * オーナー:「MOD 解析も別に表示せずに、MOD 解析 + ベース診断まで直通で通していいよ。その結果だけ
 * 分かりやすく簡潔に表示したらおけ」。細かい表は HtcCraftLab の「詳しく」に畳んである。
 */
import { computed } from "vue";
import { sideLimits } from "../../services/htc/bridge";
import { jaOfPastedLine } from "../../services/htc/mod-text";
import { zeroStart } from "./craft-settings";
import TreeFracturePanel from "./TreeFracturePanel.vue";
import { useFractureChoice } from "./useFractureChoice";
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
/** フラクチャー品から始めるか、無し品から作るか */
const fc = useFractureChoice(c);
</script>

<template>
  <div class="mb-3 rounded border border-white/15 bg-white/5 p-3 text-xs">
    <p class="mb-1 text-sm font-bold">{{ baseJa }}</p>
    <p class="opacity-70">プレ {{ lim.prefix }} / サフィ {{ lim.suffix }} 枠 / 品質 {{ quality }}%</p>
    <p v-if="fixed.length" class="mt-1">貼り付けの物で固定済み: {{ fixed.join(" / ") }}</p>
    <p v-if="c.dropOnly.value.length" class="mt-1">
      樹 MOD: <b>{{ c.dropOnly.value.map((d) => ja(d.text)).join(" / ") }}</b> — 固定済みで付いたベースを買う
    </p>
    <p v-if="c.skipped.value.length > c.dropOnly.value.length" class="mt-1 text-rose-300">
      このベースでは作れない MOD: {{ c.skipped.value.map(ja).join(" / ") }}
    </p>
    <!-- フラクチャー品か無し品か。買う方は押した時だけ検索 -->
    <div v-if="fixed.length" class="mt-2 rounded bg-black/20 p-2">
      <p class="mb-1 font-bold">始め方</p>
      <label class="block">
        <input v-model="fc.startFractured.value" type="radio" :value="true" />
        フラクチャー品を買う ({{ fixed.join(" / ") }} が固定済み):
        <template v-if="fc.found.value">
          <b>{{ fc.found.value.min != null ? c.money(fc.found.value.min) : "出品なし" }}</b> ({{ fc.found.value.total }} 件)
          <a v-if="fc.found.value.url" :href="fc.found.value.url" target="_blank" class="underline opacity-70">取引所</a>
        </template>
        <button v-else-if="fc.query.value" type="button" class="ml-1 rounded border border-sky-600 px-1" :disabled="fc.busy.value" @click.prevent="fc.search()">
          {{ fc.busy.value ? "探しています…" : "最安を取る" }}
        </button>
        <span v-else class="opacity-60">(取引所の条件にできない)</span>
      </label>
      <label class="block">
        <input v-model="fc.startFractured.value" type="radio" :value="false" />
        無し品から作る: その MOD を付ける平均 <b>{{ fc.craftCost.value != null ? c.money(fc.craftCost.value) : "-" }}</b>
        <span class="opacity-60">(固定されないので後で消えうる)</span>
      </label>
      <p v-if="fc.cheaper.value" class="mt-1">
        → <b class="text-emerald-300">{{ fc.cheaper.value === "fractured" ? "フラクチャー品を買う" : "無し品から作る" }}</b> 方が安い
      </p>
      <p v-if="fc.error.value" class="mt-1 text-rose-300">{{ fc.error.value }}</p>
    </div>
    <p class="mt-1">作る MOD {{ targets.length }} つ: {{ targets.map((r) => r.text).join(" / ") }}</p>
    <p v-if="c.slots.value?.impossible" class="mt-1 text-rose-300">{{ c.slots.value.note }}</p>
    <p v-for="b in others" :key="b.baseType" class="mt-1 opacity-70">
      別のベースなら: {{ b.ja }} ({{ b.maxQualityPlus ? `品質上限 +${b.maxQualityPlus}%` : b.implicits.join(" / ") }})
    </p>
    <details v-if="c.dropOnly.value.length" class="mt-2">
      <summary class="cursor-pointer opacity-70">樹 MOD 入りのベースの値段を見る</summary>
      <TreeFracturePanel :c="c" />
    </details>
  </div>
</template>
