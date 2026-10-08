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
import type { PatternSet, PolicyAct } from "../../services/craft-stage/pattern";
import type { StageItem, StageMod } from "../../services/craft-stage/types";
import { applyCurrency, kindOf, omensFor } from "../../services/craft-stage/apply-currency";
import { mulberry32 } from "../../services/htc/rng";
import { allMods, listOf, makeStageMod, without, withMod } from "../../services/craft-stage/stage-core";
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
    } else {
      // レアリティ: 変成・増強はマジック、王者・錬金・エッセンスはレア
      if (["transmute", "augment"].includes(x.kind) && it.rarity === "normal") it = { ...it, rarity: "magic" };
      if (["regal", "alchemy", "essence"].includes(x.kind)) it = { ...it, rarity: "rare" };
      const side = m.aim.side;
      const isMember = (s: StageMod): boolean => m.aim!.mods.some((a) => a.modId === s.modId);
      // カオスは 1 つ消して付く (狙い以外があればそれを消す)
      if (x.kind === "chaos") { const junk = allMods(it).find((s) => !s.fractured && !isMember(s)); if (junk) it = without(it, junk); }
      for (let g = 0; g < 6; g++) {
        const have = new Set(listOf(it, side).filter(isMember).map((s) => s.modId));
        if (have.size >= m.aim.need) break;
        const next = m.aim.mods.find((a) => !have.has(a.modId));
        if (!next) break;
        if (listOf(it, side).length >= limitOf(it, side)) {
          const junk = listOf(it, side).find((s) => !s.fractured && !isMember(s));
          if (!junk) break;
          it = without(it, junk);
        }
        const hm = hitMod(m.aim, next.modId, next.minTierIndex);
        if (!hm) break;
        it = withMod(it, hm);
      }
    }
    out.push(it);
  }
  return out;
});
const now = computed(() => items.value[items.value.length - 1] ?? null);

