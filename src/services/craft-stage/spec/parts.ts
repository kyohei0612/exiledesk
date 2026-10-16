/**
 * 動作の部品 (2026-10-16、ADR-004)。部品は「何をするか」だけを持ち、カレンシーの名前・部位の名前で分けない。
 * お告げの効き目は Mods (側・保証する勢力・引き直し・消す物の絞り・普通の MOD だけ) で渡す。
 *
 * 乱数の引き方は、2026-10-16 に外した前の作り (applyBone / putrefy・オーブの switch など) と同じ順にしてある (同じ種なら同じ結果)。
 * 結果は tests/currency-spec-golden.test.ts の控えで見張る。違う引き方にする時は、先にどちらが正しいかを決めてから控えを取り直す
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { DESECRATION_EXCLUSIVE_COUNT } from "../../../vendor/poe2htc/engine/probability";
import { addForced, addOne, allMods, candidates, catalystBoosts, catalystOf, hasExtraCatalyst, removeForced, type Force, effectiveCls, makeStageMod, maxQualityOf, overLimit, pickWeighted, removeOne, replaced, room, SIDES, skip, skipRandom, unfracturable, withMod, withValues, without, type Candidate } from "../stage-core";
import { whittleTargets } from "../apply-currency";
import { catalysingMultiplier } from "../../htc/catalysing-multiplier";
import { QUALITY_PER_CATALYST } from "../../htc/catalysing-setup";
import { htcBaseInfo } from "../../htc/patch";
import { hasImplicitRange } from "../roll-text";
import { applyRune } from "../stage-runes";
import type { StageApply, StageItem, StageMod, StageSide } from "../types";
import type { Action, ModPool } from "./types";
import { MARK_FLOOR } from "./desecrate-specs";
import { jaOfOmen } from "../../htc/labels";
import { tr } from "../../../i18n/lang";

/** お告げで変わった分 (掛かっていなければ null / 0 / false) */
export interface Mods {
  /** 付ける側 (高貴・骨)。付けない手 (消去) では消す側 */
  side: StageSide | null;
  /** 消す側だけ (抹消・結晶化) */
  removeSide: StageSide | null;
  guaranteeTag: string | null;
  rerolls: number;
  pick: "desecrated" | null;
  /** 発現は普通の MOD だけ (腐食のお告げ) */
  plain: boolean;
  /** 足す数 (大いなる高貴) */
  addCount: number | null;
  /** MOD レベルの一番低い物を消す (削り) */
  pickLowest: boolean;
  /** 品質の種類の MOD を重く引いて品質を使い切る (触媒の高貴) */
  catalysing: boolean;
  /** 暗黙の MOD だけ振り直す (祝福) */
  implicitOnly: boolean;
}
export const NO_MODS: Mods = { side: null, removeSide: null, guaranteeTag: null, rerolls: 0, pick: null, plain: false, addCount: null, pickLowest: false, catalysing: false, implicitOnly: false };
export interface PartCtx {
  data: PatchData;
  rng: () => number;
  mods: Mods;
  /** 骨が異界の MOD も出す種類か (腐食のお告げで置き換えた時も、未発現の記録には骨の種類を残す) */
  altered: boolean;
  /** 発現の手の指定 (reveal:N / reveal:N:reroll) */
  reveal: { index: number; reroll: boolean } | { invalid: string } | null;
  /** エッセンスの MOD (打つ前に作る。値は今の関数と同じく消す前に振る) */
  essence?: { mod: StageMod; side: StageSide; clash: (it: StageItem) => boolean } | null;
  /** 触媒の品質の種類 (タグ) */
  catalystTag?: string | null;
  /** 手順の再生: 触媒は 1 手 = 1 個 (手で打つ画面は 1 手で上限まで) */
  oneCatalyst?: boolean;
  /** ルーンの手の鍵 (rune:<英語名>@n) */
  runeKey?: string;
  /** この手で前の部品が消した MOD (深淵の王の印は消した側に付く) */
  removedSoFar: StageMod[];
  /** 付く MOD の指名 (手順の再生、要望 ⑱-1)。足す順。足りない分は乱数。使った数は pickUsed */
  pick?: readonly Force[];
  pickUsed?: number;
  /** 消える MOD の指名 (カオス) */
  removeForce?: string;
}
/** 指名が通らなかった時 (理由つきで打てない、pickError。今の関数と同じ文) */
const pickFail = (item: StageItem, why: string): StageApply => ({ ...skip(item, tr(`指名できない: ${why}`, `Can't force: ${why}`)), pickError: true });

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
/**
 * 固定以外から消す。冒涜だけ (光のお告げ) の時は側のお告げを見ない (今の作り、オーナー確認待ち)。
 * 側: お告げ (抹消・結晶化・左右の消去) → それ。付ける側が埋まっている完全エッセンスは、その側から (sideWhenFull)。
 * 削りのお告げは MOD レベルの一番低い物から (未発現の枠は 1 として数える、apply-currency.ts の whittleTargets)
 */
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
  const nothing: StageApply = { applied: true, item, added: [], removed: [] };
  if (a.ifAny && !allMods(item).length) return nothing;
  const side = ctx.mods.removeSide ?? ctx.mods.side;
  let sides: readonly StageSide[] = side ? [side] : SIDES;
  const e = ctx.essence;
  if (a.sideWhenFull && e && !room(item, e.side)) {
    if (side && side !== e.side) return skip(item, tr("足す側が埋まっているので、お告げの側からは消せない", "The Essence's side is full, so it can't remove from the Omen's side"));
    sides = [e.side];
  }
  let cur = item;
  const removed: StageMod[] = [];
  for (let i = 0; i < a.n; i++) {
    let r: { item: StageItem; mod: StageMod } | null;
    if (ctx.removeForce) {
      // 消える MOD の指名 (要望 ⑱-1)。お告げより先
      const f = removeForced(cur, ctx.removeForce);
      if ("error" in f) return pickFail(item, f.error);
      r = f;
    } else if (ctx.mods.pickLowest) {
      const lows = whittleTargets(cur, side);
      const mod = lows[Math.floor(ctx.rng() * lows.length)];
      r = mod ? { item: without(cur, mod), mod } : null;
    } else r = removeOne(cur, ctx.rng, sides);
    if (!r) break;
    // 上限を超えている側 (侮蔑を外した後のサフィ 3 つ) に当たると付け直せずに弾かれる (2026-10-14 オーナーがゲームで確認、プレに空きがあっても同じ)
    if (a.overLimitVoids && overLimit(cur, r.mod.side)) return skipRandom(item, tr("上限を超えている側に当たったので追加できない (もう一度)", "Hit the side that is over its limit, so nothing can be added (try again)"));
    cur = r.item;
    removed.push(r.mod);
  }
  if (!removed.length) {
    if (a.optional) return nothing;
    return skip(item, side ? tr("お告げの側に外せる MOD が無い", "No removable mod on the Omen's side") : tr("外せる MOD が無い", "No mod can be removed"));
  }
  return { applied: true, item: cur, added: [], removed };
}

