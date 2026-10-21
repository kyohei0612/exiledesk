/**
 * tree-lines.ts — ツリーの線の道筋 (2026-10-21 オーナー 10-22「線が他の線と被ったり…都度調整してあげて」「線を繋げても、その線が出ない」)。
 * - 戻りの線: いつも出すので、箱を横切らない道を通す。箱の下から段の間のすき間へ下り → すき間を横へ → 箱の無い縦の通り道を上 (下) へ →
 *   戻り先の打つ手の札の左の端へ右向きに入る (手が無ければ下の＋、オーナー 10-22)。角は丸める。通り道が無ければ木の左の外側
 * - 進む線の横の棒: 同じ段で別の親の棒が横に重なると 1 本に見える (赤と灰が合流して見分けにくい) ので、重なる物は段を 1 つずつ上へずらす
 * 座標は全部ツリーの座標 (Vue Flow の倍率を掛ける前)
 */
import { BOX_H, BOX_W } from "../../../services/simulator/tree/tree-model";

/** 箱の左上。w・h が無ければ箱の大きさ (まとめた札は細い、tree-merge.ts) */
export interface Pos { x: number; y: number; w?: number; h?: number }
/** 戻りの線が箱の下のどこから出るか (左から。真ん中は木の線) */
const ENTER = 26;
/** 縦の通り道と箱の間 */
const CLEAR = 10;
const R = 8;

/** 縦の線 x が y0〜y1 の間で箱を通らないか (除く箱は自分と戻り先) */
function freeColumn(x: number, y0: number, y1: number, boxes: readonly Pos[]): boolean {
  const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
  return boxes.every((b) => x < b.x - CLEAR || x > b.x + (b.w ?? BOX_W) + CLEAR || b.y + (b.h ?? BOX_H) < lo || b.y > hi);
}
/** 横の線 y が x0〜x1 の間で箱を通らないか */
function freeRow(y: number, x0: number, x1: number, boxes: readonly Pos[]): boolean {
  const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
  return boxes.every((b) => y < b.y - 2 || y > b.y + (b.h ?? BOX_H) + 2 || b.x + (b.w ?? BOX_W) < lo || b.x > hi);
}

/** 手の札の真ん中 (箱の下から。SimTreePage の札の位置) と、下の＋の真ん中 */
export const HAND_DY = 46;
const PLUS_DY = 20, PLUS_R = 14;
/**
 * 戻りの線の行き先 (オーナー 10-22「戻りの線は、戻り先の箱から出る打つ手の札の左の端へ」): 手の札があれば札の左の端、
 * 無ければ箱の下の＋の左の端。chipW = 札の幅 (画面で測った物、倍率の逆数を掛けた後)。null = 手が無い
 */
export function handAnchor(to: Pos, chipW: number | null): Pos {
  const cx = to.x + BOX_W / 2;
  return chipW === null ? { x: cx - PLUS_R - 3, y: to.y + BOX_H + PLUS_DY } : { x: cx - chipW / 2 - 3, y: to.y + BOX_H + HAND_DY };
}

/** 進む線 (直角の木の線) の 1 本の真っ直ぐな所。戻りの線がこれと交わる所は跨ぐ形にする */
export interface Seg { x0: number; y0: number; x1: number; y1: number }
/** 戻りの線 1 本の頼み (id は線の名前。from / to は箱の左上、end は handAnchor。start = 出る所 (無ければ from の箱の下の左寄り)) */
export interface BackReq { id: string; from: Pos; to: Pos; end: Pos; start?: Pos }
/** 平行に走る線どうしの間 */
const LANE = 7;
/** 出口の横の線を通す帯 (箱の下 +8〜+30。手の札 +34〜 と進む線の横の棒 +60〜 より上) */
const BAND = [8, 30] as const;
/** 跨ぐ形の半径 */
const HOP = 5;

/**
 * 戻りの線をまとめて引く (オーナー 10-22 のスナップ「戻りの線が箱の下の横線で何本も重なる・縦の通り道を 2 本が重ねて走る・上の横線が灰色の進む線と重なる」):
 * 1 本ずつ、箱の下から帯の中の空いた高さへ下り → 横へ → 札より左の箱の無い縦の通り道 (先に引いた線と重ならない所) を上 (下) へ → 札の高さで右へ入る。
 * 同じ札へ入る線は札の高さの中で少しずつずらす。進む線・先に引いた戻りの線と交わる所は跨ぐ。通り道が無ければ木の左の外側
 */
