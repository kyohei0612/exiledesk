/**
 * sim-route.ts — 作り方のツリーを回すシミュレーター (Craft of Exile の Simulator と同じ形、2026-09-24)
 *
 * オーナー:「次の奴はツリー上がいいかも、シミュレーター方式。完成までの道のりを○×で進める。進むにつれてツリーがデカくなる。
 * 最終的に予算入力してシミュレーターかけて、確率と予算内にできるか表示する」
 * 「消す方法もデフォルトで入れるんじゃなくて考えてやらせる方式で。最初から入力はしない。その状態で使えるカレンシーのみ表示」。
 *
 * ## 形 (CoE と同じ)
 * 手 (ノード) = 打つ物 + ○の条件 + 「○ なら次」「× なら次」(別の手 / 完成 / 未設定)。
 * ○の条件: 狙う MOD のうち N 個ある (既定 1 = どれか、空なら問わない) かつ 残したい MOD が全部ある かつ (選べば) 外れが無い
 * かつ (選べば) 外せる MOD が N 個以下。打たずに条件だけ見る「確認」の手もある。
 * 既定のループは入れない。× で消去してやり直す、スパムの狙いが消えたら最初から、は人が手を足して組む。
 *
 * 重みは [[step-odds.ts]] と同じ (段の下限・完全 50 / 上級 35 の足切り・カタリストの倍率・付いている系統を除く)。
 * 狙いの MOD でも段が足りなければ外れ。
 */
import type { Mod } from "../../vendor/poe2htc/engine/types";
import { catalysingMultiplier, catalystCountFor, catalystPriceKey } from "./catalysing";
import { catalystsFor } from "./quality";
import { mulberry32 } from "./spam-total";
import type { Side, StepCtx } from "./step-odds";

export type SimAction =
  | { kind: "chaos"; tier: "chaos" | "chaos_greater" | "chaos_perfect" }
  | { kind: "exalt"; tier: "exalt" | "exalt_greater" | "exalt_perfect"; side: Side | null; catalyst: string | null }
  | { kind: "annul"; side: Side | null }
  | { kind: "essence"; modId: string }
  | { kind: "desecrate"; side: Side; bone: "desecrate" | "desecrate_ancient"; echoes: boolean }
  | { kind: "light" }
  | { kind: "breach" }
  | { kind: "whittle" }
  /** 打たずに○の条件だけ見る (CoE の確認だけの手。「キャスピがある? → 高貴へ / 無ければカオスへ」) */
  | { kind: "check" }
  /**
   * カタリストだけ入れて品質を上限まで上げる (オーナー 2026-09-24:「品質だけ上げる時もあるから、カタリストのみ付ける手の
   * ターンもある。○のとこやけど、×は入力しないから無視で進む」)。確定の手
   */
  | { kind: "quality"; catalyst: string };

/**
 * ○×の行き先: 手の id / 完成 / 自動 / 未設定 (そこで止まる)。
 *
 * **自動** (オーナー 2026-09-24:「キャスピ消えたら手 1 に戻るし、触媒の高貴のお告げの成功品が消えても失敗が残るから失敗品が消えるまで消去だし、
 * 失敗品消えたらもう一度っていう処理は自動でやりたい」):
 *   1. 本線 (手 1 から○をたどった手の並び) を上から見て、揃っていない一番上の手を探す
 *   2. それがカオスの手なら、外せる物が 1 つになるまで今の消去を続けてから、そこへ (スパムの狙いが消えたら剥がして最初から)
 *   3. それ以外で外れが残っていれば、今の手をもう 1 回 (消去を続ける)
 *   4. 外れが無ければ、その揃っていない手へ (失敗品が消えたら同じ触媒の高貴のお告げをもう 1 回、成功品が消えていたらその手から)
 *   5. 全部揃っていれば完成 (本線の最後が「完成」の時)
 * 揃っている = 狙いのどれかがある かつ 残したい MOD が全部ある (外れ無し・個数の条件は見ない)
 *
 * たどる時の決まり (人が自然にやる事):
 *   - 本線の狙いのある手で、もう揃っていれば飛ばして○の行き先へ (カオスで付け直した時、前の成功品が残っていれば次の手へ)。
 *     狙いの無い手 (品質だけ・削減・確認) は飛ばさない
 *   - 打てない (枠が無い等) けれど外れがあれば、先に × の行き先 (消去の手) へ回す (費用は掛からない)
 */
export type Goto = string | "done" | "auto" | null;

