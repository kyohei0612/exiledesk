<!--
  SideReads.vue — クラフト台の右の列の読み物 (2026-10-22 オーナー「エミュの右側の広告は切って、そこを厚くして UI の改善も一緒に」、開発版だけ)。
  上から: 今のアイテム・持っているカレンシー・お告げに関係する記事 (2 本まで) / 新しい記事 (絵・題・1 行の説明、3 本) / 使い方の要点 (既定は畳む)。
  記事は scripts/build-blog-pages.mjs が書く /blog/index.json (読めない時は記事の欄を出さない)。関係する記事は記事の題とタグに、
  ベースの名前・部位・持っている物・お告げの名前が入っているかで選ぶ (計算はしない、文字の一致だけ)。
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { lang, tr } from "../i18n/lang";
import { craftStage, nameOf } from "../state/craft-stage";

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

/** 今の手元の言葉 (ベースの名前・部位・持っている物・お告げ)。2 文字以上だけ */
const words = computed((): string[] => {
  const s = craftStage;
  const it = s.item.value;
  const out = [it?.baseJa, it?.base, s.held.value ? nameOf(s.held.value) : null, ...s.omens.value.map((o) => nameOf(o))];
  // 「金の指輪」なら「指輪」も (部位で当たる記事)
  if (it?.baseJa && /(指輪|アミュレット|手袋|靴|兜|ベルト)$/.test(it.baseJa)) out.push(/(指輪|アミュレット|手袋|靴|兜|ベルト)$/.exec(it.baseJa)![1]);
  return [...new Set(out.filter((w): w is string => !!w && w.length >= 2))];
});
const related = computed((): Post[] => {
  const ws = words.value;
  if (!ws.length) return [];
  const score = (p: Post): number => ws.filter((w) => p.title.includes(w) || (p.tags ?? []).some((t) => t.includes(w) || w.includes(t))).length;
  return posts.value.map((p) => ({ p, n: score(p) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 2).map((x) => x.p);
});
const latest = computed(() => posts.value.filter((p) => !related.value.includes(p)).slice(0, 3));

/** 使い方の要点の開け閉め (覚える。既定は閉じる) */
const KEY = "exiledesk.sideHowto";
const howto = ref(false);
try { howto.value = localStorage.getItem(KEY) === "1"; } catch { /* 閉じたまま */ }
function toggle(): void { howto.value = !howto.value; try { localStorage.setItem(KEY, howto.value ? "1" : "0"); } catch { /* 覚えなくてよい */ } }
</script>

<template>
  <div data-side-reads class="flex flex-col gap-3 text-[12px]">
    <section v-if="related.length" data-side-related class="rounded-xl border border-amber-300/25 bg-[#1a140c] p-2.5">
      <p class="mb-1.5 text-[11px] font-bold text-amber-200">{{ tr("今のクラフトに関係する記事", "Related to this craft") }}</p>
      <a v-for="p in related" :key="p.slug" :href="p.href" class="block rounded-lg px-1.5 py-1.5 hover:bg-black/40">
        <span class="line-clamp-2 font-bold leading-snug text-[var(--exile-color-text-primary)]">{{ p.title }}</span>
        <span v-if="p.description" class="mt-0.5 line-clamp-2 leading-snug opacity-60">{{ p.description }}</span>
      </a>
    </section>
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
    <section class="rounded-xl border border-white/10 bg-[#15120d] p-2.5">
      <button type="button" class="flex w-full items-center text-[11px] font-bold text-amber-200" :aria-expanded="howto" @click="toggle">{{ tr("使い方の要点", "How to use") }}<span class="ml-auto font-normal opacity-60">{{ howto ? "▲" : "▼" }}</span></button>
      <ol v-if="howto" class="mt-1.5 list-decimal space-y-1 pl-4 leading-snug opacity-80">
        <li>{{ tr("「ベースを変える」で作りたいベースとアイテムレベルを選ぶ", "Pick a base and item level with “Change base”") }}</li>
        <li>{{ tr("棚のカレンシーを押して持ち、アイテムを押すと 1 回使う", "Click a currency to hold it, then click the item to use it") }}</li>
        <li>{{ tr("お告げは持っている物の下に出る。押して掛けてから打つ", "Omens appear under the held item; click to activate before using") }}</li>
        <li>{{ tr("MOD 一覧の「次の手で狙う」で一番当たりやすい打ち方を見る", "Use “Target next move” in the mod list to see the best method") }}</li>
      </ol>
    </section>
  </div>
</template>
