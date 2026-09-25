<script setup lang="ts">
/**
 * StartResults.vue — 始め方の結果 (診断カードの真ん中) (2026-09-24)
 *
 * オーナー:「固定済み以外の真ん中の検索結果は一番安いルートのものを 1 つ表示して他隠しておいて、固定済みのものも含めて
 * 1 つだけ『これで作るのが安い』って表示させたほうがいい。複数なら複数合わせて一番安いやつのみで、ほかは畳んでおこう」。
 *   - 上: いま選んでいる始め方 1 つ (既定 = 全部の候補 × 3 本の中で一番安い物)。「これで作るのが安い」
 *   - その候補の他の買い方 (固定済み / 厳しい / ゆるい の残り) は畳む
 *   - ほかの候補は畳む。開くと候補ごとに一番安い買い方 1 行 + 選び直すボタン
 * 取得中の候補は上に「取得中…」で出す (取れた物から順に埋まる)。
 */
import { computed } from "vue";
import { openExternal } from "../../services/trade2/open-external";
import SearchChecks from "./SearchChecks.vue";
import type { useStartSearch } from "./useStartSearch";
import type { useHtcCraft } from "./useHtcCraft";

/** embedded: ② 買うか作るか の中に置く (枠と見出し無し。2026-09-26 に ② と ③ を 1 枚にした) */
const props = defineProps<{ c: ReturnType<typeof useHtcCraft>; ss: ReturnType<typeof useStartSearch>; embedded?: boolean }>();
const c = props.c;
const rows = computed(() => props.ss.rows.value);
const top = computed(() => props.ss.chosen.value);
/** 候補の中で一番安い物 (rows は安い順) */
const cheapest = computed(() => rows.value.find((r) => r.best) ?? null);
const otherRoutes = computed(() => top.value?.sub.filter((o) => o.id !== top.value?.best?.id) ?? []);
const others = computed(() => rows.value.filter((r) => r.key !== top.value?.key && (r.res || r.waiting)));
const waiting = computed(() => rows.value.filter((r) => r.waiting));
const started = computed(() => rows.value.some((r) => r.res || r.waiting));
/** 手入力欄の値 (空なら null) */
const num = (e: Event): number | null => {
  const v = (e.target as HTMLInputElement).value;
  return v === "" ? null : Number(v);
};
</script>

