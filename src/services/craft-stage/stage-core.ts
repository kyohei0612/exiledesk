/**
 * クラフトステージ: 1 手の抽選で共通に使う物 (2026-09-27、ADR-001)
 *
 * 枠・MOD の候補・重みの抽選・数値の転がし・文面への数値の埋め込み。各アイテムの規則は
 * [[apply-currency.ts]] (オーブ) / [[apply-essence.ts]] / [[apply-desecrate.ts]] / [[apply-other.ts]] に置く。
 * 候補の規則は計算機 (sim-route-helpers.ts の roll) と同じ: 付いている系統を除き、アイテムレベル以下・段の下限以上の段の重みで引く。
 */
import type { Mod, PatchData } from "../../vendor/poe2htc/engine/types";
import { familyBlocked, familyKeysOf, rawFamiliesOf } from "../mods/mod-rules";
import { DEFAULT_LIMITS } from "../../vendor/poe2htc/engine/item";
import { jaOfMod } from "../htc/mod-text";
import type { StageApply, StageItem, StageMod, StageSide } from "./types";

export const SIDES: StageSide[] = ["prefix", "suffix"];
const MAGIC_LIMIT = 1;
export const SIDE_JA = { prefix: "プレフィックス", suffix: "サフィックス" } as const;

/** 側の枠 (マジックは 1 / 1) */
export function limitOf(item: StageItem, side: StageSide): number {
  if (item.rarity === "magic") return MAGIC_LIMIT;
  if (item.rarity === "normal") return 0;
  const lim = item.cls.limits ?? DEFAULT_LIMITS;
  return side === "prefix" ? lim.prefixes : lim.suffixes;
}
/** レアにした時の枠 (マジック → レアになる手で見る) */
export function rareLimitOf(item: StageItem, side: StageSide): number {
  const lim = item.cls.limits ?? DEFAULT_LIMITS;
  return side === "prefix" ? lim.prefixes : lim.suffixes;
}
export const listOf = (item: StageItem, side: StageSide): StageMod[] => (side === "prefix" ? item.prefixes : item.suffixes);
export const room = (item: StageItem, side: StageSide): boolean => listOf(item, side).length < limitOf(item, side);
export const allMods = (item: StageItem): StageMod[] => [...item.prefixes, ...item.suffixes];
export const without = (item: StageItem, mod: StageMod): StageItem =>
  ({ ...item, prefixes: item.prefixes.filter((m) => m !== mod), suffixes: item.suffixes.filter((m) => m !== mod) });
export const withMod = (item: StageItem, mod: StageMod): StageItem =>
  (mod.side === "prefix" ? { ...item, prefixes: [...item.prefixes, mod] } : { ...item, suffixes: [...item.suffixes, mod] });
/** mod を next に差し替える (並びはそのまま) */
export const replaced = (item: StageItem, mod: StageMod, next: StageMod): StageItem =>
  ({ ...item, prefixes: item.prefixes.map((m) => (m === mod ? next : m)), suffixes: item.suffixes.map((m) => (m === mod ? next : m)) });

export const skip = (item: StageItem, reason: string): StageApply => ({ applied: false, reason, item, added: [], removed: [] });

/** MOD の系統の鍵 (決まりは services/mods/mod-rules.ts に 1 つ) */
export const familyKeys = familyKeysOf;
/** 付いている MOD の系統 (except は除く。開示の時の未開示の枠など) */
export function takenFamilies(data: PatchData, item: StageItem, except?: StageMod): Set<string> {
  return new Set(allMods(item).filter((m) => m !== except).flatMap((m) => {
    const md = data.mods.get(m.modId);
    return md ? familyKeysOf(md) : [m.family];
  }));
}
/** 付いている MOD の生の系統 (エッセンスを打てるかの判定用) */
export function takenRawFamilies(data: PatchData, item: StageItem): Set<string> {
  return new Set(allMods(item).flatMap((m) => {
    const md = data.mods.get(m.modId);
    return md ? rawFamiliesOf(md) : [m.family];
  }));
}

