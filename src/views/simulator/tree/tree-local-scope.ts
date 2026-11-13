/**
 * tree-local-scope.ts — 組んでいる間の木の整えの範囲 (S-142m ① D、スイッチ treeLocalLink)。
 * 組み替えのたびの自動のつなぎ直し (自動の ↩・まとめ・同じ中身の幹へ畳む・消去の続きと畳み) を、変わった箱とその下だけで見る。
 * ほかの枝は完成・最終チェック (armFullTidy の後の組み替え)・木を開いた時にまとめて揃える
 * (11-13 オーナー「フラクチャー後がものすんごいんだからあっちいったりこっちいったり」。提出の木で 1 手の消去が別の枝の 31 箱を動かした)
 */
import { subtree, type TreeBox, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { flag } from "../../../web/release-flags";
import { craftStage } from "../../../state/craft-stage";
import { judgeMemo } from "../../../services/simulator/tree/tree-judge";
import { foldToTrunks } from "../../../services/simulator/tree/tree-judge-link";

/** 範囲の中か (null = 木全体) */
export type Scope = ((id: string) => boolean) | null;

/** 手を決めている箱 (ツリーの画面が手を決める組み替えの間だけ立てる。開く時の組み直し・猿・スマホは立てない = 木全体) */
let pickRoot: string | null = null;
/** 次の組み替えは木全体で揃える (完成・最終チェック) */
let full = false;

/** 箱 id に手を決める組み替え fn の間、整えを id とその下に絞る (スイッチが閉じていれば何もしない) */
export function withPickScope<T>(id: string, fn: () => T): T {
  const was = pickRoot;
  pickRoot = flag("treeLocalLink") ? id : null;
  try { return fn(); } finally { pickRoot = was; }
}
/** 手を決める組み替えの範囲 (applyPick の中で使う): 手を置いた箱とその下。立っていなければ null */
export function pickScope(d: TreeDoc): Scope {
  if (!pickRoot || !d.boxes[pickRoot]) return null;
  const s = new Set(subtree(d, pickRoot));
  return (id) => s.has(id);
}
/** 次の組み替えを木全体で揃える印 (完成・最終チェックを押した時、S-142m ①) */
export const armFullTidy = (): void => { full = true; };
/**
 * 木全体を揃える (完成・最終チェックを押した時、S-142m ①): 同じ中身の手のある箱を幹へ畳み (S-51d、開いた時の組み直しの終わりと同じ)、
 * 組み替えの整理を木全体で回す。1 つ戻すで戻る。スイッチが閉じていれば何もしない (組んでいる間も木全体で揃っている)
 */
export function settleNow(edit: (fn: (d: TreeDoc) => void) => void): void {
  if (!flag("treeLocalLink")) return;
  armFullTidy();
  try {
    edit((d) => { const data = craftStage.data.value; if (data) foldToTrunks(d, () => judgeMemo(data, d)); });
  } finally { full = false; }
}

const mark = (b: TreeBox): string => JSON.stringify([b.hand ?? null, b.back ?? null, b.done ?? null, b.split ?? null]);
/**
 * 組み替え (use-tree の edit) の後の整理の範囲: 前 a と後 b で手・↩・完成 / 失敗・分かれ目が変わった箱と新しい箱はその下ごと、
 * 子の並びだけ変わった箱は自分と新しい子の下 (兄弟の枝は入れない)。木全体で見る時 (スイッチが閉じている・開いた時・armFullTidy の後) は null
 */
export function touchedScope(a: TreeDoc, b: TreeDoc, open: boolean): Scope {
  const all = full || open || !flag("treeLocalLink");
  full = false;
  if (all) return null;
  const s = new Set<string>();
  const add = (id: string): void => { for (const x of subtree(b, id)) s.add(x); };
  for (const x of Object.values(b.boxes)) {
    const o = a.boxes[x.id];
    if (!o || mark(o) !== mark(x)) { add(x.id); continue; }
    if (o.outs.join() === x.outs.join()) continue;
    s.add(x.id);
    for (const k of x.outs) if (!o.outs.includes(k)) add(k);
  }
  return (id) => s.has(id);
}
/** 範囲で絞る (null = そのまま) */
export const within = (ids: readonly string[], sc: Scope): string[] => (sc ? ids.filter(sc) : [...ids]);