type Add = Extract<Action, { add: unknown }>["add"];
/**
 * 普通の MOD の置き場から n 個 (大いなる高貴のお告げで 2 個)。側はお告げの側か両側、空きの無い側には付かない。
 * 候補は付いている系統を除き、アイテムレベル以下・段の下限以上の段の重み (stage-core の addOne = 計算機と同じ)。
 * 触媒の高貴のお告げは品質の種類の MOD を重く引き (catalysingMultiplier)、品質を使い切る
 */
function add(ctx: PartCtx, item: StageItem, a: Add): StageApply {
  const ok = (it: StageItem): StageApply => ({ applied: true, item: it, added: [], removed: [] });
  if (a.emptyOk && !SIDES.some((s) => room(item, s))) return ok(item);
  const n = ctx.mods.addCount ?? a.n;
  const sides = ctx.mods.side ? [ctx.mods.side] : SIDES;
  const { tag, pct } = catalystOf(item);
  const boost = ctx.mods.catalysing && tag ? { test: (m: { id: string; tags?: readonly string[] }) => catalystBoosts(item, { modId: m.id, tags: m.tags }, tag, ctx.data), mult: catalysingMultiplier(pct) } : undefined;
  const pick = ctx.pick?.slice(ctx.pickUsed ?? 0) ?? [];
  if (pick.length > n) return pickFail(item, tr(`この手で付く MOD は ${n} つまで`, `this adds at most ${n} mod${n === 1 ? "" : "s"}`));
  let cur = item;
  const added: StageMod[] = [];
  const rolled: NonNullable<StageApply["rolled"]> = [];
  const picked: NonNullable<StageApply["picked"]> = [];
  for (let i = 0; i < n; i++) {
    const f = pick[i];
    if (f) {
      const r = addForced(ctx.data, cur, a.floor, ctx.rng, f, { sides, boost });
      if ("error" in r) return pickFail(item, r.error);
      ctx.pickUsed = (ctx.pickUsed ?? 0) + 1;
      cur = r.item;
      added.push(r.mod);
      picked.push({ modId: r.mod.modId, tierName: r.mod.tierName, chance: r.chance });
      continue;
    }
    const r = addOne(ctx.data, cur, a.floor, ctx.rng, { sides, boost });
    if (!r) break;
    cur = r.item;
    added.push(r.mod);
    rolled.push({ modId: r.mod.modId, tierName: r.mod.tierName, chance: r.chance });
  }
  if (!added.length) return a.optional ? ok(item) : skip(item, tr("付けられる MOD が無い", "No mod can be added"));
  // 触媒の高貴は品質を使い切る (グラスピングメイルはカタリストの欄だけ)
  if (ctx.mods.catalysing) cur = hasExtraCatalyst(item.base) ? { ...cur, catalystQuality: 0 } : { ...cur, quality: 0 };
  return { applied: true, item: cur, added, removed: [], ...(picked.length ? { picked } : {}), ...(rolled.length ? { rolled } : {}) };
}

