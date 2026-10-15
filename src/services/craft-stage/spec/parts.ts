/**
 * 動作の部品 (2026-10-16、ADR-004)。部品は「何をするか」だけを持ち、カレンシーの名前・部位の名前で分けない。
 * お告げの効き目は Mods (側・保証する勢力・引き直し・消す物の絞り・普通の MOD だけ) で渡す。
 *
 * 乱数の引き方は今の関数 (apply-desecrate.ts の applyBone / revealOffers / putrefy、apply-currency.ts の消去) と同じ順にしてある:
 * 同じ種なら同じ結果 (tests/currency-spec-parity.test.ts で突き合わせ)。違う引き方にする時は、先にどちらが正しいかを決めてから
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { DESECRATION_EXCLUSIVE_COUNT } from "../../../vendor/poe2htc/engine/probability";
import { allMods, candidates, effectiveCls, makeStageMod, pickWeighted, removeOne, replaced, room, SIDES, skip, skipRandom, withMod, without, type Candidate } from "../stage-core";
import type { StageApply, StageItem, StageMod, StageSide } from "../types";
import type { Action, ModPool } from "./types";
import { MARK_FLOOR } from "./desecrate-specs";
import { jaOfOmen } from "../../htc/labels";
import { tr } from "../../../i18n/lang";

/** お告げで変わった分 (掛かっていなければ null / 0 / false) */
export interface Mods {
  side: StageSide | null;
  guaranteeTag: string | null;
  rerolls: number;
  pick: "desecrated" | null;
  /** 発現は普通の MOD だけ (腐食のお告げ) */
  plain: boolean;
}
export interface PartCtx {
  data: PatchData;
  rng: () => number;
  mods: Mods;
  /** 骨が異界の MOD も出す種類か (腐食のお告げで置き換えた時も、未発現の記録には骨の種類を残す) */
  altered: boolean;
  /** 発現の手の指定 (reveal:N / reveal:N:reroll) */
  reveal: { index: number; reroll: boolean } | { invalid: string } | null;
}

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

const unrevealedMod = (side: StageSide, u: NonNullable<StageMod["unrevealed"]>): StageMod => ({
  modId: "unrevealed", family: "unrevealed", side, tierIndex: 0, tierName: "", affix: "", modLevel: 1,
  values: [], ranges: [], textJa: `未発現の冒涜 MOD (${side === "prefix" ? "プレフィックス" : "サフィックス"})`,
  textEn: `Unrevealed Desecrated ${side === "prefix" ? "Prefix" : "Suffix"}`,
  desecrated: true, unrevealed: u,
});

type AddUnrevealed = Extract<Action, { addUnrevealed: unknown }>["addUnrevealed"];
/**
 * 未発現の冒涜 MOD を 1 つ足す。
 *   - 深淵の王の印 (固定していない物) があれば、必ず印を置き換える。側は印の側、段の下限は MARK_FLOOR (用語集 MarkofAbyssalLord)
 *   - 側: お告げ → それ。無ければ空いている側から、その側で出うる MOD の重みの和で選ぶ (空きが 1 つなら抽選しない)。両側が埋まっていれば両側から
 *   - 勢力の保証で、その勢力の MOD がどの空いた側にも無ければ、普通の MOD の重みで選ぶ (発現は普通の MOD 3 つ。フォーラム 3956293)
 *   - 選んだ側が満杯なら、その側の固定以外を等しく 1 つ消してから付ける
 */