export function routeBacks(reqs: readonly BackReq[], boxes: readonly Pos[], fwd: readonly Seg[], o: { bundle?: boolean } = {}): Map<string, string> {
  // bundle = 同じ行き先の線を 1 本に束ねる (先に引いた同じ行き先の縦の通り道に合流して、札へは 1 本で入る。10-22 オーナー「線を減らす」)
  const vs: Array<{ x: number; y0: number; y1: number; to?: string }> = [];
  const hs: Array<{ y: number; x0: number; x1: number; id?: string; to?: string }> = [];
  const trunk = new Map<string, number>();
  const arrive = new Map<string, number>();
  const into = new Map<string, number>();
  for (const r of reqs) { const k = `${r.end.x}|${r.end.y}`; into.set(k, (into.get(k) ?? 0) + 1); }
  const polys: Array<{ id: string; pts: Pos[] }> = [];
  const lo = (a: number, b: number): number => Math.min(a, b), hi = (a: number, b: number): number => Math.max(a, b);
  const vBusy = (x: number, y0: number, y1: number, to?: string): boolean => vs.some((v) => (!to || v.to !== to) && Math.abs(v.x - x) < LANE - 0.5 && v.y0 < hi(y0, y1) && v.y1 > lo(y0, y1));
  const hBusy = (y: number, x0: number, x1: number, to?: string): boolean => hs.some((h) => (!to || h.to !== to) && Math.abs(h.y - y) < LANE - 0.5 && h.x0 < hi(x0, x1) && h.x1 > lo(x0, x1));
  for (const r of reqs) {
    const others = boxes.filter((b) => b !== r.from && b !== r.to);
    const all = [...others, r.from, r.to];
    const sx = r.start?.x ?? r.from.x + ENTER, sy = r.start?.y ?? r.from.y + (r.from.h ?? BOX_H);
    // 横へ出る帯は段の下 (札は箱より背が低いので、札の下からはまだ隣の箱の高さの中。段の下の辺まで下りてから横へ)
    const yb = Math.max(sy, r.from.y + BOX_H);
    // 札へ入る高さ (同じ札へ n 本なら札の高さの中で並べる。束ねる時は 1 本なので真ん中)
    const key = `${r.end.x}|${r.end.y}`, n = into.get(key) ?? 1, i = arrive.get(key) ?? 0;
    arrive.set(key, i + 1);
    const tx = r.end.x, ty = o.bundle ? r.end.y : r.end.y + (i - (n - 1) / 2) * Math.min(5, 12 / Math.max(1, n - 1));
    const to = o.bundle ? key : undefined;
    // 縦の通り道の候補 (札より左)。近い順に、縦と 2 本の横が箱を通らない物を、先に引いた線と重ならないよう少しずつ左へずらして探す
    const xs = new Set<number>([...(to && trunk.has(to) ? [trunk.get(to)!] : []), sx, tx - 24]);
    for (const b of all) { xs.add(b.x - CLEAR - 4); xs.add(b.x + BOX_W + CLEAR + 4); }
    const cand = [...xs].filter((x) => x <= tx - 16).sort((a, z) => Number(z === trunk.get(to ?? "")) - Number(a === trunk.get(to ?? "")) || Math.abs(a - sx) + Math.abs(a - tx) - (Math.abs(z - sx) + Math.abs(z - tx)));
    let col: number | null = null, yS = yb + BAND[0];
    search: for (const base of cand) {
      for (let k = 0; k < 6; k++) {
        const x = base - k * LANE;
        if (x > tx - 16 || !freeColumn(x, yb + BAND[0], ty, all) || !freeRow(ty, x, tx, all) || vBusy(x, yb + BAND[0], ty, to)) continue;
        for (let y = yb + BAND[0]; y <= yb + BAND[1]; y += LANE) {
          if (freeRow(y, sx, x, others) && !hBusy(y, sx, x, to)) { col = x; yS = y; break search; }
        }
      }
    }
    if (col === null) {
      col = Math.min(tx - 24, ...all.map((b) => b.x)) - 30;
      if (to && trunk.has(to)) col = trunk.get(to)!;
      else while (vBusy(col, yS, ty, to)) col -= LANE;
      for (let y = yb + BAND[0]; y <= yb + BAND[1] && hBusy(y, sx, col, to); y += LANE) yS = y + LANE;
    }
    if (to && !trunk.has(to)) trunk.set(to, col);
    vs.push({ x: sx, y0: sy, y1: yS, to }, { x: col, y0: lo(yS, ty), y1: hi(yS, ty), to });
    hs.push({ y: yS, x0: lo(sx, col), x1: hi(sx, col), id: r.id, to }, { y: ty, x0: lo(col, tx), x1: hi(col, tx), id: r.id, to });
    polys.push({ id: r.id, pts: [{ x: sx, y: sy }, { x: sx, y: yS }, { x: col, y: yS }, { x: col, y: ty }, { x: tx, y: ty }] });
  }
  // 跨ぐ所: 戻りの横 × 進む線の縦、戻りの縦 × 進む線の横・ほかの戻りの横
  const fV = fwd.filter((f) => f.x0 === f.x1), fH = fwd.filter((f) => f.y0 === f.y1);
  const out = new Map<string, string>();
  for (const p of polys) {
    const hops = (a: Pos, b: Pos): number[] => {
      if (a.y === b.y) return fV.filter((f) => f.x0 > lo(a.x, b.x) && f.x0 < hi(a.x, b.x) && lo(f.y0, f.y1) < a.y && hi(f.y0, f.y1) > a.y).map((f) => f.x0);
      const mine = hs.find((h) => h.id === p.id)?.to;
      return [...fH.map((f) => ({ y: f.y0, x0: lo(f.x0, f.x1), x1: hi(f.x0, f.x1) })), ...hs.filter((h) => h.id !== p.id && (!mine || h.to !== mine))]
        .filter((h) => h.x0 < a.x && h.x1 > a.x && h.y > lo(a.y, b.y) && h.y < hi(a.y, b.y)).map((h) => h.y);
    };
    out.set(p.id, hopped(p.pts, hops));
  }
  return out;
}

