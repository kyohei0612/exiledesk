<script setup lang="ts">
/**
 * FractureCandidates.vue — どの MOD を固定済みにして始めるか、選んで一斉に探す (2026-09-24)
 *
 * オーナー:「複数選択かでフラクチャー MOD どうするかチェックボックスで選択して、複数トレードで一斉に検索できるように
 * してほしいね。そしたら安い MOD で開始できるかもだし」。
 *   - 候補 = 作る MOD のうち普通に付く物 (樹 MOD は常に固定済みの前提なので条件に入れる)
 *   - 既定のチェック = 貼り付けで固定済みだった MOD
 *   - 選んだ MOD ごとに「その MOD が固定済みで付いたベース」の最安を 1 本ずつ (門番が 10 秒間隔にそろえる)
 *   - 「これで始める」で、その MOD を固定済みにして始め方・1 手ずつを組み直す (useHtcCraft の setFractured)
 */
import { computed, ref, shallowRef, watch } from "vue";
import { fracturedBuys, treeBuyQuery } from "../../services/htc/tree-buy";
import { autoPrice, tradeAuto } from "../../services/trade2/auto-price";
import { openExternal } from "../../services/trade2/open-external";
import { marketStore } from "../../state/market-store";
import type { useHtcCraft } from "./useHtcCraft";

const props = defineProps<{ c: ReturnType<typeof useHtcCraft> }>();
const c = props.c;

/** 候補: 普通に付く狙い (固定済みにできる物) */
const candidates = computed(() => c.targets.value.filter((t) => c.data.value?.mods.get(t.modId)?.source === "normal"));
const checked = ref<string[]>([]);
type Res = { min: number | null; total: number; url: string | null; error?: string };
const results = shallowRef<Record<string, Res>>({});
const busy = ref(false);
// 解析し直したら、貼り付けで固定済みだった MOD にチェックを戻す
watch(() => [c.item.value, c.base.value], () => {
  checked.value = c.fracturedTargets.value.map((t) => t.modId);
  results.value = {};
}, { immediate: true });

/** その MOD (+ 樹 MOD) が固定済みで付いたベースの検索 */
function queryFor(modId: string) {
  const d = c.data.value, cls = c.base.value, t = c.targets.value.find((x) => x.modId === modId);
  if (!d || !cls || !t) return null;
  const tree = (c.treePlan.value?.buys ?? []).filter((b) => b.tag !== "fractured");
  return treeBuyQuery(cls, [...tree, ...fracturedBuys(d, [t], (id) => c.stepTarget([id]))], {
    fractured: true,
    ...(c.item.value?.itemLevel != null ? { ilvlMin: c.item.value.itemLevel } : {}),
    ...(c.item.value?.baseType ? { baseType: c.item.value.baseType } : {}),
  });
}

async function searchAll(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    for (const id of checked.value) {
      const q = queryFor(id);
      if (!q) { results.value = { ...results.value, [id]: { min: null, total: 0, url: null, error: "取引所の条件にできない" } }; continue; }
      const r = await autoPrice(marketStore.league.value?.Value ?? "Standard", q, marketStore.rates.value, 1);
      results.value = { ...results.value, [id]: r
        ? { min: r.minExalted ?? null, total: r.total, url: r.searchUrl || null }
        : { min: null, total: 0, url: null, error: tradeAuto.lastError.value ?? "取れませんでした" } };
    }
  } finally {
    busy.value = false;
  }
}

/** 安い順 (取れていない・出品なしは後ろ) */
const rows = computed(() => candidates.value.map((t) => ({
  modId: t.modId, name: c.stepTarget([t.modId]), res: results.value[t.modId] ?? null,
  current: c.fracturedTargets.value.some((f) => f.modId === t.modId),
})).sort((a, b) => (a.res?.min ?? Infinity) - (b.res?.min ?? Infinity)));
</script>

<template>
  <details class="mt-1" open>
    <summary class="cursor-pointer opacity-70">固定済みにする MOD を選んで探す</summary>
    <div v-for="r in rows" :key="r.modId" class="flex flex-wrap items-center gap-2 pl-2">
      <label class="flex-1">
        <input v-model="checked" type="checkbox" :value="r.modId" /> {{ r.name }}
        <span v-if="r.current" class="text-amber-300"> (今の始め方)</span>
      </label>
      <template v-if="r.res">
        <span :class="r.res.error ? 'text-rose-300' : ''">
          {{ r.res.error ? `取れず: ${r.res.error}` : r.res.min != null ? `${c.money(r.res.min)} (${r.res.total} 件)` : `出品なし (${r.res.total} 件)` }}
        </span>
        <button v-if="r.res.url" type="button" class="text-sky-300 underline" @click="openExternal(r.res.url)">取引所 →</button>
        <button v-if="!r.current && r.res.min != null" type="button" class="rounded border border-amber-500/60 px-1" @click="c.setFractured([r.modId])">これで始める</button>
      </template>
    </div>
    <button type="button" class="mt-1 rounded border border-sky-600 px-2" :disabled="busy || !checked.length" @click="searchAll()">
      {{ busy ? "探しています…" : `選んだ ${checked.length} つを一斉に探す (1 本 10 秒)` }}
    </button>
  </details>
</template>
