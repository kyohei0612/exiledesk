<!--
  StagePatternEditor.vue — シミュレーションの「6 パターン」: 1 手ずつ並べる (2026-10-06 オーナー「パターン作ってほしい、簡単に操作できる UI で 1 手ずつ。
  プルダウンはセットで選択させたい」)。1 手 = セット (打つ物 + お告げ) / 付ける物 (5 順番計画の順) / 外れた時。
  それまでの手で打てない物・付けられない物は、プルダウンの中で理由つきで選べなくする (オーナー「ルーン嵌めてないのにコルの MOD とか、
  エッセンス 2 回目とか、選択できずにグレーアウト、理由も」)。決まりは services/craft-stage/pattern.ts
-->
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { craftStage, nameOf } from "../../state/craft-stage";
import { ANY_KINDS, ANY_TARGET, isDouble, singleKeyOf, hasCands, checkAny, checkMiss, checkRemoval, checkRune, checkSet, checkTarget, MISS_JA, noMiss, patternSets, RARITY_CHANGE, setsForStart, removalSets, setByKey, stateBefore, type CheckCtx, type MissRule, type Pattern, type PatternSet, type PatternStep } from "../../services/craft-stage/pattern";
import { jaOfOmen } from "../../services/htc/labels";
import StagePatternStepPicker from "./StagePatternStepPicker.vue";
import StageItemCard from "./StageItemCard.vue";
import { freshItem } from "../../services/craft-stage/run-plan";
import { makeStageMod, withMod } from "../../services/craft-stage/stage-core";
import { applyRune } from "../../services/craft-stage/stage-runes";
import { applyCurrency } from "../../services/craft-stage/apply-currency";
import { mulberry32 } from "../../services/htc/rng";
import type { StageItem } from "../../services/craft-stage/types";
import { iconOf } from "../../state/craft-stage";
import { baseArt } from "../../services/craft-stage/base-art";
import { RUNES } from "../../services/craft-stage/stage-runes";
import { fillHashes, jaOfMod } from "../../services/htc/mod-text";
import { tierDisplayRanges } from "../../services/mods/stat-scale";

const props = defineProps<{
  /** 始めの状態 (フラクチャー済みのレアか白) */
  start: CheckCtx["start"];
  /** 5 順番計画の並び ("mod:<id>" / "rune:<英語名>") */
  order: readonly string[];
  /** 決めた後は変えられない */
  locked: boolean;
  /** 狙いごとの取り直しの見込み (高貴建て、計算機の redo-cost.ts) */
  redo?: Record<string, number>;
  /** 側ごとの外れの消し方 (redo-cost.ts の annulSides) */
  annulSides?: Partial<Record<"prefix" | "suffix", "plain" | "side">>;
  money?: (x: number) => string;
  /** 5 順番計画の行と同じ見せ方 (順番計画のキーごと) */
  orderInfo?: Record<string, { side: string; tone: string; text: string; rank: string; how: string; redo: string }>;
}>();
/** 付いたら取り直せない手 (レアリティが変わる手で付けた物は戻れない) */
const ONCE = new Set(["transmute", "augment", "regal", "alchemy", "essence"]);
/**
 * その手の消去で巻き込みうる、前の手で付けた狙い (2026-10-06 オーナー「消去で消す MOD はカオススパムがつらいほどアカン、
 * 一回付いたら取り直せないやつ」)。取り直せない物は赤、取り直せる物は取り直しの見込み
 */
function annulRisk(i: number, set: PatternSet | undefined, step: PatternStep): { text: string; bad: boolean } | null {
  if (!set || !ctx.value) return null;
  const c = ctx.value;
  const sideOfId = (id: string): "prefix" | "suffix" => (c.data.mods.get(id)?.type === "suffix" ? "suffix" : "prefix");
  let scope: Array<"prefix" | "suffix"> | null = null;
  if (set.kind === "annul") {
    if (set.omens.includes("OmenofLight")) return null; // 光は冒涜の MOD だけ
    scope = set.omens.includes("OmenofSinistralAnnulment") ? ["prefix"] : set.omens.includes("OmenofDextralAnnulment") ? ["suffix"] : ["prefix", "suffix"];
  } else if (step.onMiss === "annul_redo" && !noMiss(set) && step.target) {
    const sd = sideOfId(step.target);
    const ms = step.miss ? setByKey(sets.value, step.miss) : undefined;
    if (ms) {
      if (ms.omens.includes("OmenofLight")) return null;
      const left = ms.omens.some((o) => /Sinistral/.test(o)), right = ms.omens.some((o) => /Dextral/.test(o));
      scope = left ? ["prefix"] : right ? ["suffix"] : ["prefix", "suffix"];
    } else scope = props.annulSides?.[sd] === "side" ? [sd] : ["prefix", "suffix"];
  }
  if (!scope) return null;
  const hits = pat.value.steps.slice(0, i).flatMap((q) => {
    const x = setByKey(sets.value, q.set);
    if (!x || !q.target || q.target === ANY_TARGET || x.kind === "rune" || x.kind === "annul" || !scope!.includes(sideOfId(q.target))) return [];
    return [{ id: q.target, once: ONCE.has(x.kind) }];
  });
  if (!hits.length) return null;
  const short = (id: string): string => modLabel(id).replace(/\s*T\d+ 以上.*$/, "").slice(0, 16);
  const m = props.money ?? ((x: number) => x.toFixed(1));
  const once = hits.filter((h) => h.once);
  if (once.length) return { text: `消去で ${once.map((h) => short(h.id)).join("・")} を巻き込むと取り直せない`, bad: true };
  return { text: `消去で巻き込みうる: ${hits.map((h) => `${short(h.id)} (取り直し 約 ${props.redo?.[h.id] != null ? m(props.redo[h.id]!) : "?"})`).join("・")}`, bad: false };
}
const s = craftStage;
const active = ref(0);
// 基本情報 (始めのレアリティ・ソケット・部位) で使わない物は出さない (setsForStart)
const sets = computed<PatternSet[]>(() => (s.item.value ? setsForStart(patternSets(s.item.value.cls), s.item.value.cls, props.start) : []));
const ctx = computed<CheckCtx | null>(() => {
  const d = s.data.value, it = s.item.value;
  if (!d || !it) return null;
  return { data: d, cls: it.cls, targets: s.simTargets.value, sets: sets.value, runeJa: (en) => RUNES[en]?.ja ?? en, start: props.start };
});
const pat = computed<Pattern>(() => s.simPatterns.value[Math.min(active.value, s.simPatterns.value.length - 1)]!);
watch(active, () => { focusRow.value = null; editPart.value = null; focusPre.value = null; });

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
  if (focusRow.value != null && focusRow.value >= pat.value.steps.length) closeFrame();
}
function setPattern(fn: (p: Pattern) => Pattern): void {
  const k = Math.min(active.value, s.simPatterns.value.length - 1);
  s.simPatterns.value = s.simPatterns.value.map((p, i) => (i === k ? fn(p) : p));
}
const setSteps = (fn: (steps: PatternStep[]) => PatternStep[]): void => setPattern((p) => ({ ...p, steps: fn([...p.steps]) }));

/** セットの名前 (打つ物 + お告げ) */
const groups = computed(() => {
  const out: Array<{ name: string; items: PatternSet[] }> = [];
  for (const x of sets.value) {
    const g = out.find((y) => y.name === x.group);
    if (g) g.items.push(x); else out.push({ name: x.group, items: [x] });
  }
  return out;
});

/** 付ける物の名前 */
function modLabel(modId: string): string {
  const d = s.data.value;
  const t = s.simTargets.value.find((x) => x.modId === modId);
  const m = d?.mods.get(modId);
  if (!m || !t) return modId;
  const tier = m.tiers[t.minTierIndex];
  const text = fillHashes(jaOfMod(m), tier ? tierDisplayRanges(tier) : []).replace(/\n/g, " / ");
  const alts = t.alts?.length ? ` (ほか ${t.alts.length} つのどれか)` : "";
  return `${text} T${m.tiers.length - t.minTierIndex} 以上${alts}`;
}
const runeLabel = (en: string): string => RUNES[en]?.ja ?? en;

interface Row {
  step: PatternStep;
  set: PatternSet | undefined;
  setOpts: Array<{ name: string; items: Array<{ x: PatternSet; why: string | null }> }>;
  targetOpts: Array<{ key: string; label: string; why: string | null }>;
  /** 偉大 (2 つ) の手の 2 つ目に選べる物 (1 つ目を付けた後の状態で見る) */
  target2Opts: Array<{ key: string; label: string; why: string | null; n: number }>;
  missOpts: Array<{ rule: MissRule; why: string | null }>;
  /** 今の選び方で打てない理由 (前の手を変えた時に出る) */
  bad: string | null;
  /** 消去で巻き込みうる物 */
  risk: { text: string; bad: boolean } | null;
}
const rows = computed<Row[]>(() => {
  const c = ctx.value;
  if (!c) return [];
  return pat.value.steps.map((step, i) => {
    const st = stateBefore(c, pat.value.steps, i);
    const set = setByKey(sets.value, step.set);
    const setOpts = groups.value.map((g) => ({ name: g.name, items: g.items.map((x) => ({ x, why: checkSet(c, st, x) })) }));
    // 付ける物 (MOD・ルーン) が先 (2026-10-07 オーナー「選択順は MOD → 付ける時に使うカレンシー → やり直しカレンシー」)。
    // 付けられるカレンシーが 1 つでもあれば選べる。理由は手前の決まり (前の手で付けた・枠・ルーン) を出す
    const usable = addSets.value.filter((x) => !checkSet(c, st, x));
    const targetOpts = set?.kind === "annul" ? [] : props.order.map((k) => {
      const id = k.slice(k.indexOf(":") + 1);
      if (k.startsWith("rune:")) return { key: id, label: `ルーン: ${runeLabel(id)}`, why: usable.some((x) => x.kind === "rune") ? checkRune(c, st, id) : "ソケットが空いていない" };
      const t = c.targets.find((x) => x.modId === id);
      if (!t) return { key: id, label: modLabel(id), why: "狙う MOD に無い" };
      const ok = usable.some((x) => x.kind !== "rune" && !checkTarget(c, st, x, t));
      const why = ok ? null : (usable.filter((x) => x.kind !== "rune").map((x) => checkTarget(c, st, x, t)).find((w) => w && /前の手|枠|差す|フラクチャー/.test(w)) ?? "今付けられるカレンシーが無い");
      return { key: id, label: modLabel(id), why };
    });
    const missOpts = (Object.keys(MISS_JA) as MissRule[]).map((rule) => ({ rule, why: set ? checkMiss(set, rule) : null }));
    const dbl = isDouble(set) && step.target !== ANY_TARGET;
    const many = hasCands(set) && !!step.target && step.target !== ANY_TARGET;
    const st2 = dbl ? stateBefore(c, [...pat.value.steps.slice(0, i), { ...step, target2: null, target3: null }], i + 1) : st;
    const target2Opts = !many || !set ? [] : props.order.flatMap((k, n) => {
      if (!k.startsWith("mod:")) return [];
      const id = k.slice(4);
      const t = c.targets.find((x) => x.modId === id);
      const why = id === step.target ? "最初に選んだ MOD" : !t ? "狙う MOD に無い" : checkTarget(c, dbl ? st2 : st, set, t);
      return [{ key: id, label: modLabel(id), why, n }];
    });
    const t2Why = !many ? null : dbl && !step.target2 ? "一緒に狙う MOD を選ぶ" : [step.target2, step.target3].map((k) => (k ? target2Opts.find((o) => o.key === k)?.why ?? null : null)).find(Boolean) ?? null;
    const setWhy = set ? checkSet(c, st, set) : "カレンシーを選ぶ";
    const tWhy = !step.target ? "付ける物を選ぶ" : step.target === ANY_TARGET ? (set ? checkAny(st, set) : null) : set && set.kind !== "rune" ? (() => { const t = c.targets.find((x) => x.modId === step.target); return t ? checkTarget(c, st, set, t) : null; })() : null;
    // やり直しは「選択無し (外れてもそのまま次へ)」が既定 (2026-10-07 オーナー「外れてもいいならそこは選択無しをデフォで、他を選んだ時も選択無しを選べる」)
    return { step, set, setOpts, targetOpts, target2Opts, missOpts, bad: tWhy ?? setWhy ?? t2Why, risk: annulRisk(i, set, step) };
  });
});

