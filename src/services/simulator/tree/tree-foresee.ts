/**
 * tree-foresee.ts — ヒネコラの髪束の予見を木で組む (S-39、開発版だけ。11-05 オーナー「枠を紫にしようかヒネコラで持ってる挙動」
 * 「予見で選んだ当たり以外は等しくゴミなんだよね…狙いの動き以外はすべてハズレＭＯＤ扱いだから結果まとめれると思うんだよね」)。
 * 予見はエンジンの印 (apply-extra の hinekora = StageItem.foreseen、アイテムを変えると消える)。手と結果の分け方はエンジンのまま。
 * ヒネコラの結果の箱に持った手の結果は、当たり (☑ の MOD が付いた箱) は使う、ほか (外れ・狙いが消えた・打った後) は 1 つの「ハズレ (打たない)」箱へまとめる。
 * ハズレの人は手を使わず (費用も無し)、持つ前のアイテムのまま、ハズレ箱の手 (別のカレンシー) か ↩ へ (見本は tree-sample、回すのは tree-run)
 */
import type { TreeDoc } from "./tree-model";
import { bandsOn } from "./tree-band";
import { isWhittleHand, lvPart } from "./tree-whittle";
import { tr } from "../../../i18n/lang";
import { flag, type Flag } from "../../../web/release-flags";
// MOD が付かない・消えない・入れ替わらない手か (神・ヒネコラなど) はエンジンの keepsMods (sim-engine、11-07 オーナー「ゲームシステムはジンだけ」。前はここに同じ打ち方の写し)

/** 本番でも出す (11-10 オーナー「おｋ」。前は開発版だけ = DEV_BUILD。棚のヒネコラ・予見したアイテムの棚の絞り、紫の枠、ハズレのまとめがこれを見る) */
export const FORESEE_ON = true;

/** 予見の枠で持つ手を複数 (S-39 ⑧、11-11 オーナー「おｋ」)。スイッチの表はデザインの持ち場なので、名前が無い間は閉じる */
const multiOn = (): boolean => { try { return flag("heldMulti" as Flag); } catch { return false; } };

/** 持った手のハズレ箱 (どれも出なかった、まとめ先の先頭) か */
export function missHubAt(doc: TreeDoc, id: string): boolean {
  const b = doc.boxes[id];
  return !!b?.seen && !b.merged && !!b.parent && holdsAt(doc, b.parent);
}

/** ヒネコラの結果の箱 (予見したアイテム。ここの手は「持つ」)。S-39 ⑧: ハズレ箱に「持つ」印の手 (held) を置いた時もその手は持つ (もう 1 つ予見で見る) */
export function holdsAt(doc: TreeDoc, id: string): boolean {
  const b = doc.boxes[id], p = b?.parent ? doc.boxes[b.parent] : undefined;
  if (!FORESEE_ON || !b) return false;
  if (p?.hand?.currency === "hinekora") return true;
  return !!b.hand?.held && multiOn() && missHubAt(doc, id);
}

/** ハズレ箱に次の持つ手を置けるか (S-39 ⑧、手の窓の「打つ / 持つ」の選び) */
export const canHoldMore = (doc: TreeDoc, id: string): boolean => FORESEE_ON && multiOn() && missHubAt(doc, id);

/** 予見の鎖の上で持った手 (この箱の親から予見の箱まで、S-39 ⑧)。同じカレンシーを持たせないため */
function heldAbove(doc: TreeDoc, id: string): string[] {
  const out: string[] = [];
  for (let x = doc.boxes[id]; x?.seen && x.parent && holdsAt(doc, x.parent); x = doc.boxes[x.parent]) { const h = doc.boxes[x.parent]!.hand; if (h) out.push(h.currency); }
  return out;
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
  // 削減の手前の枠で持つ削減 (S-39 ②b、スイッチ whittleBands): 枠ごとに 打つ = ハズレにまとめない (ふつうの削減の結果を使う) / 打たない = 当たりも全部ハズレ
  const b0 = doc.boxes[id], lvHeld = bandsOn() && !!b0 && isWhittleHand(b0.hand) && !!lvPart(b0.junkKey);
  // 印の無い前の木 (11-11 ブラック 79 の OK): 低い = 打つ、同じ・高い = 打たない にそろえる
  if (lvHeld && !b0!.hand!.noUse && !b0!.hand!.useHeld) { if (lvPart(b0!.junkKey) === "lo") b0!.hand!.useHeld = true; else b0!.hand!.noUse = true; }
  if (lvHeld && !b0!.hand!.noUse) return;
  // まとめ先 (先頭) は当たり以外から (打たない枠で当たりの箱がハズレの顔になって当たりの印が出ないように)
  const miss = (doc.boxes[id]?.outs ?? []).filter((o) => doc.boxes[o] && (lvHeld || doc.boxes[o]!.out !== "hit")).sort((a, z) => Number(doc.boxes[a]!.out === "hit") - Number(doc.boxes[z]!.out === "hit"));
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
  // 持つ手を複数 (S-39 ⑧) の時は、予見の鎖の上で持った手のどれとも同じなら止める (前の手のハズレの人は、その手を予見で見ている)
  const b = doc.boxes[id], seen = multiOn() ? heldAbove(doc, id) : [b?.seen && b.parent ? doc.boxes[b.parent]?.hand?.currency : undefined];
  return seen.includes(key) ? tr("予見で見た手と同じ (同じ結果になる)。別のカレンシー・神のオーブ・↩ ヒネコラの前から選ぶ", "Same as the foreseen craft (same result). Pick another currency, a Divine Orb, or return to before Hinekora") : null;
}

/** 持つ手の窓の「結果の箱」の名前: 予見の箱なら 当たりの名前 + 「ハズレ (打たない)」(当たり以外は 1 つのハズレ箱にまとまる、前は 狙いが消えた + 外れ + 当たり と出た)。予見の箱でなければ null */
export function heldOutNames<O extends { out: string }>(doc: TreeDoc, id: string, l: readonly O[], name: (o: O) => string): string[] | null {
  if (!holdsAt(doc, id)) return null;
  return [...new Set(l.filter((o) => o.out === "hit").map(name))].concat(l.some((o) => o.out !== "hit") ? [tr("ハズレ (打たない)", "Miss (not used)")] : []);
}
