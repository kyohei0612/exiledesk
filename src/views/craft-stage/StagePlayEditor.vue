<!--
  StagePlayEditor.vue — 打って作るパターン (ADR-002、2026-10-09)。画面は手打ちと同じ (アイテムの札 + 手打ちと同じ棚)。

  オーナー 2026-10-09:「手打ちみたいな挙動にしたらいい」「最短距離で付くように一旦打って、全部のカレンシーで一発で付くようなルートを打って、
  全てのパターンをどうするか決めた方がいい」→ 進め方は 2 段:
    ① 当たりで打つ … 棚から打ち、「MOD を狙う？」で打つだけか狙いを選ぶ。狙う手は当たったものとして進む (手の並び = 当たりの道)
    ② 外れを埋める … 狙う手ごとに、外れた形で次に打つ物を同じ棚から選ぶ (StageOutcomeTree の打って決める)
  「今まで入力していた部分 (ベース・MOD・始め方) まではそのまま」。決めていない形は回すと新しいベースで最初から (仮の数字)
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { craftStage, iconOf, nameOf } from "../../state/craft-stage";
import { provideShelf, simHidden } from "../../state/shelf-context";
import CurrencyShelf from "./CurrencyShelf.vue";
import ShelfButton from "./ShelfButton.vue";
import { OMEN_FOR } from "../../services/craft-stage/omens";
import StageItemCard from "./StageItemCard.vue";
import StageOutcomeTree from "./StageOutcomeTree.vue";
import HelpTip from "../../components/ui/HelpTip.vue";
import Icon from "../../components/ui/Icon.vue";
import type { PatternSet, PolicyAct } from "../../services/craft-stage/pattern";
import type { StageItem, StageMod } from "../../services/craft-stage/types";
import { applyCurrency, kindOf, omensFor } from "../../services/craft-stage/apply-currency";
import { mulberry32 } from "../../services/htc/rng";
import { allMods, listOf, makeStageMod, without, withMod } from "../../services/craft-stage/stage-core";
import { revealOffers, unrevealedOf } from "../../services/craft-stage/apply-desecrate";
import { essenceTarget } from "../../services/craft-stage/apply-essence";
import { GREATER, hitChanceOf, setOf, shapesLeft, useKey } from "../../services/craft-stage/shape-table";
import { moveShapeCtx, type PlayAim, type PlayDecision, type PlayMove, type PlayRecipe } from "../../services/craft-stage/play-recipe";

const props = defineProps<{
  play: PlayRecipe;
  sets: readonly PatternSet[];
  /** 始めのアイテム (ベース + 固定済みの MOD など。今まで入力した部分から) */
  startItem: StageItem | null;
  /** MOD の短い名前 (火ダメージ T3+ など) */
  nameOfMod: (modId: string) => string;
  locked?: boolean;
}>();
const emit = defineEmits<{ change: [play: PlayRecipe] }>();
const moves = computed(() => props.play.moves);
function setMoves(ms: PlayMove[]): void { emit("change", { ...props.play, moves: ms }); }

const data = computed(() => craftStage.data.value);
const sideOfId = (id: string): "prefix" | "suffix" => (data.value?.mods.get(id)?.type === "suffix" ? "suffix" : "prefix");
const limitOf = (it: StageItem | null, side: "prefix" | "suffix"): number => (it?.rarity === "magic" ? 1 : side === "prefix" ? (it?.cls.limits?.prefixes ?? 3) : (it?.cls.limits?.suffixes ?? 3));
const shortName = (id: string): string => props.nameOfMod(id).replace(/をアタックに追加する/, "");

