/**
 * tree-judge-link.ts — 木を組む時・回す時に、判定の 2 つ (tree-judge の箱どうし fitsBox・人と箱 routeOf) を呼ぶ所 (S-50b、スイッチ judgeOne)。
 * 前の tree-shape の linkSameShape・sameHandReturn・sameHitsOf・linkShapeHit・pruneBacks・joinableShapeOf・settle / matchBox と同じ役で、
 * 比べは全部 Judge に任せる (形の鍵・道の狙いの組・体の比べは持たない)。手ごとの除外 (フラクチャー・カタリストの結果・カオスの外れを親へ) もしない (大本 2)
 */
import { mulberry32, type PatchData, type StageItem } from "../../craft-stage/engine";
import type { Judge } from "./tree-judge";
import { effectOf } from "./tree-hands";
import { playHand } from "./tree-sample";
import { MATCH_BACK, subtree, type Hand, type TreeBox, type TreeDoc } from "./tree-model";
import { flag } from "../../../web/release-flags";

const RESTART = "restart";
/** 作った順 (箱の id は b<番号>、始まりが先) */
const seqOf = (id: string): number => (id === "start" ? -1 : Number(/\d+$/.exec(id)?.[0] ?? 0));
const depthOf = (doc: TreeDoc, id: string): number => { let n = 0; for (let b = doc.boxes[id]; b?.parent; b = doc.boxes[b.parent]) n++; return n; };
const shallow = (doc: TreeDoc) => (x: string, y: string): number => depthOf(doc, x) - depthOf(doc, y) || seqOf(x) - seqOf(y);
const sameHand = (x: Hand | null | undefined, h: Hand): boolean => !!x && x.currency === h.currency && [...x.omens].sort().join() === [...h.omens].sort().join();

/**
 * 人が × で ↩ を外した箱の、結果が 1 通りの手の先の箱で中身が同じ物か (S-50、木 xIH1EiqP の b11 → b13)。
 * 打っても中身の変わらない手 (カタリストなど) の先は × の箱と同じ人なので、× を継いで自動の ↩ を付けない (前は × した行き先へ 1 段下から付き直した)
 */
export function offByParent(doc: TreeDoc, id: string, j: Judge): boolean {
  for (let p = doc.boxes[doc.boxes[id]?.parent ?? ""]; p && p.outs.length <= 1; p = doc.boxes[p.parent ?? ""]) if (p.noAutoBack && j.fitsBox(id, p.id)) return true;
  return false;
}

/** t が id の上で、間の手の結果が全部 1 通りの箱か (自動の ↩ を付けると打っても変わらない手の輪になる、S-50・S-50d。スイッチ keepOutside が閉じていれば親だけ) */
export function straightUp(doc: TreeDoc, id: string, t: string): boolean {
  for (let p = doc.boxes[doc.boxes[id]?.parent ?? ""]; p && p.outs.length <= 1; p = doc.boxes[p.parent ?? ""]) { if (p.id === t) return true; if (!flag("keepOutside")) break; }
  return false;
}

/**
 * 自動のつなぎ (S-50): 新しくできた結果の箱 (当たりも、手も戻りも無い・人が × で外していない) は、中身が同じ手のある箱 (スタートも) があれば
 * 先に作った箱 (浅い段から) へ自動の ↩。自分と自分の下は除く (当たりは打つ前の箱と中身が違うので再挑戦にはならない)。手の無い当たりの箱どうしは sameHitsByContent
 */
export function linkByContent(doc: TreeDoc, ids: readonly string[], j: Judge): void {
  for (const id of ids) {
    const c = doc.boxes[id];
    if (!c || c.noAutoBack || c.hand || c.done || c.split || c.out === "branch" || c.out === "start") continue;
    // 人が付けた戻り・setHand の既定の戻り (外れが消えた → 外れの前の箱、自動の印つき) は pruneByContent が見直す
    if (c.back && c.back !== MATCH_BACK) continue;
    if (offByParent(doc, id, j)) continue;
    // 自動の ↩ は消去の結果だけ。ほかの手は未設定のまま、カレンシーを選んだ時に S-51 で戻す (S-50d、スイッチ keepOutside)
    if (flag("keepOutside") && effectOf(doc.boxes[c.parent ?? ""]?.hand?.currency ?? "") !== "remove") continue;
    const below = new Set(subtree(doc, id));
    // 結果が 1 通りの手 (品質を最大まで・エッセンスなど) の結果を、同じ中身の親へ戻すと同じ結果の輪になる (打っても変わらない手を打ち続ける)。手の種類ではなく結果の数で見る
    const loop = (t: string): boolean => straightUp(doc, id, t);
    const to = Object.values(doc.boxes).filter((t) => !!t.hand && !below.has(t.id) && !loop(t.id) && j.fitsBox(id, t.id)).map((t) => t.id).sort(shallow(doc))[0];
    if (!to) continue;
    c.back = to;
    c.autoBack = true;
    delete c.merged;
    c.done = null;
  }
}

