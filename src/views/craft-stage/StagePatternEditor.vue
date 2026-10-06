<!--
  StagePatternEditor.vue — シミュレーションの「6 パターン」: 1 手ずつ並べる (2026-10-06 オーナー「パターン作ってほしい、簡単に操作できる UI で 1 手ずつ。
  プルダウンはセットで選択させたい」)。1 手 = セット (打つ物 + お告げ) / 付ける物 (5 順番計画の順) / 外れた時。
  それまでの手で打てない物・付けられない物は、プルダウンの中で理由つきで選べなくする (オーナー「ルーン嵌めてないのにコルの MOD とか、
  エッセンス 2 回目とか、選択できずにグレーアウト、理由も」)。決まりは services/craft-stage/pattern.ts
-->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { craftStage, nameOf } from "../../state/craft-stage";
import { checkMiss, checkRemoval, checkRune, checkSet, checkTarget, MISS_JA, noMiss, patternSets, RARITY_CHANGE, setsForStart, removalSets, setByKey, stateBefore, type CheckCtx, type MissRule, type Pattern, type PatternSet, type PatternStep } from "../../services/craft-stage/pattern";
import { jaOfOmen } from "../../services/htc/labels";
import StagePatternStepPicker from "./StagePatternStepPicker.vue";
import StageItemCard from "./StageItemCard.vue";
import { freshItem } from "../../services/craft-stage/run-plan";
import { makeStageMod, withMod } from "../../services/craft-stage/stage-core";
import { applyRune } from "../../services/craft-stage/stage-runes";
import type { StageItem } from "../../services/craft-stage/types";
import { iconOf } from "../../state/craft-stage";
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
    if (!x || !q.target || x.kind === "rune" || x.kind === "annul" || !scope!.includes(sideOfId(q.target))) return [];
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
  openRow.value = null;
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
    const isRune = set?.kind === "rune";
    const targetOpts = !set || set.kind === "annul" ? [] : props.order
      .filter((k) => (isRune ? k.startsWith("rune:") : k.startsWith("mod:")))
      .map((k) => {
        const id = k.slice(k.indexOf(":") + 1);
        if (isRune) return { key: id, label: runeLabel(id), why: checkRune(c, st, id) };
        const t = c.targets.find((x) => x.modId === id);
        return { key: id, label: modLabel(id), why: t ? checkTarget(c, st, set, t) : "狙う MOD に無い" };
      });
    const missOpts = (Object.keys(MISS_JA) as MissRule[]).map((rule) => ({ rule, why: set ? checkMiss(set, rule) : null }));
    const setWhy = set ? checkSet(c, st, set) : "セットを選ぶ";
    const tWhy = step.target ? targetOpts.find((o) => o.key === step.target)?.why ?? null : set && set.kind !== "annul" ? "付ける物を選ぶ" : null;
    // 外れのある手は、やり直しのカレンシーを選ぶ (自動は無し。2026-10-07 オーナー「自動は選択することないから削除」)
    const mWhy = set && !noMiss(set) && !RARITY_CHANGE.has(set.kind) && !step.miss ? "外れた時のやり直しを選ぶ" : null;
    return { step, set, setOpts, targetOpts, missOpts, bad: setWhy ?? tWhy ?? mWhy, risk: annulRisk(i, set, step) };
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
const preview = computed<StageItem | null>(() => {
  if (focusPre.value != null && preNodes.value[focusPre.value]) return preNodes.value[focusPre.value]!.item;
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
  for (let j = 0; j <= previewAt.value; j++) {
    const st = pat.value.steps[j]!;
    const x = setByKey(sets.value, st.set);
    if (!x || !st.target) continue;
    if (x.kind === "rune") { const r = applyRune(it, `rune:${st.target}`, d); if (r.applied) it = r.item; continue; }
    const t = s.simTargets.value.find((y) => y.modId === st.target);
    if (t) add(t.modId, t.minTierIndex, x.kind === "desecrate" ? { desecrated: true } : x.kind === "essence" || x.kind === "essence_perfect" ? { crafted: true } : {});
  }
  const c = ctx.value;
  const rarity = c ? stateBefore(c, pat.value.steps, previewAt.value + 1).rarity : "rare";
  return { ...it, rarity: it.prefixes.length + it.suffixes.length ? (rarity === "normal" ? "magic" : rarity) : rarity };
});

