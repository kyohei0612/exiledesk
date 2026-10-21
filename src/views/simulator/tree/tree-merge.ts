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

/**
 * 結果の見せ方の案 (10-22 オーナー「何で表示が違うんですかって話もあるわな」、選んでもらうまで URL の印で出し分け):
 * a = 札のまま、当たり / 外れの印・色・地を箱と同じにした 2 行の小さな箱 / b = 札をやめて普通の箱、続きからの線は箱の下から / 無し = 今の札
 */
export const RES = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("res");
/** 案 a の札の高さ (印と名前の行 + 狙い・行き先の行) */
const PILL_H_A = 48;

/** 戻りの矢印だけの箱 (始まりは除く)。合流の線の出元 */
export function mergeIds(doc: TreeDoc): Set<string> {
  return new Set(Object.values(doc.boxes).filter((b) => b.back && !b.hand && !b.outs.length && b.parent).map((b) => b.id));
}

/** 札にする箱 (案 b は札にせず箱のまま) */
export const pillIds = (doc: TreeDoc): Set<string> => (RES === "b" ? new Set() : mergeIds(doc));

/** 箱 (か札) の大きさ */
export const sizeOf = (pills: ReadonlySet<string>, id: string): { w: number; h: number } => (pills.has(id) ? { w: PILL_W, h: RES === "a" ? PILL_H_A : PILL_H } : { w: BOX_W, h: BOX_H });

/** 合流の線 1 本 (札 → 行き先)。fwd = 当たりの札 (進む色)、back = 外れ・消えたの札 (戻りの色) */
export interface MergeLine { id: string; pill: string; to: string; parent: string; kind: "fwd" | "back" }

/**
 * 合流の線の頼み (tree-lines の routeBacks へ)。札 (案 b は箱) の下の真ん中から出て、行き先の打つ手の札の左の端へ (手が無ければ下の＋)。
 * from = 戻りの矢印だけの箱 (mergeIds)、pos = 箱か札の位置と大きさ (引っ張り中はその位置)、chipW = 打つ手の札の幅 (ツリーの座標)
 */
export function mergeReqs(doc: TreeDoc, from: ReadonlySet<string>, pos: (id: string) => Required<Pos>, chipW: (id: string) => number | null): { reqs: BackReq[]; lines: MergeLine[] } {
  const reqs: BackReq[] = [], lines: MergeLine[] = [];
  for (const id of from) {
    const b = doc.boxes[id]!, p = pos(id);
    for (const t of backTargetsOf(doc, id)) {
      const to = pos(t);
      const lid = `${id}>${t}`;
      reqs.push({ id: lid, from: p, to, end: handAnchor(to, chipW(t)), start: { x: p.x + p.w / 2, y: p.y + p.h } });
      lines.push({ id: lid, pill: id, to: t, parent: b.parent!, kind: b.out === "hit" || b.out === "any" ? "fwd" : "back" });
    }
  }
  return { reqs, lines };
}
