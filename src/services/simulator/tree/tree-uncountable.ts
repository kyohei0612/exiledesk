/**
 * tree-uncountable.ts — 結果を数え上げられない手 (S-21): エンジンの枝が上限を超える手 (stepOutcomesOrTooMany が "tooMany"、今の棚では錬金術だけ) の結果の形。
 * 手の名前では分けない (大本 2)。枝の代わりにエンジンの入口 applyCurrency を決まった種で決まった回数打って集める (ここで結果は作らない)
 */
import { applyCurrency, mulberry32, type PatchData, type StageItem } from "../../craft-stage/engine";
import type { StepOutcome } from "../sim-engine/outcomes";
import { stepOutcomesOrTooMany } from "../sim-engine";
import { engineOmens } from "./tree-hands";
import { sideKeyOf } from "./tree-junk-side";
import type { Hand } from "./tree-model";
import { itemKeyOf } from "./tree-sample-key";

/** 打つ回数 (1.5% の形でも 500 回のどこかで 99.9% 出る) と種 */
const ROLLS = 500, SEED = 0x5eed;
const MAX = 2000;
const TOO = new WeakMap<PatchData, Map<string, boolean>>();
const ROLLED = new WeakMap<PatchData, Map<string, StepOutcome[] | null>>();
const memoOf = <T>(w: WeakMap<PatchData, Map<string, T>>, data: PatchData): Map<string, T> => { let m = w.get(data); if (!m) w.set(data, (m = new Map())); if (m.size >= MAX) m.clear(); return m; };

/** エンジンの枝が上限を超える手か (枝を全部たどると重いので、形が同じアイテムは 1 回だけ聞く) */
function tooMany(data: PatchData, item: StageItem, key: string, omens: readonly string[]): boolean {
  const m = memoOf(TOO, data), k = `${key}|${omens.join()}|${item.base}|${item.itemLevel}|${item.rarity}|${item.prefixes.length}|${item.suffixes.length}`;
  let r = m.get(k);
  if (r === undefined) m.set(k, (r = stepOutcomesOrTooMany(data, item, key, omens) === "tooMany"));
  return r;
}
/** 数え上げられない手の結果 (打った回数ぶん、p の和は 1)。数え上げられる手・打てない手は null */
export function rolledOutcomes(data: PatchData, item: StageItem, key: string, omens: readonly string[]): StepOutcome[] | null {
  if (!tooMany(data, item, key, omens)) return null;
  const m = memoOf(ROLLED, data), k = `${key}|${omens.join()}|${itemKeyOf(item)}`;
  if (m.has(k)) return m.get(k)!;
  const rng = mulberry32(SEED), out: StepOutcome[] = [];
  for (let i = 0; i < ROLLS; i++) {
    const r = applyCurrency(data, item, key, rng, [...omens]);
    if (r.applied) out.push({ p: 0, item: r.item, added: r.added, removed: r.removed });
  }
  for (const o of out) o.p = 1 / out.length;
  const res = out.length ? out : null;
  m.set(k, res);
  return res;
}
/** 数え上げられない手の一番多い結果の側の鍵 = 組む間の 1 箱 (側の鍵の無い箱) の形。数え上げられる手は undefined */
export function mainSideOf(data: PatchData, item: StageItem, h: Hand): string | undefined {
  if (h.repeat) return undefined;
  const n = new Map<string, number>();
  for (const o of rolledOutcomes(data, item, h.currency, engineOmens(h)) ?? []) { const k = sideKeyOf(item, o.item); if (k) n.set(k, (n.get(k) ?? 0) + 1); }
  return [...n].sort((a, z) => z[1] - a[1] || a[0].localeCompare(z[0]))[0]?.[0];
}