/** 打つ物 + お告げを棚の見た目で選んでいる手 (2026-10-06 オーナー「クラフトステージそのまま使っていい」) */
const openRow = ref<string | null>(null);
const removals = computed(() => removalSets(sets.value));
/** その手の位置で、セットを打てない理由 */
function whyAt(i: number): (x: PatternSet) => string | null {
  const c = ctx.value;
  if (!c) return () => null;
  const st = stateBefore(c, pat.value.steps, i);
  return (x) => checkSet(c, st, x);
}
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
  if (!r.step.target) return r.set?.kind === "rune" ? "ルーン" : "付ける物を選ぶ";
  if (r.set?.kind === "rune") return RUNES[r.step.target]?.ja ?? r.step.target;
  return cardTitleOf(r.step.target);
}
/** 狙う MOD の短い名前 (「火耐性 T3+」) */
function cardTitleOf(modId: string): string {
  const full = modLabel(modId);
  const rank = /T(\d+) 以上/.exec(full)?.[1];
  const name = full.replace(/\s*T\d+ 以上.*$/, "").replace(/[+-]?\(?\d[\d.]*(?:[-—~]\d[\d.]*)?\)?/g, "").replace(/\s*%/g, "").replace(/\s+/g, " ").trim();
  return rank ? `${name} T${rank}+` : name;
}
/** 打つ物の短い名前 (お告げはアイコンだけ) */
const setShort = (x: PatternSet): string => (x.currency ? nameOf(x.currency) : x.kind === "essence" ? "エッセンス" : x.kind === "essence_perfect" ? "パーフェクトエッセンス" : x.kind === "rune" ? "差す" : "");
/** 手のカードを押した: その手の設定を開く (もう一度押すと閉じる)。右のアイテムもその手の時点に */
/**
 * 開き方: "all" = 手の設定を全部、"miss" = 外れ (やり直し) の設定だけ (2026-10-07 オーナー「外れをクリックしたら外れの設定だけ開く」)
 */