/** 角を丸めた折れ線。hops(a, b) = その真っ直ぐな所で跨ぐ位置 (横なら x、縦なら y)。跨ぐ形は上 (縦は右) へふくらむ半円 */
function hopped(pts: readonly Pos[], hops: (a: Pos, b: Pos) => number[]): string {
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!, b = pts[i + 1]!, c = pts[i + 2];
    const len = Math.hypot(b.x - a.x, b.y - a.y), u = { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) };
    const rIn = i > 0 ? Math.min(R, len / 2) : 0;
    const rOut = c ? Math.min(R, len / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2) : 0;
    const horiz = a.y === b.y, at = (t: number): Pos => (horiz ? { x: t, y: a.y } : { x: a.x, y: t });
    const from = horiz ? a.x : a.y, dir = horiz ? u.x : u.y;
    for (const t of hops(a, b).filter((t) => Math.abs(t - from) > rIn + HOP + 1 && Math.abs(t - (horiz ? b.x : b.y)) > rOut + HOP + 1).sort((p, q) => (p - q) * dir)) {
      const s = at(t - dir * HOP), e = at(t + dir * HOP);
      d += ` L ${s.x} ${s.y} A ${HOP} ${HOP} 0 0 ${dir > 0 ? 1 : 0} ${e.x} ${e.y}`;
    }
    if (!c) { d += ` L ${b.x} ${b.y}`; break; }
    const w = { x: Math.sign(c.x - b.x), y: Math.sign(c.y - b.y) };
    d += ` L ${b.x - u.x * rOut} ${b.y - u.y * rOut} Q ${b.x} ${b.y} ${b.x + w.x * rOut} ${b.y + w.y * rOut}`;
  }
  return d;
}

/**
 * 進む線の横の棒の段 (同じ高さで横に重なる棒を 1 段 10px ずつ上へ、3 段まで = 手の札に届かない)。spans = 親ごとの棒の [左, 右, 高さ]。返り値 = ずらす量 (上へ、px)
 */
export function busLevels(spans: ReadonlyArray<{ id: string; x0: number; x1: number; y: number }>): Map<string, number> {
  const out = new Map<string, number>();
  const rows = new Map<number, typeof spans[number][]>();
  for (const s of spans) { const k = Math.round(s.y); rows.set(k, [...(rows.get(k) ?? []), s]); }
  for (const list of rows.values()) {
    const lanes: Array<Array<[number, number]>> = [];
    for (const s of [...list].sort((a, z) => a.x0 - z.x0)) {
      let k = lanes.findIndex((l) => l.every(([a, b]) => s.x1 < a - 6 || s.x0 > b + 6));
      if (k < 0) { lanes.push([]); k = lanes.length - 1; }
      lanes[k]!.push([s.x0, s.x1]);
      out.set(s.id, Math.min(k, 2) * 10);
    }
  }
  return out;
}
