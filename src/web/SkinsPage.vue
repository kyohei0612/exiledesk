<!--
  SkinsPage.vue — PoE2 で使える PoE1 のスキンの一覧のページ (?page=skins、2026-10-25 オーナー「それだけでいいから。DB 調べって話と責任持てませんって話で」)。
  名前・種類・poe2db へのリンクだけ。名前で探す・種類で絞る。絵は出さない (アプリの mtx-art は持ち込まない)。データは skins.ts、開発版だけ (スイッチ skins)
-->
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import Icon from "../components/ui/Icon.vue";
import { lang, tr } from "../i18n/lang";
import { closeSkinsPage } from "./page";
import { loadSkins, type Skin } from "./skins";
import WebFooter from "./WebFooter.vue";

const all = shallowRef<Skin[] | null>(null);
const failed = ref(false);
onMounted(() => { loadSkins().then((x) => { all.value = x; }, () => { failed.value = true; }); });

const query = ref("");
/** 絞る種類 (分類の日本語名。"" = 全部) */
const cat = ref("");
const catName = (s: Skin): string => (s.cat ? (lang.value === "en" ? s.cat.en ?? s.cat.ja : s.cat.ja) : tr("その他", "Other"));
/** 種類の一覧 (多い順) */
const cats = computed(() => {
  const n = new Map<string, { key: string; label: string; n: number }>();
  for (const s of all.value ?? []) {
    const key = s.cat?.ja ?? "";
    const c = n.get(key) ?? { key, label: catName(s), n: 0 };
    c.n++;
    n.set(key, c);
  }
  return [...n.values()].sort((a, b) => b.n - a.n);
});
const shown = computed(() => {
  const q = query.value.trim().toLowerCase();
  return (all.value ?? []).filter((s) => (!cat.value || (s.cat?.ja ?? "") === cat.value) && (!q || s.ja.toLowerCase().includes(q) || s.en.toLowerCase().includes(q)));
});
/** 一度に出す行の数 (「もっと見る」で足す) */
const STEP = 100;
const limit = ref(STEP);
watch([query, cat], () => { limit.value = STEP; });
</script>

<template>
  <section data-skins-page class="min-w-0 flex-1 p-4 max-md:px-2">
    <div class="mb-3 flex flex-wrap items-center gap-3">
      <h1 class="g-tabbar g-brush flex min-w-0 flex-1 items-center px-8 text-[22px] max-md:!min-h-[40px] max-md:px-6 max-md:text-[15px] tracking-[0.18em] max-md:tracking-[0.04em] text-[var(--exile-color-text-title)] [text-shadow:0_2px_2px_#000,0_0_16px_rgba(255,200,110,0.3)]">{{ tr("PoE2 で使える PoE1 のスキン", "PoE1 skins usable in PoE2") }}</h1>
      <button type="button" data-skins-back class="g-btn sm order-first max-md:min-h-10" @click="closeSkinsPage">{{ tr("← クラフトへ戻る", "← Back to craft") }}</button>
    </div>

    <div class="g-panel px-4 py-3 text-[13px] max-md:px-3">
      <!-- 断り (オーナー「DB 調べって話と責任持てませんって話」) -->
      <p data-skins-note class="mb-3 text-[12px] leading-relaxed text-[var(--exile-color-text-secondary)]">
        {{ tr("poe2db を元にした一覧です。ゲームで実際に使えるか・見た目どおりに動くかは保証しません (責任は持てません)。", "This list is based on poe2db. We can't guarantee that each skin works or looks as expected in the game.") }}
      </p>

      <div class="flex flex-wrap items-center gap-2">
        <span class="relative min-w-0 flex-1 basis-56">
          <Icon name="search" class="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 opacity-50" />
          <input v-model="query" data-skins-search type="search" class="h-8 w-full rounded-lg border border-white/15 bg-black/40 pl-8 pr-2 outline-none focus:border-amber-400/60 max-md:h-11" :placeholder="tr('名前で探す (日本語・英語)', 'Search by name')" />
        </span>
        <select v-model="cat" data-skins-cat class="h-8 max-w-full rounded-lg border border-white/15 bg-black/40 px-2 outline-none focus:border-amber-400/60 max-md:h-11 max-md:flex-1" :aria-label="tr('種類', 'Type')">
          <option value="">{{ tr("すべての種類", "All types") }} ({{ (all ?? []).length }})</option>
          <option v-for="c in cats" :key="c.key" :value="c.key">{{ c.label }} ({{ c.n }})</option>
        </select>
      </div>

      <p v-if="failed" class="py-8 text-center text-rose-300">{{ tr("一覧を読めませんでした。読み直してください", "Couldn't load the list. Please reload.") }}</p>
      <p v-else-if="!all" class="py-8 text-center opacity-60">{{ tr("読み込み中", "Loading") }}</p>
      <template v-else>
        <p class="mt-3 text-[12px] opacity-60">{{ tr(`${shown.length} 件`, `${shown.length} skins`) }}</p>
        <ul data-skins-list class="mt-1 divide-y divide-white/[0.06]">
          <li v-for="s in shown.slice(0, limit)" :key="s.en" class="flex items-center gap-3 py-1.5 max-md:flex-wrap max-md:gap-x-2 max-md:gap-y-0.5">
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[14px] text-[var(--exile-color-text-title)]">{{ lang === "en" ? s.en : s.ja }}</span>
              <span v-if="lang !== 'en'" class="block truncate text-[11px] opacity-45">{{ s.en }}</span>
            </span>
            <span class="w-40 shrink-0 truncate text-[12px] text-[var(--exile-color-text-secondary)] max-md:order-last max-md:w-auto max-md:basis-full">{{ catName(s) }}</span>
            <a :href="lang === 'en' ? s.url.en : s.url.ja" target="_blank" rel="noopener noreferrer" data-skins-link class="g-btn sm shrink-0 max-md:min-h-9">poe2db ↗</a>
          </li>
        </ul>
        <p v-if="!shown.length" class="py-8 text-center opacity-60">{{ tr("見つかりません", "No matches") }}</p>
        <!-- 一覧の下は「もっと見る」の帯くらい空ける (メモ feedback-list-bottom-space) -->
        <button v-if="shown.length > limit" type="button" data-skins-more class="g-btn sm mt-3 w-full max-md:min-h-10" @click="limit += STEP">{{ tr(`もっと見る (残り ${shown.length - limit} 件)`, `Show more (${shown.length - limit} left)`) }}</button>
        <div class="h-6" />
      </template>
    </div>
    <WebFooter class="mt-10" />
  </section>
</template>
