<!--
  MtxList.vue — スキン (PoE1 のマイクロトランザクションが PoE2 でも使えるか) (2026-09-29)

  オーナー「PoE1 で使えるかっこいいやつが PoE2 で使えるかわかんないから知りたい。リストで。カテゴリはゲームの仕様で区分け。
  名前はシンプルに」「クリックで使ってる所 (動画) が見られたらいい」。
  中身はゲームのクライアント ([[mtx.ts]])。PoE2 で使えるかは MtxTypes の列 (確かめ: オニキスの忘却の翼 = 使える、
  ミッドナイトパクト武器エフェクト = 使えない、どちらもオーナーの実体験と一致)。カードを押すと poe2db の日本語ページ (見た目・動画)。
  2026-09-29 オーナー「2 列で大きく確認したい」「新しく追加された順を既定に」「両方で使える物は両方タグに」「枠ぎりぎりで UI がブス」:
  2 列の大きいカード (絵 128px)、並びは新しい順 (クライアントの表の行番号が大きいほど新しい)、札は PoE1 / PoE2 を並べる、周りに余白。
-->
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import TabBar from "../../components/ui/TabBar.vue";
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
const PAGE = 90;
/** 並び: 新しい順 (既定) / 古い順。クライアントの表は追加された順に行が増える */
const order = ref<"new" | "old">("new");
const shown = ref(PAGE);
watch([poe2, cat, query, order], () => (shown.value = PAGE));

