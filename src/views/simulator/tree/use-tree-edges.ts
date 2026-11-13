/**
 * use-tree-edges.ts — ツリーの進む線と打つ手の札の置き場 (SimTreePage から分けた、2026-10-22。500 行の決まり)。
 * 手のある箱と分かれ目の箱から、下の結果の箱 (分かれ目は行の箱) へ線を引く
 */
import { computed, type ComputedRef, type Ref } from "vue";
import { BOX_H, BOX_W, type TreeBox, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { busLevels, CHIP_HALF, HAND_DY, type Seg } from "./tree-lines";
import { mergedAway } from "../../../services/simulator/tree/tree-merge-open";
import { endCards, LINE_Y, type RowLayout } from "../../../services/simulator/tree/tree-row-tops";
import { FOLD_H, foldOuts, stripFolds, stripHidden } from "../../../services/simulator/tree/tree-strip-fold";
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
/** 段の右端の札への細い線が手の札の下の縁から折れるまでの長さ (S-142j ②) */
const CARD_DY = 14;
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
  const ends = computed(() => endCards(doc.value));
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
  // 段の右端の札への細い線は横の棒の段に数えない (札の下を通る別の高さ、S-142j ② hitsSide)
  const busShift = computed(() => busLevels(boxes.value.filter((b) => (b.hand || b.split) && outsOf(b).some((o) => !ends.value.has(toOf(o))) && (bandFrom(b)?.lead ?? b.id) === b.id).map((b) => {
    const os = groupOuts(b).filter((o) => !ends.value.has(toOf(o))), xs = [bandFrom(b)?.col ?? posOf(b).x + BOX_W / 2, ...os.map(toOf).map(midOf)];
    return { id: b.id, x0: Math.min(...xs), x1: Math.max(...xs), y: Math.min(...os.map((o) => posOf(doc.value.boxes[toOf(o)]!).y)) - BUS_DY };
  })));
  // 分かれ目 (手の無い箱) も、札を「分かれ目」にして同じ線で下の行の箱へ
  const edges = computed(() => boxes.value.filter((b) => (b.hand || b.split) && outsOf(b).length).map((b) => {
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
    const bf = bandFrom(b), lead = bf?.lead ?? b.id, gk = bf && bf.group.length > 1 ? [...new Set(groupOuts(b).map(toOf))] : kids.map((k) => k.id);
    const top = Math.min(...gk.map((k) => posOf(doc.value.boxes[k]!).y)), multi = gk.length > 1;
    // 帯の中の枠の箱は帯の真下から (手の名前は帯の中なので札は出さない、band)
    const px = bf?.col ?? p.x + BOX_W / 2, py = bf?.y ?? (pass ? p.y : p.y + (fold.value.folds.has(b.id) ? FOLD_H : BOX_H));
    // 段を揃える (S-68): 札はその段の一番下の枠 + LINE_Y、枝分かれは札の下 + LINE_Y (同じ段の札・枝分かれは同じ高さ)
    const Lr = layout?.() ?? null, r = Lr?.rows.get(lead);
    const rowJy = Lr && r != null && !pass ? Lr.bottom[r]! + LINE_Y + CHIP_HALF : null;
    // 畳んだ消去の続きの札の上下 (人の消去の箱 → 札・札 → 止まった箱) は、手の札を前の箱の下端と次の箱の上端の真ん中に (上下の線を同じ長さ。
    // 段の札の高さに揃えると、背の低い札の下の線だけ長くなった。11-07 オーナー「消去と前の枠と次のわくの間において欲しい…不細工にならないように線の長さが」)
    const mid = !pass && !multi && (fold.value.folds.has(b.id) || fold.value.folds.has(kids[0]!.id));
    const midJy = mid ? (fold.value.folds.has(b.id) ? py : p.y + (heightOf?.(b.id) || BOX_H)) / 2 + top / 2 : null;
    const jy = pass ? p.y : midJy ?? rowJy ?? top - (multi ? 2 : 1) * LINE_Y - CHIP_HALF;
    const busY = midJy != null ? (midJy + CHIP_HALF + top) / 2 : (rowJy != null ? (multi ? rowJy + CHIP_HALF + LINE_Y : (rowJy + CHIP_HALF + top) / 2) : top - (multi ? LINE_Y : LINE_Y / 2)) - (busShift.value.get(lead) ?? 0);
    // 角丸の段付き (React Flow の smoothstep、見本の 3): 親の下から下りて、角を丸めて横へ、角を丸めて子の上の辺へ。
    // 外れ (赤) を先に描き、進む (灰) を上に重ねる (同じ横の棒を通る所は灰に見える)
    // 縦に積んだ箱 (S-142j): 同じ x の兄弟の下の箱は、列の左の脇 (STACK_SIDE) を下りて箱の横から入る (上の箱の裏を通ると上の箱の続きに見える)
    const under = (k: (typeof kids)[number]): boolean => kids.some((o) => o !== k && o.q.x === k.q.x && o.q.y < k.q.y);
    // (S-142j ②、スイッチ hitsSide) 段の右端の札への線は細く、手の札のすぐ下 (CARD_DY) で右へ折れて札の上へ下りる = 親の真下へ下りない
    // (真下に別の親の子の箱を置ける。11-14 オーナー「下に来るはず」)。子が札だけの箱は親の線を札で止める
    const cardY = jy + CHIP_HALF + CARD_DY, onlyCards = kids.every((k) => ends.value.has(k.id));
    const to = kids.map((k) => {
      if (ends.value.has(k.id)) {
        const cx = midOf(k.id), cy = k.q.y, s = Math.sign(cx - px) || 1, r = Math.min(8, Math.abs(cx - px) / 2), y0 = jy + CHIP_HALF;
        const mk = (hops: readonly number[]): string => `M ${px} ${y0} L ${px} ${cardY - r} Q ${px} ${cardY} ${px + s * r} ${cardY} `
          + [...hops].sort((a, z) => s * (a - z)).map((x) => `L ${x - s * HOP} ${cardY} A ${HOP} ${HOP} 0 0 ${s > 0 ? 1 : 0} ${x + s * HOP} ${cardY} `).join("")
          + `L ${cx - s * r} ${cardY} Q ${cx} ${cardY} ${cx} ${cardY + r} L ${cx} ${cy}`;
        const bad = k.c.out !== "hit" && k.c.out !== "any";
        return { id: k.id, w: 1, color: tone ?? (bad ? LINE.bad : LINE.fwd), kind: bad ? "bad" : "fwd", d: mk([]), bad, mk, h: { x0: Math.min(px, cx) + r, x1: Math.max(px, cx) - r, y: cardY } };
      }
      const side = under(k), cx = side ? k.q.x - STACK_SIDE : midOf(k.id), cy = k.q.y - (k.c.out === "pass" ? PASS_R : 0), dx = cx - px, r = Math.min(10, Math.abs(dx) / 2), s = Math.sign(dx);
      const ey = k.q.y + STACK_IN;
      // hops = 横の棒が通り過ぎる別の札の縦の線の x (そこに半円の橋を掛ける、下の hopped)
      const mk = (hops: readonly number[]): string => !s ? `M ${px} ${busY - 10} L ${cx} ${cy}`
        : `M ${px} ${busY - 10} L ${px} ${busY - r} Q ${px} ${busY} ${px + s * r} ${busY} `
          + [...hops].sort((a, z) => s * (a - z)).map((x) => `L ${x - s * HOP} ${busY} A ${HOP} ${HOP} 0 0 ${s > 0 ? 1 : 0} ${x + s * HOP} ${busY} `).join("")
          + `L ${cx - s * r} ${busY} Q ${cx} ${busY} ${cx} ${busY + r} ` + (side ? `L ${cx} ${ey - 8} Q ${cx} ${ey} ${cx + 8} ${ey} L ${k.q.x} ${ey}` : `L ${cx} ${cy}`);
      const bad = k.c.out !== "hit" && k.c.out !== "any" && k.c.out !== "pass" && k.c.out !== "branch";
      return { id: k.id, w: 2, color: tone ?? (bad ? LINE.bad : LINE.fwd), kind: bad ? "bad" : "fwd", d: mk([]), bad, mk, h: s ? { x0: Math.min(px + s * r, cx - s * r), x1: Math.max(px + s * r, cx - s * r), y: busY } : null };
    }).sort((a, z) => Number(z.bad) - Number(a.bad));
    // 戻りの線が跨ぐ所を探す用の真っ直ぐな所 (縦の幹・横の棒・子へ下りる縦)
    const segs: Seg[] = [{ x0: px, y0: py, x1: px, y1: onlyCards ? jy + CHIP_HALF : busY }, ...kids.flatMap((k) => { if (ends.value.has(k.id)) { const cx = midOf(k.id); return [{ x0: px, y0: jy + CHIP_HALF, x1: px, y1: cardY }, { x0: px, y0: cardY, x1: cx, y1: cardY }, { x0: cx, y0: cardY, x1: cx, y1: k.q.y }]; } const cx = under(k) ? k.q.x - STACK_SIDE : midOf(k.id), y1 = under(k) ? k.q.y + STACK_IN : k.q.y; return [{ x0: px, y0: busY, x1: cx, y1: busY }, { x0: cx, y0: busY, x1: cx, y1 }]; })];
    return { id: b.id, hand: b.hand, split: b.split?.length, band: !!bf, chip: lead === b.id, lane, stemColor: tone ?? LINE.fwd, jx: px, jy, stem: bf?.turn != null ? `M ${bf.x} ${py} L ${bf.x} ${bf.turn} L ${px} ${bf.turn} L ${px} ${busY - 10}` : `M ${px} ${py} L ${px} ${onlyCards ? jy : busY - 10}`, to, segs };
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
  const hopped = computed(() => {
    const list = edges.value, keyOf = (e: { jx: number; jy: number }): string => `${Math.round(e.jx)},${Math.round(e.jy)}`;
    const vert = list.flatMap((e) => e.segs.filter((g) => g.x0 === g.x1 && g.y0 !== g.y1).map((g) => ({ k: keyOf(e), x: g.x0, y0: Math.min(g.y0, g.y1), y1: Math.max(g.y0, g.y1) })));
    return list.map((e) => {
      const k = keyOf(e);
      const to = e.to.map((o) => {
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
