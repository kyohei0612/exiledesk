/**
 * tree-model-ops.ts — 木の箱の「まとめる・分ける」(動きをまとめる・同じ形でまとめる、10-26 オーナー) と分かれ目の行の操作。
 * tree-model.ts が 500 行を超えたので分けた (中身はそのまま移した)
 */
import { addHit, BOX_W, boxAims, boxOuts, drop, makeRoom, mk, pushRight, ROOM, spread, subtree, type Aim, type OutKind, type SplitWhen, type TreeDoc } from "./tree-model";

/**
 * 「どれか」の当たりの箱を MOD ごとの箱に分ける (10-26 オーナー「デフォで一緒にして一応MOD分けるボタンもあった方が良いかもな」)。
 * 先頭の MOD は今の箱のまま (続きの手・戻り・完成もそのまま)、残りは横に手の無い当たりの箱を作る。返すのは作った箱。1 つ戻すで戻せる
 */
export function splitAny(d: TreeDoc, id: string): string[] {
  const b = d.boxes[id];
  if (!b?.parent || b.out !== "hit" || !b.anyOf || b.anyOf.length < 2) return [];
  const [first, ...rest] = b.anyOf;
  b.aim = { ...first! };
  delete b.anyOf;
  const made: string[] = [];
  let after = id;
  for (const a of rest) { const n = addHit(d, b.parent, after); if (!n) continue; d.boxes[n]!.aim = { ...a }; made.push(n); after = n; }
  return made;
}
/** 同じ形の横の結果の箱 (ids、呼ぶ側が tree-shape の joinableShapeOf で選んだ物) をこの箱へまとめる: 受ける結果の種類を足して、その箱は消す */
export function absorbOuts(d: TreeDoc, id: string, ids: readonly string[]): void {
  const b = d.boxes[id], p = b?.parent ? d.boxes[b.parent] : undefined;
  if (!b || !p || !ids.length) return;
  const outs = new Set<OutKind>((b.mergedOuts ?? []) as OutKind[]);
  for (const o of ids) { const c = d.boxes[o]; if (!c) continue; for (const k of boxOuts(c)) if (k !== b.out) outs.add(k as OutKind); drop(d, subtree(d, o)); }
  p.outs = p.outs.filter((o) => !ids.includes(o));
  if (outs.size) b.mergedOuts = [...outs]; else delete b.mergedOuts;
  // 消えた箱の所を詰める (横の箱を並べ直す、healLost と同じ)
  spread(d, p.id);
}
/** まとめた結果の箱を種類ごとの箱に戻す (この箱は元の種類のまま、ほかの種類は横に。狙いが消えたは今までどおり始めに戻る) */
export function splitOuts(d: TreeDoc, id: string): string[] {
  const b = d.boxes[id], p = b?.parent ? d.boxes[b.parent] : undefined;
  if (!b || !p || !b.mergedOuts?.length) return [];
  const made: string[] = [];
  let after = id;
  for (const k of b.mergedOuts) {
    const n = mk(d, k, p.id);
    p.outs.splice(p.outs.indexOf(after) + 1, 0, n.id);
    const left = d.boxes[after]!;
    n.x = left.x + BOX_W + ROOM + 4; n.y = left.y;
    made.push(n.id); after = n.id;
  }
  delete b.mergedOuts;
  pushRight(d);
  return made;
}
/** 同じ側で手も戻りも完成も無い横の当たりの箱 (動きをまとめられる相手)。groupOf = 狙いの側。プレとサフィはまとめない */
export function joinableOf(d: TreeDoc, id: string, groupOf: (a: Aim) => string): string[] {
  const b = d.boxes[id], p = b?.parent ? d.boxes[b.parent] : undefined;
  if (!b || !p || b.out !== "hit" || !b.aim) return [];
  return p.outs.filter((o) => { const c = d.boxes[o]; return o !== id && !!c && c.out === "hit" && !!c.aim && !c.hand && !c.back && !c.split && !c.done && groupOf(c.aim) === groupOf(b.aim!); });
}
/**
 * 動きをまとめる (10-26 オーナー「動きが一緒なら動きが一緒って設定を置いた方が良い」「まとめたかったら挙動をまとめるボタンみたいなの作って選択した枠にまとめる」):
 * 人が選んだ同じ側の横の当たりの箱 (pick、joinableOf の中だけ) の狙いをこの箱へ足して「どれか」の 1 箱に、選んだ箱は消す。以後の手は 1 本。1 つ戻す・「分ける」で戻せる
 */
