/**
 * tree-merge.ts — 戻りの矢印だけの箱 (↩ 行き先の箱の名前・↩ 始めに戻る) から行き先へ流れ込む線 (2026-10-22 オーナー「やってる事が同じ枠ってあるじゃん、
 * 統合できないの? 枠も線も減るでしょ」)。中のデータ (木の形・精査・100 人回し・消した時に下が消える動き) は変えず、見え方だけ。
 *
 * 戻りの矢印だけの箱 = 次の手が無く、戻りの矢印だけの箱。その先は「今のアイテムの形と同じ箱」= もうある箱なので、箱の下の真ん中から
 * 行き先の箱の打つ手の札へ線を流し込む。行き先が同じ線は途中で 1 本に束ねる (tree-lines の bundle)。
 * 行き先の判定は回す時と同じ tree-run の matchTargets (形 = 付いている狙いの組 + 外れがあるか)。
 * 戻りの線は既定で出さず、乗せた箱の線だけ (帯の「線を全部表示」で全部)。オーナー 10-22 に案 A を選んだ (いつも淡く出す案 B は消した)。
 * 結果の見せ方は 10-22 オーナーが「全部普通の箱」を選んだ (前は箱を描かず小さな札にしていた。「何で表示が違うんですか」で札を消した)
 */
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { heldSets, MATCH, matchTargets, RESTART } from "../../../services/simulator/tree/tree-run";
import { handAnchor, type BackReq, type Pos } from "./tree-lines";

/** 戻りの行き先の箱 (決めた箱 1 つ。前の版の形の合う箱へ = 行きうる形の箱を全部、作り直しは無し) */
export function backTargetsOf(doc: TreeDoc, id: string): string[] {
  const b = doc.boxes[id];
  if (!b?.back || b.back === RESTART) return [];
  const to = b.back === MATCH ? matchTargets(doc, id).flatMap((x) => (x.to ? [x.to] : [])) : [b.back];
  return [...new Set(to)].filter((x) => !!doc.boxes[x]);
}

/**
 * 完成の箱に次の手を付けた時、同じ形 (付いている狙いの組。tree-run の heldSets が 1 通りに決まる物) の完成の箱はその箱へ戻す (完成の印は外す)。
 * 10-22 オーナー「サフィに 3 MOD 付いた時点で、そこから先は全て同じルート…どれか 1 つから伸ばす時に自動でつながるように」。
 * 見本の 3 つの完成の枝は、300 人で完成の時点のプレフィックス・空きが全員同じ (scripts/_tree-done-shape-probe)
 */
export function joinSameShape(doc: TreeDoc, id: string): void {
  const b = doc.boxes[id];
  // 完成だった当たりの箱から伸ばした時だけ (前はどの箱に手を付けても動き、消去を付けた外れの箱へ完成の箱が黙ってつながった、10-22 靴・手袋を白紙から組んで見つけた)
  if (!b?.hand || !b.done || b.out !== "hit") return;
  const key = (x: string): string | null => { const s = heldSets(doc, x); return s.length === 1 ? s[0]!.join(",") : null; };
  const k = key(id);
  b.done = null;
  if (!k) return;
  for (const o of Object.values(doc.boxes)) if (o.id !== id && o.done && !o.hand && !o.back && key(o.id) === k) { o.back = id; o.done = null; }
}

/** 戻りの矢印だけの箱 (始まりは除く)。合流の線の出元 */
function mergeIds(doc: TreeDoc): Set<string> {
  return new Set(Object.values(doc.boxes).filter((b) => b.back && !b.hand && !b.outs.length && b.parent).map((b) => b.id));
}

/** 合流の線 1 本 (箱 → 行き先)。fwd = 当たりの箱 (進む色)、back = 外れ・消えたの箱 (戻りの色) */
export interface MergeLine { id: string; from: string; to: string; parent: string; kind: "fwd" | "back" }

/**
 * 合流の線の頼み (tree-lines の routeBacks へ)。戻りの矢印だけの箱の下の真ん中から出て、行き先の打つ手の札の左の端へ (手が無ければ下の＋)。
 * pos = 箱の位置と大きさ (引っ張り中はその位置)、chipW = 打つ手の札の幅 (ツリーの座標)
 */
export function mergeReqs(doc: TreeDoc, pos: (id: string) => Required<Pos>, chipW: (id: string) => number | null): { reqs: BackReq[]; lines: MergeLine[] } {
  const reqs: BackReq[] = [], lines: MergeLine[] = [];
  for (const id of mergeIds(doc)) {
    const b = doc.boxes[id]!, p = pos(id);
    for (const t of backTargetsOf(doc, id)) {
      const to = pos(t);
      const lid = `${id}>${t}`;
      reqs.push({ id: lid, from: p, to, end: handAnchor(to, chipW(t)), start: { x: p.x + p.w / 2, y: p.y + p.h } });
      lines.push({ id: lid, from: id, to: t, parent: b.parent!, kind: b.out === "hit" || b.out === "any" ? "fwd" : "back" });
    }
  }
  return { reqs, lines };
}
