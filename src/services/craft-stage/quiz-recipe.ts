/**
 * quiz-recipe.ts — クイズのレシピ (ADR-003、2026-10-12)。
 *
 * オーナー 2026-10-12「先に完成の 6 MOD を決めて、状況ごとに『この場合はこう』を答えるクイズ」「今もクイズっぽいじゃん」
 * 「プレ狙いでサフィ狙いも兼ねてるんだから (サフィに付いたら) サフィの工程へ」。
 *
 * レシピ = 工程 (道) の並び。工程ごとに完成の札 (goal) と答え (rules)。
 *   - 状況 = 完成の札から見た今のアイテムの形 (situationOf)。MOD の文や数値は入れない
 *   - 答え = 状況の項目の一部 (書かない項目は「何でも」) → 次の手。項目の多い答えが先に当たる
 *   - 工程は入口の札 (entry) が付いたら切り替わる。どの入口も付いていなければ 1 つ目の工程
 * 打ち方はエミュレーターと同じ applyCurrency。当たり所で弾かれた手 (random) は数えずにもう一度 (書いてある効果どおり)。
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import type { StageItem, StageMod, StageSide } from "./types";
import { applyCurrency } from "./apply-currency";
import { revealOffers } from "./apply-desecrate";
import { catalystOf, limitOf, listOf, maxQualityOf, SIDES, type Force } from "./stage-core";
import { freshItem, startFrom } from "./run-plan";
import { mulberry32 } from "../htc/rng";

export type SlotKind = "normal" | "desecrated" | "fractured" | "essence" | "crafted";
/** 完成の札 1 つ。mods のどれか 1 つ (段は minTierIndex 以上) で埋まる。mods が空ならその側のどの MOD でも */
export interface QuizSlot {
  id: string;
  side: StageSide;
  mods: Array<{ modId: string; minTierIndex: number }>;
  kind: SlotKind;
  /** 途中だけ付ける札 (侮蔑のような枠を増やす MOD)。完成には要らない */
  temp?: boolean;
}
/**
 * 状況の項目 (平らなキー → 値)。札は札の id → 0 無い / 1 段が低い / 2 付いている / 3 付いていて固定。
 * 側は "p." / "s." + junk (狙い以外、固定以外) / fx (狙い以外の固定) / bad (発現済みの冒涜で狙い以外) / hid (未発現) / free (空き。侮蔑などで増えた枠込み、超えたら負)。
 * n (側ごと "p.n" / "s.n" と合計 "n") = 付いている MOD の数 (未発現込み)。fx = 固定の MOD の数 (札の物も込み)。des = 冒涜の MOD の数 (未発現・札の物も込み)。
 * aug = はめたルーンの数。r = レアリティ (n / m / r / u)
 */
export type Situation = Record<string, string | number>;
/** 答えの条件: 項目 → 値 (配列はどれか)。書かない項目は何でも */
export type When = Record<string, string | number | Array<string | number>>;
export type QuizAction =
  /** カレンシー + お告げ (棚のキーそのまま) */
  | { use: string; omens?: string[] }
  /** 未発現の冒涜を発現: 3 つに埋まっていない札の MOD があれば取る。echoes = 無ければ反響で引き直し。それでも無ければ 1 つ目 */
  | { reveal: { echoes: boolean } }
  /** 次のベースを買って最初から */
  | { restart: true };
export interface QuizRule { when: When; do: QuizAction }
export interface QuizRoute {
  id: string;
  goal: QuizSlot[];
  /** この札のどれかが付いたらこの工程 (無ければ 1 つ目の工程の扱い) */
  entry?: string[];
  rules: QuizRule[];
}
export type QuizStart =
  /** 白を買う (sockets・runes = 規格外のソケットと始めから差すルーン) */
  | { kind: "white"; price: number; sockets?: number; runes?: string[] }
  /** 付いた状態を買う。fill = 側ごとに MOD の数まで残りを乱数で埋める (相場で買うベースの代わり) */
  | { kind: "bought"; mods: Force[]; fill?: Partial<Record<StageSide, number>>; price: number; rarity?: "magic" | "rare"; sockets?: number; runes?: string[] }
  /** エミュレーターの今のアイテムから */
  | { kind: "item"; item: StageItem; price: number };
export interface QuizRecipe {
  v: 3;
  name?: string;
  base: string;
  itemLevel: number;
  start: QuizStart;
  routes: QuizRoute[];
}

// ── 状況 ──────────────────────────────────────────────

