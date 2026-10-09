<!--
  StageModList.vue — クラフトステージの「このベースに付く MOD」一覧 (2026-09-29)

  オーナー「そのベースに付く MOD 全て、アイテムレベルは無視して重み付きで。DB にならって。DB は見づらいので UI はシンプルに、
  色や形にこだわって」「表示する場所もシンプルかつ使いやすく」。
  置き場所: ステージの下 (カレンシーを打ちながら見られる)。見出しを押すと畳める。
  種類 (普通 / エッセンス / 冒涜 / 異界) を 1 ページに縦に並べ、上のタブはその見出しまでスクロールする目次 (2026-10-04 オーナー「1 ページに
  まとめて下にスクロールでおｋ、上のタブを押したらそこまで自動スクロール、よくある UI」。今見ている所のタブが光る)。プレフィックス / サフィックスを 2 列。1 行 = 1 系統:
  文面 (一番上の段の数値)・タグ (色付き)・段の数・一番上の段の MOD レベル・出やすさ (同じ側の重みに対する割合を棒と %)。
  行を押すと段ごと (T1〜) の表。今付いている系統は緑、同じ系統が付いていて付かない物は薄く。中身は [[mod-list.ts]]。
  2026-09-29 (要望 ⑱-2、オーナー「指定 MOD 選んでからそこからクラフトできるように、動画用として」): まだ 1 手も打っていない間は、
  段の表の「付ける」で始めの状態にその MOD・段を足せる (付きうる物だけ。手順 JSON の start.mods に入る)。「1 手戻す」で 1 つずつ外す。
-->
<script setup lang="ts">
import { keepPlace } from "../../utils/keep-place";
import { autoGroup } from "../../services/craft-stage/auto-group";
import { AIM_MAX } from "../../state/craft-stage";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import HelpTip from "../../components/ui/HelpTip.vue";
import Icon from "../../components/ui/Icon.vue";
import { craftStage, nameOf } from "../../state/craft-stage";
import { GROUP_JA, modListFor, runeToneOf, shownTags, TAG_STYLE, type ListRow, type ModGroup } from "../../services/craft-stage/mod-list";
import essenceKeys from "../../services/htc/essence-keys.json";
import { forceKey, type ForceFlag } from "../../services/craft-stage/apply-force";

/** シミュレーションの ① の枠の中に置く時 (外の枠を付けない) */
const props = defineProps<{ embedded?: boolean }>();
const s = craftStage;
/** 始めの状態を組める (まだ打っていない・再生でない) */
const canStart = computed(() => !s.log.value.length && !s.replay.value);
/**
 * 指名で付ける手の鍵 (打ち始めた後、またはエッセンス・ルーン・異界など始めの状態 (start.mods) に入れられない種類)。
 * 種類: 普通・ルーン = n、エッセンス・パーフェクト = e、冒涜・異界 = d。付けられない時は理由 (ボタンを灰色に)
 * (2026-10-08 オーナー「クラフト途中でも MOD 付けれるように、ただ基本的な事は抑えて」)
 */
function forceOf(g: ModGroup, modId: string, rank: string, as?: ForceFlag): { key: string; why: string | null } {
  const flag: ForceFlag = as ?? (g === "essence" || g === "perfect_essence" ? "e" : g === "desecrated" || g === "otherworldly" ? "d" : "n");
  const key = forceKey(modId, rank, flag);
  return { key, why: s.replay.value ? "再生中は打てない" : s.usable(key) };
}
/** 始めの状態にフラクチャー / 冒涜の MOD がもう付いているか (どちらも 1 つまで) */
const hasStart = (k: "fractured" | "desecrated"): boolean => s.startMods.value.some((f) => f[k]);
const rows = computed(() => (s.data.value && s.item.value ? modListFor(s.data.value, s.item.value) : []));

