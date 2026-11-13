/**
 * tree-cam-math.ts — ツリーの視点 (場所と大きさ) の決まった値と式だけ (Vue・Vue Flow・画面を知らない)。
 * どの操作で視点がどう動くかの決まりは設計図 sim-tree.md の S-147a の表。使うのは use-tree-flow.ts (大きさ・開く・寄る・端・幅) と
 * use-tree-cam-follow.ts (木を変えた後)。視点 = Vue Flow の viewport (x・y = 面の左上の画面の位置、zoom = 画面の倍率 × ページの zoom)。
 */
import { BOX_H, BOX_W } from "../../../services/simulator/tree/tree-model";

export type Vp = { x: number; y: number; zoom: number };
export type Area = { x: number; y: number; w: number; h: number };
/** 箱の集まりの端 (ツリーの座標。b は箱の下の ＋ まで) */
export type Ext = { l: number; r: number; t: number; b: number };

/**
 * 倍率は決まった段だけ (10-22 オーナー: 自由な値だと 76% で札がくっついて重なった)。＋−・全体表示・幅が変わった時はこの段に吸い付く (ホイールは S-147i)。
 * 75% は縮めたまま組める一番下の段 (VIEW_ONLY)、それ未満は見るだけ。20% は見本の木にプレフィックスをつないで 25% でも収まらなくなった分 (10-22)。
 * 15%・10% は 10-26 に全体表示のために足したが、本番で木が 10% の点になったので外した (10-26 夜オーナー「なんでこうしたの、めっちゃ引きのやつ」)
 */
export const ZOOM_LEVELS = [0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5] as const;
export const ZOOM_MIN = ZOOM_LEVELS[0];
export const ZOOM_MAX = ZOOM_LEVELS[ZOOM_LEVELS.length - 1]!;
/** 20% でも入らない木の時だけ足す段 (S-147d) */
const WHOLE_STEPS = [0.15, 0.1] as const;
/** ホイールの量をためてから 1 段動かす (マウスの 1 目盛り ≒ 100、タッチパッドは細かく来る) */
export const WHEEL_STEP = 60;
/** ホイール 1 回の倍率 (S-147i、スイッチ treeFineWheel) */
export const WHEEL_RATE = 1.1;
/** これ未満は箱の中の物を押させず、箱を押すと等倍の編集のポップアップ (ボタンが 24px の 3/4 = 18px を切る。10-22 オーナー「75% 未満の見るだけをやめる」) */
export const VIEW_ONLY = 0.75;
/** スマホの全体表示の一番小さい段 */
export const PHONE_MIN = 0.5;
/**
 * 開いた時の一番小さい段 (これ未満でしか収まらない木は、この段で始まりの箱を上の真ん中)。組める一番下の段 VIEW_ONLY と同じ
 * (50% にしていた時は 5 箱の木でも 67% = 見るだけで開き、箱の ＋ が隠れた。10-25 ブラック「＋ が隠れない事を優先」)
 */
export const OPEN_MIN = VIEW_ONLY;
/** 木を変えた後の大きさの境目 (S-147h、スイッチ treeCalmCamera): これより大きければここへ縮め、以下ならそのまま */
export const CALM_Z = 0.5;
/** 開いた時の寄りの後、箱の背が測れて並べ直しが済むまでの間 (この間は見ていた箱を軸に視点を送らない、S-147h) と、手を決めた箱を軸にする間 */
export const OPEN_QUIET = 1500, HELD_MS = 3000;
/** 「全体を表示」の一番小さい段 (これより大きい木は下が枠の外に出てよい。10-26 夜ブラック 13「全体表示は下限 25%」) */
export const FIT_MIN = 0.25;
/** 全体に合わせる時の余白の下限 */
export const PAD_MIN = 12;
/** 右へ伸びる木 (S-142h) が枠に入らない時の左の余白 */
export const LEFT_PAD = 24;
/** 箱の下の外の＋ (TreeBox の data-tree-next、真ん中が箱の 68px 下・28px) の分 */
export const NEXT_H = 88;
/** 帯「! 未設定」(TreeUnsetBar) の高さ。11-11 から木の面の上に浮くので、見える高さから引いて数える (ページの zoom を掛けて使う) */
export const BAR_H = 44;

/** 一番近い段 */
export const snapTo = (levels: readonly number[], z: number): number => levels.reduce((a, l) => (Math.abs(l - z) < Math.abs(a - z) ? l : a), levels[0]!);
/** 今の木で使える段。whole = 木全体が入る倍率 (枠が無い間は null)。20% でも全体が入らない木だけ、全体が入る倍率まで下に足す (S-147d) */
export const levelsWith = (whole: number | null): readonly number[] =>
  whole == null || whole >= ZOOM_MIN ? ZOOM_LEVELS : [whole, ...WHOLE_STEPS.filter((l) => l > whole * 1.1), ...ZOOM_LEVELS].sort((a, b) => a - b);

/** 大きさを to に変える。ツリーの座標の点 w が、変えた後も同じ画面の点に来るように */
export const zoomAt = (vp: Vp, w: { x: number; y: number }, to: number): Vp => ({ x: w.x * vp.zoom + vp.x - w.x * to, y: w.y * vp.zoom + vp.y - w.y * to, zoom: to });