export interface SimNode {
  id: string;
  /** 打つ物。未設定なら null (そこで止まる。最初から何も入れない、オーナー) */
  action: SimAction | null;
  /** 狙う MOD。このうち `need` 個あれば○ (空なら問わない) */
  targets: Array<{ modId: string; minTier: number }>;
  /**
   * 狙う MOD のうち何個あれば○か (既定 1 = どれか)。「知性か全耐性」の手の次に「2 つとも」の手を置くため
   * (1 つ付いた時点で次の手まで○にならないように。2026-09-24)
   */
  need?: number;
  /** 残したい MOD (全部あること)。その手に来るまでに揃えた物を入れておく */
  keep: string[];
  /** 外れが無いことも○の条件にする */
  clean: boolean;
  /** 外せる MOD (固定済み以外) がこの数以下であることも○の条件にする (「1 つになるまで剥がしてカオスへ」)。無ければ問わない */
  maxMods?: number | null;
  /**
   * ブリーチの MOD がある時だけ打つ (無ければ飛ばして○の行き先へ)。削減でブリーチの MOD を消す手用: 無いのに打つと、
   * 一番レベルの低い狙いの MOD を消してしまう (2026-09-24 自動で組んだツリー)
   */
  onlyWithBreach?: boolean;
  onHit: Goto;
  onMiss: Goto;
}

/** シミュレーターの中の指輪 */
export interface SimSlot {
  /** 狙い / 残したい MOD として数える物だけ modId (段も満たす)。それ以外は null (外れ) */
  modId: string | null;
  side: Side;
  fixed: boolean;
  /** 冒涜でまだ当たっていない (光で消せる) 外れ */
  desecrated?: boolean;
  /**
   * 固定されていないが、消えたら終わりの MOD (付け直せない樹 MOD など)。カオス・消去では普通に消えうるが、外れには数えない。
   * 消えたらその回は止める (2026-09-24: 固定不要の始め方で、樹 MOD の側に触らない作り方になっているかを確かめる)
   */
  keep?: boolean;
  label?: string;
}
export interface SimState {
  slots: SimSlot[];
  breach: boolean;
  /**
   * 今の品質 (%) と種類 (カタリストのタグ)。品質の手を打つと入る。**ブリーチの MOD が消えても下がらない**
   * (オーナー 2026-09-24:「一度 40% に上げた後、品質 MOD 消してもそのままだからね」)。
   * 未設定 (品質の手を打っていない) の間は、前の数え方 (上限の品質があるとみなし、触媒の高貴のお告げのたびにカタリスト代) のまま
   */
  quality?: number;
  qualityTag?: string | null;
}

export interface SimResult {
  runs: number;
  /** 「完成」まで行けた割合 */
  pDone: number;
  /** 完成して予算内だった割合 */
  pBudget: number | null;
  expected: number;
  p50: number;
  p80: number;
  p90: number;
  /** 手ごとの 1 回あたりの平均の打つ回数と費用 */
  perNode: Array<{ id: string; tries: number; cost: number }>;
  /** 止まった理由 (未設定の行き先に来た / 打てない) と、その割合 */
  stops: Array<{ reason: string; p: number }>;
  /** 完成した回の費用 (まとめる用) */
  doneCosts: number[];
}

const FLOOR: Record<string, number> = { chaos: 0, chaos_greater: 35, chaos_perfect: 50, exalt: 0, exalt_greater: 35, exalt_perfect: 50 };
const OMEN_EX: Record<Side, string> = { prefix: "OmenofSinistralExaltation", suffix: "OmenofDextralExaltation" };
const OMEN_ER: Record<Side, string> = { prefix: "OmenofSinistralErasure", suffix: "OmenofDextralErasure" };
const OMEN_CR: Record<Side, string> = { prefix: "OmenofSinistralCrystallisation", suffix: "OmenofDextralCrystallisation" };
const OMEN_NE: Record<Side, string> = { prefix: "OmenofSinistralNecromancy", suffix: "OmenofDextralNecromancy" };
const SIDES: Side[] = ["prefix", "suffix"];

/**
 * 確定の手 (必ず付く・必ず消える)。× の行き先が未設定でも止めずに○の行き先へ進む
 * (オーナー 2026-09-24:「一応確定やから、そこの手でバツはデフォで入力しなかったら無視するように」)
 */
export const CERTAIN: ReadonlySet<SimAction["kind"]> = new Set(["essence", "breach", "light", "quality"]);