function addUnrevealed(ctx: PartCtx, item: StageItem, a: AddUnrevealed): StageApply {
  if (a.fill) return fillUnrevealed(ctx, item, a);
  const { data, rng, mods } = ctx;
  const mark = allMods(item).find((m) => m.abyssMark && !m.fractured);
  const floor = Math.max(a.floor, mark ? MARK_FLOOR : 0);
  const omenSide: StageSide | null = mark ? mark.side : mods.side;
  const args = (tag: string | null, plain: boolean): PoolArgs => ({ pools: plain ? ["normal"] : a.pools, floor, exclusiveAnyLevel: a.exclusiveAnyLevel, tag });
  const tagW = (side: StageSide) => sumW(pool(data, item, side, args(mods.guaranteeTag, false)));
  const open = SIDES.filter((s) => room(item, s));
  const noTag = !!mods.guaranteeTag && !(open.length ? open : SIDES).some((s) => tagW(s) > 0);
  const weightOf = (side: StageSide) => (noTag ? sumW(pool(data, item, side, args(null, true))) : tagW(side));
  let side: StageSide;
  if (omenSide) side = omenSide;
  else if (open.length === 1) {
    if (!(weightOf(open[0]!) > 0)) return skip(item, tr("付けられる冒涜の MOD が無い", "No Desecrated mod can be added"));
    side = open[0]!;
  } else {
    const pick = pickWeighted((open.length ? open : SIDES).map((s) => ({ s, w: weightOf(s) })), rng);
    if (!pick) return skip(item, tr("付けられる冒涜の MOD が無い", "No Desecrated mod can be added"));
    side = pick.s;
  }
  if (!(weightOf(side) > 0)) return skip(item, tr("その側に付けられる冒涜の MOD が無い", "No Desecrated mod can be added on that side"));
  let cur = item;
  const removed: StageMod[] = [];
  if (mark) {
    cur = without(cur, mark);
    removed.push(mark);
  } else if (!room(cur, side)) {
    const r = removeOne(cur, rng, [side]);
    // 側を重みで選んだ時は、選ばれた側が固定の MOD だけかは当たり所 (お告げで決めた側なら打つ前に分かる)
    if (!r) return (omenSide ? skip : skipRandom)(item, tr("その側に空きが無い", "No open slot on that side"));
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
/** 同じ発現に同じ系統は 2 つ出ない (仮、2026-10-14 総点検の 14) */
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
function reveal(ctx: PartCtx, item: StageItem, a: { offers: number }): StageApply {
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

type Remove = Extract<Action, { remove: unknown }>["remove"];
/** 固定以外から消す。冒涜だけ (光のお告げ) の時は側のお告げを見ない (今の作り、オーナー確認待ち) */
function remove(ctx: PartCtx, item: StageItem, a: Remove): StageApply {
  if (a.n === "all") {
    const removed = allMods(item).filter((m) => !m.fractured);
    return { applied: true, item: { ...item, prefixes: item.prefixes.filter((m) => m.fractured), suffixes: item.suffixes.filter((m) => m.fractured) }, added: [], removed };
  }
  const pick = ctx.mods.pick ?? a.pick;
  if (pick === "desecrated") {
    const ds = allMods(item).filter((m) => m.desecrated && !m.fractured);
    if (!ds.length) return skip(item, tr("光のお告げ: 冒涜の MOD が無い", "Omen of Light: no Desecrated mod"));
    // 冒涜の MOD は 1 つまでなので、ふつうは 1 つから選ぶ (乱数を使わない)
    const d = ds.length === 1 ? ds[0]! : ds[Math.floor(ctx.rng() * ds.length)]!;
    return { applied: true, item: without(item, d), added: [], removed: [d] };
  }
  const side = ctx.mods.side;
  let cur = item;
  const removed: StageMod[] = [];
  for (let i = 0; i < a.n; i++) {
    const r = removeOne(cur, ctx.rng, side ? [side] : SIDES);
    if (!r) break;
    cur = r.item;
    removed.push(r.mod);
  }
  if (!removed.length) return skip(item, side ? tr("お告げの側に外せる MOD が無い", "No removable mod on the Omen's side") : tr("外せる MOD が無い", "No mod can be removed"));
  return { applied: true, item: cur, added: [], removed };
}

/** 部品を 1 つ打つ */
export function runPart(ctx: PartCtx, item: StageItem, a: Action): StageApply {
  if ("addUnrevealed" in a) return addUnrevealed(ctx, item, a.addUnrevealed);
  if ("reveal" in a) return reveal(ctx, item, a.reveal);
  if ("remove" in a) return remove(ctx, item, a.remove);
  return { applied: true, item: { ...item, corrupted: true }, added: [], removed: [] };
}
