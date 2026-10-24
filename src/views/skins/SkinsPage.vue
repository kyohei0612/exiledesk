<!--
  SkinsPage.vue — PoE2 で使える PoE1 のスキンの一覧のページ (?page=skins、上のタブ「コスメティック」。2026-10-25 オーナー「それだけでいいから。DB 調べって話と責任持てませんって話で」「絵もいるでしょ」)。
  絵・名前 (poe2db の日英)・種類・poe2db へのリンク。名前で探す・種類で絞る。データは skins.ts、開発版だけ (スイッチ skins)。
  絵は 1 枚ずつ遅れて読む (静的な置き場なので 1 日の枠に数えない、サーバー管理人 10-25)。下書きはデザイン部長 5 本目 (0fbd1f70)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import Icon from "../../components/ui/Icon.vue";
import ModalShell from "../../components/ui/ModalShell.vue";
import { lang, tr } from "../../i18n/lang";
import { closeSkinsPage } from "../../web/page";
import WebFooter from "../../web/WebFooter.vue";
import SkinCard from "./SkinCard.vue";
import { buyable, loadSkins, SKIN_GROUPS, type Skin, type SkinCardData as Card, type SkinData, type SkinSet } from "./skins";

const data = shallowRef<SkinData | null>(null);
const failed = ref(false);
onMounted(() => { loadSkins().then((x) => { data.value = x; }, () => { failed.value = true; }); });

const en = computed(() => lang.value === "en");
const query = ref("");
/**
 * 絞るまとめの id ("" = すべて)。まとめは groups.json の 9 個 (一式を含む、オーナー 10-25 夜「9 個」)。
 * 「すべて」と「一式」では一式を 1 枚のカードに (部品は出さない、二重にしない)。ほかのまとめでは部品を 1 枚ずつ
 */
const cat = ref("");
/**
 * ショップで買える物は出さない (オーナー 10-25 最後の決め「PoE2 でコスメ売ってない物、PoE1 から移植できる物のみ表示ね」。切り替えも無し)。
 * 店は PoE1 と PoE2 で共通。一式は部品のどれか 1 つでも買えれば出さない
 */
const srcOk = (x: Skin | SkinSet): boolean => !buyable(x);
const setMode = computed(() => cat.value === "" || cat.value === "set");
const cats = computed(() => SKIN_GROUPS.map((g) => ({ key: g.id, label: en.value ? g.en : g.ja, n: g.id === "set" ? (data.value?.sets ?? []).filter(srcOk).length : (data.value?.items ?? []).filter((s) => s.group === g && srcOk(s)).length })));
/** 「すべて」の件数 (一式のカード + 一式に入っていない物、ショップの切り替えの後) */
const allCount = computed(() => (data.value ? data.value.sets.filter(srcOk).length + data.value.items.filter((s) => !s.set && srcOk(s)).length : 0));
const itemCard = (s: Skin): Card => ({ key: `i:${s.en}:${s.kind.ja}`, name: en.value ? s.en : s.ja, sub: en.value ? "" : s.en, kind: en.value ? s.kind.en : s.kind.ja, art: s.art, url: en.value ? s.url.en : s.url.ja, parts: 0, order: s.order, set: null, origin: s.origin });
/** 一式のカード: 名前は「○○ 一式」、種類の行は部品の種類を並べる (例 兜スキン・靴スキン・ポートレートフレーム) */
const setCard = (t: SkinSet): Card => ({
  key: `s:${t.en}:${t.ja}`,
  name: en.value ? `${t.en} Set` : `${t.ja} 一式`,
  sub: en.value ? "" : `${t.en} Set`,
  kind: [...new Set(t.parts.map((s) => (en.value ? s.kind.en : s.kind.ja)))].join(en.value ? " · " : "・"),
  art: t.main.art,
  url: en.value ? t.main.url.en : t.main.url.ja,
  parts: t.parts.length,
  order: t.order,
  set: t,
  origin: t.origin,
});
const hit = (s: Skin, q: string): boolean => s.ja.toLowerCase().includes(q) || s.en.toLowerCase().includes(q);
const shown = computed((): Card[] => {
  const d = data.value;
  if (!d) return [];
  const q = query.value.trim().toLowerCase();
  const out: Card[] = [];
  if (setMode.value) {
    for (const t of d.sets) if (srcOk(t) && (!q || t.ja.toLowerCase().includes(q) || t.en.toLowerCase().includes(q) || t.parts.some((s) => hit(s, q)))) out.push(setCard(t));
    if (cat.value === "") for (const s of d.items) if (!s.set && srcOk(s) && (!q || hit(s, q))) out.push(itemCard(s));
  } else {
    for (const s of d.items) if (s.group.id === cat.value && srcOk(s) && (!q || hit(s, q))) out.push(itemCard(s));
  }
  // 発売が新しい順 (オーナー 10-25「上から発売日が近い順」)、日付が分からない物は最後で名前の順 (Intl.Collator を 1 つ使い回す)
  const c = new Intl.Collator(en.value ? "en" : "ja");
  return out.sort((x, y) => (y.order ?? -1) - (x.order ?? -1) || c.compare(x.name, y.name));
});
/**
 * 一度に出す数。始めは 1〜2 画面分だけ出し、下の「もっと見る」が見えかけたら足す (出しすぎない)。
 * 押しても足せる。STEP 枚の塊ごとに画面の外では描かない (content-visibility)、絵は見える所だけ読む (loading=lazy)
 */
