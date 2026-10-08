<!--
  StageOutcomeTree.vue — 打って決める (2026-10-09 オーナー「手打ちみたいな挙動にしたらいい。打って、外れたパターンの時は消去を打つ、を記録。
  全パターン取り終えたら完成」「その場の選択でいい、何パターンあるかだけ出しておけば」「これ極めるしかない、こっちの方が楽しい」)。

  狙いの側の今の形 (狙い・狙い以外・空き) を枠で見せ、打つ物を選んで「どうなったか」を選ぶ。新しい形に来たらそこで次に打つ物を決める。
  同じ形にまた来たら前に決めた手を使う (形の決まり = recipe-sim の policy、キー `${h}-${j}`。計算は shape-table.ts)。
  全部の形を決めるまでこの手にできない (StagePatternEditor が shapesLeft で見る)
-->
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { iconOf, nameOf } from "../../state/craft-stage";
import type { PatternSet, PolicyAct } from "../../services/craft-stage/pattern";
import CurrencyShelf from "./CurrencyShelf.vue";
import ShelfButton from "./ShelfButton.vue";
import { OMEN_FOR } from "../../services/craft-stage/omens";
import { provideShelf, simHidden } from "../../state/shelf-context";
import { applyCurrency, kindOf, omensFor } from "../../services/craft-stage/apply-currency";
import { mulberry32 } from "../../services/htc/rng";
import { craftStage } from "../../state/craft-stage";
import StageItemCard from "./StageItemCard.vue";
import type { StageItem, StageMod } from "../../services/craft-stage/types";
import { GREATER, keyOfShape, reachableShapes, setOf, shapeDone, shapeOf, shapeOutcomes, sideOmenOf, useKey, type Shape, type ShapeCtx, type ShapeOut } from "../../services/craft-stage/shape-table";

const props = defineProps<{
  /** この手の打つ物 */
  set: PatternSet;
  side: "prefix" | "suffix";
  limit: number;
  need: number;
  /** 打つ前の狙い・狙い以外 */
  h0: number;
  j0: number;
  policy: Record<string, PolicyAct>;
  sets: readonly PatternSet[];
  pHit?: (currency: string, h: number) => number | null;
  otherRemovable?: number;
  steps?: Array<{ n: number; label: string }>;
  /** 反対の側に前の手の狙いがある時の数 (形のキーに入れる) と、反対の側の枠・固定の数 */
  otherHits?: number;
  otherLimit?: number;
  otherFixed?: number;
  /** 狙いの MOD か (札の反対の側で、前の手の狙いと狙い以外を分ける) */
  isTarget?: (modId: string) => boolean;
  /** この手を打つ前のアイテム (形に合わせて狙いの側の MOD を並べ替えて見せる) */
  baseItem?: StageItem | null;
  /**
   * どんどん進む: 打つ物を選んだら記録して、次の決めていない形へ自動で進む (結果を選ばない)
   * (2026-10-09 オーナー「打ったらどんどんパターン更新していってほしい、選んでポチポチはだるい」)
   */
  auto?: boolean;
  /** 打つ物を手打ちと同じ棚から選ぶ (打って作るパターン)。無ければ高貴・消去・カオスの札 */
  useShelf?: boolean;
  /** 1 MOD 残し消去で戻る手 (スパムの手)。あれば「⟲ 1 MOD 残し消去 → N 手目」を出す */
  backTo?: { to: number; label: string } | null;
  /** 付かなかったらの札 (形の手で「付かなかったらの札で」を選んだ時の動き) */
  fallback?: string;
  locked?: boolean;
}>();
const emit = defineEmits<{ change: [policy: Record<string, PolicyAct>] }>();

const ctx = computed<ShapeCtx>(() => ({ side: props.side, limit: props.limit, need: props.need, otherRemovable: props.otherRemovable ?? 0, ...(props.otherHits != null ? { otherHits: props.otherHits } : {}), ...(props.otherLimit != null ? { otherLimit: props.otherLimit } : {}), ...(props.otherFixed != null ? { otherFixed: props.otherFixed } : {}), pHit: props.pHit, sets: props.sets }));
const SIDE_JA = computed(() => (props.side === "prefix" ? "プレ" : "サフィ"));
const L = computed(() => (props.side === "prefix" ? "左" : "右"));

