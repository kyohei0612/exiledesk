/**
 * tree-slot-mods.ts — 枠を増やす MOD (S-04b、11-03 オーナー「MOD一覧で増やせるMOD上限足すだけでしょ？」)。
 * ジュエルの液化した軽蔑の「+1 プレ / サフィ枠」など。どの MOD が枠を増やすかは自前で持たず、エンジンの limitOf で見る
 * (その MOD 1 つだけを付けた形の枠の数が、白のレアより多ければ枠を増やす MOD)。
 * 完成形のカードは枠を増やす MOD を先に付けてからほかの狙いを付ける (後に付けると 3 つ目のサフィが枠の外に落ちた)。
 * 「途中で消える」(S-30) の枠を増やす MOD も先に付けて最後に外す: 増えた枠に付けた狙いは残る (エンジンの上限を超えた状態、E-11e の侮蔑の例)
 */
import { freshItem, limitOf, mulberry32, SIDES, type PatchData, type StageItem } from "../../../services/craft-stage/engine";
import { placeMods } from "../../../services/simulator/sim-engine";

type TierMod = { modId: string; tier: number; fractured?: boolean };

const slotMemo = new Map<string, number>();
/** その MOD を付けると増える枠の数 (プレ・サフィの合計。増えなければ 0) */
export function slotsAdded(data: PatchData, base: string, itemLevel: number, m: TierMod): number {
  const key = `${base}|${itemLevel}|${m.modId}#${m.tier}`;
  const hit = slotMemo.get(key);
  if (hit != null) return hit;
  let n = 0;
  try {
    const plain = freshItem(data, base, itemLevel, "rare");
    const one = placeMods(data, base, itemLevel, [{ modId: m.modId, tier: m.tier }], mulberry32(1));
    if (!one.left.length) n = SIDES.reduce((a, s) => a + Math.max(0, limitOf(one.item, s) - limitOf(plain, s)), 0);
  } catch { n = 0; }
  if (slotMemo.size > 500) slotMemo.clear();
  slotMemo.set(key, n);
  return n;
}

/**
 * 完成形のカードの形: 枠を増やす MOD (完成の狙い・途中で消える物) を先に付け、ほかの狙いを渡した順に付け、途中で消える物を外す。
 * left は placeMods と同じ (付けられなかった狙いと理由)。途中で消える物は left に入れない
 */
export function placeWithSlots(data: PatchData, base: string, itemLevel: number, aims: readonly TierMod[], way: readonly TierMod[], rng: () => number): ReturnType<typeof placeMods> {
  const adds = (m: TierMod): boolean => slotsAdded(data, base, itemLevel, m) > 0;
  const wayFirst = way.filter(adds);
  const order = [...wayFirst, ...aims.filter(adds), ...aims.filter((m) => !adds(m))];
  const r = placeMods(data, base, itemLevel, order, rng);
  if (!wayFirst.length) return r;
  const gone = new Set(wayFirst.map((m) => m.modId));
  const item: StageItem = { ...r.item, prefixes: r.item.prefixes.filter((m) => !gone.has(m.modId)), suffixes: r.item.suffixes.filter((m) => !gone.has(m.modId)) };
  return { item, left: r.left.filter((x) => !gone.has(x.modId)) };
}
