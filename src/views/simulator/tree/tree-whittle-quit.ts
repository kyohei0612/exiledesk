/**
 * tree-whittle-quit.ts — 削減の手をまとめてやめる入口 2 つ (S-65c5、スイッチ treeWhittleQuit)。
 * ① 帯 (低い・同じ・高い) の右の「削減をやめる」: 確かめ 1 回の後、枠を 1 つの箱に戻して次に打つ手の窓を開く (askQuit → quitWhittle)
 * ② 手の窓で削減の手を別の手に替える時、ほかの枠にも削減の手が残っていれば、確かめの窓に「削減を全部やめる」を足す (quitChoiceOf → armQuitAll → pickQuit)
 * 枠を畳む決まりは今のまま (S-65c ⑦、tree-whittle-pre の unsplit): ほかの枠の削減の手を先に外してから、残す枠で畳むだけ = 出来る木は枠を 1 つずつ替えた時と同じ
 */
import { ref } from "vue";
import { craftStage } from "../../../state/craft-stage";
import { clearHand, subtree, type Aim, type Hand, type HandKind, type TreeBox, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { isWhittleHand, lvPart } from "../../../services/simulator/tree/tree-whittle";
import { frameSiblings } from "../../../services/simulator/tree/tree-whittle-scene";
import { flag } from "../../../web/release-flags";
import { applyPick, syncSameMod, type OnlyOut } from "./tree-hand-plan";
import { syncWhittlePre } from "./tree-whittle-pre";

/** 箱 id と同じ組の枠 (低い・同じ・高い) */
const framesOf = (d: TreeDoc, id: string): TreeBox[] => frameSiblings(d, id).filter((x) => !!lvPart(x.junkKey));

/** ほかの枠の削減の手を外す (枠はまだ畳まない。畳むのはこの後の組み替え) */
function dropOthers(d: TreeDoc, id: string): void {
  for (const x of framesOf(d, id)) if (x.id !== id && isWhittleHand(x.hand)) clearHand(d, x.id);
}

/** 削減をやめる: 枠 id だけ残して 1 つの箱に戻す (id の削減の手も外す = 次に打つ手を選び直す形) */
export function quitWhittle(d: TreeDoc, id: string): void {
  const p = d.boxes[id]?.parent ?? null, data = craftStage.data.value;
  if (!p || !data) return;
  dropOthers(d, id);
  if (isWhittleHand(d.boxes[id]?.hand)) clearHand(d, id);
  syncSameMod(data, d, p);
  syncWhittlePre(data, d, p, id);
}

/** ① の確かめの中身 (null = 聞いていない)。frames = 枠の数、n = 消える人の手の数 (削減の手も数える。自動の消去の続きは数えない) */
export const quitAsk = ref<{ frames: number; n: number; go: () => void } | null>(null);

/** 帯の右の「削減をやめる」を押した: 必ず 1 回聞く (同じ操作を木の写しに先に通して、消える手を数える) */
export function askQuit(doc: TreeDoc, id: string, go: () => void): void {
  const fs = framesOf(doc, id);
  const hands = [...new Set(fs.flatMap((x) => subtree(doc, x.id)))].filter((x) => { const b = doc.boxes[x]; return !!b?.hand && !b.autoAnnul; });
  const after = JSON.parse(JSON.stringify(doc)) as TreeDoc;
  quitWhittle(after, id);
  quitAsk.value = { frames: fs.length, n: hands.filter((x) => !after.boxes[x]?.hand).length, go };
}

/** ① の窓の答え (true = 削減をやめる、false = 何も変えない) */
export function answerQuit(ok: boolean): void {
  const a = quitAsk.value;
  quitAsk.value = null;
  if (ok) a?.go();
}

/**
 * ② を出すか: 枠の箱 id の削減の手を、削減でない手 h に替える時で、ほかの枠にも削減の手が残っている時だけ。
 * frames = 枠の数、others = ほかの枠に残る削減の手の数
 */
export function quitChoiceOf(doc: TreeDoc, id: string, h: Hand | null): { frames: number; others: number } | null {
  const b = doc.boxes[id];
  if (!flag("treeWhittleQuit") || !h || isWhittleHand(h) || !b || !lvPart(b.junkKey) || !isWhittleHand(b.hand)) return null;
  const fs = framesOf(doc, id), others = fs.filter((x) => x.id !== id && isWhittleHand(x.hand)).length;
  return others ? { frames: fs.length, others } : null;
}

/** ② で「削減を全部やめる」を選んだ印 (手の窓が立て、ページの手を決める口が 1 回だけ読む) */
let quitAll = false;
export const armQuitAll = (): void => { quitAll = true; };
export const takeQuitAll = (): boolean => { const q = quitAll; quitAll = false; return q; };

/** 手を決める組み替え (applyPick) の前に、q ならほかの枠の削減の手を外す = この枠の手を替えた所で枠が 1 つに畳まれる */
export function pickQuit(q: boolean, d: TreeDoc, id: string, h: Hand, kind: HandKind, aims: Aim[], pre: string | null, only: OnlyOut): string {
  if (q) dropOthers(d, id);
  return applyPick(d, id, h, kind, aims, pre, only);
}