// ── 狙いの候補 (今まで入力した狙いから) ─────────────────────────
interface AimOpt { key: string; label: string; mods: Array<{ modId: string; minTierIndex: number }>; side: "prefix" | "suffix" }
const aimOpts = computed<AimOpt[]>(() => {
  const out: AimOpt[] = [];
  const seen = new Set<string>();
  const ts = craftStage.simTargets.value.filter((t) => t.method !== "fracture");
  for (const t of ts) {
    const mods = [{ modId: t.modId, minTierIndex: t.minTierIndex }, ...(t.alts ?? [])];
    if (mods.length < 2) continue;
    const key = mods.map((m) => m.modId).sort().join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: `どれか 1 MOD (${mods.map((m) => shortName(m.modId)).join(" / ")})`, mods, side: sideOfId(t.modId) });
  }
  for (const t of ts) {
    for (const m of [{ modId: t.modId, minTierIndex: t.minTierIndex }, ...(t.alts ?? [])]) {
      if (seen.has(m.modId)) continue;
      seen.add(m.modId);
      out.push({ key: m.modId, label: props.nameOfMod(m.modId), mods: [m], side: sideOfId(m.modId) });
    }
  }
  return out;
});

// ── アイテムの移り変わり (当たりの道) ─────────────────────────
/** 狙いの MOD 行 (どれか N つなら「どれか 1 MOD (…)」の文に) */
function hitMod(aim: PlayAim, modId: string, minTierIndex: number): StageMod | null {
  const md = data.value?.mods.get(modId);
  if (!md) return null;
  const m = makeStageMod(md, aim.side, Math.min(md.tiers.length - 1, minTierIndex), () => 0.5);
  return aim.mods.length > 1 ? { ...m, textJa: `どれか 1 MOD (${aim.mods.map((x) => shortName(x.modId)).join(" / ")})` } : m;
}
const aimMet = (it: StageItem, aim: PlayAim): boolean => new Set(allMods(it).filter((s) => !s.unrevealed && aim.mods.some((a) => s.modId === a.modId && s.tierIndex >= a.minTierIndex)).map((s) => s.modId)).size >= aim.need;
/** どれか N つの狙いの MOD は「どれか 1 MOD (…)」の文で出す (順不同) */
function relabel(it: StageItem, aim: PlayAim): StageItem {
  if (aim.mods.length < 2) return it;
  const text = `どれか 1 MOD (${aim.mods.map((x) => shortName(x.modId)).join(" / ")})`;
  const f = (ms: StageMod[]): StageMod[] => ms.map((s) => (aim.mods.some((a) => a.modId === s.modId) ? { ...s, textJa: text } : s));
  return { ...it, prefixes: f(it.prefixes), suffixes: f(it.suffixes) };
}
/** 当たりの乱数が見つからない時の目安: 狙いの行を足すだけ (狙いの側が満杯なら狙い以外を外す) */
function fakeHit(it0: StageItem, x: PatternSet, aim: PlayAim): StageItem {
  let it = it0;
  if (["transmute", "augment"].includes(x.kind) && it.rarity === "normal") it = { ...it, rarity: "magic" };
  if (["regal", "alchemy", "essence"].includes(x.kind)) it = { ...it, rarity: "rare" };
  const isMember = (s: StageMod): boolean => aim.mods.some((a) => a.modId === s.modId);
  if (x.kind === "chaos") { const junk = allMods(it).find((s) => !s.fractured && !isMember(s)); if (junk) it = without(it, junk); }
  for (let g = 0; g < 6; g++) {
    const have = new Set(listOf(it, aim.side).filter(isMember).map((s) => s.modId));
    if (have.size >= aim.need) break;
    const next = aim.mods.find((a) => !have.has(a.modId));
    if (!next) break;
    if (listOf(it, aim.side).length >= limitOf(it, aim.side)) {
      const junk = listOf(it, aim.side).find((s) => !s.fractured && !isMember(s));
      if (!junk) break;
      it = without(it, junk);
    }
    const hm = hitMod(aim, next.modId, next.minTierIndex);
    if (!hm) break;
    it = withMod(it, hm);
  }
  return it;
}
/** items[k] = k 手目を打つ前のアイテム (items[moves.length] = 今)。打つだけの手は本当に打ち、狙う手は当たったものとして狙いを足す */
const items = computed<Array<StageItem | null>>(() => {
  const d = data.value;
  const out: Array<StageItem | null> = [props.startItem];
  let it = props.startItem;
  for (const [k, m] of moves.value.entries()) {
    const x = setOf(props.sets, m.use);
    if (!d || !it || !x) { out.push(it); continue; }
    if (!m.aim) {
      const r = applyCurrency(d, it, x.currency, mulberry32(1000 + k), x.omens);
      if (r.applied) it = r.item;
      // 骨を打つだけ: エンジンと同じく 1 番目の候補で発現
      if (it && unrevealedOf(it)) { const rv = applyCurrency(d, it, "reveal:1", mulberry32(2000 + k)); if (rv.applied) it = rv.item; }
    } else {
      // 当たりで打つ: エンジンで本当に打ち、狙いが揃って前の手の狙いも残る乱数を探す (触媒の高貴で品質が消える・骨の発現・エッセンスもエンジンの通り)。
      // 2026-10-09 オーナー「カタリスト周りと冒涜周り、エッセンスも」。見つからなければ狙いの行を足すだけの目安
      const prev = moves.value.slice(0, k).flatMap((p) => (p.aim ? [p.aim] : []));
      let found: StageItem | null = null;
      for (let t = 0; t < 4000 && !found; t++) {
        const r = applyCurrency(d, it, x.currency, mulberry32(50_000 + k * 10_000 + t), x.omens);
        if (!r.applied) break;
        let it2 = r.item;
        // 骨: 発現は狙いの出た候補を選ぶ (無ければこの乱数は外れ)
        if (unrevealedOf(it2)) {
          const offers = revealOffers(d, it2, mulberry32(90_000 + t));
          const idx = offers.first.findIndex((o) => m.aim!.mods.some((a) => o.modId === a.modId && o.tierIndex >= a.minTierIndex));
          if (idx < 0) continue;
          const rv = applyCurrency(d, it2, `reveal:${idx + 1}`, mulberry32(90_000 + t));
          if (!rv.applied) continue;
          it2 = rv.item;
        }
        if (aimMet(it2, m.aim) && prev.every((p) => aimMet(it2, p))) found = it2;
      }
      if (found) it = relabel(found, m.aim);
      else it = fakeHit(it, x, m.aim);
    }
    out.push(it);
  }
  return out;
});
const now = computed(() => items.value[items.value.length - 1] ?? null);