/** ctx.baseQuality = ベースの品質の上限 (普通 20、ブリーチの指輪 40、洗練されたブリーチリング 45) */
export function simHelpers(ctx: StepCtx & { baseQuality?: number }, nodes: readonly SimNode[]) {
  const { data, cls, prices, itemLevel } = ctx;
  const cur = (k: string): number => prices.currency[k] ?? prices.omens[k] ?? Infinity;
  const mod = (id: string): Mod | undefined => data.mods.get(id);
  const sw = (m: Mod, minIdx: number, floor: number): number =>
    m.tiers.reduce((a, t, i) => a + (i >= minIdx && t.ilvl <= itemLevel && t.ilvl >= floor ? t.weight : 0), 0);
  const count = (s: SimState, side: Side): number => s.slots.filter((x) => x.side === side).length + (side === "prefix" && s.breach ? 1 : 0);
  const room = (s: SimState, side: Side): boolean => count(s, side) < ctx.limits[side];
  const families = (s: SimState): Set<string> => new Set(s.slots.flatMap((x) => (x.modId ? [mod(x.modId)?.family ?? ""] : [])));
  /** ツリー全体で「数える」MOD と段の下限 (狙い・残したいに出てくる物) */
  const minTierOf = new Map<string, number>();
  for (const n of nodes) {
    for (const t of n.targets) minTierOf.set(t.modId, Math.min(minTierOf.get(t.modId) ?? Infinity, t.minTier));
    if (n.action?.kind === "essence") minTierOf.set(n.action.modId, 0);
  }
  const removable = (s: SimState, side: Side | null): number[] =>
    [...s.slots.map((x, i) => (!x.fixed && (!side || x.side === side) ? i : -2)).filter((i) => i >= 0), ...(s.breach && side !== "suffix" ? [-1] : [])];
  const removeAt = (s: SimState, r: number): SimState => (r === -1 ? { ...s, breach: false } : { ...s, slots: s.slots.filter((_, i) => i !== r) });
  const has = (s: SimState, id: string): boolean => s.slots.some((x) => x.modId === id);
  /**
   * ブリーチの MOD を残す手が無ければ、ブリーチの MOD も外れと同じ (品質を上げる道具。上げた後は消えても品質は残る。
   * オーナー 2026-09-24:「品質 20% を必須 MOD として最後まで残しておくなんてことはない」)
   */
  const breachKept = nodes.some((n) => n.keep.includes("__breach__"));
  /**
   * ブリーチの MOD の役目が済んだか: 最後の品質の手の種類で、ブリーチ込みの上限まで入っている (品質は消えても残るので、
   * あとは外れと同じ。2026-09-24 自動で組んだツリーで、ブリーチの手を常に「残す」にした代わり)
   */
  const lastQualityTag = [...nodes].reverse().map((n) => n.action).find((a) => a?.kind === "quality");
  const breachSpent = (s: SimState): boolean =>
    lastQualityTag?.kind === "quality" && s.quality != null && s.qualityTag === lastQualityTag.catalyst && s.quality >= (ctx.baseQuality ?? 20) + 20;
  const hasJunk = (s: SimState): boolean =>
    s.slots.some((x) => !x.fixed && !x.keep && !x.modId) || (s.breach && (!breachKept || breachSpent(s)));

  /** 狙う MOD のうち need 個あるか */
  const targetsMet = (s: SimState, n: SimNode): boolean =>
    !n.targets.length || n.targets.filter((t) => has(s, t.modId)).length >= Math.min(n.need ?? 1, n.targets.length);
  /** ○の条件 */
  const passes = (s: SimState, n: SimNode): boolean =>
    targetsMet(s, n) && n.keep.every((id) => id === "__breach__" ? s.breach : has(s, id))
    && (!n.clean || !hasJunk(s)) && (n.maxMods == null || s.slots.filter((x) => !x.fixed && !x.keep).length + (s.breach ? 1 : 0) <= n.maxMods);

  const memo = new Map<string, Array<{ modId: string | null; side: Side; p: number }>>();
  /** 1 回で付く物の分布 (数える MOD = modId、それ以外 = 外れ) */
  function roll(s: SimState, sides: Side[], floor: number, tag: string | null, q: number): Array<{ modId: string | null; side: Side; p: number }> {
    const occ = families(s);
    const key = `${sides.join()}|${floor}|${tag}|${q}|${[...occ].sort().join()}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const mult = tag ? catalysingMultiplier(q) : 1;
    const out: Array<{ modId: string | null; side: Side; w: number }> = [];
    for (const side of sides) {
      for (const id of cls.pools.normal[side === "prefix" ? "prefixes" : "suffixes"]) {
        const m = mod(id);
        if (!m || occ.has(m.family)) continue;
        const k = tag && catalystsFor(m).some((c) => c.tag === tag) ? mult : 1;
        const all = sw(m, 0, floor) * k;
        const min = minTierOf.get(id);
        const good = min != null ? sw(m, min, floor) * k : 0;
        if (good > 0) out.push({ modId: id, side, w: good });
        if (all - good > 0) out.push({ modId: null, side, w: all - good });
      }
    }
    const W = out.reduce((a, x) => a + x.w, 0);
    const dist = W > 0 ? out.map((x) => ({ modId: x.modId, side: x.side, p: x.w / W })) : [];
    memo.set(key, dist);
    return dist;
  }
  /**
   * 品質の上限 = ベースの上限 + ブリーチの MOD が居れば 20。カタリストはこの上限まで入れ、触媒の高貴のお告げで使い切る
   * たびに入れ直す (オーナー 2026-09-24:「品質 MOD が付いてたらその数値分カタリストマックス付けて。普段は 20% やけど、
   * これ付いてたらそれ以降 40%。(触媒の高貴のお告げを) 使わない限り付けっぱなし」)
   */
  /** 品質の上限 (ベース + ブリーチの MOD があれば 20) */
  const quality = (s: SimState): number => (ctx.baseQuality ?? 20) + (s.breach ? 20 : 0);
  /** 触媒の高貴のお告げで効く品質。品質の手を打っていれば、その種類の今の品質 (違う種類なら 0)。打っていなければ上限とみなす */
  const catalystQuality = (s: SimState, tag: string): number =>
    s.quality == null ? quality(s) : s.qualityTag === tag ? s.quality : 0;

  /** その状態で打てるか (打てないなら理由)。画面は打てる物だけ出す (オーナー:「その状態で使えるカレンシーのみ表示」) */
  function usable(s: SimState, a: SimAction | null): string | null {
    if (!a) return "打つ物が未設定";
    switch (a.kind) {
      case "chaos": return removable(s, null).length ? null : "外せる物が無い";
      case "exalt": {
        const sides = a.side ? [a.side] : SIDES.filter((x) => room(s, x));
        return sides.length && sides.every((x) => room(s, x)) ? null : "足す枠が無い";
      }
      case "annul": return removable(s, a.side).length ? null : "外せる物が無い";
      case "essence": {
        // 食わせる物が無ければ、高貴 + 側の高貴なお告げで外れを付けてから (その分も 1 回の値段に入る)
        const side = mod(a.modId)?.type as Side;
        return removable(s, side).length || room(s, side) ? null : "食わせる物も枠も無い";
      }
      case "desecrate": return room(s, a.side) ? null : "冒涜する枠が無い";
      case "light": return s.slots.some((x) => x.desecrated) ? null : "冒涜の外れが無い";
      case "breach": return s.breach ? "もう付いている" : removable(s, "prefix").length || room(s, "prefix") ? null : "食わせるプレも枠も無い";
      case "whittle": return removable(s, null).length ? null : "外せる物が無い";
      case "check": case "quality": return null;
    }
  }

  /** 1 回の値段 */
  function priceOf(s: SimState, a: SimAction): number {
    switch (a.kind) {
      case "chaos": return cur(a.tier);
      case "exalt": return cur(a.tier) + (a.side ? cur(OMEN_EX[a.side]) : 0)
        + (a.catalyst ? cur("OmenofCatalysingExaltation") + (s.quality == null ? catalystCountFor(quality(s)) * cur(catalystPriceKey(a.catalyst)) : 0) : 0);
      case "annul": return cur("annul") + (a.side ? cur(OMEN_ER[a.side]) : 0);
      case "essence": {
        const side = (mod(a.modId)?.type ?? "prefix") as Side;
        return cur(`essence:perfect:${a.modId}`) + cur(OMEN_CR[side]) + (removable(s, side).length ? 0 : cur("exalt") + cur(OMEN_EX[side]));
      }
      case "desecrate": return cur(a.bone) + cur(OMEN_NE[a.side]) + (a.echoes ? cur("OmenofAbyssalEchoes") : 0);
      case "light": return cur("annul") + cur("OmenofLight");
      // カオススパムの直後はプレが固定済みだけなので、高貴 + 左側の高貴なお告げで外れを付けてから食わせる (オーナー:「カオス
      // スパム後に左側結晶化でブリーチエッセンス付ける手がいる」)
      case "breach": return cur("essence:breach") + cur("OmenofSinistralCrystallisation") + (removable(s, "prefix").length ? 0 : cur("exalt") + cur(OMEN_EX.prefix));
      case "whittle": return cur("chaos") + cur("OmenofWhittling");
      case "check": return 0;
      // 同じ種類で入っている分は足すだけ。違う種類なら入れ直し (品質の種類は 1 つ)
      case "quality": return catalystCountFor(Math.max(0, quality(s) - (s.qualityTag === a.catalyst ? s.quality ?? 0 : 0))) * cur(catalystPriceKey(a.catalyst));
    }
  }

  /** 冒涜 1 回で「その手の狙い」が出る確率 (3 択、反響なら引き直し 1 回) */
  function desecrateOdds(s: SimState, n: SimNode, a: Extract<SimAction, { kind: "desecrate" }>): number {
    const occ = families(s);
    const floor = a.bone === "desecrate_ancient" ? 40 : 0;
    const key = a.side === "prefix" ? "prefixes" : "suffixes";
    const pool = [...cls.pools.normal[key], ...cls.pools.desecrated[key]];
    const W = pool.reduce((acc, id) => { const m = mod(id); return m && !occ.has(m.family) ? acc + sw(m, 0, floor) : acc; }, 0);
    const good = n.targets.reduce((acc, t) => { const m = mod(t.modId); return m && m.type === a.side && !occ.has(m.family) ? acc + sw(m, t.minTier, floor) : acc; }, 0);
    const p1 = W > 0 ? good / W : 0;
    const miss3 = (1 - p1) ** 3;
    return a.echoes ? 1 - miss3 * miss3 : 1 - miss3;
  }

  /** 打つ (rnd で 1 回分)。値段は呼ぶ側が足す */
  function apply(s: SimState, n: SimNode, rnd: () => number): SimState {
    const a = n.action;
    if (!a) return s;
    const pick = <T extends { p: number }>(xs: readonly T[]): T | null => {
      let u = rnd();
      for (const x of xs) { if (u < x.p) return x; u -= x.p; }
      return xs[xs.length - 1] ?? null;
    };
    const land = (st: SimState, o: { modId: string | null; side: Side } | null): SimState =>
      o ? { ...st, slots: [...st.slots, { modId: o.modId, side: o.side, fixed: false }] } : st;
    const rmRandom = (st: SimState, side: Side | null): SimState => {
      const rem = removable(st, side);
      return rem.length ? removeAt(st, rem[Math.floor(rnd() * rem.length)]!) : st;
    };
    switch (a.kind) {
      case "chaos": {
        const t = rmRandom(s, null);
        return land(t, pick(roll(t, SIDES.filter((x) => room(t, x)), FLOOR[a.tier]!, null, 20)));
      }
      case "exalt": {
        const sides = a.side ? [a.side] : SIDES.filter((x) => room(s, x));
        return land(s, pick(roll(s, sides, FLOOR[a.tier]!, a.catalyst, a.catalyst ? catalystQuality(s, a.catalyst) : 0)));
      }
      case "annul": return rmRandom(s, a.side);
      case "essence": {
        const side = mod(a.modId)?.type as Side;
        const t = removable(s, side).length ? s : land(s, { modId: null, side });
        return land(rmRandom(t, side), { modId: a.modId, side });
      }
      case "desecrate": {
        const ok = rnd() < desecrateOdds(s, n, a);
        const t = n.targets.find((x) => mod(x.modId)?.type === a.side && !has(s, x.modId));
        return { ...s, slots: [...s.slots, ok && t ? { modId: t.modId, side: a.side, fixed: false } : { modId: null, side: a.side, fixed: false, desecrated: true }] };
      }
      case "light": {
        const i = s.slots.findIndex((x) => x.desecrated);
        return i >= 0 ? removeAt(s, i) : s;
      }
      case "breach": {
        const t = removable(s, "prefix").length ? s : land(s, { modId: null, side: "prefix" });
        return { ...rmRandom(t, "prefix"), breach: true };
      }
      case "whittle": {
        // 一番レベルの低い物 (ブリーチの MOD はレベル 0) を消して 1 つ付く
        const t = s.breach ? { ...s, breach: false } : rmRandom(s, null);
        return land(t, pick(roll(t, SIDES.filter((x) => room(t, x)), 0, null, 20)));
      }
      case "check": return s;
      case "quality": return { ...s, quality: Math.max(quality(s), s.qualityTag === a.catalyst ? s.quality ?? 0 : 0), qualityTag: a.catalyst };
    }
  }

  return { roll, usable, priceOf, apply, passes, targetsMet, desecrateOdds, removable, room, has, hasJunk, breachKept, breachSpent, cur, mod };
}

/**
 * 少しずつ回す (画面が固まらないように。chunk 回ごとに一息つき、進み具合を知らせる)。
 * 乱数の種を chunk ごとに変えて、結果は 1 回で回したのと同じ形にまとめる
 */
export async function simulateTreeChunked(
  inp: Parameters<typeof simulateTree>[0],
  onProgress?: (done: number, total: number) => void,
  chunk = 200,
): Promise<SimResult> {
  const total = inp.runs ?? 4000;
  const parts: SimResult[] = [];
  for (let i = 0; i < total; i += chunk) {
    parts.push(simulateTree({ ...inp, runs: Math.min(chunk, total - i), seed: 20260924 + i }));
    onProgress?.(Math.min(total, i + chunk), total);
    await new Promise((r) => setTimeout(r, 0));
  }
  const runs = parts.reduce((a, p) => a + p.runs, 0);
  const done = parts.flatMap((p) => p.doneCosts).sort((a, b) => a - b);
  const q = (f: number): number => done[Math.min(done.length - 1, Math.floor(done.length * f))] ?? 0;
  const stops = new Map<string, number>();
  for (const p of parts) for (const x of p.stops) stops.set(x.reason, (stops.get(x.reason) ?? 0) + x.p * p.runs);
  return {
    runs,
    pDone: done.length / runs,
    pBudget: inp.budget != null ? done.filter((c) => c <= inp.budget!).length / runs : null,
    expected: done.length ? done.reduce((a, b) => a + b, 0) / done.length : 0,
    p50: q(0.5), p80: q(0.8), p90: q(0.9),
    perNode: (parts[0]?.perNode ?? []).map((n, i) => ({
      id: n.id,
      tries: parts.reduce((a, p) => a + p.perNode[i]!.tries * p.runs, 0) / runs,
      cost: parts.reduce((a, p) => a + p.perNode[i]!.cost * p.runs, 0) / runs,
    })),
    stops: [...stops].map(([reason, c]) => ({ reason, p: c / runs })).sort((a, b) => b.p - a.p),
    doneCosts: done,
  };
}

/** 回す。手 0 から、○×の行き先をたどる。「完成」で終わり、未設定・打てない所で止まる */
export function simulateTree(inp: {
  ctx: StepCtx & { baseQuality?: number }; start: SimState; nodes: readonly SimNode[]; runs?: number; budget?: number; maxActions?: number; seed?: number;
  /** 調べ用: 1 回目の各手 (打った手の id と、打った後の指輪) を知らせる */
  trace?: (at: string, s: SimState) => void;
}): SimResult {
  const { ctx, nodes } = inp;
  const h = simHelpers(ctx, nodes);
  const byId = new Map(nodes.map((n, i) => [n.id, i]));
  const runs = inp.runs ?? 4000;
  const maxActions = inp.maxActions ?? 20000;
  const rnd = mulberry32(inp.seed ?? 20260924);
  const costs: number[] = [];
  const doneCosts: number[] = [];
  const stops = new Map<string, number>();
  const tries = nodes.map(() => 0), spent = nodes.map(() => 0);
  // 本線 = 手 1 から○の行き先をたどった並び (輪になったら止める)
  const main: number[] = [];
  let mainEndsDone = false;
  for (let i: number | undefined = nodes.length ? 0 : undefined; i != null && !main.includes(i);) {
    main.push(i);
    const g = nodes[i]!.onHit;
    if (g === "done") { mainEndsDone = true; break; }
    i = g && g !== "auto" ? byId.get(g) : undefined;
  }
  const goalMet = (st: SimState, x: SimNode): boolean =>
    h.targetsMet(st, x) && x.keep.every((id) => (id === "__breach__" ? st.breach : h.has(st, id)));
  /** 狙いのある手 (狙う MOD がある / ブリーチの手)。狙いの無い手 (品質だけ・削減・確認) は順番に打つ手 */
  const hasGoal = (x: SimNode): boolean => x.targets.length > 0 || x.action?.kind === "breach";
  /**
   * 自動の行き先 (上の決まり)。本線を上から見て、揃っていない狙いの手か、狙いの無い手 (順番に打つ手) の先に来る方。
   * 狙いの無い手を「揃っている」と見て飛ばすと、品質の仕上げや削減を抜かしてしまう (2026-09-24 見本のツリーで踏んだ)
   */
  /**
   * 品質の手は、今その種類の品質が入っていれば自動の戻り先にしない (品質は消去・カオスで消えない)。違う種類が入っていれば
   * 入れ直す (種類を替えると 0 から。オーナー 2026-09-24)。前は 1 回打ったら戻らないにしていて、途中で種類を替えた後に
   * 戻ると倍率が効かないままだった
   */
  // その品質の手の次の手 (本線) が狙いのある手で、もう揃っていれば、その品質は要らない (耐性が付いた後に知性用に替えた品質を、
  // 耐性用に戻しに行かない)
  const qualityReady = (st: SimState, pos: number): boolean => {
    const x = nodes[main[pos]!]!;
    if (x.action?.kind !== "quality") return false;
    if (st.quality != null && st.qualityTag === x.action.catalyst) return true;
    const next = main[pos + 1] != null ? nodes[main[pos + 1]!]! : null;
    return !!next && hasGoal(next) && goalMet(st, next);
  };
  /**
   * ブリーチはもう要らないか: 本線の最後の品質の手の種類で、ブリーチ込みの上限まで入っていれば、品質は残るので付け直さない
   * (2026-09-24: 最後の品質の後で外れを消去した時に、ブリーチの手が未完了に見えて付け直しに戻り、満杯の側で止まった)
   */
  // 本線の最後の品質の手を、この回で通った後だけ (途中で同じ種類の品質を入れる手があっても、そこでは要る)
  const lastQualityAt = [...main].reverse().find((i) => nodes[i]!.action?.kind === "quality");
  let finalQualityDone = false;
  const breachDone = (st: SimState): boolean => {
    const a = lastQualityAt != null ? nodes[lastQualityAt]!.action : null;
    return finalQualityDone && a?.kind === "quality" && st.quality != null && st.qualityTag === a.catalyst && st.quality >= (ctx.baseQuality ?? 20) + 20;
  };
  const autoNext = (st: SimState, cur: number): string | "done" | null => {
    const mp = main.findIndex((i, pos) => (!hasGoal(nodes[i]!) && !qualityReady(st, pos))
      || (hasGoal(nodes[i]!) && !goalMet(st, nodes[i]!) && !(nodes[i]!.action?.kind === "breach" && breachDone(st))));
    const m = mp >= 0 ? main[mp] : undefined;
    if (m == null) return mainEndsDone ? "done" : null;
    const target = nodes[m]!;
    // カオスの手へ戻る時は、外せる物が 1 つになるまで今の消去を続けてから (「スパムの狙いが消えたら剥がして最初から」オーナー)。
    // 剥がさずに戻ると外れが居残り、最後に冒涜の枠を塞いでいた (2026-09-24 見本のツリー)
    if (target.action?.kind === "chaos") {
      // 側を決めた消去なら、その側の物だけ数える (反対側の MOD まで数えると剥がし切れず「外せる物が無い」で止まった)
      const ca0 = nodes[cur]!.action;
      const side0 = ca0?.kind === "annul" ? ca0.side : null;
      const removableCount = st.slots.filter((x) => !x.fixed && !x.keep && (!side0 || x.side === side0)).length
        + (st.breach && side0 !== "suffix" ? 1 : 0);
      return removableCount > 1 && ca0?.kind === "annul" ? nodes[cur]!.id : target.id;
    }
    // 外れが残っていれば今の消去を続ける。ただし側を決めた消去なら、その側の外れだけを見る (反対側の外れで打ち続けて
    // 「外せる物が無い」で止まっていた。2026-09-24 自動で組んだツリー)
    const ca = nodes[cur]!.action;
    const annulSide = ca?.kind === "annul" ? ca.side : null;
    const junkHere = st.slots.some((x) => !x.fixed && !x.keep && !x.modId && (!annulSide || x.side === annulSide))
      || (st.breach && (!h.breachKept || h.breachSpent(st)) && annulSide !== "suffix");
    // (今の手が消去の時だけ。光などから自動で戻る時は狙いの手へ。2026-09-24 光に戻り続けて止まっていた)
    if (junkHere && hasGoal(target) && ca?.kind === "annul") return nodes[cur]!.id;
    return target.id;
  };
  const keepCount = inp.start.slots.filter((x) => x.keep).length;
  for (let r = 0; r < runs; r++) {
    finalQualityDone = false;
    let s: SimState = { ...inp.start, slots: inp.start.slots.map((x) => ({ ...x })) };
    let cost = 0;
    let at = nodes.length ? 0 : -1;
    let end: string | null = nodes.length ? null : "手が無い";
    for (let k = 0; k < maxActions && at >= 0; k++) {
      const n = nodes[at]!;
      // 飛ばす手: ブリーチが無い時の「ブリーチがある時だけ」の手、本線の品質の手で要らない物 (今その種類が入っている /
      // 次の狙いの手が揃っている。仕上げの後で戻った時に途中の種類へ入れ替えて品質を落としていた)
      const mpos = main.indexOf(at);
      if (((n.onlyWithBreach && !s.breach) || (mpos >= 0 && qualityReady(s, mpos))) && n.onHit) {
        const g = n.onHit === "auto" ? autoNext(s, at) : n.onHit;
        if (g === "done") { end = "done"; break; }
        const j = g ? byId.get(g) : undefined;
        if (j != null && j !== at) { at = j; continue; }
      }
      // 本線の手で、もう揃っていれば飛ばす (カオスでスパムの狙いを付け直した時、前の触媒の高貴のお告げの成功品が残っていれば次へ)
      if (main.includes(at) && hasGoal(n) && goalMet(s, n) && n.onHit) {
        const g = n.onHit === "auto" ? autoNext(s, at) : n.onHit;
        if (g === "done") { end = "done"; break; }
        const j = g ? byId.get(g) : undefined;
        if (j != null && j !== at) { at = j; continue; }
      }
      const why = h.usable(s, n.action);
      // 打てない (枠が無い等) けれど外れがあるなら、先に × の行き先 (消去の手) へ回す (費用は掛からない)。
      // × の行き先が「自動」なら外れが無くても回す (消えた狙いを取り返しに戻る)
      if (why && (h.hasJunk(s) || n.onMiss === "auto") && n.onMiss && n.onMiss !== "done") {
        const g = n.onMiss === "auto" ? autoNext(s, at) : n.onMiss;
        const j = g && g !== "done" ? byId.get(g) : undefined;
        if (j != null && j !== at) { at = j; continue; }
      }
      if (why) { end = `手 ${at + 1} が打てない: ${why}`; break; }
      const price = h.priceOf(s, n.action!);
      if (!Number.isFinite(price)) { end = `手 ${at + 1} が相場に無い物を使っている`; break; }
      cost += price; tries[at]! += 1; spent[at]! += price;
      s = h.apply(s, n, rnd);
      if (at === lastQualityAt) finalQualityDone = true;
      if (r === 0) inp.trace?.(n.id, s);
      // 消えたら終わりの MOD (樹 MOD) が消えたら止める
      if (s.slots.filter((x) => x.keep).length < keepCount) { end = `手 ${at + 1} で消えたら終わりの MOD (樹 MOD など) が消えた`; break; }
      // 本線の手は「それより上の本線の手で揃えた物が全部まだある」ことも○の条件 (残したい MOD は自動。オーナー 2026-09-24:
      // 「残したい MOD とか分からん。ハズレ以外だろ残したいのなんて」)
      const pos = main.indexOf(at);
      // ブリーチの MOD は品質のための一時的な物 (最後に削減で消す) なので、自動で残す物には入れない
      const pass = h.passes(s, n) && (pos < 0 || main.slice(0, pos).every((i) => !nodes[i]!.targets.length || h.targetsMet(s, nodes[i]!)));
      // 確定の手は × が未設定なら○の行き先へ (必ず付くので × は来ない前提)
      let next = pass ? n.onHit : n.onMiss == null && n.action && CERTAIN.has(n.action.kind) ? n.onHit : n.onMiss;
      if (next === "auto") next = autoNext(s, at);
      if (next === "done") { end = "done"; break; }
      if (next == null) { end = `手 ${at + 1} の${h.passes(s, n) ? "○" : "×"}の行き先が未設定`; break; }
      const j = byId.get(next);
      if (j == null) { end = `手 ${at + 1} の行き先が無い手`; break; }
      at = j;
    }
    if (end == null) end = `手数の上限 (${maxActions}) で止まった`;
    costs.push(cost);
    if (end === "done") doneCosts.push(cost);
    else stops.set(end, (stops.get(end) ?? 0) + 1);
  }
  const sorted = [...doneCosts].sort((a, b) => a - b);
  const q = (f: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))] ?? 0;
  return {
    runs,
    pDone: doneCosts.length / runs,
    pBudget: inp.budget != null ? doneCosts.filter((c) => c <= inp.budget!).length / runs : null,
    expected: doneCosts.length ? doneCosts.reduce((a, b) => a + b, 0) / doneCosts.length : 0,
    p50: q(0.5), p80: q(0.8), p90: q(0.9),
    perNode: nodes.map((n, i) => ({ id: n.id, tries: tries[i]! / runs, cost: spent[i]! / runs })),
    stops: [...stops].map(([reason, c]) => ({ reason, p: c / runs })).sort((a, b) => b.p - a.p),
    doneCosts,
  };
}