type K = "exalt" | "annul" | "chaos";
const KINDS: Array<{ k: K; ja: string; icon: string }> = [{ k: "exalt", ja: "高貴", icon: "exalt" }, { k: "annul", ja: "消去", icon: "annul" }, { k: "chaos", ja: "カオス", icon: "chaos" }];
const STRENGTHS: Record<K, Array<{ c: string; ja: string }>> = {
  exalt: [{ c: "exalt", ja: "無印" }, { c: "exalt_greater", ja: "上級" }, { c: "exalt_perfect", ja: "完全" }],
  annul: [],
  chaos: [{ c: "chaos", ja: "無印" }, { c: "chaos_greater", ja: "上級" }, { c: "chaos_perfect", ja: "完全" }],
};
/** 付け外しできるお告げ (狙いの側のお告げと、側に関係ない物)。反対の側のお告げは狙いの側の形が変わらないので出さない */
const omenOpts = (k: K): Array<{ o: string; ja: string }> => (k === "exalt" ? [{ o: sideOmenOf(props.side, "exalt"), ja: L.value }, { o: GREATER, ja: "偉大" }, { o: "OmenofCatalysingExaltation", ja: "触媒" }] : k === "annul" ? [{ o: sideOmenOf(props.side, "annul"), ja: L.value }] : [{ o: sideOmenOf(props.side, "chaos"), ja: L.value }, { o: "OmenofWhittling", ja: "削減" }]);
const find = (kind: string, currency: string, omens: readonly string[]): PatternSet | undefined => props.sets.find((x) => x.kind === kind && x.currency === currency && x.omens.length === omens.length && omens.every((o) => x.omens.includes(o)));
/** 種類を選んだ時の最初の形 (高貴は完全 + 側、消去は素、カオスは無印) */
const firstOf = (k: K): PatternSet | undefined => (k === "exalt" ? find("exalt", "exalt_perfect", [sideOmenOf(props.side, "exalt")]) ?? find("exalt", "exalt", []) : k === "annul" ? find("annul", "annul", []) ?? find("annul", "annul", [sideOmenOf(props.side, "annul")]) : find("chaos", "chaos", []));
const OMEN_JA: Record<string, string> = { OmenofSinistralExaltation: "左", OmenofDextralExaltation: "右", OmenofSinistralAnnulment: "左", OmenofDextralAnnulment: "右", OmenofSinistralErasure: "左", OmenofDextralErasure: "右", OmenofGreaterExaltation: "偉大", OmenofCatalysingExaltation: "触媒", OmenofWhittling: "削減", OmenofLight: "光" };
const CUR_JA: Record<string, string> = { exalt: "高貴", exalt_greater: "上級高貴", exalt_perfect: "完全高貴", chaos: "カオス", chaos_greater: "上級カオス", chaos_perfect: "完全カオス", annul: "消去" };
/** 打つ物の短い名前 (完全高貴 偉大 左 など) */
const labelOf = (x: PatternSet): string => [CUR_JA[x.currency] ?? nameOf(x.currency), ...[...x.omens].sort((a, b) => (OMEN_JA[a] === L.value ? 1 : 0) - (OMEN_JA[b] === L.value ? 1 : 0)).map((o) => OMEN_JA[o] ?? nameOf(o))].join(" ");
const iconsOf = (x: PatternSet): string[] => [x.currency, ...x.omens].filter((i) => !!iconOf(i));
/** その形で打てない理由 (打てない物は薄く) */
function whyNot(x: PatternSet, h: number, j: number): string | null {
  if (x.kind === "exalt" && h + j >= props.limit) return `${SIDE_JA.value}が満杯`;
  if ((x.kind === "annul" || x.kind === "chaos") && h + j === 0) return "消せる物が無い";
  return null;
}