const RARITY = { normal: "n", magic: "m", rare: "r", unique: "u" } as const;
const fits = (m: StageMod, s: QuizSlot): 0 | 1 | 2 | 3 => {
  // 候補が空の札 = その側のどの MOD でも (「残りのサフィは何でも」)
  if (!s.mods.length) return (m.desecrated && s.kind !== "desecrated") || (m.crafted && s.kind !== "crafted" && s.kind !== "essence") ? 0 : m.fractured ? 3 : 2;
  const c = s.mods.find((x) => m.modId === x.modId);
  if (!c) return 0;
  if (m.tierIndex < c.minTierIndex) return 1;
  return m.fractured ? 3 : 2;
};
const groupKey = (s: QuizSlot): string => `${s.side}|${s.kind}|${s.temp ? 1 : 0}|${s.mods.map((x) => `${x.modId}:${x.minTierIndex}`).sort().join(",")}`;

/** 札に MOD を当てる (1 MOD は 1 札まで、合計の状態が一番高い当て方)。返り値は札ごとの状態と当てた MOD */
export function assignSlots(item: StageItem, goal: readonly QuizSlot[]): { state: Record<string, number>; used: Set<StageMod> } {
  const state: Record<string, number> = {};
  let best = -1, bestPick: Array<StageMod | null> = [];
  const pick: Array<StageMod | null> = [];
  const taken = new Set<StageMod>();
  const go = (i: number, sum: number): void => {
    if (i === goal.length) { if (sum > best) { best = sum; bestPick = [...pick]; } return; }
    const s = goal[i]!;
    for (const m of listOf(item, s.side)) {
      if (taken.has(m) || m.unrevealed) continue;
      const f = fits(m, s);
      if (!f) continue;
      taken.add(m); pick.push(m);
      go(i + 1, sum + f);
      taken.delete(m); pick.pop();
    }
    pick.push(null); go(i + 1, sum); pick.pop();
  };
  go(0, 0);
  const used = new Set<StageMod>();
  goal.forEach((s, i) => { const m = bestPick[i]; state[s.id] = m ? fits(m, s) : 0; if (m) used.add(m); });
  // 中身が同じ札は区別しない (A に付いて B に無い = B に付いて A に無い)。並びの早い札から高い状態に
  const groups = new Map<string, QuizSlot[]>();
  for (const s of goal) groups.set(groupKey(s), [...(groups.get(groupKey(s)) ?? []), s]);
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const vals = g.map((s) => state[s.id]!).sort((a, b) => b - a);
    g.forEach((s, i) => { state[s.id] = vals[i]!; });
  }
  return { state, used };
}

/** 今のアイテムで働いている工程 (入口の札が付いた工程。無ければ 1 つ目) */
export function routeOf(recipe: QuizRecipe, item: StageItem): QuizRoute {
  for (const r of recipe.routes) {
    if (!r.entry?.length) continue;
    const { state } = assignSlots(item, r.goal);
    if (r.entry.some((id) => (state[id] ?? 0) >= 2)) return r;
  }
  return recipe.routes[0]!;
}

export function situationOf(item: StageItem, goal: readonly QuizSlot[]): Situation {
  const { state, used } = assignSlots(item, goal);
  const sit: Situation = { r: RARITY[item.rarity] };
  for (const s of goal) sit[s.id] = state[s.id]!;
  for (const side of SIDES) {
    const k = side === "prefix" ? "p." : "s.";
    const ms = listOf(item, side);
    let junk = 0, fx = 0, bad = 0, hid = 0;
    for (const m of ms) {
      if (used.has(m)) continue;
      if (m.unrevealed) hid++;
      else if (m.fractured) fx++;
      else { junk++; if (m.desecrated) bad++; }
    }
    sit[k + "junk"] = junk; sit[k + "fx"] = fx; sit[k + "bad"] = bad; sit[k + "hid"] = hid;
    sit[k + "free"] = item.rarity === "normal" ? 0 : limitOf(item, side) - ms.length;
    sit[k + "n"] = ms.length;
  }
  sit.n = item.prefixes.length + item.suffixes.length;
  sit.aug = item.augments?.length ?? 0;
  sit.fx = [...item.prefixes, ...item.suffixes].filter((m) => m.fractured).length;
  // 冒涜の MOD の数 (未発現込み、札の物も込み)。冒涜はアイテムに 1 つまでなので、札に普通の MOD が冒涜で付いた時に骨が打てない (2026-10-16 指輪のチュートリアル)
  sit.des = [...item.prefixes, ...item.suffixes].filter((m) => m.desecrated || m.unrevealed).length;
  // 触媒の品質が上限まで溜まっていればその種類 (fire・cold …)、溜まっていなければ "-" (2026-10-16 指輪のチュートリアル: 触媒の高貴を打つ前に品質を溜める)
  const c = catalystOf(item);
  sit.cat = c.tag && c.pct >= maxQualityOf(item) ? c.tag : "-";
  return sit;
}
export const situationKey = (s: Situation): string => Object.keys(s).sort().map((k) => `${k}=${s[k]}`).join(";");

