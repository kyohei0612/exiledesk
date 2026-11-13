/**
 * tree-lines-nudge.ts — 箱を避けて曲がる緑の線 (畳んだ同じ枠へ、S-142j ③) を全部組んだ後の見直し (S-145、スイッチ hitsSide、開発版だけ)。
 * ほかの線 (別の親の緑・灰色の縦横・自分の幹) と間 GAP 未満で RUN より長く並ぶ真っ直ぐな所を、横なら上下・縦なら左右へ GAP / 2 GAP ずらす。
 * ずらすと箱・手の札を通る時はそのずらしを取らない (bad)。始まり (手の札) の横の所と、終わり (行き先の箱の辺) の所は動かさない
 * (11-14 レビュワー: 別の親の緑が同じ高さで 727 重なって 1 本に見えた・同じ札の緑 2 本が 7 しか離れない・b99 の 1・2 本目が同じ x から上がった)
 */
import type { Pos, Seg } from "./tree-lines";

/** 並んで走る線どうしの間 (LANE_GAP と同じ 20) と、並んだと見なす長さ */
const GAP = 20, RUN = 8;
const lo = (a: number, b: number): number => Math.min(a, b), hi = (a: number, b: number): number => Math.max(a, b);

export const segsOfPts = (pts: readonly Pos[]): Seg[] => pts.slice(1).map((b, i) => ({ x0: pts[i]!.x, y0: pts[i]!.y, x1: b.x, y1: b.y }));
const isH = (g: Seg): boolean => g.y0 === g.y1 && g.x0 !== g.x1;
const isV = (g: Seg): boolean => g.x0 === g.x1 && g.y0 !== g.y1;

/** 同じ向きで間 GAP 未満・RUN より長く並ぶか */
export function tooClose(a: Seg, b: Seg): boolean {
  if (isH(a) && isH(b)) return Math.abs(a.y0 - b.y0) < GAP && lo(hi(a.x0, a.x1), hi(b.x0, b.x1)) - hi(lo(a.x0, a.x1), lo(b.x0, b.x1)) > RUN;
  if (isV(a) && isV(b)) return Math.abs(a.x0 - b.x0) < GAP && lo(hi(a.y0, a.y1), hi(b.y0, b.y1)) - hi(lo(a.y0, a.y1), lo(b.y0, b.y1)) > RUN;
  return false;
}

export interface NudgeLine { pts: readonly Pos[]; bad: (segs: readonly Seg[]) => boolean }

/** lines を順に見て、置いた線 (fixed と前の lines) と並ぶ所をずらした点の列を返す (順は lines と同じ) */
export function nudgeLines(lines: readonly NudgeLine[], fixed: readonly Seg[]): Pos[][] {
  const placed: Seg[] = [...fixed];
  return lines.map(({ pts: p0, bad }) => {
    const pts = p0.map((p) => ({ x: p.x, y: p.y })), n = pts.length;
    for (let i = 0; i < n - 2; i++) { // 終わりの所 (i = n - 2) は行き先の辺へ入るので動かさない
      const a = pts[i]!, b = pts[i + 1]!, g: Seg = { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
      const h = isH(g), v = isV(g);
      if (!h && !v) continue;
      if (i === 0 && h) continue; // 手の札から横に出る所は、ずらすと札から離れる
      // 前後の所が直角でないと、ずらすと斜めになる
      const prev = i > 0 ? { x0: pts[i - 1]!.x, y0: pts[i - 1]!.y, x1: a.x, y1: a.y } : null, next = { x0: b.x, y0: b.y, x1: pts[i + 2]!.x, y1: pts[i + 2]!.y };
      if ((prev && (h ? !isV(prev) : !isH(prev))) || (h ? !isV(next) : !isH(next))) continue;
      if (!placed.some((q) => tooClose(g, q))) continue;
      for (const d of [GAP, -GAP, 2 * GAP, -2 * GAP]) {
        const a2 = h ? { x: a.x, y: a.y + d } : { x: a.x + d, y: a.y }, b2 = h ? { x: b.x, y: b.y + d } : { x: b.x + d, y: b.y };
        const g2: Seg = { x0: a2.x, y0: a2.y, x1: b2.x, y1: b2.y };
        const near: Seg[] = [...(prev ? [{ ...prev, x1: a2.x, y1: a2.y }] : []), g2, { ...next, x0: b2.x, y0: b2.y }];
        // ずらした後に前後の所が向きを失う (長さ 0 や逆向き) 時は取らない
        if (prev && (h ? Math.sign(a2.y - prev.y0) !== Math.sign(a.y - prev.y0) : Math.sign(a2.x - prev.x0) !== Math.sign(a.x - prev.x0))) continue;
        if (h ? Math.sign(next.y1 - b2.y) !== Math.sign(next.y1 - b.y) : Math.sign(next.x1 - b2.x) !== Math.sign(next.x1 - b.x)) continue;
        if (placed.some((q) => tooClose(g2, q)) || bad(near)) continue;
        pts[i] = a2; pts[i + 1] = b2;
        break;
      }
    }
    placed.push(...segsOfPts(pts));
    return pts;
  });
}