function setAct(key: string, act: PolicyAct | null): void {
  const next = { ...props.policy };
  if (act) next[key] = act; else delete next[key];
  emit("change", next);
}
/** 今の形の打つ物を変える (種類・強さ・お告げの付け外し)。組み合わせの無い物は変えない */
function pick(k: K, currency?: string, toggle?: string): void {
  const key = atKey.value;
  const cur = actSet.value;
  const base = cur && cur.kind === k ? cur : null;
  if (!base) { const f = firstOf(k); if (f) setAct(key, { set: f.key }); return; }
  const om = toggle ? (base.omens.includes(toggle) ? base.omens.filter((o) => o !== toggle) : [...base.omens, toggle]) : [...base.omens];
  const x = find(k, currency ?? base.currency, om);
  if (x) setAct(key, { set: x.key });
}

// ── 打っている場所 ─────────────────────────────────────
type At = Shape & { start: boolean };
/** 打つ前の形 (この手の始め) */
const startAt = (): At => ({ ...shapeOf(ctx.value, props.h0, props.j0), start: true });
/** 今の形。start = この手を打つ前 (打つ物はこの手で決まっている) */
const at = ref<At>(startAt());
/** 前に決めた手を変えている */
const editing = ref(false);
/** 1 つ戻す用 */
const trail = ref<At[]>([]);
watch(() => [props.h0, props.j0, props.set.key], () => { at.value = startAt(); trail.value = []; editing.value = false; lastNote.value = null; if (props.auto) void nextTick(autoNext); });

const atKey = computed(() => keyOfShape(at.value));
const done = computed(() => !at.value.start && shapeDone(ctx.value, at.value));
const isDone = (s: Shape): boolean => shapeDone(ctx.value, s);
const act = computed<PolicyAct | undefined>(() => (at.value.start ? undefined : props.policy[atKey.value]));
const actSet = computed<PatternSet | undefined>(() => (act.value?.set ? setOf(props.sets, act.value.set) : undefined));
/** 今打つ物 (この手の打つ物 / この形で決めた物) */
const firing = computed<PatternSet | undefined>(() => (at.value.start ? props.set : done.value ? undefined : actSet.value));
/** 今の形の情報 (来る道)。打つ前はこの手の始め */
const here = computed(() => (at.value.start ? null : reach.value.find((r) => keyOfShape(r) === atKey.value) ?? null));
/** 反対の側の消せる数 (前の手の狙い + 狙い以外) */
const otherNow = computed(() => (at.value.g ?? 0) + at.value.o);
const outs = computed<ShapeOut[]>(() => (firing.value ? shapeOutcomes(ctx.value, firing.value, at.value) : []));
/** この形になる時 (一番近い道の例) */
const viaText = computed(() => {
  const v = here.value?.via;
  if (!v) return "";
  return v.from ? `${shapeText(v.from)} の時に ${labelOf(v.set)} を打って、${v.label}` : `この手の ${labelOf(v.set)} を打って、${v.label}`;
});
/** 決める形 (この手から来うる形) と、まだ決めていない形 */
const reach = computed(() => reachableShapes(ctx.value, props.set, props.h0, props.j0, props.policy));
const left = computed(() => reach.value.filter((r) => !props.policy[keyOfShape(r)]));
/** 今の形で打てる種類 / 打てない種類 (打てない物は畳む。2026-10-09 オーナー「使えないものはデフォで畳んでてくれ」) */
const kindOk = (k: K): boolean => !!firstOf(k) && !whyNot(firstOf(k)!, at.value.h, at.value.j);
const kindsNg = computed(() => KINDS.filter((kd) => !kindOk(kd.k)));
const ngOpen = ref(false);
const showPicker = computed(() => !props.locked && !at.value.start && !done.value && (!act.value || editing.value));