/**
 * 数値を振り直す (神のオーブ)。固定・未発現の枠は変わらない。暗黙の MOD の数値も振り直す (poe2db、2026-10-12 オーナー「暗黙も数値の変動はある」)。
 * ユニークは効果の値を振る種 (rollSeed) を変える。祝福のお告げは暗黙だけ
 */
function reroll(ctx: PartCtx, item: StageItem): StageApply {
  const implicit = hasImplicitRange((htcBaseInfo()[item.base]?.implicits ?? []).map((l) => l.en));
  if (ctx.mods.implicitOnly) {
    if (!implicit) return skip(item, tr("振り直せる暗黙 MOD が無い", "No implicit mod to reroll"));
    return { applied: true, item: { ...item, implicitRoll: (item.implicitRoll ?? 0) + 1, implicitFixed: undefined }, added: [], removed: [], note: tr("祝福のお告げ: 暗黙 MOD だけを振り直した", "Omen of the Blessed: rerolled implicit values only") };
  }
  if (item.rarity === "unique") return { applied: true, item: { ...item, rollSeed: 1 + Math.floor(ctx.rng() * 2 ** 30) }, added: [], removed: [], note: tr("ユニークの数値を振り直し", "Rerolled Unique values") };
  const mods = allMods(item).filter((m) => !m.fractured && !m.unrevealed && m.ranges.length);
  if (!mods.length && !implicit) return skip(item, tr("転がし直せる MOD が無い", "No mod to reroll"));
  let cur: StageItem = implicit ? { ...item, implicitRoll: (item.implicitRoll ?? 0) + 1, implicitFixed: undefined } : item;
  const added: StageMod[] = [];
  for (const m of mods) {
    const mod = ctx.data.mods.get(m.modId);
    if (!mod) continue;
    const next = withValues(m, mod, ctx.rng);
    cur = replaced(cur, m, next);
    added.push(next);
  }
  return { applied: true, item: cur, added, removed: mods };
}

/** 固定以外の 1 つを等しく固定する。未発現の枠と冒涜の MOD は選ばれない (stage-core の unfracturable、2026-10-10 オーナーが実測) */
function fracture(ctx: PartCtx, item: StageItem): StageApply {
  const pool = allMods(item).filter((m) => !unfracturable(ctx.data, item, m));
  if (!pool.length) return skip(item, tr("固定できる MOD が無い (冒涜の MOD は固定されない)", "No mod can be Fractured (Desecrated mods can't be)"));
  const m = pool[Math.floor(ctx.rng() * pool.length)]!;
  const next = { ...m, fractured: true };
  // 固定は消えて付いたのではない (＋ と － に同じ MOD が並んで分かりづらかった。2026-10-08 完成判定)
  return { applied: true, item: replaced(item, m, next), added: [next], removed: [] };
}

type AddEssence = Extract<Action, { addEssence: unknown }>["addEssence"];
/**
 * エッセンスの MOD を付ける。ofMod: その MOD の側 (空きが無ければ弾く、クラフト MOD どうしの系統がぶつかれば弾く)。
 * removedSide: 深淵の王の印 = 消した側、消していなければお告げの側か空いている側 (2026-10-03 SaVeQ 0.5.5 / poe2fun)
 */