/**
 * 右のアイテム: その手まで当たった時の姿 (2026-10-06 オーナー「文字だとマジで入ってこない、右側に今のアイテムに付いている MOD つきで表示」)。
 * 見る手は押した手 (棚を開いた手)、無ければ最後の手。固定の MOD + その手までの付ける物 (狙いの段の真ん中の値)、ルーンは差す
 */
const focusRow = ref<number | null>(null);
/**
 * フラクチャーまでの成功品 (読むだけ。2026-10-07 オーナー「一応フラクチャー前の成功品を表示して、白からマジックになったんだなって分かる」)。
 * 白 → 変成・増強 (消去スパム) で固定する MOD → 王者でレア → 骨の壁 → フラクチャー。費用は 4 最安値スタートの計算で固定なので、ここは見せるだけ
 */
const focusPre = ref<number | null>(null);
const preNodes = computed(() => {
  const d = s.data.value;
  const frac = s.simTargets.value.find((t) => t.method === "fracture");
  if (!d || !frac || props.start.rarity !== "rare" || !s.base.value) return [];
  const m = d.mods.get(frac.modId);
  if (!m) return [];
  let white: StageItem;
  try { white = { ...freshItem(d, s.base.value, s.itemLevel.value), sockets: props.start.sockets, rollSeed: 1 }; } catch { return []; }
  const fm = makeStageMod(m, m.type === "suffix" ? "suffix" : "prefix", frac.minTierIndex, () => 0.5);
  const name = cardTitleOf(frac.modId);
  return [
    { title: "白のベース", icons: [] as string[], sub: "買う", tone: "border-white/30", miss: null as { icons: string[]; text: string } | null, item: white },
    { title: name, icons: ["transmute", "augment"], sub: "変成 → 増強", tone: "border-blue-400/50", miss: { icons: ["annul"], text: "↺" }, item: { ...withMod(white, fm), rarity: "magic" as const } },
    { title: "レアに", icons: ["regal"], sub: "王者", tone: "border-blue-400/50", miss: null, item: { ...withMod(white, fm), rarity: "rare" as const } },
    { title: `${name} を固定`, icons: ["desecrate", "fracture"], sub: "骨の壁 → フラクチャー", tone: "border-orange-400/60", miss: { icons: [], text: "⟲ 白から (当たり 1/3)" }, item: { ...withMod(white, { ...fm, fractured: true }), rarity: "rare" as const } },
  ];
});
const previewAt = computed(() => Math.min(focusRow.value ?? Infinity, pat.value.steps.length - 1));
/** 右のアイテムと、そこで光らせる物 (打つだけの手で付いた物) */
const previewOut = computed<{ item: StageItem; added: StageItem["prefixes"] } | null>(() => {
  if (focusPre.value != null && preNodes.value[focusPre.value]) return { item: preNodes.value[focusPre.value]!.item, added: [] };
  const d = s.data.value;
  if (!d || !s.base.value) return null;
  let it: StageItem;
  try { it = { ...freshItem(d, s.base.value, s.itemLevel.value), sockets: props.start.sockets, rollSeed: 1 }; } catch { return null; }
  const add = (modId: string, tierIndex: number, flags: Partial<StageItem["prefixes"][number]>): void => {
    const m = d.mods.get(modId);
    if (!m) return;
    it = withMod(it, { ...makeStageMod(m, m.type === "suffix" ? "suffix" : "prefix", tierIndex, () => 0.5), ...flags });
  };
  const frac = s.simTargets.value.find((t) => t.method === "fracture");
  if (frac) add(frac.modId, frac.minTierIndex, { fractured: true });
  const c = ctx.value;
  let newMods: StageItem["prefixes"] = [];
  for (let j = 0; j <= previewAt.value; j++) {
    const st = pat.value.steps[j]!;
    const x = setByKey(sets.value, st.set);
    if (!x || !st.target) continue;
    // 打つだけの手は、そのカレンシー (お告げも) を実際に打った姿 (2026-10-07 オーナー「打つだけなら指定のカレンシーで打った時の挙動で表示しちゃっていい」)。
    // 乱数は手ごとに決まった値なので、押すたびに変わらない
    if (st.target === ANY_TARGET) {
      const r = applyCurrency(d, { ...it, rarity: c ? stateBefore(c, pat.value.steps, j).rarity : it.rarity }, x.currency, mulberry32(7919 + j), x.omens);
      if (r.applied) { it = r.item; if (j === previewAt.value) newMods = r.added; }
      continue;
    }
    if (x.kind === "rune") { const r = applyRune(it, `rune:${st.target}`, d); if (r.applied) it = r.item; continue; }
    const t = s.simTargets.value.find((y) => y.modId === st.target);
    if (t) add(t.modId, t.minTierIndex, x.kind === "desecrate" ? { desecrated: true } : x.kind === "essence" || x.kind === "essence_perfect" ? { crafted: true } : {});
    const t2 = isDouble(x) && st.target2 ? s.simTargets.value.find((y) => y.modId === st.target2) : undefined;
    if (t2) add(t2.modId, t2.minTierIndex, {});
  }
  const rarity = c ? stateBefore(c, pat.value.steps, previewAt.value + 1).rarity : "rare";
  return { item: { ...it, rarity: it.prefixes.length + it.suffixes.length ? (rarity === "normal" ? "magic" : rarity) : rarity }, added: newMods };
});
const preview = computed<StageItem | null>(() => previewOut.value?.item ?? null);

const removals = computed(() => removalSets(sets.value));
/** 外す時のセット (外す時は付けた後 = レア。付ける手の後の状態で見る) */
const missSet = (step: PatternStep): PatternSet | undefined => (step.miss ? setByKey(sets.value, step.miss) : undefined);
function whyMissAt(i: number): (x: PatternSet) => string | null {
  const c = ctx.value;
  const add = setByKey(sets.value, pat.value.steps[i]?.set ?? "");
  if (!c || !add) return () => null;
  // 外す時は付けた手の後の状態 (増強ならマジック、それ以外はレア)
  const st = { ...stateBefore(c, pat.value.steps, i + 1), rarity: (add.kind === "augment" ? "magic" : "rare") as "magic" | "rare" };
  return (x) => checkRemoval(add, x) ?? (x.kind === "annul" ? null : checkSet(c, st, x));
}
/** 手のカードの色 (打つ物の種類。2 狙う MOD の予定の色と同じ: 高貴・カオス 黄 / 冒涜 深緑 / エッセンス 水色) */
const KIND_TONE: Record<string, string> = {
  exalt: "border-yellow-500/60", chaos: "border-yellow-500/60", desecrate: "border-green-700/90", essence: "border-sky-400/60", essence_perfect: "border-sky-400/60",
  annul: "border-white/40", rune: "border-amber-400/60", transmute: "border-blue-400/50", augment: "border-blue-400/50", regal: "border-blue-400/50", alchemy: "border-blue-400/50",
};
/** カードの見出し (付ける物を短く: 「火耐性 T3+」) */
function cardTitle(r: Row): string {
  if (r.set?.kind === "annul") return "外れを消す";
  if (!r.step.target) return r.set?.kind === "rune" ? "ルーン未定" : "MOD 未定";
  if (r.step.target === ANY_TARGET) return "打つだけ";
  if (r.set?.kind === "rune") return RUNES[r.step.target]?.ja ?? r.step.target;
  if (isDouble(r.set) && r.step.target2) return r.step.target3 ? `${[r.step.target, r.step.target2, r.step.target3].map(cardTitleOf).join(" / ")} のどれか 2 つ` : `${cardTitleOf(r.step.target)} + ${cardTitleOf(r.step.target2)}`;
  if (hasCands(r.set) && r.step.target2) return `${[r.step.target, ...candsOf(r)].map(cardTitleOf).join(" / ")} のどれか`;
  return cardTitleOf(r.step.target);
}
/** 狙う MOD の短い名前 (「火耐性 T3+」) */
function cardTitleOf(modId: string): string {
  const full = modLabel(modId);
  const rank = /T(\d+) 以上/.exec(full)?.[1];
  // 「(27-31)から(39-41)の火ダメージ」の「〜から〜の」も数ごと外す (「からの火ダメージ」になっていた)
  const name = full.replace(/\s*T\d+ 以上.*$/, "").replace(/[+-]?\(?\d[\d.]*(?:[-—~]\d[\d.]*)?\)?\s*から\s*[+-]?\(?\d[\d.]*(?:[-—~]\d[\d.]*)?\)?\s*の?/g, "").replace(/[+-]?\(?\d[\d.]*(?:[-—~]\d[\d.]*)?\)?/g, "").replace(/\s*%/g, "").replace(/\s+/g, " ").trim();
  return rank ? `${name} T${rank}+` : name;
}
/** カードの絵 (打つ物。ルーンの手は差すルーン) */
function cardIcon(r: Row): string | null {
  if (r.set?.kind === "rune") return r.step.target ? iconOf(`rune:${r.step.target}`) || null : null;
  return r.set?.currency ? iconOf(r.set.currency) || null : null;
}
/** 打つ物の短い名前 (お告げはアイコンだけ) */
const setShort = (x: PatternSet): string => (x.currency ? nameOf(x.currency) : x.kind === "essence" ? "エッセンス" : x.kind === "essence_perfect" ? "パーフェクトエッセンス" : x.kind === "rune" ? "差す" : "");
/**
 * 左右 2 枠 (2026-10-07 オーナー採用「ほぼクラフトエグザイルだけどまぁいいでしょう」)。左はツリーだけ (自分の中で送る)、
 * 右は押した手を決める枠 (動かない)。開く・閉じる・消す・戻すでページも左のツリーも動かさない
 * (オーナー「閉じたら閉じる前に戻ったらいい」「一回一回スクロールしないといけないのがだるい」「最小画面で見てる」)
 */
