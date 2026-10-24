<!--
  SkinsPage.vue — PoE2 で使える PoE1 のスキンの一覧のページ (?page=skins、上のタブ「コスメティック」。2026-10-25 オーナー「それだけでいいから。DB 調べって話と責任持てませんって話で」「絵もいるでしょ」)。
  絵・名前 (poe2db の日英)・種類・poe2db へのリンク。名前で探す・種類で絞る。データは skins.ts、開発版だけ (スイッチ skins)。
  絵は 1 枚ずつ遅れて読む (静的な置き場なので 1 日の枠に数えない、サーバー管理人 10-25)。下書きはデザイン部長 5 本目 (0fbd1f70)
-->
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import Icon from "../../components/ui/Icon.vue";
import { lang, tr } from "../../i18n/lang";
import { closeSkinsPage } from "../../web/page";
import WebFooter from "../../web/WebFooter.vue";
import { loadSkins, type Skin, type SkinList } from "./skins";

const data = shallowRef<SkinList | null>(null);
const failed = ref(false);
onMounted(() => { loadSkins().then((x) => { data.value = x; }, () => { failed.value = true; }); });

const en = computed(() => lang.value === "en");
const query = ref("");
/** 絞る種類のキー ("" = 全部)。日本語は種類の番号、英語は poe2db の種類の英語名 (英語名の無い種類は "other" にまとめる) */
const cat = ref("");
watch(en, () => { cat.value = ""; });
const kindOf = computed(() => new Map((data.value?.kinds ?? []).map((k) => [k.k, k])));
const keyOf = (s: Skin): string => {
  const k = kindOf.value.get(s.k);
  return en.value ? k?.en ?? "other" : k?.ja ? String(s.k) : "other";
};
const labelOf = (s: Skin): string => {
  const k = kindOf.value.get(s.k);
  return (en.value ? k?.en : k?.ja) ?? tr("その他", "Other");
};
/** 種類の一覧 (多い順、その他は最後) */
const cats = computed(() => {
  const n = new Map<string, { key: string; label: string; n: number }>();
  for (const s of data.value?.items ?? []) {
    const key = keyOf(s);
    const c = n.get(key) ?? { key, label: labelOf(s), n: 0 };
    c.n++;
    n.set(key, c);
  }
  return [...n.values()].sort((a, b) => Number(a.key === "other") - Number(b.key === "other") || b.n - a.n);
});
const nameOf = (s: Skin): string => (en.value ? s.en : s.ja);
const sorted = computed(() => [...(data.value?.items ?? [])].sort((a, b) => nameOf(a).localeCompare(nameOf(b), en.value ? "en" : "ja")));
const shown = computed(() => {
  const q = query.value.trim().toLowerCase();
  return sorted.value.filter((s) => (!cat.value || keyOf(s) === cat.value) && (!q || s.ja.toLowerCase().includes(q) || s.en.toLowerCase().includes(q)));
});
/** 一度に出す行の数 (「もっと見る」で足す) */
const STEP = 100;
const limit = ref(STEP);
watch([query, cat, en], () => { limit.value = STEP; });
/** 読めなかった絵 (枠だけ残す) */
const broken = ref(new Set<string>());
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
        {{ tr("poe2db を元にした一覧です。ゲームで実際に使えるか・見た目どおりに動くかは保証しません。", "This list is based on poe2db. We can't guarantee that each skin works or looks as expected in the game.") }}
      </p>

      <div class="flex flex-wrap items-center gap-2">
        <span class="relative min-w-0 flex-1 basis-56">
          <Icon name="search" class="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 opacity-50" />
          <input v-model="query" data-skins-search type="search" class="h-8 w-full rounded-lg border border-white/15 bg-black/40 pl-8 pr-2 outline-none focus:border-amber-400/60 max-md:h-11" :placeholder="tr('名前で探す (日本語・英語)', 'Search by name')" />
        </span>
        <select v-model="cat" data-skins-cat class="h-8 max-w-full rounded-lg border border-white/15 bg-black/40 px-2 outline-none focus:border-amber-400/60 max-md:h-11 max-md:flex-1" :aria-label="tr('種類', 'Type')">
          <option value="">{{ tr("すべての種類", "All types") }} ({{ data?.items.length ?? 0 }})</option>
          <option v-for="c in cats" :key="c.key" :value="c.key">{{ c.label }} ({{ c.n }})</option>
        </select>
      </div>

      <p v-if="failed" class="py-8 text-center text-rose-300">{{ tr("一覧を読めませんでした。読み直してください", "Couldn't load the list. Please reload.") }}</p>
      <p v-else-if="!data" class="py-8 text-center opacity-60">{{ tr("読み込み中", "Loading") }}</p>
      <template v-else>
        <p class="mt-3 text-[12px] opacity-60">{{ tr(`${shown.length} 件`, `${shown.length} skins`) }}</p>
        <ul data-skins-list class="mt-1 divide-y divide-white/[0.06]">
          <li v-for="s in shown.slice(0, limit)" :key="s.en + s.k" data-skins-row class="flex items-center gap-3 py-1.5 max-md:gap-2">
            <span class="grid size-12 shrink-0 place-items-center rounded-md bg-black/40">
              <img v-if="s.art && !broken.has(s.art)" :src="s.art" alt="" loading="lazy" decoding="async" draggable="false" class="max-h-12 max-w-12 object-contain" @error="broken = new Set(broken).add(s.art!)" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[14px] text-[var(--exile-color-text-title)]">{{ nameOf(s) }}</span>
              <span v-if="!en" class="block truncate text-[11px] opacity-45">{{ s.en }}</span>
              <span class="hidden truncate text-[11px] text-[var(--exile-color-text-secondary)] max-md:block">{{ labelOf(s) }}</span>
            </span>
            <span class="w-40 shrink-0 truncate text-[12px] text-[var(--exile-color-text-secondary)] max-md:hidden">{{ labelOf(s) }}</span>
            <a v-if="s.url" :href="en ? s.url.en : s.url.ja" target="_blank" rel="noopener noreferrer" data-skins-link class="g-btn sm shrink-0 max-md:min-h-9">poe2db ↗</a>
            <span v-else class="w-[74px] shrink-0 text-center text-[11px] opacity-45" :title="tr('poe2db の一覧に無い物 (名前はゲームのデータのまま)', 'Not in the poe2db list (name from the game data)')">{{ tr("poe2db に無し", "Not on poe2db") }}</span>
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
