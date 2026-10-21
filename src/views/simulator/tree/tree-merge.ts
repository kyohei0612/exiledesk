/**
 * tree-merge.ts — 整列した時に「やる事が同じ箱」をまとめて見せる (2026-10-22 オーナー「やってる事が同じ枠ってあるじゃん、統合できないの?
 * 枠も線も減るでしょ。まずは整列した時の UI/UX」)。中のデータ (木の形・精査・100 人回し・消した時に下が消える動き) は変えず、見え方だけ。
 *
 * まとめる箱 = 次の手が無く、戻りの矢印だけの箱 (↩ 続き・↩ 決めた箱)。その箱の先は「今のアイテムの形と同じ箱」= もうある箱なので、
 * 箱を描かず子の段の小さな札 (pill) にして、札から行き先の箱の打つ手の札へ線を流し込む。行き先が同じ線は途中で 1 本に束ねる (tree-lines の bundle)。
 * 行き先の判定は回す時と同じ tree-run の matchTargets (形 = 付いている狙いの組 + 外れがあるか)。
 * 戻りの線は既定で出さず、乗せた箱・札の線だけ (帯の「線を全部表示」で全部)。オーナー 10-22 に案 A を選んだ (いつも淡く出す案 B は消した)
 */
import { BOX_H, BOX_W, PILL_H, PILL_W, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { MATCH, matchTargets, RESTART } from "../../../services/simulator/tree/tree-run";
import { handAnchor, type BackReq, type Pos } from "./tree-lines";

/** 戻りの行き先の箱 (↩ 続き = 行きうる形の箱を全部、↩ 作り直しは無し) */
export function backTargetsOf(doc: TreeDoc, id: string): string[] {
  const b = doc.boxes[id];
  if (!b?.back || b.back === RESTART) return [];
  const to = b.back === MATCH ? matchTargets(doc, id).flatMap((x) => (x.to ? [x.to] : [])) : [b.back];
  return [...new Set(to)].filter((x) => !!doc.boxes[x]);
}

/** 札にする箱 (戻りの矢印だけの箱。始まりは除く) */
export function pillIds(doc: TreeDoc): Set<string> {
  return new Set(Object.values(doc.boxes).filter((b) => b.back && !b.hand && !b.outs.length && b.parent).map((b) => b.id));
}

/** 箱 (か札) の大きさ */
export const sizeOf = (pills: ReadonlySet<string>, id: string): { w: number; h: number } => (pills.has(id) ? { w: PILL_W, h: PILL_H } : { w: BOX_W, h: BOX_H });

/** 合流の線 1 本 (札 → 行き先)。fwd = 当たりの札 (進む色)、back = 外れ・消えたの札 (戻りの色) */
export interface MergeLine { id: string; pill: string; to: string; parent: string; kind: "fwd" | "back" }

/**
 * 合流の線の頼み (tree-lines の routeBacks へ)。札の下の真ん中から出て、行き先の打つ手の札の左の端へ (手が無ければ下の＋)。
 * pos = 箱の位置 (引っ張り中はその位置)、chipW = 打つ手の札の幅 (ツリーの座標)
 */
export function mergeReqs(doc: TreeDoc, pills: ReadonlySet<string>, pos: (id: string) => Pos, chipW: (id: string) => number | null): { reqs: BackReq[]; lines: MergeLine[] } {
  const reqs: BackReq[] = [], lines: MergeLine[] = [];
  for (const id of pills) {
    const b = doc.boxes[id]!, p = pos(id);
    const from: Pos = { ...p, w: PILL_W, h: PILL_H };
    for (const t of backTargetsOf(doc, id)) {
      const to = pos(t);
      const lid = `${id}>${t}`;
      reqs.push({ id: lid, from, to, end: handAnchor(to, chipW(t)), start: { x: p.x + PILL_W / 2, y: p.y + PILL_H } });
      lines.push({ id: lid, pill: id, to: t, parent: b.parent!, kind: b.out === "hit" || b.out === "any" ? "fwd" : "back" });
    }
  }
  return { reqs, lines };
}
