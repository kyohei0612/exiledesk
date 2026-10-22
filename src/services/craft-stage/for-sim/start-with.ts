/**
 * start-with.ts — 始めのアイテムを、指名の MOD (段の名前の T) + ルーン + 乱数の MOD で作る (2026-10-22 シミュの自前の式を入口へ、sim-own-logic.md の B10)。
 * 打つのは全部エンジンの applyCurrency (force の鍵・ルーン・素の高貴 / 増強)。断られたら、そこまでの形と理由を返す (投げない。startFrom は投げる)。
 * 1 本の rng を ルーン → 指名の MOD → 乱数の MOD の順に使う (シミュの startItemOf と同じ)
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { runeIdByName } from "../../../vendor/poe2htc/engine/runes";
import { applyCurrency } from "../apply-currency";
import { forceKey } from "../apply-force";
import { freshItem } from "../run-plan";
import type { StageItem } from "../types";
import { tr } from "../../../i18n/lang";

export interface StartMod { modId: string; tier: number; fractured?: boolean }
export interface StartWith {
  /** 始まりのレアリティ。マジック・ノーマルはノーマルから付ける (付けるとマジック)。フラクチャーがあればレア (force がレアにする) */
  rarity: StageItem["rarity"];
  mods: readonly StartMod[];
  /** 先に差すルーン (英語名)。指名の MOD のルーンの分もソケットを開ける */
  runes?: readonly string[];
  /** 指名の後に乱数で足す MOD の数 (レアは素の高貴、ほかは増強) */
  random?: number;
}

/** フラクチャー (✦) は 1 つのアイテムに 1 つまで (ゲームのフラクチャーのオーブは 1 つだけ固定する) */
export const START_FRACTURE_MAX = 1;

/** 始めのアイテム。note = 打てなかった理由 (無ければ null、その時の item は打てた所まで) */
export function startWith(data: PatchData, base: string, itemLevel: number, s: StartWith, rng: () => number): { item: StageItem; note: string | null } {
  const magic = (s.rarity === "magic" || s.rarity === "normal") && !s.mods.some((m) => m.fractured);
  let item = freshItem(data, base, itemLevel, magic ? "normal" : "rare");
  if (s.mods.filter((m) => m.fractured).length > START_FRACTURE_MAX) return { item, note: tr("フラクチャーは 1 つまで", "Only one mod can be fractured") };
  // 選んだルーンを先に差す。ルーンの MOD はそのルーンを差して付く (force が差す)。差すソケットを要る数だけ開けておく (手袋の投射物 +2 = コルの狩り、10-22)
  const runes = s.runes ?? [];
  const byMod = new Set(s.mods.flatMap((m) => { const r = data.mods.get(m.modId)?.rune; return r ? [r] : []; }));
  const need = runes.length + [...byMod].filter((id) => !runes.some((en) => runeIdByName(en) === id)).length;
  if (need) item = { ...item, sockets: Math.max(item.sockets ?? 0, need) };
  for (const en of runes) {
    const r = applyCurrency(data, item, `rune:${en}`, rng);
    if (!r.applied) return { item: r.item, note: r.reason ?? null };
    item = r.item;
  }
  for (const m of s.mods) {
    // エッセンスの MOD (グレーターの道の始まり) はクラフト MOD の印で付ける
    const src = data.mods.get(m.modId)?.source;
    const r = applyCurrency(data, item, forceKey(m.modId, `T${m.tier}`, m.fractured ? "f" : src === "essence" || src === "perfect_essence" ? "e" : "n"), rng);
    if (!r.applied) return { item: r.item, note: r.reason ?? null };
    item = r.item;
  }
  for (let i = 0; i < (s.random ?? 0); i++) {
    const x = applyCurrency(data, item, item.rarity === "rare" ? "exalt" : "augment", rng);
    if (!x.applied) return { item, note: x.reason ?? null };
    item = x.item;
  }
  return { item, note: null };
}