const byPoe2 = computed(() => (data.value?.items ?? []).filter((x) => (poe2.value === "all" ? true : poe2.value === "yes" ? usableInPoe2(x) : !usableInPoe2(x))));
/** 分類 (ゲームの並び順)。件数は PoE2 の絞り込みの後 */
const cats = computed(() => {
  const n = new Map<number, number>();
  for (const x of byPoe2.value) n.set(x.c, (n.get(x.c) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => (a[0] < 0 ? 1 : b[0] < 0 ? -1 : a[0] - b[0])).map(([c, count]) => ({ c, count, name: c < 0 ? "分類なし" : (data.value?.cats[c] ?? String(c)) }));
});
const list = computed(() => {
  const q = query.value.trim().toLowerCase();
  const hit = byPoe2.value.filter((x) => (cat.value === "all" || x.c === cat.value) && (!q || x.ja.toLowerCase().includes(q) || x.en.toLowerCase().includes(q) || x.t.toLowerCase().includes(q)));
  // 絵の無い物 (まだ絵が用意されていない物) は後ろへ。その中で新しい順 / 古い順
  const noArt = (x: MtxItem) => (x.a == null ? 1 : 0);
  return [...hit].sort((a, b) => noArt(a) - noArt(b) || (order.value === "new" ? b.i - a.i : a.i - b.i));
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
  <!-- 幅は窓いっぱい (2026-09-29 オーナー「縮こまってる。最大化時と縮小時を合わせて」)。列の数は窓の幅で変わる -->
  <div class="w-full text-[12px]">
    <!-- 画面名は上の帯に 1 回だけ (他の画面と同じ TabBar。2026-10-03) -->
    <TabBar art="mtx" title="スキン" />
    <div class="px-6 py-4">
    <p class="mb-3 text-[12px] text-[var(--exile-color-text-secondary)]">PoE1 で使えるスキン・エフェクト・ペットなどが PoE2 でも使えるか (ゲームのデータから。パッチで変わることがある)。カードを押すと poe2db で見た目を確かめられる。</p>
    <p v-if="error" class="text-rose-300">{{ error }}</p>
    <p v-else-if="!data" class="py-16 text-center opacity-50">読んでいます…</p>
    <template v-else>
      <!-- 絞り込み (枠は共通の .card) -->
      <section class="card mb-4 space-y-3 p-4">
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="rounded-full px-4 py-1.5" :class="poe2 === 'yes' ? 'bg-emerald-500/25 text-emerald-100 ring-1 ring-emerald-400/60' : 'border border-white/15 hover:bg-white/5'" @click="poe2 = 'yes'">PoE2 でも使える <span class="ml-1 opacity-60">{{ counts.yes }}</span></button>
          <button type="button" class="rounded-full px-4 py-1.5" :class="poe2 === 'no' ? 'bg-rose-500/20 text-rose-100 ring-1 ring-rose-400/60' : 'border border-white/15 hover:bg-white/5'" @click="poe2 = 'no'">PoE1 だけ <span class="ml-1 opacity-60">{{ counts.no }}</span></button>
          <button type="button" class="rounded-full px-4 py-1.5" :class="chip(poe2 === 'all')" @click="poe2 = 'all'">全部 <span class="ml-1 opacity-60">{{ counts.all }}</span></button>
          <span class="ml-auto flex items-center gap-2">
            <span class="flex overflow-hidden rounded-lg border border-white/15">
              <button type="button" class="px-3 py-1" :class="order === 'new' ? 'bg-amber-500/25 text-amber-100' : 'hover:bg-white/5'" @click="order = 'new'">新しい順</button>
              <button type="button" class="px-3 py-1" :class="order === 'old' ? 'bg-amber-500/25 text-amber-100' : 'hover:bg-white/5'" @click="order = 'old'">古い順</button>
            </span>
            <input v-model="query" type="search" placeholder="名前・シリーズで探す (例: 忘却)" class="w-64 rounded-lg border border-white/15 bg-black/30 px-3 py-1.5" />
          </span>
        </div>
        <!-- 分類 (ゲームの分け方) -->
        <div class="flex flex-wrap gap-1.5 border-t border-white/10 pt-3">
          <button type="button" class="rounded-lg px-3 py-1" :class="chip(cat === 'all')" @click="cat = 'all'">すべて</button>
          <button v-for="k in cats" :key="k.c" type="button" class="rounded-lg px-3 py-1" :class="chip(cat === k.c)" @click="cat = k.c">{{ k.name }} <span class="opacity-50">{{ k.count }}</span></button>
        </div>
      </section>

      <p class="mb-3 opacity-50">{{ list.length }} 件 · {{ order === "new" ? "新しく追加された順" : "古い順" }}</p>
      <!-- 2 列の大きいカード -->
      <div class="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,460px),1fr))]">
        <button
          v-for="x in list.slice(0, shown)"
          :key="x.i"
          type="button"
          class="card group flex items-center gap-4 p-4 text-left transition hover:bg-white/[0.06]"
                    title="poe2db で見た目を見る"
          @click="open(x)"
        >
          <span class="grid h-36 w-36 shrink-0 place-items-center rounded-xl bg-black/40">
            <img v-if="artOf(x)" :src="artOf(x)!" alt="" loading="lazy" class="max-h-32 max-w-32 object-contain transition group-hover:scale-105" draggable="false" />
            <span v-else class="text-[11px] opacity-40">絵なし</span>
          </span>
          <span class="min-w-0 flex-1">
            <b class="block text-[15px] leading-snug text-amber-50">{{ x.ja }}</b>
            <span class="mt-0.5 block truncate text-[11px] opacity-50">{{ [data.cats[x.c], x.t].filter(Boolean).join(" · ") }}</span>
            <!-- 札: 使えるゲームを並べる (両方で使える物は PoE1 と PoE2 の両方) -->
            <span class="mt-2 flex flex-wrap gap-1.5">
              <span class="rounded-full bg-sky-500/20 px-2.5 py-0.5 text-[11px] font-bold text-sky-200">PoE1</span>
              <span v-if="usableInPoe2(x)" class="rounded-full bg-emerald-500/25 px-2.5 py-0.5 text-[11px] font-bold text-emerald-200">PoE2</span>
              <span v-else class="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] text-white/45 line-through">PoE2</span>
            </span>
            <span v-if="x.d" class="mt-2 line-clamp-2 block text-[11px] leading-relaxed opacity-60">{{ x.d }}</span>
          </span>
        </button>
      </div>
      <div v-if="list.length > shown" class="mt-5 text-center">
        <button type="button" class="btn btn-outline" @click="shown += PAGE">もっと見る (残り {{ list.length - shown }} 件)</button>
      </div>
    </template>
    </div>
  </div>
</template>
