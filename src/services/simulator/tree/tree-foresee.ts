/**
 * tree-foresee.ts — ヒネコラの髪束の予見を木で組む (S-39、開発版だけ。11-05 オーナー「枠を紫にしようかヒネコラで持ってる挙動」
 * 「予見で選んだ当たり以外は等しくゴミなんだよね…狙いの動き以外はすべてハズレＭＯＤ扱いだから結果まとめれると思うんだよね」)。
 * 予見はエンジンの印 (apply-extra の hinekora = StageItem.foreseen、アイテムを変えると消える)。手と結果の分け方はエンジンのまま。
 * ヒネコラの結果の箱に持った手の結果は、当たり (☑ の MOD が付いた箱) は使う、ほか (外れ・狙いが消えた・打った後) は 1 つの「ハズレ (打たない)」箱へまとめる。
 * ハズレの人は手を使わず (費用も無し)、持つ前のアイテムのまま、ハズレ箱の手 (別のカレンシー) か ↩ へ (見本は tree-sample、回すのは tree-run)
 */
import type { TreeDoc } from "./tree-model";
import { tr } from "../../../i18n/lang";
// MOD が付かない・消えない・入れ替わらない手か (神・ヒネコラなど) はエンジンの keepsMods (sim-engine、11-07 オーナー「ゲームシステムはジンだけ」。前はここに同じ打ち方の写し)

/** 本番でも出す (11-10 オーナー「おｋ」。前は開発版だけ = DEV_BUILD。棚のヒネコラ・予見したアイテムの棚の絞り、紫の枠、ハズレのまとめがこれを見る) */
export const FORESEE_ON = true;

/** ヒネコラの結果の箱 (予見したアイテム。ここの手は「持つ」) */
export function holdsAt(doc: TreeDoc, id: string): boolean {
  const b = doc.boxes[id], p = b?.parent ? doc.boxes[b.parent] : undefined;
  return FORESEE_ON && !!b && p?.hand?.currency === "hinekora";
}

/** 予見で見えた結果の箱 (ヒネコラの結果の箱に持った手の結果) */
export const foreseenAt = (doc: TreeDoc, id: string): boolean => { const p = doc.boxes[id]?.parent; return !!p && holdsAt(doc, p); };

/** 持った手に当たりの箱が無い (狙い無し = 全部ハズレ) */
export const noHitHeld = (doc: TreeDoc, id: string): boolean => holdsAt(doc, id) && !!doc.boxes[id]?.hand && !(doc.boxes[id]?.outs ?? []).some((o) => doc.boxes[o]?.out === "hit");

/**
 * 持った手を決めた時 (afterHandSet): 当たり以外の結果の箱を「ハズレ (打たない)」(TreeBox.seen) にし、先頭の 1 つ (ハズレ箱) へまとめる。
 * ほかはまとめて描かない箱 (tree-merge-open の印、線はハズレ箱へ入る)。中身は持つ前と同じ予見済みなので、自動の ↩ は付けない (noAutoBack)
 */
export function foldMisses(doc: TreeDoc, id: string): void {
  if (!holdsAt(doc, id)) return;
  const miss = (doc.boxes[id]?.outs ?? []).filter((o) => doc.boxes[o] && doc.boxes[o]!.out !== "hit");
  const hub = miss[0];
  for (const o of miss) {
    const b = doc.boxes[o]!;
    b.seen = true;
    b.noAutoBack = true;
    b.done = null;
    delete b.handBack;
    if (o === hub) { if (b.autoBack) { b.back = null; delete b.autoBack; delete b.merged; } continue; }
    b.back = hub;
    b.autoBack = true;
    b.merged = true;
  }
}

/** ハズレの人が進む箱 (まとめたハズレ箱) */
export const seenTo = (doc: TreeDoc, id: string): string => { const b = doc.boxes[id]; return b?.merged && b.back && doc.boxes[b.back]?.seen ? b.back : id; };

/** ハズレ箱で、予見で見た手と同じカレンシーを持った時の理由 (予見の結果は決まっているので、使っても見た結果と同じ。木では別の乱数になるので持たせない) */
export function foreseeBlock(doc: TreeDoc, id: string, key: string): string | null {
  const b = doc.boxes[id], h = b?.seen && b.parent ? doc.boxes[b.parent]?.hand : null;
  return h?.currency === key ? tr("予見で見た手と同じ (同じ結果になる)。別のカレンシー・神のオーブ・↩ ヒネコラの前から選ぶ", "Same as the foreseen craft (same result). Pick another currency, a Divine Orb, or return to before Hinekora") : null;
}

/** 持つ手の窓の「結果の箱」の名前: 予見の箱なら 当たりの名前 + 「ハズレ (打たない)」(当たり以外は 1 つのハズレ箱にまとまる、前は 狙いが消えた + 外れ + 当たり と出た)。予見の箱でなければ null */
export function heldOutNames<O extends { out: string }>(doc: TreeDoc, id: string, l: readonly O[], name: (o: O) => string): string[] | null {
  if (!holdsAt(doc, id)) return null;
  return [...new Set(l.filter((o) => o.out === "hit").map(name))].concat(l.some((o) => o.out !== "hit") ? [tr("ハズレ (打たない)", "Miss (not used)")] : []);
}