/** 畳んだかどうか (見る人ごとの好み。保存できなくても動く) */
const KEY = "exiledesk.craftStage.modListOpen";
const open = ref(true);
try { open.value = localStorage.getItem(KEY) !== "0"; } catch { /* 無くてよい */ }
watch(open, (v) => { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* 無くてよい */ } });
// シミュレーションで狙いがまだ 1 つも無い時は開いておく (畳んだのを覚えていて、ベースを選んでも何をすればいいか分からなかった。2026-10-07)
watch(() => s.mode.value === "sim" && !s.simTargets.value.length && s.base.value, (v) => { if (v) open.value = true; }, { immediate: true });

// エッセンスはマジック用とレア用 (パーフェクト・合金) を 1 つの節に (2026-10-10 オーナー「エッセンスね、パーフェクトとかやなくて意味わからん」)
const GROUPS: ModGroup[] = ["normal", "rune", "essence", "desecrated", "otherworldly"];
const inGroup = (r: { group: ModGroup }, g: ModGroup): boolean => r.group === g || (g === "essence" && r.group === "perfect_essence");
const counts = computed(() => Object.fromEntries(GROUPS.map((g) => [g, rows.value.filter((r) => inGroup(r, g)).length])) as Record<ModGroup, number>);

const query = ref("");
/** 開いている段の表 (種類:系統) */
const expanded = ref<string | null>(null);
/**
 * 行を押して段の表を開く / 閉じる。押した行は画面の同じ所に残し、表はその下に開く (2026-10-05 オーナー「展開だけど上に開くから
 * スクロールによっては見えない、下に開こう」: 上で開いていた行が閉じた分だけ押した行が上へずれ、表が見えなくなっていた)
 */
function toggleRow(key: string, ev: MouseEvent): void {
  const el = ev.currentTarget as HTMLElement;
  const before = el.getBoundingClientRect().top;
  expanded.value = expanded.value === key ? null : key;
  void nextTick(() => {
    // 送っている枠 (シミュレーションの 3 の中なら一覧の枠、手で打つ時は画面) を同じだけ戻す
    const box = el.closest(".overflow-auto") as HTMLElement | null;
    const shift = el.getBoundingClientRect().top - before;
    // 送る枠が無い (スマホはページごと送る) 時は window を送る
    if (shift) (box ?? window).scrollBy({ top: shift });
    // 開いた表が下にはみ出したら、表の下まで見えるように送る (一覧の枠も画面も。はみ出していなければ動かさない)
    el.parentElement?.querySelector("table")?.scrollIntoView({ block: "nearest" });
  });
}
/**
 * 種類ごとの節 (中身のある物だけ)。各節はプレフィックス / サフィックスの 2 列。
 * ルーンの特殊 MOD はルーンごとに別の節で、見出しはルーンの名前 (2026-10-04 オーナー「ルーンの特殊 MOD で終わらせないで、手袋ならコルの狩りとか
 * 名前で。コルとカトラは別々に分けて、名前も DB 仕様に」)
 */
interface Section { g: ModGroup; sid: string; label: string; rune: string | null; socketed: boolean; count: number; columns: Array<{ side: "prefix" | "suffix"; title: string; items: ListRow[]; top: number }> }
const sections = computed((): Section[] => {
  const q = query.value.trim();
  const parts: Array<{ g: ModGroup; sid: string; label: string; rune: string | null }> = GROUPS.filter((g) => counts.value[g]).flatMap((g): Array<{ g: ModGroup; sid: string; label: string; rune: string | null }> =>
    g === "rune"
      ? [...new Set(rows.value.filter((r) => r.group === "rune").map((r) => r.runeJa ?? ""))].map((ja) => ({ g, sid: `rune:${ja}`, label: ja, rune: ja }))
      : [{ g, sid: g as string, label: GROUP_JA[g], rune: null as string | null }],
  );
  return parts.map(({ g, sid, label, rune }) => {
    const all = rows.value.filter((r) => inGroup(r, g) && (rune == null || r.runeJa === rune));
    const list = all.filter((r) => !q || r.text.includes(q) || r.tags.some((t) => TAG_STYLE[t]?.ja.includes(q)));
    const columns = (["prefix", "suffix"] as const).map((side) => {
      const items = list.filter((r) => r.side === side).sort((a, b) => b.share - a.share || b.topLevel - a.topLevel);
      return { side, title: side === "prefix" ? "プレフィックス" : "サフィックス", items, top: Math.max(0.0001, ...items.map((r) => r.share)) };
    });
    // 差しているか (ルーンの節の見出しに「はめている」/「差すと付く」)
    const socketed = rune != null && all.some((r) => r.socketed);
    return { g, sid, label, rune, socketed, count: all.length, columns };
  });
});

