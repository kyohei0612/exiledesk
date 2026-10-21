/**
 * クラフトステージ: 付けられる MOD の候補・重みの抽選・1 つ足す / 消す (2026-10-22 に stage-core.ts から移した、中身はそのまま)。
 * 呼ぶ側は今まで通り stage-core から読める (stage-core が再輸出)
 */
import type { Mod, PatchData } from "../../vendor/poe2htc/engine/types";
import { modTierWeights } from "../../vendor/poe2htc/engine/pool";
import { weightScaleOf } from "./stage-tuning";
import { familyBlocked } from "../mods/mod-rules";
import { allMods, effectiveCls, makeStageMod, room, SIDES, takenFamilies, withMod, withValues, without } from "./stage-core";
import type { StageItem, StageMod, StageSide } from "./types";
import { tr } from "../../i18n/lang";

/** 付けられる MOD の候補 (側ごとの置き場から、付いている系統を除き、段の重み > 0 の物) */
export interface Candidate { mod: Mod; side: StageSide; tiers: Array<{ index: number; w: number }>; w: number }
export interface PoolOpts {
  /** 引く置き場 (既定は普通の MOD) */
  pools?: (side: StageSide) => readonly string[];
  /** 重みを掛ける MOD (触媒の高貴のお告げ: 品質の種類の MOD) */
  boost?: { test: (mod: Mod) => boolean; mult: number };
  /** 系統の比較で除く MOD (発現で差し替える未発現の枠) */
  except?: StageMod;
  /** アイテムレベルを見ない MOD (冒涜専用の MOD は保存された / 古びた / 変質した骨ならアイテムレベルに関わらず全部の段が出る。apply-desecrate.ts) */
  anyLevel?: (mod: Mod) => boolean;
}
export function candidates(data: PatchData, item: StageItem, sides: readonly StageSide[], floor: number, o: PoolOpts = {}): Candidate[] {
  const taken = takenFamilies(data, item, o.except);
  const out: Candidate[] = [];
  for (const side of sides) {
    const ids = o.pools ? o.pools(side) : effectiveCls(item).pools.normal[side === "prefix" ? "prefixes" : "suffixes"];
    for (const id of ids) {
      const mod = data.mods.get(id);
      if (!mod || familyBlocked(mod, taken)) continue;
      // 使う人が直した重み (stage-tuning.ts、直していなければ 1) × 触媒の高貴
      const k = (o.boost?.test(mod) ? o.boost.mult : 1) * weightScaleOf(mod);
      // 下限 (上級・完全・古代の骨) より上の段が 1 つも無い系統は、一番上の段だけ残す (用語集 BetterCurrencyMinimumLevel、要望 ㉝ の 2)
      const lv = o.anyLevel?.(mod) ? Infinity : item.itemLevel;
      const tiers = modTierWeights(mod, floor, lv).map((t) => ({ index: t.index, w: t.w * k }));
      const w = tiers.reduce((a, t) => a + t.w, 0);
      if (w > 0) out.push({ mod, side, tiers, w });
    }
  }
  return out;
}
export function pickWeighted<T extends { w: number }>(xs: readonly T[], rng: () => number): T | null {
  const total = xs.reduce((a, x) => a + x.w, 0);
  if (!(total > 0)) return null;
  let u = rng() * total;
  for (const x of xs) {
    if (u < x.w) return x;
    u -= x.w;
  }
  return xs[xs.length - 1] ?? null;
}

/** MOD を 1 つ引いて付ける (sides は足してよい側。既定は枠のある側全部。付けられなければ null) */
export function addOne(data: PatchData, item: StageItem, floor: number, rng: () => number, o: PoolOpts & { sides?: readonly StageSide[] } = {}): { item: StageItem; mod: StageMod; chance: number } | null {
  const sides = (o.sides ?? SIDES).filter((s) => room(item, s));
  const cs = candidates(data, item, sides, floor, o);
  const c = pickWeighted(cs, rng);
  if (!c) return null;
  const t = pickWeighted(c.tiers, rng)!;
  const sm = makeStageMod(c.mod, c.side, t.index, rng);
  // この段が付く確率 = その段の重み ÷ この手で付きうる全部の重み (履歴に「付いた瞬間に何 % だったか」を出す。2026-10-09 オーナー)
  const total = cs.reduce((a, x) => a + x.w, 0);
  return { item: withMod(item, sm), mod: sm, chance: total > 0 ? t.w / total : 0 };
}
/**
 * 付く MOD の指名 (POE2Tube 要望 ⑱-1 kyohei「MOD を自分で選んで組み合わせる機能いるんじゃね？」)。
 * mod = MOD の id (Rings/ColdResistance) か系統 (ColdResistance)、tier = "T6" (無ければ段は乱数)、values = 数値 (画面の単位、無ければ乱数)
 */
