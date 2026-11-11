/**
 * 高貴・カオスの格 (普通 / 上級 / 完全) だけ替えた時に木を残す (S-57d、スイッチ gradeKeep、開発版だけ。11-11 オーナー「おｋで」)。
 * 新しい格で結果の箱を作り直し、前と同じ種類 (同じ鍵) の結果の箱は前の箱 (下の手と枝ごと) をそのまま使う。
 * 下限が上がって無くなった結果の箱だけ下ごと消す。ほかの手の替え (別のカレンシー・☑ を替えた) は今のまま全部消す (S-57)
 */
import { flag } from "../../../web/release-flags";
import { aimKey, drop, subtree, type Aim, type Hand, type TreeBox, type TreeDoc } from "./tree-model";

/** 格を持つ手 (高貴・カオス) の元の名前。格の無い手は null */
const gradeBase = (c: string): string | null => { const m = /^(regal|chaos)(?:_(?:greater|perfect))?$/.exec(c); return m ? m[1]! : null; };
const sig = (h: Hand): string => JSON.stringify({ ...h, currency: gradeBase(h.currency), catalystCount: undefined, quality: undefined });

/** 結果の箱の種類 (結果・当たりの狙い・まとめた狙い・枝の鍵) */
const outKey = (b: TreeBox): string => `${b.out}|${b.aim ? aimKey(b.aim) : ""}|${(b.anyOf ?? []).map(aimKey).sort().join()}|${b.junkKey ?? ""}`;
/** 前の当たりの箱の狙い (☑ の組) */
const hitAimsOf = (d: TreeDoc, b: TreeBox): string[] => [...new Set(b.outs.flatMap((o) => { const c = d.boxes[o]; return c?.out === "hit" ? [c.aim, ...(c.anyOf ?? [])].filter((a): a is Aim => !!a).map((a) => a.modId) : []; }))].sort();

/** 同じ手の格だけの替えか (お告げ・☑・ほかの印は同じ)。aims = 新しい手の ☑ */
export function gradeOnly(d: TreeDoc, b: TreeBox, hand: Hand, aims: readonly Aim[]): boolean {
  const was = b.hand;
  if (!flag("gradeKeep") || !was || was.currency === hand.currency || !gradeBase(hand.currency) || sig(was) !== sig(hand)) return false;
  const now = [...new Set(aims.map((a) => a.modId))].sort();
  // ☑ が無い手 (狙い無し) の前の当たりは狙いを持たないので比べない
  return !now.length || now.join() === hitAimsOf(d, b).join();
}

/** 前の結果の箱を外して持っておく (消さない)。setHand の下を消す所の代わり */
export const takeOuts = (d: TreeDoc, b: TreeBox): TreeBox[] => b.outs.map((o) => d.boxes[o]).filter((x): x is TreeBox => !!x);

/** 新しい結果の箱のうち前と同じ種類の物を前の箱 (下ごと) に差し替え、使わなかった前の箱は下ごと消す */
export function graftOuts(d: TreeDoc, b: TreeBox, old: readonly TreeBox[]): void {
  const left = new Map<string, TreeBox>();
  for (const o of old) if (!left.has(outKey(o))) left.set(outKey(o), o);
  b.outs = b.outs.map((id) => {
    const n = d.boxes[id]!, o = left.get(outKey(n));
    if (!o) return id;
    left.delete(outKey(n));
    delete d.boxes[id];
    return o.id;
  });
  for (const o of old) if (!b.outs.includes(o.id)) drop(d, subtree(d, o.id));
}
