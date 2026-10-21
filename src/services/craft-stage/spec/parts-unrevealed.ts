/**
 * 動作の部品のうち、未発現の冒涜 MOD を足す・発現する物 (2026-10-22 に parts.ts から移した、中身はそのまま)。
 * 乱数の引き方の約束は parts.ts の頭と同じ (tests/currency-spec-golden.test.ts の控えで見張る)
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { DESECRATION_EXCLUSIVE_COUNT } from "../../../vendor/poe2htc/engine/probability";
import { allMods, candidates, effectiveCls, makeStageMod, pickWeighted, removeOne, replaced, room, SIDES, skip, skipRandom, withMod, without, type Candidate } from "../stage-core";
import type { StageApply, StageItem, StageMod, StageSide } from "../types";
import type { Action, ModPool } from "./types";
import type { Mods, PartCtx } from "./parts";
import { markFloorOf } from "./desecrate-specs";
import { jaOfOmen } from "../../htc/game-names";
import { tr } from "../../../i18n/lang";

const POOL_ORDER: readonly ModPool[] = ["normal", "desecrated", "otherworldly"];
/** 置き場の MOD の id (同じ MOD を 2 回数えない: 置き場が重なっていると重みが倍になる)。普通の置き場は特殊 MOD のルーン込み (要望 ㉙) */
function poolIds(item: StageItem, pools: readonly ModPool[], side: StageSide): string[] {
  const k = side === "prefix" ? "prefixes" : "suffixes";
  const ids: string[] = [];
  for (const p of POOL_ORDER) {
    if (!pools.includes(p)) continue;
    if (p === "normal") ids.push(...effectiveCls(item).pools.normal[k]);
    else if (p === "desecrated") ids.push(...item.cls.pools.desecrated[k]);
    else ids.push(...(item.cls.pools.otherworldly?.[k] ?? []));
  }
  return [...new Set(ids)];
}
/** 冒涜専用の MOD (冒涜の置き場の物と異界の MOD) */
const exclusiveTest = (item: StageItem, side: StageSide) => {
  const other = new Set(item.cls.pools.otherworldly?.[side === "prefix" ? "prefixes" : "suffixes"] ?? []);
  return (mod: { id: string; source?: string }): boolean => mod.source === "desecrated" || other.has(mod.id);
};
interface PoolArgs { pools: readonly ModPool[]; floor: number; exclusiveAnyLevel: boolean; tag: string | null; except?: StageMod }
/** 発現の候補の置き場。tag (勢力の保証) があれば、そのタグの MOD だけを MOD ごとに等しく (2026-10-10 オーナー「等しい確率」) */
function pool(data: PatchData, item: StageItem, side: StageSide, a: PoolArgs): Candidate[] {
  const c = candidates(data, item, [side], a.floor, { pools: () => poolIds(item, a.pools, side), except: a.except, ...(a.exclusiveAnyLevel ? { anyLevel: exclusiveTest(item, side) } : {}) });
  if (!a.tag) return c;
  return c.filter((x) => x.mod.tags.includes(a.tag!)).map((x) => ({ ...x, w: 1 }));
}
const sumW = (xs: readonly { w: number }[]): number => xs.reduce((a, x) => a + x.w, 0);
/**
 * 勢力のお告げで発現に出うる、そのアイテムのその勢力の MOD (骨の置き場をタグで絞る。発現の候補と同じ pool)。
 * チュートリアルの一覧に出す (2026-10-17 オーナー「アマナムとか付ける時はそのアイテムのアマナムだけ一覧で出してあげたらいい」)
 */
export function factionCandidates(data: PatchData, item: StageItem, tag: string, floor = 0): Candidate[] {
  return SIDES.flatMap((side) => pool(data, item, side, { pools: ["normal", "desecrated"], floor, exclusiveAnyLevel: true, tag }));
}