function addEssence(ctx: PartCtx, item: StageItem, a: AddEssence): StageApply {
  const e = ctx.essence!;
  const gone = ctx.removedSoFar[0];
  if (a.side === "removedSide") {
    const omen = ctx.mods.removeSide;
    if (omen && !gone && !room(item, omen)) return skip(item, tr("お告げの側に外せる MOD も空きも無い", "No removable mod or open slot on the Omen's side"));
    const side: StageSide | undefined = gone ? gone.side : omen ?? SIDES.find((x) => room(item, x));
    if (!side) return skip(item, tr("外せる MOD も空きも無い", "No removable mod or open slot"));
    const mark: StageMod = { ...e.mod, side, abyssMark: true };
    return { applied: true, item: withMod(item, mark), added: [mark], removed: [] };
  }
  if (!room(item, e.side)) return skip(item, tr("足す側に空きが無い", "No open slot on that side"));
  // 消えたのがぶつかる MOD でなかった時だけ (アストリッドで作った MOD が 2 つ以上ある時に当たり所で決まる)
  if (e.clash(item)) return (gone ? skipRandom : skip)(item, tr("同じ系統の MOD が付いている", "A mod of the same group is already on the item"));
  return { applied: true, item: withMod(item, e.mod), added: [e.mod], removed: [] };
}

type Quality = Extract<Action, { quality: unknown }>["quality"];
/** 品質を上げる。上がる量は候補から等分で引く (候補が 1 つなら乱数を使わない)。上限は超えない */
function quality(ctx: PartCtx, item: StageItem, a: Quality): StageApply {
  const step = a.steps.length === 1 ? a.steps[0]! : a.steps[Math.min(a.steps.length - 1, Math.floor(ctx.rng() * a.steps.length))]!;
  return { applied: true, item: { ...item, quality: Math.min(a.max, item.quality + step) }, added: [], removed: [] };
}

/**
 * 触媒の品質: 種類を変えると 0 から (「Replaces other quality types」)。手で打つ画面は 1 手で上限まで (使った数は count)、
 * 手順の再生は 1 手 = 1 個 (2026-10-05 オーナー・要望 ㉜ の 2)。上限はベースの最大品質 + 「品質の最大値 +N%」の MOD
 */
function catalyst(ctx: PartCtx, item: StageItem): StageApply {
  const tag = ctx.catalystTag!;
  const max = maxQualityOf(item);
  // 暗黙でカタリストを許すベース (グラスピングメイル) はベースの品質とは別の欄 (catalystQuality) に入る
  const extra = hasExtraCatalyst(item.base);
  const base = item.qualityTag === tag ? catalystOf(item).pct : 0;
  const put = (n: number): StageItem => (extra ? { ...item, catalystQuality: n, qualityTag: tag } : { ...item, quality: n, qualityTag: tag });
  if (ctx.oneCatalyst) return { applied: true, item: put(Math.min(max, base + QUALITY_PER_CATALYST)), added: [], removed: [] };
  const count = Math.ceil((max - base) / QUALITY_PER_CATALYST);
  return { applied: true, item: put(max), added: [], removed: [], count };
}

/** 部品を 1 つ打つ */
export function runPart(ctx: PartCtx, item: StageItem, a: Action): StageApply {
  if ("addUnrevealed" in a) return addUnrevealed(ctx, item, a.addUnrevealed);
  if ("reveal" in a) return reveal(ctx, item, a.reveal);
  if ("remove" in a) return remove(ctx, item, a.remove);
  if ("setRarity" in a) return { applied: true, item: { ...item, rarity: a.setRarity }, added: [], removed: [] };
  if ("add" in a) return add(ctx, item, a.add);
  if ("reroll" in a) return reroll(ctx, item);
  if ("fracture" in a) return fracture(ctx, item);
  if ("addEssence" in a) return addEssence(ctx, item, a.addEssence);
  if ("quality" in a) return quality(ctx, item, a.quality);
  if ("catalyst" in a) return catalyst(ctx, item);
  if ("addSocket" in a) return { applied: true, item: { ...item, sockets: (item.sockets ?? 0) + 1 }, added: [], removed: [] };
  // ルーンのはめ方は説明文から作った表 (augment-rules.json) に通す今の関数そのまま (部位・数・置き換え・コラプト後も表で決まる)
  if ("socketAugment" in a) return applyRune(item, ctx.runeKey!, ctx.data);
  return { applied: true, item: { ...item, corrupted: true }, added: [], removed: [] };
}
