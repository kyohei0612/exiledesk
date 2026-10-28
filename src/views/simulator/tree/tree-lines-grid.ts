/**
 * tree-lines-grid.ts — 木の中だけを通る戻りの線の道 (S-87c、スイッチ retryHover)。tree-lines の routeBacks で、出元から戻り先までまっすぐ上る列が
 * どこにも無い時 (どの列も途中で箱に当たる) に使う。箱の間の縦の列と、段の間の高さ (箱の下の帯・箱の上 24) を格子にして、箱を通らず、
 * 全部の箱の左端〜右端の中だけで、折れる回数の少ない道を探す (前は木の左右の外の列を回り、木を囲む四角になった、10-28 深夜オーナー「再挑戦の線だこれ」)
 */
import { BOX_H, BOX_W } from "../../../services/simulator/tree/tree-model";

interface P { x: number; y: number; w?: number; h?: number }
/** 線と箱の間 (横・縦) */
const GAP = 10;
/** 1 回折れるごとの重み (長さの px に足す。少しの遠回りより折れの少ない道) */
const BEND = 240;

/** s (出元の箱の下の真ん中) → e (行き先の箱の上 24) の折れ線 (始めと終わりを含む、終わりへは横から)。boxes = 避ける箱 (出元・行き先も入れて渡す)。道が無ければ null */
export function gridRoute(s: P, e: P, boxes: readonly P[], x0: number, x1: number): P[] | null {
  const right = (b: P): number => b.x + (b.w ?? BOX_W), bottom = (b: P): number => b.y + (b.h ?? BOX_H);
  const xs = new Set<number>([s.x, e.x]), ys = new Set<number>([s.y, s.y + 27, e.y]);
  for (const b of boxes) { xs.add(b.x - GAP - 6); xs.add(right(b) + GAP + 6); ys.add(bottom(b) + 27); ys.add(b.y - 24); }
  const X = [...xs].filter((x) => x >= x0 && x <= x1).sort((a, z) => a - z), Y = [...ys].sort((a, z) => a - z);
  const vFree = (x: number, a: number, z: number): boolean => boxes.every((b) => x <= b.x - GAP || x >= right(b) + GAP || bottom(b) + GAP <= Math.min(a, z) || b.y - GAP >= Math.max(a, z));
  const hFree = (y: number, a: number, z: number): boolean => boxes.every((b) => y <= b.y - GAP || y >= bottom(b) + GAP || right(b) + GAP <= Math.min(a, z) || b.x - GAP >= Math.max(a, z));
  const si = X.indexOf(s.x), sj = Y.indexOf(s.y), ei = X.indexOf(e.x), ej = Y.indexOf(e.y);
  if (si < 0 || ei < 0) return null;
  // 状態 = (列, 段, 来た向き 0 横 / 1 縦 / 2 始め)
  const key = (i: number, j: number, d: number): number => (i * Y.length + j) * 3 + d;
  const dist = new Map<number, number>(), prev = new Map<number, number>(), done = new Set<number>();
  const open: number[] = [key(si, sj, 2)];
  dist.set(open[0]!, 0);
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (dist.get(open[k]!)! < dist.get(open[bi]!)!) bi = k;
    const cur = open.splice(bi, 1)[0]!;
    if (done.has(cur)) continue;
    done.add(cur);
    const d = cur % 3, ij = (cur - d) / 3, i = Math.floor(ij / Y.length), j = ij % Y.length;
    if (i === ei && j === ej && d === 0) {
      const out: P[] = [];
      for (let c: number | undefined = cur; c !== undefined; c = prev.get(c)) { const q = (c - (c % 3)) / 3; out.unshift({ x: X[Math.floor(q / Y.length)]!, y: Y[q % Y.length]! }); }
      // 同じ向きの続く点は 1 つに
      return out.filter((p, k) => k === 0 || k === out.length - 1 || !((out[k - 1]!.x === p.x && out[k + 1]!.x === p.x) || (out[k - 1]!.y === p.y && out[k + 1]!.y === p.y)));
    }
    const base = dist.get(cur)!;
    // 始めは出元の箱の下の帯 (+27) まで一気に下りる (途中の高さは出元の箱の縁に近すぎて、そこから動けなかった)
    const steps: ReadonlyArray<readonly [number, number, number]> = d === 2 ? [[i, Y.indexOf(s.y + 27), 1]] : [[i - 1, j, 0], [i + 1, j, 0], [i, j - 1, 1], [i, j + 1, 1]];
    for (const [ni, nj, nd] of steps) {
      if (ni < 0 || nj < 0 || ni >= X.length || nj >= Y.length) continue;
      // 始めの 1 歩 (出元の箱の下の縁から帯へ) は出元の箱に触れるので見ない
      if (d !== 2 && (nd === 0 ? !hFree(Y[j]!, X[i]!, X[ni]!) : !vFree(X[i]!, Y[j]!, Y[nj]!))) continue;
      const nk = key(ni, nj, nd);
      const cost = base + Math.abs(X[ni]! - X[i]!) + Math.abs(Y[nj]! - Y[j]!) + (d !== 2 && d !== nd ? BEND : 0);
      if (done.has(nk) || cost >= (dist.get(nk) ?? Infinity)) continue;
      dist.set(nk, cost); prev.set(nk, cur); open.push(nk);
    }
  }
  return null;
}