// ── 手の形 (② 外れを埋める) ─────────────────────────────────
const toPolicy = (sh: Record<string, PlayDecision> | undefined): Record<string, PolicyAct> => Object.fromEntries(Object.entries(sh ?? {}).map(([k, d]) => [k, "use" in d ? { set: d.use } : d.go === "next" ? { then: "next" } : d.go === "start" ? { then: "restart" } : d.strip != null ? { then: "reset", goto: d.to } : { then: "goto", goto: d.to }]));
const fromPolicy = (pol: Record<string, PolicyAct>): Record<string, PlayDecision> => Object.fromEntries(Object.entries(pol).flatMap(([k, a]): Array<[string, PlayDecision]> => (a.set ? [[k, { use: a.set }]] : a.then === "next" ? [[k, { go: "next" }]] : a.then === "restart" ? [[k, { go: "start" }]] : a.then === "reset" ? [[k, { go: "move", to: a.goto ?? 0, strip: 1 }]] : a.then === "goto" ? [[k, { go: "move", to: a.goto ?? 0 }]] : [])));
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
  let spam: number | null = null;
  for (let k = i - 1; k >= 0; k--) if (setOf(props.sets, moves.value[k]!.use)?.kind === "chaos") { spam = k; break; }
  const policy = toPolicy(m.shapes);
  return {
    props: { set: x, side, limit: limitOf(it, side), need: c.ctx.need, h0: c.h0, j0, policy, pHit, otherRemovable, baseItem: it, backTo: spam != null ? { to: spam, label: `${spam + 1} 手目のスパムへ` } : null },
    left: shapesLeft({ ...c.ctx, pHit }, x, c.h0, j0, policy),
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
const aimLabel = (a: PlayAim): string => (a.mods.length > 1 ? `どれか ${a.need} つ (${a.mods.map((m) => shortName(m.modId)).join(" / ")})` : props.nameOfMod(a.mods[0]!.modId));
</script>

<template>
  <div class="flex gap-3 max-md:flex-col">
    <!-- 左: 手の並び -->
    <div class="w-[300px] shrink-0 rounded-lg bg-black/25 p-2 max-md:w-full">
      <div class="mb-2 flex flex-col gap-1 text-[11px]">
        <button type="button" class="rounded-md border px-2 py-1 text-left" :class="sel == null ? 'border-amber-400/70 bg-amber-500/15 text-amber-100' : 'border-white/10 opacity-80 hover:opacity-100'" @click="sel = null"><b>① 当たりで打つ</b> <span class="opacity-70">{{ moves.length }} 手</span></button>
        <button type="button" class="rounded-md border px-2 py-1 text-left disabled:opacity-40" :class="leftTotal ? 'border-amber-400/40' : 'border-emerald-400/40 text-emerald-100'" :disabled="!moves.some((m) => m.aim)" @click="goFill"><b>② 外れを埋める</b> <span class="opacity-70">{{ !moves.some((m) => m.aim) ? "狙う手がまだ無い" : leftTotal ? `残り ${leftTotal} 形` : "全部決めた ✓" }}</span></button>
      </div>
      <div v-for="(m, i) in moves" :key="i" class="mb-1.5 cursor-pointer rounded-md border bg-gradient-to-b from-white/[0.05] to-black/50 px-2 py-1" :class="sel === i ? 'border-amber-400/80 ring-2 ring-amber-400/40' : 'border-white/10 hover:border-white/30'" @click="sel = i">
        <div class="flex items-center gap-1">
          <b class="text-sky-200">{{ i + 1 }}</b>
          <img v-for="ic in iconsOf(m.use)" :key="ic" :src="iconOf(ic)" alt="" class="h-5 w-5 object-contain" />
          <span class="truncate font-bold">{{ useLabel(m.use) }}</span>
          <button v-if="!locked" type="button" class="ml-auto shrink-0 px-1 opacity-50 hover:opacity-100" title="この手を消す" @click.stop="removeMove(i)">×</button>
        </div>
        <p class="text-[11px]" :class="m.aim ? 'text-[#8888ff]' : 'opacity-60'">{{ m.aim ? `→ ${aimLabel(m.aim)}` : "打つだけ" }}</p>
        <span v-if="m.aim && shapes[i]" class="mt-0.5 inline-block rounded-full px-2 py-px text-[10px] font-bold" :class="shapes[i]!.left ? 'bg-amber-500/20 text-amber-100' : 'bg-emerald-500/20 text-emerald-100'">{{ shapes[i]!.left ? `外れ 残り ${shapes[i]!.left} 形` : "外れも全部決めた ✓" }}</span>
      </div>
      <button v-if="!locked" type="button" class="w-full rounded-md border border-dashed border-amber-400/50 px-2 py-1.5 text-amber-100 hover:bg-amber-500/10" :class="sel == null ? 'bg-amber-500/10' : ''" @click="sel = null">＋ 当たりで次の手を打つ</button>
      <p v-if="leftTotal" class="mt-2 text-[10px] opacity-50">決めていない外れの形は、回すと新しいベースで最初から (仮の数字)</p>
    </div>

    <!-- 右 -->
    <div class="min-w-0 flex-1">
      <!-- ① 当たりで次の手を打つ -->
      <template v-if="sel == null">
        <p class="mb-1.5 text-[13px] font-bold text-amber-100">{{ moves.length + 1 }} 手目 · 当たりで打つ <span class="text-[11px] font-normal opacity-60">棚から打つ物を選ぶ → MOD を狙う？</span></p>
        <div class="flex gap-3 max-md:flex-col">
          <div class="shrink-0 max-md:mx-auto"><StageItemCard v-if="now" :item="now" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="260" compact /></div>
          <div class="min-w-0 flex-1">
            <CurrencyShelf v-if="!locked" @hold="(k: string) => (held = k)">
            <template v-if="heldOmens.length" #held>
              <div class="rounded-lg border border-violet-400/25 bg-violet-500/[0.06] p-2">
                <p class="mb-1 text-[11px] text-violet-200/80">{{ nameOf(held ?? "") }} に掛けられるお告げ (押すと掛ける / 外す)</p>
                <div class="flex flex-wrap gap-1.5"><ShelfButton v-for="k in heldOmens" :key="k" :k="k" omen @pick="toggleOmen($event)" /></div>
              </div>
            </template>
            </CurrencyShelf>
            <div v-if="pendingSet" class="mt-2 rounded-lg border border-sky-400/40 bg-sky-950/20 p-2">
              <p class="mb-1 flex flex-wrap items-center gap-1 font-bold"><img v-for="ic in iconsOf(pending!)" :key="ic" :src="iconOf(ic)" alt="" class="h-5 w-5 object-contain" />{{ useLabel(pending!) }} を打つ → MOD を狙う？</p>
              <div class="flex flex-wrap gap-1">
                <button type="button" class="rounded-lg border border-white/20 px-2 py-1 hover:border-white/50" @click="addMove(null)">打つだけ (1 手進む)</button>
                <template v-if="adds">
                  <button v-for="o in aimOpts" :key="o.key" type="button" class="rounded-lg border border-[#8888ff]/50 px-2 py-1 text-[#c8c8ff] hover:bg-[#8888ff]/15" @click="addMove(o)">{{ o.label }}</button>
                </template>
              </div>
              <p class="mt-1 text-[10px] opacity-50">狙う手は当たったものとして次へ進む。外れた時の手は ② で決める</p>
            </div>
          </div>
        </div>
      </template>

      <!-- ② 外れを埋める (狙う手) -->
      <template v-else-if="moves[sel]?.aim && shapes[sel]">
        <p class="mb-1.5 text-[13px] font-bold text-amber-100">{{ sel + 1 }} 手目 · 外れを埋める <span class="text-[11px] font-normal opacity-60">{{ aimLabel(moves[sel]!.aim!) }}</span></p>
        <StageOutcomeTree v-bind="shapes[sel]!.props" :sets="sets" use-shelf auto :locked="locked" @change="(pol) => setShapes(sel!, pol)" />
      </template>

      <!-- 打つだけの手 -->
      <template v-else-if="moves[sel]">
        <p class="mb-1.5 text-[13px] font-bold">{{ sel + 1 }} 手目 · 打つだけ <span class="text-[11px] font-normal opacity-60">外れは無い (打って次の手へ)</span></p>
        <div class="flex gap-3">
          <div><p class="mb-1 text-center text-[11px] opacity-60">打つ前</p><StageItemCard v-if="items[sel]" :item="items[sel]!" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="240" compact /></div>
          <div><p class="mb-1 text-center text-[11px] opacity-60">打った後 (例)</p><StageItemCard v-if="items[sel + 1]" :item="items[sel + 1]!" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="240" compact /></div>
        </div>
      </template>
    </div>
  </div>
</template>