/** 状況に当たる答え (書いた項目が全部同じ物のうち、項目が一番多い物。同じ数なら先に書いた物) */
/**
 * 答えの一覧ごとに 1 回だけ、細かい (条件の多い) 順に並べた写しを作って使い回す (同じ数なら並びの先の物)。
 * 前は 1 手ごとに全部の答えの Object.keys を取り直していて、回す時間の 6 割がここだった (2026-10-19 性能の記録: 500 人で 22 秒中 15 秒)。
 * 一覧が差し替わる (答えを足す・消す) と別の配列になるので作り直す。同じ配列のまま長さが変わった時も作り直す
 */
type CompiledRule = { r: QuizRule; ks: string[]; vs: Array<When[string]> };
const compiledRules = new WeakMap<readonly QuizRule[], { n: number; list: CompiledRule[] }>();
function compileRules(rules: readonly QuizRule[]): CompiledRule[] {
  const hit = compiledRules.get(rules);
  if (hit && hit.n === rules.length) return hit.list;
  const list = rules.map((r) => { const ks = Object.keys(r.when); return { r, ks, vs: ks.map((k) => r.when[k]!) }; });
  list.sort((a, b) => b.ks.length - a.ks.length); // 安定な並べ替え: 同じ数なら元の並び
  compiledRules.set(rules, { n: rules.length, list });
  return list;
}
export function ruleFor(rules: readonly QuizRule[], sit: Situation): QuizRule | null {
  for (const x of compileRules(rules)) {
    let ok = true;
    for (let i = 0; i < x.ks.length; i++) {
      const w = x.vs[i]!, v = sit[x.ks[i]!]!;
      if (Array.isArray(w) ? !w.includes(v) : v !== w) { ok = false; break; }
    }
    if (ok) return x.r;
  }
  return null;
}

/** 完成: 工程の札 (途中だけの札以外) が全部付いた。固定の札は固定で */
export function routeDone(route: QuizRoute, sit: Situation): boolean {
  return route.goal.every((s) => s.temp || (sit[s.id] as number) >= (s.kind === "fractured" ? 3 : 2));
}

// ── 回す ──────────────────────────────────────────────

export interface QuizRun {
  done: boolean;
  cost: number;
  /** 打った物の数 (カレンシー・お告げのキー → 数) */
  uses: Record<string, number>;
  bases: number;
  steps: number;
  /** 終わった工程の id */
  route: string;
  item: StageItem;
  /** 止まった理由: unanswered = 答えの無い状況、blocked = 当たり所に関係なく打てない手、cap = 手の上限 */
  stop?: { kind: "unanswered" | "blocked" | "cap"; route: string; situation: Situation; item: StageItem; reason?: string };
  log: string[];
}
export interface QuizOpts { price: (key: string) => number; maxSteps?: number; log?: boolean }

function buildStart(data: PatchData, recipe: QuizRecipe, rng: () => number): StageItem {
  const st = recipe.start;
  if (st.kind === "item") return st.item;
  if (st.kind === "white") return st.sockets != null || st.runes?.length ? startFrom(data, recipe.base, recipe.itemLevel, { ...(st.sockets != null ? { sockets: st.sockets } : {}), runes: st.runes ?? [] }, Math.floor(rng() * 2 ** 31)) : freshItem(data, recipe.base, recipe.itemLevel);
  const seed = Math.floor(rng() * 2 ** 31);
  let it = startFrom(data, recipe.base, recipe.itemLevel, { mods: st.mods, ...(st.rarity ? { rarity: st.rarity } : st.fill ? { rarity: "rare" as const } : {}), ...(st.sockets ? { sockets: st.sockets } : {}), ...(st.runes?.length ? { runes: st.runes } : {}) }, seed);
  // 残りを乱数で埋める (側のお告げ付きの高貴。相場で買えるベースの代わり)
  for (const side of SIDES) {
    const want = st.fill?.[side] ?? 0;
    const omen = side === "prefix" ? "OmenofSinistralExaltation" : "OmenofDextralExaltation";
    for (let k = 0; listOf(it, side).length < want && k < 20; k++) it = applyCurrency(data, it, "exalt", rng, [omen]).item;
  }
  return it;
}

