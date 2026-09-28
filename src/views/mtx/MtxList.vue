<!--
  MtxList.vue — スキン (PoE1 のマイクロトランザクションが PoE2 でも使えるか) (2026-09-29)

  オーナー「PoE1 で使えるかっこいいやつが PoE2 で使えるかわかんないから知りたい。リストで。カテゴリはゲームの仕様で区分け。
  名前はシンプルに」「クリックで使ってる所 (動画) が見られたらいい」。
  中身はゲームのクライアント ([[mtx.ts]])。PoE2 で使えるかは MtxTypes の列 (確かめ: オニキスの忘却の翼 = 使える、
  ミッドナイトパクト武器エフェクト = 使えない、どちらもオーナーの実体験と一致)。カードを押すと poe2db の日本語ページ (見た目・動画)。
-->
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import { artOf, loadMtx, poe2dbUrl, usableInPoe2, type MtxData, type MtxItem } from "../../services/mtx/mtx";
import { openExternal } from "../../services/trade2/open-external";

const data = shallowRef<MtxData | null>(null);
const error = ref<string | null>(null);
onMounted(async () => {
  try { data.value = await loadMtx(); } catch (e) { error.value = String(e); }
});

/** PoE2 で使えるかの絞り込み */
type Poe2Filter = "all" | "yes" | "no";
const poe2 = ref<Poe2Filter>("yes");
const cat = ref<number | "all">("all");
const query = ref("");
const PAGE = 120;
const shown = ref(PAGE);
watch([poe2, cat, query], () => (shown.value = PAGE));

const byPoe2 = computed(() => (data.value?.items ?? []).filter((x) => (poe2.value === "all" ? true : poe2.value === "yes" ? usableInPoe2(x) : !usableInPoe2(x))));
/** 分類 (ゲームの並び順)。件数は PoE2 の絞り込みの後 */
const cats = computed(() => {
  const n = new Map<number, number>();
  for (const x of byPoe2.value) n.set(x.c, (n.get(x.c) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => (a[0] < 0 ? 1 : b[0] < 0 ? -1 : a[0] - b[0])).map(([c, count]) => ({ c, count, name: c < 0 ? "分類なし" : (data.value?.cats[c] ?? String(c)) }));
});
const list = computed(() => {
  const q = query.value.trim().toLowerCase();
  return byPoe2.value.filter((x) => (cat.value === "all" || x.c === cat.value) && (!q || x.ja.toLowerCase().includes(q) || x.en.toLowerCase().includes(q) || x.t.toLowerCase().includes(q)));
});
const counts = computed(() => {
  const all = data.value?.items ?? [];
  const yes = all.filter(usableInPoe2).length;
  return { all: all.length, yes, no: all.length - yes };
});
const chip = (on: boolean): string => (on ? "bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/60" : "border border-white/15 hover:bg-white/5");
const open = (x: MtxItem) => void openExternal(poe2dbUrl(x));
</script>

<template>
  <div class="text-[12px]">
    <h1 class="text-lg font-bold text-amber-100">スキン</h1>
    <p class="mb-3 opacity-60">PoE1 で使えるスキン・エフェクト・ペットなどが、PoE2 でも使えるか。ゲームのデータから (パッチで変わることがある)。カードを押すと poe2db で見た目を確かめられる。</p>
    <p v-if="error" class="text-rose-300">{{ error }}</p>
    <p v-else-if="!data" class="py-10 text-center opacity-50">読んでいます…</p>
    <template v-else>
      <!-- PoE2 で使えるか -->
      <div class="mb-2 flex flex-wrap items-center gap-1.5">
        <button type="button" class="rounded-full px-3 py-1" :class="poe2 === 'yes' ? 'bg-emerald-500/25 text-emerald-100 ring-1 ring-emerald-400/60' : 'border border-white/15 hover:bg-white/5'" @click="poe2 = 'yes'">PoE2 でも使える <span class="opacity-60">{{ counts.yes }}</span></button>
        <button type="button" class="rounded-full px-3 py-1" :class="poe2 === 'no' ? 'bg-rose-500/20 text-rose-100 ring-1 ring-rose-400/60' : 'border border-white/15 hover:bg-white/5'" @click="poe2 = 'no'">PoE1 だけ <span class="opacity-60">{{ counts.no }}</span></button>
        <button type="button" class="rounded-full px-3 py-1" :class="chip(poe2 === 'all')" @click="poe2 = 'all'">全部 <span class="opacity-60">{{ counts.all }}</span></button>
        <input v-model="query" type="search" placeholder="名前・シリーズで探す (例: 忘却、ミッドナイトパクト)" class="ml-auto w-72 rounded-lg border border-white/15 bg-black/30 px-2 py-1" />
      </div>
      <!-- 分類 (ゲームの分け方) -->
      <div class="mb-3 flex flex-wrap gap-1">
        <button type="button" class="rounded-lg px-2.5 py-0.5" :class="chip(cat === 'all')" @click="cat = 'all'">すべて</button>
        <button v-for="k in cats" :key="k.c" type="button" class="rounded-lg px-2.5 py-0.5" :class="chip(cat === k.c)" @click="cat = k.c">{{ k.name }} <span class="opacity-50">{{ k.count }}</span></button>
      </div>

      <p class="mb-2 opacity-50">{{ list.length }} 件</p>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2">
        <button
          v-for="x in list.slice(0, shown)"
          :key="x.i"
          type="button"
          class="flex items-center gap-2 rounded-xl border bg-white/[0.03] p-2 text-left transition hover:bg-white/[0.07]"
          :class="usableInPoe2(x) ? 'border-emerald-500/30 hover:border-emerald-400/70' : 'border-white/10 hover:border-white/30'"
          :title="(x.d ? x.d + '\n' : '') + 'poe2db で見る'"
          @click="open(x)"
        >
          <img v-if="artOf(x)" :src="artOf(x)!" alt="" loading="lazy" class="h-14 w-14 shrink-0 object-contain" draggable="false" />
          <span v-else class="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-black/30 text-[10px] opacity-40">絵なし</span>
          <span class="min-w-0 flex-1">
            <b class="line-clamp-2 text-[13px] leading-snug">{{ x.ja }}</b>
            <span v-if="x.t" class="block truncate text-[10px] opacity-50">{{ x.t }}</span>
            <span class="mt-1 inline-block rounded-full px-2 text-[10px] font-bold" :class="usableInPoe2(x) ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/10 text-white/50'">{{ usableInPoe2(x) ? "PoE2 でも使える" : "PoE1 だけ" }}</span>
          </span>
        </button>
      </div>
      <div v-if="list.length > shown" class="mt-3 text-center">
        <button type="button" class="rounded-lg border border-white/20 px-4 py-1 hover:bg-white/5" @click="shown += PAGE * 2">もっと見る (残り {{ list.length - shown }} 件)</button>
      </div>
    </template>
  </div>
</template>
