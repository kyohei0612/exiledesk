<!--
  StagePatternEditor.vue — シミュレーションの「6 パターン」: 1 手ずつ並べる (2026-10-06 オーナー「パターン作ってほしい、簡単に操作できる UI で 1 手ずつ。
  プルダウンはセットで選択させたい」)。1 手 = セット (打つ物 + お告げ) / 付ける物 (5 順番計画の順) / 外れた時。
  それまでの手で打てない物・付けられない物は、プルダウンの中で理由つきで選べなくする (オーナー「ルーン嵌めてないのにコルの MOD とか、
  エッセンス 2 回目とか、選択できずにグレーアウト、理由も」)。決まりは services/craft-stage/pattern.ts
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { craftStage, nameOf, priceOf } from "../../state/craft-stage";
import { displayCurrency } from "../../state/display-currency";
import { ANY_KINDS, ANY_TARGET, otherGoneOf, otherJunkOf, LOST_RESTART, ONCE_KINDS, isDouble, singleKeyOf, hasCands, isRest, restMembers, uncertainStep, candsOfStep, REST, checkAny, checkMiss, checkRemoval, checkRune, checkSet, checkTarget, MISS_JA, noMiss, patternSets, RARITY_CHANGE, setsForStart, removalSets, setByKey, stateBefore, type CheckCtx, type MissRule, type Pattern, type PatternSet, type PatternStep } from "../../services/craft-stage/pattern";
import { jaOfOmen } from "../../services/htc/labels";
import StagePatternStepPicker from "./StagePatternStepPicker.vue";
import StageItemCard from "./StageItemCard.vue";
import { freshItem } from "../../services/craft-stage/run-plan";
import { allMods, makeStageMod, without, withMod } from "../../services/craft-stage/stage-core";
import { applyRune } from "../../services/craft-stage/stage-runes";
import { applyCurrency } from "../../services/craft-stage/apply-currency";
import { mulberry32 } from "../../services/htc/rng";
import type { StageItem } from "../../services/craft-stage/types";
import { iconOf } from "../../state/craft-stage";
import { baseArt } from "../../services/craft-stage/base-art";
import { RUNES } from "../../services/craft-stage/stage-runes";
import { fillHashes, fillModText, jaOfMod } from "../../services/htc/mod-text";
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
  /** 回している途中 */
  busy?: boolean;
  /** 「この手だけ回す」の結果 (パターン k の i 手目。busy の間は回している) */
  stepRun?: { k: number; i: number; presses: number; cost: number; p80Presses: number; p80Cost: number; pDone: number; busy: boolean } | null;
  /** 「この手だけ回す」の 1 人の上限と人数 */
  stepMax?: number;
  stepRuns?: number;
}>();
const emit = defineEmits<{ "run-one": [index: number]; "run-step": [index: number, step: number]; "close-step": []; active: [index: number] }>();
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
  const fixedIds = fixedIdsBefore(i);
  const hits = pat.value.steps.slice(0, i).flatMap((q) => {
    if (q.target && fixedIds.has(q.target)) return [];
    const x = setByKey(sets.value, q.set);
    // 外れた時だけ打つ手 (同じ MOD をもう一度狙う) の外れでは、その MOD はまだ付いていない
    if (q.target === step.target && retryFrom.value.has(i)) return [];
    if (!x || !q.target || q.target === ANY_TARGET || x.kind === "rune" || x.kind === "annul" || !scope!.includes(sideOfId(q.target))) return [];
    return [{ id: q.target, once: ONCE.has(x.kind) }];
  });
  if (!hits.length) return null;
  const short = (id: string): string => modLabel(id).replace(/\s*T\d+ 以上.*$/, "").slice(0, 16);
  // 増強の手 (まだマジック) で、この手の狙いの候補は消えてもこの増強で取り直す (計算も同じ)
  if (set.kind === "augment" && step.target) {
    const mine = isRest(step.target) ? restMembers(pat.value.steps, step.target) : candsOfStep(step);
    const again = hits.filter((h) => mine.includes(h.id));
    if (again.length === hits.length) return { text: `消去で ${again.map((h) => short(h.id)).join("・")} が消えたら、この増強でもう一度`, bad: false };
  }
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
  if (!m) return modId;
  // 狙いの一覧に無い MOD (選び直して外した物) も日本語で (英語の id を出さない)
  if (!t) return `${fillHashes(jaOfMod(m), []).replace(/\n/g, " / ")} (狙いに無い)`;
  const tier = m.tiers[t.minTierIndex];
  const text = fillModText(m, tier ? tierDisplayRanges(tier) : []).replace(/\n/g, " / ");
  const alts = t.alts?.length ? ` (ほか ${t.alts.length} つのどれか)` : "";
  return `${text} T${m.tiers.length - t.minTierIndex} 以上${alts}`;
}
const runeLabel = (en: string): string => RUNES[en]?.ja ?? en;

interface Row {
  step: PatternStep;
  set: PatternSet | undefined;
  setOpts: Array<{ name: string; items: Array<{ x: PatternSet; why: string | null }> }>;
  /** n = 5 順番計画の並びの番号、members = 「この中のどれか」のまとまりなら候補全部 (1 つの選択肢にまとめる) */
  targetOpts: Array<{ key: string; label: string; why: string | null; n: number; members?: string[] }>;
  /** 偉大 (2 つ) の手の 2 つ目に選べる物 (1 つ目を付けた後の状態で見る) */
  target2Opts: Array<{ key: string; label: string; why: string | null; n: number }>;
  /** 前の手の候補の残り (rest:<手>) */
  restOpts: Array<{ key: string; label: string; why: string | null }>;
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
    // 前の手で「どれが付くか分からない」候補があれば、その残りを 1 行で (候補の MOD は個別に選べない)
    const unsure = pat.value.steps.slice(0, i).map((x, j) => ({ j, x })).filter(({ x }) => uncertainStep(sets.value, x) && !pat.value.steps.slice(0, i).some((y) => y.target === `${REST}${pat.value.steps.indexOf(x)}`));
    const unsureIds = new Map(unsure.flatMap(({ j, x }) => candsOfStep(x).map((id) => [id, j] as const)));
    const restOpts = unsure.map(({ j, x }) => {
      const sides = new Set(candsOfStep(x).map((id) => (c.data.mods.get(id)?.type === "suffix" ? "サフィ" : "プレ")));
      const side = sides.size === 1 ? [...sides][0]! : "";
      const left = Math.max(1, candsOfStep(x).length - (isDouble(setByKey(sets.value, x.set)) ? 2 : 1));
      return { key: `${REST}${j}`, label: `残りの${side} MOD ${left} つ (${j + 1} 手目の候補で付かなかった物)`, why: null as string | null };
    });
    const opts0 = set?.kind === "annul" ? [] : props.order.map((k, n) => {
      const id = k.slice(k.indexOf(":") + 1);
      if (k.startsWith("rune:")) return { key: id, label: `ルーン: ${runeLabel(id)}`, why: usable.some((x) => x.kind === "rune") ? checkRune(c, st, id) : "ソケットが空いていない", n };
      const t = c.targets.find((x) => x.modId === id);
      if (!t) return { key: id, label: modLabel(id), why: "狙う MOD に無い", n };
      if (unsureIds.has(id)) return { key: id, label: modLabel(id), why: `${unsureIds.get(id)! + 1} 手目の候補 (どれが残るか分からないので「残り」で選ぶ)`, n };
      const ok = usable.some((x) => x.kind !== "rune" && !checkTarget(c, st, x, t));
      const why = ok ? null : (usable.filter((x) => x.kind !== "rune").map((x) => checkTarget(c, st, x, t)).find((w) => w && /前の手|枠|差す|フラクチャー/.test(w)) ?? "今付けられるカレンシーが無い");
      return { key: id, label: modLabel(id), why, n };
    });
    // 「この中のどれか N つ」のまとまり (同じ候補のコピー) は 1 つの選択肢に (2026-10-08 オーナー「どれか 1 つを選択させるんじゃなくて 1 つの枠でどれか。
    // 選択肢はこの場合は 1 つ」)。選べる物 (理由の無い物) を代表にし、候補は全部
    const sigOf = (id: string): string | null => { const t = c.targets.find((x) => x.modId === id); return t?.alts?.length ? [t.modId, ...t.alts.map((a) => a.modId)].sort().join(",") : null; };
    const targetOpts: Row["targetOpts"] = [];
    for (const o of opts0) {
      const sig = sigOf(o.key);
      if (!sig) { targetOpts.push(o); continue; }
      const prev = targetOpts.find((x) => x.members && [...x.members].sort().join(",") === sig);
      if (prev) { if (prev.why && !o.why) Object.assign(prev, { key: o.key, why: null, n: o.n }); continue; }
      const members = sig.split(",");
      targetOpts.push({ ...o, members, label: `どれか: ${members.map((id) => cardTitleOf(id)).join(" / ")}` });
    }
    const missOpts = (Object.keys(MISS_JA) as MissRule[]).map((rule) => ({ rule, why: set ? checkMiss(set, rule) : null }));
    // 「残り」を狙う手は、残りの候補がそのまま狙い (一緒に狙う MOD・ほかの候補は聞かない。2026-10-08 オーナー「ここで固まる、進めない」:
    // 「一緒に狙う MOD を選ぶ」が裏で残っていて「この手にする」が押せなかった)
    const dbl = isDouble(set) && step.target !== ANY_TARGET && !isRest(step.target);
    const many = hasCands(set) && !!step.target && step.target !== ANY_TARGET && !isRest(step.target);
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
    // 増強 (マジック) の「残り」: 候補がプレとサフィに分かれていれば、どちらが付いても反対の側が空いている。同じ側なら付けられない
    const restMagic = (): string | null => {
      const sides = restMembers(pat.value.steps, step.target!).map((id) => c.data.mods.get(id)?.type === "suffix");
      return new Set(sides).size === sides.length ? null : "マジックはプレ・サフィ 1 つずつ (残りの候補が同じ側)";
    };
    const tWhy = !step.target ? "付ける物を選ぶ" : isRest(step.target) && set?.kind === "augment" ? restMagic() : isRest(step.target) ? (set ? (() => { const id = restMembers(pat.value.steps, step.target!)[0]; const t = id ? c.targets.find((x) => x.modId === id) : undefined; return t ? checkTarget(c, { ...st, placed: new Set([...st.placed].filter((x) => !restMembers(pat.value.steps, step.target!).includes(x))) }, set, t) : "残りの候補が無い"; })() : null) : step.target === ANY_TARGET ? (set ? checkAny(st, set) : null) : set && set.kind !== "rune" ? (() => { const t = c.targets.find((x) => x.modId === step.target); return t ? checkTarget(c, st, set, t) : "狙う MOD に無い (選び直す)"; })() : null;
    // やり直しは「選択無し (外れてもそのまま次へ)」が既定 (2026-10-07 オーナー「外れてもいいならそこは選択無しをデフォで、他を選んだ時も選択無しを選べる」)
    return { step, set, setOpts, targetOpts, restOpts, target2Opts, missOpts, bad: tWhy ?? setWhy ?? t2Why, risk: annulRisk(i, set, step) };
  });
});

/**
 * 外れた時だけ打つ手 (前の手が「付かなかった → 次へ」で狙った MOD をもう一度狙う手) → 元の手。
 * 元の手で付いた時はこの手を飛ばす (計算も付いていれば飛ばす)。ツリーは当たりの線を飛ばした先へ引く
 * (2026-10-07 オーナー「付いたら 4 手目以降に矢印行かせた方が良いね、変成で 1 発で付いたときの事」)
 */