export function joinSide(d: TreeDoc, id: string, groupOf: (a: Aim) => string, pick?: readonly string[]): void {
  const ok = joinableOf(d, id, groupOf), b = d.boxes[id], ids = pick ? ok.filter((x) => pick.includes(x)) : ok;
  if (!b?.aim || !ids.length) return;
  const all = [...boxAims(b)];
  for (const o of ids) { for (const a of boxAims(d.boxes[o]!)) if (!all.some((x) => x.modId === a.modId)) all.push({ ...a }); drop(d, subtree(d, o)); }
  const p = d.boxes[b.parent!]!;
  p.outs = p.outs.filter((o) => !ids.includes(o));
  const order = (a: Aim): number => { const i = (d.memoAims ?? []).findIndex((g) => g.modId === a.modId); return i < 0 ? 999 : i; };
  all.sort((x, y) => order(x) - order(y));
  b.aim = { ...all[0]! };
  if (all.length > 1) b.anyOf = all; else delete b.anyOf;
}

/**
 * 分かれ目にする (打たずに分ける、10-22 オーナー OK)。次の手・戻り・完成は外し、下の箱は消す。行ごとに下の箱 (branch) を 1 つ持ち、
 * その箱に次の手か戻りの矢印を付ける (既にある箱へ行くのは、その箱の「↩ 戻り先」で)。行は「それ以外」の 1 行から。始まりの箱は分かれ目にしない
 */
export function setSplit(d: TreeDoc, id: string): void {
  const b = d.boxes[id];
  if (!b || b.out === "start" || b.split) return;
  for (const o of b.outs) drop(d, subtree(d, o));
  b.hand = null;
  b.back = null;
  delete b.autoBack; delete b.merged;
  b.done = null;
  const c = mk(d, "branch", id);
  b.outs = [c.id];
  b.split = [{ when: {}, to: c.id }];
  spread(d, id);
  makeRoom(d, id);
}
/** 分かれ目をやめる (行の箱とその下を消して、ふつうの箱に戻す) */
export function clearSplit(d: TreeDoc, id: string): void {
  const b = d.boxes[id];
  if (!b?.split) return;
  for (const o of b.outs) drop(d, subtree(d, o));
  b.outs = [];
  delete b.split;
}
/** 分かれ目に行を足す (「それ以外」の前。行の箱も 1 つ作る) */
export function addSplitRow(d: TreeDoc, id: string, when: SplitWhen): void {
  const b = d.boxes[id];
  if (!b?.split) return;
  const c = mk(d, "branch", id);
  b.split.splice(b.split.length - 1, 0, { when: JSON.parse(JSON.stringify(when)) as SplitWhen, to: c.id });
  b.outs = b.split.map((r) => r.to!).filter((x) => !!d.boxes[x]);
  spread(d, id);
  makeRoom(d, id);
}
/** 分かれ目の i 行目の条件を替える (「それ以外」の行は替えない) */
export function setSplitWhen(d: TreeDoc, id: string, i: number, when: SplitWhen): void {
  const b = d.boxes[id];
  if (!b?.split || i >= b.split.length - 1) return;
  b.split[i]!.when = JSON.parse(JSON.stringify(when)) as SplitWhen;
}
/** 分かれ目の i 行目を消す (行の箱とその下も。「それ以外」の行は消さない) */
export function removeSplitRow(d: TreeDoc, id: string, i: number): void {
  const b = d.boxes[id];
  if (!b?.split || i >= b.split.length - 1) return;
  const [r] = b.split.splice(i, 1);
  if (r?.to && b.outs.includes(r.to)) drop(d, subtree(d, r.to));
  b.outs = b.outs.filter((o) => o !== r?.to);
}
