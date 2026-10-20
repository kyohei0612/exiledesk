/**
 * クラフトステージ: ヴァールのエンチャントと聖別 (2026-09-27、ADR-001 の Phase 3)
 * ヴァールのオーブ (コラプト) の打つ処理は 2026-10-16 に削除 (オーナー「ヴァールはなし」。棚からは 10-13 に外していた)。
 * エンチャントのプール・値の振り方は生贄のオーブ・インフューザー (apply-extra.ts) が使う
 *
 * エンチャントのプールは src/i18n/vaal-enchants.json (クライアントの Mods.GenerationType=corrupted、spawn は 0/1 なので付く物から等分)。
 *
 * 聖別 (聖別のお告げ + 神のオーブ、レアだけ): 神のオーブと同じく数値を振り直してから、MOD ごとに 0.78〜1.22 倍 (0.01 刻み) を掛けて丸め、聖別済みになる
 * (Wiki の Omen of Sanctification。振り直してから掛けるのは Craft of Exile の divine + rerollValues、2026-10-17 オーナー「CoE に合わせて」)。
 * 倍率を掛けた値は段の範囲を超えることがある (上限突破、2026-10-17 オーナー)。暗黙・固定・未発現は変えない。
 * コラプトと同じく、以後は手を加えられない。
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import vaal from "../../i18n/vaal-enchants.json";
import { allMods, replaced, retext, skip, withValues } from "./stage-core";
import type { StageApply, StageItem, StageMod } from "./types";
import { tagsOfEngineRow } from "../mods/item-class-tags";
import { displayValue } from "../mods/stat-scale";
import { tr } from "../../i18n/lang";
import { stageTuning } from "./stage-tuning";

interface Enchant { domain: string; group?: string; en: string; ja: string; stats: Array<{ id: string; min: number; max: number }>; spawn: Array<{ t: string; w: number }> }
export const ENCHANTS = (vaal as unknown as { mods: Record<string, Enchant> }).mods;

/** そのアイテムのタグ (クライアントの BaseItemTypes.Tags と同じ名前。表は services/mods/item-class-tags.ts に 1 つ) */
const tagsOf = (item: StageItem): Set<string> => tagsOfEngineRow(item.cls.category, item.cls.id);
/** そのアイテムに付くエンチャント (spawn は順番に見て最初に当たったタグの重み) */
export function enchantPool(item: StageItem): string[] {
  const tags = tagsOf(item);
  return Object.entries(ENCHANTS).filter(([, m]) => {
    if (m.domain !== "item") return false;
    const hit = m.spawn.find((w) => w.t === "default" || tags.has(w.t));
    return !!hit && hit.w > 0;
  }).map(([id]) => id);
}
/** 文面の「(a-b)」を順に振った値にする */
/**
 * エンチャントの数値を転がす。転がすのはデータの整数のまま、文に入れる値は画面の単位
 * (フラスコのチャージ獲得は毎分 20-35 → 毎秒 0.33-0.58。生の値を入れると「毎秒 27」になっていた。services/mods/stat-scale.ts)
 */
export function rollEnchantValues(stats: ReadonlyArray<{ id: string; min: number; max: number }>, rng: () => number): number[] {
  return stats.filter((s) => s.min !== s.max).map((s) => displayValue(s.id, s.min + Math.floor(rng() * (s.max - s.min + 1))));
}

