/**
 * 格 (普通 / 上級 / 完全、骨の保存された / 古代の) だけ替えた時に木を残す (S-57d・S-57d2、スイッチ gradeKeep・gradeKeepAll。11-11 オーナー「おｋで」)。
 * 新しい格で結果の箱を作り直し、前と同じ種類 (同じ鍵) の結果の箱は前の箱 (下の手と枝ごと) をそのまま使う。
 * 下限が上がって無くなった結果の箱だけ下ごと消す。ほかの手の替え (別のカレンシー・☑ を替えた) は今のまま全部消す (S-57)
 */
import { flag } from "../../../web/release-flags";
import { aimKey, drop, subtree, type Aim, type Hand, type TreeBox, type TreeDoc } from "./tree-model";
/** 削減の手前の枠の鍵 (l:) を外す (tree-whittle の stripLv と同じ。tree-model から import されるので tree-whittle を import すると輪になりページが落ちた) */
const stripLv = (k: string | undefined): string | undefined => k?.split(";").filter((x) => !x.startsWith("l:")).join(";") || undefined;

/**
 * 格を持つ手の元の名前。格の無い手は null。前は王者 (regal)・カオスだけ (設計図の「高貴」= exalt が入っていなかった)。
 * スイッチ gradeKeepAll (S-57d2) では、同じ系で付く MOD の下限だけ違う手 = 変成・増強・王者・高貴・カオスの 3 格と、骨の保存された ↔ 古代の (E-63・E-11d)。
 * 噛み切られた骨 (アイテムレベル 64 以下・冒涜専用 MOD もアイテムレベルの決まり)・変質した鎖骨 (置き場が違う) は格ではない
 */
const gradeBase = (c: string): string | null => {
  if (!flag("gradeKeepAll")) { const m = /^(regal|chaos)(?:_(?:greater|perfect))?$/.exec(c); return m ? m[1]! : null; }
  if (c === "desecrate" || c === "desecrate_ancient") return "bone";
  const m = /^(transmute|augment|regal|exalt|chaos)(?:_(?:greater|perfect))?$/.exec(c);
  return m ? m[1]! : null;
};
/** 格の系の名前 (手の窓の持ち替えでお告げを引き継ぐ見分け、S-57d2)。格の無い手はそのカレンシーの名前 */
export const gradeKindOf = (c: string): string => gradeBase(c) ?? c;
// スイッチ gradeKeepAll (S-57d2): ☑ の無い手の「印無し」と「狙い無し」(free) は同じ手と見る (手の窓は ☑ が無いと狙い無しを既定で付けるので、印の無い元の手と違うと見て下を作り直していた)。☑ は gradeOnly で別に比べる
// 残したい MOD (keep) は gradeOnly で別に比べる: 格を上げてその手で消えなくなった MOD は窓の候補から抜けるので、新しい手の keep が元の keep に収まれば同じ手 (足したら別の手)
const sig = (h: Hand): string => JSON.stringify({ ...h, currency: gradeBase(h.currency), catalystCount: undefined, quality: undefined, ...(flag("gradeKeepAll") ? { free: undefined, keep: undefined } : {}) });
const keepFits = (was: Hand, now: Hand): boolean => { const old = new Set((was.keep ?? []).map((a) => a.modId)); return !flag("gradeKeepAll") || (!!was.keep === !!now.keep && (now.keep ?? []).every((a) => old.has(a.modId))); };

/** 結果の箱の種類 (結果・当たりの狙い・まとめた狙い・枝の鍵)。sameFree = 狙い無しの「打った後」と印無しの「外れ」を同じ種類と見る (S-57d2) */
const outKey = (b: TreeBox, sameFree = false): string => `${sameFree && b.out === "any" ? "junk" : b.out}|${b.aim ? aimKey(b.aim) : ""}|${(b.anyOf ?? []).map(aimKey).sort().join()}|${b.junkKey ?? ""}`;
/** 前の当たりの箱の狙い (☑ の組) */
const hitAimsOf = (d: TreeDoc, b: TreeBox): string[] => [...new Set(b.outs.flatMap((o) => { const c = d.boxes[o]; return c?.out === "hit" ? [c.aim, ...(c.anyOf ?? [])].filter((a): a is Aim => !!a).map((a) => a.modId) : []; }))].sort();

/** 同じ手の格だけの替えか (お告げ・☑・ほかの印は同じ)。aims = 新しい手の ☑ */
export function gradeOnly(d: TreeDoc, b: TreeBox, hand: Hand, aims: readonly Aim[]): boolean {
  const was = b.hand;
  if (!flag("gradeKeep") || !was || was.currency === hand.currency || !gradeBase(hand.currency) || sig(was) !== sig(hand) || !keepFits(was, hand)) return false;
  const now = [...new Set(aims.map((a) => a.modId))].sort();
  // ☑ が無い手 (狙い無し) の前の当たりは狙いを持たないので比べない
  return !now.length || now.join() === hitAimsOf(d, b).join();
}

/** 前の結果の箱を外して持っておく (消さない)。setHand の下を消す所の代わり */
export const takeOuts = (d: TreeDoc, b: TreeBox): TreeBox[] => b.outs.map((o) => d.boxes[o]).filter((x): x is TreeBox => !!x);

/** 新しい結果の箱のうち前と同じ種類の物を前の箱 (下ごと) に差し替え、使わなかった前の箱は下ごと消す */
export function graftOuts(d: TreeDoc, b: TreeBox, old: readonly TreeBox[]): void {
  // スイッチ gradeKeepAll (S-57d2): 削減の手前の枠 (鍵 l:、低い・同じ・高い) は鍵の枠の分を外して比べ、同じ結果の枠を全部残す
  // (新しい結果の箱は枠に割る前の 1 箱。前は枠の鍵の違いで 1 つも合わず、枠と下の手が全部消えた)。付きえなくなった帯は後の数え直し (tree-grade-prune) が消す
  const all = flag("gradeKeepAll");
  const key = (x: TreeBox): string => (all ? outKey({ ...x, junkKey: stripLv(x.junkKey) }, true) : outKey(x));
  const left = new Map<string, TreeBox[]>();
  for (const o of old) { const k = key(o), l = left.get(k); if (!l) left.set(k, [o]); else if (all) l.push(o); }
  b.outs = b.outs.flatMap((id) => {
    const n = d.boxes[id]!, l = left.get(key(n));
    if (!l) return [id];
    left.delete(key(n));
    delete d.boxes[id];
    // 狙い無し ↔ 印無しで種類だけ違う前の箱は、下ごと残して種類を新しい手に合わせる (外れ ↔ 打った後)
    for (const o of l) if (o.out !== n.out && (o.out === "any" || o.out === "junk") && (n.out === "any" || n.out === "junk")) o.out = n.out;
    return l.map((o) => o.id);
  });
  for (const o of old) if (!b.outs.includes(o.id)) drop(d, subtree(d, o.id));
}
