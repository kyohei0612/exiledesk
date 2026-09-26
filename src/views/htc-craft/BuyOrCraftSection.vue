<script setup lang="ts">
/**
 * BuyOrCraftSection.vue — 診断の ②「買うか、作るか」(3 つの道 + 作る側の始め方 + 買う側の完成品)
 * DiagnosisCard.vue から切り出し (2026-09-26)。中身は変えていない。
 */
import { openExternal } from "../../services/trade2/open-external";
import StartResults from "./StartResults.vue";
import type { useHtcCraft } from "./useHtcCraft";
import type { useStartSearch } from "./useStartSearch";
import type { useFinishedCompare } from "./useFinishedCompare";
import type { ThreeWay } from "./three-way";

const props = defineProps<{
  c: ReturnType<typeof useHtcCraft>;
  ss: ReturnType<typeof useStartSearch>;
  fin: ReturnType<typeof useFinishedCompare>;
  threeWay: ThreeWay["threeWay"]["value"];
  verdict3: ThreeWay["verdict3"]["value"];
  show2: boolean;
}>();
const c = props.c;
const ss = props.ss;
const fin = props.fin;
</script>

<template>
      <!-- ② 買うか、作るか (始め方の結果もここに。オーナー 2026-09-26:「2 番と 3 番一緒に」)。完成品の条件は一番ゆるく (MOD だけ) -->
      <section class="rounded-xl border border-white/10 bg-white/[0.03] p-3 lg:col-span-2">
        <p class="mb-2 flex items-center gap-2"><span class="rounded-full bg-amber-500/80 px-2 py-0.5 text-[11px] font-bold text-black">2</span><b class="text-sm">買うか、作るか</b>
          <button v-if="fin.query.value && !ss.busy.value" type="button" class="ml-auto rounded-lg border border-white/20 px-2 py-0.5 hover:bg-white/5" :disabled="fin.busy.value" @click="fin.search()">
            {{ fin.busy.value ? "探しています…" : fin.found.value ? "完成品を探し直す" : "完成品だけ探す" }}
          </button>
        </p>
        <!-- 3 つの道。一番安い物を強調 -->
        <div v-if="threeWay.length" class="mb-2 grid grid-cols-3 gap-2">
          <div v-for="w in threeWay" :key="w.key" class="rounded-lg p-2" :class="w.best ? 'bg-emerald-500/15 ring-1 ring-emerald-400/60 shadow-[0_0_14px_rgba(52,211,153,0.25)]' : 'bg-black/30'">
            <p class="text-[11px] opacity-70">{{ w.name }}</p>
            <p class="text-lg font-bold leading-tight" :class="w.best ? 'text-emerald-300' : w.cost == null ? 'text-sm opacity-60' : ''">{{ w.cost != null ? c.money(w.cost) : w.why }}</p>
            <p class="mt-0.5 flex items-center gap-2">
              <span v-if="w.best" class="inline-block rounded-full bg-emerald-400 px-1.5 text-[10px] font-bold text-black">一番安い</span>
              <!-- 取引所へそのまま (オーナー 2026-09-26) -->
              <button v-if="w.url" type="button" class="text-[11px] text-sky-300 underline hover:text-sky-200" @click="openExternal(w.url)">取引所で見る →</button>
            </p>
          </div>
        </div>
        <p v-if="verdict3" class="mb-3 rounded-lg bg-emerald-500/10 px-2 py-1">
          → <b class="text-emerald-300">{{ verdict3.name }}</b> が一番安い<span v-if="verdict3.diff != null" class="opacity-70"> ({{ verdict3.second }} より <b class="text-emerald-200">{{ c.money(verdict3.diff) }}</b> 安い)</span>
        </p>
        <div class="grid gap-3 md:grid-cols-2">
          <!-- 作る側: 始め方 (固定済みを買って途中から作る / 自分でフラクチャーして作る の中身) -->
          <div class="rounded-lg border border-white/10 bg-black/20 p-2">
            <p class="mb-1 font-bold text-amber-100">作るなら: 一番安い始め方</p>
            <StartResults v-if="show2" :c="c" :ss="ss" />
            <p v-else class="opacity-50">{{ ss.kind.value.kind === "unsafe" ? "クラフト非推奨なので、始め方はありません" : "始め方は取れていません" }}</p>
          </div>
          <!-- 買う側: 完成品 -->
          <div class="rounded-lg border border-white/10 bg-black/20 p-2">
            <p class="mb-1 font-bold text-amber-100">買うなら: 完成品</p>
        <p>
          完成品: <b>{{ fin.buyCost.value != null ? c.money(fin.buyCost.value) : fin.found.value ? "出品なし" : fin.busy.value ? "取得中…" : "まだ" }}</b>
          <!-- 取引所に無い時だけ手で埋める -->
          <span v-if="fin.found.value && fin.found.value.min == null" class="ml-1 opacity-80">
            手で入れる <input v-model.number="fin.manual.value" type="number" min="0" class="num w-14" /> 神
          </span>
          <button v-if="fin.found.value?.url" type="button" class="ml-1 text-sky-300 underline" @click="openExternal(fin.found.value.url)">{{ fin.found.value.total }} 件 →</button>
        </p>
        <p class="opacity-50">MOD が同じ物 (固定済み・冒涜でも可)</p>
        <p v-if="fin.lightNote.value" class="text-amber-300/80">{{ fin.lightNote.value }}</p>
        <p v-if="fin.exhausted.value" class="rounded bg-amber-500/10 px-1 text-amber-200">3 MOD まで緩めても出品なし</p>
        <p v-if="fin.dropped.value.length" class="rounded bg-amber-500/10 px-1 text-amber-200">
          近い物: {{ fin.dropped.value.join(" / ") }} が無い (買ってから付ける)
        </p>
        <p v-if="fin.unbuildable.value" class="text-rose-300">{{ fin.unbuildable.value }}</p>
        <p v-if="fin.outlier.value" class="text-amber-300/80">出品が少なく高すぎるので比べない</p>
        <p v-if="ss.kind.value.kind === 'unsafe'" class="opacity-50">クラフト非推奨 (見込みなし)</p>
        <p v-else-if="fin.craftBasis.value" class="opacity-50">初動 + 作る見込み ({{ fin.craftBasis.value }})。正確な額は下の作り方で</p>
        <p v-else class="opacity-50">始め方を探すと出る</p>
          </div>
        </div>
        <!-- 3 つの道の中身 -->
        <div v-if="threeWay.length" class="mt-2 rounded border border-white/10 bg-black/20 p-2">
          <p v-for="w in threeWay.filter((x) => x.detail)" :key="w.key" class="opacity-70">{{ w.name }}: {{ w.detail }}</p>
        </div>
        <p v-if="fin.error.value" class="mt-1 text-rose-300">{{ fin.error.value }}</p>
      </section>
</template>