// ── 手の形 (② 外れを埋める) ─────────────────────────────────
const toPolicy = (sh: Record<string, PlayDecision> | undefined): Record<string, PolicyAct> => Object.fromEntries(Object.entries(sh ?? {}).map(([k, d]) => [k, "use" in d ? { set: d.use, ...(d.pre?.length ? { pre: d.pre } : {}) } : d.go === "next" ? { then: "next" } : d.go === "start" ? { then: "restart" } : d.strip != null ? { then: "reset", goto: d.to } : { then: "goto", goto: d.to }]));
const fromPolicy = (pol: Record<string, PolicyAct>): Record<string, PlayDecision> => Object.fromEntries(Object.entries(pol).flatMap(([k, a]): Array<[string, PlayDecision]> => (a.set ? [[k, { use: a.set, ...(a.pre?.length ? { pre: a.pre } : {}) }]] : a.then === "next" ? [[k, { go: "next" }]] : a.then === "restart" ? [[k, { go: "start" }]] : a.then === "reset" ? [[k, { go: "move", to: a.goto ?? 0, strip: 1 }]] : a.then === "goto" ? [[k, { go: "move", to: a.goto ?? 0 }]] : [])));
/** 狙う手の「打って決める」の中身 */
function shapeOf(i: number) {
  const m = moves.value[i];
  const x = m ? setOf(props.sets, m.use) : undefined;
  const it = items.value[i] ?? null;
  const d = data.value;
  if (!m?.aim || !x || !it || !d) return null;
  const side = m.aim.side;
  const other = side === "prefix" ? "suffix" : "prefix";
  const otherRemovable = listOf(it, other).filter((s) => !s.fractured).length;
  const c = moveShapeCtx(props.play, i, props.sets, limitOf(it, side), otherRemovable);
  if (!c) return null;
  // 打つ前に狙いの側に付いている狙い以外 (打つだけの手で付いた物など)。カオスのスパムは、これがあるから外れが出る
  const targetIds = new Set(craftStage.simTargets.value.flatMap((t) => [t.modId, ...(t.alts ?? []).map((a) => a.modId)]));
  const j0 = listOf(it, side).filter((s) => !s.fractured && !targetIds.has(s.modId) && !/#h\d+$/.test(s.modId)).length;
  const pHit = hitChanceOf(d, it.cls, it.itemLevel, side, m.aim.mods, c.ctx.need - m.aim.need);
  // 反対の側に前の手の狙いがあれば、その数も形に入れる (消えた時の次の手を決める。2026-10-09 両側の狙い)
  const otherAimed = moves.value.slice(0, i).some((p) => p.aim && p.aim.side === other);
  const otherHits = otherAimed ? listOf(it, other).filter((s) => !s.fractured && targetIds.has(s.modId)).length : undefined;
  const otherFixed = listOf(it, other).filter((s) => s.fractured).length;
  const otherLimit = limitOf(it, other);
  // エッセンスは付く MOD と側が決まっている (エンジンの essenceTarget)
  const fixedAdd = (cur: string): { side: "prefix" | "suffix"; hit: boolean } | null => { const t = essenceTarget(d, it, cur); return t ? { side: t.side, hit: m.aim!.mods.some((a) => a.modId === t.mod.id) } : null; };
  const ctxMore = { ...(otherHits != null ? { otherHits } : {}), otherFixed, otherLimit, fixedAdd };
  let spam: number | null = null;
  for (let k = i - 1; k >= 0; k--) if (setOf(props.sets, moves.value[k]!.use)?.kind === "chaos") { spam = k; break; }
  const policy = toPolicy(m.shapes);
  return {
    props: { set: x, side, limit: limitOf(it, side), need: c.ctx.need, h0: c.h0, j0, policy, pHit, otherRemovable, ...ctxMore, isTarget: (id: string) => targetIds.has(id) || /#h\d+$/.test(id), steps: moves.value.slice(0, i + 1).map((p, n) => ({ n, label: `${n + 1} 手目: ${useLabel(p.use)}` })), hitMods: m.aim.mods.flatMap((a) => { const hm = hitMod(m.aim!, a.modId, a.minTierIndex); return hm ? [hm] : []; }), baseItem: it, backTo: spam != null ? { to: spam, label: `${spam + 1} 手目のスパムへ` } : null },
    left: shapesLeft({ ...c.ctx, pHit, ...ctxMore }, x, c.h0, j0, policy),
  };
}
const shapes = computed(() => moves.value.map((_, i) => shapeOf(i)));
const leftTotal = computed(() => shapes.value.reduce((a, s) => a + (s?.left ?? 0), 0));
function setShapes(i: number, pol: Record<string, PolicyAct>): void {
  setMoves(moves.value.map((m, k) => (k === i ? { ...m, shapes: fromPolicy(pol) } : m)));
}

// ── 選んでいる手 (null = ① 当たりで次の手を打つ) ─────────────────
const sel = ref<number | null>(null);
function goFill(): void { const i = shapes.value.findIndex((s) => (s?.left ?? 0) > 0); if (i >= 0) sel.value = i; }
function removeMove(i: number): void {
  setMoves(moves.value.filter((_, k) => k !== i));
  if (sel.value != null && sel.value >= moves.value.length - 1) sel.value = null;
}

// ── ① 当たりで打つ: 手打ちと同じ棚 ─────────────────────────
const omens = ref<string[]>([]);
const held = ref<string | null>(null);
provideShelf({
  data: craftStage.data, item: now as unknown as import("vue").Ref<StageItem | null>, omens, held,
  usable: (k) => { const d = data.value, it = now.value; if (!d || !it) return "準備中"; const r = applyCurrency(d, it, k, mulberry32(0), omens.value); return r.applied ? null : (r.reason ?? "打てない"); },
  toggleOmen: (id) => { omens.value = omens.value.includes(id) ? omens.value.filter((o) => o !== id) : [...omens.value, id]; },
  hidden: simHidden,
});
/** 持った物に掛けられるお告げ (手打ちと同じ、エンジンの決まり OMEN_FOR) */
const heldOmens = computed(() => { if (!held.value) return []; const k = kindOf(held.value); return [...(OMEN_FOR[k] ?? []), ...(k === "desecrate" ? OMEN_FOR.reveal ?? [] : [])]; });
function toggleOmen(id: string): void { omens.value = omens.value.includes(id) ? omens.value.filter((o) => o !== id) : [...omens.value, id]; }
/** 棚で持った物 (打つ物のキー)。次に「MOD を狙う？」 */
const pending = computed(() => (held.value ? useKey(held.value, omensFor(held.value, omens.value)) : null));
const pendingSet = computed(() => (pending.value ? setOf(props.sets, pending.value) : undefined));
/** 付ける物か (消去・品質・触媒などは狙えない = 打つだけ) */
const adds = computed(() => !!pendingSet.value && ["transmute", "augment", "regal", "alchemy", "exalt", "chaos", "essence", "essence_perfect", "desecrate", "fracture"].includes(pendingSet.value.kind));
/** この狙いの前の手までに揃っている数 (同じ狙い) */
function prevNeed(o: AimOpt): number {
  const ids = new Set(o.mods.map((m) => m.modId));
  return moves.value.reduce((a, m) => (m.aim && m.aim.mods.some((x) => ids.has(x.modId)) ? Math.max(a, m.aim.need) : a), 0);
}
function addMove(o: AimOpt | null): void {
  const use = pending.value;
  const x = pendingSet.value;
  if (!use || !x) return;
  let aim: PlayAim | null = null;
  if (o) {
    const step = x.kind === "exalt" && x.omens.includes(GREATER) ? 2 : 1;
    aim = { mods: o.mods, need: Math.min(o.mods.length, prevNeed(o) + step), side: o.side };
  }
  setMoves([...moves.value, { use, aim }]);
  held.value = null;
  omens.value = [];
}

const iconsOf = (key: string): string[] => { const x = setOf(props.sets, key); return x ? [x.currency, ...x.omens].filter((i) => !!iconOf(i)) : []; };
const useLabel = (key: string): string => { const x = setOf(props.sets, key); return x ? [nameOf(x.currency), ...x.omens.map((o) => nameOf(o))].join(" + ") : key; };
/** 手の狙いの文。前の手で同じ狙いが付いていれば「残り N つ (合わせて M つ)」(初見レビュー「どれか 3 つが 3 つ全部か残りか分からない」) */
function aimLabelAt(i: number): string {
  const a = moves.value[i]?.aim;
  if (!a) return "";
  const names = a.mods.map((m) => shortName(m.modId)).join(" / ");
  if (a.mods.length < 2) return props.nameOfMod(a.mods[0]!.modId);
  const before = prevNeedOf(a, i);
  return before > 0 ? `残り ${a.need - before} つ (合わせて ${a.need} つ: ${names})` : `どれか ${a.need} つ (${names})`;
}
/** 左の一覧用の短い文 (MOD は種類だけ: 火・冷気・雷) */
function aimShortAt(i: number): string {
  const a = moves.value[i]?.aim;
  if (!a) return "";
  if (a.mods.length < 2) return props.nameOfMod(a.mods[0]!.modId);
  const tier = /T\d+\+$/.exec(shortName(a.mods[0]!.modId))?.[0] ?? "";
  const kinds = a.mods.map((m) => shortName(m.modId).replace(/\s*T\d+\+$/, "").replace(/ダメージ$/, "")).join("・");
  const before = prevNeedOf(a, i);
  return `${before > 0 ? `残り ${a.need - before}` : `${a.need} つ`}: ${kinds} ${tier}`.trim();
}
function prevNeedOf(a: PlayAim, i: number): number {
  const ids = new Set(a.mods.map((m) => m.modId));
  return moves.value.slice(0, i).reduce((acc, m) => (m.aim && m.aim.mods.some((x) => ids.has(x.modId)) ? Math.max(acc, m.aim.need) : acc), 0);
}
/** 打つ物の短い名前 (完全高貴 · 偉大 · 左 など)。正式な名前は乗せると出る */
const OMEN_SHORT: Record<string, string> = { OmenofSinistralExaltation: "左", OmenofDextralExaltation: "右", OmenofSinistralAnnulment: "左", OmenofDextralAnnulment: "右", OmenofSinistralErasure: "左", OmenofDextralErasure: "右", OmenofGreaterExaltation: "偉大", OmenofCatalysingExaltation: "触媒", OmenofWhittling: "削減", OmenofLight: "光", OmenofSinistralCrystallisation: "左", OmenofDextralCrystallisation: "右", OmenofSinistralNecromancy: "左", OmenofDextralNecromancy: "右", OmenofAbyssalEchoes: "反響" };
const CUR_SHORT: Record<string, string> = { exalt: "高貴", exalt_greater: "上級高貴", exalt_perfect: "完全高貴", chaos: "カオス", chaos_greater: "上級カオス", chaos_perfect: "完全カオス", annul: "消去" };
const useShort = (key: string): string => { const x = setOf(props.sets, key); if (!x) return key; return [CUR_SHORT[x.currency] ?? nameOf(x.currency), ...x.omens.map((o) => OMEN_SHORT[o] ?? nameOf(o))].join(" · "); };
</script>

<template>
  <div class="grid grid-cols-[300px_minmax(0,1fr)] items-start gap-6 text-[13px] max-md:grid-cols-1">
    <!-- 左: 2 段 (当たりの手 / 外れの手) と手の並び -->
    <aside class="flex flex-col gap-3">
      <div class="grid grid-cols-2 gap-1 rounded-lg bg-black/30 p-1" role="tablist">
        <button type="button" role="tab" :aria-selected="sel == null" class="flex flex-col items-start rounded-md px-2.5 py-1.5 text-left transition" :class="sel == null ? 'bg-[var(--exile-color-bg-elevated)] text-[var(--exile-color-text-primary)] ring-1 ring-[var(--exile-color-border-brass)]' : 'text-[var(--exile-color-text-secondary)] hover:bg-white/5'" @click="sel = null">
          <span class="text-[11px] tracking-wide text-[var(--exile-color-text-tertiary)]">1</span>
          <span class="font-semibold">当たりの手</span>
          <span class="text-xs tabular-nums text-[var(--exile-color-text-secondary)]">{{ moves.length }} 手</span>
        </button>
        <button type="button" role="tab" :aria-selected="sel != null" class="flex flex-col items-start rounded-md px-2.5 py-1.5 text-left transition disabled:opacity-40" :class="sel != null ? 'bg-[var(--exile-color-bg-elevated)] text-[var(--exile-color-text-primary)] ring-1 ring-[var(--exile-color-border-brass)]' : 'text-[var(--exile-color-text-secondary)] hover:bg-white/5'" :disabled="!moves.some((m) => m.aim)" @click="goFill">
          <span class="text-[11px] tracking-wide text-[var(--exile-color-text-tertiary)]">2</span>
          <span class="flex items-center gap-1.5 font-semibold">外れの手<span v-if="leftTotal && sel == null && moves.some((m) => m.aim)" class="rounded-sm bg-[rgba(224,201,122,0.18)] px-1 text-[10px] font-semibold text-[var(--exile-color-signal-warn)]">次はここ</span></span>
          <span class="text-xs tabular-nums" :class="!moves.some((m) => m.aim) ? 'text-[var(--exile-color-text-tertiary)]' : leftTotal ? 'text-[var(--exile-color-signal-warn)]' : 'text-[var(--exile-color-signal-up)]'">{{ !moves.some((m) => m.aim) ? "狙う手のあとで" : leftTotal ? `残り ${leftTotal} 形` : "全部決めた" }}</span>
        </button>
      </div>
      <p class="mt-1 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-[var(--exile-color-text-tertiary)]">
        手の並び
        <HelpTip title="打って作る" :width="300">
          <p>1. <b>当たりの手</b>: 棚から打つ物を選び、狙う MOD を決める。狙う手は当たったものとして次へ進む。</p>
          <p class="mt-1">2. <b>外れの手</b>: 外れた形ごとに、次に打つ物を棚から選ぶ。選ぶと次の形へ進む。</p>
          <p class="mt-1 text-[var(--exile-color-text-secondary)]">決めていない形は、回すと新しいベースで最初から (仮の数字)。</p>
        </HelpTip>
      </p>

      <ol class="flex flex-col gap-1">
        <li v-for="(m, i) in moves" :key="i">
          <button type="button" class="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition" :class="sel === i ? 'bg-[var(--exile-color-bg-elevated)] shadow-[inset_2px_0_0_var(--exile-color-accent-focus)]' : 'hover:bg-white/[0.04]'" @click="sel = i">
            <span class="grid size-5 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] font-semibold tabular-nums text-[var(--exile-color-text-secondary)]">{{ i + 1 }}</span>
            <span class="flex shrink-0 items-center -space-x-1"><img v-for="ic in iconsOf(m.use)" :key="ic" :src="iconOf(ic)" alt="" class="size-6 object-contain" /></span>
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium text-[var(--exile-color-text-primary)]" :title="useLabel(m.use)">{{ useShort(m.use) }}</span>
              <span class="line-clamp-2 block text-xs" :class="m.aim ? 'text-[var(--color-rarity-magic)]' : 'text-[var(--exile-color-text-tertiary)]'" :title="m.aim ? aimLabelAt(i) : ''">{{ m.aim ? aimShortAt(i) : "狙わない" }}</span>
            </span>
            <span v-if="m.aim && shapes[i]" class="shrink-0 rounded-full px-1.5 text-[11px] tabular-nums" :class="shapes[i]!.left ? 'bg-white/[0.07] text-[var(--exile-color-text-secondary)]' : 'text-[var(--exile-color-signal-up)]'" :title="shapes[i]!.left ? `外れた時の形があと ${shapes[i]!.left} つ未定 (押すと決める)` : '外れも全部決めた'">
              <template v-if="shapes[i]!.left">外れ {{ shapes[i]!.left }}</template><Icon v-else name="check" class="size-3.5" />
            </span>
            <span v-if="!locked" role="button" tabindex="0" class="grid size-6 shrink-0 place-items-center rounded text-[var(--exile-color-text-tertiary)] opacity-0 transition hover:bg-white/10 hover:text-[var(--exile-color-signal-down)] focus:opacity-100 group-hover:opacity-100" title="この手を消す" @click.stop="removeMove(i)" @keydown.enter.stop="removeMove(i)"><Icon name="x" class="size-3.5" /></span>
          </button>
        </li>
      </ol>
      <button v-if="!locked" type="button" class="flex h-8 items-center justify-center gap-1.5 rounded-md border px-3 transition" :class="sel == null ? 'border-[var(--exile-color-border-brass)] bg-[rgba(201,162,90,0.08)] text-[var(--exile-color-text-primary)]' : 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-text-primary)]'" @click="sel = null"><Icon name="plus" class="size-4" />手を足す</button>
      <button v-if="leftTotal && sel == null && moves.some((m) => m.aim)" type="button" class="flex items-start gap-2 rounded-md bg-[rgba(224,201,122,0.08)] px-3 py-2 text-left text-xs text-[var(--exile-color-signal-warn)] ring-1 ring-[rgba(224,201,122,0.25)] transition hover:bg-[rgba(224,201,122,0.14)]" @click="goFill">
        <Icon name="arrow-right" class="mt-px size-4 shrink-0" />
        <span>次は外れた時の手。<b>{{ leftTotal }} 形</b>が未定 (決めないと、回した時は新しいベースで最初から)</span>
      </button>
    </aside>

    <!-- 右 -->
    <div class="min-w-0">
      <!-- 1 当たりの手を足す -->
      <template v-if="sel == null">
        <header class="mb-3 flex flex-wrap items-baseline gap-x-3">
          <h4 class="text-[15px] font-semibold text-[var(--exile-color-text-primary)]">{{ moves.length + 1 }} 手目</h4>
          <span class="text-xs text-[var(--exile-color-text-secondary)]">{{ pendingSet ? "狙う MOD を選ぶ" : "棚から打つ物を選ぶ" }}</span>
        </header>
        <div class="flex items-start gap-5 max-md:flex-col">
          <div class="shrink-0 max-md:mx-auto">
            <StageItemCard v-if="now" :item="now" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="260" compact />
          </div>
          <div class="flex min-w-0 flex-1 flex-col gap-3">
            <!-- 持った物と、狙う MOD (アイテムのすぐ横。初見レビュー「持った後に何も起きないように見える」) -->
            <section v-if="pendingSet" class="rounded-lg bg-[var(--exile-color-bg-elevated)] p-3 ring-1 ring-[var(--exile-color-border-brass)]">
              <div class="mb-2 flex flex-wrap items-center gap-2">
                <span class="flex items-center -space-x-1"><img v-for="ic in iconsOf(pending!)" :key="ic" :src="iconOf(ic)" alt="" class="size-6 object-contain" /></span>
                <b class="text-[var(--exile-color-text-primary)]">{{ useLabel(pending!) }}</b>
                <button type="button" class="ml-auto grid size-7 place-items-center rounded text-[var(--exile-color-text-tertiary)] hover:bg-white/10 hover:text-[var(--exile-color-text-primary)]" title="持つのをやめる" @click="held = null"><Icon name="x" class="size-4" /></button>
              </div>
              <div v-if="heldOmens.length" class="mb-3">
                <p class="mb-1.5 text-[11px] font-medium tracking-wide text-[var(--exile-color-text-tertiary)]">お告げ (掛けるなら先に)</p>
                <div class="flex flex-wrap gap-1.5"><ShelfButton v-for="k in heldOmens" :key="k" :k="k" omen @pick="toggleOmen($event)" /></div>
              </div>
              <p class="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-[var(--exile-color-text-tertiary)]">狙う MOD (押すと手が入る) <HelpTip text="狙う手は当たったものとして次へ進みます。外れた時の手は「外れの手」で決めます" /></p>
              <div class="flex flex-wrap gap-1.5">
                <template v-if="adds">
                  <button v-for="o in aimOpts" :key="o.key" type="button" class="h-8 rounded-md border border-[var(--exile-color-border-subtle)] px-2.5 text-[var(--exile-color-text-primary)] transition hover:border-[rgba(136,136,255,0.6)] hover:bg-[rgba(136,136,255,0.1)] hover:text-[var(--color-rarity-magic)]" @click="addMove(o)">{{ o.label }}</button>
                </template>
                <button type="button" class="h-8 rounded-md px-2.5 text-[var(--exile-color-text-secondary)] transition hover:bg-white/5 hover:text-[var(--exile-color-text-primary)]" @click="addMove(null)">狙わない</button>
              </div>
            </section>
            <CurrencyShelf v-if="!locked" @hold="(k: string) => (held = k)">
            </CurrencyShelf>
          </div>
        </div>
      </template>

      <!-- 2 外れの手 (狙う手) -->
      <template v-else-if="moves[sel]?.aim && shapes[sel]">
        <header class="mb-3 flex flex-wrap items-baseline gap-x-3">
          <h4 class="text-[15px] font-semibold text-[var(--exile-color-text-primary)]">{{ sel + 1 }} 手目の外れ</h4>
          <span class="text-xs text-[var(--color-rarity-magic)]">{{ aimLabelAt(sel) }}</span>
        </header>
        <StageOutcomeTree v-bind="shapes[sel]!.props" :sets="sets" use-shelf auto :locked="locked" @change="(pol) => setShapes(sel!, pol)" />
      </template>

      <!-- 狙わない手 -->
      <template v-else-if="moves[sel]">
        <header class="mb-3 flex flex-wrap items-baseline gap-x-3">
          <h4 class="text-[15px] font-semibold text-[var(--exile-color-text-primary)]">{{ sel + 1 }} 手目</h4>
          <span class="text-xs text-[var(--exile-color-text-secondary)]">狙わない手。打って次の手へ進む</span>
        </header>
        <div class="flex flex-wrap items-start gap-5">
          <div><p class="mb-1.5 text-xs text-[var(--exile-color-text-secondary)]">打つ前</p><StageItemCard v-if="items[sel]" :item="items[sel]!" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="240" compact /></div>
          <div class="self-center text-[var(--exile-color-text-tertiary)]"><Icon name="arrow-right" class="size-5" /></div>
          <div><p class="mb-1.5 text-xs text-[var(--exile-color-text-secondary)]">打った後 (例)</p><StageItemCard v-if="items[sel + 1]" :item="items[sel + 1]!" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="240" compact /></div>
        </div>
      </template>
    </div>
  </div>
</template>