/** 当たりの箱で中身が同じ別の当たりの箱 (まとめるの候補・自動の統合。同じ親の横と自分の下は除く、戻りを持つ箱・分かれ目も除く) */
export function sameHitsByContent(doc: TreeDoc, id: string, j: Judge): string[] {
  const b = doc.boxes[id];
  if (!b || b.out !== "hit" || !b.aim || b.back || b.split) return [];
  const down = new Set(subtree(doc, id));
  return Object.values(doc.boxes).filter((c) => c.id !== id && c.out === "hit" && !!c.aim && !c.back && !c.split && c.parent !== b.parent && !down.has(c.id) && j.fitsBox(id, c.id)).map((c) => c.id).sort(shallow(doc));
}

/** 同じ手なら戻る (S-51): 打つ前の箱か木の中の中身が同じ手のある箱 (どの種類の箱でも) と同じ手なら、その箱 (今の戻り先 → 親 → 浅い段の順)。自分と下は除く */
export function sameHandByContent(doc: TreeDoc, id: string, h: Hand, j: Judge): string | null {
  const b = doc.boxes[id];
  if (!b || b.out === "start" || b.split) return null;
  if (b.back && b.back !== MATCH_BACK && b.back !== RESTART && sameHand(doc.boxes[b.back]?.hand, h) && j.fitsBox(id, b.back)) return b.back;
  const p = b.parent;
  if (p && sameHand(doc.boxes[p]?.hand, h) && j.fitsBox(id, p)) return p;
  const below = new Set(subtree(doc, id));
  return Object.values(doc.boxes).filter((t) => !below.has(t.id) && sameHand(t.hand, h) && j.fitsBox(id, t.id)).map((t) => t.id).sort(shallow(doc))[0] ?? null;
}

/** 手を決めるたびに自動の ↩ を全部「箱どうし」で見直す (合わない物は外して未設定、S-50b)。人が付けた ↩ は触らない。外したら true */
export function pruneByContent(doc: TreeDoc, j: Judge): boolean {
  let changed = false;
  for (const b of Object.values(doc.boxes)) {
    if (!b.autoBack || !b.back || b.back === MATCH_BACK || b.back === RESTART || !doc.boxes[b.back]) continue;
    if (j.fitsBox(b.id, b.back)) continue;
    b.back = null; delete b.autoBack; delete b.merged;
    changed = true;
  }
  return changed;
}

/** 同じ親の横の結果の箱で中身が同じ物 (手で「まとめる」の相手。当たり以外・手も分かれ目も完成も無い物) */
export function joinableByContent(doc: TreeDoc, id: string, j: Judge): string[] {
  const b = doc.boxes[id], p = b?.parent ? doc.boxes[b.parent] : undefined;
  const plain = (c: TreeBox | undefined): boolean => !!c && c.out !== "hit" && c.out !== "start" && c.out !== "pass" && c.out !== "branch";
  if (!b || !p || !plain(b)) return [];
  return p.outs.filter((o) => { const c = doc.boxes[o]; return o !== id && plain(c) && !c!.hand && !c!.split && !c!.done && j.fitsBox(id, o); });
}

/** 回す時に手が打てるか (playHand。乱数の当たり所で弾かれる物は打てる扱い) */
const canPlay = (data: PatchData, item: StageItem, h: Hand): boolean => { const r = playHand(data, item, { ...h, repeat: null }, mulberry32(1)); return r.applied || !!r.random; };

/**
 * 回す時の行き先 (S-64、人と箱): 着いた箱 at の中身がこの人のアイテムと同じならそのまま、違えば中身の同じ箱 (手のある箱・完成 / 失敗の箱、
 * 手が打てる箱を先に、浅い段・先に作った箱から)、無ければ null = その箱で止まる (未設定)。at = null は「どこか中身の同じ箱」(行き先の無い結果)。
 * aimed = この人の ☑ で付いた狙い (tree-judge の startAimed・nextAimed で回した順に)
 */
export function routeOf(data: PatchData, doc: TreeDoc, j: Judge, at: string | null, item: StageItem, aimed: ReadonlySet<string>): string | null {
  // 完成・失敗の箱に着いた人はそのまま (着いた後に数え直さない、S-05)
  // 決め (手・戻り・完成 / 失敗) の無い箱には留めず、中身の同じ決めのある箱があればそこへ (S-64、古いレシピの組み直しで増えた結果の箱 = 10-29 共有の木 ibMlQuAV・A52PouGg・st0SuDWi。スイッチ recipeV1)
  const unknownOpen = !!at && flag("recipeV1") && !doc.boxes[at]?.hand && !doc.boxes[at]?.back && !doc.boxes[at]?.split;
  if (at && (doc.boxes[at]?.done || (j.fitsItem(item, aimed, at) && !unknownOpen))) return at;
  const all = j.boxesOf(item, aimed);
  if (unknownOpen && !all.length) return at;
  const playable = all.find((id) => { const h = doc.boxes[id]?.hand; return !h || canPlay(data, item, h); });
  return playable ?? all[0] ?? null;
}
