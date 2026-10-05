/**
 * クラフトステージ: 1 手の抽選で共通に使う物 (2026-09-27、ADR-001)
 *
 * 枠・MOD の候補・重みの抽選・数値の転がし・文面への数値の埋め込み。各アイテムの規則は
 * [[apply-currency.ts]] (オーブ) / [[apply-essence.ts]] / [[apply-desecrate.ts]] / [[apply-other.ts]] に置く。
 * 候補の規則は計算機 (sim-route-helpers.ts の roll) と同じ: 付いている系統を除き、アイテムレベル以下・段の下限以上の段の重みで引く。
 */
import type { ItemBase, Mod, PatchData } from "../../vendor/poe2htc/engine/types";
import { runeIdByName, withRunes } from "../../vendor/poe2htc/engine/runes";
import { floorKeepIndex } from "../../vendor/poe2htc/engine/pool";
import { familyBlocked, familyKeysOf, rawFamiliesOf } from "../mods/mod-rules";
import { DEFAULT_LIMITS } from "../../vendor/poe2htc/engine/item";
import { jaOfMod } from "../htc/mod-text";
import modTextJa from "../../i18n/mod-text-ja.json";
import { maxQualityForBase } from "../htc/catalysing-setup";
import { displayedValue } from "../htc/quality";
import { displayValue, tierDisplayRanges, type TierLike } from "../mods/stat-scale";
import { swapNums } from "./text-nums";
import type { StageApply, StageItem, StageMod, StageSide } from "./types";

export const SIDES: StageSide[] = ["prefix", "suffix"];
const MAGIC_LIMIT = 1;
export const SIDE_JA = { prefix: "プレフィックス", suffix: "サフィックス" } as const;

/**
 * はまっているルーンのうち、クラフトの決まりを変える物 (計算機のエンジンの id: serles-triumph / kolrs-hunt …)。
 * 名前の ' と ’ の違いはエンジンの runeIdByName が吸収する
 */
export const stageRuneIds = (item: StageItem): string[] =>
  (item.augments ?? []).flatMap((a) => { const id = runeIdByName(a.en); return id ? [id] : []; });
/**
 * ルーン込みのベース (POE2Tube 要望 ㉙ 2026-10-04): 計算機と同じ withRunes で、セールの凱旋はサフィックスの枠 +1、
 * 特殊 MOD のルーン (コルの狩りなど) はそのタグの MOD を普通の置き場 (高貴・カオス・エッセンス・骨の抽選と「付く MOD」) に混ぜる
 */
export function effectiveCls(item: StageItem): ItemBase {
  const ids = stageRuneIds(item);
  return ids.length ? withRunes(item.cls, ids) : item.cls;
}
/** 側の枠 (マジックは 1 / 1) */
export function limitOf(item: StageItem, side: StageSide): number {
  if (item.rarity === "magic") return MAGIC_LIMIT;
  if (item.rarity === "normal") return 0;
  const lim = effectiveCls(item).limits ?? DEFAULT_LIMITS;
  return side === "prefix" ? lim.prefixes : lim.suffixes;
}
/** レアにした時の枠 (マジック → レアになる手で見る) */
export function rareLimitOf(item: StageItem, side: StageSide): number {
  const lim = effectiveCls(item).limits ?? DEFAULT_LIMITS;
  return side === "prefix" ? lim.prefixes : lim.suffixes;
}
export const listOf = (item: StageItem, side: StageSide): StageMod[] => (side === "prefix" ? item.prefixes : item.suffixes);
export const room = (item: StageItem, side: StageSide): boolean => listOf(item, side).length < limitOf(item, side);
export const allMods = (item: StageItem): StageMod[] => [...item.prefixes, ...item.suffixes];

/**
 * 指輪・アミュレットの品質の上限 (POE2Tube 要望 ㉔-3、2026-10-02): ベースの最大品質 + MOD の「品質の最大値 +N%」
 * (ブリーチのエッセンス Perfect Essence of the Breach = "+20% to Maximum Quality"、ゲームの説明文「宝飾品に付く: 品質の最大値 +20%」)
 */
export function maxQualityOf(item: StageItem): number {
  let add = 0;
  for (const m of allMods(item)) {
    const r = /^\+?(\d+)% to Maximum Quality$/i.exec(m.textEn);
    if (r) add += Number(r[1]);
  }
  return maxQualityForBase(item.base) + add;
}
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
/** 付いている MOD の系統 (except は除く。発現の時の未発現の枠など) */
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