const asAt = (s: Shape, start = false): At => ({ h: s.h, j: s.j, ...(s.g != null ? { g: s.g } : {}), o: s.o, start });
function go(s: Shape, start = false): void {
  trail.value = [...trail.value.slice(-49), at.value];
  at.value = asAt(s, start);
  editing.value = false;
}
function goStart(): void { go(startAt(), true); }
function choose(o: ShapeOut): void { go(o); }
function back(): void {
  const p = trail.value[trail.value.length - 1];
  if (!p) return;
  trail.value = trail.value.slice(0, -1);
  at.value = p;
  editing.value = false;
}
function nextLeft(): void { const r = left.value[0]; if (r) go(r); }
/** 直前に決めた形 (どんどん進む時に、その手の結果を小さく出す) */
const lastNote = ref<{ shape: string; label: string; outs: ShapeOut[] } | null>(null);
/** どんどん進む: 次の決めていない形へ (無ければ揃った形の所で止まる) */
function autoNext(): void {
  const r = left.value[0];
  if (r) { at.value = asAt(r); editing.value = false; }
}
function decided(): void {
  if (!props.auto) return;
  const x = actSet.value;
  lastNote.value = { shape: shapeText(at.value), label: x ? labelOf(x) : thenText(act.value), outs: x ? shapeOutcomes(ctx.value, x, at.value) : [] };
  trail.value = [...trail.value.slice(-49), at.value];
  void nextTick(autoNext);
}
function thenAct(a: PolicyAct): void { setAct(atKey.value, a); editing.value = false; void nextTick(decided); }
onMounted(() => { if (props.auto) autoNext(); });

const OTHER_JA = computed(() => (props.side === "prefix" ? "サフィ" : "プレ"));
/** 形の文 (反対の側に前の手の狙いがある時は、その数も) */
const shapeText = (s: Shape): string => `狙い ${s.h} · 狙い以外 ${s.j} · 空き ${Math.max(0, props.limit - s.h - s.j)}${s.g != null ? ` (${OTHER_JA.value}の狙い ${s.g})` : ""}`;
const pct = (p: number | null): string => (p == null ? "" : p >= 0.995 ? "100%" : p < 0.005 ? "1% 未満" : `${Math.round(p * 100)}%`);
const thenText = (a: PolicyAct | undefined): string => (!a ? "" : a.then === "next" ? "次の手へ" : a.then === "restart" ? "新しいベースで最初から" : a.then === "miss" ? (props.fallback ?? "付かなかったらの札") : a.then === "reset" ? `1 MOD 残し消去 → ${(a.goto ?? 0) + 1} 手目へ` : a.then === "goto" ? `${(a.goto ?? 0) + 1} 手目へ` : "");
const ruleText = (a: PolicyAct | undefined): string => { if (!a) return "未定"; const x = a.set ? setOf(props.sets, a.set) : undefined; return x ? `${labelOf(x)} を打つ` : thenText(a); };
/**
 * 今の形のアイテム: 打つ前のアイテムの狙いの側を、狙い h 行 (どれか 1 MOD …) + 狙い以外 j 行に並べ替えた物。
 * 反対の側は、固定 + 前の手の狙い g 行 + 消せる狙い以外 o 行 (この形に来た時の数)
 */