/** 目次: タブを押すとその節へスクロール。スクロールに合わせて今見ている節のタブを光らせる */
const sectionEls = new Map<string, HTMLElement>();
const active = ref<string>("normal");
function jump(g: string): void {
  active.value = g;
  if (phone && !secOpen.value.has(g)) toggleSec(g);
  void nextTick(() => sectionEls.get(g)?.scrollIntoView({ behavior: "smooth", block: "start" }));
}
/**
 * スマホ: 種類の節 (普通 / エッセンス / 冒涜 / 異界…) は見出しを押して開く。普通だけ開いた状態が既定 (一覧が 5000px あって
 * 棚の下が延々続いていた。2026-10-08 オーナー「必要なところ以外は畳んだりとかで」)。検索中は全部開く。PC は今まで通り全部開く
 */
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
watch([sections, open], () => void nextTick(observe), { immediate: true });
onBeforeUnmount(() => io?.disconnect());
function setSection(g: string, el: unknown): void {
  if (el instanceof HTMLElement) sectionEls.set(g, el);
  else sectionEls.delete(g);
}

/**
 * シミュレーションの狙い (2026-10-05、実験)。段の表の「狙う」で、その段以上を狙いにする (同じ MOD は段を差し替え、同じ段なら外す)。
 * 段の番号はその MOD の段の表から (同じ系統をまとめた行は段が混ざるので、名前とレベルで引く)
 */
function tierIndexOf(modId: string, t: { name: string; ilvl: number }): number {
  return s.data.value?.mods.get(modId)?.tiers.findIndex((x) => x.name === t.name && x.ilvl === t.ilvl) ?? -1;
}
function isTarget(modId: string, t: { name: string; ilvl: number }): boolean {
  const idx = tierIndexOf(modId, t);
  return s.simTargets.value.some((x) => [x, ...(x.alts ?? [])].some((y) => y.modId === modId && y.minTierIndex === idx));
}
/**
 * その段が狙いに入っているか (T2 以上を選んだら T1 も入る。2026-10-05 オーナー「ティア 2 とか選択したら自動で 1 も選択される挙動、
 * MOD のとこはティア 2 以上みたいな選択でおけ」)。段の配列は低い段から順なので、番号が狙いの下限以上なら入る
 */