export const unrevealedMod = (side: StageSide, u: NonNullable<StageMod["unrevealed"]>): StageMod => ({
  modId: "unrevealed", family: "unrevealed", side, tierIndex: 0, tierName: "", affix: "", modLevel: 1,
  values: [], ranges: [], textJa: `未発現の冒涜 MOD (${side === "prefix" ? "プレフィックス" : "サフィックス"})`,
  textEn: `Unrevealed Desecrated ${side === "prefix" ? "Prefix" : "Suffix"}`,
  desecrated: true, unrevealed: u,
});

export type AddUnrevealed = Extract<Action, { addUnrevealed: unknown }>["addUnrevealed"];
/**
 * 未発現の冒涜 MOD をどの側に付けるか (打つ処理と確率表 held-odds.ts の骨が同じ物を使う)。
 *   - 深淵の王の印 (固定していない物) があれば、必ず印を置き換える。側は印の側、段の下限はアイテムレベル × 0.4 の切り捨て (markFloorOf、用語集 MarkofAbyssalLord)
 *   - 側: お告げ → それ (fixed)。無ければ両側が空いていれば半々 (空きが 1 つなら抽選しない)。両側が埋まっていれば、固定以外の MOD を全部から等しく 1 つ消して、
 *     その側 (= 側ごとの重みは消せる MOD の数)。2026-10-16 Craft of Exile の poe2_desecrate に合わせる (オーナー「書いていない所はランダム」)
 *   - その側で出うる MOD が無い側は選ばない (重み 0)
 *   - 勢力の保証で、その勢力の MOD がどの空いた側にも無ければ、普通の MOD の重みで選ぶ (発現は普通の MOD 3 つ。フォーラム 3956293)
 */
export interface UnrevealedPlan {
  mark: StageMod | undefined;
  floor: number;
  fixed: StageSide | null;
  /** 側ごとの選ばれ方 (fixed ならその側だけ)。w = 0 はその側に付けられる MOD が無い */
  weights: Array<{ s: StageSide; w: number }>;
}
export function unrevealedPlan(data: PatchData, item: StageItem, a: AddUnrevealed, mods: Mods): UnrevealedPlan {
  const mark = allMods(item).find((m) => m.abyssMark && !m.fractured);
  const floor = Math.max(a.floor, mark ? markFloorOf(item.itemLevel) : 0);
  const fixed: StageSide | null = mark ? mark.side : mods.side;
  const args = (tag: string | null, plain: boolean): PoolArgs => ({ pools: plain ? ["normal"] : a.pools, floor, exclusiveAnyLevel: a.exclusiveAnyLevel, tag });
  const tagW = (side: StageSide) => sumW(pool(data, item, side, args(mods.guaranteeTag, false)));
  const open = SIDES.filter((s) => room(item, s));
  const noTag = !!mods.guaranteeTag && !(open.length ? open : SIDES).some((s) => tagW(s) > 0);
  const weightOf = (side: StageSide) => (noTag ? sumW(pool(data, item, side, args(null, true))) : tagW(side));
  const sides = fixed ? [fixed] : open.length ? open : SIDES;
  const share = (s: StageSide): number => (fixed || open.length ? 1 : allMods(item).filter((m) => !m.fractured && m.side === s).length);
  return { mark, floor, fixed, weights: sides.map((s) => ({ s, w: weightOf(s) > 0 ? share(s) : 0 })) };
}
/** 未発現の冒涜 MOD を 1 つ足す (側は unrevealedPlan)。選んだ側が満杯なら、その側の固定以外を等しく 1 つ消してから付ける */
export function addUnrevealed(ctx: PartCtx, item: StageItem, a: AddUnrevealed): StageApply {
  if (a.fill) return fillUnrevealed(ctx, item, a);
  const { data, rng, mods } = ctx;
  const { mark, floor, fixed, weights } = unrevealedPlan(data, item, a, mods);
  let side: StageSide;
  if (fixed) side = fixed;
  else if (weights.length === 1) {
    if (!(weights[0]!.w > 0)) return skip(item, tr("付けられる冒涜の MOD が無い", "No Desecrated mod can be added"));
    side = weights[0]!.s;
  } else {
    const pick = pickWeighted(weights, rng);
    if (!pick) return skip(item, tr("付けられる冒涜の MOD が無い", "No Desecrated mod can be added"));
    side = pick.s;
  }
  if (!(weights.find((x) => x.s === side)!.w > 0)) return skip(item, tr("その側に付けられる冒涜の MOD が無い", "No Desecrated mod can be added on that side"));
  let cur = item;
  const removed: StageMod[] = [];
  if (mark) {
    cur = without(cur, mark);
    removed.push(mark);
  } else if (!room(cur, side)) {
    const r = removeOne(cur, rng, [side]);
    // 側を重みで選んだ時は、選ばれた側が固定の MOD だけかは当たり所 (お告げで決めた側なら打つ前に分かる)
    if (!r) return (fixed ? skip : skipRandom)(item, tr("その側に空きが無い", "No open slot on that side"));
    cur = r.item;
    removed.push(r.mod);
  }
  const altered = a.pools.includes("otherworldly");
  const hidden = unrevealedMod(side, { floor, altered, faction: mods.guaranteeTag, ...(a.exclusiveAnyLevel ? {} : { gnawed: true }) });
  return { applied: true, item: withMod(cur, hidden), added: [hidden], removed };
}
/** 枠いっぱいまで未発現を足す (腐食のお告げ)。発現は普通の MOD だけ */
function fillUnrevealed(ctx: PartCtx, item: StageItem, a: AddUnrevealed): StageApply {
  const u = { floor: a.floor, altered: ctx.altered, faction: null, plain: true };
  let cur = item;
  const added: StageMod[] = [];
  for (const side of SIDES) {
    while (room(cur, side)) {
      const m = unrevealedMod(side, u);
      cur = withMod(cur, m);
      added.push(m);
    }
  }
  return { applied: true, item: cur, added, removed: [] };
}