const shapeItem = computed<StageItem | null>(() => {
  const b = props.baseItem;
  if (!b) return null;
  const key = props.side === "prefix" ? "prefixes" : "suffixes";
  const list = b[key];
  const tmpl: StageMod | undefined = list.find((m) => !m.fractured && /^どれか/.test(m.textJa)) ?? list.find((m) => !m.fractured) ?? b.prefixes.concat(b.suffixes).find((m) => !m.fractured);
  if (!tmpl) return null;
  const hitText = /^どれか/.test(tmpl.textJa) ? tmpl.textJa : "狙いの MOD";
  const junkOf = (side: "prefix" | "suffix", k: number): StageMod => ({ ...tmpl, side, modId: `junk#${side}${k}`, textJa: "狙い以外の MOD", textEn: "", tierName: "", affix: "", tags: [], values: [], ranges: [], fractured: false, desecrated: false });
  const hits = Array.from({ length: Math.min(at.value.h, props.limit) }, (_, k): StageMod => ({ ...tmpl, side: props.side, modId: `${tmpl.modId}#h${k}`, textJa: hitText, fractured: false, desecrated: false }));
  const junk = Array.from({ length: Math.min(at.value.j, props.limit) }, (_, k) => junkOf(props.side, k));
  const okey = key === "prefixes" ? "suffixes" : "prefixes";
  const oside = props.side === "prefix" ? "suffix" : "prefix";
  const olist = b[okey];
  const isT = (m: StageMod): boolean => !!props.isTarget?.(m.modId);
  const oHits = olist.filter((m) => !m.fractured && isT(m));
  const oJunk = olist.filter((m) => !m.fractured && !isT(m));
  const g = at.value.g, o = at.value.o;
  // 前の手の狙いを数えない時は、反対の側の消せる物を前から o 個
  const others = g == null
    ? olist.filter((m) => !m.fractured).slice(0, o)
    : [...oHits.slice(0, g), ...oJunk.slice(0, o), ...Array.from({ length: Math.max(0, o - oJunk.length) }, (_, k) => junkOf(oside, k))];
  return { ...b, rarity: "rare", [key]: [...list.filter((m) => m.fractured), ...hits, ...junk], [okey]: [...olist.filter((m) => m.fractured), ...others] };
});
// 棚 (手打ちと同じ部品) は今の形のアイテムで「打てる物」を見る。持つ = この形で打つ物に決める
const shelfOmens = ref<string[]>([]);
const shelfHeld = ref<string | null>(null);
provideShelf({
  data: craftStage.data, item: shapeItem as unknown as import("vue").Ref<StageItem | null>, omens: shelfOmens, held: shelfHeld,
  usable: (k) => { const d = craftStage.data.value, it = shapeItem.value; if (!d || !it) return "準備中"; const r = applyCurrency(d, it, k, mulberry32(0), shelfOmens.value); return r.applied ? null : (r.reason ?? "打てない"); },
  toggleOmen: (id) => { shelfOmens.value = shelfOmens.value.includes(id) ? shelfOmens.value.filter((o) => o !== id) : [...shelfOmens.value, id]; },
  hidden: simHidden,
});
/** 持った物に掛けられるお告げ (手打ちと同じ、エンジンの決まり OMEN_FOR) */
const heldOmens = computed(() => { if (!shelfHeld.value) return []; const k = kindOf(shelfHeld.value); return [...(OMEN_FOR[k] ?? []), ...(k === "desecrate" ? OMEN_FOR.reveal ?? [] : [])]; });
function toggleShelfOmen(id: string): void { shelfOmens.value = shelfOmens.value.includes(id) ? shelfOmens.value.filter((o) => o !== id) : [...shelfOmens.value, id]; }
/** 持った物 + 掛けたお告げ (決める前の表示) */
const heldUse = computed(() => (shelfHeld.value ? setOf(props.sets, useKey(shelfHeld.value, omensFor(shelfHeld.value, shelfOmens.value))) : undefined));
/** 持つ: お告げが掛けられる物は、お告げを選んでから「決める」。掛けられない物 (品質など) はそのまま決まって次の形へ */
function holdShelf(key: string): void {
  shelfHeld.value = key;
  if (!heldOmens.value.length) confirmHeld();
}
function confirmHeld(): void {
  const k = shelfHeld.value;
  if (!k) return;
  setAct(atKey.value, { set: useKey(k, omensFor(k, shelfOmens.value)) });
  shelfHeld.value = null;
  void nextTick(decided);
}
/** 枠の絵 (狙い・狙い以外・空き) */
const slots = computed(() => [...Array(Math.min(at.value.h, props.limit)).fill("h"), ...Array(Math.min(at.value.j, props.limit)).fill("j"), ...Array(Math.max(0, props.limit - at.value.h - at.value.j)).fill("f")] as Array<"h" | "j" | "f">);
</script>