const STEP = 30;
const limit = ref(STEP);
watch([query, cat, en], () => { limit.value = STEP; });
/** 出す物を STEP 枚ずつの塊に (塊ごとに画面の外では描かない。1 枚ずつに付けると全部出した後に流し直す時に引っかかった) */
const chunks = computed(() => {
  const out: Card[][] = [];
  for (let i = 0; i < Math.min(limit.value, shown.value.length); i += STEP) out.push(shown.value.slice(i, Math.min(i + STEP, limit.value)));
  return out;
});
const more = ref<HTMLElement | null>(null);
let io: IntersectionObserver | null = null;
watch(more, (el) => {
  io?.disconnect();
  if (!el) return;
  io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) limit.value += STEP; }, { rootMargin: "0px 0px 600px 0px" });
  io.observe(el);
});
onBeforeUnmount(() => io?.disconnect());
/** 開いている一式 (押すと中の部品を小窓で。オーナー 10-25「一式押したら展開させないと意味ない」。もう一度押す・枠の外・Esc で閉じる = ModalShell) */
const openSet = shallowRef<SkinSet | null>(null);
const openParts = computed(() => (openSet.value ? openSet.value.parts.map(itemCard).sort((x, y) => (y.order ?? -1) - (x.order ?? -1)) : []));
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
        {{ tr("PoE1 で出た MTX (マイクロトランザクション) のうち PoE2 でも使える物を、poe2db を元にまとめた一覧です (PoE2 で出た物は除く。今ショップで買える物も除く)。ゲームで実際に使えるか・見た目どおりに動くかは保証しません。", "PoE1 MTX (microtransactions) that are also usable in PoE2, listed from poe2db (items released in PoE2 are left out; items currently sold in the shop are left out too). We can't guarantee that each skin works or looks as expected in the game.") }}
      </p>

      <div class="flex flex-wrap items-center gap-2">
        <span class="relative min-w-0 flex-1 basis-56">
          <Icon name="search" class="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 opacity-50" />
          <input v-model="query" data-skins-search type="search" class="h-8 w-full rounded-lg border border-white/15 bg-black/40 pl-8 pr-2 outline-none focus:border-amber-400/60 max-md:h-11" :placeholder="tr('名前で探す (日本語・英語)', 'Search by name')" />
        </span>
        <select v-model="cat" data-skins-cat class="h-8 max-w-full rounded-lg border border-white/15 bg-black/40 px-2 outline-none focus:border-amber-400/60 max-md:h-11 max-md:flex-1" :aria-label="tr('種類', 'Type')">
          <option value="">{{ tr("すべての種類", "All types") }} ({{ allCount }})</option>
          <option v-for="c in cats" :key="c.key" :value="c.key">{{ c.label }} ({{ c.n }})</option>
        </select>
      </div>

      <p v-if="failed" class="py-8 text-center text-rose-300">{{ tr("一覧を読めませんでした。読み直してください", "Couldn't load the list. Please reload.") }}</p>
      <p v-else-if="!data" class="py-8 text-center opacity-60">{{ tr("読み込み中", "Loading") }}</p>
      <template v-else>
        <p class="mt-3 text-[12px] opacity-60">{{ tr(`${shown.length} 件`, `${shown.length} skins`) }}</p>
        <!-- 絵が主役のカード (オーナー 10-25「横 3 列ででかく」→ 元の絵が 128px で 3 列だと引き伸ばしになるので「統一できなければ 4 列」: PC 4 枚・狭い PC 3 枚・スマホ 2 枚、名前と種類は下)。
             押すと poe2db のページを新しいタブで (アプリの MtxList と同じ)。一式は代表の部品 (鎧など) の絵と右上に点数、押すと中の部品の小窓 -->
        <div data-skins-list class="mt-2">
          <div v-for="(c, i) in chunks" :key="i" class="grid grid-cols-4 gap-3 pb-3 [contain-intrinsic-size:auto_2400px] [content-visibility:auto] max-xl:grid-cols-3 max-md:grid-cols-2 max-md:gap-2 max-md:pb-2">
            <SkinCard v-for="s in c" :key="s.key" :card="s" @open="openSet = s.set" />
          </div>
        </div>
        <p v-if="!shown.length" class="py-8 text-center opacity-60">{{ tr("見つかりません", "No matches") }}</p>
        <!-- 一覧の下は「もっと見る」の帯くらい空ける (メモ feedback-list-bottom-space) -->
        <button v-if="shown.length > limit" ref="more" type="button" data-skins-more class="g-btn sm mt-3 w-full max-md:min-h-10" @click="limit += STEP">{{ tr(`もっと見る (残り ${shown.length - limit} 件)`, `Show more (${shown.length - limit} left)`) }}</button>
        <div class="h-6" />
      </template>
    </div>
    <WebFooter class="mt-10" />
    <!-- 一式の中の部品 (部品のカードを押すとそれぞれの poe2db) -->
    <ModalShell :open="!!openSet" :title="openSet ? (en ? `${openSet.en} Set` : `${openSet.ja} 一式`) : ''" width="w-full max-w-[56rem]" rec="skins-set" @close="openSet = null">
      <div data-skins-set-parts class="grid grid-cols-4 gap-3 max-md:grid-cols-2 max-md:gap-2">
        <SkinCard v-for="s in openParts" :key="s.key" :card="s" />
      </div>
    </ModalShell>
  </section>
</template>