const decimalsOf = (n: number): number => { const t = String(n); return t.includes(".") ? t.split(".")[1]!.length : 0; };
/**
 * 数値を 1 つ転がす (範囲の両端を含む)。小数の範囲は、範囲の数字の桁の刻み (0.1-0.2 なら 0.1 / 0.2 の 2 通り、0.75-1 なら 0.01 刻み)。
 * 前は小数なら一律 0.01 刻みで、冒涜の回避ロールの距離 (生の値 1〜2 = 0.1 / 0.2 m) に「+0.13 メートル」のような出ない値が出ていた
 * (2026-10-06 POE2Tube 要望 ㉝ の 10)。stats を持つ段はデータの整数のまま転がすのでここは通らない
 */
function rollValue(min: number, max: number, rng: () => number): number {
  const lo = Math.min(min, max), hi = Math.max(min, max);
  if (Number.isInteger(lo) && Number.isInteger(hi)) return lo + Math.floor(rng() * (hi - lo + 1));
  const p = 10 ** Math.max(decimalsOf(lo), decimalsOf(hi));
  const a = Math.round(lo * p), b = Math.round(hi * p);
  return (a + Math.floor(rng() * (b - a + 1))) / p;
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

/**
 * カタリストの品質で伸びた後の数値と文 (POE2Tube 要望 ㉔-4、2026-10-02)。伸びない時は null。
 * 決まりは計算機の quality.ts と同じ (オーナーの実物で検算済み): 指輪・アミュレットだけ、品質の種類 (qualityTag) のタグを
 * MOD 自身が持っていれば 素の値 × (1 + 品質) を切り捨て。防具・武器の MOD は品質で数値が動かない。
 * タグは MOD に持たせた物 (無い古い物は data から引く)
 */
export function boostedMod(item: StageItem, m: StageMod, data?: PatchData): { values: number[]; textJa: string; textEn: string } | null {
  const tag = item.qualityTag;
  if (!tag || !(item.quality > 0) || !/^(Rings|Amulets)\//.test(m.modId)) return null;
  const tags = m.tags ?? data?.mods.get(m.modId)?.tags ?? [];
  if (!tags.includes(tag) || !m.values.length) return null;
  // 小数の値は 2 桁に丸める (6.45 × 1.2 = 7.739999… のような誤差を values に入れない。文と同じ丸め)。整数は displayedValue が切り捨て済み
  const values = m.values.map((v) => { const b = displayedValue(v, item.quality); return Number.isInteger(v) ? b : Math.round(b * 100) / 100; });
  if (values.every((v, i) => v === m.values[i])) return null;
  return { values, ...retext(m, values, data) };
}

/**
 * MOD の数値を values に変えた時の文 (聖別・カタリストの品質で共通)。
 * データにその MOD があれば、作った時と同じ道 (withValues: 英語の雛形の「#」の位置と日本語の雛形) で文を作り直す = 「#」の位置だけ変わる。
 * 無い時 (テストの作り物など) は値の並び順で同じ数字を順に差し替える (text-nums.ts の swapNums)。
 * 「同じ数字をすべて置換」はしない: Rings/LightRadiusAndManaRegeneration「5% increased Light Radius / #% Mana Regen」で固定の 5 まで変わる
 */
export function retext(m: StageMod, values: readonly number[], data?: PatchData): { textJa: string; textEn: string } {
  const mod = data?.mods.get(m.modId);
  if (mod && mod.tiers[m.tierIndex]) {
    const re = withValues(m, mod, () => 0, values);
    return { textJa: re.textJa, textEn: re.textEn };
  }
  return { textJa: swapNums(m.textJa, m.values, values), textEn: swapNums(m.textEn, m.values, values) };
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
    ...(mod.rune ? { rune: mod.rune } : {}),
  }, mod, rng);
}
/** 説明文のまま入っている MOD の、付いた 1 つの英語文 (系統 → 文)。日本語は mod-text-ja の同じ文から */
const ONE_OF_TEXT: Record<string, string> = {
  PercentageStrength: "#% increased Strength",
  PercentageDexterity: "#% increased Dexterity",
  PercentageIntelligence: "#% increased Intelligence",
};
const jaOfText = (en: string): string | undefined => (modTextJa as Record<string, string>)[en];
/**
 * 段はそのままで数値だけ転がし直す (神のオーブ)。段の範囲はデータから引き直す。
 * データの値の単位 → 画面の単位 (リーチ・クリティカル率は 1 万分率 645 → 6.45%、再生は毎分 60 → 毎秒 1) の決まりは
 * services/mods/stat-scale.ts に 1 つ (2026-10-03 にここから移した)。転がすのはデータの整数のまま (ゲームと同じ刻み) で、
 * 表示と values / ranges は画面の単位にする。stats を持たない段 (同梱の冒涜・エッセンス) の ranges は元から画面の単位
 * fixed: 数値を指名する (画面の単位、要望 ⑱ の pick.values / start.mods[].values)。無ければ転がす
 */
