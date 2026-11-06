/**
 * tree-judge-link.ts — 木を組む時・回す時に、判定の 2 つ (tree-judge の箱どうし fitsBox・人と箱 routeOf) を呼ぶ所 (S-50b)。
 * 前の tree-shape の linkSameShape・sameHandReturn・sameHitsOf・linkShapeHit・pruneBacks・joinableShapeOf・settle / matchBox と同じ役で、
 * 比べは全部 Judge に任せる (形の鍵・道の狙いの組・体の比べは持たない)。手ごとの除外 (フラクチャー・カタリストの結果・カオスの外れを親へ) もしない (大本 2)
 */
import { mulberry32, type PatchData, type StageItem } from "../../craft-stage/engine";
import { nextAimed, sampleAimed, type Judge } from "./tree-judge";
import { aimsOf, playHand, sampleFrom, sampleOf } from "./tree-sample";
import { MATCH_BACK, subtree, type Hand, type TreeBox, type TreeDoc } from "./tree-model";

const RESTART = "restart";
/** 作った順 (箱の id は b<番号>、始まりが先) */
const seqOf = (id: string): number => (id === "start" ? -1 : Number(/\d+$/.exec(id)?.[0] ?? 0));
export const depthOf = (doc: TreeDoc, id: string): number => { let n = 0; for (let b = doc.boxes[id]; b?.parent; b = doc.boxes[b.parent]) n++; return n; };
const shallow = (doc: TreeDoc) => (x: string, y: string): number => depthOf(doc, x) - depthOf(doc, y) || seqOf(x) - seqOf(y);
const keepSig = (h: Hand): string => (h.keep ?`k:${h.keep.map((a) => a.modId).sort().join()}` : "");
const sameHand = (x: Hand | null | undefined, h: Hand): boolean => !!x && x.currency === h.currency && !x.block === !h.block && [...x.omens].sort().join() === [...h.omens].sort().join() && keepSig(x) === keepSig(h);

/**
 * 人が × で ↩ を外した箱の、結果が 1 通りの手の先の箱で中身が同じ物か (S-50、木 xIH1EiqP の b11 → b13)。
 * 打っても中身の変わらない手 (カタリストなど) の先は × の箱と同じ人なので、× を継いで自動の ↩ を付けない (前は × した行き先へ 1 段下から付き直した)
 */
export function offByParent(doc: TreeDoc, id: string, j: Judge): boolean {
  for (let p = doc.boxes[doc.boxes[id]?.parent ?? ""]; p && p.outs.length <= 1; p = doc.boxes[p.parent ?? ""]) if (p.noAutoBack && j.fitsBox(id, p.id)) return true;
  return false;
}

/** t が id の上で、間の手の結果が全部 1 通りの箱か (自動の ↩ を付けると打っても変わらない手の輪になる、S-50・S-50d が閉じていれば親だけ) */
export function straightUp(doc: TreeDoc, id: string, t: string): boolean {
  for (let p = doc.boxes[doc.boxes[id]?.parent ?? ""]; p && p.outs.length <= 1; p = doc.boxes[p.parent ?? ""]) { if (p.id === t) return true; }
  return false;
}

/**
 * id の自動の ↩ を t へ付けると打っても変わらない手の輪になるか (S-50): 結果が 1 通りの手だけで上へ続く箱 (straightUp) か、
 * 親の手の結果が全部親と同じ枠 (神のオーブなど、値しか変えない手) で t が親と同じ手の箱。前は神の結果が全部 ↩ 神の箱になり、人が神を打ち続けて抜けなかった (11-07、100 人中 94 人が打ち止め)
 */
export function idleLoop(doc: TreeDoc, id: string, t: string, j: Judge): boolean {
  if (straightUp(doc, id, t)) return true;
  const p = doc.boxes[doc.boxes[id]?.parent ?? ""];
  return !!p?.hand && sameHand(doc.boxes[t]?.hand, p.hand) && p.outs.every((o) => j.fitsBox(o, p.id));
}

/**
 * 自動の ↩ の行き先 (S-50e):中身が同じ手のある箱のうち、親 → 親と同じ手の箱 → 浅い段・先に作った箱の順。
 * 自分と下、打っても変わらない手の輪になる箱 (idleLoop) は入れない
 */
export function autoTarget(doc: TreeDoc, id: string, j: Judge): string | null {
  const below = new Set(subtree(doc, id)), p = doc.boxes[id]?.parent ?? null, ph = p ? doc.boxes[p]?.hand : null;
  const rank = (t: string): number => (t === p ? 0 : ph && sameHand(doc.boxes[t]?.hand, ph) ? 1 : 2);
  const cmp = shallow(doc);
  return Object.values(doc.boxes).filter((t) => !!t.hand && !below.has(t.id) && !straightUp(doc, id, t.id) && j.fitsBox(id, t.id) && !idleLoop(doc, id, t.id, j)).map((t) => t.id).sort((x, y) => rank(x) - rank(y) || cmp(x, y))[0] ?? null;
}

/**
 * 自動のつなぎ (S-50): 新しくできた結果の箱 (当たりも、手も戻りも無い・人が × で外していない) は、中身が同じ手のある箱 (スタートも) があれば
 * 先に作った箱 (浅い段から) へ自動の ↩。自分と自分の下は除く (当たりは打つ前の箱と中身が違うので再挑戦にはならない)。手の無い当たりの箱どうしは sameHitsByContent
 */
