<!--
  StagePatternEditor.vue — シミュレーションの打ち方 (パターン) のタブと、打って作るパターンの画面 (StagePlayEditor)。
  前の作り方 (木・流れ) の画面は 2026-10-10 に消した (オーナー「前の作り方リセット」「前の作り方のコードを消す」)。
  決まりは services/craft-stage/play-recipe.ts (ADR-002)
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { craftStage } from "../../state/craft-stage";
import { patternSets, setsForStart, type CheckCtx, type Pattern, type PatternSet } from "../../services/craft-stage/pattern";
import StagePlayEditor from "./StagePlayEditor.vue";
import Icon from "../../components/ui/Icon.vue";
import type { PlayRecipe } from "../../services/craft-stage/play-recipe";
import { freshItem } from "../../services/craft-stage/run-plan";
import { makeStageMod, withMod } from "../../services/craft-stage/stage-core";
import type { StageItem } from "../../services/craft-stage/types";
import { fillHashes, fillModText, jaOfMod } from "../../services/htc/mod-text";
import { tierDisplayRanges } from "../../services/mods/stat-scale";

const props = defineProps<{
  /** 始めの状態 (フラクチャー済みのレアか白) */
  start: CheckCtx["start"];
  /** 決めた後は変えられない */
  locked: boolean;
  /** 回している途中 */
  busy?: boolean;
}>();
const emit = defineEmits<{ "run-one": [index: number]; active: [index: number] }>();
const s = craftStage;
const active = ref(0);
// 基本情報 (始めのレアリティ・ソケット・部位) で使わない物は出さない (setsForStart)
const sets = computed<PatternSet[]>(() => (s.item.value ? setsForStart(patternSets(s.item.value.cls), s.item.value.cls, props.start) : []));
const pat = computed<Pattern>(() => s.simPatterns.value[Math.min(active.value, s.simPatterns.value.length - 1)]!);
function setPlay(play: PlayRecipe): void {
  const k = Math.min(active.value, s.simPatterns.value.length - 1);
  s.simPatterns.value = s.simPatterns.value.map((p, i) => (i === k ? { ...p, play } : p));
}
/** 打って作るパターンの始めのアイテム (ベース + 固定済み、手打ちから持ってきた物) */
const playStartItem = computed<StageItem | null>(() => {
  const d = s.data.value;
  if (!d || !s.base.value) return null;
  const startIt = s.simStart.value === "item" ? s.simStartItem.value : null;
  if (startIt) return { ...startIt, prefixes: startIt.prefixes.map((m) => ({ ...m })), suffixes: startIt.suffixes.map((m) => ({ ...m })) };
  let it: StageItem;
  try { it = { ...freshItem(d, s.base.value, s.itemLevel.value), sockets: props.start.sockets, rollSeed: 1 }; } catch { return null; }
  const frac = s.simTargets.value.find((t) => t.method === "fracture");
  const fm = frac ? d.mods.get(frac.modId) : undefined;
  if (frac && fm) it = withMod(it, { ...makeStageMod(fm, fm.type === "suffix" ? "suffix" : "prefix", frac.minTierIndex, () => 0.5), fractured: true });
  return { ...it, rarity: props.start.rarity };
});
// 開いているパターンを親に伝える (下の行の「取引所で探す」がこのパターンで探す)
watch(active, (v) => emit("active", v), { immediate: true });
/**
 * 1 つ戻す (パターンの操作。2026-10-07 オーナー「1 つ戻すボタンがない、パターン①の横らへんに」)。
 * パターンが変わるたびに前の形を積み、押すと 1 つ前に戻す (戻した時は積まない)
 */
