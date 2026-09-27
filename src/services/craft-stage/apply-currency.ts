/**
 * クラフトステージ: カレンシー 1 個を打った結果を 1 回抽選する (2026-09-27、ADR-001)
 *
 * 規則は計算機 (sim-route-helpers.ts の roll / usable / apply) と同じ:
 *   - 足す MOD は、その側の普通の MOD の置き場から、**付いている系統を除き**、アイテムレベル以下 (上級・完全は段の下限以上) の段の
 *     重みで引く (Craft of Exile と同じ)。どちらの側に付くかも重みで決まる (枠のある側を合わせた中から 1 つ)
 *   - 上級・完全の段の下限はエンジンの CURRENCY_FLOOR (変成・増強 55 / 70、王者・高貴 35 / 50)。カオスは計算機と同じ 35 / 50
 *   - 枠: マジックはプレ 1 / サフィ 1、レアはベースの上限 (ItemBase.limits)
 *   - 消す (カオス・消去) のは固定済み (フラクチャー) 以外から等しく 1 つ
 * Phase 1: 変成 / 増強 / 王者 / 高貴 / カオス / 消去 / 錬金。その他は applied:false (未対応) で返す。
 */
import type { Mod, PatchData } from "../../vendor/poe2htc/engine/types";
import { CURRENCY_FLOOR } from "../../vendor/poe2htc/engine/types";
import { familiesOf } from "../../vendor/poe2htc/engine/pool";
import { DEFAULT_LIMITS } from "../../vendor/poe2htc/engine/item";
import { jaOfMod } from "../htc/mod-text";
import type { StageApply, StageItem, StageMod, StageSide } from "./types";

const SIDES: StageSide[] = ["prefix", "suffix"];
const MAGIC_LIMIT = 1;

/** カレンシーのキー (price-keys.json) → 種類と強さ */
function parseKey(key: string): { kind: string; strength: "base" | "greater" | "perfect" } {
  const m = /^(.*)_(greater|perfect)$/.exec(key);
  return m ? { kind: m[1]!, strength: m[2] as "greater" | "perfect" } : { kind: key, strength: "base" };
}
/** 強さの段の下限 */
function floorOf(kind: string, strength: "base" | "greater" | "perfect"): number {
  if (kind === "chaos") return { base: 0, greater: 35, perfect: 50 }[strength];
  const t = CURRENCY_FLOOR[kind as keyof typeof CURRENCY_FLOOR];
  return t ? t[strength] : 0;
}

/** 側の枠 (マジックは 1 / 1) */
function limitOf(item: StageItem, side: StageSide): number {
  if (item.rarity === "magic") return MAGIC_LIMIT;
  if (item.rarity === "normal") return 0;
  const lim = item.cls.limits ?? DEFAULT_LIMITS;
  return side === "prefix" ? lim.prefixes : lim.suffixes;
}
const listOf = (item: StageItem, side: StageSide): StageMod[] => (side === "prefix" ? item.prefixes : item.suffixes);
const room = (item: StageItem, side: StageSide): boolean => listOf(item, side).length < limitOf(item, side);
const allMods = (item: StageItem): StageMod[] => [...item.prefixes, ...item.suffixes];

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

/** 付けられる MOD の候補 (側ごとの置き場から、付いている系統を除き、段の重み > 0 の物) */
interface Candidate { mod: Mod; side: StageSide; tiers: Array<{ index: number; w: number }>; w: number }
function candidates(data: PatchData, item: StageItem, sides: StageSide[], floor: number): Candidate[] {
  const taken = new Set(allMods(item).flatMap((m) => { const md = data.mods.get(m.modId); return md ? familiesOf(md) : [m.family]; }));
  const out: Candidate[] = [];
  for (const side of sides) {
    for (const id of item.cls.pools.normal[side === "prefix" ? "prefixes" : "suffixes"]) {
      const mod = data.mods.get(id);
      if (!mod || familiesOf(mod).some((f) => taken.has(f))) continue;
      const tiers = mod.tiers.flatMap((t, index) => (t.ilvl <= item.itemLevel && t.ilvl >= floor && t.weight > 0 ? [{ index, w: t.weight }] : []));
      const w = tiers.reduce((a, t) => a + t.w, 0);
      if (w > 0) out.push({ mod, side, tiers, w });
    }
  }
  return out;
}
function pickWeighted<T extends { w: number }>(xs: readonly T[], rng: () => number): T | null {
  const total = xs.reduce((a, x) => a + x.w, 0);
  if (!(total > 0)) return null;
  let u = rng() * total;
  for (const x of xs) {
    if (u < x.w) return x;
    u -= x.w;
  }
  return xs[xs.length - 1] ?? null;
}

