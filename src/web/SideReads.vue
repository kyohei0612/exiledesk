<!--
  SideReads.vue — クラフト台の右の列の読み物 (2026-10-22 オーナー「エミュの右側の広告は切って、そこを厚くして UI の改善も一緒に」、開発版だけ)。
  新しい記事 (絵・題・1 行の説明、3 本)。記事は scripts/build-blog-pages.mjs が書く /blog/index.json (読めない時は出さない)。
  「今のクラフトに関係する記事」と「使い方の要点」は 2026-10-22 オーナー「ここはいらんかな」で外した (文章の少ない画面になるのは承知の上)。
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { lang, tr } from "../i18n/lang";

interface Post { slug: string; title: string; date: string; href: string; draft?: boolean; description?: string; tags?: string[]; image?: string }
const all = ref<{ ja: Post[]; en: Post[] } | null>(null);
onMounted(async () => {
  try {
    const r = await fetch("/blog/index.json", { cache: "no-cache" });
    if (r.ok) all.value = (await r.json()) as { ja: Post[]; en: Post[] };
  } catch { /* 無ければ出さない */ }
});
const posts = computed((): Post[] => { const a = all.value; return a ? (lang.value === "en" && a.en.length ? a.en : a.ja) ?? [] : []; });
const listHref = computed(() => (lang.value === "en" && all.value?.en.length ? "/en/blog/" : "/blog/"));

const latest = computed(() => posts.value.slice(0, 3));

</script>

<template>
  <div data-side-reads class="flex flex-col gap-3 text-[12px]">
    <section v-if="latest.length" data-blog-latest class="rounded-xl border border-white/10 bg-[#15120d] p-2.5">
      <p class="mb-2 flex items-center text-[11px] font-bold text-amber-200">{{ tr("新しい記事", "Latest posts") }}<a :href="listHref" class="ml-auto font-normal text-[var(--exile-color-text-tertiary)] hover:text-amber-200">{{ tr("すべて見る", "All posts") }}</a></p>
      <ul class="flex flex-col gap-2">
        <li v-for="p in latest" :key="p.slug">
          <a :href="p.href" class="flex gap-2 rounded-lg p-1 hover:bg-black/40" :title="p.title">
            <img v-if="p.image" :src="p.image" alt="" loading="lazy" class="aspect-[1200/630] w-[88px] shrink-0 self-start rounded object-cover" />
            <span class="min-w-0">
              <span class="line-clamp-2 font-bold leading-snug text-[var(--exile-color-text-primary)]">{{ p.title }}</span>
              <span v-if="p.description" class="mt-0.5 line-clamp-2 leading-snug opacity-60">{{ p.description }}</span>
              <span class="text-[10px] opacity-40">{{ p.date }}<template v-if="p.draft"> · {{ tr("下書き", "Draft") }}</template></span>
            </span>
          </a>
        </li>
      </ul>
    </section>
  </div>
</template>