/** 横の辺から出る時に箱から離す幅 */
const OUT = 24;
/**
 * 出元の箱の横の辺の真ん中 → 戻り先の箱の横の辺の真ん中 (S-87c、10-28 深夜オーナー「枠の横枠空いてるから最短距離でその枠の線が無い方の枠へ伸ばしてその枠の真ん中に付ける」)。
 * 左右の組み 4 通りのうち、boxes (出元・行き先を除いた箱と手の札) を通らず、縦の列が木の中 (x0〜x1 = 全部の箱の左端〜右端) に収まる一番短い折れ線。
 * どれも無ければ null (一番端の箱の外側の辺から出ると木の外を回る = 線の見張り L4)
 */
export function sideRoute(from: P, to: P, boxes: readonly P[], x0: number, x1: number): P[] | null {
  const right = (b: P): number => b.x + (b.w ?? BOX_W), mid = (b: P): number => b.y + (b.h ?? BOX_H) / 2;
  const sy = mid(from), ty = mid(to);
  const vFree = (x: number, a: number, z: number): boolean => boxes.every((b) => x <= b.x - GAP || x >= right(b) + GAP || b.y + (b.h ?? BOX_H) + GAP <= Math.min(a, z) || b.y - GAP >= Math.max(a, z));
  const hFree = (y: number, a: number, z: number): boolean => boxes.every((b) => y <= b.y - GAP || y >= b.y + (b.h ?? BOX_H) + GAP || right(b) + GAP <= Math.min(a, z) || b.x - GAP >= Math.max(a, z));
  const ok = (pts: P[]): boolean => pts.every((p, i) => i === 0 || (p.x === pts[i - 1]!.x ? vFree(p.x, pts[i - 1]!.y, p.y) : hFree(p.y, pts[i - 1]!.x, p.x)));
  const len = (pts: P[]): number => pts.reduce((n, p, i) => n + (i ? Math.abs(p.x - pts[i - 1]!.x) + Math.abs(p.y - pts[i - 1]!.y) : 0), 0);
  const cands: P[][] = [];
  for (const fs of ["L", "R"] as const) for (const ts of ["L", "R"] as const) {
    const sx = fs === "L" ? from.x : right(from), tx = ts === "L" ? to.x : right(to);
    // 縦の列: 同じ向きの辺なら両方の外、向き合う辺なら間の真ん中
    const col = fs === ts ? (fs === "L" ? Math.min(sx, tx) - OUT : Math.max(sx, tx) + OUT) : (sx + tx) / 2;
    // 向き合う辺は、出る向きと列の側が合う時だけ (左の辺から出て右へ戻らない)
    if (fs !== ts && (fs === "L" ? col > sx - OUT || col < tx + OUT : col < sx + OUT || col > tx - OUT)) continue;
    if (col < x0 || col > x1) continue;
    cands.push(sy === ty ? [{ x: sx, y: sy }, { x: tx, y: ty }] : [{ x: sx, y: sy }, { x: col, y: sy }, { x: col, y: ty }, { x: tx, y: ty }]);
  }
  return cands.filter(ok).sort((a, z) => len(a) - len(z))[0] ?? null;
}