const treeEl = ref<HTMLElement | null>(null);
/**
 * 開いた時 (パターンを切り替えた時も) は、自分で作る手が見える位置で始める。フラクチャーまでの固定の手は上に送れば見える
 * (2026-10-07: 手袋だと固定の手 4 つでツリーが埋まり、毎回送らないと自分の手が見えなかった)
 */
const ownStart = ref<HTMLElement | null>(null);
function treeToOwn(): void {
  void nextTick(() => {
    const box = treeEl.value, el = ownStart.value;
    if (!box || !el || box.scrollHeight <= box.clientHeight) return;
    box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - 8;
  });
}
onMounted(treeToOwn);
watch(active, treeToOwn);
/** その手のカードがツリーの中で見えるようにだけ送る (見えていれば動かさない。ページは動かさない) */
function showInTree(i: number): void {
  void nextTick(() => {
    const box = treeEl.value, el = box?.querySelector<HTMLElement>(`[data-step="${i}"]`);
    if (!box || !el) return;
    const r = el.getBoundingClientRect(), v = box.getBoundingClientRect();
    if (r.top < v.top) box.scrollTop += r.top - v.top - 8;
    else if (r.bottom > v.bottom) box.scrollTop += r.bottom - v.bottom + 8;
  });
}
function closeFrame(): void {
  focusRow.value = null;
  editPart.value = null;
}
/** 選び直している物 (無ければ、まだ決めていない一番手前の物) */
const editPart = ref<"set" | "target" | "target2" | "miss" | "single" | "lost" | "done" | null>(null);
/** 付ける物を選んだ。ルーンはルーンのセットに決まる。今のセットで付かない物ならセットを選び直し */
function pickTarget(i: number, key: string): void {
  const isRune = props.order.includes(`rune:${key}`);
  const runeSet = sets.value.find((x) => x.kind === "rune");
  const cur = setByKey(sets.value, pat.value.steps[i]?.set ?? "");
  const c = ctx.value;
  const t = c?.targets.find((x) => x.modId === key);
  const curOk = !!cur && !!c && (key === ANY_TARGET ? ANY_KINDS.has(cur.kind) : isRune ? cur.kind === "rune" : cur.kind !== "rune" && !!t && !checkTarget(c, stateBefore(c, pat.value.steps, i), cur, t));
  patch(i, { target: key, ...(isRune && runeSet ? { set: runeSet.key, onMiss: "next" as MissRule, miss: null } : key === ANY_TARGET ? { onMiss: "next" as MissRule, miss: null } : {}), ...(curOk || isRune ? {} : { set: "" }) });
  // 選んでもその段に留まる (お告げなど、続けて選ぶ物があるので。進むのは下のボタン。2026-10-07 オーナー「選択した瞬間次にいかなくさせる」)
  editPart.value = "target";
}
/** 付けるカレンシーの棚: 選んだ付ける物に付けられない物は理由つきで選べない */
function whyAddAt(i: number): (x: PatternSet) => string | null {
  const c = ctx.value;
  if (!c) return () => null;
  const st = stateBefore(c, pat.value.steps, i);
  const tg = pat.value.steps[i]?.target;
  const t = tg ? c.targets.find((x) => x.modId === tg) : undefined;
  return (x) => checkSet(c, st, x) ?? (tg === ANY_TARGET ? checkAny(st, x) : t && x.kind !== "rune" ? checkTarget(c, st, x, t) : x.kind === "rune" ? "付ける物がルーンの時だけ" : null);
}
function partOf(i: number, r: Row): "set" | "target" | "target2" | "miss" | "single" | "lost" | "done" {
  if (focusRow.value === i && editPart.value) return editPart.value;
  if (!r.step.target) return "target";
  if (!r.set) return "set";
  if (needs2(r) && !r.step.target2) return "target2";
  return "done";
}
/**
 * その手の付ける側の棚: 打つだけの手はランダムに付く物だけ、それ以外はルーンを出さない (ルーンは付ける物でルーンを選ぶと決まる)。
 * 使えない物を灰色で並べても選べないだけなので出さない (2026-10-07 オーナー「打つだけの選択時、流れがおかしい」)
 */
function addSetsFor(r: Row): PatternSet[] {
  if (r.step.target === ANY_TARGET) return addSets.value.filter((x) => ANY_KINDS.has(x.kind));
  return addSets.value.filter((x) => x.kind !== "rune");
}
/** 付ける側の棚 (消去は外す側にだけ出す。2026-10-07 オーナー「付ける時は削除の手とか表示しなくてもおｋ」) */
const addSets = computed(() => sets.value.filter((x) => x.kind !== "annul"));
/** やり直しを選べる手か (外れがあって、レアリティが変わらない手) */
const hasMiss = (r: Row): boolean => !!r.set && !noMiss(r.set) && !RARITY_CHANGE.has(r.set.kind) && r.step.target !== ANY_TARGET;
/** 外れの枝を出す手 (打つだけの手は外れが無い) */
const showMiss = (r: Row): boolean => !!r.set && !noMiss(r.set) && r.step.target !== ANY_TARGET;
/** 手のカードを押した: 右の枠でその手を決める (もう一度押すと閉じる)。外れの枝はやり直しだけ */
function selectRow(i: number, part: "miss" | "single" | "lost" | null = null): void {
  focusPre.value = null;
  if (focusRow.value === i && editPart.value === part) { closeFrame(); return; }
  focusRow.value = i;
  editPart.value = part;
}
/**
 * 下のボタン 1 つで進む (棚は押した時にそのまま入る。決定ボタンが 2 つ並ばないように)。
 * カレンシーの次は、やり直しを選べる手ならやり直し、無ければ決まり (MOD → カレンシー → やり直しの順)
 */
function nextPart(i: number): void {
  const r = rows.value[i];
  if (!r) return;
  const now = partOf(i, r);
  if (now === "target" && r.step.target) editPart.value = r.set?.kind === "rune" ? "done" : "set";
  else if (now === "set" && r.set && needs2(r)) editPart.value = "target2";
  else if ((now === "set" || now === "target2") && r.set && hasMiss(r)) editPart.value = "miss";
  else if (now === "miss" && needs2(r)) editPart.value = "single";
  else if ((now === "miss" || now === "single" || now === "target2") && presentMods(i, r).length) editPart.value = "lost";
  else confirmStep(i);
}
/** 偉大 (2 つ) の手で、2 つ目の MOD を選ぶ段がある (打つだけの手は無し) */
const needs2 = (r: Row): boolean => isDouble(r.set) && r.step.target !== ANY_TARGET;
/** 候補を足せる手 (ガチャ。偉大でなければ任意、どれか 1 つで当たり) */
const canCands = (r: Row): boolean => hasCands(r.set) && !!r.step.target && r.step.target !== ANY_TARGET;
/** 下のボタンが「この手にする」になる段 (この後に選ぶ物が無い) */
function lastPart(i: number, r: Row): boolean {
  const now = partOf(i, r);
  if (now === "set") return !!r.set && !needs2(r) && !hasMiss(r);
  if (now === "target2") return (needs2(r) ? !!r.step.target2 : true) && !hasMiss(r) && !presentMods(i, r).length;
  if (now === "miss") return !needs2(r) && !presentMods(i, r).length;
  if (now === "single") return !presentMods(i, r).length;
  return now === "lost" || now === "done";
}
/** 偉大の手で片方当たった後の 1 発 (選んだ物、無ければ同じカレンシーで偉大だけ外した物) */
function singleSet(r: Row): PatternSet | undefined {
  if (!r.set || !needs2(r)) return undefined;
  return setByKey(sets.value, r.step.single ?? singleKeyOf(r.set));
}
/**
 * 「MOD が消えたら」の対象: この手を打つ時に付いている狙い (前の手で付けた物) と、偉大の手で狙う 2 つ。固定 (フラクチャー) は消えないので出さない
 * (2026-10-07 オーナー「フラクチャーされた奴は選択ないから省いて」)
 */