<template>
  <div class="text-[12px]">
    <div class="mb-1.5 flex flex-wrap items-center gap-2">
      <b class="text-sky-100">打って決める</b>
      <span v-if="reach.length" class="rounded-full px-2 py-0.5 text-[11px] font-bold" :class="left.length ? 'bg-amber-500/20 text-amber-100' : 'bg-emerald-500/20 text-emerald-100'">{{ left.length ? `パターン ${reach.length - left.length} / ${reach.length} 決めた` : `全部決めた ✓ ${reach.length} パターン` }}</span>
      <span class="ml-auto flex gap-1 text-[11px]">
        <button type="button" class="rounded border border-white/15 px-1.5 py-0.5 disabled:opacity-30" :disabled="!trail.length" title="1 つ前の形に戻る" @click="back">↶ 1 つ戻す</button>
        <button type="button" class="rounded border border-white/15 px-1.5 py-0.5" @click="goStart">最初から打つ</button>
      </span>
    </div>

    <!-- このパターンの時: アイテムの上に形、右でカレンシーを選ぶ (2026-10-09 オーナー「このパターンの時みたいな感じでアイテムの上にだして、そこでカレンシー選べばいい」「ほぼ画面は手で打つと変わらん」) -->
    <div class="rounded-lg border px-3 py-2" :class="done ? 'border-emerald-400/50 bg-emerald-950/20' : 'border-white/15 bg-black/30'">
      <p class="mb-1.5 font-bold" :class="done ? 'text-emerald-100' : 'text-amber-100'">{{ at.start ? "この手を打つ前" : done ? "揃った" : "このパターンの時" }} <span class="ml-1 text-[11px] font-normal opacity-60">{{ SIDE_JA }}: {{ shapeText(at) }}{{ otherNow === 0 ? ` · ${side === "prefix" ? "サフィ" : "プレ"}は固定だけ` : "" }}</span></p>
      <p v-if="viaText" class="-mt-1 mb-1.5 text-[11px] text-sky-200/80">この形になる時: {{ viaText }}</p>
      <div class="flex gap-3 max-md:flex-col">
      <div v-if="shapeItem" class="shrink-0 max-md:mx-auto"><StageItemCard :item="shapeItem" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="250" compact /></div>
      <div v-else class="flex flex-wrap items-center gap-2">
        <span v-for="(s, k) in slots" :key="k" class="grid h-7 w-20 place-items-center rounded border text-[11px]" :class="s === 'h' ? 'border-emerald-400/70 bg-emerald-500/20 text-emerald-100' : s === 'j' ? 'border-rose-400/50 bg-rose-500/10 text-rose-100' : 'border-dashed border-white/20 opacity-50'">{{ s === "h" ? "狙い" : s === "j" ? "狙い以外" : "空き" }}</span>
      </div>
      <div class="min-w-0 flex-1">
      <!-- 打つ物 -->
      <div>
        <p v-if="at.start" class="flex flex-wrap items-center gap-1">この手: <img v-for="ic in iconsOf(set)" :key="ic" :src="iconOf(ic)" alt="" class="h-5 w-5 object-contain" /><b>{{ labelOf(set) }}</b> を打つ</p>
        <p v-else-if="done" class="font-bold text-emerald-200">✓ 揃った → 次の手</p>
        <p v-else-if="act && !editing" class="flex flex-wrap items-center gap-1">
          <span class="opacity-60">前に決めた:</span>
          <template v-if="actSet"><img v-for="ic in iconsOf(actSet)" :key="ic" :src="iconOf(ic)" alt="" class="h-5 w-5 object-contain" /><b>{{ labelOf(actSet) }}</b> を打つ</template>
          <b v-else class="text-sky-200">{{ thenText(act) }}</b>
          <button v-if="!locked" type="button" class="ml-2 text-[11px] opacity-60 hover:opacity-100" @click="editing = true">変える</button>
        </p>
        <p v-else-if="!locked" class="font-bold text-amber-100">この形で何を打つ？</p>
      </div>

      <!-- 選ぶ (新しい形 / 変える) -->
      <div v-if="showPicker && useShelf" class="mt-1.5">
        <CurrencyShelf @hold="holdShelf">
            <template v-if="heldOmens.length" #held>
              <div class="rounded-lg border border-violet-400/25 bg-violet-500/[0.06] p-2">
                <p class="mb-1 text-[11px] text-violet-200/80">{{ nameOf(shelfHeld ?? "") }} に掛けられるお告げ (押すと掛ける / 外す)</p>
                <div class="flex flex-wrap gap-1.5"><ShelfButton v-for="k in heldOmens" :key="k" :k="k" omen @pick="toggleShelfOmen($event)" /></div>
              </div>
            </template>
        </CurrencyShelf>
        <div v-if="heldUse" class="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg border border-sky-400/40 bg-sky-950/20 px-2 py-1">
          <img v-for="ic in iconsOf(heldUse)" :key="ic" :src="iconOf(ic)" alt="" class="h-5 w-5 object-contain" /><b>{{ labelOf(heldUse) }}</b> を打つ
          <button type="button" class="ml-auto rounded-lg border border-amber-400/60 bg-amber-500/20 px-3 py-0.5 font-bold text-amber-100" @click="confirmHeld">決める →</button>
        </div>
        <div class="mt-1.5 flex flex-wrap items-center gap-1">
          <span class="text-[11px] opacity-60">ほか:</span>
          <button type="button" class="rounded-lg border px-2 py-1 max-md:min-h-10" :class="act?.then === 'next' ? 'border-sky-300 bg-sky-500/20 text-sky-50' : 'border-white/15'" @click="thenAct({ then: 'next' })">→ 次の手</button>
          <button v-if="backTo" type="button" class="rounded-lg border px-2 py-1 max-md:min-h-10" :class="act?.then === 'reset' ? 'border-orange-300 bg-orange-500/20 text-orange-50' : 'border-white/15'" @click="thenAct({ then: 'reset', goto: backTo.to })">⟲ 1 MOD 残し消去 ({{ backTo.label }})</button>
          <button type="button" class="rounded-lg border px-2 py-1 max-md:min-h-10" :class="act?.then === 'restart' ? 'border-orange-300 bg-orange-500/20 text-orange-50' : 'border-white/15'" @click="thenAct({ then: 'restart' })">⟲ 新しいベースで最初から</button>
        </div>
      </div>
      <div v-else-if="showPicker" class="mt-1.5 flex flex-wrap items-center gap-1">
        <button v-for="kd in KINDS.filter((x) => kindOk(x.k))" :key="kd.k" type="button" class="flex items-center gap-1 rounded-lg border px-2 py-1 max-md:min-h-10" :class="actSet?.kind === kd.k ? 'border-sky-300 bg-sky-500/20 text-sky-50' : 'border-white/15 hover:border-white/40'" @click="pick(kd.k)">
          <img v-if="iconOf(kd.icon)" :src="iconOf(kd.icon)" alt="" class="h-5 w-5 object-contain" />{{ kd.ja }}
        </button>
        <template v-if="actSet && (['exalt', 'annul', 'chaos'] as const).includes(actSet.kind as K)">
          <span class="mx-1 opacity-30">|</span>
          <button v-for="st in STRENGTHS[actSet.kind as K].filter((x) => find(actSet!.kind, x.c, actSet!.omens))" :key="st.c" type="button" class="rounded border px-1.5 py-0.5 text-[11px]" :class="actSet.currency === st.c ? 'border-amber-300 bg-amber-500/15' : 'border-white/10'" @click="pick(actSet.kind as K, st.c)">{{ st.ja }}</button>
          <button v-for="om in omenOpts(actSet.kind as K).filter((x) => find(actSet!.kind, actSet!.currency, actSet!.omens.includes(x.o) ? actSet!.omens.filter((o) => o !== x.o) : [...actSet!.omens, x.o]))" :key="om.o" type="button" class="flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[11px]" :class="actSet.omens.includes(om.o) ? 'border-orange-300 bg-orange-500/15' : 'border-white/10'" @click="pick(actSet.kind as K, undefined, om.o)"><img v-if="iconOf(om.o)" :src="iconOf(om.o)" alt="" class="h-3.5 w-3.5 object-contain" />{{ om.ja }}</button>
        </template>
        <button v-if="kindsNg.length" type="button" class="text-[10px] opacity-40 hover:opacity-80" @click="ngOpen = !ngOpen">打てない物 {{ kindsNg.length }} {{ ngOpen ? "▴" : "▸" }}</button>
        <span v-if="ngOpen" class="flex gap-1 text-[10px] opacity-40"><span v-for="kd in kindsNg" :key="kd.k">{{ kd.ja }} ({{ firstOf(kd.k) ? whyNot(firstOf(kd.k)!, at.h, at.j) : "無い" }})</span></span>
        <span class="basis-full"></span>
        <button type="button" class="rounded-lg border px-2 py-1 max-md:min-h-10" :class="act?.then === 'next' ? 'border-sky-300 bg-sky-500/20 text-sky-50' : 'border-white/15'" @click="thenAct({ then: 'next' })">→ 次の手</button>
        <button v-if="fallback" type="button" class="rounded-lg border px-2 py-1 max-md:min-h-10" :class="act?.then === 'miss' ? 'border-orange-300 bg-orange-500/20 text-orange-50' : 'border-white/15'" :title="fallback" @click="thenAct({ then: 'miss' })">⟲ {{ fallback ?? "付かなかったらの札" }}</button>
      </div>

      <!-- どんどん進む: 直前に決めた形とその結果 -->
      <div v-if="auto && lastNote" class="mt-2 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[11px]">
        <span class="opacity-60">直前: {{ lastNote.shape }} の時 → </span><b>{{ lastNote.label }}</b>
        <span v-for="o in lastNote.outs" :key="keyOfShape(o)" class="ml-2 opacity-70">{{ pct(o.p) }} {{ o.label }}{{ isDone(o) ? " ✓" : "" }}</span>
      </div>
      <!-- どうなった？ -->
      <div v-if="firing && outs.length && !(auto && !at.start && act && !editing)" class="mt-2">
        <p class="mb-1 text-[11px] opacity-60">どうなった？</p>
        <div class="flex flex-col gap-1">
          <button v-for="o in outs" :key="keyOfShape(o)" type="button" class="flex items-center gap-2 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-left hover:border-sky-300/60" @click="choose(o)">
            <span class="w-12 shrink-0 whitespace-nowrap text-right tabular-nums opacity-70">{{ pct(o.p) }}</span>
            <b>{{ o.label }}</b>
            <span class="opacity-60">→ {{ isDone(o) ? "✓ 揃った" : shapeText(o) }}</span>
            <span v-if="!isDone(o)" class="ml-auto text-[11px]" :class="policy[keyOfShape(o)] ? 'text-sky-200/80' : 'text-amber-200'">{{ policy[keyOfShape(o)] ? "決めた形" : "まだ決めていない" }}</span>
          </button>
        </div>
      </div>
      <p v-else-if="firing && !outs.length" class="mt-2 text-[11px] text-rose-200">ここでは打てない ({{ whyNot(firing, at.h, at.j) }})</p>

      <div v-if="left.length && (done || (act && !editing && !firing))" class="mt-2">
        <button type="button" class="rounded-lg border border-amber-400/60 bg-amber-500/15 px-3 py-1 font-bold text-amber-100" @click="nextLeft">まだ決めていない形へ → ({{ shapeText(left[0]!) }})</button>
      </div>
      </div>
      </div>
    </div>

    <!-- 決めた手 (文で全部)。押すとその形へ -->
    <div v-if="reach.length" class="mt-2">
      <p class="mb-0.5 text-[11px] opacity-60">決めた手</p>
      <div class="flex flex-col gap-0.5">
        <button v-for="r in reach" :key="keyOfShape(r)" type="button" class="flex gap-2 rounded px-1.5 py-0.5 text-left hover:bg-white/5" :class="!at.start && keyOfShape(at) === keyOfShape(r) ? 'bg-sky-500/10' : ''" @click="go(r)">
          <span class="tabular-nums opacity-70">{{ shapeText(r) }} の時</span>
          <span :class="policy[keyOfShape(r)] ? '' : 'text-amber-200'">→ {{ ruleText(policy[keyOfShape(r)]) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
