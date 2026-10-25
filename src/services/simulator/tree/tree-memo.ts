/**
 * tree-memo.ts — メモの窓の札・箱のメモ・手で使っている物 (tree-model.ts から分けた、シミュ部長 25 本目 2026-10-25、1 ファイル 500 行まで。中身は前のまま)
 */
import { aimKey, type Aim, type TreeBox, type TreeDoc } from "./tree-model";

/** メモの窓の札を足す / 消す (同じ物は 1 つ) */
export function toggleMemoAim(d: TreeDoc, a: Aim): void {
  const list = d.memoAims ?? [];
  const has = list.some((x) => aimKey(x) === aimKey(a));
  const next = has ? list.filter((x) => aimKey(x) !== aimKey(a)) : [...list, { ...a }];
  if (next.length) d.memoAims = next; else delete d.memoAims;
}
export function toggleMemoCurrency(d: TreeDoc, key: string): void {
  const list = d.memoCurrencies ?? [];
  const next = list.includes(key) ? list.filter((x) => x !== key) : [...list, key];
  if (next.length) d.memoCurrencies = next; else delete d.memoCurrencies;
}
/** ツリーの手で使っている物 (カレンシー・お告げ・カタリスト)。並びは初めて出た順 */
export function handKeysOf(d: TreeDoc): string[] {
  const out: string[] = [];
  const add = (k: string | null | undefined): void => { if (k && !out.includes(k)) out.push(k); };
  for (const b of Object.values(d.boxes)) if (b.hand) { add(b.hand.currency); b.hand.omens.forEach(add); add(b.hand.catalyst); }
  return out;
}
/** その箱の手がこのキーを使っているか (札を押した時に光らせる) */
export const handUses = (b: TreeBox, key: string): boolean => !!b.hand && (b.hand.currency === key || b.hand.omens.includes(key) || b.hand.catalyst === key);

/** メモ (id = null はツリー全体)。空にすると消す */
export function setNote(d: TreeDoc, id: string | null, text: string): void {
  const v = text.trim() ? text : undefined;
  if (id === null) { if (v) d.note = v; else delete d.note; return; }
  const b = d.boxes[id];
  if (!b) return;
  if (v) b.note = v; else delete b.note;
}