function presentMods(i: number, r: Row): string[] {
  const c = ctx.value;
  if (!c || !r.set || r.set.kind === "rune") return [];
  const out = [...stateBefore(c, pat.value.steps, i).placed];
  if (needs2(r) && r.step.target && r.step.target !== ANY_TARGET) out.push(r.step.target, ...candsOf(r));
  return [...new Set(out)].filter((id) => c.targets.find((t) => t.modId === id)?.method !== "fracture");
}
/** その MOD を付けた手 (i 手目まで。「MOD が消えたら」の既定の戻り先) */
function placedAt(id: string, i: number): number {
  for (let j = i; j >= 0; j--) { const st = pat.value.steps[j]!; if (st.target === id || st.target2 === id || st.target3 === id) return j; }
  return i;
}
const gotoOf = (i: number, r: Row, id: string): number => r.step.lostGoto?.[id] ?? placedAt(id, i);
/** 偉大の手で一緒に狙う候補 (target2・target3) を入れ切りする (最大 2 つ) */
function toggleCand(i: number, id: string): void {
  const st = pat.value.steps[i]!;
  const cur = [st.target2, st.target3].filter((x): x is string => !!x);
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-2);
  patch(i, { target2: next[0] ?? null, target3: next[1] ?? null });
  editPart.value = "target2";
}
const candsOf = (r: Row): string[] => [r.step.target2, r.step.target3].filter((x): x is string => !!x);
function setGoto(i: number, id: string, g: number): void {
  patch(i, { lostGoto: { ...(pat.value.steps[i]?.lostGoto ?? {}), [id]: g } });
  editPart.value = "lost";
}
/** やり直しの札: そのまま / 消去 / カオス / ほか (パーフェクトエッセンス・骨) */
const missMore = ref(false);
function missKind(r: Row): "none" | "annul" | "chaos" | "other" {
  const x = missSet(r.step);
  return !x ? "none" : x.kind === "annul" ? "annul" : x.kind === "chaos" ? "chaos" : "other";
}
function setMiss(i: number, kind: "annul" | "chaos", currency: string, omens: readonly string[]): void {
  // 組み合わせの無いお告げは外す (カオスの強さを変えた時など)
  const key = `${kind}|${currency}|${omens.join("+")}`;
  const ok = removals.value.find((x) => x.key === key && !whyMissAt(i)(x));
  const fallback = removals.value.find((x) => x.kind === kind && x.currency === currency && !x.omens.length);
  const x = ok ?? fallback;
  if (x) patch(i, { miss: x.key, onMiss: "annul_redo" });
  editPart.value = "miss";
}
function pickMissKind(i: number, k: "none" | "annul" | "chaos"): void {
  if (k === "none") { patch(i, { miss: null, onMiss: "next" }); editPart.value = "miss"; return; }
  const cur = missSet(pat.value.steps[i]!);
  if (cur?.kind === k) { editPart.value = "miss"; return; }
  setMiss(i, k, k === "annul" ? "annul" : "chaos", []);
}
/** 選んだ消し方に付けられるお告げ (1 つ選ぶ。無しも) */
function missOmenChoices(r: Row): Array<{ key: string; ja: string; omens: string[]; on: boolean; why: string | null }> {
  const cur = missSet(r.step);
  if (!cur) return [];
  const i = rows.value.indexOf(r);
  const list = removals.value.filter((x) => x.kind === cur.kind && x.currency === cur.currency);
  return list.map((x) => ({ key: x.omens[0] ?? "", ja: x.omens.length ? x.omens.map((o) => jaOfOmen(o) ?? o).join(" + ") : "なし", omens: [...x.omens], on: x.key === cur.key, why: whyMissAt(i)(x) }));
}
/** 選んだ消し方で、付いている狙いを巻き込む確率 (1 行) */
function missRisk(i: number, r: Row): { text: string; bad: boolean } {
  const x = missSet(r.step);
  const c = ctx.value;
  if (!x) return { text: "外れた MOD は残ったまま次の手へ進む", bad: false };
  if (!c) return { text: "", bad: false };
  if (x.omens.includes("OmenofLight")) return { text: "冒涜の MOD だけを消す (付いている狙いは消えない)", bad: false };
  if (x.omens.includes("OmenofWhittling")) return { text: "一番 MOD レベルの低い物を入れ替える (外れが狙いより低ければ安全、高ければ狙いを消す)", bad: true };
  if (x.kind !== "annul" && x.kind !== "chaos") return { text: "", bad: false };
  const side = x.omens.some((o) => /Sinistral/.test(o)) ? "prefix" : x.omens.some((o) => /Dextral/.test(o)) ? "suffix" : null;
  const sideOfId = (id: string): "prefix" | "suffix" => (c.data.mods.get(id)?.type === "suffix" ? "suffix" : "prefix");
  const n = presentMods(i, r).filter((id) => !(needs2(r) && [r.step.target, ...candsOf(r)].includes(id)) && (!side || sideOfId(id) === side)).length;
  const verb = x.kind === "chaos" ? "入れ替える" : "消す";
  // 偉大の手は「1 つだけ当たり」の時、当たった方も消す候補に入る
  if (needs2(r)) return { text: `どれも外れの時: ${n ? `狙いを巻き込む ${n}/${n + 1}` : "安全"} / 1 つだけ当たりの時: 当たった MOD を巻き込む ${n + 1}/${n + 2}`, bad: true };
  return n ? { text: `外れと、付いている狙い ${n} つのどれかを${verb} → 狙いを巻き込む ${n}/${n + 1}`, bad: true } : { text: `外れを${verb} (この時点で付いている狙いは無いので安全)`, bad: false };
}
/** 1 発の棚: 1 つずつ付ける高貴 (偉大なし) */
const singleSets = computed(() => addSets.value.filter((x) => x.kind === "exalt" && !isDouble(x)));
/** この手だけ消す (ツリーの位置はそのまま) */
function removeAt(i: number): void {
  remove(i);
  closeFrame();
}
/** 右の枠の上の決める順 (済み / いま / まだ) */
interface Chip { part: "target" | "set" | "target2" | "miss" | "single" | "lost"; name: string; icons: string[]; text: string; state: "done" | "now" | "todo" }
function chipsOf(i: number, r: Row): Chip[] {
  const now = partOf(i, r);
  const st = (part: Chip["part"], done: boolean): Chip["state"] => (now === part ? "now" : done ? "done" : "todo");
  const icons = (x: PatternSet | undefined): string[] => (x ? [x.currency, ...x.omens].filter((c) => c && iconOf(c)) : []);
  const isRune = r.set?.kind === "rune";
  const out: Chip[] = [{ part: "target", name: isRune ? "ルーン" : "MOD", icons: [], text: !r.step.target ? "" : needs2(r) && r.step.target !== ANY_TARGET ? cardTitleOf(r.step.target) : cardTitle(r), state: st("target", !!r.step.target) }];
  if (!isRune) out.push({ part: "set", name: "カレンシー", icons: icons(r.set), text: r.set && !icons(r.set).length ? setShort(r.set) : "", state: st("set", !!r.set) });
  if (needs2(r)) out.push({ part: "target2", name: "一緒に狙う MOD", icons: [], text: candsOf(r).map(cardTitleOf).join(" / "), state: st("target2", !!r.step.target2) });
  else if (canCands(r)) out.push({ part: "target2", name: "ほかの候補 (任意)", icons: [], text: candsOf(r).map(cardTitleOf).join(" / "), state: now === "target2" ? "now" : "done" });
  if ((!r.set && r.step.target !== ANY_TARGET) || hasMiss(r)) out.push({ part: "miss", name: "付かなかったら", icons: icons(missSet(r.step)), text: r.set && !r.step.miss ? "選択無し" : "", state: st("miss", hasMiss(r)) });
  if (needs2(r)) out.push({ part: "single", name: "片方当たり後の 1 発", icons: icons(singleSet(r)), text: "", state: st("single", true) });
  if (presentMods(i, r).length) out.push({ part: "lost", name: "MOD が外れたら", icons: [], text: "", state: st("lost", true) });
  return out;
}
/** 左右の枠の高さ (最小の窓 1660×860 でもページを送らずに収まる) */
const paneHeight = "max(420px, calc(100vh - 430px))";
/** ツリーの右上の ×: その手から後を全部消す (2 回押し。2026-10-07 オーナー「ツリーから × したらそれ以降の流れを消す」) */
const cutArmed = ref<number | null>(null);
function cutFrom(i: number): void {
  if (cutArmed.value !== i) { cutArmed.value = i; setTimeout(() => { if (cutArmed.value === i) cutArmed.value = null; }, 3000); return; }
  cutArmed.value = null;
  setSteps((list) => list.slice(0, i));
  if (focusRow.value != null && focusRow.value >= i) closeFrame();
}
function addStep(): void {
  const c = ctx.value;
  if (!c) return;
  setSteps((list) => [...list, { set: "", target: null, onMiss: "next" }]);
  editPart.value = null;
  focusPre.value = null;
  focusRow.value = pat.value.steps.length - 1;
  showInTree(pat.value.steps.length - 1);
}
/**
 * 「この手にする」: 設定を閉じて、それが最後の手なら下に次の手を足して棚を開く (2026-10-06 オーナー「1 手決まって進むと下に手を追加」
 * 「付ける MOD を選んだ瞬間に枠が足される、この手にするボタンを押さないと進まないように」)。打てない手は押せない
 */
/** 5 順番計画の付ける物を、パターンの手で全部並べたか */
const allPlaced = computed(() => props.order.every((k) => pat.value.steps.some((st) => st.target === k.slice(k.indexOf(":") + 1))));
function confirmStep(i: number): void {
  const r = rows.value[i];
  if (!r || r.bad) return;
  // 最後の手なら次の手を足す。ただし付ける物を全部並べ終わったら足さずに閉じる (付けられる物の無い手が出来ていた)
  if (i === rows.value.length - 1 && !allPlaced.value) void nextTick(() => addStep());
  else closeFrame();
}
function patch(i: number, p: Partial<PatternStep>): void {
  setSteps((list) => list.map((x, k) => (k === i ? { ...x, ...p } : x)));
}
function onSet(i: number, key: string): void {
  // セットを変えたら付ける物は選び直し (打ち方で付けられる物が違う)。外れた時は選べる物に寄せる
  const set = setByKey(sets.value, key);
  const cur = pat.value.steps[i]!;
  // やり直せない手は「そのまま次へ」、ほかは「やり直し」。外す物がその手で使えなくなったら選び直し
  const miss: MissRule = set && RARITY_CHANGE.has(set.kind) ? "next" : "annul_redo";
  const rm = cur.miss ? setByKey(sets.value, cur.miss) : undefined;
  const keepMiss = cur.miss && !(rm && set && checkRemoval(set, rm));
  if (!hasCands(set)) patch(i, { target2: null, target3: null });
  patch(i, { set: key, onMiss: keepMiss ? "annul_redo" : miss === "annul_redo" ? "next" : miss, ...(keepMiss ? {} : { miss: null }) });
}

function move(i: number, d: -1 | 1): void {
  setSteps((list) => { const j = i + d; [list[i], list[j]] = [list[j]!, list[i]!]; return list; });
}
const remove = (i: number): void => setSteps((list) => list.filter((_, k) => k !== i));

function addPattern(copy: boolean): void {
  const n = s.simPatterns.value.length + 1;
  s.simPatterns.value = [...s.simPatterns.value, { name: `パターン ${n}`, steps: copy ? pat.value.steps.map((x) => ({ ...x })) : [] }];
  active.value = s.simPatterns.value.length - 1;
}
/** 名前を付け替えているタブ */
const renaming = ref<number | null>(null);
function rename(i: number, name: string): void {
  if (renaming.value !== i) return;
  renaming.value = null;
  const n = name.trim();
  if (n && n !== s.simPatterns.value[i]?.name) s.simPatterns.value = s.simPatterns.value.map((p, k) => (k === i ? { ...p, name: n } : p));
}
function removePattern(): void {
  if (s.simPatterns.value.length <= 1) return;
  const k = Math.min(active.value, s.simPatterns.value.length - 1);
  // 番号のままの名前だけ振り直す (付けた名前は残す)
  s.simPatterns.value = s.simPatterns.value.filter((_, i) => i !== k).map((p, i) => (/^パターン \d+$/.test(p.name) ? { ...p, name: `パターン ${i + 1}` } : p));
  active.value = Math.max(0, k - 1);
}
defineExpose({ rows });
</script>