export function linkByContent(doc: TreeDoc, ids: readonly string[], j: Judge): void {
  for (const id of ids) {
    const c = doc.boxes[id];
    if (!c || c.noAutoBack || c.hand || c.done || c.split || c.out === "branch" || c.out === "start") continue;
    // 外れの道も同じ枠なら自動でつなぐ (11-06 オーナー「同じ枠があったらその枠に打つカレンシーって決まってる」。前は人が手を決めた時の同じ枠探しだけ = S-190b)
    // 人が付けた戻り・setHand の既定の戻り (外れが消えた → 外れの前の箱、自動の印つき) は pruneByContent が見直す
    if (c.back && c.back !== MATCH_BACK) continue;
    if (offByParent(doc, id, j)) continue;
    const to = autoTarget(doc, id, j);
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
    // ヒネコラのハズレのまとめ (S-39、tree-foresee の foldMisses) は中身で見直さない
    if (!b.autoBack || !b.back || b.seen || b.back === MATCH_BACK || b.back === RESTART || !doc.boxes[b.back]) continue;
    // 人が同じ手を選んで戻った箱 (S-51、handBack) は輪でも人の決めなので外さない
    if (j.fitsBox(b.id, b.back) && (!!b.handBack || !idleLoop(doc, b.id, b.back, j))) continue;
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

/**
 * ↩ で箱 id に着く人の形 (S-21 の「着いた人」): 箱 id か上の箱へ ↩ する箱の見本を、↩ 先から id まで道の手で打ち直す。外れは種類を見ない (S-60) ので、見本と別の外れの人が入る。
 * 乱数は見本と同じ種で、回さない
 */
export function arrivalsOf(data: PatchData, doc: TreeDoc, j: Judge, id: string): Array<{ item: StageItem; aimed: ReadonlySet<string> }> {
  const path: string[] = [], aims = aimsOf(doc), out: Array<{ item: StageItem; aimed: ReadonlySet<string> }> = [];
  for (let b = doc.boxes[id]; b; b = doc.boxes[b.parent ?? ""]) path.unshift(b.id);
  for (const y of Object.values(doc.boxes)) {
    const at = y.back ? path.indexOf(y.back) : -1;
    if (at < 0) continue;
    for (const seed of [1, 2, 3, 4]) {
      const s = sampleOf(data, doc, y.id, seed);
      if (s.note === "none" || s.note?.startsWith("cant:")) continue;
      let cur = { item: s.item, note: null as string | null }, aimed = sampleAimed(data, doc, y.id, seed), ok = j.fitsItem(s.item, aimed, y.back!);
      for (let k = at; ok && k < path.length - 1; k++) {
        const b = doc.boxes[path[k + 1]!]!, r = sampleFrom(data, doc, b, doc.boxes[path[k]!]!, cur, seed, b.id, aims);
        ok = !r.note;
        if (ok) { aimed = nextAimed(data, doc, aimed, b.id, r.item, cur.item); cur = { item: r.item, note: null }; }
      }
      if (ok) out.push({ item: cur.item, aimed });
    }
  }
  return out;
}

/** 回す時に手が打てるか (playHand。乱数の当たり所で弾かれる物は打てる扱い) */
export const canPlay = (data: PatchData, item: StageItem, h: Hand): boolean => { const r = playHand(data, item, { ...h, repeat: null }, mulberry32(1)); return r.applied || !!r.random; };

/**
 * 回す時の行き先 (S-64、人と箱): 着いた箱 at の中身がこの人のアイテムと同じならそのまま、違えば中身の同じ箱 (手のある箱・完成 / 失敗の箱、
 * 手が打てる箱を先に、浅い段・先に作った箱から)、無ければ null = その箱で止まる (未設定)。at = null は「どこか中身の同じ箱」(行き先の無い結果)。
 * aimed = この人の ☑ で付いた狙い (tree-judge の startAimed・nextAimed で回した順に)
 */
export function routeOf(data: PatchData, doc: TreeDoc, j: Judge, at: string | null, item: StageItem, aimed: ReadonlySet<string>): string | null {
  // 完成・失敗の箱に着いた人はそのまま (着いた後に数え直さない、S-05)
  // 決め (手・戻り・完成 / 失敗) の無い箱には留めず、中身の同じ決めのある箱があればそこへ (S-64、古いレシピの組み直しで増えた結果の箱 = 10-29 共有の木 ibMlQuAV・A52PouGg・st0SuDWi)
  const unknownOpen = !!at && !doc.boxes[at]?.hand && !doc.boxes[at]?.back && !doc.boxes[at]?.split;
  if (at && (doc.boxes[at]?.done || (j.fitsItem(item, aimed, at) && !unknownOpen))) return at;
  const all = j.boxesOf(item, aimed);
  if (unknownOpen && !all.length) return at;
  const playable = all.find((id) => { const h = doc.boxes[id]?.hand; return !h || canPlay(data, item, h); });
  // 手の打てる箱が無い人は、打てない箱へ流さず中身の同じ未設定の箱で止まる (その箱を決めれば進む、S-64)
  if (!playable) { const open = unknownOpen ? at : j.openOf(item, aimed)[0]; if (open) return open; }
  return playable ?? all[0] ?? null;
}