function isCovered(modId: string, t: { name: string; ilvl: number }): boolean {
  const idx = tierIndexOf(modId, t);
  return idx >= 0 && s.simTargets.value.some((x) => [x, ...(x.alts ?? [])].some((y) => y.modId === modId && idx >= y.minTierIndex));
}
/** エミュレーターの「次の手で狙う」(その段以上)。狙い中の段をもう一度押すとやめる。押したら選ぶ窓 (StageAimPicker.vue) を開く */
function isAim(modId: string, t: { name: string; ilvl: number }): boolean {
  const idx = tierIndexOf(modId, t);
  return s.aims.value.some((a) => a.modId === modId && a.minTierIndex === idx);
}
/** 窓では押した段が最初からチェック済み (ほかの MOD も足せる。1 つだけならそのまま「確率を見る」) */
function aimAt(modId: string, t: { name: string; ilvl: number; rank: string; text: string }, el: Element): void {
  // やめる: 上の確率の一覧が消えて押した段が上へずれ、次のタップが棚に当たっていた (2026-10-09 スマホで確認)。押した段を同じ高さに残す
  if (isAim(modId, t)) { keepPlace(el, () => { s.aims.value = s.aims.value.filter((a) => a.modId !== modId); }); return; }
  const idx = tierIndexOf(modId, t);
  if (idx < 0) return;
  s.aimPicker.value = { seed: { modId, minTierIndex: idx, label: `${t.text} (${t.rank} 以上)`, at: `${modId}:${t.rank}` } };
}
function toggleTarget(modId: string, t: { name: string; ilvl: number }): void {
  const idx = tierIndexOf(modId, t);
  if (idx < 0) return;
  const list = s.simTargets.value;
  // 「あるいは」に入っている物は、そこから外す (足すのは選んだ MOD の「＋」から)
  if (list.some((x) => x.alts?.some((a) => a.modId === modId))) {
    s.simTargets.value = list.map((x) => (x.alts?.some((a) => a.modId === modId) ? { ...x, alts: x.alts.filter((a) => a.modId !== modId) } : x));
    return;
  }
  // 同じ段なら外す、別の段なら順番と付け方はそのまま段だけ差し替える、無ければ ② の最後に足す
  // (① フラクチャーの候補はシミュレーションのポップアップ [[StageFracturePicker.vue]] で選ぶ)
  if (isTarget(modId, t)) s.simTargets.value = list.filter((x) => x.modId !== modId);
  else if (list.some((x) => x.modId === modId)) s.simTargets.value = list.map((x) => (x.modId === modId ? { ...x, minTierIndex: idx } : x));
  else s.simTargets.value = s.data.value ? autoGroup(s.data.value, [...list, { modId, minTierIndex: idx }], modId) : [...list, { modId, minTierIndex: idx }];
}

/** エッセンスの段の名前 (英語) → 日本語 */
const ESS_JA = new Map(Object.values((essenceKeys as unknown as { keys: Record<string, { en: string; ja: string }> }).keys).map((k) => [k.en, k.ja]));
/**
 * そのエッセンス / 合金の MOD を付ける物の名前 (2026-10-05 オーナー「エッセンスと合金は使うエッセンスを表示、タグの後ろに簡易的に名前」)。
 * 名前はカレンシーの棚と同じ引き方 (パーフェクトの深淵・ヒステリーなど essence-keys に無い物も出る)
 */
function essName(r: ListRow): string | null {
  if (r.group !== "essence" && r.group !== "perfect_essence") return null;
  const key = `essence:${r.group === "perfect_essence" ? "perfect" : "normal"}:${r.id}`;
  const n = nameOf(key);
  if (n && n !== key) return n;
  const top = r.tiers[0]?.name;
  return top ? ESS_JA.get(top) ?? top : null;
}
const tierName = (r: ListRow, name: string): string => (r.group === "essence" || r.group === "perfect_essence" ? (ESS_JA.get(name) ?? name) : name);
const pct = (x: number): string => (x >= 0.1 ? `${(x * 100).toFixed(0)}%` : x >= 0.001 ? `${(x * 100).toFixed(1)}%` : x > 0 ? "<0.1%" : "—");
/** 節の色 (ルーンの節はルーンのアイコンの色) */
const toneOf = (sec: { g: ModGroup; rune: string | null }): { tab: string; bar: string } => runeToneOf(sec.rune) ?? TONE[sec.g];
/**
 * 種類の色 (普通 = 青、エッセンス = 水色、冒涜 = 淀んだ深緑のグラデーション、異界 = 緑がかった青。
 * 2026-10-05 オーナー「エッセンスは水色で普通は青、冒涜は深緑、冒涜の緑はよどんでる感じでふよふよってグラデーション」)
 */