<template>
  <div class="text-[11px]">
    <!-- パターンのタブ -->
    <div class="mb-1.5 flex flex-wrap items-center gap-1">
      <!-- タブはダブルクリックで名前を付け替える (2026-10-07 オーナー「名前も自分で変えて」。番号だけだと 10 個並ぶと取り違える) -->
      <template v-for="(p, i) in s.simPatterns.value" :key="i">
        <input v-if="renaming === i" :ref="(el) => { if (el) (el as HTMLInputElement).focus(); }" :value="p.name" class="w-40 rounded-full border border-amber-400/60 bg-black/50 px-2.5 py-0.5 outline-none" @keydown.enter="($event.target as HTMLInputElement).blur()" @keydown.esc="renaming = null" @blur="rename(i, ($event.target as HTMLInputElement).value)" />
        <button v-else type="button" class="rounded-full px-2.5 py-0.5" :class="i === Math.min(active, s.simPatterns.value.length - 1) ? 'bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/60' : 'border border-white/15 opacity-70 hover:opacity-100'" title="ダブルクリックで名前を変える" @click="active = i" @dblclick="locked || (renaming = i)">{{ p.name }} <span class="opacity-60">({{ p.steps.length }} 手)</span></button>
      </template>
      <template v-if="!locked">
        <button type="button" class="rounded border border-white/15 px-1.5 opacity-70 hover:opacity-100" title="空のパターンを足す" @click="addPattern(false)">＋</button>
        <button type="button" class="rounded border border-white/15 px-1.5 opacity-70 hover:opacity-100" title="このパターンを写して足す (少しだけ変えて比べる時に)" @click="addPattern(true)">⧉</button>
        <button type="button" class="rounded border border-white/15 px-1.5 opacity-70 hover:opacity-100 disabled:opacity-30" :disabled="s.simPatterns.value.length <= 1" :title="s.simPatterns.value.length <= 1 ? 'パターンが 1 つの時は消せない' : 'このパターンを消す'" @click="removePattern">×</button>
        <button type="button" class="ml-1 rounded-lg border border-white/20 px-2 py-0.5 hover:bg-white/10 disabled:opacity-30" :disabled="!history.length" :title="history.length ? 'パターンの直前の操作を 1 つ取り消す' : '戻せる操作がまだ無い'" @click="undoPattern">↶ 1 つ戻す</button>
      </template>
    </div>

    <!-- 左: ツリー (自分の中で送る) / 右: 押した手を決める枠 + その時点のアイテム (動かない) -->
    <div class="flex gap-3" :style="{ height: paneHeight }">
      <div ref="treeEl" class="w-[372px] shrink-0 overflow-y-auto rounded-lg bg-black/25 p-2 [overflow-anchor:none]">
        <!--
          フラクチャーまで: 後の手と同じカード・同じ枝で見せる (変えられない。費用は 4 最安値スタートの計算)。押すと右のアイテムがその時点に
          (2026-10-07 オーナー「小さすぎてとりあえず表示しましたみたい、フラクチャー後の流れと同じ UI でクリックできない感じでおｋ」)
        -->
        <template v-for="(n, k) in preNodes" :key="'pre' + k">
          <div v-if="k > 0" class="ml-[6.5rem] flex h-4 items-center">
            <span class="h-full w-px bg-emerald-400/50"></span>
            <span class="ml-1 text-[9px] text-emerald-300/80">当たり</span>
          </div>
          <div class="flex items-start">
            <button type="button" class="w-52 shrink-0 rounded-md border bg-gradient-to-b from-white/[0.05] to-black/50 text-left" :class="[n.tone, focusPre === k ? 'ring-2 ring-sky-400/70' : 'hover:brightness-125']" title="4 最安値スタートの計算 (ここは変えられない)。押すとその時点のアイテム" @click="focusPre = focusPre === k ? null : k; focusRow = null; editPart = null">
              <span class="flex items-center gap-1 border-b border-white/10 px-1.5 py-0.5">
                <b class="text-sky-200">{{ ["①", "②", "③", "④"][k] }}</b>
                <span class="truncate font-bold">{{ n.title }}</span>
                <span class="ml-auto shrink-0 whitespace-nowrap text-[9px] opacity-40">固定</span>
              </span>
              <span class="flex items-center gap-1 px-1.5 py-1">
                <img v-for="c in n.icons" :key="c" :src="iconOf(c)" alt="" class="h-6 w-6 object-contain" />
                <img v-if="!n.icons.length && baseArt(s.base.value)" :src="baseArt(s.base.value)!" alt="" class="h-6 w-6 object-contain" />
                <span class="truncate opacity-70">{{ n.sub }}</span>
              </span>
            </button>
            <span v-if="n.miss" class="flex flex-col">
              <span class="flex items-center">
                <span class="h-px w-4 border-t border-dashed border-rose-400/60"></span>
                <span class="flex items-center gap-1 rounded-md border border-rose-400/40 bg-rose-950/30 px-1.5 py-1">
                  <span class="text-rose-300">外れ</span>
                  <template v-if="n.miss.icons.length">
                    <span class="opacity-60">→</span>
                    <img v-for="c in n.miss.icons" :key="c" :src="iconOf(c)" alt="" class="h-5 w-5 object-contain" />
                  </template>
                  <span v-else class="text-rose-200">→ 白から</span>
                </span>
              </span>
              <span class="flex items-center text-[10px] text-amber-200/90">
                <span class="text-rose-300">◀</span>
                <span class="h-px w-5 border-t border-dashed border-rose-400/60"></span>
                <span class="ml-1">{{ n.miss.icons.length ? "付くまで繰り返す" : "当たり 1/3" }}</span>
              </span>
            </span>
          </div>
        </template>
        <!-- ここから自分で作る手 -->
        <div v-if="preNodes.length" class="my-2 flex items-center gap-2 text-[10px] text-amber-200/80">
          <span class="h-px flex-1 bg-amber-400/30"></span><span ref="ownStart">フラクチャー済み · ここから作る</span><span class="h-px flex-1 bg-amber-400/30"></span>
        </div>
        <div v-else class="w-52 rounded-md border border-white/20 bg-black/40 px-2 py-0.5 opacity-80">始め: 白のベース</div>
        <template v-for="(r, i) in rows" :key="i">
          <!-- 当たりの線 -->
          <div v-if="i > 0 || !preNodes.length" class="ml-[6.5rem] flex h-4 items-center">
            <span class="h-full w-px bg-emerald-400/50"></span>
            <span class="ml-1 text-[9px] text-emerald-300/80">{{ i === 0 ? "" : "当たり" }}</span>
          </div>
          <div class="flex items-start">
            <!-- 手のカード -->
            <div :data-step="i" class="relative w-52 shrink-0 rounded-md border bg-gradient-to-b from-white/[0.05] to-black/50 transition" :class="[r.set ? KIND_TONE[r.set.kind] ?? 'border-white/20' : 'border-dashed border-white/25', focusRow === i ? 'ring-2 ring-amber-400/70' : 'hover:brightness-125', r.bad ? 'border-rose-500/80' : '']">
              <!-- 右上の ×: この手から後を全部消す (2 回押し) -->
              <button v-if="!locked" type="button" class="absolute right-0.5 top-0.5 z-10 rounded px-1 leading-none" :class="cutArmed === i ? 'bg-rose-600/80 text-white' : 'opacity-50 hover:bg-rose-600/40 hover:opacity-100'" :title="cutArmed === i ? 'もう一度押すと、この手から後を全部消す' : 'この手から後を全部消す'" @click.stop="cutFrom(i)">{{ cutArmed === i ? "後ろを全部消す?" : "×" }}</button>
              <button type="button" class="block w-full text-left" :title="r.bad ?? undefined" @click="selectRow(i)">
                <span class="flex items-center gap-1 border-b border-white/10 px-1.5 py-0.5 pr-6">
                  <b class="text-amber-200">{{ i + 1 }}</b>
                  <span class="truncate" :class="r.step.target || r.set?.kind === 'annul' ? 'font-bold' : 'opacity-40'">{{ cardTitle(r) }}</span>
                </span>
                <span class="flex items-center gap-1 px-1.5 py-1">
                  <img v-if="cardIcon(r)" :src="cardIcon(r)!" alt="" class="h-6 w-6 object-contain" />
                  <span v-else class="h-6 w-6 rounded border border-dashed border-white/25 bg-black/40"></span>
                  <img v-for="o in r.set?.omens ?? []" :key="o" :src="iconOf(o)" alt="" class="h-6 w-6 object-contain" :title="jaOfOmen(o) ?? o" />
                  <span class="truncate" :class="r.set ? 'opacity-70' : 'opacity-35'">{{ r.set ? setShort(r.set) : "カレンシー未定" }}</span>
                </span>
              </button>
            </div>
            <!-- 外れの枝: やり直す手は、外れ → やり直しのカレンシー → カードに戻る線で「付くまで繰り返す」 -->
            <span v-if="showMiss(r) && !needs2(r)" class="flex flex-col">
              <span class="flex items-center">
                <span class="h-px w-4 border-t border-dashed border-rose-400/60"></span>
                <button type="button" class="flex items-center gap-1 rounded-md border border-rose-400/40 bg-rose-950/30 px-1.5 py-1 text-left hover:brightness-125" :class="focusRow === i && partOf(i, r) === 'miss' ? 'ring-2 ring-rose-400/70' : ''" :title="hasMiss(r) ? '押すとやり直しを選ぶ' : 'レアリティが変わる手はやり直せない'" :disabled="!hasMiss(r) || locked" @click="selectRow(i, 'miss')">
                  <span class="text-rose-300">外れ</span>
                  <template v-if="missSet(r.step)">
                    <span class="opacity-60">→</span>
                    <img v-if="iconOf(missSet(r.step)!.currency)" :src="iconOf(missSet(r.step)!.currency)" alt="" class="h-5 w-5 object-contain" />
                    <span v-else class="h-5 w-5 rounded border border-dashed border-white/25"></span>
                    <img v-for="o in missSet(r.step)!.omens" :key="o" :src="iconOf(o)" alt="" class="h-5 w-5 object-contain" />
                  </template>
                  <span v-else class="opacity-70">→ 次へ</span>
                </button>
              </span>
              <span v-if="missSet(r.step)" class="flex items-center text-[10px] text-amber-200/90">
                <span class="text-rose-300">◀</span>
                <span class="h-px w-5 border-t border-dashed border-rose-400/60"></span>
                <span class="ml-1">付くまで繰り返す</span>
              </span>
            </span>
            <span v-if="r.risk?.bad" class="ml-1 mt-2 text-rose-300" :title="r.risk.text">⚠</span>
          </div>
          <!--
            偉大 (2 つ狙い) の外れ方ごとの枝 (2026-10-07 オーナー「狙い MOD 以外が消えた場合の外れのツリーが横に何個かいるね」)。
            横に並べるとツリーの幅に入らないので、カードの下に段下げして並べる。押すとその枝の打ち方を選ぶ
          -->
          <div v-if="needs2(r) && r.set" class="ml-3 mt-1 space-y-1 border-l border-dashed border-rose-400/50 pl-2 text-[10px]">
            <button type="button" class="flex items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-white/5" :disabled="locked" title="押すとやり直し (消去) を選ぶ" @click="selectRow(i, 'miss')">
              <span class="rounded bg-rose-950/50 px-1 text-rose-300">どれも外れ</span>
              <span class="opacity-60">→</span>
              <img v-if="missSet(r.step) && iconOf(missSet(r.step)!.currency)" :src="iconOf(missSet(r.step)!.currency)" alt="" class="h-4 w-4 object-contain" />
              <span>2 枠空くまで</span>
              <span class="text-amber-200/90">◀ 偉大に戻る</span>
            </button>
            <div>
              <button type="button" class="flex items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-white/5" :disabled="locked" title="押すとやり直し (消去) を選ぶ" @click="selectRow(i, 'miss')">
                <span class="rounded bg-amber-900/40 px-1 text-amber-200">1 つだけ当たり</span>
                <span class="opacity-60">→</span>
                <img v-if="missSet(r.step) && iconOf(missSet(r.step)!.currency)" :src="iconOf(missSet(r.step)!.currency)" alt="" class="h-4 w-4 object-contain" />
                <span>消去</span>
              </button>
              <button type="button" class="ml-4 flex items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-white/5" :disabled="locked" title="押すと 1 発の打ち方を選ぶ" @click="selectRow(i, 'single')">
                <span class="opacity-60">├ 外れが消えた →</span>
                <img v-for="c in [singleSet(r)?.currency, ...(singleSet(r)?.omens ?? [])].filter((x) => x && iconOf(x))" :key="c" :src="iconOf(c!)" alt="" class="h-4 w-4 object-contain" />
                <span>1 発</span>
                <span class="text-amber-200/90">↺ 付くまで</span>
              </button>
            </div>
          </div>
          <!-- MOD が外れたら (固定以外、MOD ごとに戻る手)。押すと右の枠で戻る手を選ぶ -->
          <div v-if="r.set && presentMods(i, r).length" class="ml-3 space-y-0.5 border-l border-dashed border-sky-400/40 pl-2 text-[10px]" :class="needs2(r) ? '' : 'mt-1'">
            <button v-for="id in presentMods(i, r)" :key="id" type="button" class="flex items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-white/5" :disabled="locked" title="押すと戻る手を選ぶ" @click="selectRow(i, 'lost')">
              <span class="max-w-[9rem] truncate font-bold">{{ cardTitleOf(id) }}</span>
              <span class="opacity-60">が外れたら →</span>
              <span class="text-amber-200/90">◀ {{ gotoOf(i, r, id) + 1 }} 手目</span>
            </button>
          </div>
        </template>
        <template v-if="!locked">
          <div class="ml-[6.5rem] h-3 w-px bg-white/20"></div>
          <button type="button" class="w-52 rounded-md border border-dashed border-amber-400/50 py-1 text-amber-200 hover:bg-amber-500/10" @click="addStep">＋ 手を足す</button>
        </template>
      </div>

      <!-- 右: 押した手を決める枠 -->
      <div class="flex min-w-0 flex-1 flex-col rounded-lg bg-black/25 px-3 py-2">
        <template v-if="focusRow != null && rows[focusRow] && !locked">
          <!-- いまの手と、決める順 (MOD → カレンシー → やり直し)。済み 緑 / いま 黄、押すとそこだけ選び直す -->
          <div class="mb-2 flex flex-wrap items-center gap-1 border-b border-white/10 pb-2">
            <b class="mr-2 text-[14px] text-amber-200">{{ focusRow + 1 }} 手目</b>
            <template v-for="(c, k) in chipsOf(focusRow, rows[focusRow]!)" :key="c.part">
              <span v-if="k > 0" class="h-px w-4" :class="c.state === 'todo' ? 'bg-white/15' : 'bg-emerald-400/50'"></span>
              <button type="button" class="flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 transition" :class="c.state === 'now' ? 'border-amber-400/80 bg-amber-500/15 text-amber-50 shadow-[0_0_10px_rgba(251,191,36,0.25)]' : c.state === 'done' ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-50 hover:border-emerald-300/70' : 'border-white/10 opacity-40'" :disabled="c.state === 'todo'" @click="editPart = c.part">
                <span class="grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold" :class="c.state === 'now' ? 'bg-amber-400 text-black' : c.state === 'done' ? 'bg-emerald-400/90 text-black' : 'bg-white/15'">{{ c.state === "done" ? "✓" : k + 1 }}</span>
                <span :class="c.state === 'now' ? 'font-bold' : 'opacity-70'">{{ c.name }}</span>
                <img v-for="ic in c.icons" :key="ic" :src="iconOf(ic)" alt="" class="h-4 w-4 object-contain" />
                <span v-if="c.text">{{ c.text }}</span>
              </button>
            </template>
          </div>
          <!-- いま決める物だけ (足りない時はこの枠の中だけ送る) -->
          <div class="min-h-0 flex-1 overflow-y-auto">
            <template v-if="partOf(focusRow, rows[focusRow]!) === 'target'">
              <!-- 5 順番計画と同じ行 (順番・側・色・段・付け方)。付けられない物は理由を右に -->
              <div class="flex max-w-3xl flex-col gap-1">
                <button v-for="(o, n) in rows[focusRow]!.targetOpts" :key="o.key" type="button" class="group flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-[12px] transition disabled:cursor-not-allowed" :class="rows[focusRow]!.step.target === o.key ? 'border-amber-400/80 bg-amber-500/15 shadow-[0_0_10px_rgba(251,191,36,0.2)]' : o.why ? 'border-white/5 bg-black/20' : 'border-white/10 bg-black/30 hover:border-amber-300/50 hover:bg-white/[0.04]'" :disabled="!!o.why" @click="pickTarget(focusRow, o.key)">
                  <span class="w-4 text-center font-bold" :class="o.why ? 'opacity-30' : 'text-amber-200'">{{ n + 1 }}</span>
                  <span class="w-9 text-[10px]" :class="o.why ? 'opacity-30' : 'opacity-60'">{{ orderInfo?.[order[n]!]?.side }}</span>
                  <span :class="o.why ? 'opacity-35' : orderInfo?.[order[n]!]?.tone">{{ orderInfo?.[order[n]!]?.text ?? o.label }}</span>
                  <span v-if="orderInfo?.[order[n]!]?.rank" class="rounded-sm bg-amber-500/25 px-1 text-[10px] font-bold text-amber-100" :class="o.why ? 'opacity-35' : ''">{{ orderInfo[order[n]!]!.rank }} 以上</span>
                  <span class="text-[10px] opacity-50">{{ orderInfo?.[order[n]!]?.how }}</span>
                  <span class="ml-auto text-[11px]" :class="o.why ? 'text-rose-300/70' : 'opacity-50'">{{ o.why ?? orderInfo?.[order[n]!]?.redo }}</span>
                </button>
                <!-- 打つだけ (何が付いてもいい。後の手で上書き・消す捨ての MOD) -->
                <button type="button" class="mt-1 flex items-center gap-3 rounded-lg border border-dashed px-3 py-2 text-left text-[12px] transition" :class="rows[focusRow]!.step.target === ANY_TARGET ? 'border-amber-400/80 bg-amber-500/15 shadow-[0_0_10px_rgba(251,191,36,0.2)]' : 'border-white/20 bg-black/20 hover:border-amber-300/50 hover:bg-white/[0.04]'" title="狙わずに打つだけ。後の手 (エッセンス・消去など) で上書きする捨ての MOD に" @click="pickTarget(focusRow, ANY_TARGET)">
                  <span class="w-4 text-center text-amber-200">＊</span>
                  <span class="font-bold">何が付いてもいい (打つだけ)</span>
                  <span class="text-[10px] opacity-50">高貴・カオス・骨など</span>
                </button>
              </div>
            </template>
            <template v-else-if="partOf(focusRow, rows[focusRow]!) === 'target2'">
              <!-- 偉大で一緒に狙う候補 (1〜2 つ。最初の MOD と合わせた候補のどれか 2 つが付けば当たり) -->
              <p class="mb-1 text-[11px] opacity-60">{{ needs2(rows[focusRow]!) ? `${cardTitleOf(rows[focusRow]!.step.target!)} と一緒に狙う物を 1〜2 つ (押して入れ切り)。候補のどれか 2 つが付けば当たり` : `${cardTitleOf(rows[focusRow]!.step.target!)} の代わりに付いても当たりにする物 (0〜2 つ、押して入れ切り)。候補のどれか 1 つが付けば当たり` }}</p>
              <div class="flex max-w-3xl flex-col gap-1">
                <button v-for="o in rows[focusRow]!.target2Opts" :key="o.key" type="button" class="flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-[12px] transition disabled:cursor-not-allowed" :class="candsOf(rows[focusRow]!).includes(o.key) ? 'border-amber-400/80 bg-amber-500/15 shadow-[0_0_10px_rgba(251,191,36,0.2)]' : o.why ? 'border-white/5 bg-black/20' : 'border-white/10 bg-black/30 hover:border-amber-300/50 hover:bg-white/[0.04]'" :disabled="!!o.why && !candsOf(rows[focusRow]!).includes(o.key)" @click="toggleCand(focusRow!, o.key)">
                  <span class="w-4 text-center font-bold" :class="o.why ? 'opacity-30' : 'text-amber-200'">{{ o.n + 1 }}</span>
                  <span class="w-9 text-[10px]" :class="o.why ? 'opacity-30' : 'opacity-60'">{{ orderInfo?.[order[o.n]!]?.side }}</span>
                  <span :class="o.why ? 'opacity-35' : orderInfo?.[order[o.n]!]?.tone">{{ orderInfo?.[order[o.n]!]?.text ?? o.label }}</span>
                  <span v-if="orderInfo?.[order[o.n]!]?.rank" class="rounded-sm bg-amber-500/25 px-1 text-[10px] font-bold text-amber-100" :class="o.why ? 'opacity-35' : ''">{{ orderInfo[order[o.n]!]!.rank }} 以上</span>
                  <span class="ml-auto text-[11px]" :class="o.why ? 'text-rose-300/70' : 'opacity-50'">{{ o.why ?? "" }}</span>
                </button>
              </div>
            </template>
            <template v-else-if="partOf(focusRow, rows[focusRow]!) === 'lost'">
              <p class="mb-2 text-[11px] opacity-60">この手を打っている間に、付いている MOD が外れたら何手目からやり直すか (固定は外れないので出さない)</p>
              <div class="flex flex-col gap-2">
                <div v-for="id in presentMods(focusRow, rows[focusRow]!)" :key="id" class="flex flex-wrap items-center gap-2">
                  <span class="min-w-[14rem] rounded-lg border border-white/15 bg-black/30 px-2 py-1 font-bold">{{ cardTitleOf(id) }} が外れたら</span>
                  <span class="opacity-50">→</span>
                  <button v-for="g in focusRow + 1" :key="g" type="button" class="rounded-lg border px-2 py-0.5 disabled:cursor-not-allowed disabled:opacity-30" :class="gotoOf(focusRow, rows[focusRow]!, id) === g - 1 ? 'border-amber-400 bg-amber-500/20 text-amber-100' : 'border-white/15 hover:bg-white/10'" :disabled="rows[g - 1]!.set?.kind === 'rune' || rows[g - 1]!.step.target === ANY_TARGET" :title="rows[g - 1]!.set?.kind === 'rune' ? 'ルーンの手には戻れない' : rows[g - 1]!.step.target === ANY_TARGET ? '打つだけの手には戻れない' : cardTitle(rows[g - 1]!)" @click="setGoto(focusRow!, id, g - 1)">{{ g }} 手目</button>
                  <span class="text-[11px] opacity-50">から</span>
                </div>
              </div>
            </template>
            <template v-else-if="partOf(focusRow, rows[focusRow]!) === 'single'">
              <p class="mb-1 text-[11px] opacity-60">片方だけ当たって、消去で外れが消えた後に、残りの 1 つを打つ手 (既定は同じカレンシーで偉大だけ外した物)</p>
              <StagePatternStepPicker :key="'single' + focusRow" :sets="singleSets" :why="() => null" :current="singleSet(rows[focusRow]!)?.key ?? ''" inline @pick="(k) => { patch(focusRow!, { single: k }); editPart = 'single'; }" />
            </template>
            <template v-else-if="partOf(focusRow, rows[focusRow]!) === 'set'">
              <StagePatternStepPicker :key="'set' + focusRow" :sets="addSetsFor(rows[focusRow]!)" :why="whyAddAt(focusRow)" :current="rows[focusRow]!.step.set" inline @pick="(k) => { onSet(focusRow!, k); editPart = 'set'; }" />
            </template>
            <template v-else-if="partOf(focusRow, rows[focusRow]!) === 'miss'">
              <!--
                外れが付いたら、どう消すか (2026-10-07 オーナー「選択肢が意味わからない、何をする場所なんだろってなる」)。
                大きい札 3 枚 (そのまま / 消去 / カオス) → 選んだ札のお告げ・強さだけ → 巻き込む確率 1 行。パーフェクトエッセンス・骨は畳む
              -->
              <p class="mb-2 text-[13px] font-bold text-rose-100">狙いの MOD が付かなかったら、どうする？</p>
              <div class="grid max-w-2xl grid-cols-3 gap-2">
                <button v-for="k in (['none', 'annul', 'chaos'] as const)" :key="k" type="button" class="flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition" :class="missKind(rows[focusRow]!) === k ? 'border-amber-400/80 bg-amber-500/15 shadow-[0_0_10px_rgba(251,191,36,0.2)]' : 'border-white/10 bg-black/30 hover:border-amber-300/50'" @click="pickMissKind(focusRow!, k)">
                  <img v-if="k !== 'none' && iconOf(k)" :src="iconOf(k)" alt="" class="h-8 w-8 object-contain" />
                  <span v-else class="grid h-8 w-8 place-items-center rounded border border-white/20 text-[14px] opacity-60">→</span>
                  <span>
                    <b class="block text-[12px]">{{ k === "none" ? "そのまま次へ" : k === "annul" ? "消去で消す" : "カオスで入れ替える" }}</b>
                    <span class="text-[10px] opacity-60">{{ k === "none" ? "外れは残す" : k === "annul" ? "1 つ消してもう一度" : "1 つ入れ替えてもう一度" }}</span>
                  </span>
                </button>
              </div>
              <!-- 選んだ札のお告げ・強さだけ -->
              <div v-if="missKind(rows[focusRow]!) === 'annul' || missKind(rows[focusRow]!) === 'chaos'" class="mt-2 flex flex-wrap items-center gap-1">
                <template v-if="missKind(rows[focusRow]!) === 'chaos'">
                  <span class="mr-1 text-[11px] opacity-60">強さ</span>
                  <button v-for="g in ([['chaos', '普通'], ['chaos_greater', '上級'], ['chaos_perfect', '完全']] as const)" :key="g[0]" type="button" class="rounded-full border px-2 py-0.5 text-[11px]" :class="missSet(rows[focusRow]!.step)?.currency === g[0] ? 'border-amber-400 bg-amber-500/20 text-amber-100' : 'border-white/15 hover:bg-white/10'" @click="setMiss(focusRow!, 'chaos', g[0], missSet(rows[focusRow]!.step)?.omens ?? [])">{{ g[1] }}</button>
                  <span class="mx-1 opacity-30">|</span>
                </template>
                <span class="mr-1 text-[11px] opacity-60">お告げ</span>
                <button v-for="o in missOmenChoices(rows[focusRow]!)" :key="o.key || 'none'" type="button" class="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-30" :class="o.on ? 'border-orange-300 bg-orange-500/20 text-orange-100' : 'border-white/15 hover:bg-white/10'" :disabled="!!o.why" :title="o.why ?? o.ja" @click="setMiss(focusRow!, missKind(rows[focusRow]!) as 'annul' | 'chaos', missSet(rows[focusRow]!.step)!.currency, o.omens)">
                  <img v-if="o.key && iconOf(o.key)" :src="iconOf(o.key)" alt="" class="h-4 w-4 object-contain" />{{ o.ja }}
                </button>
              </div>
              <p class="mt-2 text-[11px]" :class="missRisk(focusRow!, rows[focusRow]!).bad ? 'text-rose-300' : 'text-emerald-200/80'">{{ missRisk(focusRow!, rows[focusRow]!).text }}</p>
              <!-- ほかの消し方 (パーフェクトエッセンスで上書き・骨で置き換え) -->
              <button type="button" class="mt-3 rounded border border-white/15 px-2 py-0.5 text-[11px] opacity-70 hover:opacity-100" @click="missMore = !missMore">ほかの消し方 (パーフェクトエッセンス・骨) {{ missMore || missKind(rows[focusRow]!) === 'other' ? "▲" : "▼" }}</button>
              <div v-if="missMore || missKind(rows[focusRow]!) === 'other'" class="mt-2">
                <StagePatternStepPicker :key="'miss' + focusRow" :sets="removals.filter((x) => x.kind === 'essence_perfect' || x.kind === 'desecrate')" :why="whyMissAt(focusRow)" :current="rows[focusRow]!.step.miss ?? ''" inline @pick="(k) => { patch(focusRow!, { miss: k, onMiss: 'annul_redo' }); editPart = 'miss'; }" />
              </div>
            </template>
            <template v-else>
              <template v-for="r in [rows[focusRow]!]" :key="'sum' + focusRow">
                <div class="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-2 text-[12px]">
                  <span class="text-[11px] opacity-50">{{ r.set?.kind === "rune" ? "差すルーン" : "付ける MOD" }}</span>
                  <button type="button" class="flex items-center gap-2 justify-self-start rounded px-1 text-left text-[14px] font-bold text-amber-50 enabled:hover:bg-white/5" :disabled="locked" @click="editPart = 'target'"><img v-if="r.set?.kind === 'rune' && cardIcon(r)" :src="cardIcon(r)!" alt="" class="h-9 w-9 object-contain" />{{ r.step.target === ANY_TARGET ? "何が付いてもいい (打つだけ)" : r.step.target ? (r.set?.kind === "rune" ? runeLabel(r.step.target) : modLabel(r.step.target) + (isDouble(r.set) ? candsOf(r).map((x) => ` + ${modLabel(x)}`).join("") + (r.step.target3 ? " (どれか 2 つ)" : "") : "")) : "—" }}</button>
                  <template v-if="r.set?.kind !== 'rune'">
                    <span class="text-[11px] opacity-50">カレンシー</span>
                    <button type="button" class="flex flex-wrap items-center gap-2 justify-self-start rounded-lg px-1 py-0.5 enabled:hover:bg-white/5" :disabled="locked" @click="editPart = 'set'">
                      <img v-if="r.set?.currency && iconOf(r.set.currency)" :src="iconOf(r.set.currency)" alt="" class="h-9 w-9 object-contain drop-shadow" />
                      <span class="font-bold">{{ r.set ? setShort(r.set) : "—" }}</span>
                      <span v-for="o in r.set?.omens ?? []" :key="o" class="flex items-center gap-1 rounded-full border border-orange-300/40 bg-orange-500/10 py-0.5 pl-0.5 pr-2 text-orange-100"><img :src="iconOf(o)" alt="" class="h-5 w-5 object-contain" />{{ jaOfOmen(o) ?? o }}</span>
                    </button>
                  </template>
                  <template v-if="showMiss(r)">
                    <span class="text-[11px] text-rose-300/80">外れたら</span>
                    <button type="button" class="flex flex-wrap items-center gap-2 justify-self-start rounded-lg px-1 py-0.5 enabled:hover:bg-white/5" :disabled="locked || !hasMiss(r)" @click="editPart = 'miss'">
                      <template v-if="missSet(r.step)">
                        <img v-if="iconOf(missSet(r.step)!.currency)" :src="iconOf(missSet(r.step)!.currency)" alt="" class="h-7 w-7 object-contain" />
                        <span class="font-bold">{{ setShort(missSet(r.step)!) }}</span>
                        <span v-for="o in missSet(r.step)!.omens" :key="o" class="flex items-center gap-1 rounded-full border border-orange-300/40 bg-orange-500/10 py-0.5 pl-0.5 pr-2 text-orange-100"><img :src="iconOf(o)" alt="" class="h-5 w-5 object-contain" />{{ jaOfOmen(o) ?? o }}</span>
                        <span class="text-[11px] text-amber-200/80">↺ 付くまで繰り返す</span>
                      </template>
                      <span v-else class="opacity-60">そのまま次の手へ{{ hasMiss(r) ? "" : " (レアリティが変わる手はやり直せない)" }}</span>
                    </button>
                  </template>
                  <template v-if="needs2(r) && singleSet(r)">
                    <span class="text-[11px] text-amber-200/80">片方当たり後</span>
                    <button type="button" class="flex flex-wrap items-center gap-2 justify-self-start rounded-lg px-1 py-0.5 enabled:hover:bg-white/5" :disabled="locked" @click="editPart = 'single'">
                      <img v-if="iconOf(singleSet(r)!.currency)" :src="iconOf(singleSet(r)!.currency)" alt="" class="h-7 w-7 object-contain" />
                      <span class="font-bold">{{ setShort(singleSet(r)!) }} を 1 発</span>
                      <span v-for="o in singleSet(r)!.omens" :key="o" class="flex items-center gap-1 rounded-full border border-orange-300/40 bg-orange-500/10 py-0.5 pl-0.5 pr-2 text-orange-100"><img :src="iconOf(o)" alt="" class="h-5 w-5 object-contain" />{{ jaOfOmen(o) ?? o }}</span>
                      <span class="text-[11px] text-amber-200/80">↺ 付くまで</span>
                    </button>
                  </template>
                </div>
                <p v-if="r.risk" class="mt-3 text-[11px]" :class="r.risk.bad ? 'text-rose-300' : 'text-amber-200/80'">⚠ {{ r.risk.text }}</p>
                <p v-if="r.bad" class="mt-1 text-[11px] text-rose-300">{{ r.bad }}</p>
              </template>
            </template>
          </div>
          <!-- 下のボタン (いつも同じ所) -->
          <div class="mt-1.5 flex items-center gap-2 border-t border-white/10 pt-1.5">
            <button type="button" class="rounded-lg border border-rose-400/50 px-2 py-0.5 text-rose-200 hover:bg-rose-500/15" title="この手だけ消す (後の手はそのまま)" @click="removeAt(focusRow)">この手を消す</button>
            <span class="flex items-center gap-1">
              <button type="button" class="rounded border border-white/15 px-1 opacity-60 hover:opacity-100 disabled:opacity-20" :disabled="focusRow === 0" title="上へ" @click="move(focusRow, -1); focusRow = focusRow - 1">▲</button>
              <button type="button" class="rounded border border-white/15 px-1 opacity-60 hover:opacity-100 disabled:opacity-20" :disabled="focusRow === rows.length - 1" title="下へ" @click="move(focusRow, 1); focusRow = focusRow + 1">▼</button>
            </span>
            <button type="button" class="ml-auto rounded-lg border border-white/20 px-3 py-0.5 hover:bg-white/10" title="閉じる (決めた物はそのまま)" @click="closeFrame()">閉じる</button>
            <button v-if="['set', 'target', 'target2', 'miss', 'single', 'lost'].includes(partOf(focusRow, rows[focusRow]!))" type="button" class="rounded-lg border border-amber-400/60 bg-amber-500/20 px-3 py-0.5 font-bold text-amber-100 disabled:opacity-40" :disabled="partOf(focusRow, rows[focusRow]!) === 'target' ? !rows[focusRow]!.step.target : partOf(focusRow, rows[focusRow]!) === 'target2' ? (needs2(rows[focusRow]!) && !rows[focusRow]!.step.target2) || (lastPart(focusRow, rows[focusRow]!) && !!rows[focusRow]!.bad) : !rows[focusRow]!.set || (lastPart(focusRow, rows[focusRow]!) && !!rows[focusRow]!.bad)" :title="partOf(focusRow, rows[focusRow]!) === 'target' ? '付ける物を選ぶ' : partOf(focusRow, rows[focusRow]!) === 'target2' && !rows[focusRow]!.step.target2 ? '2 つ目の MOD を選ぶ' : !rows[focusRow]!.set ? 'カレンシーを選ぶ' : rows[focusRow]!.bad ?? undefined" @click="nextPart(focusRow)">{{ lastPart(focusRow, rows[focusRow]!) ? "この手にする" : "次へ →" }}</button>
            <button v-else type="button" class="rounded-lg border border-amber-400/60 bg-amber-500/20 px-3 py-0.5 font-bold text-amber-100 disabled:opacity-40" :disabled="!!rows[focusRow]!.bad" :title="rows[focusRow]!.bad ?? (focusRow === rows.length - 1 ? '決めて次の手へ' : '決めて閉じる')" @click="confirmStep(focusRow)">この手にする</button>
          </div>
        </template>
        <!-- 決めた後 (読むだけ): 押した手 (無ければ最後の手) の要約 -->
        <template v-else-if="locked && rows.length">
          <div class="mb-2 border-b border-white/10 pb-2"><b class="text-[14px] text-amber-200">{{ previewAt + 1 }} 手目</b></div>
          <div class="min-h-0 flex-1 overflow-y-auto">
            <template v-for="r in [rows[previewAt]!]" :key="'sum' + previewAt">
                <div class="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-2 text-[12px]">
                  <span class="text-[11px] opacity-50">{{ r.set?.kind === "rune" ? "差すルーン" : "付ける MOD" }}</span>
                  <button type="button" class="flex items-center gap-2 justify-self-start rounded px-1 text-left text-[14px] font-bold text-amber-50 enabled:hover:bg-white/5" :disabled="locked" @click="editPart = 'target'"><img v-if="r.set?.kind === 'rune' && cardIcon(r)" :src="cardIcon(r)!" alt="" class="h-9 w-9 object-contain" />{{ r.step.target === ANY_TARGET ? "何が付いてもいい (打つだけ)" : r.step.target ? (r.set?.kind === "rune" ? runeLabel(r.step.target) : modLabel(r.step.target) + (isDouble(r.set) ? candsOf(r).map((x) => ` + ${modLabel(x)}`).join("") + (r.step.target3 ? " (どれか 2 つ)" : "") : "")) : "—" }}</button>
                  <template v-if="r.set?.kind !== 'rune'">
                    <span class="text-[11px] opacity-50">カレンシー</span>
                    <button type="button" class="flex flex-wrap items-center gap-2 justify-self-start rounded-lg px-1 py-0.5 enabled:hover:bg-white/5" :disabled="locked" @click="editPart = 'set'">
                      <img v-if="r.set?.currency && iconOf(r.set.currency)" :src="iconOf(r.set.currency)" alt="" class="h-9 w-9 object-contain drop-shadow" />
                      <span class="font-bold">{{ r.set ? setShort(r.set) : "—" }}</span>
                      <span v-for="o in r.set?.omens ?? []" :key="o" class="flex items-center gap-1 rounded-full border border-orange-300/40 bg-orange-500/10 py-0.5 pl-0.5 pr-2 text-orange-100"><img :src="iconOf(o)" alt="" class="h-5 w-5 object-contain" />{{ jaOfOmen(o) ?? o }}</span>
                    </button>
                  </template>
                  <template v-if="showMiss(r)">
                    <span class="text-[11px] text-rose-300/80">外れたら</span>
                    <button type="button" class="flex flex-wrap items-center gap-2 justify-self-start rounded-lg px-1 py-0.5 enabled:hover:bg-white/5" :disabled="locked || !hasMiss(r)" @click="editPart = 'miss'">
                      <template v-if="missSet(r.step)">
                        <img v-if="iconOf(missSet(r.step)!.currency)" :src="iconOf(missSet(r.step)!.currency)" alt="" class="h-7 w-7 object-contain" />
                        <span class="font-bold">{{ setShort(missSet(r.step)!) }}</span>
                        <span v-for="o in missSet(r.step)!.omens" :key="o" class="flex items-center gap-1 rounded-full border border-orange-300/40 bg-orange-500/10 py-0.5 pl-0.5 pr-2 text-orange-100"><img :src="iconOf(o)" alt="" class="h-5 w-5 object-contain" />{{ jaOfOmen(o) ?? o }}</span>
                        <span class="text-[11px] text-amber-200/80">↺ 付くまで繰り返す</span>
                      </template>
                      <span v-else class="opacity-60">そのまま次の手へ{{ hasMiss(r) ? "" : " (レアリティが変わる手はやり直せない)" }}</span>
                    </button>
                  </template>
                  <template v-if="needs2(r) && singleSet(r)">
                    <span class="text-[11px] text-amber-200/80">片方当たり後</span>
                    <button type="button" class="flex flex-wrap items-center gap-2 justify-self-start rounded-lg px-1 py-0.5 enabled:hover:bg-white/5" :disabled="locked" @click="editPart = 'single'">
                      <img v-if="iconOf(singleSet(r)!.currency)" :src="iconOf(singleSet(r)!.currency)" alt="" class="h-7 w-7 object-contain" />
                      <span class="font-bold">{{ setShort(singleSet(r)!) }} を 1 発</span>
                      <span v-for="o in singleSet(r)!.omens" :key="o" class="flex items-center gap-1 rounded-full border border-orange-300/40 bg-orange-500/10 py-0.5 pl-0.5 pr-2 text-orange-100"><img :src="iconOf(o)" alt="" class="h-5 w-5 object-contain" />{{ jaOfOmen(o) ?? o }}</span>
                      <span class="text-[11px] text-amber-200/80">↺ 付くまで</span>
                    </button>
                  </template>
                </div>
                <p v-if="r.risk" class="mt-3 text-[11px]" :class="r.risk.bad ? 'text-rose-300' : 'text-amber-200/80'">⚠ {{ r.risk.text }}</p>
                <p v-if="r.bad" class="mt-1 text-[11px] text-rose-300">{{ r.bad }}</p>
              </template>
          </div>
        </template>
        <div v-else class="grid flex-1 place-items-center text-center">
          <div class="flex flex-col items-center gap-2">
            <span class="h-10 w-10 rounded-lg border border-dashed border-white/20 bg-black/30"></span>
            <p class="opacity-50">{{ locked ? "左の手を押すと、その手まで当たった時のアイテムが右に出ます" : allPlaced && rows.length ? "付ける物は全部並べました。左の手を押すと選び直せます" : rows.length ? "左の手を押すと、ここで選び直せます" : "1 手目を足して始めます" }}</p>
            <button v-if="!locked" type="button" class="rounded-lg border border-amber-400/60 bg-amber-500/15 px-4 py-1 font-bold text-amber-100 hover:bg-amber-500/25" @click="addStep">＋ 手を足す</button>
          </div>
        </div>
      </div>

      <!-- その手まで当たった時のアイテム -->
      <div v-if="preview" class="w-[280px] shrink-0 overflow-y-auto">
        <p class="mb-1 text-center opacity-70">{{ focusPre != null ? preNodes[focusPre]?.title : rows.length ? `${previewAt + 1} 手目まで当たった時` : "始め" }}</p>
        <StageItemCard :item="preview" :added="previewOut?.added ?? []" :removed="[]" :holding="false" :flash-key="0" :width="280" compact />
      </div>
    </div>
  </div>
</template>