/** 数値を 1 つ転がす (範囲の両端を含む。小数の範囲は 0.01 刻み) */
function rollValue(min: number, max: number, rng: () => number): number {
  const lo = Math.min(min, max), hi = Math.max(min, max);
  if (Number.isInteger(lo) && Number.isInteger(hi)) return lo + Math.floor(rng() * (hi - lo + 1));
  return Math.round((lo + rng() * (hi - lo)) * 100) / 100;
}
/**
 * 文面の # に数値を順に入れる (英語・日本語どちらも)。signs は英語の文面の各 # の前の符号 (「+# to Evasion Rating」の +)。
 * 日本語の文面は「回避力 #」のように符号を持たないので、ゲームの表示 (回避力 +151) に合わせて英語の符号を引き継ぐ
 */
function fillValues(text: string, values: readonly number[], signs: readonly string[] = []): string {
  let i = 0;
  return text.replace(/([+-]?)#/g, (_m, pre: string) => {
    const k = i++;
    const v = values[k];
    if (v == null) return `${pre}#`;
    const sign = pre || (signs[k] === "+" && v >= 0 ? "+" : "");
    return `${sign}${v}`;
  });
}
const signsOf = (text: string): string[] => [...text.matchAll(/([+-]?)#/g)].map((m) => m[1] ?? "");
/**
 * 英語文に値を入れる。元文は「#」の物のほか、最下段の数値や「(a-b)」で書かれた物 (約 470 個、例 "Loads an additional bolt")、
 * 一部だけ潰れた物 ("Adds 1 to # Cold damage" — 最小側の範囲が 1-1) がある。
 * 「#」・数値・「(a-b)」を合わせた並びが値の数と同じなら順に差し替える。合わなければ「#」だけ埋める。
 */
const RANGE = /#|\(-?\d+(?:\.\d+)?--?\d+(?:\.\d+)?\)/g;
const SLOT = /#|\(-?\d+(?:\.\d+)?--?\d+(?:\.\d+)?\)|\d+(?:\.\d+)?/g;
function fillEn(text: string, values: readonly number[]): string {
  // 「(41-59)% … in the last 8 seconds」のように固定の数値が混ざる物は、範囲と「#」だけで数が合えばそこを埋める
  const re = [RANGE, SLOT].find((r) => (text.match(r) ?? []).length === values.length);
  if (!re) return fillValues(text, values);
  let i = 0;
  return text.replace(re, () => String(values[i++]));
}

/** MOD の段を 1 つ確定させて表示に要る物を埋める */
export function makeStageMod(mod: Mod, side: StageSide, tierIndex: number, rng: () => number): StageMod {
  const tier = mod.tiers[tierIndex]!;
  return withValues({
    modId: mod.id,
    family: mod.family,
    side,
    tierIndex,
    tierName: `T${mod.tiers.length - tierIndex}`,
    affix: String(tier.name ?? ""),
    modLevel: tier.ilvl,
    values: [],
    ranges: [],
    textJa: "",
    textEn: "",
  }, mod, rng);
}
/**
 * データの値の単位 → 画面の単位。リーチ・クリティカル率は 1 万分率 (645 → 6.45%)、再生は毎分 (60 → 毎秒 1)。
 * 転がすのはデータの整数のまま (ゲームと同じ刻み) で、表示と values / ranges は画面の単位にする
 */
function scaleOf(stat: string | undefined): { div: number; digits: number } | null {
  if (!stat) return null;
  if (/permyriad$/.test(stat) || stat === "local_critical_strike_chance") return { div: 100, digits: 2 };
  if (/per_minute$/.test(stat)) return { div: 60, digits: 1 };
  return null;
}
const scaled = (v: number, sc: { div: number; digits: number } | null): number => (sc ? Math.round((v / sc.div) * 10 ** sc.digits) / 10 ** sc.digits : v);
/** 段はそのままで数値だけ転がし直す (神のオーブ)。段の範囲はデータから引き直す */
export function withValues(m: StageMod, mod: Mod, rng: () => number): StageMod {
  const tier = mod.tiers[m.tierIndex]!;
  const raw = (tier.ranges ?? []).map((r) => [Number(r[0]), Number(r[1])]);
  // stats は型に無いがデータには入っている (patch の段の stat の id)
  const stats = (tier as { stats?: readonly string[] }).stats;
  const scales = raw.map((_r, i) => scaleOf(stats?.[i]));
  const values = raw.map(([a, b], i) => scaled(rollValue(a!, b!, rng), scales[i]!));
  const ranges = raw.map(([a, b], i) => [scaled(a!, scales[i]!), scaled(b!, scales[i]!)]);
  const en = mod.text ?? mod.id;
  const textEn = fillEn(en, values);
  return { ...m, values, ranges, textJa: fillJa(jaOfMod(mod), textEn, values, signsOf(en)), textEn, ...(stats ? { stats: [...stats] } : {}) };
}
/**
 * 日本語文に値を入れる。値の範囲の無い MOD (固定の「+1 to Level of all Minion Skills」、2 行目が固定の物) は日本語だけ「#」なので、
 * 値を入れた英語文の数値を順に使う (日本語に字で書いてある数値「最大ライフ 100 ごと」は除いて数を合わせる)
 */
function fillJa(ja: string, en: string, values: readonly number[], signs: readonly string[]): string {
  const holes = (ja.match(/#/g) ?? []).length;
  if (holes <= values.length) return fillValues(ja, values, signs);
  let nums = [...en.matchAll(/([+-]?)(\d+(?:\.\d+)?)/g)];
  if (nums.length > holes) nums = nums.filter((n) => !ja.includes(n[2]!));
  if (nums.length !== holes) return fillValues(ja, values, signs);
  return fillValues(ja, nums.map((n) => Number(`${n[1] === "-" ? "-" : ""}${n[2]}`)), nums.map((n) => n[1] ?? ""));
}

/** 付けられる MOD の候補 (側ごとの置き場から、付いている系統を除き、段の重み > 0 の物) */
export interface Candidate { mod: Mod; side: StageSide; tiers: Array<{ index: number; w: number }>; w: number }
export interface PoolOpts {
  /** 引く置き場 (既定は普通の MOD) */
  pools?: (side: StageSide) => readonly string[];
  /** 重みを掛ける MOD (触媒の高貴のお告げ: 品質の種類の MOD) */
  boost?: { test: (mod: Mod) => boolean; mult: number };
  /** 系統の比較で除く MOD (開示で差し替える未開示の枠) */
  except?: StageMod;
}
export function candidates(data: PatchData, item: StageItem, sides: readonly StageSide[], floor: number, o: PoolOpts = {}): Candidate[] {
  const taken = takenFamilies(data, item, o.except);
  const out: Candidate[] = [];
  for (const side of sides) {
    const ids = o.pools ? o.pools(side) : item.cls.pools.normal[side === "prefix" ? "prefixes" : "suffixes"];
    for (const id of ids) {
      const mod = data.mods.get(id);
      if (!mod || familyBlocked(mod, taken)) continue;
      const k = o.boost?.test(mod) ? o.boost.mult : 1;
      const tiers = mod.tiers.flatMap((t, index) => (t.ilvl <= item.itemLevel && t.ilvl >= floor && t.weight > 0 ? [{ index, w: t.weight * k }] : []));
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
export function addOne(data: PatchData, item: StageItem, floor: number, rng: () => number, o: PoolOpts & { sides?: readonly StageSide[] } = {}): { item: StageItem; mod: StageMod } | null {
  const sides = (o.sides ?? SIDES).filter((s) => room(item, s));
  const c = pickWeighted(candidates(data, item, sides, floor, o), rng);
  if (!c) return null;
  const t = pickWeighted(c.tiers, rng)!;
  const sm = makeStageMod(c.mod, c.side, t.index, rng);
  return { item: withMod(item, sm), mod: sm };
}
/** 固定済み (フラクチャー) 以外から等しく 1 つ消す。sides で側を絞れる (お告げ) */
export function removeOne(item: StageItem, rng: () => number, sides: readonly StageSide[] = SIDES): { item: StageItem; mod: StageMod } | null {
  const rem = allMods(item).filter((m) => !m.fractured && sides.includes(m.side));
  if (!rem.length) return null;
  const mod = rem[Math.floor(rng() * rem.length)]!;
  return { item: without(item, mod), mod };
}
