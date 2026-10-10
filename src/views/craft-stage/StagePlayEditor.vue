<!--
  StagePlayEditor.vue — 打って作るパターン (ADR-002、2026-10-09)。画面は手打ちと同じ (アイテムの札 + 手打ちと同じ棚)。

  オーナー 2026-10-09:「手打ちみたいな挙動にしたらいい」「最短距離で付くように一旦打って、全部のカレンシーで一発で付くようなルートを打って、
  全てのパターンをどうするか決めた方がいい」→ 進め方は 2 段:
    ① 当たりで打つ … 棚から打ち、「MOD を狙う？」で打つだけか狙いを選ぶ。狙う手は当たったものとして進む (手の並び = 当たりの道)
    ② 外れを埋める … 狙う手ごとに、外れた形で次に打つ物を同じ棚から選ぶ (StageOutcomeTree の打って決める)
  「今まで入力していた部分 (ベース・MOD・始め方) まではそのまま」。決めていない形は回すと新しいベースで最初から (仮の数字)
-->
<script setup lang="ts">
import { useFlash } from "../../utils/use-flash";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
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
import { GREATER, hitChanceOf, keyOfShape, reachableShapes, setOf, shapesLeft, useKey } from "../../services/craft-stage/shape-table";
import { moveShapeCtx, nextsOf, pathTo, type PlayAim, type PlayDecision, type PlayMove, type PlayRecipe } from "../../services/craft-stage/play-recipe";

const props = defineProps<{
  play: PlayRecipe;
  sets: readonly PatternSet[];
  /** 始めのアイテム (ベース + 固定済みの MOD など。今まで入力した部分から) */
  startItem: StageItem | null;
  /** MOD の短い名前 (火ダメージ T3+ など) */
  nameOfMod: (modId: string) => string;
  locked?: boolean;
  /** パターンの名前 (ハズレルート設定の残りを覚える) */
  name?: string;
}>();
const emit = defineEmits<{ change: [play: PlayRecipe] }>();
const moves = computed(() => props.play.moves);
function setMoves(ms: PlayMove[]): void { emit("change", { ...props.play, moves: ms }); }

const data = computed(() => craftStage.data.value);
const sideOfId = (id: string): "prefix" | "suffix" => (data.value?.mods.get(id)?.type === "suffix" ? "suffix" : "prefix");
const limitOf = (it: StageItem | null, side: "prefix" | "suffix"): number => (it?.rarity === "magic" ? 1 : side === "prefix" ? (it?.cls.limits?.prefixes ?? 3) : (it?.cls.limits?.suffixes ?? 3));
const shortName = (id: string): string => props.nameOfMod(id).replace(/をアタックに追加する/, "");

// ── 狙いの候補 (今まで入力した狙いから) ─────────────────────────
/**
 * 持った物で狙える物。どれか N つの狙いは中身に分けず 1 つの札で、数は持った物が付ける数まで
 * (2026-10-10 オーナー「どれか 1 つなんだから中身分解して選択させるのは意味わからん。偉大を掛けたらどれか 2 つ、無いならどれか 1 つ」)。
 * 揃い切った狙い・前の手で狙った 1 つだけの MOD は出さない。側のお告げ (左側・右側) を掛けたらその側だけ
 */
interface AimOpt { key: string; label: string; mods: Array<{ modId: string; minTierIndex: number }>; side: "prefix" | "suffix" | "any"; need: number; /** 札に乗せた時の説明 (中の MOD) */ title?: string }
const aimOpts = computed<AimOpt[]>(() => {
  const out: AimOpt[] = [];
  const x = pendingSet.value;
  const step = x && x.kind === "exalt" && x.omens.includes(GREATER) ? 2 : 1;
  const onlySide: "prefix" | "suffix" | null = x?.omens.some((o) => /^OmenofSinistral/.test(o)) ? "prefix" : x?.omens.some((o) => /^OmenofDextral/.test(o)) ? "suffix" : null;
  const ts = craftStage.simTargets.value.filter((t) => t.method !== "fracture");
  // プレとサフィにまたがる「どれか」は、両側のどれか 1 つ (付いた側でルートが分かれる)。カオスと高貴 (2026-10-09 オーナー「高貴でも設定する時あるでしょ」)。
  // 偉大 (2 つ付く) は数え方が変わるので出さない
  if ((x?.kind === "chaos" || (x?.kind === "exalt" && step === 1)) && !onlySide) {
    for (const t of ts) {
      const ms = [{ modId: t.modId, minTierIndex: t.minTierIndex }, ...(t.alts ?? [])];
      if (new Set(ms.map((m) => sideOfId(m.modId))).size < 2) continue;
      out.push({ key: "any:" + ms.map((m) => m.modId).sort().join(","), label: "指定した MOD のどれか 1 つ", title: `プレかサフィのどれか 1 つ (付いた側で道が分かれる): ${ms.map((m) => shortName(m.modId)).join(" / ")}`, mods: ms, side: "any", need: 1 });
    }
  }
  const seen = new Set<string>();
  for (const t of ts) {
    const mods = [{ modId: t.modId, minTierIndex: t.minTierIndex }, ...(t.alts ?? [])];
    if (new Set(mods.map((m) => sideOfId(m.modId))).size > 1) continue;
    const side = sideOfId(t.modId);
    if (onlySide && side !== onlySide) continue;
    // 同じ候補の写し (2 の段の「どれか N つ」) は 1 つの札に。欲しい数 = 写しの数 (3 耐性のどれか 2 つなら 2)
    const sig = mods.map((m) => m.modId).sort().join(",");
    if (seen.has(sig)) continue;
    seen.add(sig);
    const wanted = Math.min(mods.length, ts.filter((y) => [y.modId, ...(y.alts ?? []).map((a) => a.modId)].sort().join(",") === sig).length);
    const before = doneBefore(mods.map((m) => m.modId));
    const rest = wanted - before;
    if (rest <= 0) continue;
    const n = Math.min(step, rest);
    const label = mods.length > 1
      ? `どれか ${n} つ (${mods.map((m) => shortName(m.modId)).join(" / ")})${before ? ` · 合わせて ${before + n} つ` : ""}`
      : props.nameOfMod(t.modId);
    out.push({ key: mods.map((m) => m.modId).sort().join(","), label, mods, side, need: before + n });
  }
  return out;
});
/** 前の手までに同じ狙いで揃えた数 */
function doneBefore(ids: string[]): number {
  return (hasRoutes.value ? routeKs.value : pathTo(props.play, moves.value.length).map((x) => x.k)).map((k) => moves.value[k]!).reduce((a, m) => (m.aim && m.aim.side !== "any" && m.aim.mods.some((x) => ids.includes(x.modId)) ? Math.max(a, m.aim.need) : a), 0);
}