const history = ref<string[]>([]);
let undoing = false;
watch(() => JSON.stringify(s.simPatterns.value), (_now, prev) => {
  if (undoing) { undoing = false; return; }
  if (prev) history.value = [...history.value.slice(-49), prev];
});
function undoPattern(): void {
  const prev = history.value[history.value.length - 1];
  if (!prev) return;
  history.value = history.value.slice(0, -1);
  undoing = true;
  s.simPatterns.value = JSON.parse(prev) as Pattern[];
  active.value = Math.min(active.value, s.simPatterns.value.length - 1);
}
/** 付ける物の名前 */
function modLabel(modId: string): string {
  const d = s.data.value;
  // 「＋」で足した候補 (alts) も狙いの内 (2026-10-10 冷気・雷が「#から# (狙いに無い)」と出ていた)
  const top = s.simTargets.value.find((x) => x.modId === modId);
  const alt = top ? null : s.simTargets.value.flatMap((x) => x.alts ?? []).find((a) => a.modId === modId);
  const t = top ?? (alt ? { ...alt, alts: undefined } : undefined);
  const m = d?.mods.get(modId);
  if (!m) return modId;
  // 狙いの一覧に無い MOD (選び直して外した物) も日本語で (英語の id を出さない)
  if (!t) return `${fillHashes(jaOfMod(m), []).replace(/\n/g, " / ")} (狙いに無い)`;
  const tier = m.tiers[t.minTierIndex];
  const text = fillModText(m, tier ? tierDisplayRanges(tier) : []).replace(/\n/g, " / ");
  const alts = t.alts?.length ? ` (ほか ${t.alts.length} つのどれか)` : "";
  return `${text} T${m.tiers.length - t.minTierIndex} 以上${alts}`;
}
/** 狙う MOD の短い名前 (「火耐性 T3+」) */
function cardTitleOf(modId: string): string {
  const full = modLabel(modId);
  const rank = /T(\d+) 以上/.exec(full)?.[1];
  // 「(27-31)から(39-41)の火ダメージ」の「〜から〜の」も数ごと外す (「からの火ダメージ」になっていた)
  const name = full.replace(/\s*T\d+ 以上.*$/, "").replace(/[+-]?\(?\d[\d.]*(?:[-—~]\d[\d.]*)?\)?\s*から\s*[+-]?\(?\d[\d.]*(?:[-—~]\d[\d.]*)?\)?\s*の?/g, "").replace(/[+-]?\(?\d[\d.]*(?:[-—~]\d[\d.]*)?\)?/g, "").replace(/\s*%/g, "").replace(/\s+/g, " ").trim();
  return rank ? `${name} T${rank}+` : name;
}
/** 重ならない名前 (結果はパターンの名前で引くので、同じ名前は取り違える。2026-10-08 使い倒しテスト 4) */
function uniqueName(base: string, skip: number | null = null): string {
  const taken = new Set(s.simPatterns.value.filter((_, i) => i !== skip).map((p) => p.name));
  if (!taken.has(base)) return base;
  const m = /^(.*?)(?: (\d+))?$/.exec(base);
  const stem = m?.[1] ?? base;
  for (let n = (Number(m?.[2]) || 1) + 1; ; n++) if (!taken.has(`${stem} ${n}`)) return `${stem} ${n}`;
}
function addPattern(copy: boolean): void {
  // パターンは打って作る形だけ (ADR-002)
  s.simPatterns.value = [...s.simPatterns.value, { name: uniqueName(`パターン ${s.simPatterns.value.length + 1}`), steps: [], play: copy && pat.value.play ? (JSON.parse(JSON.stringify(pat.value.play)) as PlayRecipe) : { v: 2, moves: [] } }];
  active.value = s.simPatterns.value.length - 1;
}
/** 名前を付け替えているタブ */
const renaming = ref<number | null>(null);
function rename(i: number, name: string): void {
  if (renaming.value !== i) return;
  renaming.value = null;
  const n = name.trim();
  if (n && n !== s.simPatterns.value[i]?.name) s.simPatterns.value = s.simPatterns.value.map((p, k) => (k === i ? { ...p, name: uniqueName(n, i) } : p));
}
function removePattern(): void {
  if (s.simPatterns.value.length <= 1) return;
  const k = Math.min(active.value, s.simPatterns.value.length - 1);
  // 番号のままの名前だけ振り直す (付けた名前は残す)
  s.simPatterns.value = s.simPatterns.value.filter((_, i) => i !== k).map((p, i) => (/^パターン \d+$/.test(p.name) ? { ...p, name: `パターン ${i + 1}` } : p));
  active.value = Math.max(0, k - 1);
}
</script>