/** 発現の候補の数の割合 (冒涜専用の MOD が 1 / 2 / 3 個) */
const EXCLUSIVE_RATES = DESECRATION_EXCLUSIVE_COUNT.map((c) => c.rate);
/** 同じ発現に同じ系統は 2 つ出ない (Craft of Exile の getRevealPicks も同じ MOD グループを候補から外す: filterRollablePoolForModTiers、2026-10-16) */
const famsOf = (c: Candidate): string[] => [...(c.mod.families ?? [c.mod.family])];
const notClashing = (rest: Candidate[], c: Candidate): Candidate[] => {
  const f = new Set(famsOf(c));
  return rest.filter((x) => x !== c && !famsOf(x).some((y) => f.has(y)));
};
/**
 * 発現の候補 offers 個 (引き直す時はもう 1 組)。組み方:
 *   - 勢力の保証: その勢力の MOD を等しく offers 個まで、足りない分は普通の MOD を普通の重みで (説明文「保証」、2026-10-11 オーナー)
 *   - 普通の MOD だけ (腐食) / 冒涜専用の MOD が出せない: 1 つの置き場から重みで
 *   - それ以外: 専用 MOD の個数を EXCLUSIVE_RATES で決め、その数を専用 MOD から重みで、残りを普通の MOD から。並びは混ぜる
 */
