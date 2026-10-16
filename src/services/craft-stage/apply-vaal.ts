/**
 * クラフトステージ: ヴァールのエンチャントと聖別 (2026-09-27、ADR-001 の Phase 3)
 * ヴァールのオーブ (コラプト) の打つ処理は 2026-10-16 に削除 (オーナー「ヴァールはなし」。棚からは 10-13 に外していた)。
 * エンチャントのプール・値の振り方は生贄のオーブ・インフューザー (apply-extra.ts) が使う
 *
 * エンチャントのプールは src/i18n/vaal-enchants.json (クライアントの Mods.GenerationType=corrupted、spawn は 0/1 なので付く物から等分)。
 *
 * 聖別 (聖別のお告げ + 神のオーブ、レアだけ): MOD ごとに 0.78〜1.22 倍 (0.01 刻み) を掛けて丸め、聖別済みになる (Wiki の Omen of Sanctification)。
 * コラプトと同じく、以後は手を加えられない。
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import vaal from "../../i18n/vaal-enchants.json";
import { allMods, replaced, retext, skip } from "./stage-core";
import type { StageApply, StageItem, StageMod } from "./types";
import { tagsOfEngineRow } from "../mods/item-class-tags";
import { displayValue } from "../mods/stat-scale";
import { tr } from "../../i18n/lang";

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

/** 聖別: MOD ごとに 0.78〜1.22 倍して丸める。文は stage-core の retext (雛形の「#」の位置だけ変える。カタリストの品質と同じ道) */
export function applySanctify(data: PatchData, item: StageItem, rng: () => number): StageApply {
  if (item.rarity !== "rare") return skip(item, tr("聖別はレアのアイテムにだけ", "Sanctification: Rare items only"));
  // フラクチャーした MOD は変えない (用語集「フラクチャーした MOD は変えられない」、2026-10-06 オーナーがゲームで確認、POE2Tube 要望 ㉞-7)
  const mods = allMods(item).filter((m) => m.values.length && !m.unrevealed && !m.fractured);
  let cur = item;
  const added: StageMod[] = [];
  const removed: StageMod[] = [];
  for (const m of mods) {
    const k = (78 + Math.floor(rng() * 45)) / 100;
    const digits = (v: number) => (Number.isInteger(v) ? 0 : 2);
    const values = m.values.map((v) => { const d = 10 ** digits(v); return Math.round(v * k * d) / d; });
    // 値が変わらなかった MOD は変化に入れない (「+16% → +16%」、要望 ㉟-4)
    if (values.every((v, i) => v === m.values[i])) continue;
    const next = { ...m, values, ...retext(m, values, data) };
    cur = replaced(cur, m, next);
    added.push(next);
    removed.push(m);
  }
  return { applied: true, item: { ...cur, sanctified: true }, added, removed };
}