const retryFrom = computed(() => {
  const out = new Map<number, number>();
  const c = ctx.value;
  if (!c) return out;
  pat.value.steps.forEach((step, j) => {
    const t = step.target;
    if (!t || t === ANY_TARGET || isRest(t) || !stateBefore(c, pat.value.steps, j).maybe.has(t)) return;
    const from = pat.value.steps.findIndex((x, k) => k < j && x.target === t);
    if (from >= 0) out.set(j, out.get(from) ?? from);
  });
  return out;
});
/** 元の手で付いた時に進む手 (外れた時だけ打つ手を飛ばした先) */
function hitTo(i: number): number {
  let k = i + 1;
  while (retryFrom.value.get(k) === i) k++;
  return k;
}

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
  if (!d || !frac || props.start.rarity !== "rare" || !s.base.value || props.start.mods) return [];
  const m = d.mods.get(frac.modId);
  if (!m) return [];
  let white: StageItem;
  try { white = { ...freshItem(d, s.base.value, s.itemLevel.value), sockets: props.start.sockets, rollSeed: 1 }; } catch { return []; }
  const fm = makeStageMod(m, m.type === "suffix" ? "suffix" : "prefix", frac.minTierIndex, () => 0.5);
  const name = cardTitleOf(frac.modId);
  const fixedItem = { ...withMod(white, { ...fm, fractured: true }), rarity: "rare" as const };
  // 1 で始め方を決めた時はその道 (前は買う時も自作の道が出ていた。2026-10-08 完成判定)
  if (s.simStart.value === "fractured") return [{ title: `${name} を固定済み`, icons: ["fracture"], sub: "固定済みのベースを買う", tone: "border-orange-400/60", miss: null as { icons: string[]; text: string } | null, item: fixedItem }];
  if (s.simStart.value === "four") return [
    { title: "4 MOD のレア", icons: [] as string[], sub: `買う (3 MOD + ${name})`, tone: "border-white/30", miss: null as { icons: string[]; text: string } | null, item: { ...withMod(white, fm), rarity: "rare" as const } },
    { title: `${name} を固定`, icons: ["desecrate", "fracture"], sub: "骨の壁 → フラクチャー", tone: "border-orange-400/60", miss: { icons: [], text: "⟲ 買い直し (当たり 1/3)" }, item: fixedItem },
  ];
  return [
    { title: "白のベース", icons: [] as string[], sub: "買う", tone: "border-white/30", miss: null as { icons: string[]; text: string } | null, item: white },
    { title: name, icons: ["transmute", "augment"], sub: "変成 → 増強", tone: "border-blue-400/50", miss: { icons: ["annul"], text: "↺" }, item: { ...withMod(white, fm), rarity: "magic" as const } },
    { title: "レアに", icons: ["regal"], sub: "王者", tone: "border-blue-400/50", miss: null, item: { ...withMod(white, fm), rarity: "rare" as const } },
    { title: `${name} を固定`, icons: ["desecrate", "fracture"], sub: "骨の壁 → フラクチャー", tone: "border-orange-400/60", miss: { icons: [], text: "⟲ 白から (当たり 1/3)" }, item: { ...withMod(white, { ...fm, fractured: true }), rarity: "rare" as const } },
  ];
});
/** 右のアイテムを枠に収める縮み (0.55〜1)。中身の高さが変わるたび (手を選ぶ・MOD が増える) に測り直す */
const cardBox = ref<HTMLElement | null>(null);
const cardInner = ref<HTMLElement | null>(null);
const cardZoom = ref(1);
let cardObs: ResizeObserver | null = null;
function fitCard(): void {
  const box = cardBox.value, inner = cardInner.value;
  if (!box || !inner) return;
  const natural = inner.getBoundingClientRect().height / cardZoom.value; // zoom 前の高さ (見た目の高さ ÷ 今の縮み)
  const z = Math.max(0.55, Math.min(1, (box.clientHeight - 2) / Math.max(1, natural)));
  if (Math.abs(z - cardZoom.value) > 0.01) cardZoom.value = z;
}
watch([cardBox, cardInner], () => {
  cardObs?.disconnect();
  if (!cardBox.value || !cardInner.value || typeof ResizeObserver === "undefined") return;
  cardObs = new ResizeObserver(() => fitCard());
  cardObs.observe(cardBox.value);
  cardObs.observe(cardInner.value);
  fitCard();
});
onBeforeUnmount(() => cardObs?.disconnect());
/** 右の枠で手を決めている途中 (その手はまだアイテムに移さない) */
const editingStep = computed(() => focusRow.value != null && !props.locked && focusPre.value == null);
const previewAt = computed(() => Math.min(focusRow.value ?? Infinity, pat.value.steps.length - 1));
/** 右のアイテムと、そこで光らせる物 (打つだけの手で付いた物) */
const previewOut = computed<{ item: StageItem; added: StageItem["prefixes"]; removed?: StageItem["prefixes"]; doomed?: string[] } | null>(() => {
  if (focusPre.value != null && preNodes.value[focusPre.value]) return { item: preNodes.value[focusPre.value]!.item, added: [] };
  const d = s.data.value;
  if (!d || !s.base.value) return null;
  let it: StageItem;
  const startIt = s.simStart.value === "item" ? s.simStartItem.value : null;
  if (startIt) it = { ...startIt, prefixes: startIt.prefixes.map((m) => ({ ...m })), suffixes: startIt.suffixes.map((m) => ({ ...m })) };
  else { try { it = { ...freshItem(d, s.base.value, s.itemLevel.value), sockets: props.start.sockets, rollSeed: 1 }; } catch { return null; } }
  const add = (modId: string, tierIndex: number, flags: Partial<StageItem["prefixes"][number]>): void => {
    const m = d.mods.get(modId);
    if (!m) return;
    it = withMod(it, { ...makeStageMod(m, m.type === "suffix" ? "suffix" : "prefix", tierIndex, () => 0.5), ...flags });
  };
  const frac = s.simTargets.value.find((t) => t.method === "fracture");
  if (frac && !startIt) add(frac.modId, frac.minTierIndex, { fractured: true });
  const c = ctx.value;
  let newMods: StageItem["prefixes"] = [];
  let goneMods: StageItem["prefixes"] = [];
  let doomed: string[] = [];
  const targetIds = new Set(s.simTargets.value.flatMap((t) => [t.modId, ...(t.alts ?? []).map((a) => a.modId)]));
  for (let j = 0; j <= previewAt.value; j++) {
    const st = pat.value.steps[j]!;
    // 決めている途中の手は打つ前の姿 (消える候補にだけ色)。打った後を出すと、カオスなら外れが消えて候補が減って見える
    // (2026-10-07 オーナー「手を決定してなかったらアイテムに移しちゃだめ、消える奴の候補が減る、2 個とかでもそう」)
    if (editingStep.value && j === previewAt.value) {
      const row = rows.value[j];
      if (row) { const can = removableIn(j, row); doomed = allMods(it).filter((m) => !m.fractured && (can(m.modId) || (!targetIds.has(m.modId) && removesAny(row)))).map((m) => m.modId); }
      newMods = [];
      break;
    }
    const x = setByKey(sets.value, st.set);
    if (!x || !st.target) continue;
    // 外れた時だけ打つ手は、前の手で付いた姿にもう足さない (同じ MOD が 2 つに見えていた)
    if (retryFrom.value.has(j) && allMods(it).some((m) => m.modId === st.target)) { if (j === previewAt.value) newMods = allMods(it).filter((m) => m.modId === st.target); continue; }
    // 打つだけの手は、そのカレンシー (お告げも) を実際に打った姿 (2026-10-07 オーナー「打つだけなら指定のカレンシーで打った時の挙動で表示しちゃっていい」)。
    // 乱数は手ごとに決まった値なので、押すたびに変わらない
    if (st.target === ANY_TARGET) {
      const r = applyCurrency(d, { ...it, rarity: c ? stateBefore(c, pat.value.steps, j).rarity : it.rarity }, x.currency, mulberry32(7919 + j), x.omens);
      if (r.applied) { it = r.item; if (j === previewAt.value) newMods = r.added; }
      continue;
    }
    if (x.kind === "rune") { const r = applyRune(it, `rune:${st.target}`, d); if (r.applied) it = r.item; continue; }
    // 自前のフラクチャー: その MOD を固定した姿
    if (x.kind === "fracture") {
      const fix = (ms: StageItem["prefixes"]): StageItem["prefixes"] => ms.map((m) => (m.modId === st.target ? { ...m, fractured: true } : m));
      it = { ...it, prefixes: fix(it.prefixes), suffixes: fix(it.suffixes) };
      if (j === previewAt.value) newMods = allMods(it).filter((m) => m.modId === st.target);
      continue;
    }
    // 残りの MOD の手: 元の手の候補のうち、まだ付いていない物を足す (骨なら冒涜の MOD として)。2026-10-07 オーナー「残りの MOD で冒涜選んでるなら足さないと」
    if (isRest(st.target)) {
      const have = new Set(allMods(it).map((m) => m.modId));
      for (const id of restMembers(pat.value.steps, st.target).filter((x) => !have.has(x))) {
        const t = s.simTargets.value.find((y) => y.modId === id);
        if (!t) continue;
        add(t.modId, t.minTierIndex, x.kind === "desecrate" ? { desecrated: true } : {});
        if (j === previewAt.value) newMods = allMods(it).filter((m) => m.modId === t.modId);
      }
      continue;
    }
    const t = s.simTargets.value.find((y) => y.modId === st.target);
    // 見ている手が「前の手で付かなかった時だけ」の手なら、その前の手は外れた姿 (狙いは付けない) で出す
    // (2026-10-08 スクリーンショットで、2 手目 (増強) を打つ前のアイテムに狙いがもう付いて見えていた)
    // 見ている手が「この手で付かなかった時だけ」の手 (かその後) なら、この手は外れた世界: 狙い以外の MOD が 1 つ付いた姿で出す
    // (2026-10-08 オーナー「2 手目の手を足した瞬間に別の MOD に切り替わらないと辻褄が合わん」「付かなかった時の世界線の話」)。
    // 反対の側を優先 (枝の「ハズレが反対の側 → 消さずに打つ」の流れ)。乱数は手ごとに決まった値なので押すたびに変わらない
    const missedFor = [...retryFrom.value.entries()].some(([k, f]) => f === j && k <= previewAt.value);
    if (missedFor && t && c) {
      const tside = c.data.mods.get(t.modId)?.type === "suffix" ? "suffix" : "prefix";
      let pick: ReturnType<typeof applyCurrency> | null = null;
      for (let k = 0; k < 40 && !pick; k++) {
        const r = applyCurrency(d, { ...it, rarity: stateBefore(c, pat.value.steps, j).rarity }, x.currency, mulberry32(9973 + j * 100 + k), x.omens);
        if (!r.applied || r.added.some((m) => targetIds.has(m.modId))) continue;
        if (k < 30 && r.added.some((m) => m.side === tside)) continue;
        pick = r;
      }
      if (pick) { it = pick.item; if (j === previewAt.value) newMods = pick.added; }
      continue;
    }
    // 見ている手で消える・入れ替わる可能性のある MOD (打つ物とやり直しで。クラフトステージの削減と同じ色。2026-10-07 オーナー
    // 「変更される可能性があるやつ色付けた方がいい、削減みたいな感じで一緒の色で」)
    if (j === previewAt.value) {
      const row = rows.value[j];
      if (row) { const can = removableIn(j, row); doomed = allMods(it).filter((m) => !m.fractured && (can(m.modId) || (!targetIds.has(m.modId) && removesAny(row)))).map((m) => m.modId); }
    }
    // カオス・パーフェクトエッセンスは 1 つ消してから付ける (足すだけに見えて「もう 1 つ付くのか」となっていた。2026-10-07 オーナー
    // 「カオスで付く場合は今付いてる MOD 消して狙いの MOD 付くような感じで表示しないと」)。消すのは狙い以外 (打つだけで付いた外れなど)、側のお告げがあればその側
    if (t && !missedFor && (x.kind === "chaos" || x.kind === "essence_perfect")) {
      const side = x.omens.some((o) => /Sinistral/.test(o)) ? "prefix" : x.omens.some((o) => /Dextral/.test(o)) ? "suffix" : null;
      const junk = allMods(it).filter((m) => !m.fractured && !targetIds.has(m.modId) && (!side || m.side === side));
      const gone = junk[0];
      if (gone) { it = without(it, gone); if (j === previewAt.value) goneMods = [gone]; }
    }
    if (t && !missedFor) {
      add(t.modId, t.minTierIndex, x.kind === "desecrate" ? { desecrated: true } : x.kind === "essence" || x.kind === "essence_perfect" ? { crafted: true } : {});
      // 候補のどれかで当たりの手は、付いた物も「どれか」で出す (どれが付くかは回すまで分からない。2026-10-08 オーナー「アイテムの表示もどれかになるはず」)
      const row = rows.value[j];
      const members = [...new Set([t.modId, ...(t.alts ?? []).map((a) => a.modId), ...(row && !needs2(row) ? candsOf(row) : [])])];
      if (members.length > 1) {
        const text = `どれか: ${members.map((id) => cardTitleOf(id)).join(" / ")}`;
        const relabel = (ms: StageItem["prefixes"]): StageItem["prefixes"] => ms.map((m) => (m.modId === t.modId ? { ...m, textJa: text } : m));
        it = { ...it, prefixes: relabel(it.prefixes), suffixes: relabel(it.suffixes) };
      }
    }
    // 見ている手で付いた物は光らせる
    if (t && j === previewAt.value) newMods = allMods(it).filter((m) => m.modId === t.modId);
    const t2 = isDouble(x) && st.target2 ? s.simTargets.value.find((y) => y.modId === st.target2) : undefined;
    if (t2) add(t2.modId, t2.minTierIndex, {});
  }
  const rarity = c ? stateBefore(c, pat.value.steps, previewAt.value + (editingStep.value ? 0 : 1)).rarity : "rare";
  return { item: { ...it, rarity: it.prefixes.length + it.suffixes.length ? (rarity === "normal" ? "magic" : rarity) : rarity }, added: newMods, removed: goneMods, doomed };
});
const preview = computed<StageItem | null>(() => previewOut.value?.item ?? null);

const removals = computed(() => removalSets(sets.value));
/** 外す時のセット (外す時は付けた後 = レア。付ける手の後の状態で見る) */
const missSet = (step: PatternStep): PatternSet | undefined => (step.miss ? setByKey(sets.value, step.miss) : undefined);
/**
 * 打つ前に先に消す側 (計算の決まりを画面にも出す。2026-10-07 オーナー「こういうの仕組みとして必ず UI で表示しておかないとだめ」)。
 * 高貴・骨・増強 (狙いが 1 つ) は、狙いの側が外れで埋まっていたら、先にその側の外れを消してから打つ (recipe-sim の runPattern と同じ)
 */
function preAnnul(r: Row): string | null {
  const id = r.step.target;
  if (!r.set || !id || id === ANY_TARGET) return null;
  // 前の手 (外れたらこの手へ) が「狙いの側のハズレを消して次へ」なら、そちらに出ている
  const i = rows.value.indexOf(r);
  const from = retryFrom.value.get(i);
  if (from != null && pat.value.steps[from]?.onMiss === "annul_next") return null;
  const k = r.set.kind;
  if (!(k === "exalt" || k === "desecrate" || (k === "augment" && !isRest(id) && !candsOf(r).length))) return null;
  const main = isRest(id) ? restMembers(pat.value.steps, id)[0] : id;
  return ctx.value?.data.mods.get(main ?? "")?.type === "suffix" ? "サフィ" : "プレ";
}
/** i 手目より前の自前のフラクチャーの手で固定した MOD。固定は 1 つだけなので最初の狙い (候補は固定されていないかもしれないので、消える候補に残す。2026-10-08 レビュー N4) */
function fixedIdsBefore(i: number): Set<string> {
  const st = pat.value.steps.slice(0, i).find((x) => setByKey(sets.value, x.set)?.kind === "fracture");
  return new Set(st?.target && st.target !== ANY_TARGET ? [st.target] : []);
}
/**
 * 打つ前に計算が自動でやる前置き (必ず画面に出す。2026-10-08 レビュー D2 / D3 / D6)。短い方はツリー、長い方は「付かなかったら」の画面
 * - 高貴・骨・増強: 狙いの側がハズレで埋まっていたら先に消去 (反対の側に当たりがあれば側のお告げ付き) … recipe-sim の runPattern
 * - カオス: 抹消の側 (無ければ両側) に外せる MOD が無ければ先に高貴で 1 つ付ける
 * - パーフェクトエッセンス: 同じ系統のハズレがあれば先に消去、結晶化の側にハズレが無ければ先に高貴で 1 つ付ける (当たりを上書きしないため)
 */