<template>
  <div class="text-[11px] max-md:text-[12px]">
    <!-- パターンのタブ -->
    <div class="mb-4 flex flex-wrap items-center gap-1.5 text-[13px] max-md:flex-nowrap max-md:overflow-x-auto max-md:whitespace-nowrap">
      <!-- タブはダブルクリックで名前を付け替える (2026-10-07 オーナー「名前も自分で変えて」。番号だけだと 10 個並ぶと取り違える) -->
      <template v-for="(p, i) in s.simPatterns.value" :key="i">
        <input v-if="renaming === i" :ref="(el) => { if (el) (el as HTMLInputElement).focus(); }" :value="p.name" class="w-40 rounded-full border border-amber-400/60 bg-black/50 px-2.5 py-0.5 outline-none" @keydown.enter="($event.target as HTMLInputElement).blur()" @keydown.esc="renaming = null" @blur="rename(i, ($event.target as HTMLInputElement).value)" />
        <button v-else type="button" class="g-tab !inline-flex !min-h-[34px] min-w-[120px] gap-1.5 max-md:!min-h-10" :class="i === Math.min(active, s.simPatterns.value.length - 1) ? 'on' : ''" title="ダブルクリックで名前を変える" @click="active = i" @dblclick="locked || (renaming = i)">{{ p.name }}<span class="rounded-full bg-white/[0.07] px-1.5 text-[11px] font-normal tabular-nums text-[var(--exile-color-text-tertiary)]">{{ p.play?.moves.length ?? 0 }} 手</span></button><button v-if="!locked && renaming !== i && i === Math.min(active, s.simPatterns.value.length - 1)" type="button" class="rounded px-1 text-[12px] opacity-50 hover:opacity-100" title="名前を変える" @click.stop="renaming = i">✎</button>
      </template>
      <template v-if="!locked">
        <button type="button" class="grid size-8 place-items-center rounded-md text-[var(--exile-color-text-secondary)] hover:bg-white/5 hover:text-[var(--exile-color-text-primary)] max-md:min-h-10 max-md:min-w-10" title="空のパターンを足す" @click="addPattern(false)"><Icon name="plus" class="size-4" /></button>
        <button type="button" class="grid size-8 place-items-center rounded-md text-[var(--exile-color-text-secondary)] hover:bg-white/5 hover:text-[var(--exile-color-text-primary)] max-md:min-h-10 max-md:min-w-10" title="このパターンを写して足す (少しだけ変えて比べる時に)" @click="addPattern(true)"><Icon name="copy" class="size-4" /></button>
        <button type="button" class="grid size-8 place-items-center rounded-md text-[var(--exile-color-text-secondary)] hover:bg-white/5 hover:text-[var(--exile-color-signal-down)] disabled:opacity-30 max-md:min-h-10 max-md:min-w-10" :disabled="s.simPatterns.value.length <= 1" :title="s.simPatterns.value.length <= 1 ? 'パターンが 1 つの時は消せない' : 'このパターンを消す'" @click="removePattern"><Icon name="trash" class="size-4" /></button>
        <button type="button" class="ml-2 inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--exile-color-border-brass)] px-3 text-[var(--exile-color-text-primary)] transition hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-30 max-md:hidden" :disabled="busy || !pat.play?.moves.length || (s.simPlayLeft.value[pat.name] ?? 0) > 0" :title="(s.simPlayLeft.value[pat.name] ?? 0) > 0 ? `ハズレルート設定が ${s.simPlayLeft.value[pat.name]} 形残っている (全部決めると回せる)` : pat.play?.moves.length ? 'このパターンで 1,500 人がそれぞれ完成まで作った場合を試す (未完成でも組めている所まで)。結果は下に' : '手が無い'" @click="emit('run-one', Math.min(active, s.simPatterns.value.length - 1))"><Icon name="play" class="size-3.5" />このパターンを回す</button>
        <button type="button" class="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[var(--exile-color-text-secondary)] hover:bg-white/5 hover:text-[var(--exile-color-text-primary)] disabled:opacity-30 max-md:min-h-10" :disabled="!history.length" :title="history.length ? 'パターンの直前の操作を 1 つ取り消す' : '戻せる操作がまだ無い'" @click="undoPattern"><Icon name="undo" class="size-4" />手を戻す</button>
      </template>
    </div>

    <StagePlayEditor v-if="pat.play" :play="pat.play" :sets="sets" :start-item="playStartItem" :name-of-mod="cardTitleOf" :locked="locked" :name="pat.name" @change="setPlay" />
  </div>
</template>