export function rollText(text: string, vals: readonly number[]): string {
  let i = 0;
  // 文が「(20-10)% 減少」のように正の数で書かれていて値が負 (データは -20〜-10) の時は、正の数で入れる
  // (「要求能力値が-10%減少する」の二重の否定になっていた。POE2Tube 要望 ㉟-1)
  return text.replace(/\((-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\)/g, (m, a: string, b: string) => {
    if (i >= vals.length) return m;
    const v = vals[i++]!;
    return String(v < 0 && !a.startsWith("-") && !b.startsWith("-") ? Math.abs(v) : v);
  });
}

/** 聖別の倍率の幅 (×100。聖別のお告げの 0.78〜1.22) */
export const SANCTIFY_MIN = 78;
export const SANCTIFY_MAX = 122;
/** 掛けて丸める (整数は整数、小数は 2 桁) */
function scaled(vals: readonly number[], k: number): number[] {
  return vals.map((v) => { const d = Number.isInteger(v) ? 1 : 100; return Math.round(v * k * d) / d; });
}

/** 聖別の数値を手で決める手 (聖別の帯、2026-10-20 オーナー「聖別の数値も手で決めて使えるといい」)。費用 0
 * `sset:122` = 全部の MOD を ×1.22 (掛ける前の値はそのまま)、`sset:max` = 段の最大 × 1.22、`sset:min` = 段の最小 × 0.78 */
export const SANCTIFY_SET = "sset:";
export const sanctifySetKey = (k: number | "max" | "min"): string => `${SANCTIFY_SET}${k}`;
export const isSanctifySet = (key: string): boolean => key.startsWith(SANCTIFY_SET);
export function applySanctifySet(data: PatchData, item: StageItem, currency: string): StageApply {
  const arg = currency.slice(SANCTIFY_SET.length);
  const mods = allMods(item).filter((m) => m.sanctify);
  if (!item.sanctified || !mods.length) return skip(item, tr("聖別したアイテムだけ", "Sanctified items only"));
  const n = arg === "max" ? SANCTIFY_MAX : arg === "min" ? SANCTIFY_MIN : Math.max(SANCTIFY_MIN, Math.min(SANCTIFY_MAX, Math.round(Number(arg)) || 100));
  let cur = item;
  const added: StageMod[] = [];
  const removed: StageMod[] = [];
  for (const m of mods) {
    // 最大 / 最小は掛ける前の値も段の端に (負の値の段は絶対値の大きい方が「最大」)
    const end = (i: number): number => { const [a = 0, b = a] = m.ranges[i] ?? [m.sanctify!.base[i] ?? 0]; return (Math.abs(a) > Math.abs(b)) === (arg === "max") ? a : b; };
    const base = arg === "max" || arg === "min" ? m.sanctify!.base.map((_, i) => end(i)) : m.sanctify!.base;
    const k = n / 100;
    const values = scaled(base, k);
    const next = { ...m, values, ...retext(m, values, data), sanctify: { base, k } };
    cur = replaced(cur, m, next);
    if (values.every((v, i) => v === m.values[i])) continue;
    added.push(next);
    removed.push(m);
  }
  return { applied: true, item: cur, added, removed };
}

/** 聖別: MOD ごとに 0.78〜1.22 倍して丸める。文は stage-core の retext (雛形の「#」の位置だけ変える。カタリストの品質と同じ道) */
export function applySanctify(data: PatchData, item: StageItem, rng: () => number): StageApply {
  if (item.rarity !== "rare") return skip(item, tr("聖別はレアのアイテムにだけ", "Sanctification: Rare items only"));
  // フラクチャーした MOD は変えない (用語集「フラクチャーした MOD は変えられない」、2026-10-06 オーナーがゲームで確認、POE2Tube 要望 ㉞-7)
  const mods = allMods(item).filter((m) => m.values.length && !m.unrevealed && !m.fractured);
  let cur = item;
  const added: StageMod[] = [];
  const removed: StageMod[] = [];
  for (const m of mods) {
    // 神のオーブと同じく段の範囲で振り直してから倍率 (CoE と同じ順)
    const md = data.mods.get(m.modId);
    const rolled = md && m.ranges.length ? withValues(m, md, rng) : m;
    // 倍率を決めた時 (お告げの下の設定、stage-tuning.ts) はその値。乱数は同じだけ引く (決めても決めなくても後ろの手の乱数がずれない)
    const roll = SANCTIFY_MIN + Math.floor(rng() * (SANCTIFY_MAX - SANCTIFY_MIN + 1));
    const k = (stageTuning().sanctifyK ?? roll) / 100;
    const values = scaled(rolled.values, k);
    // 掛ける前の値と倍率を持たせる (聖別の帯で倍率を後から決め直す)
    const next = { ...rolled, values, ...retext(rolled, values, data), sanctify: { base: [...rolled.values], k } };
    cur = replaced(cur, m, next);
    // 値が変わらなかった MOD は変化に入れない (「+16% → +16%」、要望 ㉟-4)
    if (values.every((v, i) => v === m.values[i])) continue;
    added.push(next);
    removed.push(m);
  }
  return { applied: true, item: { ...cur, sanctified: true }, added, removed };
}