const focusMode = ref<"all" | "miss">("all");
const root = ref<HTMLElement | null>(null);
/** 開く前に見ていた位置 (閉じたら戻す。2026-10-07 オーナー「毎回下にスクロールしないと見れない、終わったら見てたところに戻す」) */
let savedScroll: { el: HTMLElement; top: number } | null = null;
function scrollParent(el: HTMLElement | null): HTMLElement {
  for (let x = el?.parentElement ?? null; x; x = x.parentElement) {
    const o = getComputedStyle(x).overflowY;
    if ((o === "auto" || o === "scroll") && x.scrollHeight > x.clientHeight) return x;
  }
  return document.scrollingElement as HTMLElement;
}
/** 開いた枠を全部見える位置まで送る (高すぎる時は上をそろえる) */
function revealFrame(i: number): void {
  void nextTick(() => {
    const el = root.value?.querySelector<HTMLElement>(`[data-step="${i}"]`);
    if (!el) return;
    const sc = scrollParent(el);
    if (!savedScroll) savedScroll = { el: sc, top: sc.scrollTop };
    const r = el.getBoundingClientRect(), v = sc.getBoundingClientRect();
    const top = Math.max(v.top, 0), bottom = Math.min(v.bottom, window.innerHeight);
    if (r.height > bottom - top || r.top < top) sc.scrollTop += r.top - top - 8;
    else if (r.bottom > bottom) sc.scrollTop += r.bottom - bottom + 8;
  });
}
function closeFrame(): void {
  focusRow.value = null;
  openRow.value = null;
  if (savedScroll) { const { el, top } = savedScroll; savedScroll = null; void nextTick(() => { el.scrollTop = top; }); }
}
/** 選び直している物 (無ければ、まだ決めていない一番手前の物) */
const editPart = ref<"set" | "target" | "miss" | null>(null);
function partOf(i: number, r: Row): "set" | "target" | "miss" | "done" {
  if (focusMode.value === "miss") return "miss";
  if (focusRow.value === i && editPart.value) return editPart.value;
  if (!r.set) return "set";
  if (r.set.kind !== "annul" && !r.step.target) return "target";
  if (!noMiss(r.set) && !RARITY_CHANGE.has(r.set.kind) && !r.step.miss) return "miss";
  return "done";
}
/** 付ける側の棚 (消去は外す側にだけ出す。2026-10-07 オーナー「付ける時は削除の手とか表示しなくてもおｋ」) */
const addSets = computed(() => sets.value.filter((x) => x.kind !== "annul"));
function selectRow(i: number, mode: "all" | "miss" = "all"): void {
  editPart.value = null;
  focusPre.value = null;
  if (focusRow.value === i && focusMode.value === mode) { closeFrame(); return; }
  focusRow.value = i;
  focusMode.value = mode;
  openRow.value = mode === "miss" ? `${i}:miss` : null;
  revealFrame(i);
}
// 棚を開いた時も、枠が伸びるので見える位置まで送る
watch(openRow, (v) => { if (v && focusRow.value != null) revealFrame(focusRow.value); });
/** ツリーの右上の ×: その手から後を全部消す (2 回押し。2026-10-07 オーナー「ツリーから × したらそれ以降の流れを消す」) */
const cutArmed = ref<number | null>(null);
function cutFrom(i: number): void {
  if (cutArmed.value !== i) { cutArmed.value = i; setTimeout(() => { if (cutArmed.value === i) cutArmed.value = null; }, 3000); return; }
  cutArmed.value = null;
  setSteps((list) => list.slice(0, i));
  closeFrame();
}
function addStep(): void {
  const c = ctx.value;
  if (!c) return;
  setSteps((list) => [...list, { set: "", target: null, onMiss: "annul_redo" }]);
  editPart.value = null;
  focusRow.value = pat.value.steps.length - 1;
  focusMode.value = "all";
  revealFrame(pat.value.steps.length - 1);
}
/**
 * 「この手にする」: 設定を閉じて、それが最後の手なら下に次の手を足して棚を開く (2026-10-06 オーナー「1 手決まって進むと下に手を追加」
 * 「付ける MOD を選んだ瞬間に枠が足される、この手にするボタンを押さないと進まないように」)。打てない手は押せない
 */