export interface Force {
  mod: string; tier?: string; values?: number[];
  /** 固定済みで付ける (始めの状態だけ。シミュレーションの「付いた状態で始める」、2026-10-05) */
  fractured?: boolean;
  /** 冒涜の MOD として付ける (始めの状態だけ。冒涜の置き場から。2026-10-06 オーナー「フラクチャーと冒涜とかで選択できるようにボタン追加」) */
  desecrated?: boolean;
}
/** 指名した MOD と、指名しなかったら付く確率 (その段 (段を指名しなければその MOD) の重み ÷ その手で付きうる全部の重み) */
export interface Forced { item: StageItem; mod: StageMod; chance: number }
const matchesMod = (mod: Mod, key: string): boolean => mod.id === key || mod.id.endsWith(`/${key}`) || mod.family === key;
/**
 * 指名した MOD を付ける。**その時点で本当に付きうる物だけ** (乱数の時と同じ候補: 空き枠・同系統・アイテムレベル・強さの下限・重み > 0)。
 * 付けられなければ { error: 理由 }
 */
export function addForced(data: PatchData, item: StageItem, floor: number, rng: () => number, force: Force, o: PoolOpts & { sides?: readonly StageSide[] } = {}): Forced | { error: string } {
  const sides = (o.sides ?? SIDES).filter((s) => room(item, s));
  if (!sides.length) return { error: tr("足す枠が無い", "No open affix slot") };
  const cands = candidates(data, item, sides, floor, o);
  const total = cands.reduce((a, c) => a + c.w, 0);
  const c = cands.find((x) => matchesMod(x.mod, force.mod));
  if (!c) {
    const any = [...data.mods.values()].find((m) => matchesMod(m, force.mod));
    if (!any) return { error: tr(`${force.mod} という MOD が無い`, `No mod named ${force.mod}`) };
    // 理由を 1 つに絞る (中の名前は出さない。2026-10-08 使い倒しテスト)
    const side: StageSide = any.type === "suffix" ? "suffix" : "prefix";
    const sideJa = side === "prefix" ? "プレフィックス" : "サフィックス";
    if (!sides.includes(side)) return { error: item.rarity === "magic"
      ? tr(`マジックは${sideJa} 1 つまで (先にもう片方の側を付けるとレアになる)`, `Magic: 1 ${side} max (add the other side first to make it Rare)`)
      : tr(`${sideJa}の枠が埋まっている`, `${side === "prefix" ? "Prefixes" : "Suffixes"} are full`) };
    if (familyBlocked(any, takenFamilies(data, item))) return { error: tr("同じ系統の MOD が付いている", "A mod of the same group is already on the item") };
    if (!any.tiers.some((t) => t.ilvl <= item.itemLevel)) return { error: tr("このアイテムレベルでは付かない", "Can't roll at this Item Level") };
    return { error: tr("この手では付かない (強さの下限より弱い段しか無い)", "Can't roll with this currency (only tiers below its minimum)") };
  }
  let t: { index: number; w: number } | undefined;
  if (force.tier) {
    const n = Number(/^T(\d+)$/i.exec(force.tier)?.[1]);
    const index = c.mod.tiers.length - n;
    t = c.tiers.find((x) => x.index === index);
    if (!t) return { error: tr(`${force.mod} の ${force.tier} はこの手では付かない (アイテムレベル ${item.itemLevel}・強さの下限 ${floor})`, `${force.mod} ${force.tier} can't roll with this currency (Item Level ${item.itemLevel}, minimum level ${floor})`) };
  } else {
    t = pickWeighted(c.tiers, rng)!;
  }
  let sm = makeStageMod(c.mod, c.side, t.index, rng);
  if (force.values) {
    const bad = force.values.findIndex((v, i) => { const r = sm.ranges[i]; return !r || v < Math.min(r[0]!, r[1]!) || v > Math.max(r[0]!, r[1]!); });
    if (bad >= 0) return { error: tr(`${force.mod} の数値 ${force.values[bad]} がティアの範囲 (${sm.ranges[bad]?.join("〜") ?? "無し"}) の外`, `${force.mod} value ${force.values[bad]} is outside the tier range (${sm.ranges[bad]?.join("-") ?? "none"})`) };
    sm = withValues(sm, c.mod, rng, force.values);
  }
  const chance = total > 0 ? (force.tier ? t.w : c.w) / total : 0;
  return { item: withMod(item, sm), mod: sm, chance };
}
/** 消える MOD の指名 (カオスの remove)。固定済み (フラクチャー) は消せない */
export function removeForced(item: StageItem, key: string): { item: StageItem; mod: StageMod } | { error: string } {
  const m = allMods(item).find((x) => (x.modId === key || x.modId.endsWith(`/${key}`) || x.family === key));
  if (!m) return { error: tr(`${key} は付いていない`, `${key} isn't on the item`) };
  if (m.fractured) return { error: tr(`${key} は固定済み (フラクチャー) で消せない`, `${key} is Fractured and can't be removed`) };
  return { item: without(item, m), mod: m };
}

/** 固定済み (フラクチャー) 以外から等しく 1 つ消す。sides で側を絞れる (お告げ) */
export function removeOne(item: StageItem, rng: () => number, sides: readonly StageSide[] = SIDES): { item: StageItem; mod: StageMod } | null {
  const rem = allMods(item).filter((m) => !m.fractured && sides.includes(m.side));
  if (!rem.length) return null;
  const mod = rem[Math.floor(rng() * rem.length)]!;
  return { item: without(item, mod), mod };
}