// ── 道 (2026-10-10 オーナー「プレとサフィ合わせてどれかの時は、1 手目の成功手の再現で 2 種類のルート。プレのどれかの手とサフィのどれかの手で分ける。
//    プレのどれかの成功手はプレに付く MOD だけ表示」) ─────────────────
/** 見ている道 (両側の狙いの手で分かれる時だけ使う) */
const route = ref<"prefix" | "suffix">("prefix");
const hasRoutes = computed(() => moves.value.some((m) => m.branch));
// 2026-10-10 オーナー「プレフィックスのどれかが付いた場合って日本語に、サフィも」
const ROUTE_JA = { prefix: "プレフィックスのどれかが付いた場合", suffix: "サフィックスのどれかが付いた場合" } as const;
/** 手の並びの短い札 */
const ROUTE_SHORT = { prefix: "プレフィックスに付いた", suffix: "サフィックスに付いた" } as const;
/** 見ている道で通る手 (始めから行き先を辿る) */
const routePath = computed<Array<{ k: number; side?: "prefix" | "suffix" }>>(() => {
  const out: Array<{ k: number; side?: "prefix" | "suffix" }> = [];
  const n = moves.value.length;
  const seen = new Set<number>();
  let k = 0;
  while (k < n && !seen.has(k)) {
    seen.add(k);
    const m = moves.value[k]!;
    if (m.branch) { out.push({ k, side: route.value }); const to = m.branch[route.value]; k = to === "end" ? n : to; }
    else { out.push({ k }); k = m.next === "end" ? n : m.next ?? k + 1; }
  }
  return out;
});
const routeKs = computed(() => routePath.value.map((x) => x.k));
/** 画面の手の番号 (道の中の順番) */
const numOf = (k: number): number => { const p = hasRoutes.value ? routeKs.value.indexOf(k) : -1; return (p >= 0 ? p : k) + 1; };
/** 左に並べる手 (道があれば見ている道の手だけ) */
const shownKs = computed(() => (hasRoutes.value ? routeKs.value : moves.value.map((_, k) => k)));
/** 手が見ている道に無ければ、もう一方の道へ切り替える */
function showMove(k: number): void {
  if (hasRoutes.value && !routeKs.value.includes(k)) route.value = route.value === "prefix" ? "suffix" : "prefix";
  sel.value = k;
}

// ── アイテムの移り変わり (当たりの道) ─────────────────────────
/** 狙いの MOD 行 (どれか N つなら「どれか 1 MOD (…)」の文に) */
/** 狙いの MOD の側 (両側の狙いは MOD の側) */
const sideFor = (aim: PlayAim, modId: string): "prefix" | "suffix" => (aim.side === "any" ? sideOfId(modId) : aim.side);
/**
 * 「どれか 1 MOD (…)」の文。両側の狙いはその側の候補だけ (2026-10-09 オーナー「プレフィックスのどれか付いた場合はプレだけ表示のはず、サフィも同じ」:
 * プレの道でもサフィの MOD まで並んでいた)
 */