/** 段の札の帯から離す間 (S-147k) */
export const LANE_GAP = 8;
/**
 * 大きさを変えた後の視点 vp で、木の面の左の段の札の帯 (幅 lw) にかぶる箱があれば、横だけ動きの小さい方へ送った x (S-147k、スイッチ treeZoomLane)。
 * 帯の右へ出す (箱の左の端 = 帯の右 + LANE_GAP) か、枠の左の外へ逃がす (箱の右の端 = 0) の 2 つから、送った後にかぶる箱が無い方の小さい動き。
 * どちらでもかぶる時は動きの小さい方。boxes = 描いている箱 (ツリーの座標と高さ)、h = 枠の高さ (縦に枠の外の箱は見ない)
 */
export function laneClear(boxes: readonly { x: number; y: number; h: number }[], vp: Vp, lw: number, h: number): number {
  const z = vp.zoom, sw = BOX_W * z;
  const hits = (x: number) => boxes.filter((b) => { const sx = b.x * z + x, sy = b.y * z + vp.y; return sy + b.h * z > 0 && sy < h && sx < lw && sx + sw > 0; });
  const now = hits(vp.x);
  if (!lw || !now.length) return vp.x;
  const right = vp.x + Math.max(...now.map((b) => lw + LANE_GAP - (b.x * z + vp.x))), left = vp.x - Math.max(...now.map((b) => b.x * z + vp.x + sw));
  const byMove = [right, left].sort((a, c) => Math.abs(a - vp.x) - Math.abs(c - vp.x));
  return byMove.find((x) => !hits(x).length) ?? byMove[0]!;
}

/**
 * 木 (範囲 b、下の端 bottom) が枠 (幅 w・高さ h、上は top を空ける) に入る一番大きい倍率 (段に丸めない・ページの zoom を割る前)。
 * 左右は始まりの箱 (左の端 startX) の真ん中から遠い方の端まで (始まりを真ん中に置くので、片側に伸びた木はその側の分を両側に取る)。
 * grow = S-142h (スイッチ treeGrowRight): 木は右へだけ伸びるので、幅は木の幅そのまま (始まりを真ん中に置かない)
 */
export function fitZoom(b: Area, startX: number | null, w: number, h: number, top: number, bottom: number, grow: boolean): number {
  const sx = startX != null ? startX + BOX_W / 2 : b.x + 0.5 * b.w, half = grow ? 0.5 * b.w : Math.max(sx - b.x, b.x + b.w - sx);
  return Math.min((w / 2 - PAD_MIN) / half, (h - top - PAD_MIN) / (bottom - b.y));
}

/**
 * 開いた時の置き場: 木の一番上を上の端 (top) に、横は始まりの箱を枠 (段の札の帯 lw の右、幅 w) の真ん中に、倍率 z で
 * (10-26 オーナー「スタートは必ずツリーを真ん中に配置して開始、それも一番上ね」)。
 * grow = S-142h (スイッチ treeGrowRight): 木が枠に入るなら木の真ん中を枠の真ん中へ、入らない (か left) なら木の左端 (始まりの箱) を枠の左へ
 */
export function openPlace(b: Area, startX: number | null, lw: number, w: number, z: number, top: number, grow: boolean, left: boolean): { x: number; y: number; z: number } {
  const sx = startX != null ? startX + BOX_W / 2 : b.x + 0.5 * b.w;
  const x = grow ? (!left && b.w * z <= w - 2 * LEFT_PAD ? lw + w / 2 - (b.x + 0.5 * b.w) * z : lw + LEFT_PAD - b.x * z) : lw + w / 2 - sx * z;
  return { x, y: top - b.y * z, z };
}

/**
 * 木を送れる範囲の左と上の端 (S-142h、スイッチ treeOpenStartLeft): 視点の x・y はここまで (これより大きい = 左・上の空きが見える)。
 * x0・y0 = 木の左と上の端 (手で左へ引っ張った箱がある時はその箱)
 */
export function edgeLimit(b: Area, x0: number, y0: number, lw: number, w: number, z: number, top: number): { mx: number; my: number } {
  return { mx: Math.max(lw + LEFT_PAD, lw + w / 2 - 0.5 * (b.x + b.w - x0) * z) - x0 * z, my: top - y0 * z };
}

/** 箱の集まりの端。下は箱の本当の高さ (heightOf、測れていなければ BOX_H) + 下の ＋ の分 */
export function extentOf(boxes: readonly { id: string; x: number; y: number }[], heightOf: (id: string) => number): Ext {
  return { l: Math.min(...boxes.map((b) => b.x)), r: Math.max(...boxes.map((b) => b.x + BOX_W)), t: Math.min(...boxes.map((b) => b.y)), b: Math.max(...boxes.map((b) => b.y + (heightOf(b.id) || BOX_H))) + NEXT_H };
}
/** 範囲 e が枠 (w × h、余白 m) の外に出ているか */
export const isOut = (e: Ext, vp: Vp, w: number, h: number, m: number): boolean => e.l * vp.zoom + vp.x < m || e.t * vp.zoom + vp.y < m || e.r * vp.zoom + vp.x > w - m || e.b * vp.zoom + vp.y > h - m;
/** 範囲 e が枠に入る向きへ最小限だけ送った x・y (今の倍率でその向きに入らない時は、その向きは動かさない。S-147c) */
export function nudgeInto(e: Ext, vp: Vp, w: number, h: number, m: number): { x: number; y: number } {
  const z = vp.zoom;
  let nx = vp.x, ny = vp.y;
  if ((e.r - e.l) * z <= w - 2 * m) { if (e.l * z + nx < m) nx = m - e.l * z; else if (e.r * z + nx > w - m) nx = w - m - e.r * z; }
  if ((e.b - e.t) * z <= h - 2 * m) { if (e.t * z + ny < m) ny = m - e.t * z; else if (e.b * z + ny > h - m) ny = h - m - e.b * z; }
  return { x: nx, y: ny };
}