/** 発現の候補が、まだ埋まっていない札に当たるか (チュートリアルの「どれを選ぶ?」の正解にも使う) */
export function revealWanted(item: StageItem, goal: readonly QuizSlot[]): (m: StageMod) => boolean {
  const { state } = assignSlots(item, goal);
  const open = goal.filter((s) => (state[s.id] ?? 0) < 2);
  return (m) => open.some((s) => s.side === m.side && fits(m, s) >= 2);
}
/** 発現の番号: 3 つ (と反響の 3 つ) から、埋まっていない札の MOD を取る */
function revealKey(data: PatchData, item: StageItem, goal: readonly QuizSlot[], echoes: boolean, seed: number): string {
  const offers = revealOffers(data, item, mulberry32(seed));
  const ok = revealWanted(item, goal);
  const i1 = offers.first.findIndex(ok);
  if (i1 >= 0) return `reveal:${i1 + 1}`;
  if (!echoes) return "reveal:1";
  const i2 = offers.reroll.findIndex(ok);
  return i2 >= 0 ? `reveal:${i2 + 1}:reroll` : "reveal:1:reroll";
}

/** 1 手の結果: restart = 買い直す、blocked = 当たり所に関係なく打てない、random = 当たり所で弾かれた (減らずにもう一度)、それ以外は打った */
export type QuizStepOut =
  | { kind: "restart" }
  | { kind: "blocked"; reason?: string }
  | { kind: "random" }
  | { kind: "used"; key: string; omens: string[]; spent: string[]; item: StageItem; added: StageMod[]; removed: StageMod[] };

/**
 * 答え 1 つを今のアイテムに打つ (runQuizOnce とチュートリアルで同じ打ち方)。g は回し全体の乱数 (発現の番号を決める種もここから引く)
 */
export function applyQuizAction(data: PatchData, route: QuizRoute, it: StageItem, a: QuizAction, g: () => number): QuizStepOut {
  if ("restart" in a) return { kind: "restart" };
  let key: string, omens: string[];
  const rs = Math.floor(g() * 2 ** 31);
  if ("reveal" in a) {
    key = revealKey(data, it, route.goal, a.reveal.echoes, rs);
    omens = a.reveal.echoes ? ["OmenofAbyssalEchoes"] : [];
  } else { key = a.use; omens = a.omens ?? []; }
  const x = applyCurrency(data, it, key, "reveal" in a ? mulberry32(rs) : g, omens);
  if (!x.applied) return x.random ? { kind: "random" } : { kind: "blocked", reason: x.reason };
  // 数えるのは打った物とお告げ (発現は数えない)
  const spent = [...(key.startsWith("reveal") ? [] : [key]), ...(x.omensUsed ?? omens)];
  return { kind: "used", key, omens, spent, item: x.item, added: x.added, removed: x.removed };
}

export function runQuizOnce(data: PatchData, recipe: QuizRecipe, seed: number, o: QuizOpts): QuizRun {
  const g = mulberry32(seed);
  const cap = o.maxSteps ?? 20000;
  const r: QuizRun = { done: false, cost: 0, uses: {}, bases: 0, steps: 0, route: recipe.routes[0]!.id, item: null as unknown as StageItem, log: [] };
  const count = (k: string): void => { r.uses[k] = (r.uses[k] ?? 0) + 1; r.cost += o.price(k); };
  const buy = (): StageItem => { r.bases++; r.cost += recipe.start.price; return buildStart(data, recipe, g); };
  let it = buy();
  for (; r.steps < cap; r.steps++) {
    const route = routeOf(recipe, it);
    r.route = route.id;
    const sit = situationOf(it, route.goal);
    if (routeDone(route, sit)) { r.done = true; break; }
    const rule = ruleFor(route.rules, sit);
    if (!rule) { r.stop = { kind: "unanswered", route: route.id, situation: sit, item: it }; break; }
    const x = applyQuizAction(data, route, it, rule.do, g);
    if (x.kind === "restart") { if (o.log) r.log.push("restart"); it = buy(); continue; }
    if (x.kind === "random") continue; // 当たり所で弾かれた: 減らずにもう一度
    if (x.kind === "blocked") { r.stop = { kind: "blocked", route: route.id, situation: sit, item: it, reason: x.reason }; break; }
    for (const k of x.spent) count(k);
    if (o.log) r.log.push(`${x.key}${x.omens.length ? ` [${x.omens.join(",")}]` : ""}: -${x.removed.map((m) => m.textEn).join(" / ")} +${x.added.map((m) => m.textEn).join(" / ")}`);
    it = x.item;
  }
  if (!r.done && !r.stop) r.stop = { kind: "cap", route: r.route, situation: situationOf(it, routeOf(recipe, it).goal), item: it };
  r.item = it;
  return r;
}