const anyText = (aim: PlayAim, side: "prefix" | "suffix"): string => `どれか 1 MOD (${aim.mods.filter((x) => aim.side !== "any" || sideOfId(x.modId) === side).map((x) => shortName(x.modId)).join(" / ")})`;
function hitMod(aim: PlayAim, modId: string, minTierIndex: number): StageMod | null {
  const md = data.value?.mods.get(modId);
  if (!md) return null;
  const m = makeStageMod(md, sideFor(aim, modId), Math.min(md.tiers.length - 1, minTierIndex), () => 0.5);
  return aim.mods.length > 1 ? { ...m, textJa: anyText(aim, sideFor(aim, modId)) } : m;
}
const aimMet = (it: StageItem, aim: PlayAim): boolean => new Set(allMods(it).filter((s) => !s.unrevealed && aim.mods.some((a) => s.modId === a.modId && s.tierIndex >= a.minTierIndex)).map((s) => s.modId)).size >= aim.need;
/** どれか N つの狙いの MOD は「どれか 1 MOD (…)」の文で出す (順不同) */
function relabel(it: StageItem, aim: PlayAim): StageItem {
  if (aim.mods.length < 2) return it;
  const f = (ms: StageMod[]): StageMod[] => ms.map((s) => (aim.mods.some((a) => a.modId === s.modId) ? { ...s, textJa: anyText(aim, s.side) } : s));
  return { ...it, prefixes: f(it.prefixes), suffixes: f(it.suffixes) };
}
/** 当たりの乱数が見つからない時の目安: 狙いの行を足すだけ (狙いの側が満杯なら狙い以外を外す) */
function fakeHit(it0: StageItem, x: PatternSet, aim0: PlayAim, want?: "prefix" | "suffix"): StageItem {
  // 両側の狙いは、行き先の側 (無ければ 1 つ目の MOD の側) の MOD だけで
  const sd0 = want ?? sideOfId(aim0.mods[0]!.modId);
  const aim = { ...aim0, mods: aim0.side === "any" ? aim0.mods.filter((a) => sideOfId(a.modId) === sd0) : aim0.mods, side: aim0.side === "any" ? sd0 : aim0.side };
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
/**
 * 手を打った後のアイテム。打つだけの手は本当に打ち、狙う手は当たったものとして狙いを足す。
 * want = 両側の狙いの手で、行き先に合わせて当たる側 (道で分かれる時)
 */
function stepItem(it: StageItem | null, k: number, prevAims: PlayAim[], want?: "prefix" | "suffix"): StageItem | null {
  const d = data.value;
  const m = moves.value[k];
  const x = m ? setOf(props.sets, m.use) : undefined;
  if (!d || !it || !m || !x) return it;
  if (!m.aim) {
    const r = applyCurrency(d, it, x.currency, mulberry32(1000 + k), x.omens);
    let out = r.applied ? r.item : it;
    // 骨を打つだけ: エンジンと同じく 1 番目の候補で発現
    if (unrevealedOf(out)) { const rv = applyCurrency(d, out, "reveal:1", mulberry32(2000 + k)); if (rv.applied) out = rv.item; }
    return out;
  }
  // 当たりで打つ: エンジンで本当に打ち、狙いが揃って前の手の狙いも残る乱数を探す (触媒の高貴で品質が消える・骨の発現・エッセンスもエンジンの通り)。
  // 2026-10-09 オーナー「カタリスト周りと冒涜周り、エッセンスも」。見つからなければ狙いの行を足すだけの目安
  const aim = m.aim;
  const sideOk = (it2: StageItem): boolean => !want || allMods(it2).some((s2) => s2.side === want && aim.mods.some((a) => s2.modId === a.modId && s2.tierIndex >= a.minTierIndex));
  // 両側のカオス: 打つ前に外れを 1 つまで消す (エンジンと同じ)
  let base = it;
  if (aim.side === "any" && x.kind === "chaos") {
    for (let g = 0; g < 6; g++) {
      const junk = allMods(base).filter((s2) => !s2.fractured && !s2.unrevealed && !aim.mods.some((a) => a.modId === s2.modId));
      if (junk.length <= 1) break;
      base = without(base, junk[0]!);
    }
  }
  for (let t = 0; t < 4000; t++) {
    const r = applyCurrency(d, base, x.currency, mulberry32(50_000 + k * 10_000 + t), x.omens);
    if (!r.applied) break;
    let it2 = r.item;
    // 骨: 発現は狙いの出た候補を選ぶ (無ければこの乱数は外れ)
    if (unrevealedOf(it2)) {
      const offers = revealOffers(d, it2, mulberry32(90_000 + t));
      const idx = offers.first.findIndex((o) => aim.mods.some((a) => o.modId === a.modId && o.tierIndex >= a.minTierIndex));
      if (idx < 0) continue;
      const rv = applyCurrency(d, it2, `reveal:${idx + 1}`, mulberry32(90_000 + t));
      if (!rv.applied) continue;
      it2 = rv.item;
    }
    if (aimMet(it2, aim) && sideOk(it2) && prevAims.every((p) => aimMet(it2, p))) return relabel(it2, aim);
  }
  return fakeHit(base, x, aim, want);
}
/** 道を辿った後のアイテム */
const itemAlong = (path: ReadonlyArray<{ k: number; side?: "prefix" | "suffix" }>, cache: Map<string, StageItem | null>): StageItem | null => {
  let it = props.startItem;
  let key = "";
  const aims: PlayAim[] = [];
  for (const st of path) {
    key += `${st.k}${st.side?.[0] ?? ""},`;
    const hit = cache.get(key);
    if (hit !== undefined) it = hit;
    else { it = stepItem(it, st.k, aims, st.side); cache.set(key, it); }
    const a = moves.value[st.k]?.aim;
    if (a && a.side !== "any") aims.push(a);
  }
  return it;
};
/** i 手目を打つ前のアイテム (行き先で分かれる時は i に着く道) */
const itemAt = (i: number, cache: Map<string, StageItem | null>): StageItem | null => itemAlong(pathTo(props.play, i), cache);
/** before[k] = k 手目を打つ前のアイテム (before[moves.length] = 今)。after[k] = k 手目を打った後 */
const itemsAll = computed(() => {
  const cache = new Map<string, StageItem | null>();
  const before = moves.value.map((_, k) => itemAt(k, cache)).concat(itemAt(moves.value.length, cache));
  const after = moves.value.map((_, k) => { const nx = nextsOf(props.play, k)[0]; return nx ? itemAt(nx.to, cache) : null; });
  // 今 = 見ている道の最後の手を打った後
  return { before, after, now: hasRoutes.value ? itemAlong(routePath.value, cache) : before[moves.value.length] ?? null };
});
const items = computed(() => itemsAll.value.before);
const now = computed(() => itemsAll.value.now);

// ── 手の形 (② 外れを埋める) ─────────────────────────────────
const toPolicy = (sh: Record<string, PlayDecision> | undefined): Record<string, PolicyAct> => Object.fromEntries(Object.entries(sh ?? {}).map(([k, d]) => [k, "use" in d ? { set: d.use, ...(d.pre?.length ? { pre: d.pre } : {}) } : d.go === "next" ? { then: "next" } : d.go === "start" ? { then: "restart" } : d.strip != null ? { then: "reset", goto: d.to } : { then: "goto", goto: d.to, ...(d.auto ? { auto: true } : {}) }]));
const fromPolicy = (pol: Record<string, PolicyAct>): Record<string, PlayDecision> => Object.fromEntries(Object.entries(pol).flatMap(([k, a]): Array<[string, PlayDecision]> => (a.set ? [[k, { use: a.set, ...(a.pre?.length ? { pre: a.pre } : {}) }]] : a.then === "next" ? [[k, { go: "next" }]] : a.then === "restart" ? [[k, { go: "start" }]] : a.then === "reset" ? [[k, { go: "move", to: a.goto ?? 0, strip: 1 }]] : a.then === "goto" ? [[k, { go: "move", to: a.goto ?? 0, ...(a.auto ? { auto: true } : {}) }]] : [])));
/** 狙う手の「打って決める」の中身 */
function shapeOf(i: number) {
  const m = moves.value[i];
  const x = m ? setOf(props.sets, m.use) : undefined;
  const it = items.value[i] ?? null;
  const d = data.value;
  if (!m?.aim || !x || !it || !d || m.aim.side === "any") return null;
  const side = m.aim.side;
  const other = side === "prefix" ? "suffix" : "prefix";
  const otherRemovable = listOf(it, other).filter((s) => !s.fractured).length;
  // 枠はフラクチャーの分を引く (固定は消えないので形に入れない)
  const fixedHere = listOf(it, side).filter((s) => s.fractured).length;
  const c = moveShapeCtx(props.play, i, props.sets, limitOf(it, side) - fixedHere, otherRemovable);
  if (!c) return null;
  // 打つ前に狙いの側に付いている狙い以外 (打つだけの手で付いた物など)。カオスのスパムは、これがあるから外れが出る
  const targetIds = new Set(craftStage.simTargets.value.flatMap((t) => [t.modId, ...(t.alts ?? []).map((a) => a.modId)]));
  const j0 = listOf(it, side).filter((s) => !s.fractured && !targetIds.has(s.modId) && !/#h\d+$/.test(s.modId)).length;
  const pHit = hitChanceOf(d, it.cls, it.itemLevel, side, m.aim.mods, c.ctx.need - m.aim.need);
  // 反対の側に前の手の狙いがあれば、その数も形に入れる (消えた時の次の手を決める。2026-10-09 両側の狙い)
  const otherAimed = pathTo(props.play, i).some((x) => moves.value[x.k]?.aim?.side === other);
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
    props: { set: x, side, limit: limitOf(it, side) - fixedHere, need: c.ctx.need, h0: c.h0, j0, policy, pHit, otherRemovable, ...ctxMore, isTarget: (id: string) => targetIds.has(id) || /#h\d+$/.test(id), steps: [...pathTo(props.play, i).map((x) => x.k), i].map((n) => ({ n, label: `${numOf(n)} 手目: ${useLabel(moves.value[n]!.use)}` })), hitMods: m.aim.mods.flatMap((a) => { const hm = hitMod(m.aim!, a.modId, a.minTierIndex); return hm ? [hm] : []; }), baseItem: it, backTo: spam != null ? { to: spam, label: `${spam + 1} 手目のスパムへ` } : null },
    left: shapesLeft({ ...c.ctx, pHit, ...ctxMore }, x, c.h0, j0, policy),
    /** 来うる形のキーと、この手の始め (自動の行き先を探すのに使う) */
    keys: reachableShapes({ ...c.ctx, pHit, ...ctxMore }, x, c.h0, j0, policy).map(keyOfShape),
    h0: c.h0, j0, side, mods: m.aim.mods.map((a) => a.modId),
  };
}
const shapes = computed(() => moves.value.map((_, i) => shapeOf(i)));
const leftTotal = computed(() => shapes.value.reduce((a, s) => a + (s?.left ?? 0), 0));
/**
 * 前の手 (か、この手) の始めと同じ形は、その手へ戻るのが既定 (2026-10-10 オーナー「同じ形なら同じ処理。デフォルトは自動でいい」)。
 * 同じ側・同じ狙いの手で、狙いの数がその手の始めと同じ、狙い以外の数もその手の始めか、その手で決めてある形と同じ時。
 * 反対の側の狙いが絡む形 (h-j-g) は自動にしない。後で別の手に変えられる (変えたら自動の印は消える)
 */
function autoTarget(i: number, key: string): number | null {
  const mm = /^(\d+)-(\d+)$/.exec(key);
  if (!mm) return null;
  const h = Number(mm[1]), j = Number(mm[2]);
  const me = shapes.value[i];
  if (!me) return null;
  for (let k = i; k >= 0; k--) {
    const sk = shapes.value[k];
    if (!sk || sk.side !== me.side || !sk.mods.some((id) => me.mods.includes(id))) continue;
    if (sk.h0 !== h) continue;
    if (sk.j0 === j || (k !== i && moves.value[k]?.shapes?.[key])) return k;
  }
  return null;
}

function setShapes(i: number, pol: Record<string, PolicyAct>): void {
  setMoves(moves.value.map((m, k) => (k === i ? { ...m, shapes: fromPolicy(pol) } : m)));
}

// ── 選んでいる手 (null = ① 当たりで次の手を打つ) ─────────────────
const sel = ref<number | null>(null);
function goFill(): void {
  // 見ている道の手を先に
  const order = [...shownKs.value, ...moves.value.map((_, k) => k).filter((k) => !shownKs.value.includes(k))];
  const i = order.find((k) => (shapes.value[k]?.left ?? 0) > 0);
  if (i != null) showMove(i);
}
/** 当たりの手の完成: 決めていない外れがあればそこへ、無ければ一番後ろの狙う手の外れを見せる */
function finishHits(): void {
  held.value = null;
  const left = leftTotal.value;
  if (left) goFill();
  else for (let i = moves.value.length - 1; i >= 0; i--) if (moves.value[i]?.aim) { sel.value = i; break; }
  // 切り替わったのを見せる (2026-10-10 オーナー「完成ボタン押したらハズレルート設定にシフト。切り替わったとか UI 上わかりやすく」)
  showSwitched(left ? `ハズレルート設定に切り替えました · 未定 ${left} 形 (${sel.value != null ? numOf(sel.value) : 1} 手目の外れから)` : "ハズレルート設定に切り替えました · 外れも全部決めてあります");
}
/** 切り替えの知らせ (数秒で消える) と、ハズレルート設定のタブを光らせる */
// 文が長いので 4.5 秒 (仕組みは utils/use-flash.ts。2026-10-10 動きの揃え 7)
const switchedNote = useFlash(4500);
const switched = switchedNote.msg;
const showSwitched = (text: string): void => switchedNote.flash(text);
/** 外れを決めていって、この手の形が全部決まったら次の決めていない手へ (2026-10-10 オーナー「ハズレ決めたら次って、どんどん行こう」) */
watch(() => (sel.value != null ? shapes.value[sel.value]?.left ?? null : null), (n, o) => {
  if (n === 0 && (o ?? 0) > 0) goFill();
});
function removeMove(i: number): void {
  const rm = moves.value[i]!;
  const n = moves.value.length;
  // 消した手へ来ていた行き先は、その手の次へ (分かれる手なら完成へ)
  const cont: number | "end" = rm.branch ? "end" : rm.next ?? (i + 1 >= n ? "end" : i + 1);
  const fix = (x: number | "end"): number | "end" => { const y = x === i ? cont : x; return y === "end" ? y : y > i ? y - 1 : y; };
  const out = moves.value.flatMap((m, k): PlayMove[] => {
    if (k === i) return [];
    const nm: PlayMove = { ...m };
    // 次の手が並びの次 (無印) で、消した手だった時は、消した手の次へ
    if (m.next != null) nm.next = fix(m.next);
    else if (k + 1 === i && cont !== i + 1) nm.next = fix(cont);
    if (m.branch) nm.branch = { prefix: fix(m.branch.prefix), suffix: fix(m.branch.suffix) };
    if (m.shapes) nm.shapes = Object.fromEntries(Object.entries(m.shapes).map(([key, d]) => [key, "go" in d && d.go === "move" ? { ...d, to: (() => { const t = fix(d.to); return t === "end" ? Math.max(0, n - 2) : t; })() } : d]));
    return [nm];
  });
  setMoves(out);
  if (sel.value != null && sel.value >= out.length) sel.value = null;
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
function addMove(o: AimOpt | null): void {
  const use = pending.value;
  const x = pendingSet.value;
  if (!use || !x) return;
  let aim: PlayAim | null = null;
  if (o) aim = { mods: o.mods, need: o.need, side: o.side };
  const n = moves.value.length;
  const ms = [...moves.value];
  const nm: PlayMove = { use, aim };
  if (hasRoutes.value) {
    // 見ている道の最後の手から新しい手へ。並びの最後の手が別の道の終わりなら、そこは完成へ
    const last = routeKs.value[routeKs.value.length - 1];
    const tail = ms[n - 1];
    if (tail && n - 1 !== last && !tail.branch && tail.next == null) ms[n - 1] = { ...tail, next: "end" };
    if (last != null) { const lm = ms[last]!; ms[last] = lm.branch ? { ...lm, branch: { ...lm.branch, [route.value]: n } } : { ...lm, next: n }; }
    nm.next = "end";
  }
  // 両側の狙い: 当たった側で道が分かれる (初めはどちらも完成へ。道ごとに次の手を足す)
  if (aim?.side === "any") { delete nm.next; nm.branch = { prefix: "end", suffix: "end" }; route.value = "prefix"; }
  ms.push(nm);
  setMoves(ms);
  held.value = null;
  omens.value = [];
}

const iconsOf = (key: string): string[] => { const x = setOf(props.sets, key); return x ? [x.currency, ...x.omens].filter((i) => !!iconOf(i)) : []; };
const useLabel = (key: string): string => { const x = setOf(props.sets, key); return x ? [nameOf(x.currency), ...x.omens.map((o) => nameOf(o))].join(" + ") : key; };
/** 手の狙いの文。前の手で同じ狙いが付いていれば「残り N つ (合わせて M つ)」(初見レビュー「どれか 3 つが 3 つ全部か残りか分からない」) */
/** 道の側の MOD だけにした狙い (両側の狙いの手を、プレのどれか / サフィのどれかで見せる) */
function aimOn(i: number): PlayAim | null {
  const a = moves.value[i]?.aim;
  if (!a || a.side !== "any" || !hasRoutes.value) return a ?? null;
  return { ...a, mods: a.mods.filter((m) => sideOfId(m.modId) === route.value), side: route.value };
}
function aimLabelAt(i: number): string {
  const a = aimOn(i);
  if (!a) return "";
  if (moves.value[i]?.aim?.side === "any" && hasRoutes.value) return `${ROUTE_SHORT[route.value]}: ${a.mods.map((m) => shortName(m.modId)).join(" / ")}`;
  const names = a.mods.map((m) => shortName(m.modId)).join(" / ");
  if (a.mods.length < 2) return props.nameOfMod(a.mods[0]!.modId);
  const before = prevNeedOf(a, i);
  return before > 0 ? `残り ${a.need - before} つ (合わせて ${a.need} つ: ${names})` : `どれか ${a.need} つ (${names})`;
}
/** 左の一覧用の短い文 (MOD は種類だけ: 火・冷気・雷) */
function aimShortAt(i: number): string {
  const a = aimOn(i);
  if (!a) return "";
  if (moves.value[i]?.aim?.side === "any" && hasRoutes.value) return `${ROUTE_SHORT[route.value]}: ${a.mods.map((m) => shortName(m.modId).replace(/\s*T\d+\+$/, "")).join("・")}`;
  if (a.mods.length < 2) return props.nameOfMod(a.mods[0]!.modId);
  const tier = /T\d+\+$/.exec(shortName(a.mods[0]!.modId))?.[0] ?? "";
  const kinds = a.mods.map((m) => shortName(m.modId).replace(/\s*T\d+\+$/, "").replace(/ダメージ$/, "")).join("・");
  const before = prevNeedOf(a, i);
  return `${before > 0 ? `残り ${a.need - before}` : `${a.need} つ`}: ${kinds} ${tier}`.trim();
}
function prevNeedOf(a: PlayAim, i: number): number {
  const ids = new Set(a.mods.map((m) => m.modId));
  // 道で通る前の手だけ (両側の狙いは揃える数に入れない)
  return pathTo(props.play, i).map((x) => moves.value[x.k]!).reduce((acc, m) => (m.aim && m.aim.side !== "any" && m.aim.mods.some((x) => ids.has(x.modId)) ? Math.max(acc, m.aim.need) : acc), 0);
}
/** 打つ物の短い名前 (完全高貴 · 偉大 · 左 など)。正式な名前は乗せると出る */
const OMEN_SHORT: Record<string, string> = { OmenofSinistralExaltation: "左", OmenofDextralExaltation: "右", OmenofSinistralAnnulment: "左", OmenofDextralAnnulment: "右", OmenofSinistralErasure: "左", OmenofDextralErasure: "右", OmenofGreaterExaltation: "偉大", OmenofCatalysingExaltation: "触媒", OmenofWhittling: "削減", OmenofLight: "光", OmenofSinistralCrystallisation: "左", OmenofDextralCrystallisation: "右", OmenofSinistralNecromancy: "左", OmenofDextralNecromancy: "右", OmenofAbyssalEchoes: "反響" };
const CUR_SHORT: Record<string, string> = { exalt: "高貴", exalt_greater: "上級高貴", exalt_perfect: "完全高貴", chaos: "カオス", chaos_greater: "上級カオス", chaos_perfect: "完全カオス", annul: "消去" };
const useShort = (key: string): string => { const x = setOf(props.sets, key); if (!x) return key; return [CUR_SHORT[x.currency] ?? nameOf(x.currency), ...x.omens.map((o) => OMEN_SHORT[o] ?? nameOf(o))].join(" · "); };
// ── 揃った後の行き先 (2026-10-10 MazBro の指輪: 当たった側で次の手を分ける、片方の道の終わりは完成へ) ──
const SEL = "h-8 max-w-full rounded-md border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-elevated)] px-2 text-xs text-[var(--exile-color-text-primary)]";
const destOpts = computed(() => [...shownKs.value.map((k) => ({ v: String(k), label: `${numOf(k)} 手目: ${useShort(moves.value[k]!.use)}` })), { v: "end", label: "完成 (揃っていなければ最初から)" }]);
const destOf = (x: number | "end" | undefined): string => (x == null ? "" : String(x));
const parseDest = (v: string): number | "end" | undefined => (v === "" ? undefined : v === "end" ? "end" : Number(v));
function setNext(i: number, v: string): void {
  setMoves(moves.value.map((m, k) => { if (k !== i) return m; const { next: _n, ...rest } = m; const to = parseDest(v); return to == null ? rest : { ...rest, next: to }; }));
}
/**
 * 2 の段でプレとサフィにまたがる「どれか」をカオススパムにしたら、打ち方の 1 手目はそのカオス (2 つのルートに分かれる) を入れておく
 * (2026-10-10 オーナー「その仕組み選んだ時点でツリーのタブ 2 つになる」)
 */
watch(() => [moves.value.length, craftStage.simTargets.value] as const, ([n]) => {
  if (n || props.locked) return;
  const t = craftStage.simTargets.value.find((x) => x.method === "chaos" && x.alts?.length && new Set([x.modId, ...x.alts.map((a) => a.modId)].map(sideOfId)).size > 1);
  const ch = t ? props.sets.find((x) => x.kind === "chaos" && x.currency === "chaos" && !x.omens.length) : undefined;
  if (!t || !ch) return;
  setMoves([{ use: ch.key, aim: { mods: [{ modId: t.modId, minTierIndex: t.minTierIndex }, ...(t.alts ?? [])], need: 1, side: "any" }, branch: { prefix: "end", suffix: "end" } }]);
  route.value = "prefix";
}, { immediate: true });
// 自動の行き先を入れる (中で使う物が全部できてから。上の autoTarget の決まり)
watch(shapes, () => {
  let changed = false;
  const next = moves.value.map((m, i) => {
    const sh = shapes.value[i];
    if (!m.aim || !sh) return m;
    const add: Record<string, PlayDecision> = {};
    for (const k of sh.keys) {
      if (m.shapes?.[k]) continue;
      const to = autoTarget(i, k);
      if (to != null) add[k] = { go: "move", to, auto: true };
    }
    if (!Object.keys(add).length) return m;
    changed = true;
    return { ...m, shapes: { ...(m.shapes ?? {}), ...add } };
  });
  if (changed && !props.locked) setMoves(next);
}, { immediate: true });
// ハズレルート設定の残り (残っていれば回さない)
watch([leftTotal, () => props.name], ([n, name]) => { if (name) craftStage.simPlayLeft.value = { ...craftStage.simPlayLeft.value, [name]: n }; }, { immediate: true });
/** スマホの下の帯 (完成) は、この打ち方の画面が見えている間だけ出す (結果を見ている時に残っていた。2026-10-09) */
const rootEl = ref<HTMLElement | null>(null);
const onScreen = ref(true);
let io: IntersectionObserver | null = null;
onMounted(() => {
  if (!rootEl.value || typeof IntersectionObserver === "undefined") return;
  io = new IntersectionObserver(([e]) => { onScreen.value = !!e?.isIntersecting; }, { rootMargin: "0px 0px -35% 0px" });
  io.observe(rootEl.value);
});
onBeforeUnmount(() => io?.disconnect());
</script>

<template>
  <div ref="rootEl" class="grid grid-cols-[300px_minmax(0,1fr)] items-start gap-x-6 gap-y-4 text-[13px] max-md:grid-cols-1">
    <!--
      工程 (2026-10-10 オーナー「1 を 2 まで伸ばして。ハズレルートは 2 工程目みたいに次のページへ、工程ごと進ませよう」)。
      工程 1 = 最速完成ルート、完成ボタンで工程 2 = ハズレルート設定へ。ハズレが残っている間は回せない
    -->
    <div class="col-span-full flex flex-wrap items-center gap-3 rounded-lg bg-black/30 px-4 py-3 max-md:col-span-1" :style="switched ? { boxShadow: '0 0 0 2px var(--exile-color-accent-focus), 0 0 14px rgba(201,162,90,0.45)' } : undefined">
      <span class="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--exile-color-accent-focus)] text-[13px] font-bold text-black">{{ sel == null ? 1 : 2 }}</span>
      <div class="min-w-0 flex-1">
        <p class="text-[15px] font-semibold text-[var(--exile-color-text-primary)]">{{ sel == null ? "最速完成ルート" : "ハズレルート設定" }}</p>
        <Transition enter-from-class="-translate-y-1 opacity-0" enter-active-class="transition duration-200" leave-to-class="opacity-0" leave-active-class="transition duration-300">
          <p v-if="switched" role="status" class="mt-1 text-xs font-semibold text-[var(--exile-color-accent-focus)]">{{ switched }}</p>
        </Transition>
        <p class="text-xs text-[var(--exile-color-text-secondary)]">{{ sel == null ? "狙う MOD が付いたものとして、完成までの手を並べる" : leftTotal ? `外れた時の手を形ごとに決める · 残り ${leftTotal} 形 (全部決めると回せる)` : "外れも全部決めた · 回せる" }}</p>
      </div>
      <span class="ml-auto flex items-center gap-2 text-xs max-md:ml-0 max-md:w-full">
        <span class="flex items-center gap-1.5 max-md:hidden" :class="sel == null ? 'text-[var(--exile-color-text-primary)]' : 'text-[var(--exile-color-text-tertiary)]'"><span class="grid size-5 place-items-center rounded-full text-[11px] font-bold" :class="sel == null ? 'bg-[var(--exile-color-accent-focus)] text-black' : 'bg-emerald-500/20 text-emerald-200'">1</span>最速完成ルート</span>
        <Icon name="chevron-right" class="size-4 text-[var(--exile-color-text-tertiary)] max-md:hidden" />
        <span class="flex items-center gap-1.5 max-md:hidden" :class="sel != null ? 'text-[var(--exile-color-text-primary)]' : 'text-[var(--exile-color-text-tertiary)]'"><span class="grid size-5 place-items-center rounded-full text-[11px] font-bold" :class="sel != null ? 'bg-[var(--exile-color-accent-focus)] text-black' : 'bg-white/10 text-white/60'">2</span>ハズレルート設定</span>
        <button v-if="sel != null" type="button" class="ml-2 inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-md px-2 max-md:ml-0 text-[var(--exile-color-text-secondary)] hover:bg-white/5 hover:text-[var(--exile-color-text-primary)]" @click="sel = null"><Icon name="corner-up-left" class="size-4" />工程 1 に戻る</button>
      </span>
    </div>
    <!-- 左: 手の並び -->
    <aside class="flex flex-col gap-3">
      <p class="mt-1 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-[var(--exile-color-text-tertiary)]">
        手の並び
        <HelpTip title="打って作る" :width="300">
          <p>1. <b>最速完成ルート</b>: 棚から打つ物を選び、狙う MOD を決める。狙う手は当たったものとして次へ進む。</p>
          <p class="mt-1">2. <b>ハズレルート設定</b>: 外れた形ごとに、次に打つ物を棚から選ぶ。選ぶと次の形へ進む。</p>
          <p class="mt-1 text-[var(--exile-color-text-secondary)]">決めていない形は、回すと新しいベースで最初から (仮の数字)。</p>
        </HelpTip>
      </p>

      <!-- 道 (両側の狙いの手で分かれる時): プレのどれか / サフィのどれか -->
      <!-- 縦に 2 つ (横に並べると長い名前が重なった。2026-10-09 ゲームの絵の札に) -->
      <div v-if="hasRoutes" class="flex flex-col gap-1" role="tablist" aria-label="道">
        <button v-for="r in (['prefix', 'suffix'] as const)" :key="r" type="button" role="tab" :aria-selected="route === r" class="g-tab w-full !min-h-[32px] !text-[13px]" :class="route === r ? 'on' : ''" @click="route = r; sel = null">{{ ROUTE_JA[r] }}</button>
      </div>
      <ol class="flex flex-col gap-1">
        <li v-for="i in shownKs" :key="i" class="group relative">
          <template v-for="m in [moves[i]!]" :key="i">
          <!-- 消す × は行のボタンの中に入れられない (ボタンの入れ子) ので右端に重ねる (2026-10-10 動きの揃え 6: span role=button をやめた) -->
          <button type="button" class="flex w-full items-center gap-2 rounded-md py-1.5 pl-2 text-left transition" :class="[sel === i ? 'bg-[var(--exile-color-bg-elevated)] shadow-[inset_2px_0_0_var(--exile-color-accent-focus)]' : 'group-hover:bg-white/[0.04]', locked ? 'pr-2' : 'pr-10']" @click="sel = i">
            <span class="grid size-5 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] font-semibold tabular-nums text-[var(--exile-color-text-secondary)]">{{ numOf(i) }}</span>
            <span class="flex shrink-0 items-center -space-x-2.5"><img v-for="ic in iconsOf(m.use)" :key="ic" :src="iconOf(ic)" alt="" class="size-6 object-contain" /></span>
            <span class="min-w-0 flex-1">
              <span class="line-clamp-2 block font-medium text-[var(--exile-color-text-primary)] [word-break:keep-all]" :title="useLabel(m.use)">{{ useShort(m.use) }}</span>
              <span class="line-clamp-2 block text-xs [word-break:keep-all]" :class="m.aim ? 'text-[var(--color-rarity-magic)]' : 'text-[var(--exile-color-text-tertiary)]'" :title="m.aim ? aimLabelAt(i) : ''">{{ m.aim ? aimShortAt(i) : "狙わない" }}</span>
              <span v-if="!m.branch && m.next != null && m.next !== 'end' && m.next !== routeKs[routeKs.indexOf(i) + 1]" class="block text-[11px] text-[var(--exile-color-text-tertiary)]">→ {{ numOf(m.next as number) }} 手目</span>
            </span>
            <span v-if="m.aim && shapes[i]" class="shrink-0 rounded-full px-1.5 text-[11px] tabular-nums" :class="shapes[i]!.left ? 'bg-white/[0.07] text-[var(--exile-color-text-secondary)]' : 'text-[var(--exile-color-signal-up)]'" :title="shapes[i]!.left ? `外れた時の形があと ${shapes[i]!.left} つ未定 (押すと決める)` : '外れも全部決めた'">
              <template v-if="shapes[i]!.left">外れ {{ shapes[i]!.left }}</template><Icon v-else name="check" class="size-3.5" />
            </span>
          </button>
          <button v-if="!locked" type="button" class="g-plain absolute inset-y-0 right-2 my-auto grid size-6 place-items-center rounded text-[var(--exile-color-text-tertiary)] opacity-0 transition hover:bg-white/10 hover:text-[var(--exile-color-signal-down)] focus:opacity-100 group-hover:opacity-100" title="この手を消す" @click="removeMove(i)"><Icon name="x" class="size-3.5" /></button>
          </template>
        </li>
      </ol>
      <div v-show="sel != null" id="play-shapes" class="border-t border-white/[0.06] pt-3"></div>
      <button v-if="!locked && sel == null" type="button" class="flex h-8 items-center justify-center gap-1.5 rounded-md border px-3 transition" :class="sel == null ? 'border-[var(--exile-color-border-brass)] bg-[rgba(201,162,90,0.08)] text-[var(--exile-color-text-primary)]' : 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-text-primary)]'" @click="sel = null"><Icon name="plus" class="size-4" />手を足す</button>
      <button v-if="leftTotal && sel == null && moves.some((m) => m.aim)" type="button" class="flex items-start gap-2 rounded-md bg-[rgba(224,201,122,0.08)] px-3 py-2 text-left text-xs text-[var(--exile-color-signal-warn)] ring-1 ring-[rgba(224,201,122,0.25)] transition hover:bg-[rgba(224,201,122,0.14)]" title="決めないと、外れた時は回す時に新しいベースで最初から" @click="goFill">
        <Icon name="arrow-right" class="mt-px size-4 shrink-0" />
        <span>ハズレルート設定へ · <b>未定 {{ leftTotal }} 形</b></span>
      </button>
    </aside>

    <!-- 右 -->
    <div class="min-w-0">

      <!-- 1 当たりの手を足す -->
      <template v-if="sel == null">
        <header class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h4 class="text-[15px] font-semibold text-[var(--exile-color-text-primary)]">{{ shownKs.length + 1 }} 手目<span v-if="hasRoutes" class="ml-2 text-xs font-normal text-[var(--exile-color-text-secondary)]">{{ ROUTE_JA[route] }}</span></h4>
          <span class="flex items-center gap-1.5 text-xs max-md:w-full max-md:flex-col max-md:items-start">
            <span class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5" :class="!pendingSet ? 'bg-[rgba(201,162,90,0.16)] font-semibold text-[var(--exile-color-text-primary)] ring-1 ring-[var(--exile-color-border-brass)]' : 'text-[var(--exile-color-signal-up)]'"><Icon v-if="pendingSet" name="check" class="size-3.5" /><span v-else class="font-bold">①</span>棚から打つ物を持つ</span>
            <Icon name="chevron-right" class="size-3.5 text-[var(--exile-color-text-tertiary)] max-md:hidden" />
            <span class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5" :class="pendingSet ? 'bg-[rgba(201,162,90,0.16)] font-semibold text-[var(--exile-color-text-primary)] ring-1 ring-[var(--exile-color-border-brass)]' : 'text-[var(--exile-color-text-tertiary)]'"><span class="font-bold">②</span>狙う MOD を選ぶ (無ければ狙わない)</span>
          </span>
          <!-- 当たりの手の終わり (2026-10-10 オーナー「境目がわかりづらい。当たりで決めた時に完成ボタン」) -->
          <button v-if="!locked && moves.some((m) => m.aim)" type="button" class="max-md:hidden ml-auto inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--exile-color-accent-focus)] px-3 text-[13px] font-semibold text-black transition hover:bg-[var(--exile-color-accent-focus-hover)]" :title="leftTotal ? `最速完成ルートはここまで。次はハズレルート設定 (未定 ${leftTotal} 形)` : 'ハズレルート設定も全部決めてある'" @click="finishHits"><Icon name="check" class="size-4" />{{ leftTotal ? "最速完成ルートは完成 → ハズレルート設定へ" : "完成 (外れも決めた)" }}</button>
        </header>
        <div class="flex items-start gap-5 max-md:flex-col">
          <div class="shrink-0 max-md:mx-auto">
            <StageItemCard v-if="now" :item="now" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="260" compact />
          </div>
          <div class="flex min-w-0 flex-1 flex-col gap-3">
            <!-- 持った物と、狙う MOD (アイテムのすぐ横。初見レビュー「持った後に何も起きないように見える」) -->
            <!-- スマホは手打ちと同じく画面の下に固定 (2026-10-10 オーナー「スマホ版もほぼ手打ちと同じ挙動で」) -->
            <section v-if="pendingSet" class="rounded-lg bg-[var(--exile-color-bg-elevated)] p-3 ring-1 ring-[var(--exile-color-border-brass)] max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-[150] max-md:max-h-[55vh] max-md:overflow-auto max-md:rounded-none max-md:border-t max-md:border-amber-400/40 max-md:bg-[#14110d] max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:shadow-[0_-6px_20px_rgba(0,0,0,0.6)] max-md:ring-0">
              <div class="mb-2 flex flex-wrap items-center gap-2">
                <span class="flex items-center -space-x-1"><img v-for="ic in iconsOf(pending!)" :key="ic" :src="iconOf(ic)" alt="" class="size-6 object-contain" /></span>
                <b class="text-[var(--exile-color-text-primary)]">{{ useLabel(pending!) }}</b>
                <button type="button" class="ml-auto grid size-7 place-items-center rounded text-[var(--exile-color-text-tertiary)] hover:bg-white/10 hover:text-[var(--exile-color-text-primary)]" title="持つのをやめる" @click="held = null"><Icon name="x" class="size-4" /></button>
              </div>
              <p class="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-[var(--exile-color-text-tertiary)]">狙う MOD (押すと手が入る) <HelpTip text="狙う手は当たったものとして次へ進みます。外れた時の手は「ハズレルート設定」で決めます" /></p>
              <div class="flex flex-wrap gap-1.5">
                <template v-if="adds">
                  <button v-for="o in aimOpts" :key="o.key" type="button" class="h-8 rounded-md border border-[var(--exile-color-border-subtle)] px-2.5 text-[var(--exile-color-text-primary)] transition hover:border-[rgba(136,136,255,0.6)] hover:bg-[rgba(136,136,255,0.1)] hover:text-[var(--color-rarity-magic)]" :title="o.title" @click="addMove(o)">{{ o.label }}</button>
                </template>
                <!-- 狙わないも同じ枠の札に (2026-10-09 オーナー「狙わないって選択肢も枠付けてあげるべき」) -->
                <button type="button" class="h-8 rounded-md border border-[var(--exile-color-border-subtle)] px-2.5 text-[var(--exile-color-text-secondary)] transition hover:bg-white/5 hover:text-[var(--exile-color-text-primary)]" title="狙わずに打って次の手へ" @click="addMove(null)">狙わない</button>
              </div>
            </section>
            <CurrencyShelf v-if="!locked" @hold="(k: string) => (held = k)">
              <template v-if="heldOmens.length" #held>
                <div class="rounded-lg border border-violet-400/25 bg-violet-500/[0.06] p-2">
                  <p class="mb-1 text-[11px] text-violet-200/80">{{ nameOf(held ?? "") }} に掛けられるお告げ</p>
                  <div class="flex flex-wrap gap-1.5"><ShelfButton v-for="k in heldOmens" :key="k" :k="k" omen @pick="toggleOmen($event)" /></div>
                </div>
              </template>
            </CurrencyShelf>
            <div v-if="pendingSet" class="h-44 md:hidden"></div>
            <!-- スマホ: 「完成」は見出し (上) ではなく画面の下に固定 (2026-10-09 オーナー「わざわざ設定するのに上にいかないといけない動線はだるい」) -->
            <template v-if="!pendingSet && !locked && moves.some((m) => m.aim) && onScreen">
              <div class="h-20 md:hidden"></div>
              <div class="fixed inset-x-0 bottom-0 z-[150] flex items-center gap-2 border-t border-[var(--exile-color-border-subtle)] bg-[#14110d]/95 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[13px] shadow-[0_-6px_20px_rgba(0,0,0,0.6)] backdrop-blur md:hidden">
                <span class="min-w-0 flex-1 truncate text-[12px] text-[var(--exile-color-text-secondary)]"><b class="text-amber-100">{{ shownKs.length + 1 }} 手目</b> · 棚から打つ物を持つ</span>
                <button type="button" class="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-[var(--exile-color-accent-focus)] px-4 text-[13px] font-semibold text-black" @click="finishHits"><Icon name="check" class="size-4" />完成</button>
              </div>
            </template>
          </div>
        </div>
      </template>

      <!-- 2 外れの手 (狙う手) -->
      <template v-else-if="moves[sel]?.aim && shapes[sel]">
        <header class="mb-3 flex flex-wrap items-baseline gap-x-3">
          <h4 class="text-[15px] font-semibold text-[var(--exile-color-text-primary)]">{{ numOf(sel) }} 手目の外れ</h4>
          <span class="text-xs text-[var(--color-rarity-magic)]">{{ aimLabelAt(sel) }}</span>
        </header>
        <StageOutcomeTree v-bind="shapes[sel]!.props" :sets="sets" use-shelf auto :locked="locked" @change="(pol) => setShapes(sel!, pol)" />
        <label class="mt-3 flex items-center gap-2 text-[13px]">
          <span class="shrink-0 text-[var(--exile-color-text-secondary)]">揃ったら</span>
          <select :class="SEL" :disabled="locked" :value="destOf(moves[sel]!.next)" @change="setNext(sel!, ($event.target as HTMLSelectElement).value)">
            <option value="">次の手</option>
            <option v-for="o in destOpts" :key="o.v" :value="o.v">{{ o.label }}</option>
          </select>
        </label>
      </template>

      <!-- 両側の狙い (カオス): 外れは自動、当たった側で行き先を分ける -->
      <template v-else-if="moves[sel]?.aim?.side === 'any'">
        <header class="mb-3 flex flex-wrap items-baseline gap-x-3">
          <h4 class="text-[15px] font-semibold text-[var(--exile-color-text-primary)]">{{ numOf(sel) }} 手目</h4>
          <span class="text-xs text-[var(--color-rarity-magic)]">{{ aimLabelAt(sel) }}</span>
        </header>
        <div class="flex flex-wrap items-start gap-5">
          <StageItemCard v-if="items[sel]" :item="items[sel]!" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="240" compact />
          <div class="flex min-w-0 flex-1 flex-col gap-3 text-[13px]">
            <p class="rounded-md bg-white/[0.03] px-3 py-2 text-[var(--exile-color-text-secondary)]">外れ: 消去で外れを 1 つまで減らしてカオスを続ける (自動)</p>
<p class="text-[var(--exile-color-text-secondary)]">当たった側の道へ進む。道は左の「プレフィックスのどれかが付いた場合 / サフィックスのどれかが付いた場合」で切り替えて、それぞれ次の手を足す</p>
          </div>
        </div>
      </template>

      <!-- 狙わない手 -->
      <template v-else-if="moves[sel]">
        <header class="mb-3 flex flex-wrap items-baseline gap-x-3">
          <h4 class="text-[15px] font-semibold text-[var(--exile-color-text-primary)]">{{ numOf(sel) }} 手目</h4>
          <span class="text-xs text-[var(--exile-color-text-secondary)]">狙わない手。打って次の手へ進む</span>
        </header>
        <div class="flex flex-wrap items-start gap-5">
          <label class="flex basis-full items-center gap-2 text-[13px]">
            <span class="shrink-0 text-[var(--exile-color-text-secondary)]">打ったら</span>
            <select :class="SEL" :disabled="locked" :value="destOf(moves[sel]!.next)" @change="setNext(sel!, ($event.target as HTMLSelectElement).value)">
              <option value="">次の手</option>
              <option v-for="o in destOpts" :key="o.v" :value="o.v">{{ o.label }}</option>
            </select>
          </label>
          <div><p class="mb-1.5 text-xs text-[var(--exile-color-text-secondary)]">打つ前</p><StageItemCard v-if="items[sel]" :item="items[sel]!" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="240" compact /></div>
          <div class="self-center text-[var(--exile-color-text-tertiary)]"><Icon name="arrow-right" class="size-5" /></div>
          <div><p class="mb-1.5 text-xs text-[var(--exile-color-text-secondary)]">打った後 (例)</p><StageItemCard v-if="itemsAll.after[sel]" :item="itemsAll.after[sel]!" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="240" compact /></div>
        </div>
      </template>
    </div>
  </div>
</template>
