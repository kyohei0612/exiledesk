<!--
  ModTable.vue — 「このベースに付く MOD」の表の土台 (共通管理 for-share、2026-10-23 オーナー: 両方の画面で一緒の部品は共通、画面ごとの物は差し込みで足す)。
  エンジンの MOD 一覧 (modListFor) を、種類の節 (目次のタブ・検索) × プレフィックス / サフィックスの 2 列 × 1 系統 1 行で並べ、行を押すと段の表を開くだけ。
  画面ごとの物は持たない: エミュ (持った時の %・狙いのチェック・次の手で狙う・付ける・重みを直す) は views/craft-stage/StageModList.vue、
  シミュ (狙いにする) は views/simulator/tree/TreeGoalPage.vue が、下の props (数字の出し方) と slot (行・段の前後) で足す。
  見た目の決まりの出どころは前の StageModList.vue (2026-09-29〜) のコメントのまま。
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { modListFor, tagLabel, type ListRow, type ListTier, type ModGroup, type PatchData, type StageItem } from "../../../services/craft-stage/engine";
import { factionOf, groupLabelOf, runeEnOf, shownTags, TAG_STYLE } from "../../../services/craft-stage/mod-list";
import { fmtPct } from "../../../utils/format-pct";
import { tr } from "../../../i18n/lang";
import { keepPlace, revealOpened, scrollToTop } from "../../../utils/keep-place";
import { useDismiss } from "../../../utils/use-dismiss";
import Disclosure from "../../ui/Disclosure.vue";
import { essName, tierName, toneOf, weightNote } from "./stage-mod-list-look";

export interface ModSection { g: ModGroup; sid: string; label: string; rune: string | null; socketed: boolean; count: number; columns: Array<{ side: "prefix" | "suffix"; title: string; items: ListRow[]; top: number }> }

const props = withDefaults(defineProps<{
  data: PatchData | null;
  item: StageItem | null;
  /** 重ねの窓の中 (目次の帯の左右の余白を詰めない時は false) */
  overlay?: boolean;
  /** 行の % (既定 = 出やすさ = 同じ側の重みの割合。今は付かない行は 0) */
  share?: (r: ListRow) => number;
  /** 段の % の文字 (既定 = 出やすさを段の重みで割った物) */
  tierShare?: (r: ListRow, t: ListTier) => string;
  /** 行・段を薄くする (既定 = 同じ系統が付いている・差していないルーン) */
  rowDim?: (r: ListRow) => boolean;
  tierDim?: (r: ListRow, t: ListTier) => boolean;
  rowTitle?: (r: ListRow) => string | undefined;
  tierTitle?: (r: ListRow, t: ListTier) => string | undefined;
  shareTitle?: (r: ListRow) => string;
  /** % の列の見出しと色 (sky = 持っている物の確率) */
  shareHead?: string;
  tone?: "amber" | "sky";
  /** 節を下へ回す (既定 = 差していないルーンの節) */
  sectionLate?: (sec: ModSection) => boolean;
  /** 「↑ クラフトへ」のボタン (渡した時だけ出す) */
  toCraft?: () => void;
  /** 開いた段の表を閉じない所 (行から出る小窓など) */
  keepOpen?: readonly string[];
  /**
   * 段の表の中で 1 つを選び終える手 (押した後に段の表を閉じる)。既定 = シミュの「狙いにする」(まだ選んでいない段)・エミュの狙いの窓の「確率を見る」・付け方の窓の項目。
   * 段の中で選び直す物 (含む)・印の付け外し (フラクチャー)・選んだ物を外す手 (.on をもう一度) は閉じない (2026-10-24 オーナー「動きは全部共通に」)
   */
  closeAfter?: string;
}>(), { overlay: false, shareHead: undefined, tone: "amber", keepOpen: () => ["[data-helptip-pop]"], closeAfter: '[data-mod-pick]:not(.on), [data-rec="aim-decide"], [data-mod-add-menu] [role="menuitem"]:not([aria-disabled="true"])' });