/** 始めのアイテムを買う (チュートリアルの「買い直す」も同じ) */
export const buyStart = (data: PatchData, recipe: QuizRecipe, g: () => number): StageItem => buildStart(data, recipe, g);

export interface QuizResult {
  runs: number;
  pDone: number;
  /** 1 個できるまでの平均 (全部の費用 ÷ 完成した数) */
  perDone: number;
  /** 完成した回の費用の 50 / 80 / 90% (運の幅) */
  p50: number; p80: number; p90: number;
  usage: Array<{ key: string; count: number; cost: number }>;
  bases: number;
  /** 完成した工程の割合 */
  routes: Array<{ id: string; p: number }>;
  /** 答えの無い状況 (来た数の多い順)。クイズの次の問題 */
  open: Array<{ route: string; key: string; situation: Situation; item: StageItem; n: number }>;
  /** 打てない手で止まった状況 */
  blocked: Array<{ route: string; key: string; situation: Situation; item: StageItem; reason: string; n: number }>;
  capped: number;
}

export function summarizeQuiz(runs: readonly QuizRun[], price: (key: string) => number): QuizResult {
  const done = runs.filter((r) => r.done);
  const costs = done.map((r) => r.cost).sort((a, b) => a - b);
  const q = (p: number): number => (costs.length ? costs[Math.min(costs.length - 1, Math.floor(costs.length * p))]! : 0);
  const per = done.length || 1;
  const use = new Map<string, number>();
  for (const r of runs) for (const [k, v] of Object.entries(r.uses)) use.set(k, (use.get(k) ?? 0) + v);
  const open = new Map<string, QuizResult["open"][number]>(), blocked = new Map<string, QuizResult["blocked"][number]>();
  const routes = new Map<string, number>();
  for (const r of runs) {
    if (r.done) routes.set(r.route, (routes.get(r.route) ?? 0) + 1);
    const s = r.stop;
    if (!s || s.kind === "cap") continue;
    const key = s.route + "|" + situationKey(s.situation);
    if (s.kind === "unanswered") { const c = open.get(key); if (c) c.n++; else open.set(key, { route: s.route, key, situation: s.situation, item: s.item, n: 1 }); }
    else { const c = blocked.get(key); if (c) c.n++; else blocked.set(key, { route: s.route, key, situation: s.situation, item: s.item, reason: s.reason ?? "", n: 1 }); }
  }
  return {
    runs: runs.length,
    pDone: done.length / (runs.length || 1),
    perDone: done.length ? runs.reduce((a, r) => a + r.cost, 0) / done.length : Infinity,
    p50: q(0.5), p80: q(0.8), p90: q(0.9),
    usage: [...use].map(([key, n]) => ({ key, count: n / per, cost: (n * price(key)) / per })).sort((a, b) => b.cost - a.cost),
    bases: runs.reduce((a, r) => a + r.bases, 0) / per,
    routes: [...routes].map(([id, n]) => ({ id, p: n / (done.length || 1) })),
    open: [...open.values()].sort((a, b) => b.n - a.n),
    blocked: [...blocked.values()].sort((a, b) => b.n - a.n),
    capped: runs.filter((r) => r.stop?.kind === "cap").length,
  };
}

export function runQuiz(data: PatchData, recipe: QuizRecipe, n: number, o: QuizOpts & { seed?: number }): QuizResult {
  const runs: QuizRun[] = [];
  const s0 = o.seed ?? 1;
  for (let i = 0; i < n; i++) runs.push(runQuizOnce(data, recipe, s0 + i * 7919, o));
  return summarizeQuiz(runs, o.price);
}

/** エミュレーターの「レシピで 1 手」: 今のアイテムで次に打つ手 (完成・答えなしは null と理由) */
export function nextMove(data: PatchData, recipe: QuizRecipe, item: StageItem, seed: number): { route: QuizRoute; rule: QuizRule | null; key: string | null; omens: string[]; done: boolean } {
  const route = routeOf(recipe, item);
  const sit = situationOf(item, route.goal);
  if (routeDone(route, sit)) return { route, rule: null, key: null, omens: [], done: true };
  const rule = ruleFor(route.rules, sit);
  if (!rule) return { route, rule: null, key: null, omens: [], done: false };
  const a = rule.do;
  if ("restart" in a) return { route, rule, key: "restart", omens: [], done: false };
  if ("reveal" in a) return { route, rule, key: revealKey(data, item, route.goal, a.reveal.echoes, seed), omens: a.reveal.echoes ? ["OmenofAbyssalEchoes"] : [], done: false };
  return { route, rule, key: a.use, omens: a.omens ?? [], done: false };
}