function preRule(r: Row, long = false): string | null {
  const k = r.set?.kind;
  if (!r.set || !r.step.target || r.step.target === ANY_TARGET) return null;
  const sd = preAnnul(r);
  if (sd) return long ? `打つ前に${sd}がハズレで埋まっていたら、先に消去してから打つ (埋まったままだと反対の側にしか付かない。反対の側に当たりがあれば側のお告げ付きの消去)` : `打つ前: ${sd}がハズレで埋まっていたら消去`;
  if (k === "chaos") {
    const side = r.set.omens.some((o) => /Sinistral/.test(o)) ? "プレ" : r.set.omens.some((o) => /Dextral/.test(o)) ? "サフィ" : "両側";
    return long ? `打つ前に${side}に外せる MOD が無ければ、先に高貴で 1 つ付けてから打つ (カオスは 1 つ消して 1 つ付ける)` : "打つ前: 外せる物が無ければ高貴で 1 つ";
  }
  if (k === "essence_perfect") return long ? "打つ前に同じ系統のハズレがあれば先に消去、結晶化の側にハズレが無ければ先に高貴で 1 つ付けてから打つ (当たりを上書きしないため)" : "打つ前: 同系統のハズレは消去、無ければ高貴で 1 つ";
  return null;
}
/** カオスの手の狙いが後で消えて戻った時、計算は完全高貴 + 側のお告げで取り直す (カオスだと付いている他の狙いも消すため。2026-10-08 レビュー D4) */
const chaosRegain = (r: Row): boolean => r.set?.kind === "chaos" && !!r.step.target && r.step.target !== ANY_TARGET && !isRest(r.step.target);
/**
 * お告げ無しの消去で外す、増強・高貴の手 (狙いが 1 つ) なら、狙いの側と反対の側 (どちらが消えたかで枝が分かれる。PatternStep.otherGone)
 */
const splitOpen = ref(false);
/** 枝 3 本の要約 1 行 (既定の打ち方) */
function splitSummary(r: Row, sp: { t: string; o: string }): string {
  const keep = otherJunkOf(r.set?.kind, r.step.otherJunk) === "keep";
  const again = otherGoneOf(r.set?.kind, r.step.otherGone) === "annul";
  // 反対の側のハズレも消す時は「だけ」にならない (2026-10-08 完成判定: ツリーと逆の文になっていた)
  return `${keep ? `ハズレが${sp.t} (狙いの側) に付いた時だけ消去。${sp.o}に付いたら消さずに打つ` : "ハズレはどちらの側に付いても消去"}。消去後に${sp.t}のハズレが残ったら${again ? "もう一度消去" : "そのまま打つ"}`;
}
function sideSplit(r: Row): { t: string; o: string } | null {
  const ms = missSet(r.step);
  if (!r.set || (r.set.kind !== "augment" && r.set.kind !== "exalt") || needs2(r) || !hasMiss(r) || !ms || ms.kind !== "annul" || ms.omens.length) return null;
  const id = r.step.target;
  if (!id || id === ANY_TARGET || isRest(id)) return null;
  const suf = ctx.value?.data.mods.get(id)?.type === "suffix";
  return suf ? { t: "サフィ", o: "プレ" } : { t: "プレ", o: "サフィ" };
}
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
  fracture: "border-violet-400/70",
};
/** カードの見出し (付ける物を短く: 「火耐性 T3+」) */
function cardTitle(r: Row): string {
  if (r.set?.kind === "annul") return "ハズレを消す";
  if (!r.step.target) return r.set?.kind === "rune" ? "ルーン未定" : "MOD 未定";
  if (r.step.target === ANY_TARGET) {
    // 後ろに自前のフラクチャーがある骨は、発現させずに壁にする (計算と同じ。2026-10-08 レビュー D5: 画面に出ていなかった)
    const i = pat.value.steps.indexOf(r.step);
    if (r.set?.kind === "desecrate" && i >= 0 && pat.value.steps.slice(i + 1).some((st) => setByKey(sets.value, st.set)?.kind === "fracture")) return "打つだけ (壁: 発現させない)";
    return "打つだけ";
  }
  if (isRest(r.step.target)) return `残りの MOD (${Number(r.step.target.slice(REST.length)) + 1} 手目の候補)`;
  if (r.set?.kind === "rune") return RUNES[r.step.target]?.ja ?? r.step.target;
  if (r.set?.kind === "fracture") return candsOf(r).length ? `${[r.step.target, ...candsOf(r)].map(cardTitleOf).join(" / ")} のどれかを固定` : `${cardTitleOf(r.step.target)} を固定`;
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
  const curOk = !!cur && !!c && (isRest(key) ? hasCands(cur) : key === ANY_TARGET ? ANY_KINDS.has(cur.kind) : isRune ? cur.kind === "rune" : cur.kind !== "rune" && !!t && !checkTarget(c, stateBefore(c, pat.value.steps, i), cur, t));
  patch(i, { target: key, ...(isRune && runeSet ? { set: runeSet.key, onMiss: "next" as MissRule, miss: null } : key === ANY_TARGET ? { onMiss: "next" as MissRule, miss: null } : {}), ...(curOk || isRune ? {} : { set: "" }) });
  // MOD を選んだらそのまま次の段 (カレンシー) へ。カレンシーの段だけはお告げを続けて選ぶので「次へ」を押す
  // (2026-10-08 オーナー「カレンシーは必ず次へ押さんとお告げが表示されないけど、他の奴とかは押したら次へ行ってもいい」。2026-10-07 の「選択した瞬間次にいかなくさせる」はカレンシーの話)
  // 打つだけ → MOD に変えた時など、カレンシーがそのままなら既定のやり直し (増強は消去、変成はハズレを消して次へ) を入れ直す (2026-10-08 レビュー N8)
  if (curOk && cur && !isRune && key !== ANY_TARGET) onSet(i, cur.key);
  // 「この中のどれか」の選択肢: ほかの候補も入れる (候補のどれかで当たり)
  const grp = rows.value[i]?.targetOpts.find((o) => o.key === key)?.members;
  if (grp) { const others = grp.filter((id) => id !== key); patch(i, { target2: others[0] ?? null, target3: others[1] ?? null }); }
  editPart.value = "target";
  nextPart(i);
}
/** 付けるカレンシーの棚: 選んだ付ける物に付けられない物は理由つきで選べない */
function whyAddAt(i: number): (x: PatternSet) => string | null {
  const c = ctx.value;
  if (!c) return () => null;
  const st = stateBefore(c, pat.value.steps, i);
  const tg0 = pat.value.steps[i]?.target;
  const tg = isRest(tg0) ? restMembers(pat.value.steps, tg0)[0] : tg0;
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
  // 打つだけ: 消去も含めて全部 (手で打つ画面の棚と同じ)。使えない物は理由つきで灰色 (whyAddAt)
  if (r.step.target === ANY_TARGET) return sets.value.filter((x) => ANY_KINDS.has(x.kind));
  return addSets.value.filter((x) => x.kind !== "rune");
}
/** 付ける側の棚 (消去は外す側にだけ出す。2026-10-07 オーナー「付ける時は削除の手とか表示しなくてもおｋ」) */
const addSets = computed(() => sets.value.filter((x) => x.kind !== "annul"));
/** やり直しを選べる手か (外れがあって、レアリティが変わらない手) */
const hasMiss = (r: Row): boolean => !!r.set && !noMiss(r.set) && r.set.kind !== "fracture" && !(RARITY_CHANGE.has(r.set.kind) && r.set.kind !== "transmute") && r.step.target !== ANY_TARGET && !!r.step.target;
/** 変成の手 (外してもう一度は無理。選べるのは「狙いの側のハズレを消して次へ」か「そのまま次へ」。王者・錬金の後は枠が空くので選ぶ物が無い) */
const rarityStep = (r: Row): boolean => r.set?.kind === "transmute";
/** 狙いの側 (候補が両側なら「狙いの側」) */
function targetSideJa(r: Row): { t: string; o: string } | null {
  const id = r.step.target;
  if (!id || id === ANY_TARGET || !ctx.value) return null;
  const ids = isRest(id) ? restMembers(pat.value.steps, id) : [id, ...candsOf(r)];
  const sides = new Set(ids.map((x) => (ctx.value!.data.mods.get(x)?.type === "suffix" ? "サフィ" : "プレ")));
  if (sides.size !== 1) return { t: "狙いの側", o: "反対の側" };
  const t = [...sides][0]!;
  return { t, o: t === "サフィ" ? "プレ" : "サフィ" };
}
/** 外れの枝を出す手 (打つだけの手は外れが無い) */
const showMiss = (r: Row): boolean => !!r.set && !noMiss(r.set) && r.step.target !== ANY_TARGET;
/** 手のカードを押した: 右の枠でその手を決める (もう一度押すと閉じる)。外れの枝はやり直しだけ */
function selectRow(i: number, part: "miss" | "single" | "lost" | null = null): void {
  focusPre.value = null;
  if (focusRow.value === i && editPart.value === part) { closeFrame(); return; }
  focusRow.value = i;
  editPart.value = part;
  scrollToEditor();
}
/** スマホ: 手を押したら設定のシートが開く (シートの中を先頭へ)。PC は動かさない */
const editorEl = ref<HTMLElement | null>(null);
const sheetOpen = computed(() => focusRow.value != null || focusPre.value != null);
function scrollToEditor(): void {
  if (!phone.value) return;
  void nextTick(() => (cardBox.value ?? editorEl.value)?.scrollIntoView({ block: "start" }));
}
function closeSheet(): void {
  const i = focusRow.value;
  closeFrame();
  focusPre.value = null;
  // スマホ: 閉じたら押していた手のカードが見える所へ (2026-10-08 レビュー: 閉じたら前の位置)
  if (phone.value && i != null) void nextTick(() => document.querySelector(`[data-step="${i}"]`)?.scrollIntoView({ block: "center" }));
}
// シートが開いている間はページを送らない (iOS で端まで行くと後ろのツリーが動いた)
watch(sheetOpen, (v) => { if (typeof document !== "undefined") document.body.style.overflow = v && phone.value ? "hidden" : ""; });
onBeforeUnmount(() => { if (typeof document !== "undefined") document.body.style.overflow = ""; });
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
  // 候補を足せる手 (カオス・高貴など) で、同じ側にほかの狙いがあれば「ほかの候補」も順に聞く (任意。飛ばされて気付かなかった。2026-10-08)
  else if (now === "set" && r.set && canCands(r) && !candsOf(r).length && r.target2Opts.some((o) => !o.why && o.key !== r.step.target)) editPart.value = "target2";
  else if ((now === "set" || now === "target2") && r.set && hasMiss(r)) editPart.value = "miss";
  else if (now === "set" && r.set && !needs2(r) && presentMods(i, r).length) editPart.value = "lost";
  else if (now === "miss" && needs2(r)) editPart.value = "single";
  else if ((now === "miss" || now === "single" || now === "target2") && presentMods(i, r).length) editPart.value = "lost";
  else confirmStep(i);
}
/** 偉大 (2 つ) の手で、2 つ目の MOD を選ぶ段がある (打つだけの手は無し) */
const needs2 = (r: Row): boolean => isDouble(r.set) && r.step.target !== ANY_TARGET && !isRest(r.step.target);
/** 候補を足せる手 (ガチャ。偉大でなければ任意、どれか 1 つで当たり) */
const canCands = (r: Row): boolean => hasCands(r.set) && !!r.step.target && r.step.target !== ANY_TARGET && !isRest(r.step.target);
/** 下のボタンが「この手にする」になる段 (この後に選ぶ物が無い) */
function lastPart(i: number, r: Row): boolean {
  const now = partOf(i, r);
  if (now === "set") return !!r.set && !needs2(r) && !hasMiss(r) && !presentMods(i, r).length;
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
  const out = [...stateBefore(c, pat.value.steps, i).placed].filter((id) => !(id === r.step.target && retryFrom.value.has(i)));
  if (needs2(r) && r.step.target && r.step.target !== ANY_TARGET) out.push(r.step.target, ...candsOf(r));
  const can = removableIn(i, r);
  return [...new Set(out)].filter((id) => c.targets.find((t) => t.modId === id)?.method !== "fracture" && can(id));
}
/** その手が狙い以外の MOD (外れ・打つだけで付いた物) も消しうるか (光のお告げは冒涜だけなので、冒涜でなければ消さない) */
function removesAny(r: Row): boolean {
  const ms = hasMiss(r) ? missSet(r.step) : undefined;
  return (!!r.set && (r.set.kind === "chaos" || r.set.kind === "essence_perfect" || (r.set.kind === "annul" && !r.set.omens.includes("OmenofLight")))) || (!!ms && !ms.omens.includes("OmenofLight"));
}
/**
 * その手で外れうる MOD か (打つ物とやり直しの物で消える物だけ。2026-10-07 オーナー「光のお告げなのに冒涜以外の外れたら見たいな選択肢が出る」)。
 * 光のお告げは冒涜で付けた物だけ、左右のお告げはその側だけ、足すだけの手 (高貴・骨など) でやり直しも無ければ何も外れない
 */