<template>
  <section :class="embedded ? '' : 'rounded-xl border border-white/10 bg-white/[0.03] p-3'">
    <p v-if="!embedded" class="mb-2 flex items-center gap-2"><span class="rounded-full bg-amber-500/80 px-2 py-0.5 text-[11px] font-bold text-black">2</span><b class="text-sm">一番安い始め方</b></p>
    <p v-if="ss.kind.value.kind === 'unsafe'" class="text-rose-300">クラフト非推奨なので、始め方はありません。完成品を買うのをすすめます</p>
    <p v-else-if="!started" class="opacity-50">
      {{ ss.kind.value.kind === "fix" ? "左の「取引所で探す」" : "左で選んで「取引所で探す」" }}を押すと、取れた物からここに出ます
    </p>

    <!-- 一番安い始め方 (選び直していればそれ) -->
    <div v-if="top?.best" class="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2">
      <p class="opacity-80">{{ top.key === cheapest?.key ? "→ これで作るのが安い" : "→ 選んだ始め方" }}</p>
      <p class="text-sm"><b>{{ top.name }}</b></p>
      <p>
        {{ top.best.label }}: <b class="text-[15px] text-amber-200">{{ c.money(top.best.cost!) }}</b><span v-if="top.best.total != null && top.best.id !== 'buy'" class="opacity-70"> + 作る見込み = <b class="text-amber-200">{{ c.money(top.best.total) }}</b></span>
        <button v-if="top.best.link" type="button" class="ml-1 text-sky-300 underline" @click="openExternal(top.best.link.url)">{{ top.best.link.text }} →</button>
      </p>
      <p v-if="top.best.note" class="opacity-60">{{ top.best.note }}</p>
      <button v-if="cheapest && top.key !== cheapest.key" type="button" class="mt-1 underline opacity-70" @click="ss.choose(cheapest.key)">一番安い物に戻す</button>
    </div>
    <p v-for="w in waiting" :key="w.key" class="mt-1 flex items-center gap-1 opacity-80">
      <template v-if="ss.current.value?.key === w.key">
        <span class="inline-block animate-pulse text-amber-300">●</span>
        <span class="text-amber-200">{{ w.name }}: 検索中 ({{ ss.current.value.index }}/{{ ss.current.value.count }}) — {{ ss.current.value.step }}</span>
      </template>
      <span v-else class="opacity-60">{{ w.name }}: 順番待ち</span>
    </p>
    <!-- どれも値段が出ない時は畳まずに全部出し、出品が無い物は手で値段を入れられるように (「足りない情報は手動で」) -->
    <template v-if="started && !waiting.length && !top?.best">
      <p class="text-rose-300">始め方なし (出品なし)。値段は手で入れられる</p>
      <div v-for="r in rows.filter((x) => x.res)" :key="r.key" class="mt-1 pl-1">
        <b>{{ r.name }}</b>
        <div v-for="o in r.sub" :key="o.id" class="pl-3" :class="o.cost == null && !o.manual ? 'opacity-50' : ''">
          {{ o.label }}: {{ o.cost != null ? c.money(o.cost) : o.status }}<span v-if="o.total != null && o.id !== 'buy'" class="opacity-60"> (合計 {{ c.money(o.total) }})</span>
          <span v-if="o.manual" class="ml-1">手で入れる <input type="number" min="0" class="num w-14" :value="ss.manual.value[r.key] ?? ''" @change="ss.setManual(r.key, num($event))" /> 神</span>
          <button v-if="o.link" type="button" class="ml-1 text-sky-300 underline" @click="openExternal(o.link.url)">{{ o.link.text }} →</button>
          <span v-if="o.note" class="opacity-50"> {{ o.note }}</span>
        </div>
      </div>
    </template>

    <!-- その候補の他の買い方 -->
    <details v-if="otherRoutes.length" class="mt-2">
      <summary class="cursor-pointer opacity-60">ほかの買い方 ({{ otherRoutes.length }})</summary>
      <div v-for="o in otherRoutes" :key="o.id" class="pl-3" :class="o.cost == null && !o.manual ? 'opacity-50' : ''">
        {{ o.label }}: <b>{{ o.cost != null ? c.money(o.cost) : o.status }}</b><span v-if="o.total != null && o.id !== 'buy'" class="opacity-60"> (合計 {{ c.money(o.total) }})</span>
        <span v-if="o.manual && top" class="ml-1">手で入れる <input type="number" min="0" class="num w-14" :value="ss.manual.value[top.key] ?? ''" @change="ss.setManual(top.key, num($event))" /> 神</span>
        <button v-if="o.link" type="button" class="ml-1 text-sky-300 underline" @click="openExternal(o.link.url)">{{ o.link.text }} →</button>
        <span v-if="o.note" class="block pl-2 opacity-50">{{ o.note }}</span>
      </div>
    </details>

    <!-- ほかの候補 (固定する MOD 違い) -->
    <details v-if="others.filter((r) => r.res).length" class="mt-1">
      <summary class="cursor-pointer opacity-60">ほかの始め方 ({{ others.filter((r) => r.res).length }})</summary>
      <div v-for="r in others.filter((x) => x.res)" :key="r.key" class="mt-1 pl-3">
        <div class="flex items-center gap-2">
          <b class="flex-1">{{ r.name }}</b>
          <span v-if="r.res === 'error'" class="text-rose-300">取れず</span>
          <template v-else-if="r.best">
            <b>{{ c.money(r.best.cost!) }}</b><span v-if="r.best.total != null && r.best.id !== 'buy'" class="opacity-60"> (合計 {{ c.money(r.best.total) }})</span>
            <button type="button" class="rounded border border-white/20 px-1" @click="ss.choose(r.key)">これにする</button>
          </template>
          <span v-else class="opacity-60">どれも選べない</span>
        </div>
        <div v-for="o in r.sub" :key="o.id" class="pl-3" :class="o.cost == null && !o.manual ? 'opacity-50' : ''">
          {{ o.label }}: {{ o.cost != null ? c.money(o.cost) : o.status }}<span v-if="o.total != null && o.id !== 'buy'" class="opacity-60"> (合計 {{ c.money(o.total) }})</span>
          <span v-if="o.manual" class="ml-1">手で入れる <input type="number" min="0" class="num w-14" :value="ss.manual.value[r.key] ?? ''" @change="ss.setManual(r.key, num($event))" /> 神</span>
          <button v-if="o.link" type="button" class="ml-1 text-sky-300 underline" @click="openExternal(o.link.url)">{{ o.link.text }} →</button>
          <span v-if="o.note" class="opacity-50"> {{ o.note }}</span>
        </div>
      </div>
    </details>
    <SearchChecks v-if="c.treeResult.value" :c="c" />
  </section>
</template>