const TONE: Record<ModGroup, { tab: string; bar: string }> = {
  normal: { tab: "bg-rarity-magic/25 text-[#c8c8ff] ring-1 ring-rarity-magic/60", bar: "bg-rarity-magic/10" },
  rune: { tab: "bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/60", bar: "bg-amber-500/[0.08]" },
  essence: { tab: "bg-sky-400/20 text-sky-100 ring-1 ring-sky-300/60", bar: "bg-sky-400/[0.08]" },
  perfect_essence: { tab: "bg-cyan-400/20 text-cyan-100 ring-1 ring-cyan-300/60", bar: "bg-cyan-400/[0.08]" },
  desecrated: { tab: "bg-gradient-to-r from-green-900/70 via-emerald-800/40 to-lime-900/60 text-lime-100/90 ring-1 ring-green-700/70", bar: "bg-gradient-to-r from-green-950/40 via-emerald-900/25 to-lime-900/20" },
  otherworldly: { tab: "bg-teal-500/20 text-teal-100 ring-1 ring-teal-400/60", bar: "bg-teal-500/[0.08]" },
};
</script>

<template>
  <section data-mod-list class="text-[12px]" :class="props.embedded ? '' : 'g-panel mt-4'">
    <!-- 見出し (押すと畳む) -->
    <div role="button" tabindex="0" :aria-expanded="open" class="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left" @click="open = !open" @keydown.enter="open = !open">
      <b class="g-brush text-[20px] tracking-[0.12em] max-md:text-[16px] max-md:tracking-[0.06em] text-[var(--exile-color-text-title)] [text-shadow:0_2px_0_#000]">このベースに付く MOD</b>
      <span class="text-[var(--exile-color-text-tertiary)] max-md:hidden">{{ s.item.value?.baseJa }}</span>
      <HelpTip :text="s.mode.value === 'sim' ? '出やすさ = 同じ側の重みの割合。段 = 段の数、Lv = T1 の MOD レベル。MOD を押すと段の表が開く' : `出やすさ = 同じ側の重みの割合 (アイテムレベルは見ない)。段 = 段の数、Lv = T1 の MOD レベル${canStart ? '。段の表の「付ける」で始めの状態を組める' : ''}`" @click.stop />
      <span class="ml-auto inline-flex items-center gap-1 text-[12px] text-[var(--exile-color-text-secondary)]">{{ open ? "畳む" : "開く" }}<Icon :name="open ? 'chevron-up' : 'chevron-down'" class="size-3.5" /></span>
    </div>

    <div v-if="open" class="border-t border-white/10 px-3 pb-3 pt-2">
      <!-- 目次 (押すとその種類までスクロール。スクロールしても上に残る) と検索 -->
      <!-- スマホ: 検索は目次の横送りの外 (中だと右に隠れる) -->
      <input v-model="query" type="search" placeholder="文面やタグで探す (例: 耐性、ライフ)" class="mb-2 w-full rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 md:hidden" />
      <!-- スマホは固定せず 1 段の横送り (固定すると 4 段で 130px 占めていた。2026-10-08 レビュー) -->
      <div class="sticky top-0 z-10 -mx-3 mb-2 flex flex-wrap items-center gap-1.5 bg-[#120f0c]/95 px-3 py-1.5 backdrop-blur max-md:static max-md:flex-nowrap max-md:overflow-x-auto">
        <button v-for="sec in sections" :key="sec.sid" type="button" class="rounded-full px-3 py-0.5 max-md:shrink-0 max-md:py-1.5" :class="active === sec.sid ? toneOf(sec).tab : 'text-[var(--exile-color-text-secondary)] hover:bg-white/5 hover:text-[var(--exile-color-text-primary)]'" @click="jump(sec.sid)">
          {{ sec.label }} <span class="ml-0.5 rounded-full bg-black/25 px-1.5 text-[11px] tabular-nums">{{ sec.count }}</span>
        </button>
        <input v-model="query" type="search" placeholder="文面やタグで探す (例: 耐性、ライフ)" class="ml-auto w-60 rounded-lg border border-white/15 bg-black/30 px-2 py-0.5 max-md:hidden" />
      </div>

      <section v-for="sec in sections" :key="sec.sid" :ref="(el) => setSection(sec.sid, el)" class="mb-4 scroll-mt-12">
        <h3 class="mb-2 flex items-center gap-2 text-[13px] font-bold max-md:min-h-11 max-md:cursor-pointer" @click="phone && toggleSec(sec.sid)">
          <span class="rounded-full px-2.5 py-0.5" :class="toneOf(sec).tab">{{ sec.label }}</span>
          <span class="font-normal opacity-50">{{ sec.count }} 系統</span>
          <span v-if="sec.rune" class="font-normal opacity-60">{{ sec.socketed ? "はめている" : "差すと付く" }} · 重みは公開されていないので仮定 · 出やすさは差した時の割合</span>
          <span class="ml-auto font-normal opacity-60 md:hidden">{{ secShown(sec.sid) ? "▲" : "▼ 開く" }}</span>
        </h3>
        <div v-if="secShown(sec.sid)" class="grid gap-3 md:grid-cols-2">
          <div v-for="col in sec.columns" :key="col.side" class="min-w-0">
            <p class="mb-1 flex items-baseline gap-2 border-b border-white/10 pb-1 pr-2">
              <b class="text-[var(--exile-color-text-primary)]">{{ col.title }}</b>
              <span class="text-[var(--exile-color-text-tertiary)]">{{ col.items.length }} 系統</span>
              <span class="ml-auto flex gap-1 text-[11px] text-[var(--exile-color-text-tertiary)]"><span class="w-11 text-right">出やすさ</span><span class="w-6 text-right">段</span><span class="w-7 text-right">Lv</span></span>
            </p>
            <p v-if="!col.items.length" class="py-2 opacity-40">無し</p>
            <div v-for="r in col.items" :key="r.id" class="mb-1">
              <!-- 1 系統 1 行。後ろの棒が出やすさ (列の一番出やすい物を 100%) -->
              <button
                type="button"
                class="relative w-full overflow-hidden rounded-md px-2 py-1 text-left transition hover:bg-white/[0.05]"
                :class="[r.on ? 'ring-1 ring-emerald-400/60' : '', r.blocked ? 'opacity-40' : '', expanded === `${sec.sid}:${r.id}` ? 'bg-white/[0.06]' : '']"
                :title="r.blocked ? '同じ系統の MOD が付いているので、今は付かない' : undefined"
                @click="toggleRow(`${sec.sid}:${r.id}`, $event)"
              >
                <span class="pointer-events-none absolute inset-y-0 left-0" :class="toneOf(sec).bar" :style="{ width: `${(r.share / col.top) * 100}%` }" />
                <!-- 2026-10-04 オーナー: タグは MOD 名の横に細く (行を太らせない)、右は poe2db と同じく 出やすさ % ・ ティア数 (緑) ・ 一番上の段のレベル (灰) を数字だけ -->
                <span class="relative flex items-center gap-2">
                  <span class="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-0.5 leading-tight">
                    <span class="mr-0.5 text-[13px] text-[#c8c8ff]">{{ r.text }}</span>
                    <span v-if="shownTags(r.tags).length" class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ shownTags(r.tags).map((t) => TAG_STYLE[t]!.ja).join(" · ") }}</span>
                    <span v-if="essName(r)" class="rounded-sm border border-sky-400/40 px-1 py-px text-[10px] leading-none text-sky-200">⚗ {{ essName(r) }}</span>
                    <span v-if="r.on" class="rounded-sm bg-emerald-500/25 px-1 py-px text-[10px] leading-none text-emerald-200">付いている</span>
                  </span>
                  <span class="flex shrink-0 items-center gap-1 tabular-nums">
                    <span class="w-11 text-right text-[13px] font-bold text-amber-100" title="出やすさ (同じ側の重みの割合)">{{ pct(r.share) }}</span>
                    <span class="w-6 text-right text-[12px] text-[var(--exile-color-text-secondary)]" :title="`段の数 ${r.tiers.length}`">{{ r.tiers.length }}</span>
                    <span class="w-7 text-right text-[12px] text-[var(--exile-color-text-tertiary)]" :title="`T1 の MOD レベル ${r.topLevel}`">{{ r.topLevel }}</span>
                  </span>
                </span>
              </button>
              <!-- 段の表 -->
              <table v-if="expanded === `${sec.sid}:${r.id}`" class="mt-1 w-full text-[11px]">
                <caption v-if="s.mode.value === 'sim'" class="pb-1 text-left text-[10px] opacity-60">T1 が一番良い段。「T○ 以上」= その段か、それより良い段が付けば当たり</caption>
                <tbody>
                  <tr v-for="t in r.tiers" :key="t.rank" class="border-b border-white/5">
                    <td class="w-8 py-0.5 font-bold text-amber-200">{{ t.rank }}</td>
                    <td class="py-0.5 text-[#c8c8ff]">{{ t.text }}</td>
                    <td class="py-0.5 pl-2 opacity-60 max-md:hidden">{{ tierName(r, t.name) }}</td>
                    <td class="w-14 py-0.5 text-right tabular-nums opacity-70">Lv {{ t.ilvl }}</td>
                    <td class="w-16 py-0.5 text-right tabular-nums opacity-70 max-md:hidden" :title="t.weight ? `重み ${t.weight}` : undefined">{{ t.weight && r.weight ? pct((r.share * t.weight) / r.weight) : "" }}</td>
                    <td v-if="s.mode.value === 'sim' && (sec.g === 'normal' || sec.g === 'rune' || sec.g === 'desecrated' || sec.g === 'essence' || sec.g === 'perfect_essence')" class="w-20 py-0.5 text-right">
                      <button type="button" class="whitespace-nowrap rounded border px-1.5 text-[10px] max-md:min-h-10 max-md:px-3 max-md:text-[12px]" :class="isTarget(t.modId ?? r.id, t) ? 'border-amber-400 bg-amber-500/40 font-bold text-amber-50' : isCovered(t.modId ?? r.id, t) ? 'border-amber-400/70 bg-amber-500/20 text-amber-100' : 'border-amber-400/50 text-amber-200 hover:bg-amber-500/15'" :title="isTarget(t.modId ?? r.id, t) ? 'もう一度押すと外す' : sec.rune ? `② に足す (${t.rank} 以上)。回す時は ${sec.label} を差した白から始める` : `② に足す (${t.rank} 以上)`" @click.stop="keepPlace($event.currentTarget as Element, () => toggleTarget(t.modId ?? r.id, t))">{{ isCovered(t.modId ?? r.id, t) ? "✓ " : "" }}{{ t.rank }} 以上</button>
                    </td>
                    <td v-else-if="s.mode.value !== 'sim' && !s.replay.value" class="w-56 py-0.5 text-right max-md:w-auto">
                      <!-- 次の手で狙う (いつでも): 今の状態から打った時にこの段以上が付く確率を、打ち方ごとに棚の上へ (2026-10-09 オーナー)。押すと選ぶ窓 -->
                      <button type="button" :data-aim-at="`${t.modId ?? r.id}:${t.rank}`" class="mr-1 whitespace-nowrap rounded border px-1.5 text-[10px] max-md:min-h-9 max-md:px-2.5" :class="isAim(t.modId ?? r.id, t) ? 'border-amber-300 bg-amber-500/35 font-bold text-amber-50' : 'border-amber-400/60 text-amber-200 hover:bg-amber-500/15'" :title="isAim(t.modId ?? r.id, t) ? 'もう一度押すとやめる' : `次の 1 手で ${t.rank} 以上が付く確率を打ち方ごとに出す (ほかの MOD も ${AIM_MAX} つまで一緒に狙える)`" @click.stop="aimAt(t.modId ?? r.id, t, $event.currentTarget as Element)">{{ isAim(t.modId ?? r.id, t) ? "狙い中" : "次の手で狙う" }}</button>
                      <!-- 打ち始めた後 (と、始めの状態に入れられない種類) は指名の手として付ける。灰色 = 今は付けられない (理由は title) -->
                      <span v-if="!canStart || !(sec.g === 'normal' || sec.g === 'desecrated')" class="inline-flex gap-1">
                        <button type="button" class="rounded border px-1.5 text-[10px] disabled:cursor-not-allowed disabled:opacity-30" :class="sec.g === 'desecrated' || sec.g === 'otherworldly' ? 'border-green-700/80 text-lime-200 hover:bg-green-800/30' : sec.g === 'essence' || sec.g === 'perfect_essence' ? 'border-sky-400/50 text-sky-200 hover:bg-sky-500/15' : 'border-sky-400/50 text-sky-200 hover:bg-sky-500/15'" :disabled="!!forceOf(r.group, t.modId ?? r.id, t.rank).why" :title="forceOf(r.group, t.modId ?? r.id, t.rank).why ?? `${t.rank} を 1 手として付ける (費用 0。1 手戻すで外せる)`" @click.stop="s.use(forceOf(r.group, t.modId ?? r.id, t.rank).key)">{{ sec.g === "desecrated" || sec.g === "otherworldly" ? "冒涜で付ける" : "付ける" }}</button>
                      <!-- 途中でもフラクチャー (普通の MOD だけ。付いていればそれを固定、無ければ固定で付ける。レアだけ・1 つまで。2026-10-08 オーナー) -->
                        <button v-if="sec.g === 'normal'" type="button" class="rounded border border-orange-400/60 px-1.5 text-[10px] text-orange-200 hover:bg-orange-500/15 disabled:cursor-not-allowed disabled:opacity-30" :disabled="!!forceOf(r.group, t.modId ?? r.id, t.rank, 'f').why" :title="forceOf(r.group, t.modId ?? r.id, t.rank, 'f').why ?? `${t.rank} をフラクチャー (付いていればそれを固定、無ければ固定で付ける)`" @click.stop="s.use(forceOf(r.group, t.modId ?? r.id, t.rank, 'f').key)">フラクチャー</button>
                      </span>
                      <span v-else class="inline-flex gap-1 max-md:flex-wrap max-md:justify-end">
                        <button v-if="sec.g === 'normal'" type="button" class="rounded border border-sky-400/50 px-1.5 text-[10px] text-sky-200 hover:bg-sky-500/15" :title="`始めの状態に ${t.rank} を付ける (付きうる物だけ)`" @click.stop="s.addStartMod({ mod: t.modId ?? r.id, tier: t.rank })">付ける</button>
                        <button v-if="sec.g === 'normal'" type="button" class="rounded border border-orange-400/60 px-1.5 text-[10px] text-orange-200 hover:bg-orange-500/15 disabled:cursor-not-allowed disabled:opacity-30" :disabled="hasStart('fractured')" :title="hasStart('fractured') ? 'フラクチャーは 1 つまで (もう付いている)' : `始めの状態に ${t.rank} をフラクチャーで付ける (レアになる)`" @click.stop="s.addStartMod({ mod: t.modId ?? r.id, tier: t.rank, fractured: true })">フラクチャー</button>
                        <button v-if="sec.g === 'desecrated'" type="button" class="rounded border border-green-700/80 px-1.5 text-[10px] text-lime-200 hover:bg-green-800/30 disabled:cursor-not-allowed disabled:opacity-30" :disabled="hasStart('desecrated')" :title="hasStart('desecrated') ? '冒涜の MOD はアイテムに 1 つまで (もう付いている)' : `始めの状態に ${t.rank} を冒涜の MOD で付ける (レアになる)`" @click.stop="s.addStartMod({ mod: t.modId ?? r.id, tier: t.rank, desecrated: true })">冒涜</button>
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>