function removableIn(i: number, r: Row): (id: string) => boolean {
  const c = ctx.value;
  if (!c) return () => false;
  const rems: PatternSet[] = [];
  // 打つだけの消去 (フラクチャー後の消去など) もランダムに当たりを消す (2026-10-08 レビュー D7: 枝もオレンジも出ていなかった)
  if (r.set && (r.set.kind === "chaos" || r.set.kind === "essence_perfect" || r.set.kind === "annul")) rems.push(r.set);
  const ms = hasMiss(r) ? missSet(r.step) : undefined;
  if (ms) rems.push(ms);
  const sideOfId = (id: string): "prefix" | "suffix" => (c.data.mods.get(id)?.type === "suffix" ? "suffix" : "prefix");
  const desecrated = new Set(pat.value.steps.slice(0, i + 1).filter((st) => setByKey(sets.value, st.set)?.kind === "desecrate").flatMap((st) => [st.target, st.target2, st.target3]).filter((x): x is string => !!x));
  // 自前のフラクチャーで固定した物 (候補のどれか) は消えない
  const fixedIds = fixedIdsBefore(i);
  return (id) => !fixedIds.has(id) && rems.some((x) => {
    if (x.omens.includes("OmenofLight")) return desecrated.has(id);
    const side = x.omens.some((o) => /Sinistral/.test(o)) ? "prefix" : x.omens.some((o) => /Dextral/.test(o)) ? "suffix" : null;
    return !side || sideOfId(id) === side;
  });
}
/** その MOD を付けた手 (i 手目まで。「MOD が消えたら」の既定の戻り先) */
function placedAt(id: string, i: number): number {
  for (let j = i; j >= 0; j--) { const st = pat.value.steps[j]!; if (st.target === id || st.target2 === id || st.target3 === id || (isRest(st.target) && restMembers(pat.value.steps, st.target).includes(id))) return j; }
  // 手打ちの状態から始めて最初から付いていた物 (どの手も付けていない)
  if (props.start.mods?.placed.includes(id)) return -1;
  return i;
}
/** 消えたら戻る手 (決めていなければ付けた手。マジックの手で付けた物は打ち直せないので最初から) */
function gotoOf(i: number, r: Row, id: string): number {
  const g = r.step.lostGoto?.[id];
  if (g != null) return g;
  // まだマジックの増強の手で、消えた物がこの手の狙い (候補) なら、この手をもう一度 (増強で 2 つ狙う時。計算も同じ)
  if (augmentAgain(r, id)) return i;
  // 「残り」の手: 候補はこの手を続ける (全部消えたら元の手へ。計算と同じ)
  if (isRest(r.step.target) && restMembers(pat.value.steps, r.step.target).includes(id)) return i;
  const j = placedAt(id, i);
  // 始めから付いていた物: この状態を買い直して最初から
  if (j < 0) return LOST_RESTART;
  const k = setByKey(sets.value, pat.value.steps[j]?.set ?? "")?.kind;
  return k && ONCE_KINDS.has(k) ? LOST_RESTART : j;
}
/** 増強の手 (マジック) で、その MOD がこの手の狙いの候補か (消えても同じ増強で取り直せる) */
function augmentAgain(r: Row, id: string): boolean {
  if (r.set?.kind !== "augment" || !r.step.target) return false;
  const ids = isRest(r.step.target) ? restMembers(pat.value.steps, r.step.target) : candsOfStep(r.step);
  return ids.includes(id);
}
const gotoJa = (g: number): string => (g === LOST_RESTART ? (props.start.mods ? "この状態を作り直して最初から" : "最初から (新しいベース)") : `${g + 1} 手目に戻る`);
/** 戻れない手の理由 (ルーン・打つだけ・マジックの手) */
function whyNoGoto(r: Row, from?: Row): string | undefined {
  if (r.set?.kind === "rune") return "ルーンの手には戻れない";
  if (r.step.target === ANY_TARGET) return "打つだけの手には戻れない";
  // 増強の手の間 (まだマジック) なら、増強の手には戻れる
  if (r.set?.kind === "augment" && from?.set?.kind === "augment") return undefined;
  if (r.set && ONCE_KINDS.has(r.set.kind)) return "マジックの手 (レアには打てない)";
  return undefined;
}
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
  // 消えうる MOD が 1 つだけなら選んだらこの手は決まり (複数なら全部決めてから「この手にする」)
  const r = rows.value[i];
  if (r && presentMods(i, r).length === 1) nextPart(i);
}
/** やり直しの札: そのまま / 消去 / カオス / ほか (パーフェクトエッセンス・骨) */
const missMore = ref(false);
function missKind(r: Row): "none" | "annul_next" | "redo" | "annul" | "chaos" | "restart" | "other" {
  const x = missSet(r.step);
  if (!x && r.step.onMiss === "redo") return "redo";
  if (!x && r.step.onMiss === "annul_next") return "annul_next";
  if (!x && r.step.onMiss === "restart") return "restart";
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
/** 「付かなかったら」の札が選べない理由 (pattern.ts の checkMiss / checkRemoval。2026-10-08 レビュー B5: 骨で「もう一度打つ」を選べて、回すと止まっていた) */
function missWhy(r: Row, k: "none" | "annul_next" | "redo" | "annul" | "chaos" | "restart"): string | null {
  if (!r.set) return null;
  const rule: MissRule = k === "none" ? "next" : k === "redo" ? "redo" : k === "annul_next" ? "annul_next" : k === "restart" ? "restart" : "annul_redo";
  const w = checkMiss(r.set, rule);
  if (w) return w;
  if (k === "annul" || k === "chaos") {
    const rm = removals.value.find((x) => x.kind === k && !x.omens.length);
    return rm ? checkRemoval(r.set, rm) : null;
  }
  return null;
}
function pickMissKind(i: number, k: "none" | "annul_next" | "redo" | "annul" | "chaos" | "restart"): void {
  if (missWhy(rows.value[i]!, k)) return;
  // お告げの無い札はそのまま次の段へ (消去・カオスはお告げを続けて選ぶので留まる)
  if (k === "none" || k === "redo" || k === "annul_next" || k === "restart") { patch(i, { miss: null, onMiss: k === "redo" ? "redo" : k === "annul_next" ? "annul_next" : k === "restart" ? "restart" : "next" }); editPart.value = "miss"; nextPart(i); return; }
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
  if (!x && r.step.onMiss === "redo") return { text: "ハズレは残して同じ手をもう一度。その側が満杯になったらハズレを 1 つ消す", bad: false };
  if (!x && r.step.onMiss === "annul_next") { const sd = targetSideJa(r); return { text: sd ? `ハズレが${sd.t}に付いたら消去してから次の手へ (消した後はどちらの側にも付く)。${sd.o}に付いたら残して次の手へ (その時は次の手が必ず${sd.t}に付く)` : "", bad: false }; }
  if (!x) return { text: "ハズレは残したまま次の手へ進む", bad: false };
  if (!c) return { text: "", bad: false };
  if (x.omens.includes("OmenofLight")) return { text: "冒涜の MOD だけを消す (付いている狙いは消えない)", bad: false };
  if (x.omens.includes("OmenofWhittling")) return { text: "一番 MOD レベルの低い物を入れ替える (ハズレが狙いより低ければ安全、高ければ狙いを消す)", bad: true };
  if (x.kind !== "annul" && x.kind !== "chaos") return { text: "", bad: false };
  const side = x.omens.some((o) => /Sinistral/.test(o)) ? "prefix" : x.omens.some((o) => /Dextral/.test(o)) ? "suffix" : null;
  const sideOfId = (id: string): "prefix" | "suffix" => (c.data.mods.get(id)?.type === "suffix" ? "suffix" : "prefix");
  const n = presentMods(i, r).filter((id) => !(needs2(r) && [r.step.target, ...candsOf(r)].includes(id)) && (!side || sideOfId(id) === side)).length;
  const verb = x.kind === "chaos" ? "入れ替える" : "消す";
  // 偉大の手は「1 つだけ当たり」の時、当たった方も消す候補に入る
  if (needs2(r)) return { text: `どれも付かなかった時: ${n ? `狙いを巻き込む ${n}/${n + 1}` : "安全"} / 1 つだけ当たりの時: 当たった MOD を巻き込む ${n + 1}/${n + 2}`, bad: true };
  // 前の手が「どれか」(候補) の手なら、付いた方がどれかは決まっていない: 消去で 1/2 で消える (消えたらこの手でもう一度。2026-10-08 レビュー B4)
  const unsure = isRest(r.step.target) || candsOf(r).length > 0;
  return n ? { text: `ハズレと、付いている狙い ${n} つのどれかを${verb} → 狙いを巻き込む ${n}/${n + 1}`, bad: true } : unsure ? { text: `ハズレを${verb} (前の手で付いた方が消えることもある → 消えたらこの手でもう一度)`, bad: false } : { text: `ハズレを${verb} (この時点で付いている狙いは無いので安全)`, bad: false };
}
/**
 * この手を打つ時に消える確率 (打つ物が消してから付ける物の時: カオス・パーフェクトエッセンス)。その側の固定以外の MOD (狙い + 外れ) から 1 つ。
 * 外れが無ければ狙いが必ず消える (2026-10-07 オーナー「最後のエッセンスで 1 手前に付けたエッセンスも消える時はやり直しの選択させるんじゃなかったか」)
 */
function lostRisk(i: number, r: Row): { text: string; bad: boolean } | null {
  const c = ctx.value;
  if (!c || !r.set || (r.set.kind !== "chaos" && r.set.kind !== "essence_perfect")) return null;
  const side = r.set.omens.some((o) => /Sinistral/.test(o)) ? "prefix" : r.set.omens.some((o) => /Dextral/.test(o)) ? "suffix" : null;
  const st = stateBefore(c, pat.value.steps, i);
  const sideOfId = (id: string): "prefix" | "suffix" => (c.data.mods.get(id)?.type === "suffix" ? "suffix" : "prefix");
  const fr = c.start.fracturedSide;
  const count = (sd: "prefix" | "suffix"): number => st[sd] - (fr === sd ? 1 : 0);
  const goods = presentMods(i, r).filter((id) => !side || sideOfId(id) === side);
  if (!goods.length) return null;
  const names = goods.map(cardTitleOf).join("・");
  const sideJa = side === "suffix" ? "サフィ" : side === "prefix" ? "プレ" : "";
  // パーフェクトエッセンスは、結晶化の側に空きがあれば計算が先に高貴でハズレを 1 つ付けてから打つ (当たりは上書きされない。2026-10-08 レビュー D3:
  // 前は「必ず消える」と警告していて計算と逆だった)。側が当たりで埋まっていれば足せないので下の「必ず消える」
  if (r.set.kind === "essence_perfect") {
    const sds: Array<"prefix" | "suffix"> = side ? [side] : ["prefix", "suffix"];
    if (sds.some((sd) => st[sd] < st.limits[sd])) return { text: `ハズレが無ければ先に高貴で 1 つ付けてから打つので、${names} は消えない (ハズレがあればそれを上書き)`, bad: false };
  }
  // 打つだけで付いた外れは側が分からない (側のお告げの時は、その側に付いていれば候補が増える)
  if (side && count(side) <= goods.length) {
    return st.junk > 0
      ? { text: `打つだけで付いた MOD が${sideJa}にあれば ${goods.length}/${goods.length + 1} で ${names} が消える。${sideJa}に無ければ必ず消える`, bad: true }
      : { text: `この手で ${names} が必ず消える (${sideJa}にハズレが無い。先に打つだけで 1 つ付けておくか、戻り先を決める)`, bad: true };
  }
  const n = side ? count(side) : count("prefix") + count("suffix") + st.junk;
  if (n <= goods.length) return { text: `この手で ${names} が必ず消える (ハズレが無い。先に打つだけで 1 つ付けておくか、戻り先を決める)`, bad: true };
  return { text: `この手で消える候補 ${n} つのうち、狙い ${goods.length} つ (${names}) → ${goods.length}/${n}`, bad: false };
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
  else if (canCands(r)) out.push({ part: "target2", name: "ほかの候補 (任意)", icons: [], text: candsOf(r).map(cardTitleOf).join(" / "), state: now === "target2" ? "now" : candsOf(r).length ? "done" : "todo" });
  if ((!r.set && r.step.target !== ANY_TARGET) || hasMiss(r)) out.push({ part: "miss", name: "付かなかったら", icons: icons(missSet(r.step)), text: r.set && !r.step.miss ? (r.step.onMiss === "redo" ? "もう一度打つ" : r.step.onMiss === "annul_next" ? "ハズレを消して次へ" : "選択無し") : "", state: st("miss", hasMiss(r)) });
  if (needs2(r)) out.push({ part: "single", name: "片方当たり後の 1 発", icons: icons(singleSet(r)), text: "", state: st("single", true) });
  if (presentMods(i, r).length) out.push({ part: "lost", name: "MOD が消えたら", icons: [], text: "", state: st("lost", true) });
  return out;
}
/** 左右の枠の高さ (最小の窓 1660×860 でもページを送らずに収まる) */
const paneHeight = "max(420px, calc(100vh - 430px))";
/** スマホ (幅 768 CSS px 未満): ツリー・手の設定・アイテムを縦に積み、高さを決めずページで送る (2026-10-08) */
const phone = ref(typeof window !== "undefined" && window.innerWidth < 768);
const onPhoneResize = (): void => { phone.value = window.innerWidth < 768; };
onMounted(() => window.addEventListener("resize", onPhoneResize));
onBeforeUnmount(() => window.removeEventListener("resize", onPhoneResize));
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
  scrollToEditor();
  // 手を足したらツリーを一番下まで送る (足した手と「＋ 手を足す」が見える。2026-10-07 オーナー「付けたらスクロール一番下に持っていっていい」)
  void nextTick(() => { const box = treeEl.value; if (box) box.scrollTop = box.scrollHeight; });
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
  // 決めたら閉じるだけ。次の手は自分で「＋ 手を足す」で足す (2026-10-07 オーナー「設定が終わったら枠を勝手に増やさなくていい、手動でやる」)。スマホは閉じたらその手のカードへ
  closeSheet();
  // PC: 決めたら左のツリーを一番下へ (次の「＋ 手を足す」が見える。2026-10-08 オーナー)
  if (!phone.value) void nextTick(() => { const box = treeEl.value; if (box) box.scrollTop = box.scrollHeight; });
}
function patch(i: number, p: Partial<PatternStep>): void {
  setSteps((list) => list.map((x, k) => (k === i ? { ...x, ...p } : x)));
}
function onSet(i: number, key: string): void {
  // セットを変えたら付ける物は選び直し (打ち方で付けられる物が違う)。外れた時は選べる物に寄せる
  const set = setByKey(sets.value, key);
  const cur = pat.value.steps[i]!;
  // やり直せない手は「そのまま次へ」、ほかは「やり直し」。外す物がその手で使えなくなったら選び直し
  // フラクチャーは外れたら (違う MOD が固定されたら) 新しいベースで最初から
  // レアリティが変わる手で狙いがあるなら「狙いの側のハズレを消して次へ」が既定 (2026-10-08 オーナー「付かなかったら消去で増強やん 1 手目から」)
  const miss: MissRule = set?.kind === "fracture" ? "restart" : set?.kind === "transmute" ? (cur.target && cur.target !== ANY_TARGET ? "annul_next" : "next") : set && RARITY_CHANGE.has(set.kind) ? "next" : "annul_redo";
  const rm = cur.miss ? setByKey(sets.value, cur.miss) : undefined;
  const keepMiss = cur.miss && !(rm && set && checkRemoval(set, rm));
  if (!hasCands(set)) patch(i, { target2: null, target3: null });
  // 増強 (マジック) は「消去で消す (お告げ無し)」が既定: 1 手目の「ハズレを消して次へ」から消去 → 増強の繰り返しに繋がる (2026-10-08 レビュー A1)。
  // ほかの手は選択無し (2026-10-07 オーナー「外れてもいいならそこは選択無しをデフォで」)
  const plainAnnul = set?.kind === "augment" && cur.target && cur.target !== ANY_TARGET ? removals.value.find((x) => x.kind === "annul" && !x.omens.length)?.key ?? null : null;
  patch(i, { set: key, onMiss: keepMiss ? "annul_redo" : miss === "annul_redo" ? (plainAnnul ? "annul_redo" : "next") : miss, ...(keepMiss ? {} : { miss: plainAnnul }) });
  // 「この中のどれか」の狙いは、候補を付けられるカレンシーになったら残りの候補も入れる (MOD を先に選んだ時はまだ入らない)
  const grp = cur.target ? rows.value[i]?.targetOpts.find((o) => o.key === cur.target)?.members : undefined;
  if (grp && hasCands(set) && !cur.target2) { const others = grp.filter((id) => id !== cur.target); patch(i, { target2: others[0] ?? null, target3: others[1] ?? null }); }
}

