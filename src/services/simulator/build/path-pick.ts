/**
 * シミュレーターの入口 ②③ (2026-10-22 オーナー、設計 docs/org/simulator/notes/2026-10-22-entry-design.md)。
 * クラフト台で乱数を引かずに「この MOD を付ける」を選んで 1 手ずつ打つための部品 (空打ち = 狙いの付かない行き先を出る割合どおりに 1 つ)。
 * 行き先の一覧はエンジンの入口の stepOutcomes (打つ処理と同じ planSpec の全部の枝)、選んだ行き先は
 * 「打つとその行き先になる手の種」をエンジンの applyCurrency で探して、クラフト台の use(key, { seed }) で普通に打つ。
 * 種は工程の記録 (手の seed) に残るので、手順 JSON・再生 (stage-replay.ts) は今のまま同じ道を辿る。自前の確率・重みは持たない
 */
import { allMods, applyCurrency, mulberry32, stepOutcomes, type PatchData, type StageItem, type StageMod, type StepOutcome } from "../../craft-stage/engine";

/** 狙い (完成品の MOD)。段は tierIndex が大きいほど良い (エンジンの hits と同じ) */
export interface PathTarget { modId: string; minTierIndex: number; alts?: Array<{ modId: string; minTierIndex: number }> }

/** 狙いか、その「あるいは」(alts) のどれかに当たる */
export const hitsTarget = (m: StageMod, t: PathTarget): boolean => !m.unrevealed && [t, ...(t.alts ?? [])].some((x) => m.modId === x.modId && m.tierIndex >= x.minTierIndex);
export const heldTargets = (item: StageItem, ts: readonly PathTarget[]): boolean[] => ts.map((t) => allMods(item).some((m) => hitsTarget(m, t)));

/** 行き先の形 (数値は見ない): レアリティ + MOD と段・印 */
const modKey = (m: StageMod): string => `${m.modId}#${m.tierIndex}${m.fractured ? "f" : ""}${m.desecrated ? "d" : ""}${m.unrevealed ? "u" : ""}`;
export const shapeOf = (it: StageItem): string => `${it.rarity}|${allMods(it).map(modKey).sort().join(",")}`;

/** 選ぶ欄の 1 行: 付く MOD 1 つ (段ごとの札) か、付かない行き先 (消えるだけ・不成立) */
/** hit = この段で狙いに当たる (狙いの MOD でも段が足りなければ外れ) */
export interface PickTier { tierName: string; tierIndex: number; p: number; outcome: StepOutcome; hit: boolean }
export interface PickRow { key: string; added: StageMod[]; tiers: PickTier[]; p: number; hit: boolean }
export interface PickGroup { removedKey: string; removed: StageMod[]; p: number; rows: PickRow[] }
/**
 * 行き先を「消える MOD」で分け、その中を「付く MOD」(段は札) でまとめる。狙いに当たる行が先、あとは出やすい順。
 * 行き先で表せない手 (発現・品質・数値) と 1 通りしかない手は null (選ぶ物が無いので普通に打つ)
 */
export function pickGroups(data: PatchData, item: StageItem, key: string, omens: readonly string[], targets: readonly PathTarget[]): PickGroup[] | null {
  const outs = stepOutcomes(data, item, key, omens);
  if (!outs || outs.length < 2) return null;
  const groups = new Map<string, PickGroup>();
  for (const o of outs) {
    const removed = o.void ? [] : o.removed;
    const gk = o.void ? "void" : removed.map(modKey).sort().join(",");
    const g = groups.get(gk) ?? { removedKey: gk, removed, p: 0, rows: [] };
    g.p += o.p;
    groups.set(gk, g);
    const added = o.void ? [] : o.added;
    // 段の違いだけの行き先は 1 行にまとめる (付く MOD が 1 つの時。2 つ付く手は組ごとに 1 行)
    const one = added.length === 1 ? added[0] : null;
    const rk = one ? one.modId : added.map(modKey).sort().join(",") || (o.void ? "void" : "none");
    let row = g.rows.find((r) => r.key === rk);
    if (!row) { row = { key: rk, added, tiers: [], p: 0, hit: false }; g.rows.push(row); }
    row.p += o.p;
    const hit = added.some((m) => targets.some((t) => hitsTarget(m, t)));
    row.tiers.push({ tierName: one?.tierName ?? "", tierIndex: one?.tierIndex ?? 0, p: o.p, outcome: o, hit });
    if (hit) row.hit = true;
  }
  const list = [...groups.values()];
  for (const g of list) {
    for (const r of g.rows) r.tiers.sort((a, b) => b.tierIndex - a.tierIndex);
    g.rows.sort((a, b) => Number(b.hit) - Number(a.hit) || b.p - a.p);
  }
  return list.sort((a, b) => b.p - a.p);
}

/**
 * 打つとその行き先になる手の種を探す (クラフト台の use と同じ applyCurrency・同じお告げ)。
 * 1 回で見つからない時に備えて、決まった手数ずつ区切って呼ぶ (from から n 個)。見つからなければ null
 */
export function seedFor(data: PatchData, item: StageItem, key: string, omens: readonly string[], want: StepOutcome, from: number, n: number): number | null {
  const goal = shapeOf(want.void ? item : want.item);
  for (let s = from; s < from + n; s++) {
    const r = applyCurrency(data, item, key, mulberry32(s), [...omens]);
    if (r.applied && shapeOf(r.item) === goal) return s;
  }
  return null;
}

/**
 * 空打ち (打ったが狙いは付かなかった 1 手、オーナー 10-22): 新しく狙いが付かない行き先から、出る割合どおりに 1 つ選ぶ。無ければ null。
 * r は 0〜1 の乱数 (画面は Math.random)
 */
export function missOutcome(groups: readonly PickGroup[], r: number): StepOutcome | null {
  const outs = groups.flatMap((g) => g.rows.flatMap((x) => x.tiers.filter((t) => !t.hit).map((t) => ({ p: t.p, o: t.outcome }))));
  const total = outs.reduce((a, x) => a + x.p, 0);
  if (!(total > 0)) return null;
  let left = r * total;
  for (const x of outs) { left -= x.p; if (left <= 0) return x.o; }
  return outs[outs.length - 1]!.o;
}