export function withValues(m: StageMod, mod: Mod, rng: () => number, fixed?: readonly number[]): StageMod {
  const tier = mod.tiers[m.tierIndex]!;
  const raw = (tier.ranges ?? []).map((r) => [Number(r[0]), Number(r[1])]);
  // stats は型に無いがデータには入っている (patch の段の stat の id)。stats の数が合う段だけ換算する (tierDisplayRanges と同じ決まり)
  const stats = (tier as { stats?: readonly string[] }).stats;
  const statOf = (i: number): string | undefined => (stats && stats.length === raw.length ? stats[i] : undefined);
  const values = raw.map(([a, b], i) => (fixed?.[i] != null ? fixed[i]! : displayValue(statOf(i), rollValue(a!, b!, rng))));
  const ranges = tierDisplayRanges(tier as TierLike);
  // 無限のパーフェクトエッセンスは 3 つの MOD とも文が説明文のまま (「筋力、器用さまたは知性」)。付いた 1 つの文にする (要望 ㉕-4)
  const one = ONE_OF_TEXT[mod.family];
  const en = one && mod.text === "#% increased Strength, Dexterity or Intelligence" ? one : mod.text ?? mod.id;
  const ja = one && en === one ? jaOfText(one) ?? jaOfMod(mod) : jaOfMod(mod);
  const textEn = fillEn(en, values);
  return { ...m, values, ranges, textJa: fillJa(ja, textEn, values, signsOf(en)), textEn, ...(stats ? { stats: [...stats] } : {}), ...(mod.tags?.length ? { tags: [...mod.tags] } : {}) };
}
/**
 * 日本語文に値を入れる。値の範囲の無い MOD (固定の「+1 to Level of all Minion Skills」、2 行目が固定の物) は日本語だけ「#」なので、
 * 値を入れた英語文の数値を順に使う (日本語に字で書いてある数値「最大ライフ 100 ごと」は除いて数を合わせる)
 */
/**
 * 「減少する」「低下する」の文は、ゲームの表示と同じく数字を正で出す (データの値は負: 要求能力値 -15 → 「要求能力値が15%減少する」)。
 * 2026-09-30 (要望 ㉑ の確認で見つけた): 「要求能力値が-15%減少する」と二重に負になっていた
 */
