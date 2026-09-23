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
import { openExternal } from "../../services/trade2/open-external";
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
/** その MOD の段 (良い順、ilvl で付かない段は出さない) */
const tiersOf = (modId: string): Array<{ i: number; label: string }> => {
  const m = c.data.value?.mods.get(modId);
  const lv = c.item.value?.itemLevel ?? zeroStart.value.itemLevel;
  return (m?.tiers ?? []).map((t, i) => ({ i, ilvl: t.ilvl, label: `T${m!.tiers.length - i} ${t.name ?? ""} (${(t.ranges ?? []).map((x) => `${x[0]}-${x[1]}`).join(" / ")}) 以上` }))
    .filter((t) => t.ilvl <= lv).reverse();
};
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
    <!-- 始め方。初動の安い順 (オーナー 2026-09-24)。固定済み / 固定無し・厳しい / ゆるい / 無し品。取引所は押した時だけ -->
    <div v-if="fixed.length || c.dropOnly.value.length" class="mt-2 rounded bg-black/20 p-2">
      <p class="mb-1 font-bold">
        始め方 (初動の安い順)
        <button v-if="!fc.searched.value" type="button" class="ml-1 rounded border border-sky-600 px-1 font-normal" :disabled="fc.busy.value" @click="fc.search()">
          {{ fc.busy.value ? "探しています…" : "固定済み・固定無しを探す (3 本 / 約 30 秒)" }}
        </button>
      </p>
      <label v-for="o in fc.options.value" :key="o.id" class="block" :class="o.cost == null ? 'opacity-50' : ''">
        <input type="radio" :checked="fc.chosen.value?.id === o.id" :disabled="o.cost == null" @change="fc.choose(o.id)" />
        {{ o.label }}: <b>{{ o.cost != null ? c.money(o.cost) : "-" }}</b>
        <!-- 取引所で見つからない時は手で埋める (オーナー 2026-09-24:「足りない情報は手動で」) -->
        <span v-if="o.id === 'manual'" class="ml-1 opacity-80">
          <input v-model.number="fc.manual.value" type="number" min="0" class="num w-16" /> 神
        </span>
        <span v-if="o.note" class="opacity-60"> {{ o.note }}</span>
        <button v-for="l in o.links" :key="l.url" type="button" class="ml-2 text-sky-300 underline" @click.prevent="openExternal(l.url)">{{ l.text }} →</button>
      </label>
      <p v-if="fc.error.value" class="mt-1 text-rose-300">{{ fc.error.value }}</p>
    </div>
    <!-- 作る MOD と狙う段。段は最初に選べる (オーナー 2026-09-24:「一応ティア選べるようにね、最初で」) -->
    <p class="mt-1">作る MOD {{ targets.length }} つ</p>
    <div v-for="r in targets" :key="r.modId" class="flex items-center gap-2 pl-2">
      <span class="flex-1">{{ r.text }}</span>
      <select v-if="tiersOf(r.modId).length > 1" class="rounded border border-white/20 bg-black/30 px-1"
        :value="c.targets.value.find((t) => t.modId === r.modId)?.minTierIndex ?? 0"
        @change="c.setTier(r.modId, Number(($event.target as HTMLSelectElement).value))">
        <option v-for="t in tiersOf(r.modId)" :key="t.i" :value="t.i">{{ t.label }}</option>
      </select>
    </div>
    <p v-if="c.slots.value?.impossible" class="mt-1 text-rose-300">{{ c.slots.value.note }}</p>
    <p v-for="b in others" :key="b.baseType" class="mt-1 opacity-70">
      別のベースなら: {{ b.ja }} ({{ b.maxQualityPlus ? `品質上限 +${b.maxQualityPlus}%` : b.implicits.join(" / ") }})
    </p>
    <details v-if="c.treeResult.value" class="mt-2">
      <summary class="cursor-pointer opacity-70">固定済み・固定無しの中身を見る</summary>
      <TreeFracturePanel :c="c" />
    </details>
  </div>
</template>
