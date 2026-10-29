/**
 * tree-strip-fold.ts — 全部消えてよい消去の直線を畳む (S-28b 案 A、スイッチ stripFold。10-29 深夜オーナー「1 それで」)。
 * 直線 = 消去 (全部消えてよい) の手のある箱から結果の箱が 1 つずつ続く所 (tree-hand-plan の stripChain)。最初の結果の箱と最後の箱は今のまま、
 * 間の箱が 2 つ以上なら、間の最初の箱 (head) を「≈ 途中 n 箱」の札に描き、残りの間の箱は描かない。head の線は最後の箱へ直に引く。
 * 畳むのは描く所だけ (並べ方の段と帯・線・箱)。木の中身・回す・精査・保存・「n 段目」の数え (tree-row-tops の depthRows) は触らない。
 * 開いた / 畳んだは覚えない (木を開くたびに畳んだ形、画面が resetStripFolds を呼ぶ)
 */
import { ref } from "vue";
import { flag } from "../../../web/release-flags";
import { effectOf } from "./tree-hands";
import type { TreeBox, TreeDoc } from "./tree-model";

/** 札の高さ (TreeStripFold。線は札の下の縁から下りる) */
export const FOLD_H = 64;
/** 畳んだ直線: head = 札に描く箱 (間の最初)、mids = 間の箱全部 (head 込み)、last = 最後の箱 */
export interface StripFold { head: string; mids: string[]; last: string }

/** 開いた直線 (head の id)。保存しない */
export const stripOpen = ref<ReadonlySet<string>>(new Set());
export const resetStripFolds = (): void => { if (stripOpen.value.size) stripOpen.value = new Set(); };
export function toggleStripFold(head: string): void {
  const s = new Set(stripOpen.value);
  if (!s.delete(head)) s.add(head);
  stripOpen.value = s;
}

/** 全部消えてよい消去の手で、結果の箱が 1 つの箱 */
const stripStep = (d: TreeDoc, b: TreeBox | undefined): boolean => !!b?.hand?.keep && !b.hand.keep.length && effectOf(b.hand.currency) === "remove" && b.outs.length === 1 && !!d.boxes[b.outs[0]!];

/** 畳める直線を全部 (開いた物も)。head → 畳み */
export function stripChains(d: TreeDoc): Map<string, StripFold> {
  const out = new Map<string, StripFold>();
  if (!flag("stripFold") || !flag("layoutOne") || !flag("lineShort")) return out;
  for (const p of Object.values(d.boxes)) {
    // 直線の始まり = 消去の手のある箱で、自分は直線の途中でない (親が 1 つの結果の消去でない)
    if (!stripStep(d, p) || stripStep(d, d.boxes[p.parent ?? ""])) continue;
    const line: string[] = [];
    const seen = new Set<string>();
    for (let c: TreeBox | undefined = d.boxes[p.outs[0]!]; c && !seen.has(c.id); c = stripStep(d, c) ? d.boxes[c.outs[0]!] : undefined) { seen.add(c.id); line.push(c.id); }
    // 最初と最後を除いた間が 2 つ以上の時だけ (S-28b)
    if (line.length < 4) continue;
    out.set(line[1]!, { head: line[1]!, mids: line.slice(1, -1), last: line[line.length - 1]! });
  }
  return out;
}
/** 今畳んでいる直線 (開いた物を除く) */
export const stripFolds = (d: TreeDoc): Map<string, StripFold> => {
  const all = stripChains(d), open = stripOpen.value;
  for (const k of [...all.keys()]) if (open.has(k)) all.delete(k);
  return all;
};
/** 描かない箱 (畳んだ直線の head 以外の間の箱) */
export function stripHidden(d: TreeDoc, folds = stripFolds(d)): Set<string> {
  const s = new Set<string>();
  for (const f of folds.values()) for (const id of f.mids.slice(1)) s.add(id);
  return s;
}
/** 描く子 (畳んだ head は最後の箱へ、描かない箱は子無し) */
export function foldOuts(d: TreeDoc, b: TreeBox, folds = stripFolds(d), hidden = stripHidden(d, folds)): string[] {
  if (hidden.has(b.id)) return [];
  const f = folds.get(b.id);
  return f ? [f.last] : b.outs;
}
/** その箱を含む畳んだ直線 (寄る前に開く用) */
export const foldOf = (d: TreeDoc, id: string): StripFold | null => [...stripFolds(d).values()].find((f) => f.mids.includes(id)) ?? null;
/** 並べ方の変わる時に掛け直す鍵 (開いた / 畳んだを含む) */
export const stripFoldKey = (d: TreeDoc): string => [...stripFolds(d).keys()].join("+");
