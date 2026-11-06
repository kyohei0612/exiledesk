/**
 * tree-strip-fold.ts — 消去の続きを畳む (S-28g ③、11-06 オーナー「消去は例のごとく2段以上に消去の枝だけでなるなら省略で書いて展開できるように作りたいね。止まったところは必ず表示させて」)。
 * 根 = 人が置いた消去の手の箱。その下で消去の続き (tree-annul-chain の自動の消去 autoAnnul) の箱が続く所を、根の最初の自動の消去の箱 (head) の場所に
 * 「消去 × n 段・止まり m」の札 1 枚で描き、ほかの自動の消去の箱は描かない。止まった箱 (同じ枠へ ↩・残り 1 MOD・人の決め) は札の下に並べる (head の描く子)。
 * 畳むのは描く所だけ (並べ方の段と帯・線・箱)。木の中身・回す・精査・保存・「n 段目」の数え (tree-row-tops の depthRows) は触らない。
 * 開いた / 畳んだは覚えない (木を開くたびに畳んだ形、画面が resetStripFolds を呼ぶ)。前の S-28b (全部消えてよい消去の直線) の札の作りをそのまま使う
 */
import { ref } from "vue";
import { effectOf } from "./tree-hands";
import type { TreeBox, TreeDoc } from "./tree-model";

/** 札の高さ (TreeStripFold。線は札の下の縁から下りる) */
export const FOLD_H = 64;
/** 畳んだ続き: head = 札に描く箱 (根の最初の自動の消去の箱)、mids = 自動の消去の箱全部 (head 込み)、stops = 札の下に並べる止まった箱、steps = 消去の段の数 (根を含む) */
export interface StripFold { head: string; mids: string[]; stops: string[]; steps: number }

/** 開いた続き (head の id)。保存しない */
export const stripOpen = ref<ReadonlySet<string>>(new Set());
export const resetStripFolds = (): void => { if (stripOpen.value.size) stripOpen.value = new Set(); };
export function toggleStripFold(head: string): void {
  const s = new Set(stripOpen.value);
  if (!s.delete(head)) s.add(head);
  stripOpen.value = s;
}

const isAnnul = (b: TreeBox | undefined): boolean => !!b?.hand && effectOf(b.hand.currency) === "remove";
/** 消去の続きの自動の手の箱 */
const inner = (b: TreeBox | undefined): boolean => !!b?.autoAnnul && isAnnul(b);

/** 畳める続きを全部 (開いた物も)。head → 畳み */
export function stripChains(d: TreeDoc): Map<string, StripFold> {
  const out = new Map<string, StripFold>();
  for (const r of Object.values(d.boxes)) {
    // 根 = 人の消去の手 (自動の消去でない) で、下に消去の続きがある = 消去だけが 2 段以上続く (S-28g ③)
    if (!isAnnul(r) || r.autoAnnul) continue;
    const head = r.outs.find((o) => inner(d.boxes[o]));
    if (!head) continue;
    const mids: string[] = [], stops: string[] = [];
    let steps = 1;
    const walk = (id: string, n: number): void => {
      const b = d.boxes[id];
      if (!b) return;
      if (!inner(b)) { stops.push(id); return; }
      mids.push(id); steps = Math.max(steps, n + 1);
      for (const o of b.outs) walk(o, n + 1);
    };
    for (const o of r.outs) walk(o, 1);
    out.set(head, { head, mids, stops, steps });
  }
  return out;
}
/** 今畳んでいる続き (開いた物を除く) */
export const stripFolds = (d: TreeDoc): Map<string, StripFold> => {
  const all = stripChains(d), open = stripOpen.value;
  for (const k of [...all.keys()]) if (open.has(k)) all.delete(k);
  return all;
};
/** 描かない箱 (畳んだ続きの head 以外の自動の消去の箱) */
export function stripHidden(d: TreeDoc, folds = stripFolds(d)): Set<string> {
  const s = new Set<string>();
  for (const f of folds.values()) for (const id of f.mids) if (id !== f.head) s.add(id);
  return s;
}
/** 描く子 (根は札だけ、札は止まった箱全部、描かない箱は子無し) */
export function foldOuts(d: TreeDoc, b: TreeBox, folds = stripFolds(d), hidden = stripHidden(d, folds)): string[] {
  if (hidden.has(b.id)) return [];
  const f = folds.get(b.id);
  if (f) return f.stops;
  const head = b.outs.find((o) => folds.has(o));
  return head ? [head] : b.outs;
}
/** 止まった箱 → 札 (線を札から引く。スマホの全体図) */
export const stopToHead = (folds: ReadonlyMap<string, StripFold>): Map<string, string> => new Map([...folds.values()].flatMap((f) => f.stops.map((s) => [s, f.head] as const)));
/** その箱を隠している畳んだ続き (寄る前に開く用) */
export const foldOf = (d: TreeDoc, id: string): StripFold | null => [...stripFolds(d).values()].find((f) => f.mids.includes(id) && f.head !== id) ?? null;
/** 並べ方の変わる時に掛け直す鍵 (開いた / 畳んだを含む) */
export const stripFoldKey = (d: TreeDoc): string => [...stripFolds(d).keys()].join("+");