export const NEGATIVE_WORDS = /減少|低下/;
function fillJa(ja: string, en: string, values: readonly number[], signs: readonly string[]): string {
  if (NEGATIVE_WORDS.test(ja)) values = values.map((v) => Math.abs(v));
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
  /** 系統の比較で除く MOD (発現で差し替える未発現の枠) */
  except?: StageMod;
}
export function candidates(data: PatchData, item: StageItem, sides: readonly StageSide[], floor: number, o: PoolOpts = {}): Candidate[] {
  const taken = takenFamilies(data, item, o.except);
  const out: Candidate[] = [];
  for (const side of sides) {
    const ids = o.pools ? o.pools(side) : effectiveCls(item).pools.normal[side === "prefix" ? "prefixes" : "suffixes"];
    for (const id of ids) {
      const mod = data.mods.get(id);
      if (!mod || familyBlocked(mod, taken)) continue;
      const k = o.boost?.test(mod) ? o.boost.mult : 1;
      // 下限 (上級・完全・古代の骨) より上の段が 1 つも無い系統は、一番上の段だけ残す (用語集 BetterCurrencyMinimumLevel、要望 ㉝ の 2)
      const keep = floorKeepIndex(mod, floor, item.itemLevel);
      const tiers = mod.tiers.flatMap((t, index) => (t.ilvl <= item.itemLevel && (t.ilvl >= floor || index === keep) && t.weight > 0 ? [{ index, w: t.weight * k }] : []));
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
/**
 * 付く MOD の指名 (POE2Tube 要望 ⑱-1 kyohei「MOD を自分で選んで組み合わせる機能いるんじゃね？」)。
 * mod = MOD の id (Rings/ColdResistance) か系統 (ColdResistance)、tier = "T6" (無ければ段は乱数)、values = 数値 (画面の単位、無ければ乱数)
 */
export interface Force { mod: string; tier?: string; values?: number[]; /** 固定済みで付ける (始めの状態だけ。シミュレーションの「付いた状態で始める」、2026-10-05) */ fractured?: boolean }
/** 指名した MOD と、指名しなかったら付く確率 (その段 (段を指名しなければその MOD) の重み ÷ その手で付きうる全部の重み) */
export interface Forced { item: StageItem; mod: StageMod; chance: number }
const matchesMod = (mod: Mod, key: string): boolean => mod.id === key || mod.id.endsWith(`/${key}`) || mod.family === key;
/**
 * 指名した MOD を付ける。**その時点で本当に付きうる物だけ** (乱数の時と同じ候補: 空き枠・同系統・アイテムレベル・強さの下限・重み > 0)。
 * 付けられなければ { error: 理由 }
 */
export function addForced(data: PatchData, item: StageItem, floor: number, rng: () => number, force: Force, o: PoolOpts & { sides?: readonly StageSide[] } = {}): Forced | { error: string } {
  const sides = (o.sides ?? SIDES).filter((s) => room(item, s));
  if (!sides.length) return { error: "足す枠が無い" };
  const cands = candidates(data, item, sides, floor, o);
  const total = cands.reduce((a, c) => a + c.w, 0);
  const c = cands.find((x) => matchesMod(x.mod, force.mod));
  if (!c) {
    const any = [...data.mods.values()].find((m) => matchesMod(m, force.mod));
    return { error: any ? `${force.mod} はこの手では付かない (空き枠・同じ系統・アイテムレベル・強さの下限のどれか)` : `${force.mod} という MOD が無い` };
  }
  let t: { index: number; w: number } | undefined;
  if (force.tier) {
    const n = Number(/^T(\d+)$/i.exec(force.tier)?.[1]);
    const index = c.mod.tiers.length - n;
    t = c.tiers.find((x) => x.index === index);
    if (!t) return { error: `${force.mod} の ${force.tier} はこの手では付かない (アイテムレベル ${item.itemLevel}・強さの下限 ${floor})` };
  } else {
    t = pickWeighted(c.tiers, rng)!;
  }
  let sm = makeStageMod(c.mod, c.side, t.index, rng);
  if (force.values) {
    const bad = force.values.findIndex((v, i) => { const r = sm.ranges[i]; return !r || v < Math.min(r[0]!, r[1]!) || v > Math.max(r[0]!, r[1]!); });
    if (bad >= 0) return { error: `${force.mod} の数値 ${force.values[bad]} がティアの範囲 (${sm.ranges[bad]?.join("〜") ?? "無し"}) の外` };
    sm = withValues(sm, c.mod, rng, force.values);
  }
  const chance = total > 0 ? (force.tier ? t.w : c.w) / total : 0;
  return { item: withMod(item, sm), mod: sm, chance };
}
/** 消える MOD の指名 (カオスの remove)。固定済み (フラクチャー) は消せない */
export function removeForced(item: StageItem, key: string): { item: StageItem; mod: StageMod } | { error: string } {
  const m = allMods(item).find((x) => (x.modId === key || x.modId.endsWith(`/${key}`) || x.family === key));
  if (!m) return { error: `${key} は付いていない` };
  if (m.fractured) return { error: `${key} は固定済み (フラクチャー) で消せない` };
  return { item: without(item, m), mod: m };
}

/** 固定済み (フラクチャー) 以外から等しく 1 つ消す。sides で側を絞れる (お告げ) */
export function removeOne(item: StageItem, rng: () => number, sides: readonly StageSide[] = SIDES): { item: StageItem; mod: StageMod } | null {
  const rem = allMods(item).filter((m) => !m.fractured && sides.includes(m.side));
  if (!rem.length) return null;
  const mod = rem[Math.floor(rng() * rem.length)]!;
  return { item: without(item, mod), mod };
}
