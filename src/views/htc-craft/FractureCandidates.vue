<script setup lang="ts">
/**
 * FractureCandidates.vue — どの MOD を固定済みにして始めるか、選んで一斉に探す (2026-09-24)
 *
 * オーナー:「フラクチャー MOD どうするかチェックボックスで選択して、複数トレードで一斉に検索。安い MOD で開始できるかも」
 * 「MOD 複数選択だと、ゆるい厳しい条件によって値段違うから、選択した分それぞれ固定無しで展開したら見れるように MOD の所に置きたい」
 * 「制限的にマックス 3 つだな同時検索は。チェック 3 つオーバーしたら灰色にしてクリックできないように」。
 *   - 候補 = 作る MOD のうち普通に付く物 (樹 MOD は常に固定済みの前提なので条件に入れる)。既定のチェック = 貼り付けで固定済みだった MOD
 *   - チェックは 3 つまで。3 つ付いたら残りは押せない
 *   - 選んだ MOD ごとに 3 本 (固定済み / 固定無し・厳しい / ゆるい) を取る (useTreeSearch の searchFor、30 分キャッシュ)
 *   - 行を開くと始め方と同じ 3 行 ([[start-rows.ts]])。行の頭は一番安い初動
 *   - 「これで始める」で、その MOD を固定済みにして始め方・1 手ずつを組み直す (useHtcCraft の setFractured)
 */
import { computed, ref, shallowRef, watch } from "vue";
import { openExternal } from "../../services/trade2/open-external";
import { startRows } from "./start-rows";
import type { TreeResult } from "./useTreeSearch";
import type { useHtcCraft } from "./useHtcCraft";

const props = defineProps<{ c: ReturnType<typeof useHtcCraft> }>();
const c = props.c;
/** 同時に探せるのは 3 つまで (取引所の上限。オーナー 2026-09-24) */
const MAX = 3;

/** 候補: 普通に付く狙い (固定済みにできる物) */
const candidates = computed(() => c.targets.value.filter((t) => c.data.value?.mods.get(t.modId)?.source === "normal"));
const checked = ref<string[]>([]);
const results = shallowRef<Record<string, TreeResult | "error">>({});
const pending = ref<string[]>([]);
const busy = ref(false);
// 解析し直したら、貼り付けで固定済みだった MOD にチェックを戻す
watch(() => [c.item.value, c.base.value], () => {
  checked.value = c.fracturedTargets.value.map((t) => t.modId).slice(0, MAX);
  results.value = {};
}, { immediate: true });

async function searchAll(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  pending.value = [...checked.value];
  try {
    for (const id of checked.value) {
      const r = await c.searchFor([id]).catch(() => null);
      results.value = { ...results.value, [id]: r ?? "error" };
      pending.value = pending.value.filter((x) => x !== id);
    }
  } finally {
    busy.value = false;
    pending.value = [];
  }
}

const div = computed(() => c.prices.value?.currency.divine ?? 1);
/** 行ごとの 3 本と、一番安い初動。安い順 (取れていない物は後ろ) */
const rows = computed(() => candidates.value.map((t) => {
  const res = results.value[t.modId];
  const sub = res && res !== "error" ? startRows(res, div.value, { busy: false, manualDivine: null }) : [];
  const best = sub.find((x) => x.cost != null) ?? null;
  return {
    modId: t.modId, name: c.stepTarget([t.modId]), res, sub, best,
    current: c.fracturedTargets.value.some((f) => f.modId === t.modId),
    locked: !checked.value.includes(t.modId) && checked.value.length >= MAX,
    waiting: pending.value.includes(t.modId),
  };
}).sort((a, b) => (a.best?.cost ?? Infinity) - (b.best?.cost ?? Infinity)));
</script>

<template>
  <details class="mt-2">
    <summary class="cursor-pointer opacity-60">別の MOD を固定済みにして始めたら? ({{ MAX }} つまで選んで探す)</summary>
    <div v-for="r in rows" :key="r.modId" class="pl-2">
      <div class="flex flex-wrap items-center gap-2">
        <label class="flex-1" :class="r.locked ? 'opacity-40' : ''">
          <input v-model="checked" type="checkbox" :value="r.modId" :disabled="r.locked" /> {{ r.name }}
          <span v-if="r.current" class="text-amber-300"> (今の始め方)</span>
        </label>
        <span v-if="r.waiting" class="opacity-70">取得中…</span>
        <span v-else-if="r.res === 'error'" class="text-rose-300">取れず</span>
        <template v-else-if="r.res">
          <span>{{ r.best ? `${c.money(r.best.cost!)} (${r.best.label})` : "どれも選べない" }}</span>
          <button v-if="!r.current && r.best" type="button" class="rounded border border-amber-500/60 px-1" @click="c.setFractured([r.modId])">これで始める</button>
        </template>
      </div>
      <!-- その MOD の 3 本 (開いて見る) -->
      <details v-if="r.sub.length" class="pl-4">
        <summary class="cursor-pointer opacity-60">固定済み・固定無しを見る</summary>
        <div v-for="o in r.sub" :key="o.id" :class="o.cost == null ? 'opacity-50' : ''">
          {{ o.label }}: <b>{{ o.cost != null ? c.money(o.cost) : o.status }}</b>
          <span v-if="o.note" class="opacity-60"> {{ o.note }}</span>
          <button v-if="o.link" type="button" class="ml-2 text-sky-300 underline" @click="openExternal(o.link.url)">{{ o.link.text }} →</button>
        </div>
      </details>
    </div>
    <button type="button" class="mt-1 rounded border border-sky-600 px-2" :disabled="busy || !checked.length" @click="searchAll()">
      {{ busy ? "探しています…" : `選んだ ${checked.length} つを探す (1 つ 3 本、30 分は覚えておく)` }}
    </button>
  </details>
</template>
