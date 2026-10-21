<!--
  BlogLatest.vue — クラフト台の右の列 (チャンネルの下) に新しい記事の題を 3 本 (2026-10-22 オーナー、ブログ。開発版だけ)。
  中身は scripts/build-blog-pages.mjs が書く /blog/index.json (新しい順)。読めない時 (手元の dev・本番でまだ作っていない) は何も出さない。
  押すと記事のページ (/blog/<slug>/、JS 無しの読み物) へ移る。
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { lang, tr } from "../i18n/lang";

interface Post { slug: string; title: string; date: string; href: string; draft?: boolean }
const all = ref<{ ja: Post[]; en: Post[] } | null>(null);
onMounted(async () => {
  try {
    const r = await fetch("/blog/index.json", { cache: "no-cache" });
    if (r.ok) all.value = (await r.json()) as { ja: Post[]; en: Post[] };
  } catch { /* 無ければ出さない */ }
});
// 英語の記事が無い時は日本語の記事
const posts = computed(() => { const a = all.value; return a ? ((lang.value === "en" && a.en.length ? a.en : a.ja) ?? []).slice(0, 3) : []; });
const listHref = computed(() => (lang.value === "en" && all.value?.en.length ? "/en/blog/" : "/blog/"));
</script>

<template>
  <div v-if="posts.length" data-blog-latest class="mt-3 rounded-xl border border-white/10 bg-[#15120d] p-2.5 text-[12px]">
    <div class="mb-1.5 flex items-center text-[11px] font-bold text-amber-200">{{ tr("新しい記事", "Latest posts") }}<a :href="listHref" class="ml-auto font-normal text-[var(--exile-color-text-tertiary)] hover:text-amber-200">{{ tr("一覧", "All") }}</a></div>
    <ul class="flex flex-col gap-1">
      <li v-for="p in posts" :key="p.slug">
        <a :href="p.href" class="block rounded-md px-1.5 py-1 hover:bg-black/40" :title="p.title">
          <span class="line-clamp-2 leading-snug text-[var(--exile-color-text-primary)]">{{ p.title }}</span>
          <span class="text-[10px] opacity-50">{{ p.date }}<template v-if="p.draft"> · {{ tr("下書き", "Draft") }}</template></span>
        </a>
      </li>
    </ul>
  </div>
</template>