export function drawOffers(data: PatchData, item: StageItem, hidden: StageMod, rng: () => number, offers: number, sets: number): { sets: StageMod[][]; chances: Map<StageMod, number> } {
  const u = hidden.unrevealed!;
  const pools: ModPool[] = ["normal", "desecrated", ...(u.altered ? (["otherworldly"] as const) : [])];
  const base = { floor: u.floor, exclusiveAnyLevel: !u.gnawed, except: hidden };
  const P = (tag: string | null, plain: boolean): Candidate[] => pool(data, item, hidden.side, { ...base, pools: plain ? ["normal"] : pools, tag });
  // 候補に出た瞬間の確率 = その段の重み ÷ 引いた置き場の全部の重み
  const chances = new Map<StageMod, number>();
  const shareOf = new Map<Candidate, number>();
  const take = (from: Candidate[]): Candidate => {
    const c = pickWeighted(from, rng)!;
    shareOf.set(c, c.w / (sumW(from) || 1));
    return c;
  };
  const toMod = (c: Candidate): StageMod => {
    const t = pickWeighted(c.tiers, rng)!;
    const m: StageMod = { ...makeStageMod(c.mod, c.side, t.index, rng), desecrated: true };
    chances.set(m, (shareOf.get(c) ?? 0) * (t.w / (sumW(c.tiers) || 1)));
    return m;
  };
  const drawTag = (): StageMod[] => {
    let fac = P(u.faction, false);
    let normal = P(null, true);
    const picked: Candidate[] = [];
    while (picked.length < offers && fac.length) {
      const c = take(fac);
      picked.push(c);
      fac = notClashing(fac, c);
      normal = notClashing(normal, c);
    }
    while (picked.length < offers && normal.length) {
      const c = take(normal);
      picked.push(c);
      normal = notClashing(normal, c);
    }
    return picked.map(toMod);
  };
  const drawOne = (): StageMod[] => {
    let rest = P(u.faction, !!u.plain);
    const out: StageMod[] = [];
    for (let i = 0; i < offers && rest.length; i++) {
      const c = take(rest);
      rest = notClashing(rest, c);
      out.push(toMod(c));
    }
    return out;
  };
  const draw = (): StageMod[] => {
    if (u.faction) return drawTag();
    if (u.plain) return drawOne();
    const all = P(null, false);
    const exclusive = exclusiveTest(item, hidden.side);
    const isEx = (c: Candidate) => exclusive(c.mod);
    let ex = all.filter(isEx);
    let normal = all.filter((c) => !isEx(c));
    if (!ex.length) return drawOne();
    const x = rng();
    let want = EXCLUSIVE_RATES.length;
    for (let i = 0, acc = 0; i < EXCLUSIVE_RATES.length; i++) { acc += EXCLUSIVE_RATES[i]!; if (x < acc) { want = i + 1; break; } }
    const picked: Candidate[] = [];
    for (let i = 0; i < want && ex.length; i++) {
      const c = take(ex);
      picked.push(c);
      ex = notClashing(ex, c);
      normal = notClashing(normal, c);
    }
    while (picked.length < offers && (normal.length || ex.length)) {
      const c = normal.length ? take(normal) : take(ex);
      picked.push(c);
      normal = notClashing(normal, c);
      ex = notClashing(ex, c);
    }
    for (let i = picked.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [picked[i], picked[j]] = [picked[j]!, picked[i]!];
    }
    return picked.map(toMod);
  };
  const out: StageMod[][] = [];
  for (let i = 0; i < sets; i++) out.push(draw());
  return { sets: out, chances };
}

/** 発現: 候補から選んだ物で未発現の枠を置き換える。引き直しはお告げ (rerolls) がある時だけ */
export function reveal(ctx: PartCtx, item: StageItem, a: { offers: number }): StageApply {
  const hidden = allMods(item).find((m) => m.unrevealed)!;
  const r = ctx.reveal;
  if (!r || "invalid" in r) return skip(item, tr(`発現の手の形が違う (${r && "invalid" in r ? r.invalid : ""})`, `Invalid reveal step (${r && "invalid" in r ? r.invalid : ""})`));
  if (r.reroll && ctx.mods.rerolls < 1) return skip(item, tr(`引き直しには${jaOfOmen("OmenofAbyssalEchoes") ?? "アビスの反響のお告げ"}が要る`, "Rerolling needs Omen of Abyssal Echoes"));
  const { sets, chances } = drawOffers(ctx.data, item, hidden, ctx.rng, a.offers, r.reroll ? 2 : 1);
  const pick = sets[r.reroll ? 1 : 0]![r.index - 1];
  if (!pick) return skipRandom(item, tr("その番号の候補が無い", "No option with that number"));
  const chance = chances.get(pick);
  return { applied: true, item: replaced(item, hidden, pick), added: [pick], removed: [hidden], ...(chance != null ? { rolled: [{ modId: pick.modId, tierName: pick.tierName, chance }] } : {}) };
}
