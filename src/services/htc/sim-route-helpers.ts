/** sim-route.ts から切り出し (2026-09-26): 1 手ごとの計算 (抽選の分布・打てるか・値段・打つ・○の条件)。simHelpers で使い回す */
import type { Mod } from "../../vendor/poe2htc/engine/types";
import { catalysingMultiplier, catalystCountFor, catalystPriceKey } from "./catalysing";
import { catalystsFor } from "./quality";
import { type Side } from "./step-odds";
import { OMEN, BREACH_FAMILY } from "./omens";
import type { RollOutcome, SimAction, SimCtx, SimNode, SimSlot, SimState } from "./sim-route-types";

const FLOOR: Record<string, number> = { chaos: 0, chaos_greater: 35, chaos_perfect: 50, exalt: 0, exalt_greater: 35, exalt_perfect: 50 };
const SIDES: Side[] = ["prefix", "suffix"];

/**
 * 同じ ctx・同じ手の並びなら helpers (中の memo) を使い回す。2026-09-26: 小分けに回すたびに作り直して roll の memo が
 * 毎回空になり、段を変えただけで 10 秒固まっていた (roll が 5 秒)
 */
const HELPERS = new WeakMap<object, WeakMap<readonly SimNode[], ReturnType<typeof makeHelpers>>>();
export function simHelpers(ctx: SimCtx, nodes: readonly SimNode[]) {
  let byNodes = HELPERS.get(ctx);
  if (!byNodes) { byNodes = new WeakMap(); HELPERS.set(ctx, byNodes); }
  let h = byNodes.get(nodes);
  if (!h) { h = makeHelpers(ctx, nodes); byNodes.set(nodes, h); }
  return h;
}
function makeHelpers(ctx: SimCtx, nodes: readonly SimNode[]) {
  const { data, cls, prices, itemLevel } = ctx;
  const cur = (k: string): number => prices.currency[k] ?? prices.omens[k] ?? Infinity;
  const mod = (id: string): Mod | undefined => data.mods.get(id);
  const count = (s: SimState, side: Side): number => s.slots.filter((x) => x.side === side).length + (side === "prefix" && s.breach ? 1 : 0);
  const room = (s: SimState, side: Side): boolean => count(s, side) < ctx.limits[side];
  /** 付いている系統 (狙いの MOD も外れも。系統が分からない物は数えない) */
  const familyOf = (x: SimSlot): string | undefined => x.family ?? (x.modId ? mod(x.modId)?.family : undefined);
  const families = (s: SimState): Set<string> => new Set(s.slots.flatMap((x) => { const f = familyOf(x); return f ? [f] : []; }));
  /** ブリーチの MOD のレベル (削減のお告げで比べる。データの段のレベル、無ければ 1) */
  const breachLvl = Math.min(...[...data.mods.values()].filter((m) => m.family === BREACH_FAMILY).flatMap((m) => m.tiers.map((t) => t.ilvl)), 1);
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
  /**
   * エッセンスの消す側。"auto" は、エッセンスの側に空きがあって反対側に外れがあれば反対側 (その外れを食わせる)、無ければ同じ側
   * (オーナー 2026-09-24:「反対側が外れ 1 あるならエッセンス結晶化でやっていい」)
   */
  function removeSideOf(s: SimState, a: Extract<SimAction, { kind: "essence" }>): Side {
    const side = (mod(a.modId)?.type ?? "prefix") as Side;
    if (a.removeSide !== "auto") return a.removeSide ?? side;
    const other: Side = side === "prefix" ? "suffix" : "prefix";
    const junkOther = s.slots.some((x) => x.side === other && !x.fixed && !x.keep && !x.modId);
    return room(s, side) && junkOther ? other : side;
  }
  /** 偉大なる高貴のお告げを実際に使うか (空きが 2 つ以上ある時だけ。1 つなら普通の高貴で打つ) */
  function greaterOn(s: SimState, a: Extract<SimAction, { kind: "exalt" }>): boolean {
    if (!a.greater) return false;
    const sides = a.side ? [a.side] : SIDES;
    return sides.reduce((n, x) => n + Math.max(0, ctx.limits[x] - count(s, x)), 0) >= 2;
  }
  /**
   * 付いているクラフト MOD の数 (ブリーチの MOD + エッセンスで付いた MOD)。持てるのは ctx.craftedLimit (既定 1、アストリッドの
   * 創造性で 2)。2026-09-26: 前は「付いているか」だけ見ていて、アストリッドを差しても 2 つ目のエッセンスが打てなかった
   */
  const craftedCount = (s: SimState): number => (s.breach ? 1 : 0) + s.slots.filter((x) => x.crafted).length;
  const craftedLimit = ctx.craftedLimit ?? 1;
  const craftedFull = (s: SimState): boolean => craftedCount(s) >= craftedLimit;
  const craftedMsg = (): string => `クラフト MOD は ${craftedLimit} つまで${craftedLimit < 2 ? " (アストリッドの創造性で 2 つ)" : ""}`;
  const hasJunk = (s: SimState): boolean =>
    s.slots.some((x) => !x.fixed && !x.keep && !x.modId) || (s.breach && (!breachKept || breachSpent(s)));

  /** 狙う MOD のうち need 個あるか */
  const targetsMet = (s: SimState, n: SimNode): boolean =>
    !n.targets.length || n.targets.filter((t) => has(s, t.modId)).length >= Math.min(n.need ?? 1, n.targets.length);
  /** ○の条件 */
  const passes = (s: SimState, n: SimNode): boolean =>
    targetsMet(s, n) && n.keep.every((id) => id === "__breach__" ? s.breach : has(s, id))
    && (!n.clean || !hasJunk(s)) && (n.maxMods == null || s.slots.filter((x) => !x.fixed && !x.keep).length + (s.breach ? 1 : 0) <= n.maxMods);

  const memo = new Map<string, RollOutcome[]>();
  /**
   * 1 回で付く物の分布 (数える MOD = modId、それ以外 = 外れ)。MOD ごとに 1 行 (狙いの段以上と未満で 2 行) で、付いている系統は
   * 除く (Craft of Exile と同じ: その側の、ilvl と下限で出る段の重みの割合)。外れも系統と段のレベルを持つ
   */
  function roll(s: SimState, sides: Side[], floor: number, tag: string | null, q: number): RollOutcome[] {
    const occ = families(s);
    const key = `${sides.join()}|${floor}|${tag}|${q}|${[...occ].sort().join()}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const mult = tag ? catalysingMultiplier(q) : 1;
    const out: Array<{ modId: string | null; family: string; side: Side; w: number; tiers: Array<{ lvl: number; p: number }> }> = [];
    for (const side of sides) {
      for (const id of cls.pools.normal[side === "prefix" ? "prefixes" : "suffixes"]) {
        const m = mod(id);
        if (!m || occ.has(m.family)) continue;
        const k = tag && catalystsFor(m).some((c) => c.tag === tag) ? mult : 1;
        const min = minTierOf.get(id) ?? Infinity;
        const good: Array<{ lvl: number; p: number }> = [], bad: Array<{ lvl: number; p: number }> = [];
        m.tiers.forEach((t, i) => { if (t.ilvl <= itemLevel && t.ilvl >= floor && t.weight > 0) (i >= min ? good : bad).push({ lvl: t.ilvl, p: t.weight }); });
        for (const [list, mid] of [[good, id], [bad, null]] as const) {
          const w = list.reduce((a, x) => a + x.p, 0);
          if (w > 0) out.push({ modId: mid, family: m.family, side, w: w * k, tiers: list.map((x) => ({ lvl: x.lvl, p: x.p / w })) });
        }
      }
    }
    const W = out.reduce((a, x) => a + x.w, 0);
    const dist = W > 0 ? out.map((x) => ({ modId: x.modId, family: x.family, side: x.side, p: x.w / W, tiers: x.tiers })) : [];
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
      case "chaos": return removable(s, a.side ?? null).length ? null : "外せる物が無い";
      case "exalt": {
        const sides = a.side ? [a.side] : SIDES.filter((x) => room(s, x));
        // 偉大なる高貴で空きが 1 つしか無い時は、お告げを使わずに普通の高貴として打つ (greaterOn)
        return sides.length && sides.every((x) => room(s, x)) ? null : "足す枠が無い";
      }
      case "annul": return removable(s, a.side).length ? null : "外せる物が無い";
      case "essence": {
        // 食わせる物が無ければ、高貴 + 側の高貴なお告げで外れを付けてから (その分も 1 回の値段に入る)
        if (craftedFull(s)) return `${craftedMsg()} (ブリーチやエッセンスの MOD が付いている)`;
        const side = mod(a.modId)?.type as Side;
        const rs = removeSideOf(s, a);
        if (rs !== side && !room(s, side)) return "エッセンスの側に枠が無い";
        // 同じ系統の MOD が付いていれば付かない (ゲームは打てない)。ただしそれが消える側で唯一外せる物なら、先に消えるので付く
        // (枠 2 つの側の上書きの輪: 冒涜の外れがエッセンスと同じ系統のことがある)
        const fam = mod(a.modId)?.family;
        const clash = fam ? s.slots.map((x, i) => (familyOf(x) === fam ? i : -2)).filter((i) => i >= 0) : [];
        const rem = removable(s, rs);
        if (clash.length && !(clash.length === 1 && rem.length === 1 && rem[0] === clash[0])) return "同じ系統の MOD が付いている";
        return removable(s, rs).length || room(s, rs) ? null : "食わせる物も枠も無い";
      }
      case "desecrate":
        if (s.slots.some((x) => x.desec)) return "冒涜の MOD は 1 つまで";
        // 満杯の側でも、固定済みでない MOD があれば 1 つ置き換わる (オーナーの実使用 / 0.5.5 の冒涜の解説)
        return room(s, a.side) || removable(s, a.side).length ? null : "冒涜する枠も置き換わる MOD も無い";
      case "light": return s.slots.some((x) => x.desecrated) ? null : "冒涜の外れが無い";
      case "breach": {
        if (s.breach) return "もう付いている";
        if (craftedFull(s)) return `${craftedMsg()} (エッセンスの MOD が付いている)`;
        const rs = a.removeSide ?? "prefix";
        if (rs !== "prefix" && !room(s, "prefix")) return "プレに枠が無い";
        return removable(s, rs).length || room(s, rs) ? null : "食わせる物も枠も無い";
      }
      case "whittle": return removable(s, null).length ? null : "外せる物が無い";
      case "check": case "quality": return null;
    }
  }

  /**
   * 側のお告げ (高貴・消去・抹消・結晶化・ネクロマンシー) が、その状態で結果を変えるか (2026-09-26 オーナー承認:
   * 効かないお告げの代を取らない。画面の「お告げ不要」もこれで出す)。側のお告げの無い手は false。
   * 要らない時は apply() もお告げ無しと同じ動きになる (消す・足す先の候補が同じ並びになる):
   *   高貴 … 反対側に枠が無い (どうせこの側にしか付かない。偉大なるで 2 つ足す時も枠は増えない)
   *   消去・カオス (抹消) … 外せる物がこの側にしか無い
   *   エッセンス・ブリーチ (結晶化) … 消す側の反対に外せる物が無い
   *   冒涜 (ネクロマンシー) … この側に枠があり、反対側が満杯 (この側が満杯の置き換えは、お告げ無しの動きが分からないので払う)
   */
  function omenNeeded(s: SimState, a: SimAction): boolean {
    const other = (x: Side): Side => (x === "prefix" ? "suffix" : "prefix");
    switch (a.kind) {
      case "exalt": return !!a.side && room(s, other(a.side));
      case "chaos": case "annul": return !!a.side && removable(s, other(a.side)).length > 0;
      case "essence": return removable(s, other(removeSideOf(s, a))).length > 0;
      case "breach": return removable(s, other(a.removeSide ?? "prefix")).length > 0;
      case "desecrate": return !room(s, a.side) || room(s, other(a.side));
      default: return false;
    }
  }
  /** 食わせる外れを付ける高貴の側のお告げ (反対側に枠が無ければ要らない) */
  const feedOmen = (s: SimState, rs: Side): number => (room(s, rs === "prefix" ? "suffix" : "prefix") ? cur(OMEN.exalt[rs]) : 0);

  /** 1 回の値段 (側のお告げは効く時だけ。[[omenNeeded]]) */
  function priceOf(s: SimState, a: SimAction): number {
    const need = omenNeeded(s, a);
    switch (a.kind) {
      case "chaos": return cur(a.tier) + (a.side && need ? cur(OMEN.erasure[a.side]) : 0);
      case "exalt": return cur(a.tier) + (a.side && need ? cur(OMEN.exalt[a.side]) : 0) + (greaterOn(s, a) ? cur("OmenofGreaterExaltation") : 0)
        // 触媒の高貴のお告げは品質を全部使う (ゲーム内の文面)。2 回目からは上限まで入れ直す分も掛かる
        + (a.catalyst ? cur("OmenofCatalysingExaltation") + catalystCountFor(s.quality == null ? quality(s) : Math.max(0, quality(s) - catalystQuality(s, a.catalyst))) * cur(catalystPriceKey(a.catalyst)) : 0);
      case "annul": return cur("annul") + (a.side && need ? cur(OMEN.annul[a.side]) : 0);
      case "essence": {
        const rs = removeSideOf(s, a);
        return cur(`essence:perfect:${a.modId}`) + (need ? cur(OMEN.crystallisation[rs]) : 0) + (removable(s, rs).length ? 0 : cur("exalt") + feedOmen(s, rs));
      }
      case "desecrate": return cur(a.bone) + (need ? cur(OMEN.necromancy[a.side]) : 0) + (a.echoes ? cur("OmenofAbyssalEchoes") : 0);
      case "light": return cur("annul") + cur("OmenofLight");
      // カオススパムの直後はプレが固定済みだけなので、高貴 + 左側の高貴なお告げで外れを付けてから食わせる (オーナー:「カオス
      // スパム後に左側結晶化でブリーチエッセンス付ける手がいる」)
      case "breach": {
        const rs = a.removeSide ?? "prefix";
        return cur("essence:breach") + (need ? cur(OMEN.crystallisation[rs]) : 0) + (removable(s, rs).length ? 0 : cur("exalt") + feedOmen(s, rs));
      }
      case "whittle": return cur("chaos") + cur("OmenofWhittling");
      case "check": return 0;
      // 同じ種類で入っている分は足すだけ。違う種類なら入れ直し (品質の種類は 1 つ)
      case "quality": return catalystCountFor(Math.max(0, quality(s) - (s.qualityTag === a.catalyst ? s.quality ?? 0 : 0))) * cur(catalystPriceKey(a.catalyst));
    }
  }

  /**
   * 冒涜の選択肢の元 (その側の普通 + 冒涜の MOD、付いている系統を除く)。1 行 = MOD 1 つ: 重み w、狙いの段以上の重み good、
   * 段ごとの MOD レベル。3 択は同じ MOD が 2 回出ない (重みで引いて、引いた物を除いて次を引く)
   */
  type DesecOpt = { id: string; family: string; w: number; good: number; tiers: Array<{ lvl: number; w: number; good: boolean }> };
  const desecMemo = new Map<string, { opts: DesecOpt[]; pMiss3?: number }>();
  function desecrateOpts(s: SimState, n: SimNode, a: Extract<SimAction, { kind: "desecrate" }>): { opts: DesecOpt[]; pMiss3?: number } {
    const occ = families(s);
    const floor = a.bone === "desecrate_ancient" ? 40 : 0;
    const want = new Map(n.targets.filter((t) => !has(s, t.modId)).map((t) => [t.modId, t.minTier] as const));
    const key = `${a.side}|${floor}|${[...want].join()}|${[...occ].sort().join()}`;
    const hit = desecMemo.get(key);
    if (hit) return hit;
    const k = a.side === "prefix" ? "prefixes" : "suffixes";
    const ids = [...new Set([...cls.pools.normal[k], ...cls.pools.desecrated[k]])];
    const opts: DesecOpt[] = ids.flatMap((id) => {
      const m = mod(id);
      if (!m || occ.has(m.family)) return [];
      const min = want.get(id);
      const tiers = m.tiers.flatMap((t, i) => (t.ilvl <= itemLevel && t.ilvl >= floor && t.weight > 0 ? [{ lvl: t.ilvl, w: t.weight, good: min != null && i >= min }] : []));
      const w = tiers.reduce((x, t) => x + t.w, 0);
      const good = tiers.reduce((x, t) => x + (t.good ? t.w : 0), 0);
      return w > 0 ? [{ id, family: m.family, w, good, tiers }] : [];
    });
    const v = { opts };
    desecMemo.set(key, v);
    return v;
  }
  /** 冒涜 1 回で「その手の狙い」が出る確率 (3 択は別々の MOD、反響なら引き直し 1 回) */
  function desecrateOdds(s: SimState, n: SimNode, a: Extract<SimAction, { kind: "desecrate" }>): number {
    const v = desecrateOpts(s, n, a);
    if (v.pMiss3 == null) {
      // 3 つとも外れる確率 (引いた物を除いて引く。選択肢ごとに段は独立)
      const { opts } = v;
      const W = opts.reduce((x, o) => x + o.w, 0);
      const miss = (o: DesecOpt): number => 1 - o.good / o.w;
      const WM = opts.reduce((x, o) => x + o.w * miss(o), 0);
      let pm = 0;
      for (const a1 of opts) {
        const p1 = a1.w / W, W1 = W - a1.w;
        if (W1 <= 1e-9) { pm += p1 * miss(a1); continue; }
        for (const a2 of opts) {
          if (a2 === a1) continue;
          const W2 = W1 - a2.w;
          const m3 = W2 > 1e-9 ? (WM - a1.w * miss(a1) - a2.w * miss(a2)) / W2 : 1;
          pm += p1 * miss(a1) * (a2.w / W1) * miss(a2) * m3;
        }
      }
      v.pMiss3 = W > 0 ? pm : 1;
    }
    const m3 = v.pMiss3;
    return a.echoes ? 1 - m3 * m3 : 1 - m3;
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
    /** 付く物を付ける (段の MOD レベルも引く) */
    const land = (st: SimState, o: RollOutcome | null): SimState => {
      if (!o) return st;
      const lv = pick(o.tiers)?.lvl;
      return { ...st, slots: [...st.slots, { modId: o.modId, side: o.side, fixed: false, family: o.family, ...(lv != null ? { lvl: lv } : {}) }] };
    };
    const rmRandom = (st: SimState, side: Side | null): SimState => {
      const rem = removable(st, side);
      return rem.length ? removeAt(st, rem[Math.floor(rnd() * rem.length)]!) : st;
    };
    /**
     * 削減のお告げ: 一番レベルの低い物を消す (同じレベルなら等しく)。ブリーチの MOD はそのレベル (1)。レベルの分からない物
     * (貼り付けの時からある MOD など) とは比べられないので、レベルの分かる物の中の一番低い物。全部分からなければその中からランダム
     */
    const rmLowest = (st: SimState): SimState => {
      const rem = removable(st, null);
      if (!rem.length) return st;
      const lvOf = (r: number): number | undefined => (r === -1 ? breachLvl : st.slots[r]!.lvl);
      const known = rem.filter((r) => lvOf(r) != null);
      if (!known.length) return removeAt(st, rem[Math.floor(rnd() * rem.length)]!);
      const lo = Math.min(...known.map((r) => lvOf(r)!));
      const ties = known.filter((r) => lvOf(r) === lo);
      return removeAt(st, ties[Math.floor(rnd() * ties.length)]!);
    };
    switch (a.kind) {
      case "chaos": {
        const t = rmRandom(s, a.side ?? null);
        return land(t, pick(roll(t, SIDES.filter((x) => room(t, x)), FLOOR[a.tier]!, null, 20)));
      }
      case "exalt": {
        // 触媒の高貴のお告げ: 品質を上限まで入れ直してから打ち、打った後は品質 0 (全部使う。2026-09-24 まで使っても残る扱いで、
        // 2 回目以降の触媒が只になっていた)
        const q = a.catalyst ? Math.max(quality(s), catalystQuality(s, a.catalyst)) : 0;
        const one = (st: SimState): SimState => {
          const sides = a.side ? [a.side] : SIDES.filter((x) => room(st, x));
          return sides.length && sides.every((x) => room(st, x)) ? land(st, pick(roll(st, sides, FLOOR[a.tier]!, a.catalyst, q))) : st;
        };
        const out = greaterOn(s, a) ? one(one(s)) : one(s);
        return a.catalyst ? { ...out, quality: 0, qualityTag: a.catalyst } : out;
      }
      case "annul": return rmRandom(s, a.side);
      case "essence": {
        const side = mod(a.modId)?.type as Side;
        const rs = removeSideOf(s, a);
        const t = removable(s, rs).length ? s : land(s, pick(roll(s, [rs], 0, null, 20)));
        const u = rmRandom(t, rs);
        const em = mod(a.modId);
        return { ...u, slots: [...u.slots, { modId: a.modId, side, fixed: false, crafted: true, ...(em ? { family: em.family, lvl: em.tiers[0]?.ilvl ?? 1 } : {}) }] };
      }
      case "desecrate": {
        // 満杯の側なら、固定済みでない MOD が 1 つ冒涜 MOD に置き換わる
        const base0 = room(s, a.side) ? s : rmRandom(s, a.side);
        // 3 択 (別々の MOD) を引き、狙いの段が出ていればそれを選ぶ。無ければ反響で 1 回引き直し。外れは最初の選択肢を付ける
        const { opts } = desecrateOpts(base0, n, a);
        type Drawn = { o: DesecOpt; lvl: number; good: boolean };
        const draw3 = (): Drawn[] => {
          const left = [...opts];
          const got: Drawn[] = [];
          for (let i = 0; i < 3 && left.length; i++) {
            let u = rnd() * left.reduce((x, o) => x + o.w, 0), j = 0;
            for (; j < left.length - 1 && u >= left[j]!.w; j++) u -= left[j]!.w;
            const o = left.splice(j, 1)[0]!;
            let v = rnd() * o.w, ti = 0;
            for (; ti < o.tiers.length - 1 && v >= o.tiers[ti]!.w; ti++) v -= o.tiers[ti]!.w;
            const tr = o.tiers[ti]!;
            got.push({ o, lvl: tr.lvl, good: tr.good });
          }
          return got;
        };
        let three = draw3();
        if (a.echoes && !three.some((x) => x.good)) three = draw3();
        const win = three.find((x) => x.good);
        const first = three[0];
        const slot: SimSlot = win
          ? { modId: win.o.id, side: a.side, fixed: false, desec: true, family: win.o.family, lvl: win.lvl }
          : { modId: null, side: a.side, fixed: false, desecrated: true, desec: true, ...(first ? { family: first.o.family, lvl: first.lvl } : {}) };
        return { ...base0, slots: [...base0.slots, slot] };
      }
      case "light": {
        const i = s.slots.findIndex((x) => x.desecrated);
        return i >= 0 ? removeAt(s, i) : s;
      }
      case "breach": {
        const rs = a.removeSide ?? "prefix";
        const t = removable(s, rs).length ? s : land(s, pick(roll(s, [rs], 0, null, 20)));
        return { ...rmRandom(t, rs), breach: true };
      }
      case "whittle": {
        // 一番レベルの低い物 (ブリーチの MOD はそのレベル 1。同じレベルの物があれば等しく) を消して 1 つ付く
        const t = rmLowest(s);
        return land(t, pick(roll(t, SIDES.filter((x) => room(t, x)), 0, null, 20)));
      }
      case "check": return s;
      case "quality": return { ...s, quality: Math.max(quality(s), s.qualityTag === a.catalyst ? s.quality ?? 0 : 0), qualityTag: a.catalyst };
    }
  }

  return { roll, usable, priceOf, omenNeeded, apply, passes, targetsMet, desecrateOdds, removable, room, has, hasJunk, breachKept, breachSpent, cur, mod };
}
