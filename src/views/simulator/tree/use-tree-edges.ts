/**
 * use-tree-edges.ts — ツリーの進む線と打つ手の札の置き場 (SimTreePage から分けた、2026-10-22。500 行の決まり)。
 * 手のある箱と分かれ目の箱から、下の結果の箱 (分かれ目は行の箱) へ線を引く
 */
import { computed, type ComputedRef, type Ref } from "vue";
import { BOX_H, BOX_W, type TreeBox, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { busLevels, CHIP_HALF, HAND_DY, hopPath, roundPath, type Pos, type Seg } from "./tree-lines";
import { nudgeLines, segsOfPts } from "./tree-lines-nudge";
import { gridRoute, sideRoute } from "./tree-lines-grid";
import { mergedAway } from "../../../services/simulator/tree/tree-merge-open";
import { LINE_Y, type RowLayout } from "../../../services/simulator/tree/tree-row-tops";
import { backTargets, FOLD_H, foldOuts, linkTargets, stripFolds, stripHidden } from "../../../services/simulator/tree/tree-strip-fold";
import { bandAway, bandGroup, bandHead, bandMidX, headBands } from "../../../services/simulator/tree/tree-band";
import { lvPart, type LvClass } from "../../../services/simulator/tree/tree-whittle"; import { flag } from "../../../web/release-flags"; import { lvLook } from "./tree-whittle-marks";

/**
 * 進む線 (2026-10-22 整列の定義、オーナー「クソ汚い」の後): 普通の木の図と同じ直角の線。親の下から 1 本下りて (途中に手の札)、
 * 子の段の上で横の棒、そこから子の上の辺へ下ろす。色は 進む = 灰 / 外れ・消えた = 赤系 の 2 つだけ
 */
export const LINE = { fwd: "#a39a88", bad: "#c96a72", back: "#5fd0e0" } as const;
/** 通り抜けの所の札 / ＋の半分の高さ (上から来る矢印の先) */
const PASS_R = 16;
/**
 * 横の棒を子の箱の上の辺から離す高さ = 箱の下 → 札の上の縦の線と同じ長さ (40)。棒から各箱へは矢印なしで上の縁までまっすぐ
 * (10-25 オーナー「矢印の位置がわるい、そもそもここは枠でしょ」→「ここと同じにしようか」= 箱 → 札の縦の線と同じ形。18 → 34 → 40)。棒は札のすぐ下 (段の間 240 で札の下から 8)
 */
const BUS_DY = HAND_DY - CHIP_HALF;
/** 横の棒が別の縦の線を跨ぐ橋の半径 */
const HOP = 6;
/** 縦に積んだ下の箱への線 (S-142j): 列の左の脇の x (箱の左の端から) と、箱の横から入る高さ (箱の上の端から) */
const STACK_SIDE = 20, STACK_IN = 24;
/**
 * 並んで走る線どうしの間 (横の棒の段の縦の間・同じ手の札から出る線の横の間)。スイッチ hitsSide の間は前の 10 の倍
 * (S-145、11-14 オーナー「線同士2倍間空けようか今より」「その幅に合わせて縦線の横幅間隔一緒にしてくれ」)
 */
const LANE_GAP = (): number => (flag("hitsSide") ? 20 : 10);
/** 同じ枠へ直に引く線の色 (乗せた時の合流の線と同じ緑) */
const LINK_COLOR = "#6fd08c";
/** 隣の札が無い時の札の幅の上限 (前からの 340) */
const CHIP_MAX = 340;

/** layout = 段の決め (tree-row-tops の rowLayout)。渡すと札と枝分かれを段で揃える */
export function useTreeEdges(doc: Ref<TreeDoc>, boxes: ComputedRef<TreeBox[]>, posOf: (b: TreeBox) => { x: number; y: number }, layout?: () => RowLayout | null, heightOf?: (id: string) => number) {
  /** 箱の真ん中 */
  const midOf = (id: string): number => posOf(doc.value.boxes[id]!).x + BOX_W / 2;
  /** 横の棒が同じ高さで横に重なる親どうしは段をずらす (tree-lines.ts の busLevels) */
  // 畳んだ消去の続き (S-28g ③): 根の線は札へ、札の線は止まった箱へ、隠した箱からは引かない
  const fold = computed(() => { const folds = stripFolds(doc.value); return { folds, hidden: stripHidden(doc.value, folds) }; });
  const outsOf = (b: TreeBox): string[] => foldOuts(doc.value, b, fold.value.folds, fold.value.hidden);
  /** (S-142j ③、スイッチ hitsSide) 札も描かず直に線を引く畳み: 親 → 行き先の箱 (→ 同じ枠へ・→ 同じ中身の箱の続きへ) */
  const links = computed(() => linkTargets(doc.value, fold.value.folds));
  /** (S-142j ③、スイッチ hitsSide) ↩ の畳み: 親 → 戻り先の箱 (手の札に乗せた時だけ青い線) */
  const backs = computed(() => backTargets(doc.value, fold.value.folds));
  /** 戻りの青い線が避ける箱 (描く箱だけ) */
  const avoid = computed(() => backs.value.size || (flag("newerHome") && links.value.size) ? boxes.value.filter((b) => b.out !== "pass" && !fold.value.hidden.has(b.id) && !mergedAway(doc.value, b) && !bandAway(doc.value, b)).map((b) => ({ id: b.id, ...posOf(b), w: BOX_W, h: heightOf?.(b.id) || BOX_H })) : []);
  /**
   * 手の札 (px, jy) から戻り先の箱の横の辺の真ん中への道 (S-145 の探し方 sideRoute、ほかの箱を避ける)。通れなければ箱の間の列と段の間を折れて進む (gridRoute)、それも無ければ右の外を回る
   * (11-14 オーナー「戻る時は手の札からカーソルホバーで青で表示したら？」)
   */
  /** lane = 同じ手の札から出る何本目か (横の高さを 12 ずつ上へずらして、横の所が重ならない。帯に収まるよう 2 本目まで) */
  const backPts = (px0: number, jy: number, t: string, lane = 0, stem: number | null = null): Pos[] => {
    const tq = posOf(doc.value.boxes[t]!), th = heightOf?.(t) || BOX_H, bx = avoid.value.filter((a) => a.id !== t);
    // 札の真ん中 (親の縦の線と同じ x) から上がると、緑が親の箱から出て見える = 行き先の側へ LANE_GAP ずらして上がる (11-14 レビュワー)
    const px = stem != null && px0 === stem ? px0 + LANE_GAP() * (tq.x + BOX_W / 2 < px0 ? -1 : 1) : px0;
    const x0 = Math.min(...avoid.value.map((a) => a.x)), x1 = Math.max(...avoid.value.map((a) => a.x + a.w));
    // 左は木の左の端より外へ出さない (段の札の列の下に隠れる、laneEdge。11-14 ブラック 105: b99 の緑が x -24 を回った)。右の外は残す
    // 横の通り道は「段の箱の下の端 → 手の札の上」の帯 (高さ LINE_Y) の真ん中: 灰色の横線は 1 本も無く縦の線だけが通る (11-14 レビュワー:
    // 札の高さを横に走るとほかの手の札の上を通り、札の下 +27 は灰色の横線の高さと重なって 34 組が並んで走った)
    // 帯 (48) の中で箱・札から 10 以上離した 2 本: 札の上の端の 14 上・34 上 (間 20 = 線どうしの間、11-14 オーナー「線同士2倍間空けよう」)。3 本目からは 2 本目の高さ
    const band = jy - CHIP_HALF - 14 - Math.min(Math.max(0, lane), 1) * LANE_GAP();
    const side = sideRoute({ x: px, y: band, w: 0, h: 0 }, { ...tq, w: BOX_W, h: th }, bx, x0, x1 + 48);
    if (side) return [{ x: px, y: jy }, ...side];
    const ty = tq.y + th / 2;
    // 横の辺どうしで通れなければ、箱の間の列と段の間の高さを折れて進む道 (S-145 の探し方、tree-lines-grid の gridRoute)。
    // 行き先の右と左の辺の外 (16) へ横から着き、辺の真ん中へ入る。前はここで行き先の右 +48 の列を箱を見ずに下り、間の箱を貫通した (11-14 レビュワー、b99→b41 が b38)
    const s = { x: px, y: band - 27 }, outs = [{ e: { x: tq.x + BOX_W + 16, y: ty }, edge: tq.x + BOX_W }, { e: { x: tq.x - 16, y: ty }, edge: tq.x }];
    const len = (ps: readonly { x: number; y: number }[]): number => ps.reduce((n, p, i) => n + (i ? Math.abs(p.x - ps[i - 1]!.x) + Math.abs(p.y - ps[i - 1]!.y) : 0), 0);
    const grid = outs.map(({ e, edge }) => { const g = gridRoute(s, e, avoid.value, x0, x1 + 48, { tops: false }); return g ? [{ x: px, y: jy }, ...g.slice(1), { x: edge, y: ty }] : null; }) // 格子の始め (帯の 27 上) は通らず、札から帯へ直に上がる
      .filter((g): g is { x: number; y: number }[] => !!g).sort((a, z) => len(a) - len(z))[0];
    if (grid) return grid;
    // 外回りも箱を見る: 行き先の右 +48 の列が箱を通るなら、木の右端の外の列へ逃がす (畳んだ緑は札が無いので線を消さない。11-14 レビュワー)
    const near = Math.max(px, tq.x + BOX_W) + 48, segsOf = (c: number): Seg[] => [{ x0: px, y0: band, x1: c, y1: band }, { x0: c, y0: band, x1: c, y1: ty }, { x0: c, y0: ty, x1: tq.x + BOX_W, y1: ty }];
    const col = pierces(segsOf(near), [t]) ? Math.max(near, x1 + 48) : near;
    return [{ x: px, y: jy }, { x: px, y: band }, { x: col, y: band }, { x: col, y: ty }, { x: tq.x + BOX_W, y: ty }];
  };
  const backPath = (px0: number, jy: number, t: string, lane = 0, stem: number | null = null): string => roundPath(backPts(px0, jy, t, lane, stem));
  /** (スイッチ newerHome) 縦・横の真っ直ぐな所がほかの描く箱を横切るか (行き先と出元の箱は除く。端から 4 内側で見る) */
  const pierces = (segs: readonly Seg[], skip: readonly string[]): boolean => avoid.value.some((a) => !skip.includes(a.id) && segs.some((g) => {
    const x0 = Math.min(g.x0, g.x1), x1 = Math.max(g.x0, g.x1), y0 = Math.min(g.y0, g.y1), y1 = Math.max(g.y0, g.y1);
    return x1 > a.x + 4 && x0 < a.x + a.w - 4 && y1 > a.y + 4 && y0 < a.y + a.h - 4;
  }));
  /** 削減の手前の枠の帯 (S-65c ⑫): 枠の箱の線はその枠の帯の真下から (頭の箱の下端)。帯でなければ null */
  /**
   * 削減の手前の枠の帯 (S-65c ⑫): 枠ごとに 帯 → 手の札 → 結果の箱 を別の線で (11-11 オーナー「どこに何打ってこのツリーになったのか一ミリも分からん」)。
   * 先頭の枠 (帯の頭の箱) は帯の真下に札、ほかの枠は帯の下で段をずらして横へ出し、その枠の列 (描かない枠の箱の真ん中) に札。右の帯ほど上の段を通るので線は交わらない。
   * 同じ手の帯 (tree-band の bandGroup) は線を 1 つの札に入れてから結果の箱へ広げる (11-11 オーナー追い 6「3本とりあえず線をカオス削減に入れてから広がってもいいかも」):
   * 札は組の帯の真ん中の下、札を出すのは組の先頭 (lead) だけ。組 = 札・枝分かれの高さと横の棒の段をそろえる単位 (group)
   */
  const bandFrom = (b: TreeBox): { x: number; y: number; col: number; turn: number | null; lead: string; group: string[] } | null => {
    const h = bandHead(doc.value, b.id), bs = headBands(doc.value, h), i = bs.findIndex((x) => x.id === b.id);
    if (i < 0) return null;
    const q = posOf(doc.value.boxes[h]!), xOf = (j: number): number => q.x + bandMidX(BOX_W, j, bs.length), x = xOf(i), y = q.y + (heightOf?.(h) || BOX_H);
    const group = bandGroup(doc.value, b.id), js = group.map((g) => bs.findIndex((z) => z.id === g));
    if (group.length > 1) return { x, y, col: js.reduce((a, j) => a + xOf(j), 0) / js.length, turn: y + 10 + (bs.length - 1 - js[0]!) * 12, lead: group[0]!, group };
    return i === 0 ? { x, y, col: x, turn: null, lead: b.id, group } : { x, y, col: posOf(b).x + BOX_W / 2, turn: y + 10 + (bs.length - 1 - i) * 12, lead: b.id, group };
  };
  /** 同じ手の帯の組の結果 (札・枝分かれの高さを組でそろえる) */
  const groupOuts = (b: TreeBox): string[] => (bandFrom(b)?.group ?? [b.id]).flatMap((g) => outsOf(doc.value.boxes[g]!));
  /** 線の行き先 (まとめた箱はまとめ先、帯の中の枠の箱は帯の頭) */
  const toOf = (o: string): string => { const c0 = doc.value.boxes[o]!; return mergedAway(doc.value, c0) ? c0.back! : bandAway(doc.value, c0) ? bandHead(doc.value, o) : o; };
  // 同じ手の帯の組は先頭の分だけ (組の結果を全部入れて 1 本の棒)
  const busShift = computed(() => busLevels(boxes.value.filter((b) => (b.hand || b.split) && outsOf(b).length && (bandFrom(b)?.lead ?? b.id) === b.id).map((b) => {
    const os = groupOuts(b), xs = [bandFrom(b)?.col ?? posOf(b).x + BOX_W / 2, ...os.map(toOf).map(midOf)];
    return { id: b.id, x0: Math.min(...xs), x1: Math.max(...xs), y: Math.min(...os.map((o) => posOf(doc.value.boxes[toOf(o)]!).y)) - BUS_DY };
  }), LANE_GAP()));
  // 分かれ目 (手の無い箱) も、札を「分かれ目」にして同じ線で下の行の箱へ
  const edges = computed(() => boxes.value.filter((b) => (b.hand || b.split) && (outsOf(b).length || links.value.has(b.id) || backs.value.has(b.id))).map((b) => {
    const p = posOf(b), pass = b.out === "pass";
    // 通り抜けは箱が無いので、手の札を箱の上の端の所に置き、そこから下りる
    // まとめて描かない箱 (案 A) は、まとめ先の箱へ直に線を引く (同じまとめ先が 2 つあれば 1 本)
    const kids = [...new Map(outsOf(b).map((o) => { const to = toOf(o); return [to, { id: to, c: doc.value.boxes[to]!, q: posOf(doc.value.boxes[to]!) }] as const; })).values()];
    // 札は子の箱の上の辺から測る (横の棒の上、前と同じ 68)。箱の中にアイテムの枠を出して箱の高さが中身で伸びるので、親の下 (y + BOX_H) から測ると背の高い親の中に札が入った (10-26)
    // 札 → 枝分かれも同じ長さ (LINE_Y) に (前は札のすぐ下 8 で分かれて詰まって見えた、10-28 夜オーナー「えだわかれするところもいっしょのながさに」)
    // 縦の線は全部 LINE_Y (tree-row-tops の settleRows と同じ式): 枝分かれがあれば 箱 → 札・札 → 枝分かれ・枝分かれ → 箱、無ければ 箱 → 札・札 → 箱 (S-68)
    // 同じ手の帯の組は組の結果で札・枝分かれの高さを決める (組の線が同じ所を通る)
    // 枠ごとに 1 本ずつの時 (S-65c ⑫、スイッチ treeLaneOwnHand) は、帯 → 手の札 → 結果の箱の線を枠の色に (どの枠の枝かを線で追える。11-12 オーナー「線が無いと分かりづらい」)
    const lane: LvClass | null = flag("treeLaneOwnHand") && bandFrom(b) ? lvPart(b.junkKey) ?? null : null, tone = lane ? `rgb(${lvLook(lane).rgb})` : null;
    const bf = bandFrom(b), lead = bf?.lead ?? b.id, gk = bf && bf.group.length > 1 ? [...new Set(groupOuts(b).map(toOf))] : kids.length ? kids.map((k) => k.id) : links.value.get(b.id) ?? [];
    // 子が ↩ の畳みだけ (描く子も直に線も無い) の時は、手の札を親の下 LINE_Y に (段の決めがあればその段の札の高さ)
    const top = gk.length ? Math.min(...gk.map((k) => posOf(doc.value.boxes[k]!).y)) : p.y + (heightOf?.(b.id) || BOX_H) + 2 * LINE_Y + 2 * CHIP_HALF, multi = gk.length > 1;
    // 帯の中の枠の箱は帯の真下から (手の名前は帯の中なので札は出さない、band)
    const px = bf?.col ?? p.x + BOX_W / 2, py = bf?.y ?? (pass ? p.y : p.y + (fold.value.folds.has(b.id) ? FOLD_H : BOX_H));
    // 段を揃える (S-68): 札はその段の一番下の枠 + LINE_Y、枝分かれは札の下 + LINE_Y (同じ段の札・枝分かれは同じ高さ)
    const Lr = layout?.() ?? null, r = Lr?.rows.get(lead);
    const rowJy = Lr && r != null && !pass ? Lr.bottom[r]! + LINE_Y + CHIP_HALF : null;
    // 畳んだ消去の続きの札の上下 (人の消去の箱 → 札・札 → 止まった箱) は、手の札を前の箱の下端と次の箱の上端の真ん中に (上下の線を同じ長さ。
    // 段の札の高さに揃えると、背の低い札の下の線だけ長くなった。11-07 オーナー「消去と前の枠と次のわくの間において欲しい…不細工にならないように線の長さが」)
    const mid = !pass && !multi && (fold.value.folds.has(b.id) || (!!kids[0] && fold.value.folds.has(kids[0].id)));
    const midJy = mid ? (fold.value.folds.has(b.id) ? py : p.y + (heightOf?.(b.id) || BOX_H)) / 2 + top / 2 : null;
    const jy = pass ? p.y : midJy ?? rowJy ?? top - (multi ? 2 : 1) * LINE_Y - CHIP_HALF;
    const busY0 = midJy != null ? (midJy + CHIP_HALF + top) / 2 : (rowJy != null ? (multi ? rowJy + CHIP_HALF + LINE_Y : (rowJy + CHIP_HALF + top) / 2) : top - (multi ? LINE_Y : LINE_Y / 2));
    // ずらしても手の札の下の縁 + 12 より上へは上げない (段の間を倍にしても札に届かない)
    const busY = busY0 - Math.max(0, Math.min(busShift.value.get(lead) ?? 0, busY0 - (jy + CHIP_HALF + 12)));
    // 角丸の段付き (React Flow の smoothstep、見本の 3): 親の下から下りて、角を丸めて横へ、角を丸めて子の上の辺へ。
    // 外れ (赤) を先に描き、進む (灰) を上に重ねる (同じ横の棒を通る所は灰に見える)
    // 縦に積んだ箱 (S-142j): 同じ x の兄弟の下の箱は、列の左の脇 (STACK_SIDE) を下りて箱の横から入る (上の箱の裏を通ると上の箱の続きに見える)
    const under = (k: (typeof kids)[number]): boolean => kids.some((o) => o !== k && o.q.x === k.q.x && o.q.y < k.q.y);
    // (S-142j ③、スイッチ hitsSide) 描く子が無い (↩ の畳みだけ・同じ枠へ直に線だけ) 箱は親の線を手の札で止める (真下に別の親の子の箱を置ける。11-14 オーナー「下に来るはず」)
    const onlyCards = !kids.length;
    const to = kids.map((k) => {
      const side = under(k), cx = side ? k.q.x - STACK_SIDE : midOf(k.id), cy = k.q.y - (k.c.out === "pass" ? PASS_R : 0), dx = cx - px, r = Math.min(10, Math.abs(dx) / 2), s = Math.sign(dx);
      const ey = k.q.y + STACK_IN;
      // hops = 横の棒が通り過ぎる別の札の縦の線の x (そこに半円の橋を掛ける、下の hopped)
      const mk = (hops: readonly number[]): string => !s ? `M ${px} ${busY - 10} L ${cx} ${cy}`
        : `M ${px} ${busY - 10} L ${px} ${busY - r} Q ${px} ${busY} ${px + s * r} ${busY} `
          + [...hops].sort((a, z) => s * (a - z)).map((x) => `L ${x - s * HOP} ${busY} A ${HOP} ${HOP} 0 0 ${s > 0 ? 1 : 0} ${x + s * HOP} ${busY} `).join("")
          + `L ${cx - s * r} ${busY} Q ${cx} ${busY} ${cx} ${busY + r} ` + (side ? `L ${cx} ${ey - 8} Q ${cx} ${ey} ${cx + 8} ${ey} L ${k.q.x} ${ey}` : `L ${cx} ${cy}`);
      const bad = k.c.out !== "hit" && k.c.out !== "any" && k.c.out !== "pass" && k.c.out !== "branch";
      return { id: k.id, w: 2, color: tone ?? (bad ? LINE.bad : LINE.fwd), kind: bad ? "bad" : "fwd", d: mk([]), bad, mk, h: s ? { x0: Math.min(px + s * r, cx - s * r), x1: Math.max(px + s * r, cx - s * r), y: busY } : null, pts: null as Pos[] | null };
    });
    // (S-142j ③、スイッチ hitsSide) 同じ枠へ・同じ中身の箱の続きへの畳みは札も描かず、手の札の真ん中から真下へ伸ばし、行き先の箱の真ん中の高さで曲がって横から入る
    // (11-14 オーナー「左の枠の真ん中めがけて横の線はそこで縦の線は消去の真ん中から下へのばして」「同じ枠系はそのごの枠へつなげばいいのでは」)
    // 手の札の真ん中から始める (札の裏を通って下の縁で切れない。CHIP_HALF は札の高さの見込みで本物より大きく、下の縁から始めると隙間が出た。11-14 オーナー「緑くっついてないぞ手の札に」)
    const linkY0 = jy, linkSegs: Seg[] = [], px0 = px;
    // (スイッチ hitsSide) 同じ手の札から灰の線と緑の線 (や緑 2 本) が出る時は、緑を行き先の側へ LANE_GAP ずつずらして出す (同じ点から出て 1 本に見えた。
    // 11-14 オーナー「手の札から伸びてる線もあいだあげてちゃんと２本で伸びてんだってわかった方が良い」「縦線の横幅間隔一緒にしてくれ」)
    let nth = kids.length ? 1 : 0;
    for (const t of links.value.get(b.id) ?? []) {
      const tq = posOf(doc.value.boxes[t]!), th = heightOf?.(t) || BOX_H, ty = tq.y + th / 2;
      const off = flag("hitsSide") ? nth++ * LANE_GAP() * (tq.x + BOX_W / 2 < px0 ? -1 : 1) : 0, px = px0 + off;
      // (スイッチ newerHome) 真下へまっすぐ・L 字のどちらもほかの箱を貫通する時は、箱を避ける道 (S-145 の sideRoute) で行き先の横の辺の真ん中へ
      // (11-14 オーナー「貫通してんのこれ」「Ｌ字は例だから。臨機応変にしてほしいけどそこは」)
      if (flag("newerHome")) {
        const ex0 = tq.x + BOX_W / 2 < px ? tq.x + BOX_W : tq.x;
        const lSegs: Seg[] = px >= tq.x && px <= tq.x + BOX_W ? [{ x0: px, y0: jy + CHIP_HALF, x1: px, y1: tq.y }] : [{ x0: px, y0: jy + CHIP_HALF, x1: px, y1: ty }, { x0: px, y0: ty, x1: ex0, y1: ty }];
        if (pierces(lSegs, [t, b.id])) { const p0 = backPts(px, jy, t, nth - 1, px0), d0 = roundPath(p0); to.push({ id: t, w: 2, color: LINK_COLOR, kind: "fwd", d: d0, bad: false, mk: () => d0, h: null, pts: p0 }); continue; }
      }
      if (px >= tq.x && px <= tq.x + BOX_W) { // 行き先が真下: 上の辺へまっすぐ
        to.push({ id: t, w: 2, color: LINK_COLOR, kind: "fwd", d: `M ${px} ${linkY0} L ${px} ${tq.y}`, bad: false, mk: () => `M ${px} ${linkY0} L ${px} ${tq.y}`, h: null, pts: null });
        linkSegs.push({ x0: px, y0: linkY0, x1: px, y1: tq.y });
        continue;
      }
      const ex = tq.x + BOX_W / 2 < px ? tq.x + BOX_W : tq.x, sg = Math.sign(ex - px) || 1, r = Math.min(10, Math.abs(ex - px) / 2, Math.max(0, ty - linkY0) / 2);
      const mk = (hops: readonly number[]): string => `M ${px} ${linkY0} L ${px} ${ty - r} Q ${px} ${ty} ${px + sg * r} ${ty} `
        + [...hops].sort((a, z) => sg * (a - z)).map((x) => `L ${x - sg * HOP} ${ty} A ${HOP} ${HOP} 0 0 ${sg > 0 ? 1 : 0} ${x + sg * HOP} ${ty} `).join("") + `L ${ex} ${ty}`;
      to.push({ id: t, w: 2, color: LINK_COLOR, kind: "fwd", d: mk([]), bad: false, mk, h: { x0: Math.min(px + sg * r, ex), x1: Math.max(px + sg * r, ex), y: ty }, pts: null });
      linkSegs.push({ x0: px, y0: linkY0, x1: px, y1: ty }, { x0: px, y0: ty, x1: ex, y1: ty });
    }
    to.sort((a, z) => Number(z.bad) - Number(a.bad));
    // 戻りの線が跨ぐ所を探す用の真っ直ぐな所 (縦の幹・横の棒・子へ下りる縦)
    const segs: Seg[] = [{ x0: px, y0: py, x1: px, y1: onlyCards ? jy + CHIP_HALF : busY }, ...kids.flatMap((k) => { const cx = under(k) ? k.q.x - STACK_SIDE : midOf(k.id), y1 = under(k) ? k.q.y + STACK_IN : k.q.y; return [{ x0: px, y0: busY, x1: cx, y1: busY }, { x0: cx, y0: busY, x1: cx, y1 }]; }), ...linkSegs];
    // ↩ の畳みの戻り先への青い線 (手の札に乗せた時だけ描く。TreeCanvas)
    const backLines = (backs.value.get(b.id) ?? []).filter((t) => doc.value.boxes[t]).map((t) => ({ id: t, d: backPath(px, jy, t) }));
    return { id: b.id, hand: b.hand, split: b.split?.length, band: !!bf, backLines, chip: lead === b.id, lane, stemColor: tone ?? LINE.fwd, jx: px, jy, stem: bf?.turn != null ? `M ${bf.x} ${py} L ${bf.x} ${bf.turn} L ${px} ${bf.turn} L ${px} ${busY - 10}` : `M ${px} ${py} L ${px} ${onlyCards ? jy : busY - 10}`, to, segs };
  }));
  /**
   * 札の幅の上限 (ツリーの座標): 同じ高さの隣の札の真ん中までの近い方の距離 − 12 (両方がその幅でも重ならない)。隣が無ければ CHIP_MAX。
   * 隣と重ならないように (10-25 オーナー「こういうところだぶるね」、ルーンの合金と無限のパーフェクトエッセンスの札が重なった)。はみ出す名前は … で切る
   */
  const chipRoom = computed(() => {
    const out = new Map<string, number>();
    const shown = edges.value.filter((e) => e.chip);
    for (const e of shown) {
      const near = Math.min(...shown.filter((f) => f !== e && Math.abs(f.jy - e.jy) < CHIP_HALF * 2).map((f) => Math.abs(f.jx - e.jx)));
      out.set(e.id, Math.min(CHIP_MAX, near - 12));
    }
    return out;
  });
  /**
   * 横の棒が別の札の縦の線を通り過ぎる所に半円の橋 (11-11 オーナー「なんか繋がってないのに別の線で横繋がったり？」「多分通り過ぎてるだけなんだろうが」)。
   * 並んだ箱の消去の線が段をずらして重なり、ほかの縦の線と交わって合流に見えた (オーナーの 11-08 の木の 8 → 9 段目)。データのつながりは変えない。
   * 同じ札の組 (帯の線が 1 つの札に入る、札の位置が同じ) どうしはつながっているので橋を掛けない
   */
  /**
   * (S-145、スイッチ hitsSide) 箱を避けて曲がる緑を全部組んだ後に、ほかの線と間 20 未満で並ぶ所を上下・左右へずらす (tree-lines-nudge)。
   * ずらすと箱・手の札を通る時は取らない (11-14 レビュワー: 別の親の緑どうしが同じ高さで重なって 1 本に見えた)
   */
  const nudged = computed(() => {
    const list = edges.value;
    const items = list.flatMap((e) => e.to.filter((o) => o.pts).map((o) => ({ e, o })));
    if (!flag("hitsSide") || !items.length) return list;
    const chips = list.filter((e) => e.chip).map((e) => { const w = chipRoom.value.get(e.id) ?? CHIP_MAX; return { id: e.id, x: e.jx - w / 2, y: e.jy - CHIP_HALF, w, h: 2 * CHIP_HALF }; });
    // 自分の手の札は、そこから出る縦の所だけ通って良い (横にずらして自分の札の高さを走らない。b99 の 3 本目が札の中の y 3834 へ入った)
    const onChip = (segs: readonly Seg[], own: string): boolean => chips.some((c) => segs.some((g) => (c.id !== own || g.y0 === g.y1) && Math.max(g.x0, g.x1) > c.x && Math.min(g.x0, g.x1) < c.x + c.w && Math.max(g.y0, g.y1) > c.y && Math.min(g.y0, g.y1) < c.y + c.h));
    const out = nudgeLines(items.map(({ e, o }) => ({ pts: o.pts!, bad: (segs: readonly Seg[]) => pierces(segs, [o.id, e.id]) || onChip(segs, e.id) })), list.flatMap((e) => e.segs));
    const moved = new Map(items.map(({ o }, i) => [o, out[i]!] as const));
    return list.map((e) => ({ ...e, to: e.to.map((o) => { const p = moved.get(o); return p ? { ...o, pts: p, d: roundPath(p) } : o; }) }));
  });
  const hopped = computed(() => {
    const list = nudged.value, keyOf = (e: { jx: number; jy: number }): string => `${Math.round(e.jx)},${Math.round(e.jy)}`;
    const vOf = (k: string, g: Seg) => ({ k, x: g.x0, y0: Math.min(g.y0, g.y1), y1: Math.max(g.y0, g.y1) });
    // 曲がる緑の縦の所も跨ぐ相手に入れる (o = その緑。自分は跨がない)
    const greenV = list.flatMap((e) => e.to.filter((o) => o.pts).flatMap((o) => segsOfPts(o.pts!).filter((g) => g.x0 === g.x1 && g.y0 !== g.y1).map((g) => ({ ...vOf(keyOf(e), g), o }))));
    const vert = [...list.flatMap((e) => e.segs.filter((g) => g.x0 === g.x1 && g.y0 !== g.y1).map((g) => vOf(keyOf(e), g))), ...greenV];
    return list.map((e) => {
      const k = keyOf(e);
      const to = e.to.map((o) => {
        // (S-145、スイッチ hitsSide) 曲がる緑の横の所も、ほかの札の縦の線を跨ぐ所に半円の橋 (灰の横の棒と同じ形。11-14 レビュワー)
        if (o.pts && flag("hitsSide")) {
          const d = hopPath(o.pts, (a, b) => a.y !== b.y ? [] : [...new Set(vert.filter((v) => v.k !== k && ("o" in v ? v.o !== o : true) && v.x > Math.min(a.x, b.x) && v.x < Math.max(a.x, b.x) && v.y0 < a.y - 1 && v.y1 > a.y + 1).map((v) => v.x))]);
          return { ...o, d };
        }
        const h = o.h;
        if (!h) return o;
        const xs = [...new Set(vert.filter((v) => v.k !== k && v.x > h.x0 + HOP + 1 && v.x < h.x1 - HOP - 1 && v.y0 < h.y - 1 && v.y1 > h.y + 1).map((v) => v.x))];
        return xs.length ? { ...o, d: o.mk(xs) } : o;
      });
      return { ...e, to };
    });
  });
  return { edges: hopped, chipRoom };
}
