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
import HelpTip from "../../components/ui/HelpTip.vue";
import Icon from "../../components/ui/Icon.vue";
import type { StageItem, StageMod } from "../../services/craft-stage/types";
import { GREATER, changesShape, keyOfShape, reachableShapes, setOf, shapeDone, shapeOf, shapeOutcomes, sideOmenOf, useKey, type Shape, type ShapeCtx, type ShapeOut } from "../../services/craft-stage/shape-table";

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
  /** 付く MOD が決まっている物 (エッセンス) の側と、それが狙いか */
  fixedAdd?: (currency: string) => { side: "prefix" | "suffix"; hit: boolean } | null;
  /** この手の狙いの MOD の行 (札の狙いの行に使う。無ければ打つ前のアイテムの狙いの側から) */
  hitMods?: StageMod[];
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

const ctx = computed<ShapeCtx>(() => ({ side: props.side, limit: props.limit, need: props.need, otherRemovable: props.otherRemovable ?? 0, ...(props.otherHits != null ? { otherHits: props.otherHits } : {}), ...(props.otherLimit != null ? { otherLimit: props.otherLimit } : {}), ...(props.otherFixed != null ? { otherFixed: props.otherFixed } : {}), ...(props.fixedAdd ? { fixedAdd: props.fixedAdd } : {}), pHit: props.pHit, sets: props.sets }));
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
/** この形になる時 (一番近い道の例)。前の形 → 打つ物 → 起きたこと の札で (2026-10-09 レビュー: 文より札) */
const viaParts = computed((): string[] => {
  const v = here.value?.via;
  if (!v) return [];
  return [v.from ? shapeText(v.from) : "この手の始め", labelOf(v.set), v.label];
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
/** 形の文 (初見レビュー: 短く。狙い = 狙う MOD、ほか = それ以外、空き = 残りの枠) */
const shapeText = (s: Shape): string => `狙い ${s.h} · ほか ${s.j} · 空き ${Math.max(0, props.limit - s.h - s.j)}${s.g != null ? ` (${OTHER_JA.value}の狙い ${s.g})` : ""}`;
const pct = (p: number | null): string => (p == null ? "" : p >= 0.995 ? "100%" : p < 0.005 ? "1% 未満" : `${Math.round(p * 100)}%`);
const thenText = (a: PolicyAct | undefined): string => (!a ? "" : a.then === "next" ? "次の手へ" : a.then === "restart" ? "新しいベースで最初から" : a.then === "miss" ? (props.fallback ?? "付かなかったらの札") : a.then === "reset" ? `1 MOD 残し消去 → ${(a.goto ?? 0) + 1} 手目へ` : a.then === "goto" ? `${(a.goto ?? 0) + 1} 手目へ` : "");
const ruleText = (a: PolicyAct | undefined): string => { if (!a) return "未定"; const x = a.set ? setOf(props.sets, a.set) : undefined; return x ? `${preLabel(a.pre)}${labelOf(x)} を打つ` : thenText(a); };
/**
 * 今の形のアイテム: 打つ前のアイテムの狙いの側を、狙い h 行 (どれか 1 MOD …) + 狙い以外 j 行に並べ替えた物。
 * 反対の側は、固定 + 前の手の狙い g 行 + 消せる狙い以外 o 行 (この形に来た時の数)
 */
/** この手を打った後の品質 (触媒の高貴のお告げで品質が消える、など。外れの形の札に使う) */
const afterQ = computed(() => {
  const d = craftStage.data.value, b = props.baseItem;
  if (!d || !b) return null;
  const r = applyCurrency(d, b, props.set.currency, mulberry32(0), props.set.omens);
  return r.applied ? { quality: r.item.quality, qualityTag: r.item.qualityTag } : null;
});
function buildItem(at0: Shape, start = false): StageItem | null {
  const at = { value: at0 };
  const b0 = props.baseItem;
  const b = b0 && !start && afterQ.value ? { ...b0, ...afterQ.value } : b0;
  if (!b) return null;
  const key = props.side === "prefix" ? "prefixes" : "suffixes";
  const list = b[key];
  // 狙いの行は、この手の狙いの MOD から (側の違う狙いの文を借りない。2026-10-09 サフィにプレの「火 / 冷気」が出ていた)
  const hm = props.hitMods?.length ? props.hitMods : null;
  const tmpl: StageMod | undefined = hm?.[0] ?? list.find((m) => !m.fractured && /^どれか/.test(m.textJa)) ?? list.find((m) => !m.fractured) ?? b.prefixes.concat(b.suffixes).find((m) => !m.fractured);
  if (!tmpl) return null;
  const hitText = /^どれか/.test(tmpl.textJa) ? tmpl.textJa : hm ? tmpl.textJa : "狙いの MOD";
  const junkOf = (side: "prefix" | "suffix", k: number): StageMod => ({ ...tmpl, side, modId: `junk#${side}${k}`, textJa: "狙い以外の MOD", textEn: "", tierName: "", affix: "", tags: [], values: [], ranges: [], fractured: false, desecrated: false });
  // 狙いの側に今付いている狙いの MOD はそのまま、足りない分はこの手の狙いの行で
  const realHits = list.filter((m) => !m.fractured && (props.isTarget?.(m.modId) ?? false));
  const hits = Array.from({ length: Math.min(at.value.h, props.limit) }, (_, k): StageMod => realHits[k] ?? { ...(hm?.[k % hm.length] ?? tmpl), side: props.side, modId: `${(hm?.[k % hm.length] ?? tmpl).modId}#h${k}`, textJa: hm ? (hm[k % hm.length]!.textJa) : hitText, fractured: false, desecrated: false });
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
}
const shapeItem = computed<StageItem | null>(() => buildItem(at.value, at.value.start));
// 棚 (手打ちと同じ部品) は今の形のアイテムで「打てる物」を見る。持つ = この形で打つ物に決める
const shelfOmens = ref<string[]>([]);
const shelfHeld = ref<string | null>(null);
provideShelf({
  data: craftStage.data, item: shapeItem as unknown as import("vue").Ref<StageItem | null>, omens: shelfOmens, held: shelfHeld,
  usable: (k) => {
    const d = craftStage.data.value;
    let it = shapeItem.value;
    if (!d || !it) return "準備中";
    // 先に打つ物を打った後のアイテムで見る (触媒で品質を足してから触媒の高貴、など)
    for (const u of preList.value) { const x = setOf(props.sets, u); if (!x) continue; const r0 = applyCurrency(d, it, x.currency, mulberry32(0), x.omens); if (r0.applied) it = r0.item; }
    const r = applyCurrency(d, it, k, mulberry32(0), shelfOmens.value);
    return r.applied ? null : (r.reason ?? "打てない");
  },
  toggleOmen: (id) => { shelfOmens.value = shelfOmens.value.includes(id) ? shelfOmens.value.filter((o) => o !== id) : [...shelfOmens.value, id]; },
  hidden: simHidden,
});
/** 持った物に掛けられるお告げ (手打ちと同じ、エンジンの決まり OMEN_FOR) */
const heldOmens = computed(() => { if (!shelfHeld.value) return []; const k = kindOf(shelfHeld.value); return [...(OMEN_FOR[k] ?? []), ...(k === "desecrate" ? OMEN_FOR.reveal ?? [] : [])]; });
function toggleShelfOmen(id: string): void { shelfOmens.value = shelfOmens.value.includes(id) ? shelfOmens.value.filter((o) => o !== id) : [...shelfOmens.value, id]; }
/** 持った物 + 掛けたお告げ (決める前の表示) */
const heldUse = computed(() => (shelfHeld.value ? setOf(props.sets, useKey(shelfHeld.value, omensFor(shelfHeld.value, shelfOmens.value))) : undefined));
/**
 * 先に打つ物 (形を変えない物: 触媒・品質など)。持つと並べて、次に選んだ物と一緒に記録する
 * (2026-10-09 オーナー「触媒打ったら品質消えるから足す作業とかもまだ甘い」)
 */
const preList = ref<string[]>([]);
watch(atKey, () => { preList.value = []; });
/** 持つ: 形を変えない物は「先に打つ物」へ。お告げが掛けられる物は、お告げを選んでから「決める」。掛けられない物はそのまま決まって次の形へ */
function holdShelf(key: string): void {
  const u = useKey(key, omensFor(key, shelfOmens.value));
  if (!changesShape(setOf(props.sets, u)?.kind ?? "")) { preList.value = [...preList.value, u]; shelfHeld.value = null; return; }
  shelfHeld.value = key;
  if (!heldOmens.value.length) confirmHeld();
}
function confirmHeld(): void {
  const k = shelfHeld.value;
  if (!k) return;
  setAct(atKey.value, { set: useKey(k, omensFor(k, shelfOmens.value)), ...(preList.value.length ? { pre: [...preList.value] } : {}) });
  shelfHeld.value = null;
  preList.value = [];
  void nextTick(decided);
}
/** 形のアイテムで打てるか (先に打つ物を打ってから)。打てなければ理由 */
function whyCant(x: PatternSet, pre: readonly string[] | undefined, base: StageItem | null = shapeItem.value): string | null {
  const d = craftStage.data.value;
  let it = base;
  if (!d || !it) return null;
  for (const u of pre ?? []) { const y = setOf(props.sets, u); if (!y) continue; const r0 = applyCurrency(d, it, y.currency, mulberry32(0), y.omens); if (r0.applied) it = r0.item; }
  const r = applyCurrency(d, it, x.currency, mulberry32(0), x.omens);
  return r.applied ? null : (r.reason ?? "打てない");
}
/** 決めた手がこの形で打てない理由 (触媒の高貴で品質が無い、など) */
const actWhy = computed(() => (actSet.value && !at.value.start ? whyCant(actSet.value, act.value?.pre) : null));
/** 決めた手が、その形で打てない形 (触媒の高貴で品質が無い、など) */
const broken = computed(() => reach.value.filter((r) => { const a = props.policy[keyOfShape(r)]; const x = a?.set ? setOf(props.sets, a.set) : undefined; return !!x && !!whyCant(x, a?.pre, buildItem(r)); }));
const preLabel = (pre: readonly string[] | undefined): string => (pre?.length ? `${pre.map((u) => { const x = setOf(props.sets, u); return x ? labelOf(x) : u; }).join(" → ")} → ` : "");
/** 枠の絵 (狙い・狙い以外・空き) */
const slots = computed(() => [...Array(Math.min(at.value.h, props.limit)).fill("h"), ...Array(Math.min(at.value.j, props.limit)).fill("j"), ...Array(Math.max(0, props.limit - at.value.h - at.value.j)).fill("f")] as Array<"h" | "j" | "f">);
</script>

<template>
  <div class="flex flex-col gap-4 text-[13px] text-[var(--exile-color-text-primary)]">
    <!-- 上の帯: 進み具合と戻る -->
    <div class="flex flex-wrap items-center gap-2">
      <span v-if="reach.length" class="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold tabular-nums" :class="left.length ? 'bg-[rgba(224,201,122,0.12)] text-[var(--exile-color-signal-warn)]' : 'bg-[rgba(126,201,148,0.12)] text-[var(--exile-color-signal-up)]'">
        <Icon v-if="!left.length" name="check" class="size-3.5" />{{ left.length ? `${reach.length - left.length} / ${reach.length} 形を決めた` : `全部決めた · ${reach.length} 形` }}
      </span>
      <button v-if="broken.length" type="button" class="inline-flex h-7 items-center rounded-full bg-[rgba(229,128,107,0.14)] px-2.5 text-xs font-semibold text-[var(--exile-color-signal-down)]" title="押すとその形へ" @click="go(broken[0]!)">打てない手 {{ broken.length }}</button>
      <HelpTip v-if="useShelf" title="外れの手" :width="300">
        <p>狙う手を打って外れた時の「形」ごとに、次に打つ物を棚から選びます。選ぶと次の決めていない形へ進みます。</p>
        <p class="mt-1 text-[var(--exile-color-text-secondary)]">形 = 狙う側の 狙い (狙う MOD) · ほか (それ以外) · 空き (残りの枠) の数。同じ形なら同じ手を使います。</p>
      </HelpTip>
      <span class="ml-auto flex items-center gap-1">
        <button type="button" class="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[var(--exile-color-text-secondary)] transition hover:bg-white/5 hover:text-[var(--exile-color-text-primary)] disabled:opacity-30" :disabled="!trail.length" title="ひとつ前に見ていた形に戻る (決めた手は消えない)" @click="back"><Icon name="corner-up-left" class="size-4" />前の形へ</button>
        <button type="button" class="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[var(--exile-color-text-secondary)] transition hover:bg-white/5 hover:text-[var(--exile-color-text-primary)]" title="この手を打つ前の形に戻って見直す (決めた手は消えない)" @click="goStart"><Icon name="rotate" class="size-4" />この手を打つ前へ</button>
      </span>
    </div>

    <!-- この形の時: アイテムと、ここで打つ物 -->
    <section class="rounded-lg p-4" :class="done ? 'bg-[rgba(126,201,148,0.06)] ring-1 ring-[rgba(126,201,148,0.35)]' : 'bg-black/25'">
      <div class="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h5 class="text-[15px] font-semibold" :class="done ? 'text-[var(--exile-color-signal-up)]' : ''">{{ at.start ? "この手を打つ前" : done ? "揃った" : "この形の時" }}</h5>
        <span class="flex items-center gap-1 text-xs">
          <span class="text-[var(--exile-color-text-tertiary)]">{{ SIDE_JA }}</span>
          <span class="ml-1 text-[var(--exile-color-text-secondary)]">狙い <b class="tabular-nums text-[var(--color-rarity-magic)]">{{ at.h }}</b></span>
          <span class="text-[var(--exile-color-text-tertiary)]">·</span>
          <span class="text-[var(--exile-color-text-secondary)]">ほか <b class="tabular-nums text-[var(--exile-color-text-primary)]">{{ at.j }}</b></span>
          <span class="text-[var(--exile-color-text-tertiary)]">·</span>
          <span class="text-[var(--exile-color-text-secondary)]">空き <b class="tabular-nums text-[var(--exile-color-text-primary)]">{{ Math.max(0, limit - at.h - at.j) }}</b></span>
          <span v-if="at.g != null" class="ml-2 text-[var(--exile-color-text-secondary)]">{{ OTHER_JA }}の狙い <b class="tabular-nums text-[var(--color-rarity-magic)]">{{ at.g }}</b></span>
          <span v-if="otherNow === 0" class="ml-1 text-[var(--exile-color-text-tertiary)]">{{ OTHER_JA }}はフラクチャーだけ</span>
        </span>
      </div>
      <p v-if="viaParts.length" class="mb-3 flex flex-wrap items-center gap-1 text-xs text-[var(--exile-color-text-secondary)]">
        <span class="mr-1 text-[var(--exile-color-text-tertiary)]">なる時</span>
        <template v-for="(t, ti) in viaParts" :key="ti">
          <Icon v-if="ti" name="arrow-right" class="size-3.5 text-[var(--exile-color-text-tertiary)]" />
          <span class="rounded-full bg-white/[0.06] px-2 py-0.5" :class="ti === 1 ? 'text-[var(--exile-color-text-primary)]' : ''">{{ t }}</span>
        </template>
      </p>
      <div class="flex items-start gap-5 max-md:flex-col" :class="viaParts.length ? '' : 'mt-3'">
        <div v-if="shapeItem" class="shrink-0 max-md:mx-auto"><StageItemCard :item="shapeItem" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="250" compact /></div>
        <div v-else class="flex flex-wrap items-center gap-2">
          <span v-for="(s, k) in slots" :key="k" class="grid h-7 w-20 place-items-center rounded text-xs" :class="s === 'h' ? 'bg-[rgba(136,136,255,0.18)] text-[var(--color-rarity-magic)]' : s === 'j' ? 'bg-white/10 text-[var(--exile-color-text-secondary)]' : 'text-[var(--exile-color-text-tertiary)] ring-1 ring-inset ring-white/10'">{{ s === "h" ? "狙い" : s === "j" ? "ほか" : "空き" }}</span>
        </div>
        <div class="flex min-w-0 flex-1 flex-col gap-3">
          <!-- 打つ物 (この手 / 決めた手) -->
          <div v-if="at.start" class="flex flex-wrap items-center gap-2">
            <span class="text-xs text-[var(--exile-color-text-secondary)]">この手</span>
            <span class="flex items-center -space-x-1"><img v-for="ic in iconsOf(set)" :key="ic" :src="iconOf(ic)" alt="" class="size-6 object-contain" /></span>
            <b>{{ labelOf(set) }}</b>
          </div>
          <div v-else-if="done" class="flex items-center gap-2 font-semibold text-[var(--exile-color-signal-up)]"><Icon name="check" class="size-4" />揃った。次の手へ進む</div>
          <div v-else-if="act && !editing" class="flex flex-col gap-1.5 rounded-md bg-white/[0.04] px-3 py-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs text-[var(--exile-color-text-secondary)]">決めた手</span>
              <template v-if="actSet">
                <span v-if="act.pre?.length" class="text-[var(--exile-color-text-secondary)]">{{ preLabel(act.pre) }}</span>
                <span class="flex items-center -space-x-1"><img v-for="ic in iconsOf(actSet)" :key="ic" :src="iconOf(ic)" alt="" class="size-6 object-contain" /></span>
                <b>{{ labelOf(actSet) }}</b>
              </template>
              <b v-else class="text-[var(--exile-color-text-primary)]">{{ thenText(act) }}</b>
              <button v-if="!locked" type="button" class="ml-auto inline-flex h-7 items-center rounded-md px-2 text-xs text-[var(--exile-color-text-secondary)] hover:bg-white/5 hover:text-[var(--exile-color-text-primary)]" @click="editing = true">変える</button>
            </div>
            <p v-if="actWhy" class="text-xs font-semibold text-[var(--exile-color-signal-down)]">この形では打てない: {{ actWhy }}。先に打つ物 (触媒など) を足すか、変える</p>
          </div>
          <p v-else-if="!locked" class="text-[15px] font-semibold text-[var(--exile-color-accent-focus)]">ここで何を打つか</p>

          <!-- 選ぶ: 手打ちと同じ棚 -->
          <div v-if="showPicker && useShelf" class="flex flex-col gap-2.5">
            <!-- 先に打つ物 (触媒など) と、持った物の決定 -->
            <div v-if="preList.length" class="flex flex-wrap items-center gap-1.5 rounded-md bg-[rgba(90,62,107,0.14)] px-2.5 py-1.5 text-xs ring-1 ring-[rgba(150,110,180,0.3)]">
              <span class="text-[#c9b3dc]">先に打つ</span>
              <span v-for="(u, k) in preList" :key="k" class="inline-flex items-center gap-1 rounded bg-black/30 px-1.5 py-0.5"><img v-for="ic in (setOf(sets, u) ? iconsOf(setOf(sets, u)!) : [])" :key="ic" :src="iconOf(ic)" alt="" class="size-4 object-contain" />{{ setOf(sets, u) ? labelOf(setOf(sets, u)!) : u }}<button type="button" class="text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-signal-down)]" title="外す" @click="preList = preList.filter((_, n) => n !== k)"><Icon name="x" class="size-3" /></button></span>
              <span class="text-[var(--exile-color-text-tertiary)]">次に打つ物を選ぶ</span>
            </div>
            <div v-if="heldUse" class="flex flex-wrap items-center gap-2 rounded-md bg-[var(--exile-color-bg-elevated)] px-3 py-2 ring-1 ring-[var(--exile-color-border-brass)]">
              <span v-if="preList.length" class="text-[var(--exile-color-text-secondary)]">{{ preLabel(preList) }}</span>
              <span class="flex items-center -space-x-1"><img v-for="ic in iconsOf(heldUse)" :key="ic" :src="iconOf(ic)" alt="" class="size-6 object-contain" /></span>
              <b>{{ labelOf(heldUse) }}</b>
              <span class="text-xs text-[var(--exile-color-text-tertiary)]">お告げを選んで</span>
              <button type="button" class="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--exile-color-accent-focus)] px-3 text-[13px] font-semibold text-black transition hover:bg-[var(--exile-color-accent-focus-hover)]" @click="confirmHeld">これを打つ<Icon name="arrow-right" class="size-4" /></button>
            </div>
            <CurrencyShelf @hold="holdShelf">
              <template v-if="heldOmens.length" #held>
                <div class="rounded-lg bg-[rgba(90,62,107,0.14)] p-2.5 ring-1 ring-[rgba(150,110,180,0.35)]">
                  <p class="mb-1.5 text-xs text-[#c9b3dc]">{{ nameOf(shelfHeld ?? "") }} に掛けるお告げ</p>
                  <div class="flex flex-wrap gap-1.5"><ShelfButton v-for="k in heldOmens" :key="k" :k="k" omen @pick="toggleShelfOmen($event)" /></div>
                </div>
              </template>
            </CurrencyShelf>
            <!-- ほかの手 -->
            <div class="flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] pt-2.5">
              <span class="mr-1 text-[11px] font-medium tracking-wide text-[var(--exile-color-text-tertiary)]">ほかの手</span>
              <button type="button" class="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 transition" :class="act?.then === 'next' ? 'border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-elevated)]' : 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-text-primary)]'" title="この形のまま次の手へ進む" @click="thenAct({ then: 'next' })"><Icon name="arrow-right" class="size-4" />次の手へ</button>
              <button v-if="backTo" type="button" class="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 transition" :class="act?.then === 'reset' ? 'border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-elevated)]' : 'border-transparent text-[var(--exile-color-text-secondary)] hover:bg-white/5 hover:text-[var(--exile-color-text-primary)]'" :title="`消去で MOD を 1 つになるまで消して、${backTo.label}`" @click="thenAct({ then: 'reset', goto: backTo.to })"><Icon name="corner-up-left" class="size-4" />1 MOD 残し消去 ({{ backTo.label }})</button>
              <button type="button" class="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 transition" :class="act?.then === 'restart' ? 'border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-elevated)]' : 'border-transparent text-[var(--exile-color-text-secondary)] hover:bg-white/5 hover:text-[var(--exile-color-text-primary)]'" title="このアイテムは諦めて、新しいベースを用意して 1 手目から" @click="thenAct({ then: 'restart' })"><Icon name="rotate" class="size-4" />新しいベースで最初から</button>
              <!-- N 手目へ (2026-10-09 オーナー「●手へみたいな手順いるかもな」) -->
              <button v-for="st in steps ?? []" :key="st.n" type="button" class="inline-flex h-8 items-center gap-1 rounded-md border px-2 transition" :class="act?.then === 'goto' && act.goto === st.n ? 'border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-elevated)]' : 'border-transparent text-[var(--exile-color-text-secondary)] hover:bg-white/5 hover:text-[var(--exile-color-text-primary)]'" :title="`今のアイテムのまま ${st.label} に戻る`" @click="thenAct({ then: 'goto', goto: st.n })"><Icon name="corner-up-left" class="size-3.5" />{{ st.n + 1 }} 手目へ</button>
            </div>
          </div>
          <div v-else-if="showPicker" class="flex flex-wrap items-center gap-1.5">
            <button v-for="kd in KINDS.filter((x) => kindOk(x.k))" :key="kd.k" type="button" class="inline-flex h-8 items-center gap-1 rounded-md border px-2 transition" :class="actSet?.kind === kd.k ? 'border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-elevated)]' : 'border-[var(--exile-color-border-subtle)] hover:border-white/30'" @click="pick(kd.k)">
              <img v-if="iconOf(kd.icon)" :src="iconOf(kd.icon)" alt="" class="size-5 object-contain" />{{ kd.ja }}
            </button>
            <template v-if="actSet && (['exalt', 'annul', 'chaos'] as const).includes(actSet.kind as K)">
              <span class="mx-1 h-5 w-px bg-white/10"></span>
              <button v-for="st in STRENGTHS[actSet.kind as K].filter((x) => find(actSet!.kind, x.c, actSet!.omens))" :key="st.c" type="button" class="h-7 rounded-md border px-2 text-xs" :class="actSet.currency === st.c ? 'border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-elevated)]' : 'border-[var(--exile-color-border-subtle)]'" @click="pick(actSet.kind as K, st.c)">{{ st.ja }}</button>
              <button v-for="om in omenOpts(actSet.kind as K).filter((x) => find(actSet!.kind, actSet!.currency, actSet!.omens.includes(x.o) ? actSet!.omens.filter((o) => o !== x.o) : [...actSet!.omens, x.o]))" :key="om.o" type="button" class="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs" :class="actSet.omens.includes(om.o) ? 'border-[rgba(150,110,180,0.6)] bg-[rgba(90,62,107,0.25)]' : 'border-[var(--exile-color-border-subtle)]'" @click="pick(actSet.kind as K, undefined, om.o)"><img v-if="iconOf(om.o)" :src="iconOf(om.o)" alt="" class="size-3.5 object-contain" />{{ om.ja }}</button>
            </template>
            <button v-if="kindsNg.length" type="button" class="text-xs text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-text-secondary)]" @click="ngOpen = !ngOpen">打てない物 {{ kindsNg.length }}</button>
            <span v-if="ngOpen" class="flex gap-1 text-xs text-[var(--exile-color-text-tertiary)]"><span v-for="kd in kindsNg" :key="kd.k">{{ kd.ja }} ({{ firstOf(kd.k) ? whyNot(firstOf(kd.k)!, at.h, at.j) : "無い" }})</span></span>
            <span class="basis-full"></span>
            <button type="button" class="inline-flex h-8 items-center gap-1 rounded-md border px-2.5" :class="act?.then === 'next' ? 'border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-elevated)]' : 'border-[var(--exile-color-border-subtle)]'" @click="thenAct({ then: 'next' })"><Icon name="arrow-right" class="size-4" />次の手へ</button>
            <button v-if="fallback" type="button" class="inline-flex h-8 items-center gap-1 rounded-md border px-2.5" :class="act?.then === 'miss' ? 'border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-elevated)]' : 'border-[var(--exile-color-border-subtle)]'" :title="fallback" @click="thenAct({ then: 'miss' })"><Icon name="rotate" class="size-4" />{{ fallback ?? "付かなかったらの札" }}</button>
          </div>

          <!-- どんどん進む: 直前に決めた形とその結果 -->
          <div v-if="auto && lastNote" class="rounded-md bg-white/[0.03] px-3 py-2 text-xs text-[var(--exile-color-text-secondary)]">
            <span>ひとつ前の形: {{ lastNote.shape }} → </span><b class="text-[var(--exile-color-text-primary)]">{{ lastNote.label }}</b>
            <span v-for="o in lastNote.outs" :key="keyOfShape(o)" class="ml-3 whitespace-nowrap"><span class="tabular-nums text-[var(--exile-color-text-tertiary)]">{{ pct(o.p) }}</span> {{ o.label }}<Icon v-if="isDone(o)" name="check" class="ml-0.5 size-3 text-[var(--exile-color-signal-up)]" /></span>
          </div>
          <!-- どうなる？ (打つ前の形・表の形) -->
          <div v-if="firing && outs.length && !(auto && !at.start && act && !editing)">
            <p class="mb-1.5 text-xs text-[var(--exile-color-text-secondary)]">打つと</p>
            <div class="flex flex-col gap-1">
              <button v-for="o in outs" :key="keyOfShape(o)" type="button" class="flex items-center gap-3 rounded-md bg-white/[0.03] px-3 py-1.5 text-left transition hover:bg-white/[0.07]" @click="choose(o)">
                <span class="w-12 shrink-0 text-right text-xs tabular-nums text-[var(--exile-color-text-tertiary)]">{{ pct(o.p) }}</span>
                <span class="font-medium">{{ o.label }}</span>
                <span class="text-xs text-[var(--exile-color-text-secondary)]">{{ isDone(o) ? "揃う" : shapeText(o) }}</span>
                <span v-if="!isDone(o)" class="ml-auto text-xs" :class="policy[keyOfShape(o)] ? 'text-[var(--exile-color-text-tertiary)]' : 'text-[var(--exile-color-signal-warn)]'">{{ policy[keyOfShape(o)] ? "決めた" : "未定" }}</span>
                <Icon v-else name="check" class="ml-auto size-4 text-[var(--exile-color-signal-up)]" />
              </button>
            </div>
          </div>
          <p v-else-if="firing && !outs.length" class="text-xs text-[var(--exile-color-signal-down)]">ここでは打てない ({{ whyNot(firing, at.h, at.j) }})</p>

          <button v-if="left.length && (done || (act && !editing && !firing))" type="button" class="inline-flex h-8 items-center gap-1.5 self-start rounded-md border border-[var(--exile-color-border-brass)] px-3 text-[var(--exile-color-text-primary)] hover:bg-[var(--exile-color-bg-elevated)]" @click="nextLeft">まだ決めていない形へ ({{ shapeText(left[0]!) }})<Icon name="arrow-right" class="size-4" /></button>
        </div>
      </div>
    </section>

    <!-- 決めた手 (表)。押すとその形へ -->
    <section v-if="reach.length">
      <h5 class="mb-1.5 text-[11px] font-medium tracking-wide text-[var(--exile-color-text-tertiary)]">決めた手</h5>
      <div class="overflow-hidden rounded-md ring-1 ring-white/[0.06]">
        <div class="grid grid-cols-[3.5rem_3.5rem_3.5rem_minmax(0,1fr)] bg-white/[0.03] px-3 py-1 text-[11px] tracking-wide text-[var(--exile-color-text-tertiary)]">
          <span>{{ SIDE_JA }} 狙い</span><span>ほか</span><span>空き</span><span>打つ物</span>
        </div>
        <button v-for="r in reach" :key="keyOfShape(r)" type="button" class="grid w-full grid-cols-[3.5rem_3.5rem_3.5rem_minmax(0,1fr)] items-center border-t border-white/[0.04] px-3 py-1.5 text-left tabular-nums transition hover:bg-white/[0.04]" :class="!at.start && keyOfShape(at) === keyOfShape(r) ? 'bg-[var(--exile-color-bg-elevated)] shadow-[inset_2px_0_0_var(--exile-color-accent-focus)]' : ''" @click="go(r)">
          <span class="text-[var(--color-rarity-magic)]">{{ r.h }}<span v-if="r.g != null" class="ml-1 text-[11px] text-[var(--exile-color-text-tertiary)]">+{{ OTHER_JA }}{{ r.g }}</span></span>
          <span class="text-[var(--exile-color-text-secondary)]">{{ r.j }}</span>
          <span class="text-[var(--exile-color-text-tertiary)]">{{ Math.max(0, limit - r.h - r.j) }}</span>
          <span class="truncate" :class="broken.some((b) => keyOfShape(b) === keyOfShape(r)) ? 'text-[var(--exile-color-signal-down)]' : policy[keyOfShape(r)] ? '' : 'text-[var(--exile-color-signal-warn)]'">{{ ruleText(policy[keyOfShape(r)]) }}{{ broken.some((b) => keyOfShape(b) === keyOfShape(r)) ? " (この形では打てない)" : "" }}</span>
        </button>
      </div>
    </section>
  </div>
</template>