function confirmStep(i: number): void {
  const r = rows.value[i];
  if (!r || r.bad) return;
  openRow.value = null;
  if (i === rows.value.length - 1) void nextTick(() => addStep());
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
  patch(i, { set: key, target: null, onMiss: miss, ...(rm && set && checkRemoval(set, rm) ? { miss: null } : {}) });
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
function removePattern(): void {
  if (s.simPatterns.value.length <= 1) return;
  const k = Math.min(active.value, s.simPatterns.value.length - 1);
  s.simPatterns.value = s.simPatterns.value.filter((_, i) => i !== k).map((p, i) => ({ ...p, name: `パターン ${i + 1}` }));
  active.value = Math.max(0, k - 1);
}
defineExpose({ rows });
</script>

<template>
  <div ref="root" class="text-[11px]">
    <!-- パターンのタブ -->
    <div class="mb-1.5 flex flex-wrap items-center gap-1">
      <button v-for="(p, i) in s.simPatterns.value" :key="i" type="button" class="rounded-full px-2.5 py-0.5" :class="i === Math.min(active, s.simPatterns.value.length - 1) ? 'bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/60' : 'border border-white/15 opacity-70 hover:opacity-100'" @click="active = i">{{ p.name }} <span class="opacity-60">({{ p.steps.length }} 手)</span></button>
      <template v-if="!locked">
        <button type="button" class="rounded border border-white/15 px-1.5 opacity-70 hover:opacity-100" title="空のパターンを足す" @click="addPattern(false)">＋</button>
        <button type="button" class="rounded border border-white/15 px-1.5 opacity-70 hover:opacity-100" title="このパターンを写して足す (少しだけ変えて比べる時に)" @click="addPattern(true)">⧉</button>
        <button type="button" class="rounded border border-white/15 px-1.5 opacity-70 hover:opacity-100 disabled:opacity-30" :disabled="s.simPatterns.value.length <= 1" :title="s.simPatterns.value.length <= 1 ? 'パターンが 1 つの時は消せない' : 'このパターンを消す'" @click="removePattern">×</button>
        <button type="button" class="ml-1 rounded-lg border border-white/20 px-2 py-0.5 hover:bg-white/10 disabled:opacity-30" :disabled="!history.length" :title="history.length ? 'パターンの直前の操作を 1 つ取り消す' : '戻せる操作がまだ無い'" @click="undoPattern">↶ 1 つ戻す</button>
      </template>
    </div>

    <div class="flex items-start gap-3">
    <div class="min-w-0 flex-1">
    <!--
      ツリー (2026-10-06 オーナー「横に長いと見づらい、ツリー状にして横の枠を伸ばさずぎゅっと縮める」「設定後は簡易的な表示で」
      「外した場合の枝分かれにして視覚的に」)。当たりは下へ、外れは右へ枝分かれ。手のカードを押すと、その下に設定が開く
    -->
    <div class="flex flex-col items-start">
      <!-- フラクチャーまでの成功品 (読むだけ、押すと右のアイテムがその時点に) -->
      <template v-if="preNodes.length">
        <p class="mb-0.5 opacity-50">フラクチャーまで (費用は 4 最安値スタートの計算)</p>
        <template v-for="(n, k) in preNodes" :key="'pre' + k">
          <div v-if="k > 0" class="ml-[5.5rem] flex h-5 items-center">
            <span class="h-full w-px bg-emerald-400/50"></span>
            <span class="ml-1 text-[9px] text-emerald-300/80">当たり</span>
          </div>
          <!-- パターンの手と同じカード (読むだけ) -->
          <div class="flex items-start">
            <button type="button" class="w-48 rounded-md border bg-black/50 text-left transition hover:brightness-125" :class="[n.tone, focusPre === k ? 'ring-2 ring-sky-400/70' : '']" @click="focusPre = focusPre === k ? null : k; focusRow = null">
              <span class="flex items-center gap-1 border-b border-white/10 px-1.5 py-0.5">
                <b class="text-sky-200">{{ ["①", "②", "③", "④"][k] }}</b>
                <span class="truncate font-bold">{{ n.title }}</span>
              </span>
              <span class="flex items-center gap-1 px-1.5 py-1">
                <img v-for="c in n.icons" :key="c" :src="iconOf(c)" alt="" class="h-6 w-6 object-contain" />
                <span v-if="!n.icons.length" class="grid h-6 w-6 place-items-center rounded bg-white/10">◎</span>
                <span class="truncate opacity-70">{{ n.sub }}</span>
              </span>
            </button>
            <template v-if="n.miss">
              <span class="mt-5 h-px w-6 border-t border-dashed border-rose-400/60"></span>
              <span class="mt-2 flex items-center gap-1 rounded-md border border-rose-400/40 bg-rose-950/30 px-1.5 py-1">
                <span class="text-rose-300">外れ</span>
                <template v-if="n.miss.icons.length">
                  <span class="opacity-60">→</span>
                  <img v-for="c in n.miss.icons" :key="c" :src="iconOf(c)" alt="" class="h-5 w-5 object-contain" />
                </template>
                <span class="text-amber-200">{{ n.miss.text }}</span>
              </span>
            </template>
          </div>
        </template>
        <div class="ml-[5.5rem] h-3 w-px bg-white/20"></div>
      </template>
      <div class="rounded-md border border-white/20 bg-black/40 px-2 py-0.5 opacity-80">{{ start.rarity === "rare" ? "始め: フラクチャー済み" : "始め: 白のベース" }}</div>
      <template v-for="(r, i) in rows" :key="i">
        <!-- 当たりの線 -->
        <div class="ml-[5.5rem] flex h-5 items-center">
          <span class="h-full w-px bg-emerald-400/50"></span>
          <span class="ml-1 text-[9px] text-emerald-300/80">{{ i === 0 ? "" : "当たり" }}</span>
        </div>
        <div class="flex items-start">
          <!-- 手のカード (簡易) -->
          <div :data-step="i" class="relative rounded-md border bg-black/50 transition" :class="[KIND_TONE[r.set?.kind ?? 'none'] ?? 'border-white/20', focusRow === i && !locked ? 'w-full ring-2 ring-amber-400/70' : focusRow === i ? 'w-48 ring-2 ring-amber-400/70' : 'w-48 hover:brightness-125', r.bad ? 'border-rose-500/80' : '']">
          <!-- 右上の ×: この手から後を全部消す (2 回押し) -->
          <button v-if="!locked" type="button" class="absolute right-0.5 top-0.5 z-10 rounded px-1 leading-none" :class="cutArmed === i ? 'bg-rose-600/80 text-white' : 'opacity-50 hover:bg-rose-600/40 hover:opacity-100'" :title="cutArmed === i ? 'もう一度押すと、この手から後を全部消す' : 'この手から後を全部消す'" @click.stop="cutFrom(i)">{{ cutArmed === i ? "後ろを全部消す?" : "×" }}</button>
          <button type="button" class="block w-full text-left" :title="r.bad ?? undefined" @click="selectRow(i)">
            <span class="flex items-center gap-1 border-b border-white/10 px-1.5 py-0.5 pr-6">
              <b class="text-amber-200">{{ i + 1 }}</b>
              <span class="truncate font-bold">{{ cardTitle(r) }}</span>
            </span>
            <span class="flex items-center gap-1 px-1.5 py-1">
              <img v-if="r.set?.currency && iconOf(r.set.currency)" :src="iconOf(r.set.currency)" alt="" class="h-6 w-6 object-contain" />
              <span v-else class="grid h-6 w-6 place-items-center rounded bg-white/10">◎</span>
              <img v-for="o in r.set?.omens ?? []" :key="o" :src="iconOf(o)" alt="" class="h-6 w-6 object-contain" :title="jaOfOmen(o) ?? o" />
              <span class="truncate opacity-70">{{ r.set ? setShort(r.set) : "選ぶ" }}</span>
            </span>
          </button>
            <!-- 押した手の設定 (同じ枠の中に開く。2026-10-07 オーナー「クリックしたらその枠内で全部表示、枠 2 個おかしい」) -->
            <!--
              順に 1 つずつ決める (2026-10-07 オーナー「付ける時は別にそれ以外の削除の手とか表示しなくてもおｋ、順に決めていく」):
              付ける (棚) → 付ける MOD → 外れたら やり直し (棚) → この手にする。決めた物は上に 1 行で並べ、押すとそこだけ選び直す
            -->
            <div v-if="focusRow === i && !locked" class="border-t border-white/10 p-2" @click.stop>
              <!-- 決めた物 (押すと選び直す) -->
              <div v-if="focusMode === 'all' && (r.set || r.step.target || r.step.miss)" class="mb-1.5 flex flex-wrap items-center gap-1">
                <button v-if="r.set" type="button" class="flex items-center gap-1 rounded border px-1.5 py-0.5" :class="partOf(i, r) === 'set' ? 'border-amber-400/70 bg-amber-500/10' : 'border-white/15 bg-black/40 hover:border-white/30'" title="押すと選び直す" @click="editPart = 'set'">
                  <span class="opacity-60">付ける</span>
                  <img v-if="r.set.currency && iconOf(r.set.currency)" :src="iconOf(r.set.currency)" alt="" class="h-5 w-5 object-contain" />
                  <img v-for="o in r.set.omens" :key="o" :src="iconOf(o)" alt="" class="h-5 w-5 object-contain" />
                </button>
                <button v-if="r.step.target" type="button" class="flex items-center gap-1 rounded border px-1.5 py-0.5" :class="partOf(i, r) === 'target' ? 'border-amber-400/70 bg-amber-500/10' : 'border-white/15 bg-black/40 hover:border-white/30'" title="押すと選び直す" @click="editPart = 'target'">
                  <span class="opacity-60">MOD</span><span>{{ cardTitle(r) }}</span>
                </button>
                <button v-if="r.step.miss && missSet(r.step)" type="button" class="flex items-center gap-1 rounded border px-1.5 py-0.5" :class="partOf(i, r) === 'miss' ? 'border-rose-400/70 bg-rose-950/40' : 'border-white/15 bg-black/40 hover:border-white/30'" title="押すと選び直す" @click="editPart = 'miss'">
                  <span class="text-rose-200">外れたら</span>
                  <img v-if="iconOf(missSet(r.step)!.currency)" :src="iconOf(missSet(r.step)!.currency)" alt="" class="h-5 w-5 object-contain" />
                  <img v-for="o in missSet(r.step)!.omens" :key="o" :src="iconOf(o)" alt="" class="h-5 w-5 object-contain" />
                </button>
              </div>
              <!-- いま決める物だけ出す -->
              <template v-if="partOf(i, r) === 'set'">
                <p class="mb-1 font-bold text-amber-100">付けるカレンシー</p>
                <StagePatternStepPicker :sets="addSets" :why="whyAt(i)" :current="r.step.set" @pick="(k) => { onSet(i, k); editPart = null; }" @close="editPart = null" />
              </template>
              <template v-else-if="partOf(i, r) === 'target'">
                <p class="mb-1 font-bold text-amber-100">{{ r.set?.kind === "rune" ? "差すルーン" : "付ける MOD" }}</p>
                <div class="flex flex-wrap gap-1">
                  <button v-for="o in r.targetOpts" :key="o.key" type="button" class="rounded border px-2 py-1 text-left disabled:cursor-not-allowed disabled:opacity-35" :class="r.step.target === o.key ? 'border-amber-400 bg-amber-500/15' : 'border-white/15 bg-black/40 hover:border-white/30'" :disabled="!!o.why" :title="o.why ?? undefined" @click="patch(i, { target: o.key }); editPart = null">{{ o.label }}</button>
                </div>
              </template>
              <template v-else-if="partOf(i, r) === 'miss'">
                <p class="mb-1 font-bold text-rose-200">外れたら やり直し <span class="font-normal opacity-60">(外れた MOD を消せる物だけ)</span></p>
                <StagePatternStepPicker :sets="removals" :why="whyMissAt(i)" :current="r.step.miss ?? ''" @pick="(k) => { patch(i, { miss: k, onMiss: 'annul_redo' }); editPart = null; if (focusMode === 'miss') closeFrame(); }" @close="focusMode === 'miss' ? closeFrame() : (editPart = null)" />
              </template>
              <template v-else>
                <p v-if="r.set && RARITY_CHANGE.has(r.set.kind)" class="opacity-60">外れたら そのまま次へ (レアリティが変わる手はやり直せない)</p>
                <p v-if="r.risk" class="mt-1" :class="r.risk.bad ? 'text-rose-300' : 'text-amber-200/80'">{{ r.risk.text }}</p>
                <div class="mt-1.5 flex items-center gap-2">
                  <button type="button" class="rounded-lg border border-rose-400/50 px-2 py-0.5 text-rose-200 hover:bg-rose-500/15" title="この手だけ消す (後の手はそのまま)" @click="remove(i); closeFrame()">この手を消す</button>
                  <span class="flex items-center gap-1">
                    <button type="button" class="rounded border border-white/15 px-1 opacity-60 hover:opacity-100 disabled:opacity-20" :disabled="i === 0" title="上へ" @click="move(i, -1); focusRow = i - 1">▲</button>
                    <button type="button" class="rounded border border-white/15 px-1 opacity-60 hover:opacity-100 disabled:opacity-20" :disabled="i === rows.length - 1" title="下へ" @click="move(i, 1); focusRow = i + 1">▼</button>
                  </span>
                  <span v-if="r.bad" class="text-rose-300">{{ r.bad }}</span>
                  <button type="button" class="ml-auto rounded-lg border border-white/20 px-3 py-0.5 hover:bg-white/10" @click="closeFrame()">閉じる</button>
                  <button type="button" class="rounded-lg border border-amber-400/60 bg-amber-500/20 px-3 py-0.5 font-bold text-amber-100 disabled:opacity-40" :disabled="!!r.bad" :title="r.bad ?? (i === rows.length - 1 ? '決めて次の手へ' : '決めて閉じる')" @click="confirmStep(i)">この手にする</button>
                </div>
              </template>
        </div>
          </div>
          <!-- 外れの枝 (開いている時は枠の中に出るので出さない) -->
          <template v-if="r.set && !noMiss(r.set) && (focusRow !== i || locked)">
            <!--
              外れの枝。やり直す手は、外れ → やり直しのカレンシー → カードに戻る線で「付くまで繰り返す」
              (2026-10-07 オーナー「繰り返す時は外れの後に同線つないで、付くまで繰り返すって UI」)
            -->
            <span class="flex flex-col">
              <span class="flex items-center">
                <span class="h-px w-6 border-t border-dashed border-rose-400/60"></span>
                <button type="button" class="flex items-center gap-1 rounded-md border border-rose-400/40 bg-rose-950/30 px-1.5 py-1 text-left hover:brightness-125" :title="`${MISS_JA[r.step.onMiss]} (押すと外れの設定だけ開く)`" @click="selectRow(i, 'miss')">
                  <span class="text-rose-300">外れ</span>
                  <template v-if="r.step.onMiss === 'annul_redo'">
                    <span class="opacity-60">→</span>
                    <template v-if="missSet(r.step)">
                      <img v-if="iconOf(missSet(r.step)!.currency)" :src="iconOf(missSet(r.step)!.currency)" alt="" class="h-5 w-5 object-contain" />
                      <span v-else class="grid h-5 w-5 place-items-center rounded bg-white/10">◎</span>
                      <img v-for="o in missSet(r.step)!.omens" :key="o" :src="iconOf(o)" alt="" class="h-5 w-5 object-contain" />
                    </template>
                    <span v-else class="text-amber-200">選ぶ</span>
                  </template>
                  <span v-else-if="r.step.onMiss === 'redo'" class="text-amber-200">↺ もう一度</span>
                  <span v-else-if="r.step.onMiss === 'next'" class="opacity-70">→ 次へ</span>
                  <span v-else class="text-rose-200">⟲ 最初から</span>
                </button>
              </span>
              <!-- カードに戻る線 (付くまで繰り返す) -->
              <span v-if="r.step.onMiss === 'annul_redo' || r.step.onMiss === 'redo'" class="-ml-px flex items-center text-[10px] text-amber-200/90">
                <span class="text-rose-300">◀</span>
                <span class="h-px w-8 border-t border-dashed border-rose-400/60"></span>
                <span class="ml-1">付くまで繰り返す</span>
              </span>
            </span>
          </template>
          <span v-if="r.risk?.bad" class="ml-2 mt-2 text-rose-300" :title="r.risk.text">⚠</span>
        </div>
      </template>
      <template v-if="!locked">
        <div class="ml-[5.5rem] h-4 w-px bg-white/20"></div>
        <button type="button" class="w-48 rounded-md border border-dashed border-amber-400/50 py-1 text-amber-200 hover:bg-amber-500/10" @click="addStep">＋ 手を足す</button>
      </template>
    </div>
    </div>
    <!-- 右: その手まで当たった時のアイテム (押した手の時点) -->
    <div v-if="preview" class="sticky top-2 w-[280px] shrink-0">
      <p class="mb-1 text-center opacity-70">{{ focusPre != null ? preNodes[focusPre]?.title : rows.length ? `${previewAt + 1} 手目まで当たった時` : "始め" }}</p>
      <StageItemCard :item="preview" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="280" compact />
    </div>
    </div>
  </div>
</template>