function move(i: number, d: -1 | 1): void {
  setSteps((list) => { const j = i + d; [list[i], list[j]] = [list[j]!, list[i]!]; return list; });
}
const remove = (i: number): void => setSteps((list) => list.filter((_, k) => k !== i));

/** 重ならない名前 (結果はパターンの名前で引くので、同じ名前は取り違える。2026-10-08 使い倒しテスト 4) */
function uniqueName(base: string, skip: number | null = null): string {
  const taken = new Set(s.simPatterns.value.filter((_, i) => i !== skip).map((p) => p.name));
  if (!taken.has(base)) return base;
  const m = /^(.*?)(?: (\d+))?$/.exec(base);
  const stem = m?.[1] ?? base;
  for (let n = (Number(m?.[2]) || 1) + 1; ; n++) if (!taken.has(`${stem} ${n}`)) return `${stem} ${n}`;
}
function addPattern(copy: boolean): void {
  s.simPatterns.value = [...s.simPatterns.value, { name: uniqueName(`パターン ${s.simPatterns.value.length + 1}`), steps: copy ? pat.value.steps.map((x) => ({ ...x })) : [] }];
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
defineExpose({ rows });
</script>

<template>
  <div class="text-[11px] max-md:text-[12px]">
    <!-- パターンのタブ -->
    <div class="mb-1.5 flex flex-wrap items-center gap-1">
      <!-- タブはダブルクリックで名前を付け替える (2026-10-07 オーナー「名前も自分で変えて」。番号だけだと 10 個並ぶと取り違える) -->
      <template v-for="(p, i) in s.simPatterns.value" :key="i">
        <input v-if="renaming === i" :ref="(el) => { if (el) (el as HTMLInputElement).focus(); }" :value="p.name" class="w-40 rounded-full border border-amber-400/60 bg-black/50 px-2.5 py-0.5 outline-none" @keydown.enter="($event.target as HTMLInputElement).blur()" @keydown.esc="renaming = null" @blur="rename(i, ($event.target as HTMLInputElement).value)" />
        <button v-else type="button" class="rounded-full px-2.5 py-0.5 max-md:min-h-10" :class="i === Math.min(active, s.simPatterns.value.length - 1) ? 'bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/60' : 'border border-white/15 opacity-70 hover:opacity-100'" title="ダブルクリックで名前を変える" @click="active = i" @dblclick="locked || (renaming = i)">{{ p.name }} <span class="opacity-60">({{ p.steps.length }} 手)</span></button><button v-if="!locked && renaming !== i" type="button" class="rounded px-1 text-[12px] opacity-60 md:hidden" title="名前を変える" @click.stop="renaming = i">✎</button>
      </template>
      <template v-if="!locked">
        <button type="button" class="rounded border border-white/15 px-1.5 opacity-70 hover:opacity-100 max-md:min-h-10 max-md:min-w-10" title="空のパターンを足す" @click="addPattern(false)">＋</button>
        <button type="button" class="rounded border border-white/15 px-1.5 opacity-70 hover:opacity-100 max-md:min-h-10 max-md:min-w-10" title="このパターンを写して足す (少しだけ変えて比べる時に)" @click="addPattern(true)">⧉</button>
        <button type="button" class="rounded border border-white/15 px-1.5 opacity-70 hover:opacity-100 disabled:opacity-30 max-md:min-h-10 max-md:min-w-10" :disabled="s.simPatterns.value.length <= 1" :title="s.simPatterns.value.length <= 1 ? 'パターンが 1 つの時は消せない' : 'このパターンを消す'" @click="removePattern">×</button>
        <button type="button" class="ml-1 rounded-lg border border-amber-400/60 bg-amber-500/15 px-2 py-0.5 font-bold text-amber-100 hover:bg-amber-500/25 disabled:opacity-30 max-md:hidden" :disabled="busy || !pat.steps.length" :title="pat.steps.length ? 'このパターンで 1,500 人がそれぞれ完成まで作った場合を試す (未完成でも組めている所まで)。結果は下に' : '手が無い'" @click="emit('run-one', Math.min(active, s.simPatterns.value.length - 1))">このパターンを回す ▶</button>
        <button type="button" class="ml-1 rounded-lg border border-white/20 px-2 py-0.5 hover:bg-white/10 disabled:opacity-30 max-md:min-h-10" :disabled="!history.length" :title="history.length ? 'パターンの直前の操作を 1 つ取り消す' : '戻せる操作がまだ無い'" @click="undoPattern">↶ 1 つ戻す</button>
      </template>
    </div>

    <!-- 左: ツリー (自分の中で送る) / 右: 押した手を決める枠 + その時点のアイテム (動かない) -->
    <div class="flex gap-3 max-md:flex-col" :style="phone ? undefined : { height: paneHeight }">
      <div ref="treeEl" class="w-[372px] shrink-0 overflow-y-auto rounded-lg bg-black/25 p-2 [overflow-anchor:none] max-md:w-full max-md:overflow-visible">
        <!--
          フラクチャーまで: 後の手と同じカード・同じ枝で見せる (変えられない。費用は 4 最安値スタートの計算)。押すと右のアイテムがその時点に
          (2026-10-07 オーナー「小さすぎてとりあえず表示しましたみたい、フラクチャー後の流れと同じ UI でクリックできない感じでおｋ」)
        -->
        <template v-for="(n, k) in preNodes" :key="'pre' + k">
          <div v-if="k > 0" class="ml-[6.5rem] flex h-4 items-center">
            <span class="h-full w-px bg-emerald-400/50"></span>
            <span class="ml-1 text-[9px] text-emerald-300/80">当たり</span>
          </div>
          <div class="flex items-start max-md:flex-wrap">
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
                <span class="h-px w-4 border-t border-dashed border-rose-400/60 max-md:hidden"></span>
                <span class="flex items-center gap-1 rounded-md border border-rose-400/40 bg-rose-950/30 px-1.5 py-1">
                  <span class="text-rose-300">付かなかった</span>
                  <template v-if="n.miss.icons.length">
                    <span class="opacity-60">→</span>
                    <img v-for="c in n.miss.icons" :key="c" :src="iconOf(c)" alt="" class="h-5 w-5 object-contain" />
                  </template>
                  <span v-else class="text-rose-200">{{ n.miss.text.startsWith("⟲") ? n.miss.text.replace(/\s*\(.*$/, "") : "→ 白から" }}</span>
                </span>
              </span>
              <span class="flex items-center text-[10px] text-amber-200/90">
                <span class="text-rose-300">◀</span>
                <span class="h-px w-5 border-t border-dashed border-rose-400/60 max-md:hidden"></span>
                <span class="ml-1">{{ n.miss.icons.length ? "付くまで繰り返す" : "当たり 1/3" }}</span>
              </span>
            </span>
          </div>
        </template>
        <!-- ここから自分で作る手 -->
        <div v-if="preNodes.length" class="my-2 flex items-center gap-2 text-[10px] text-amber-200/80">
          <span class="h-px flex-1 bg-amber-400/30"></span><span ref="ownStart">フラクチャー済み · ここから作る</span><span class="h-px flex-1 bg-amber-400/30"></span>
        </div>
        <div v-else class="w-52 rounded-md border border-white/20 bg-black/40 px-2 py-0.5 opacity-80">始め: {{ props.start.mods ? "手打ちの状態" : "白のベース" }}</div>
        <template v-for="(r, i) in rows" :key="i">
          <!-- 当たりの線 -->
          <!-- 外れた時だけの手の前: 緑 (付いた → 飛ばす先) と赤 (付かなかった時だけ ↓) を縦線の所に並べる (2026-10-08 レビュー A6: 緑が赤い枝の列に並んで「付かなかった → 完成」と読めた) -->
          <div v-if="(i > 0 || !preNodes.length) && retryFrom.has(i) && !retryFrom.has(i - 1)" class="ml-[6.5rem] flex h-8 items-stretch">
            <span class="w-px border-l border-dashed border-rose-400/60"></span>
            <span class="ml-1 flex flex-col justify-center text-[9px] leading-tight">
              <span class="text-emerald-300/80">付いた → {{ hitTo(retryFrom.get(i)!) < rows.length ? `${hitTo(retryFrom.get(i)!) + 1} 手目へ` : "完成" }} (この手は飛ばす)</span>
              <span class="text-rose-300/90">{{ retryFrom.get(i)! + 1 }} 手目で付かなかった時だけ ↓</span>
            </span>
          </div>
          <div v-else-if="i > 0 || !preNodes.length" class="ml-[6.5rem] flex h-4 items-center">
            <span class="h-full w-px bg-emerald-400/50"></span>
            <span class="ml-1 text-[9px] text-emerald-300/80">{{ i === 0 ? "" : retryFrom.has(i - 1) && !retryFrom.has(i) ? `当たり (${[...new Set([...retryFrom.entries()].filter(([j]) => j < i).map(([, f]) => f + 1))].join("・")} 手目で付いた時もここへ)` : "当たり" }}</span>
          </div>
          <div class="flex items-start max-md:flex-wrap">
            <!-- 手のカード -->
            <div :data-step="i" class="relative w-52 shrink-0 rounded-md border bg-gradient-to-b from-white/[0.05] to-black/50 transition" :class="[r.set ? KIND_TONE[r.set.kind] ?? 'border-white/20' : 'border-dashed border-white/25', focusRow === i ? 'ring-2 ring-amber-400/70' : 'hover:brightness-125', r.bad ? 'border-rose-500/80' : '']">
              <!-- 右上の ×: この手から後を全部消す (2 回押し) -->
              <button v-if="!locked" type="button" class="absolute right-0.5 top-0.5 z-10 rounded px-1 leading-none max-md:hidden" :class="cutArmed === i ? 'bg-rose-600/80 text-white' : 'opacity-50 hover:bg-rose-600/40 hover:opacity-100'" :title="cutArmed === i ? 'もう一度押すと、この手から後を全部消す' : 'この手から後を全部消す'" @click.stop="cutFrom(i)">{{ cutArmed === i ? "後ろを全部消す?" : "×" }}</button>
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
              <!--
                この手だけ回す (ガチャで付くまで打つ手だけ。2026-10-07 オーナー「カオス何個分で単純にできるか知りたい」「8 割の人で出した方が良さそう」)。
                その手の前までは当たった状態から、その手だけ 500 人分 (上限は回すの横の設定)。結果はカードのすぐ下 (アイテムのカードは隠さない)
              -->
              <p v-if="r.bad" class="border-t border-rose-500/40 px-1.5 py-0.5 text-[10px] text-rose-300 md:hidden">{{ r.bad }}</p>
              <div v-if="hasMiss(r) && !rarityStep(r) && !r.bad && r.step.target" class="flex items-center border-t border-white/10 px-1.5 py-0.5">
                <button type="button" class="rounded border border-sky-400/40 px-1.5 text-[10px] text-sky-200 hover:bg-sky-500/10 disabled:opacity-40" :disabled="busy" :title="`${i + 1} 手目の前までは当たった状態から、この手だけを ${(stepRuns ?? 0).toLocaleString()} 人分回す (1 人 ${(stepMax ?? 0).toLocaleString()} 回まで)`" @click.stop="emit('run-step', active, i)">この手だけ回す ▶</button>
              </div>
              <div v-if="stepRun && stepRun.k === active && stepRun.i === i" class="border-t border-sky-400/30 bg-sky-950/30 px-1.5 py-1 text-[11px]">
                <div class="flex items-center gap-1">
                  <span class="text-[10px] opacity-60">この手だけ · {{ (stepRuns ?? 0).toLocaleString() }} 人</span>
                  <button type="button" class="ml-auto rounded px-1 leading-none opacity-50 hover:bg-white/10 hover:opacity-100" title="閉じる" @click.stop="emit('close-step')">×</button>
                </div>
                <p v-if="stepRun.busy" class="py-1 text-sky-200">回しています…</p>
                <template v-else>
                  <p class="font-bold text-sky-100" :title="`8 割の人がこの個数・金額までで付いた (${(stepRuns ?? 0).toLocaleString()} 人それぞれが打った数の 8 割目)`">8 割の人: {{ Math.round(stepRun.p80Presses).toLocaleString() }} 個 · {{ (money ?? ((x: number) => x.toFixed(1)))(stepRun.p80Cost) }}</p>
                  <p class="opacity-60">平均 {{ Math.round(stepRun.presses).toLocaleString() }} 個 · {{ (money ?? ((x: number) => x.toFixed(1)))(stepRun.cost) }}<template v-if="stepRun.pDone < 0.995"> · 付かなかった人 {{ Math.round((1 - stepRun.pDone) * 100) }}%</template></p>
                </template>
              </div>
            </div>
            <!-- 外れの枝: やり直す手は、外れ → やり直しのカレンシー → カードに戻る線で「付くまで繰り返す」 -->
            <span v-if="showMiss(r) && !needs2(r)" class="flex flex-col">
              <span class="flex items-center">
                <span class="h-px w-4 border-t border-dashed border-rose-400/60 max-md:hidden"></span>
                <button type="button" class="flex items-center gap-1 whitespace-nowrap rounded-md border border-rose-400/40 bg-rose-950/30 px-1.5 py-1 text-left hover:brightness-125" :class="focusRow === i && partOf(i, r) === 'miss' ? 'ring-2 ring-rose-400/70' : ''" :title="hasMiss(r) ? '押すと付かなかった時の打ち方を選ぶ' : r.set?.kind === 'fracture' ? '違う MOD が固定されたら新しいベースで最初から' : r.set && RARITY_CHANGE.has(r.set.kind) ? '王者・錬金の後は枠が空くので、外れても消す物が無い (そのまま次へ)' : '付ける物が無い手'" :disabled="!hasMiss(r) || locked" @click="selectRow(i, 'miss')">
                  <span class="text-rose-300">付かなかった</span>
                  <template v-if="missSet(r.step)">
                    <span class="opacity-60">→</span>
                    <img v-if="iconOf(missSet(r.step)!.currency)" :src="iconOf(missSet(r.step)!.currency)" alt="" class="h-5 w-5 object-contain" />
                    <span v-else class="h-5 w-5 rounded border border-dashed border-white/25"></span>
                    <img v-for="o in missSet(r.step)!.omens" :key="o" :src="iconOf(o)" alt="" class="h-5 w-5 object-contain" />
                  </template>
                  <span v-else class="opacity-70">{{ r.step.onMiss === "redo" ? "→ ↺" : r.step.onMiss === "restart" ? "→ 最初から" : r.step.onMiss === "annul_next" ? "→ 消して次へ" : hitTo(i) > i + 1 ? `→ ${i + 2} 手目へ` : "→ 次へ" }}</span>
                </button>
              </span>
              <!--
                外れた時だけの次の手 (増強など) が打つ前に消去する時は、外れがどちらの側に付いたかで枝を分けて出す
                (2026-10-07 オーナー「変成のオーブでハズレが狙いの MOD 群の所についてしまったら消去の表示がないぞ」)
              -->
              <span v-if="r.step.onMiss === 'annul_next' && targetSideJa(r)" class="mt-0.5 flex flex-col pl-5 text-[10px] leading-tight text-rose-200/90">
                <span class="whitespace-nowrap">ハズレが{{ targetSideJa(r)!.t }} → 消去 → {{ i + 1 < rows.length ? `${i + 2}手目` : "次の手" }}</span>
                <span class="whitespace-nowrap">ハズレが{{ targetSideJa(r)!.o }} → {{ i + 1 < rows.length ? `${i + 2}手目` : "次の手" }}</span>
              </span>
              <span v-if="missSet(r.step) || r.step.onMiss === 'redo'" class="flex items-center text-[10px] text-amber-200/90">
                <span class="text-rose-300">◀</span>
                <span class="h-px w-5 border-t border-dashed border-rose-400/60 max-md:hidden"></span>
                <span class="ml-1">付くまで繰り返す</span>
              </span>
              <span v-if="preRule(r)" class="ml-5 text-[10px] leading-tight opacity-70">{{ preRule(r) }}</span>
              <!-- 「残り」の手の決まり (計算と同じ。2026-10-08 オーナー「全部消えたら高貴 → 2 手目へ戻る」、完成判定 2 回目: 画面に出ていなかった) -->
              <span v-if="isRest(r.step.target)" class="ml-5 text-[10px] leading-tight opacity-70">候補が消えても 1 つでも残ればこの手を続ける、全部消えたら {{ Number(r.step.target!.slice(REST.length)) + 1 }} 手目へ</span>
              <span v-if="chaosRegain(r)" class="ml-5 text-[10px] leading-tight opacity-70">消えて戻った時: 完全高貴 + 側のお告げで取り直す</span>
              <span v-if="sideSplit(r)" class="ml-5 flex flex-col text-[10px] leading-tight opacity-70">
                <span>ハズレが{{ sideSplit(r)!.o }}に付いた → {{ otherJunkOf(r.set?.kind, r.step.otherJunk) === "keep" ? "消さずに打つ" : "消去" }}</span>
                <span>消去後 {{ sideSplit(r)!.t }}にハズレ → {{ otherGoneOf(r.set?.kind, r.step.otherGone) === "annul" ? "もう一度消去" : "打つ" }}</span>
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
              <span class="rounded bg-rose-950/50 px-1 text-rose-300">どれも付かなかった</span>
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
                <span class="opacity-60">├ ハズレが消えたら →</span>
                <img v-for="c in [singleSet(r)?.currency, ...(singleSet(r)?.omens ?? [])].filter((x) => x && iconOf(x))" :key="c" :src="iconOf(c!)" alt="" class="h-4 w-4 object-contain" />
                <span>1 発</span>
                <span class="text-amber-200/90">↺ 付くまで</span>
              </button>
            </div>
          </div>
          <!--
            MOD が外れたら (固定以外、MOD ごとに戻る手)。外れの枝と同じ見た目: 赤い札「○ が外れたら」→ 戻り先へ矢印の線
            (2026-10-07 オーナー「ちゃんと外れたら戻る感じの UI がいい、外れ → で 7 手目みたいな」)。押すと右の枠で戻る手を選ぶ
          -->
          <div v-if="r.set && presentMods(i, r).length" class="ml-3 space-y-1 pl-1 text-[10px]" :class="needs2(r) ? '' : 'mt-1'">
            <div v-for="id in presentMods(i, r)" :key="id" class="flex flex-col">
              <span class="flex items-center">
                <span class="h-3 w-3 rounded-bl border-b border-l border-dashed border-rose-400/60"></span>
                <button type="button" class="flex max-w-[15rem] items-center gap-1 rounded-md border border-rose-400/40 bg-rose-950/30 px-1.5 py-0.5 text-left hover:brightness-125" :disabled="locked" :title="`${cardTitleOf(id)} が消えたら ${gotoJa(gotoOf(i, r, id))} (押すと戻る手を選ぶ)`" @click="selectRow(i, 'lost')">
                  <span class="truncate font-bold text-rose-200">{{ cardTitleOf(id) }}</span>
                  <span class="shrink-0 text-rose-300">が消えたら</span>
                </button>
              </span>
              <span class="ml-3 flex items-center text-amber-200/90">
                <span class="text-rose-300">◀</span>
                <span class="h-px w-6 border-t border-dashed border-rose-400/60"></span>
                <span class="ml-1 font-bold">{{ gotoJa(gotoOf(i, r, id)) }}</span>
              </span>
            </div>
          </div>
        </template>
        <template v-if="!locked">
          <div class="ml-[6.5rem] h-3 w-px bg-white/20"></div>
          <button type="button" class="w-52 rounded-md border border-dashed border-amber-400/50 py-1 text-amber-200 hover:bg-amber-500/10 max-md:min-h-11 max-md:w-full" @click="addStep">＋ 手を足す</button>
        </template>
      </div>

      <!-- 右: 押した手を決める枠 -->
      <!--
        スマホ: 手を押した時だけ、アイテム + 手の設定を下から出る全画面のシートに (スマホの定番。ツリーの下に並べると設定が画面外で組めなかった。
        2026-10-08 オーナー「シミュレーターの方が UI 難しい、本気でやらんと」)。PC は contents で今まで通り横並び
      -->
      <div :class="phone ? (sheetOpen ? 'fixed inset-0 z-[170] flex flex-col overflow-y-auto overscroll-contain bg-[#0e0c09] px-3 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]' : 'hidden') : 'contents'">
        <div v-if="phone" class="mb-2 flex items-center justify-between max-md:order-1">
          <b class="text-[15px] text-amber-100">{{ focusPre != null ? (preNodes[focusPre]?.title ?? "") : focusRow != null ? `${focusRow + 1} 手目` : "" }}</b>
          <span class="flex items-center gap-2">
            <button v-if="focusRow != null && !locked" type="button" class="min-h-11 rounded-lg border border-rose-400/50 px-3 text-[12px] text-rose-200" title="この手だけ消す (後の手はそのまま)" @click="removeAt(focusRow)">この手を消す</button>
            <button type="button" class="grid min-h-11 min-w-11 place-items-center rounded-lg border border-white/25 text-[22px] leading-none" title="閉じる" @click="closeSheet">×</button>
          </span>
        </div>
      <div ref="editorEl" class="flex min-w-0 flex-1 flex-col rounded-lg bg-black/25 px-3 py-2 max-md:order-3 max-md:scroll-mt-2">
        <template v-if="focusRow != null && rows[focusRow] && !locked">
          <!-- いまの手と、決める順 (MOD → カレンシー → やり直し)。済み 緑 / いま 黄、押すとそこだけ選び直す -->
          <div class="mb-2 flex flex-wrap items-center gap-1 border-b border-white/10 pb-2">
            <b class="mr-2 text-[14px] text-amber-200">{{ focusRow + 1 }} 手目</b>
            <template v-for="(c, k) in chipsOf(focusRow, rows[focusRow]!)" :key="c.part">
              <span v-if="k > 0" class="h-px w-4" :class="c.state === 'todo' ? 'bg-white/15' : 'bg-emerald-400/50'"></span>
              <button type="button" class="flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 transition" :class="c.state === 'now' ? 'border-amber-400/80 bg-amber-500/15 text-amber-50 shadow-[0_0_10px_rgba(251,191,36,0.25)]' : c.state === 'done' ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-50 hover:border-emerald-300/70' : 'border-white/10 opacity-40'" :disabled="c.state === 'todo' && c.part !== 'target2'" @click="editPart = c.part">
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
                <button v-for="(o, k) in rows[focusRow]!.targetOpts" :key="o.key" type="button" class="group flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-[12px] transition disabled:cursor-not-allowed max-md:flex-wrap max-md:gap-x-2 max-md:gap-y-0.5" :class="rows[focusRow]!.step.target === o.key ? 'border-amber-400/80 bg-amber-500/15 shadow-[0_0_10px_rgba(251,191,36,0.2)]' : o.why ? 'border-white/5 bg-black/20' : 'border-white/10 bg-black/30 hover:border-amber-300/50 hover:bg-white/[0.04]'" :disabled="!!o.why" @click="pickTarget(focusRow, o.key)">
                  <span class="w-4 text-center font-bold" :class="o.why ? 'opacity-30' : 'text-amber-200'">{{ k + 1 }}</span>
                  <span class="w-9 text-[10px]" :class="o.why ? 'opacity-30' : 'opacity-60'">{{ orderInfo?.[order[o.n]!]?.side }}</span>
                  <span :class="o.why ? 'opacity-35' : orderInfo?.[order[o.n]!]?.tone">{{ o.members ? o.label : orderInfo?.[order[o.n]!]?.text ?? o.label }}</span>
                  <span v-if="orderInfo?.[order[o.n]!]?.rank" class="rounded-sm bg-amber-500/25 px-1 text-[10px] font-bold text-amber-100" :class="o.why ? 'opacity-35' : ''">{{ orderInfo[order[o.n]!]!.rank }} 以上</span>
                  <span class="text-[10px] opacity-50">{{ orderInfo?.[order[o.n]!]?.how }}</span>
                  <span class="ml-auto text-[11px] max-md:ml-0 max-md:w-full" :class="o.why ? 'text-rose-300/70' : 'opacity-50'">{{ o.why ?? orderInfo?.[order[o.n]!]?.redo }}</span>
                </button>
                <!-- 前の手の候補の残り -->
                <button v-for="o in rows[focusRow]!.restOpts" :key="o.key" type="button" class="mt-1 flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-[12px] transition" :class="rows[focusRow]!.step.target === o.key ? 'border-amber-400/80 bg-amber-500/15 shadow-[0_0_10px_rgba(251,191,36,0.2)]' : 'border-sky-400/40 bg-black/30 hover:border-amber-300/50 hover:bg-white/[0.04]'" title="前の手の候補のうち、付かなかった物を狙う (どれが残るかは回すまで分からない)" @click="pickTarget(focusRow, o.key)">
                  <span class="w-4 text-center text-sky-200">↳</span>
                  <span class="font-bold text-sky-100">{{ o.label }}</span>
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
              <p class="mb-1 text-[11px] opacity-60">{{ needs2(rows[focusRow]!) ? `${cardTitleOf(rows[focusRow]!.step.target!)} と一緒に狙う物を 1〜2 つ (押して入れ切り)。候補のどれか 2 つが付けば当たり` : rows[focusRow]!.set?.kind === "fracture" ? `${cardTitleOf(rows[focusRow]!.step.target!)} の代わりに固定されても当たりにする物 (0〜2 つ、押して入れ切り)。候補のどれか 1 つが固定されれば当たり (ほかの候補が固定されたら新しいベースから)` : `${cardTitleOf(rows[focusRow]!.step.target!)} の代わりに付いても当たりにする物 (0〜2 つ、押して入れ切り)。候補のどれか 1 つが付けば当たり` }}</p>
              <div class="flex max-w-3xl flex-col gap-1">
                <button v-for="o in rows[focusRow]!.target2Opts" :key="o.key" type="button" class="flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-[12px] transition disabled:cursor-not-allowed max-md:flex-wrap max-md:gap-x-2 max-md:gap-y-0.5" :class="candsOf(rows[focusRow]!).includes(o.key) ? 'border-amber-400/80 bg-amber-500/15 shadow-[0_0_10px_rgba(251,191,36,0.2)]' : o.why ? 'border-white/5 bg-black/20' : 'border-white/10 bg-black/30 hover:border-amber-300/50 hover:bg-white/[0.04]'" :disabled="!!o.why && !candsOf(rows[focusRow]!).includes(o.key)" @click="toggleCand(focusRow!, o.key)">
                  <span class="w-4 text-center font-bold" :class="o.why ? 'opacity-30' : 'text-amber-200'">{{ o.n + 1 }}</span>
                  <span class="w-9 text-[10px]" :class="o.why ? 'opacity-30' : 'opacity-60'">{{ orderInfo?.[order[o.n]!]?.side }}</span>
                  <span :class="o.why ? 'opacity-35' : orderInfo?.[order[o.n]!]?.tone">{{ orderInfo?.[order[o.n]!]?.text ?? o.label }}</span>
                  <span v-if="orderInfo?.[order[o.n]!]?.rank" class="rounded-sm bg-amber-500/25 px-1 text-[10px] font-bold text-amber-100" :class="o.why ? 'opacity-35' : ''">{{ orderInfo[order[o.n]!]!.rank }} 以上</span>
                  <span v-if="o.why" class="ml-auto text-[11px] text-rose-300/70 max-md:ml-0 max-md:w-full">{{ o.why }}</span>
                </button>
              </div>
            </template>
            <template v-else-if="partOf(focusRow, rows[focusRow]!) === 'lost'">
              <p class="mb-1 text-[11px] opacity-60">この手を打っている間に、付いている MOD が消えたら何手目からやり直すか (固定は消えないので出さない)</p>
              <p v-if="lostRisk(focusRow!, rows[focusRow]!)" class="mb-2 text-[12px] font-bold" :class="lostRisk(focusRow!, rows[focusRow]!)!.bad ? 'text-rose-300' : 'text-amber-200'">{{ lostRisk(focusRow!, rows[focusRow]!)!.text }}</p>
              <div class="flex flex-wrap items-start gap-4">
                <!-- 戻り先は上から 1 手目・2 手目…と縦に (手の名前つき)。MOD が複数なら縦の一覧を横に並べる (2026-10-07 オーナー「縦で上から下みたいな感じがいい」) -->
                <div v-for="id in presentMods(focusRow, rows[focusRow]!)" :key="id" class="w-72 max-md:w-full">
                  <p class="mb-1 truncate font-bold" :title="cardTitleOf(id)">{{ cardTitleOf(id) }} が消えたら</p>
                  <div class="flex flex-col gap-0.5">
                    <!-- 新しいベースで最初から (2026-10-07 靴で試すと、マジックの手で付けた物が消えた時の戻り先が無かった) -->
                    <button type="button" class="flex items-center gap-2 rounded-md border px-2 py-1 text-left" :class="gotoOf(focusRow, rows[focusRow]!, id) === LOST_RESTART ? 'border-amber-400 bg-amber-500/20 text-amber-100' : 'border-white/10 bg-black/20 hover:border-white/30'" @click="setGoto(focusRow!, id, LOST_RESTART)">
                      <b class="shrink-0 text-amber-200">最初から</b>
                      <span class="truncate text-[11px]">{{ props.start.mods ? "手打ちの状態を作り直す" : "新しいベース" }}</span>
                      <span v-if="gotoOf(focusRow, rows[focusRow]!, id) === LOST_RESTART" class="ml-auto shrink-0 text-[10px]">← ここから</span>
                    </button>
                    <button v-for="g in focusRow + 1" :key="g" type="button" class="flex items-center gap-2 rounded-md border px-2 py-1 text-left disabled:cursor-not-allowed disabled:opacity-30" :class="gotoOf(focusRow, rows[focusRow]!, id) === g - 1 ? 'border-amber-400 bg-amber-500/20 text-amber-100' : 'border-white/10 bg-black/20 hover:border-white/30'" :disabled="!!whyNoGoto(rows[g - 1]!, rows[focusRow]!)" :title="whyNoGoto(rows[g - 1]!, rows[focusRow]!)" @click="setGoto(focusRow!, id, g - 1)">
                      <b class="w-10 shrink-0 text-amber-200">{{ g }} 手目</b>
                      <span class="truncate text-[11px]">{{ cardTitle(rows[g - 1]!) }}</span>
                      <span v-if="gotoOf(focusRow, rows[focusRow]!, id) === g - 1" class="ml-auto shrink-0 text-[10px]">← ここから</span>
                    </button>
                  </div>
                </div>
              </div>
            </template>
            <template v-else-if="partOf(focusRow, rows[focusRow]!) === 'single'">
              <p class="mb-1 text-[11px] opacity-60">1 つだけ当たって、ハズレが消えた後に、残りの 1 つを打つ手 (既定は同じカレンシーで偉大だけ外した物)</p>
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
              <!-- もう一度打つ: 外れは残して同じ手を打ち直し、その側が満杯になった時だけ外れを消す (2026-10-07 靴のライフで、毎回消すより 2 割安かった) -->
              <div class="grid max-w-3xl grid-cols-4 max-md:grid-cols-1 gap-2">
                <button v-for="k in (rarityStep(rows[focusRow]!) ? (['annul_next', 'restart', 'none'] as const) : (['none', 'annul', 'chaos', 'restart'] as const))" :key="k" type="button" class="flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-35" :class="missKind(rows[focusRow]!) === k ? 'border-amber-400/80 bg-amber-500/15 shadow-[0_0_10px_rgba(251,191,36,0.2)]' : 'border-white/10 bg-black/30 hover:border-amber-300/50'" :disabled="!!missWhy(rows[focusRow]!, k)" :title="missWhy(rows[focusRow]!, k) ?? undefined" @click="pickMissKind(focusRow!, k)">
                  <img v-if="(k === 'annul' || k === 'chaos' || k === 'annul_next') && iconOf(k === 'annul_next' ? 'annul' : k)" :src="iconOf(k === 'annul_next' ? 'annul' : k)" alt="" class="h-8 w-8 object-contain" />
                  <span v-else class="grid h-8 w-8 place-items-center rounded border border-white/20 text-[14px] opacity-60">{{ k === "restart" ? "⟲" : "→" }}</span>
                  <span>
                    <b class="block text-[12px]">{{ k === "none" ? "そのまま次へ" : k === "annul_next" ? "狙いの側のハズレを消して次へ" : k === "restart" ? (props.start.mods ? "この状態からやり直す" : "新しいベースでもう一度") : k === "annul" ? "消去で消す" : "カオスで入れ替える" }}</b>
                    <span v-if="missWhy(rows[focusRow]!, k)" class="text-[10px] text-rose-300">{{ missWhy(rows[focusRow]!, k) }}</span>
                    <span v-else class="text-[10px] opacity-60">{{ k === "none" ? "ハズレは残す" : k === "annul_next" ? "反対の側に付いたら残して次へ" : k === "restart" ? (props.start.mods ? "手打ちの状態を作り直して 1 手目から" : "白を買い直して 1 手目から") : k === "annul" ? "1 つ消してもう一度" : "1 つ入れ替えてもう一度" }}</span>
                  </span>
                </button>
              </div>
              <!-- 選んだ札のお告げ・強さだけ。クラフトステージの棚と同じ札 (2026-10-07 オーナー「お告げちっさ、ステージのアイコンの表示でおｋ、どの段階も」) -->
              <div v-if="missKind(rows[focusRow]!) === 'chaos'" class="mt-3 flex gap-2 text-[11px] max-md:flex-col max-md:gap-0.5">
                <p class="w-24 shrink-0 pt-1 leading-tight opacity-60 max-md:w-full max-md:pt-0">強さ</p>
                <div class="flex flex-wrap gap-1">
                  <button v-for="g in (['chaos', 'chaos_greater', 'chaos_perfect'] as const)" :key="g" type="button" class="relative flex w-[66px] flex-col items-center rounded-lg border px-0.5 pb-0.5 pt-1 text-[10px] transition" :class="missSet(rows[focusRow]!.step)?.currency === g ? 'border-amber-400 bg-amber-500/15 ring-2 ring-amber-400/60' : 'border-white/10 bg-black/30 hover:border-white/30'" :title="nameOf(g)" @click="setMiss(focusRow!, 'chaos', g, missSet(rows[focusRow]!.step)?.omens ?? [])">
                    <img v-if="iconOf(g)" :src="iconOf(g)" alt="" class="h-7 w-7 object-contain" draggable="false" />
                    <span class="w-full truncate text-center leading-tight">{{ nameOf(g) }}</span>
                    <span v-if="priceOf(g)" class="text-[9px] tabular-nums opacity-60 max-md:text-[10px]">{{ displayCurrency.money(priceOf(g)) }}</span>
                    <span v-if="g !== 'chaos'" class="absolute right-0.5 top-0.5 rounded bg-black/60 px-1 text-[9px] text-sky-300">{{ g === "chaos_greater" ? "上級" : "完全" }}</span>
                  </button>
                </div>
              </div>
              <div v-if="missKind(rows[focusRow]!) === 'annul' || missKind(rows[focusRow]!) === 'chaos'" class="mt-2 flex gap-2 text-[11px] max-md:flex-col max-md:gap-0.5">
                <p class="w-24 shrink-0 pt-1 leading-tight opacity-60 max-md:w-full max-md:pt-0">お告げ<br class="max-md:hidden" /><span class="md:hidden"> </span>(1 つ選ぶ)</p>
                <div class="flex flex-wrap gap-1">
                  <button v-for="o in missOmenChoices(rows[focusRow]!)" :key="o.key || 'none'" type="button" class="relative flex w-[66px] flex-col items-center rounded-lg border px-0.5 pb-0.5 pt-1 text-[10px] transition" :class="[o.on ? (o.omens.length ? 'stage-omen-on border-orange-300' : 'border-amber-400 bg-amber-500/15 ring-2 ring-amber-400/60') : 'border-white/10 bg-black/30 hover:border-white/30', o.why ? 'cursor-not-allowed opacity-35' : '']" :disabled="!!o.why" :title="o.why ?? o.ja" @click="setMiss(focusRow!, missKind(rows[focusRow]!) as 'annul' | 'chaos', missSet(rows[focusRow]!.step)!.currency, o.omens)">
                    <span v-if="!o.omens.length" class="grid h-7 w-7 place-items-center rounded border border-dashed border-white/25 text-[12px] opacity-60">−</span>
                    <span v-else class="flex h-7 items-center">
                      <img v-for="om in o.omens" :key="om" :src="iconOf(om)" alt="" class="h-7 w-7 object-contain" draggable="false" />
                    </span>
                    <span class="w-full truncate text-center leading-tight">{{ o.ja }}</span>
                    <span v-if="o.why" class="w-full truncate text-center text-[9px] font-bold text-rose-300 max-md:text-[10px]" :title="o.why">{{ o.why }}</span>
                    <span v-else-if="o.omens.length && o.omens.reduce((a, om) => a + priceOf(om), 0)" class="text-[9px] tabular-nums opacity-60 max-md:text-[10px]">{{ displayCurrency.money(o.omens.reduce((a, om) => a + priceOf(om), 0)) }}</span>
                    <span v-if="o.on && o.omens.length" class="absolute left-0.5 top-0.5 rounded bg-orange-600/80 px-1 text-[9px] font-bold text-white">有効</span>
                  </button>
                </div>
              </div>
              <p class="mt-2 text-[11px]" :class="missRisk(focusRow!, rows[focusRow]!).bad ? 'text-rose-300' : 'text-emerald-200/80'">{{ missRisk(focusRow!, rows[focusRow]!).text }}</p>
              <p v-if="isRest(rows[focusRow]!.step.target)" class="mt-1 text-[11px] text-emerald-200/80">消去で候補が消えても、1 つでも残っていればこの手を続ける。全部消えたら {{ Number(rows[focusRow]!.step.target!.slice(REST.length)) + 1 }} 手目へ戻る</p>
              <!-- お告げ無しの消去は、どちらの側が消えたかで枝が分かれる (2026-10-07 オーナー「サフィだけ消えるともう 1 回消去、プレだけ消えたら消去は使わずにトライ」) -->
              <p v-if="preRule(rows[focusRow]!, true)" class="mt-3 text-[11px] opacity-80">{{ preRule(rows[focusRow]!, true) }}</p>
              <p v-if="chaosRegain(rows[focusRow]!)" class="mt-1 text-[11px] opacity-80">この手の狙いが後の手で消えて戻った時は、カオスでなく完全高貴 + 側のお告げで取り直す (カオスだと付いている他の狙いも消すため。外れは消去)</p>
              <template v-for="sp in [sideSplit(rows[focusRow]!)]" :key="'split' + focusRow">
                <!-- 枝は 1 行の要約が既定、細かく変える時だけ開く (2026-10-08 レビュー P2: 「消去で消す」の直下で「消さずに打つ」が光って矛盾に見えた) -->
                <p v-if="sp" class="mt-3 text-[11px] text-emerald-200/80">{{ splitSummary(rows[focusRow]!, sp) }} <button type="button" class="ml-2 rounded border border-white/15 px-1.5 text-[10px] opacity-70 hover:opacity-100" @click="splitOpen = !splitOpen">{{ splitOpen ? "閉じる ▲" : "変える ▼" }}</button></p>
                <div v-if="sp && splitOpen" class="mt-2 max-w-3xl space-y-1.5 rounded-lg border border-white/10 bg-black/20 p-2 text-[11px]">
                  <p class="text-[10px] opacity-50">消去を打つ前 (ハズレがどちらに付いたか)</p>
                  <div class="flex items-center gap-2 max-md:flex-wrap">
                    <span class="w-52 shrink-0 opacity-70 max-md:w-full">ハズレが{{ sp.o }}に付いた</span>
                    <button v-for="k in (['keep', 'annul'] as const)" :key="k" type="button" class="rounded border px-2 py-0.5" :class="otherJunkOf(rows[focusRow]!.set?.kind, rows[focusRow]!.step.otherJunk) === k ? 'border-amber-400 bg-amber-500/20 text-amber-100' : 'border-white/15 hover:border-white/40'" @click="patch(focusRow!, { otherJunk: k })">{{ k === "keep" ? `消さずにもう一度打つ (${sp.t}に付く)` : "消去" }}</button>
                  </div>
                  <p class="mt-1 text-[10px] opacity-50">消去を打った後 (どちらのハズレが消えたか)</p>
                  <div class="flex items-center gap-2 max-md:flex-wrap">
                    <span class="w-52 shrink-0 opacity-70 max-md:w-full">{{ sp.t }}のハズレが消えた ({{ sp.o }}のハズレが残った)</span>
                    <span class="rounded border border-emerald-400/40 px-2 py-0.5 text-emerald-100">もう一度打つ ({{ sp.t }}に付く)</span>
                  </div>
                  <div class="flex items-center gap-2 max-md:flex-wrap">
                    <span class="w-52 shrink-0 opacity-70 max-md:w-full">{{ sp.o }}のハズレが消えた ({{ sp.t }}のハズレが残った)</span>
                    <!-- 増強 (マジック) は狙いの側が埋まったまま打つと反対の側にしか付かないので、消去しか無い (2026-10-08 レビュー A7) -->
                    <span v-if="rows[focusRow]!.set?.kind === 'augment'" class="rounded border border-emerald-400/40 px-2 py-0.5 text-emerald-100">もう一度消去 (そのまま打つと{{ sp.o }}にしか付かない)</span>
                    <button v-else v-for="k in (['annul', 'redo'] as const)" :key="k" type="button" class="rounded border px-2 py-0.5" :class="otherGoneOf(rows[focusRow]!.set?.kind, rows[focusRow]!.step.otherGone) === k ? 'border-amber-400 bg-amber-500/20 text-amber-100' : 'border-white/15 hover:border-white/40'" @click="patch(focusRow!, { otherGone: k })">{{ k === "annul" ? "もう一度消去" : "もう一度打つ" }}</button>
                  </div>
                </div>
              </template>
              <!-- ほかの消し方 (パーフェクトエッセンスで上書き・骨で置き換え) -->
              <button v-if="!rarityStep(rows[focusRow]!) && removals.some((x) => (x.kind === 'essence_perfect' || x.kind === 'desecrate') && !whyMissAt(focusRow!)(x))" type="button" class="mt-3 rounded border border-white/15 px-2 py-0.5 text-[11px] opacity-70 hover:opacity-100 max-md:min-h-10" @click="missMore = !missMore">ほかの消し方 (パーフェクトエッセンス・骨) {{ missMore || missKind(rows[focusRow]!) === 'other' ? "▲" : "▼" }}</button>
              <div v-if="!rarityStep(rows[focusRow]!) && (missMore || missKind(rows[focusRow]!) === 'other')" class="mt-2">
                <StagePatternStepPicker :key="'miss' + focusRow" :sets="removals.filter((x) => x.kind === 'essence_perfect' || x.kind === 'desecrate')" :why="whyMissAt(focusRow)" :current="rows[focusRow]!.step.miss ?? ''" inline @pick="(k) => { patch(focusRow!, { miss: k, onMiss: 'annul_redo' }); editPart = 'miss'; }" />
              </div>
            </template>
            <template v-else>
              <template v-for="r in [rows[focusRow]!]" :key="'sum' + focusRow">
                <div class="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-2 text-[12px]">
                  <span class="text-[11px] opacity-50">{{ r.set?.kind === "rune" ? "差すルーン" : "付ける MOD" }}</span>
                  <button type="button" class="flex items-center gap-2 justify-self-start rounded px-1 text-left text-[14px] font-bold text-amber-50 enabled:hover:bg-white/5" :disabled="locked" @click="editPart = 'target'"><img v-if="r.set?.kind === 'rune' && cardIcon(r)" :src="cardIcon(r)!" alt="" class="h-9 w-9 object-contain" />{{ r.step.target === ANY_TARGET ? "何が付いてもいい (打つだけ)" : r.step.target ? (r.set?.kind === "rune" ? runeLabel(r.step.target) : isRest(r.step.target) ? cardTitle(r) : modLabel(r.step.target) + (isDouble(r.set) ? candsOf(r).map((x) => ` + ${modLabel(x)}`).join("") + (r.step.target3 ? " (どれか 2 つ)" : "") : "")) : "—" }}</button>
                  <template v-if="r.set?.kind !== 'rune'">
                    <span class="text-[11px] opacity-50">カレンシー</span>
                    <button type="button" class="flex flex-wrap items-center gap-2 justify-self-start rounded-lg px-1 py-0.5 enabled:hover:bg-white/5" :disabled="locked" @click="editPart = 'set'">
                      <img v-if="r.set?.currency && iconOf(r.set.currency)" :src="iconOf(r.set.currency)" alt="" class="h-9 w-9 object-contain drop-shadow" />
                      <span class="font-bold">{{ r.set ? setShort(r.set) : "—" }}</span>
                      <span v-for="o in r.set?.omens ?? []" :key="o" class="flex items-center gap-1 rounded-full border border-orange-300/40 bg-orange-500/10 py-0.5 pl-0.5 pr-2 text-orange-100"><img :src="iconOf(o)" alt="" class="h-5 w-5 object-contain" />{{ jaOfOmen(o) ?? o }}</span>
                    </button>
                  </template>
                  <template v-if="showMiss(r)">
                    <span class="text-[11px] text-rose-300/80">付かなかったら</span>
                    <button type="button" class="flex flex-wrap items-center gap-2 justify-self-start rounded-lg px-1 py-0.5 enabled:hover:bg-white/5" :disabled="locked || !hasMiss(r)" @click="editPart = 'miss'">
                      <template v-if="missSet(r.step)">
                        <img v-if="iconOf(missSet(r.step)!.currency)" :src="iconOf(missSet(r.step)!.currency)" alt="" class="h-7 w-7 object-contain" />
                        <span class="font-bold">{{ setShort(missSet(r.step)!) }}</span>
                        <span v-for="o in missSet(r.step)!.omens" :key="o" class="flex items-center gap-1 rounded-full border border-orange-300/40 bg-orange-500/10 py-0.5 pl-0.5 pr-2 text-orange-100"><img :src="iconOf(o)" alt="" class="h-5 w-5 object-contain" />{{ jaOfOmen(o) ?? o }}</span>
                        <span class="text-[11px] text-amber-200/80">↺ 付くまで繰り返す</span>
                      </template>
                      <span v-else class="opacity-60">{{ r.step.onMiss === "annul_next" ? "狙いの側のハズレを消して次へ" : r.step.onMiss === "redo" ? "もう一度打つ" : "そのまま次へ" }}</span>
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
          <!-- 「この手にする」が押せない理由は文で (ホバーだけだと押せない訳が分からず止まった。2026-10-08 オーナー「ここで固まるね進めない」) -->
          <p v-if="rows[focusRow]?.bad" class="mt-1 rounded bg-rose-500/10 px-2 py-1 text-[12px] font-bold text-rose-200">この手にできない: {{ rows[focusRow]!.bad }}</p>
          <!-- 下のボタン (いつも同じ所。スマホはシートの下に固定) -->
          <div class="mt-1.5 flex items-center gap-2 border-t border-white/10 pt-1.5 max-md:sticky max-md:bottom-0 max-md:z-10 max-md:flex-wrap max-md:bg-[#0e0c09] max-md:py-2">
            <button type="button" class="rounded-lg border border-rose-400/50 px-2 py-0.5 text-rose-200 hover:bg-rose-500/15 max-md:hidden" title="この手だけ消す (後の手はそのまま)" @click="removeAt(focusRow)">この手を消す</button>
            <span class="flex items-center gap-1">
              <button type="button" class="rounded border border-white/15 px-1 opacity-60 hover:opacity-100 disabled:opacity-20 max-md:min-h-11 max-md:min-w-11" :disabled="focusRow === 0" title="上へ" @click="move(focusRow, -1); focusRow = focusRow - 1">▲</button>
              <button type="button" class="rounded border border-white/15 px-1 opacity-60 hover:opacity-100 disabled:opacity-20 max-md:min-h-11 max-md:min-w-11" :disabled="focusRow === rows.length - 1" title="下へ" @click="move(focusRow, 1); focusRow = focusRow + 1">▼</button>
            </span>
            <button type="button" class="ml-auto rounded-lg border border-white/20 px-3 py-0.5 hover:bg-white/10 max-md:min-h-11" title="閉じる (決めた物はそのまま)" @click="closeSheet()">閉じる</button>
            <button v-if="['set', 'target', 'target2', 'miss', 'single', 'lost'].includes(partOf(focusRow, rows[focusRow]!))" type="button" class="rounded-lg border border-amber-400/60 bg-amber-500/20 px-3 py-0.5 font-bold text-amber-100 disabled:opacity-40 max-md:min-h-11 max-md:flex-1" :disabled="partOf(focusRow, rows[focusRow]!) === 'target' ? !rows[focusRow]!.step.target : partOf(focusRow, rows[focusRow]!) === 'target2' ? (needs2(rows[focusRow]!) && !rows[focusRow]!.step.target2) || (lastPart(focusRow, rows[focusRow]!) && !!rows[focusRow]!.bad) : !rows[focusRow]!.set || (lastPart(focusRow, rows[focusRow]!) && !!rows[focusRow]!.bad)" :title="partOf(focusRow, rows[focusRow]!) === 'target' ? '付ける物を選ぶ' : partOf(focusRow, rows[focusRow]!) === 'target2' && !rows[focusRow]!.step.target2 ? '2 つ目の MOD を選ぶ' : !rows[focusRow]!.set ? 'カレンシーを選ぶ' : rows[focusRow]!.bad ?? undefined" @click="nextPart(focusRow)">{{ lastPart(focusRow, rows[focusRow]!) ? "この手にする" : "次へ →" }}</button>
            <button v-else type="button" class="rounded-lg border border-amber-400/60 bg-amber-500/20 px-3 py-0.5 font-bold text-amber-100 disabled:opacity-40 max-md:min-h-11 max-md:flex-1" :disabled="!!rows[focusRow]!.bad" :title="rows[focusRow]!.bad ?? '決めて閉じる'" @click="confirmStep(focusRow)">この手にする</button>
            <!-- スマホ: 最後の段では「決めて次の手を足す」も (毎手 閉じる → ツリーの下まで送る → ＋ 手を足す の往復を省く。2026-10-08 レビュー 5。押すのは自分なので「手動」は守れる) -->
            <button v-if="phone && lastPart(focusRow, rows[focusRow]!) && !rows[focusRow]!.bad && rows[focusRow]!.set" type="button" class="w-full min-h-11 rounded-lg border border-dashed border-amber-400/50 font-bold text-amber-200" @click="confirmStep(focusRow); addStep()">この手にして、次の手を足す ＋</button>
          </div>
        </template>
        <!-- 決めた後 (読むだけ): 押した手 (無ければ最後の手) の要約 -->
        <template v-else-if="locked && rows.length">
          <div class="mb-2 border-b border-white/10 pb-2"><b class="text-[14px] text-amber-200">{{ previewAt + 1 }} 手目</b></div>
          <div class="min-h-0 flex-1 overflow-y-auto">
            <template v-for="r in [rows[previewAt]!]" :key="'sum' + previewAt">
                <div class="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-2 text-[12px]">
                  <span class="text-[11px] opacity-50">{{ r.set?.kind === "rune" ? "差すルーン" : "付ける MOD" }}</span>
                  <button type="button" class="flex items-center gap-2 justify-self-start rounded px-1 text-left text-[14px] font-bold text-amber-50 enabled:hover:bg-white/5" :disabled="locked" @click="editPart = 'target'"><img v-if="r.set?.kind === 'rune' && cardIcon(r)" :src="cardIcon(r)!" alt="" class="h-9 w-9 object-contain" />{{ r.step.target === ANY_TARGET ? "何が付いてもいい (打つだけ)" : r.step.target ? (r.set?.kind === "rune" ? runeLabel(r.step.target) : isRest(r.step.target) ? cardTitle(r) : modLabel(r.step.target) + (isDouble(r.set) ? candsOf(r).map((x) => ` + ${modLabel(x)}`).join("") + (r.step.target3 ? " (どれか 2 つ)" : "") : "")) : "—" }}</button>
                  <template v-if="r.set?.kind !== 'rune'">
                    <span class="text-[11px] opacity-50">カレンシー</span>
                    <button type="button" class="flex flex-wrap items-center gap-2 justify-self-start rounded-lg px-1 py-0.5 enabled:hover:bg-white/5" :disabled="locked" @click="editPart = 'set'">
                      <img v-if="r.set?.currency && iconOf(r.set.currency)" :src="iconOf(r.set.currency)" alt="" class="h-9 w-9 object-contain drop-shadow" />
                      <span class="font-bold">{{ r.set ? setShort(r.set) : "—" }}</span>
                      <span v-for="o in r.set?.omens ?? []" :key="o" class="flex items-center gap-1 rounded-full border border-orange-300/40 bg-orange-500/10 py-0.5 pl-0.5 pr-2 text-orange-100"><img :src="iconOf(o)" alt="" class="h-5 w-5 object-contain" />{{ jaOfOmen(o) ?? o }}</span>
                    </button>
                  </template>
                  <template v-if="showMiss(r)">
                    <span class="text-[11px] text-rose-300/80">付かなかったら</span>
                    <button type="button" class="flex flex-wrap items-center gap-2 justify-self-start rounded-lg px-1 py-0.5 enabled:hover:bg-white/5" :disabled="locked || !hasMiss(r)" @click="editPart = 'miss'">
                      <template v-if="missSet(r.step)">
                        <img v-if="iconOf(missSet(r.step)!.currency)" :src="iconOf(missSet(r.step)!.currency)" alt="" class="h-7 w-7 object-contain" />
                        <span class="font-bold">{{ setShort(missSet(r.step)!) }}</span>
                        <span v-for="o in missSet(r.step)!.omens" :key="o" class="flex items-center gap-1 rounded-full border border-orange-300/40 bg-orange-500/10 py-0.5 pl-0.5 pr-2 text-orange-100"><img :src="iconOf(o)" alt="" class="h-5 w-5 object-contain" />{{ jaOfOmen(o) ?? o }}</span>
                        <span class="text-[11px] text-amber-200/80">↺ 付くまで繰り返す</span>
                      </template>
                      <span v-else class="opacity-60">{{ r.step.onMiss === "annul_next" ? "狙いの側のハズレを消して次へ" : r.step.onMiss === "redo" ? "もう一度打つ" : "そのまま次へ" }}</span>
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
            <p class="opacity-50">{{ locked ? `${phone ? "上" : "左"}の手を押すと、その手まで当たった時のアイテムが${phone ? "下" : "右"}に出ます` : allPlaced && rows.length ? `付ける物は全部並べました。${phone ? "上" : "左"}の手を押すと選び直せます` : rows.length ? `${phone ? "上" : "左"}の手を押すと、ここで選び直せます` : "1 手目を足して始めます" }}</p>
            <button v-if="!locked" type="button" class="rounded-lg border border-amber-400/60 bg-amber-500/15 px-4 py-1 font-bold text-amber-100 hover:bg-amber-500/25 max-md:min-h-11" @click="addStep">＋ 手を足す</button>
          </div>
        </div>
      </div>

      <!-- その手まで当たった時のアイテム -->
      <!-- アイテムは枠に収まるまで縮める (スクロールさせない。2026-10-07 オーナー「レアアイテムの所はスクロールしたくない、画面に収まるように小さく」) -->
      <div v-if="preview" ref="cardBox" class="w-[280px] shrink-0 overflow-hidden max-md:order-2 max-md:w-full">
        <div ref="cardInner" class="max-md:mx-auto max-md:w-[280px]" :style="{ zoom: cardZoom }">
        <p class="mb-1 text-center opacity-70">{{ focusPre != null ? preNodes[focusPre]?.title : editingStep ? `${previewAt + 1} 手目を打つ前${rows[previewAt]?.step.target ? " (前の手で外れた時の例。オレンジ = この手で消える候補)" : ""}` : rows.length ? `${previewAt + 1} 手目まで当たった時` : "始め" }}</p>
        <StageItemCard :item="preview" :added="previewOut?.added ?? []" :removed="previewOut?.removed ?? []" :doomed="previewOut?.doomed ?? []" :holding="false" :flash-key="0" :width="280" compact />
        </div>
      </div>
      </div>
    </div>
  </div>
</template>