const rows = computed(() => (props.data && props.item ? modListFor(props.data, props.item) : []));
/** 今は付かない行 (同じ系統が付いている・差していないルーン・骨を使わないと付かない冒涜と異界) は 0% (2026-10-09 オーナー) */
const cannowBase = (r: ListRow): boolean => !r.blocked && !(r.group === "rune" && !r.socketed) && r.group !== "desecrated" && r.group !== "otherworldly";
const shareOf = (r: ListRow): number => (props.share ? props.share(r) : cannowBase(r) ? r.share : 0);
const dimOf = (r: ListRow): boolean => (props.rowDim ? props.rowDim(r) : r.blocked || (r.group === "rune" && !r.socketed));
const tierShareText = (r: ListRow, t: ListTier): string => (props.tierShare ? props.tierShare(r, t) : !cannowBase(r) ? "0%" : t.weight && r.weight ? fmtPct((r.share * t.weight) / r.weight) : "");
const colTop = (items: readonly ListRow[]): number => Math.max(0.0001, ...items.map(shareOf));
const pct = (x: number): string => fmtPct(x);

/** 節の並び (既定)。普通 → ルーン → 冒涜 → 創生の樹など → 異界 → エッセンス (2026-10-11 オーナー)。エッセンスはマジック用とレア用を 1 つの節に */
const GROUPS: ModGroup[] = ["normal", "rune", "desecrated", "special", "otherworldly", "essence"];
const inGroup = (r: { group: ModGroup }, g: ModGroup): boolean => r.group === g || (g === "essence" && r.group === "perfect_essence");
const counts = computed(() => Object.fromEntries(GROUPS.map((g) => [g, rows.value.filter((r) => inGroup(r, g)).length])) as Record<ModGroup, number>);
const query = ref("");
/** 開いている段の表 (種類:系統) */
const expanded = ref<string | null>(null);
const listEl = ref<HTMLElement | null>(null);
// 開いた段の表は行の外を押す・Esc で閉じる (押した物には届ける。2026-10-22 オーナー「キャンセルは枠の外をクリックで」)
useDismiss(() => !!expanded.value, [() => (expanded.value ? listEl.value?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(expanded.value)}"]`) : null), ...props.keepOpen.map((q) => () => document.querySelector<HTMLElement>(q))], () => { expanded.value = null; }, { swallow: false, keep: '[data-rec^="mod:"]' });
/** 少しの間光らせる行・枠で囲む段 (カードから飛んで来た時、jumpTo) */
const flashKey = ref<string | null>(null);
let flashTimer: ReturnType<typeof setTimeout> | undefined;
const jumped = ref<{ key: string; modId: string; rank: string | null } | null>(null);
const isJumpTier = (key: string, modId: string, rank: string): boolean => !!jumped.value && jumped.value.key === key && jumped.value.modId === modId && jumped.value.rank === rank;

/** 選び終える手 (closeAfter) を押したら、画面の側の処理の後で段の表を閉じる。押した行は画面の同じ所に残す。小窓 (付け方) は body にあるので document で受ける */
function onPicked(e: MouseEvent): void {
  const key = expanded.value;
  if (!key || !(e.target instanceof Element) || !e.target.closest(props.closeAfter)) return;
  setTimeout(() => {
    if (expanded.value !== key) return;
    keepPlace(listEl.value?.querySelector(`[data-row-key="${CSS.escape(key)}"] [data-rec^="mod:"]`), () => { expanded.value = null; });
  });
}
onMounted(() => document.addEventListener("click", onPicked, true));
onBeforeUnmount(() => document.removeEventListener("click", onPicked, true));
/** 行を押して段の表を開く / 閉じる。押した行は画面の同じ所に残し、表はその下に開く。開いた時は行と段の表が全部見える所まで送る (2026-10-19) */
function toggleRow(key: string, ev: MouseEvent): void {
  const row = (ev.currentTarget as HTMLElement).closest("[data-row-key]"); keepPlace(ev.currentTarget as HTMLElement, () => { expanded.value = expanded.value === key ? null : key; }); if (expanded.value === key) revealOpened(row);
}
/** 種類ごとの節 (中身のある物だけ)。ルーンの特殊 MOD はルーンごとに別の節で、見出しはルーンの名前 (2026-10-04 オーナー) */
const sections = computed((): ModSection[] => {
  const q = query.value.trim();
  const parts: Array<{ g: ModGroup; sid: string; label: string; rune: string | null }> = GROUPS.filter((g) => counts.value[g]).flatMap((g): Array<{ g: ModGroup; sid: string; label: string; rune: string | null }> =>
    g === "rune"
      ? [...new Set(rows.value.filter((r) => r.group === "rune").map((r) => r.runeJa ?? ""))].map((ja) => ({ g, sid: `rune:${ja}`, label: tr(ja, runeEnOf(ja)), rune: ja }))
      : [{ g, sid: g as string, label: groupLabelOf(g, props.item), rune: null as string | null }],
  );
  return parts.map(({ g, sid, label, rune }): ModSection => {
    const all = rows.value.filter((r) => inGroup(r, g) && (rune == null || r.runeJa === rune));
    const list = all.filter((r) => !q || r.text.toLowerCase().includes(q.toLowerCase()) || r.tags.some((t) => TAG_STYLE[t]?.ja.includes(q) || t.replace(/_/g, " ").includes(q.toLowerCase())));
    const columns = (["prefix", "suffix"] as const).map((side) => {
      const items = list.filter((r) => r.side === side).sort((a, b) => b.share - a.share || b.topLevel - a.topLevel);
      return { side, title: side === "prefix" ? tr("プレフィックス", "Prefix") : tr("サフィックス", "Suffix"), items, top: Math.max(0.0001, ...items.map((r) => r.share)) };
    });
    const socketed = rune != null && all.some((r) => r.socketed);
    return { g, sid, label, rune, socketed, count: all.length, columns };
  })
    // 既定は GROUPS の並び。下へ回す節 (sectionLate) は一番下へ
    .map((sec, i) => ({ sec, i, off: props.sectionLate ? props.sectionLate(sec) : sec.rune != null && !sec.socketed }))
    .sort((a, b) => Number(a.off) - Number(b.off) || a.i - b.i)
    .map((x) => x.sec);
});
/** 目次: タブを押すとその節へスクロール。スクロールに合わせて今見ている節のタブを光らせる */
const sectionEls = new Map<string, HTMLElement>();
const active = ref<string>("normal");
function jump(g: string): void {
  active.value = g;
  if (phone && !secOpen.value.has(g)) toggleSec(g);
  void nextTick(() => scrollToTop(sectionEls.get(g)));
}
/** スマホ: 種類の節は見出しを押して開く。普通だけ開いた状態が既定、検索中は全部開く (2026-10-08 オーナー) */
const phone = typeof window !== "undefined" && window.innerWidth < 768;
const secOpen = ref(new Set<string>(["normal"]));
function toggleSec(sid: string): void {
  const n = new Set(secOpen.value);
  if (n.has(sid)) n.delete(sid); else n.add(sid);
  secOpen.value = n;
}
const secShown = (sid: string): boolean => !phone || !!query.value.trim() || secOpen.value.has(sid);
let io: IntersectionObserver | null = null;
function observe(): void {
  io?.disconnect();
  io = new IntersectionObserver((entries) => {
    const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    const g = seen ? ([...sectionEls].find(([, el]) => el === seen.target)?.[0] ?? null) : null;
    if (g) active.value = g;
  }, { rootMargin: "-20% 0px -70% 0px" });
  for (const el of sectionEls.values()) io.observe(el);
}
watch(sections, () => void nextTick(observe), { immediate: true });
/** 列の見出し (出やすさ・段・Lv) は目次の帯のすぐ下に留める (2026-10-23 モンキー 14「% の右の 2 つの数字に説明が無い」= 送ると見出しが消えていた)。スマホは目次が留まらないので 0 */
const tocEl = ref<HTMLElement | null>(null);
const tocH = ref(0);
const measureToc = (): void => { const el = tocEl.value; tocH.value = el && getComputedStyle(el).position === "sticky" ? el.offsetHeight : 0; };
let tocRo: ResizeObserver | null = null;
watch(tocEl, (el) => { tocRo?.disconnect(); if (el) { tocRo = new ResizeObserver(measureToc); tocRo.observe(el); measureToc(); } });
onBeforeUnmount(() => { io?.disconnect(); tocRo?.disconnect(); });
function setSection(g: string, el: unknown): void {
  if (el instanceof HTMLElement) sectionEls.set(g, el);
  else sectionEls.delete(g);
}
/** まとめた行の段は MOD ごとにタグが違うので、段の表の行にその段の MOD のタグを出す (2026-10-18 オーナー) */
const tierTags = (r: ListRow, t: ListTier): string[] => { if (!t.modId || t.modId === r.id && r.tiers.every((u) => u.modId === t.modId)) return []; const m = props.data?.mods.get(t.modId); return m ? shownTags(m.displayTags ?? m.tags) : []; };

/**
 * その MOD の行のある節・行を探して開き、一気に送って少し光らせる (カードの MOD を押した時。2026-10-10 オーナー「MOD をクリックしたらその MOD のあるとこまでスクロール」)。
 * rank = アイテムに付いている段 (その段だけ枠で囲む)。見つかれば true
 */
function jumpTo(modId: string, rank: string | null): boolean {
  query.value = "";
  const hit = sections.value.flatMap((sec) => sec.columns.flatMap((c) => c.items.map((r) => ({ sec, r })))).find(({ r }) => r.id === modId || r.tiers.some((t) => (t.modId ?? r.id) === modId));
  if (!hit) return false;
  const key = `${hit.sec.sid}:${hit.r.id}`;
  if (phone && !secOpen.value.has(hit.sec.sid)) toggleSec(hit.sec.sid);
  active.value = hit.sec.sid;
  expanded.value = key;
  jumped.value = { key, modId, rank };
  void nextTick(() => requestAnimationFrame(() => {
    scrollToTop(listEl.value?.querySelector(`[data-row-key="${CSS.escape(key)}"]`) ?? null, "auto", "center");
    flashKey.value = key;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (flashKey.value = null), 1400);
  }));
  return true;
}
defineExpose({ jumpTo, counts, sections });
</script>

<template>
  <div ref="listEl" data-mod-list class="@container text-[12px]">
    <!-- 目次 (押すとその種類までスクロール。スクロールしても上に残る) と検索。スマホは検索を目次の横送りの外 -->
    <input v-model="query" type="search" :placeholder="tr('文面やタグで探す (例: 耐性、ライフ)', 'Search text or tags')" class="mb-2 w-full rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 md:hidden" />
    <div ref="tocEl" data-mod-toc class="sticky top-0 z-10 -mx-3 mb-4 flex flex-wrap items-center gap-1.5 bg-[#120f0c]/95 px-3 py-1.5 backdrop-blur max-md:static max-md:flex-nowrap max-md:overflow-x-auto">
      <button v-if="props.toCraft" type="button" class="tbtn mr-1 max-md:shrink-0" :title="tr('アイテムのカードへ戻る', 'Back to the item')" @click="props.toCraft()">{{ tr("↑ クラフトへ", "↑ Craft") }}</button>
      <!-- 節の切り替えはほかのタブと同じ .g-tab (2026-10-18 オーナーの UI 点検)。細い帯に合うよう低く -->
      <button v-for="sec in sections" :key="sec.sid" type="button" role="tab" :aria-selected="active === sec.sid" class="g-tab !min-h-[28px] !px-4 !text-[13px] max-md:shrink-0" :class="active === sec.sid ? 'on' : ''" @click="jump(sec.sid)">
        {{ sec.label }} <span class="ml-0.5 rounded-full bg-black/25 px-1.5 text-[11px] tabular-nums">{{ sec.count }}</span>
      </button>
      <slot name="toc-extra" />
      <input v-model="query" type="search" :placeholder="tr('文面やタグで探す (例: 耐性、ライフ)', 'Search text or tags')" class="ml-auto w-60 rounded-lg border border-white/15 bg-black/30 px-2 py-0.5 max-md:hidden" />
    </div>
    <slot name="notes" />

    <section v-for="sec in sections" :key="sec.sid" :ref="(el) => setSection(sec.sid, el)" class="mb-4 scroll-mt-12">
      <h3 class="mb-3 mt-1 flex flex-wrap items-center gap-2 text-[13px] font-bold max-md:min-h-11 max-md:cursor-pointer" @click="phone && toggleSec(sec.sid)">
        <span class="rounded-full px-2.5 py-0.5" :class="toneOf(sec).tab">{{ sec.label }}</span>
        <span class="font-normal opacity-50">{{ sec.count }} {{ tr("系統", "groups") }}</span>
        <span v-if="sec.rune" class="font-normal opacity-60">{{ sec.socketed ? tr("はめている", "Socketed") : tr("差していないので 0% (付ければルーンも差す)", "Not socketed, so 0% (adding one also sockets the rune)") }}</span>
        <!-- 重みが公開されていない欄は、こちらが入れた重みの出どころを短く (2026-10-09 オーナー) -->
        <span v-if="weightNote()[sec.rune ? 'rune' : sec.g]" class="g-hover-name font-normal opacity-60" :title="weightNote()[sec.rune ? 'rune' : sec.g]">{{ tr("· 重みはコミュニティのデータから参照", "· Weights from community data") }}</span>
        <span v-else-if="sec.g === 'special'" class="font-normal opacity-60">{{ tr("創生の樹・ハンドラップ専用の MOD · カレンシーでは付かない · 段の表の「付ける」で手で付けるだけ", "Mods exclusive to the Genesis Tree and Wraps · Cannot roll from currency · Add them manually with “Add” in the tier table") }}</span>
        <Disclosure tag="span" kind="section" :open="secShown(sec.sid)" class="ml-auto font-normal md:hidden" />
      </h3>
      <!-- プレ・サフィの左右は一覧の幅で決める (窓が狭い小さいパソコンは縦に積む。2026-10-11 オーナー) -->
      <div v-if="secShown(sec.sid)" class="grid gap-3 @4xl:grid-cols-2">
        <div v-for="col in sec.columns" :key="col.side" class="min-w-0">
          <p data-mod-col-head class="sticky z-[5] mb-1 flex items-baseline gap-2 border-b border-white/10 bg-[#120f0c]/95 pb-1 pr-2 pt-0.5" :style="{ top: `${tocH}px` }">
            <slot name="col-lead" :col="col" />
            <b class="whitespace-nowrap text-[var(--exile-color-text-primary)]">{{ col.title }}</b>
            <span class="whitespace-nowrap text-[var(--exile-color-text-tertiary)]">{{ col.items.length }} {{ tr("系統", "groups") }}</span>
            <span class="ml-auto flex gap-1 text-[11px] text-[var(--exile-color-text-tertiary)]"><span class="w-14 whitespace-nowrap text-right" :class="props.tone === 'sky' ? 'text-sky-200' : ''">{{ props.shareHead ?? tr("出やすさ", "Weight") }}</span><span class="w-6 text-right">{{ tr("段", "T") }}</span><span class="w-7 text-right">Lv</span></span>
          </p>
          <p v-if="!col.items.length" class="py-2 opacity-40">{{ tr("無し", "None") }}</p>
          <div v-for="r in col.items" :key="r.id" class="mb-1" :data-row-key="`${sec.sid}:${r.id}`" :class="[flashKey === `${sec.sid}:${r.id}` ? 'row-jump' : '']">
            <!-- 1 系統 1 行。後ろの棒が % (列の一番大きい物を 100%) -->
            <div class="flex items-center gap-0">
            <slot name="row-lead" :row="r" />
            <button
              type="button"
              :data-rec="`mod:${r.id}`"
              class="relative min-w-0 flex-1 overflow-hidden rounded-md px-2 py-1 text-left transition hover:bg-white/[0.05]"
              :class="[dimOf(r) ? 'opacity-40' : '', expanded === `${sec.sid}:${r.id}` ? 'bg-white/[0.06]' : '']"
              :title="props.rowTitle ? props.rowTitle(r) : r.blocked ? tr('同じ系統の MOD が付いているので、今は付かない', 'A mod from the same group is already on the item, so this cannot roll now') : undefined"
              @click="toggleRow(`${sec.sid}:${r.id}`, $event)"
            >
              <span class="pointer-events-none absolute inset-y-0 left-0" :class="toneOf(sec).bar" :style="{ width: `${(shareOf(r) / colTop(col.items)) * 100}%` }" />
              <!-- タグは MOD 名の横に細く、右は poe2db と同じく % ・ 段の数 (緑) ・ 一番上の段のレベル (灰) を数字だけ (2026-10-04 オーナー) -->
              <span class="relative flex items-center gap-2">
                <!-- タグはアイテムの札と同じ色の札。入らなければ次の行へ折り返して全部見せる (2026-10-19 オーナー) -->
                <span class="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-0.5 leading-tight">
                  <!-- 勢力 (アマナム・クルガル・ウラマン) は文の頭に札で (2026-10-16 オーナー) -->
                  <span class="mr-0.5 min-w-0 text-[13px] text-[#c8c8ff]"><span v-if="factionOf(r.tags)" class="mr-1 inline-block rounded-sm px-1 py-px align-[1px] text-[10px] leading-none" :class="TAG_STYLE[factionOf(r.tags)!]?.cls">{{ tagLabel(factionOf(r.tags)!) }}</span>{{ r.text }}</span>
                  <span v-for="g in shownTags(r.tags)" :key="g" class="shrink-0 whitespace-nowrap rounded-sm px-1 py-px text-[10px] leading-none" :class="TAG_STYLE[g]?.cls">{{ tagLabel(g) }}</span>
                  <span v-if="essName(r)" class="shrink-0 whitespace-nowrap rounded-sm border border-sky-400/40 px-1 py-px text-[10px] leading-none text-sky-200">⚗ {{ essName(r) }}</span>
                  <span v-if="r.on" class="shrink-0 whitespace-nowrap rounded-sm bg-emerald-500/25 px-1 py-px text-[10px] leading-none text-emerald-200">{{ tr("付いている", "On item") }}</span>
                </span>
                <span class="flex shrink-0 items-center gap-1 tabular-nums">
                  <slot name="row-badge" :row="r" />
                  <span class="w-14 text-right text-[13px] font-bold" :class="props.tone === 'sky' ? 'text-sky-200' : 'text-amber-100'" :title="props.shareTitle ? props.shareTitle(r) : (r.group === 'desecrated' || r.group === 'otherworldly') ? tr('骨を使わないと付かない', 'Only rolls via a Bone') : tr('出やすさ (同じ側の重みの割合)', 'Chance (share of weight on the same side)')">{{ pct(shareOf(r)) }}</span>
                  <span class="w-6 text-right text-[12px] text-[var(--exile-color-text-secondary)]" :title="tr(`段の数 ${r.tiers.length}`, `Tiers: ${r.tiers.length}`)">{{ r.tiers.length }}</span>
                  <span class="w-7 text-right text-[12px] text-[var(--exile-color-text-tertiary)]" :title="tr(`T1 の MOD レベル ${r.topLevel}`, `T1 mod level: ${r.topLevel}`)">{{ r.topLevel }}</span>
                </span>
              </span>
            </button>
            </div>
            <template v-if="expanded === `${sec.sid}:${r.id}`">
              <slot name="row-open" :row="r" />
              <table class="mt-1 w-full text-[11px]">
                <tbody>
                  <tr v-for="t in r.tiers" :key="t.rank" class="group border-b border-white/5" :class="[props.tierDim?.(r, t) ? 'opacity-35' : '', isJumpTier(`${sec.sid}:${r.id}`, t.modId ?? r.id, t.rank) ? 'bg-amber-400/15 outline outline-2 outline-amber-300/80' : '']" :title="props.tierTitle?.(r, t)">
                    <slot name="tier-lead" :row="r" :tier="t" />
                    <td class="w-8 py-0.5 font-bold text-amber-200">{{ t.rank }}</td>
                    <td class="py-0.5 text-[#c8c8ff]">{{ t.text }}<span v-for="g in tierTags(r, t)" :key="g" class="ml-1 inline-block whitespace-nowrap rounded-sm px-1 py-px align-[1px] text-[10px] leading-none" :class="TAG_STYLE[g]?.cls">{{ tagLabel(g) }}</span><span v-if="isJumpTier(`${sec.sid}:${r.id}`, t.modId ?? r.id, t.rank)" data-jump-tier class="ml-1.5 rounded-sm bg-amber-400/25 px-1 py-px text-[10px] leading-none text-amber-100">{{ tr("付いている", "On item") }}</span></td>
                    <!-- 段の名前 (Zaffre など) は英語しか無いので出さない。エッセンスの節はエッセンスの名前なので出す (2026-10-18 オーナー) -->
                    <td v-if="r.group === 'essence' || r.group === 'perfect_essence'" class="py-0.5 pl-2 opacity-60 max-md:hidden">{{ tierName(r, t.name) }}</td>
                    <td class="w-14 py-0.5 text-right tabular-nums opacity-70">Lv {{ t.ilvl }}</td>
                    <td class="w-16 py-0.5 text-right tabular-nums opacity-70 max-md:hidden" :class="props.tone === 'sky' ? 'text-sky-200' : ''" :title="t.weight ? tr(`重み ${t.weight}`, `Weight ${t.weight}`) : undefined">{{ tierShareText(r, t) }}</td>
                    <slot name="tier-actions" :row="r" :tier="t" />
                  </tr>
                </tbody>
              </table>
            </template>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<!-- 段の行のボタン (tbtn) はエミュ・シミュの差し込み (付ける・狙いにする) でも使うので scoped にしない (2026-10-18) -->
<style>
/* 段の表のボタン: 細い行に合う小さく平たい物 (2026-10-10 オーナー「枠の細さに過剰」) */
.tbtn {
  display: inline-flex; align-items: center; justify-content: center; height: 24px; padding: 0 9px; white-space: nowrap;
  border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 4px; background: rgba(0, 0, 0, 0.35);
  font-size: 11px; color: rgba(255, 255, 255, 0.82); transition: background 0.12s, border-color 0.12s;
}
.tbtn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.08); border-color: rgba(232, 200, 120, 0.55); color: #f3e2b8; }
.tbtn:disabled { opacity: 0.35; cursor: not-allowed; }
.tbtn.on { border-color: rgba(239, 90, 70, 0.75); background: rgba(160, 40, 30, 0.35); color: #ffd7cf; }
@media (max-width: 767px) { .tbtn { height: 34px; padding: 0 12px; font-size: 12px; } }
</style>

<style scoped>
/* カードから飛んで来た行: ふわっと金に (付いた瞬間の光り方と同じ色) */
.row-jump { animation: row-jump 1.4s ease-out; border-radius: 6px; }
@keyframes row-jump { 0% { background: rgba(250, 204, 21, 0); } 15% { background: rgba(250, 204, 21, 0.18); } 100% { background: rgba(250, 204, 21, 0); } }
</style>