/** MOD の段を 1 つ確定させて表示に要る物を埋める */
export function makeStageMod(mod: Mod, side: StageSide, tierIndex: number, rng: () => number): StageMod {
  const tier = mod.tiers[tierIndex]!;
  const ranges = (tier.ranges ?? []).map((r) => [Number(r[0]), Number(r[1])]);
  const values = ranges.map(([a, b]) => rollValue(a!, b!, rng));
  const en = mod.text ?? mod.id;
  return {
    modId: mod.id,
    family: mod.family,
    side,
    tierIndex,
    tierName: `T${mod.tiers.length - tierIndex}`,
    affix: String(tier.name ?? ""),
    modLevel: tier.ilvl,
    values,
    ranges,
    textJa: fillValues(jaOfMod(mod), values, signsOf(en)),
    textEn: fillValues(en, values),
  };
}

/** MOD を 1 つ引いて付ける (付けられなければ null) */
function addOne(data: PatchData, item: StageItem, floor: number, rng: () => number): { item: StageItem; mod: StageMod } | null {
  const sides = SIDES.filter((s) => room(item, s));
  const c = pickWeighted(candidates(data, item, sides, floor), rng);
  if (!c) return null;
  const t = pickWeighted(c.tiers, rng)!;
  const sm = makeStageMod(c.mod, c.side, t.index, rng);
  return { item: c.side === "prefix" ? { ...item, prefixes: [...item.prefixes, sm] } : { ...item, suffixes: [...item.suffixes, sm] }, mod: sm };
}
/** 固定済み以外から等しく 1 つ消す */
function removeOne(item: StageItem, rng: () => number): { item: StageItem; mod: StageMod } | null {
  const rem = allMods(item).filter((m) => !m.fractured);
  if (!rem.length) return null;
  const mod = rem[Math.floor(rng() * rem.length)]!;
  return { item: { ...item, prefixes: item.prefixes.filter((m) => m !== mod), suffixes: item.suffixes.filter((m) => m !== mod) }, mod };
}

const skip = (item: StageItem, reason: string): StageApply => ({ applied: false, reason, item, added: [], removed: [] });

/**
 * カレンシー 1 個を打つ。打てない状態なら applied:false と理由 (item はそのまま)。
 * rng は 1 手ごとに mulberry32(seed) を渡す (同じ seed なら同じ結果)
 */
export function applyCurrency(data: PatchData, item: StageItem, currency: string, rng: () => number): StageApply {
  if (item.corrupted) return skip(item, "コラプトしたアイテムには使えない");
  const { kind, strength } = parseKey(currency);
  const floor = floorOf(kind, strength);
  const count = allMods(item).length;
  const add = (it: StageItem, n: number): StageApply => {
    let cur = it;
    const added: StageMod[] = [];
    for (let i = 0; i < n; i++) {
      const r = addOne(data, cur, floor, rng);
      if (!r) break;
      cur = r.item;
      added.push(r.mod);
    }
    return added.length ? { applied: true, item: cur, added, removed: [] } : skip(item, "付けられる MOD が無い");
  };
  switch (kind) {
    case "transmute":
      if (item.rarity !== "normal") return skip(item, "ノーマルのアイテムにだけ使える");
      return add({ ...item, rarity: "magic" }, 1);
    case "augment":
      if (item.rarity !== "magic") return skip(item, "マジックのアイテムにだけ使える");
      if (count >= 2) return skip(item, "MOD が 2 つ付いている (マジックはプレ 1 / サフィ 1 まで)");
      return add(item, 1);
    case "regal":
      if (item.rarity !== "magic") return skip(item, "マジックのアイテムにだけ使える");
      return add({ ...item, rarity: "rare" }, 1);
    case "alchemy":
      if (item.rarity !== "normal") return skip(item, "ノーマルのアイテムにだけ使える");
      return add({ ...item, rarity: "rare" }, 4);
    case "exalt":
      if (item.rarity !== "rare") return skip(item, "レアのアイテムにだけ使える");
      if (!SIDES.some((s) => room(item, s))) return skip(item, "足す枠が無い");
      return add(item, 1);
    case "chaos": {
      if (item.rarity !== "rare") return skip(item, "レアのアイテムにだけ使える");
      const r = removeOne(item, rng);
      if (!r) return skip(item, "外せる MOD が無い");
      const a = addOne(data, r.item, floor, rng);
      return { applied: true, item: a?.item ?? r.item, added: a ? [a.mod] : [], removed: [r.mod] };
    }
    case "annul": {
      if (item.rarity === "normal") return skip(item, "マジックかレアのアイテムにだけ使える");
      const r = removeOne(item, rng);
      if (!r) return skip(item, "外せる MOD が無い");
      return { applied: true, item: r.item, added: [], removed: [r.mod] };
    }
    default:
      return skip(item, `このカレンシーはまだ使えない (Phase 2 以降: ${currency})`);
  }
}
