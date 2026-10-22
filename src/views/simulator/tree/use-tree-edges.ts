/**
 * use-tree-edges.ts — ツリーの進む線と打つ手の札の置き場 (SimTreePage から分けた、2026-10-22。500 行の決まり)。
 * 手のある箱と分かれ目の箱から、下の結果の箱 (分かれ目は行の箱) へ線を引く
 */
import { computed, type ComputedRef, type Ref } from "vue";
import { BOX_H, BOX_W, type TreeBox, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { busLevels, HAND_DY, type Seg } from "./tree-lines";

/**
 * 進む線 (2026-10-22 整列の定義、オーナー「クソ汚い」の後): 普通の木の図と同じ直角の線。親の下から 1 本下りて (途中に手の札)、
 * 子の段の上で横の棒、そこから子の上の辺へ下ろす。色は 進む = 灰 / 外れ・消えた = 赤系 の 2 つだけ
 */
export const LINE = { fwd: "#a39a88", bad: "#c96a72", back: "#5fd0e0" } as const;
/** 通り抜けの所の札 / ＋の半分の高さ (上から来る矢印の先) */
export const PASS_R = 16;

export function useTreeEdges(doc: Ref<TreeDoc>, boxes: ComputedRef<TreeBox[]>, posOf: (b: TreeBox) => { x: number; y: number }) {
  /** 箱の真ん中 */
  const midOf = (id: string): number => posOf(doc.value.boxes[id]!).x + BOX_W / 2;
  /** 横の棒が同じ高さで横に重なる親どうしは段をずらす (tree-lines.ts の busLevels) */
  const busShift = computed(() => busLevels(boxes.value.filter((b) => (b.hand || b.split) && b.outs.length).map((b) => {
    const xs = [posOf(b).x + BOX_W / 2, ...b.outs.map(midOf)];
    return { id: b.id, x0: Math.min(...xs), x1: Math.max(...xs), y: Math.min(...b.outs.map((o) => posOf(doc.value.boxes[o]!).y)) - 18 };
  })));
  // 分かれ目 (手の無い箱) も、札を「分かれ目」にして同じ線で下の行の箱へ
  const edges = computed(() => boxes.value.filter((b) => (b.hand || b.split) && b.outs.length).map((b) => {
    const p = posOf(b), pass = b.out === "pass";
    // 通り抜けは箱が無いので、手の札を箱の上の端の所に置き、そこから下りる
    const px = p.x + BOX_W / 2, py = pass ? p.y : p.y + BOX_H, jy = pass ? p.y : py + HAND_DY;
    const kids = b.outs.map((o) => ({ id: o, c: doc.value.boxes[o]!, q: posOf(doc.value.boxes[o]!) }));
    const busY = Math.min(...kids.map((k) => k.q.y)) - 18 - (busShift.value.get(b.id) ?? 0);
    // 角丸の段付き (React Flow の smoothstep、見本の 3): 親の下から下りて、角を丸めて横へ、角を丸めて子の上の辺へ。
    // 外れ (赤) を先に描き、進む (灰) を上に重ねる (同じ横の棒を通る所は灰に見える)
    const to = kids.map((k) => {
      const cx = midOf(k.id), cy = k.q.y - (k.c.out === "pass" ? PASS_R : 3), dx = cx - px, r = Math.min(10, Math.abs(dx) / 2), s = Math.sign(dx);
      const d = !s ? `M ${px} ${busY - 10} L ${cx} ${cy}`
        : `M ${px} ${busY - 10} L ${px} ${busY - r} Q ${px} ${busY} ${px + s * r} ${busY} L ${cx - s * r} ${busY} Q ${cx} ${busY} ${cx} ${busY + r} L ${cx} ${cy}`;
      const bad = k.c.out !== "hit" && k.c.out !== "any" && k.c.out !== "pass" && k.c.out !== "branch";
      return { id: k.id, color: bad ? LINE.bad : LINE.fwd, kind: bad ? "bad" : "fwd", d, bad };
    }).sort((a, z) => Number(z.bad) - Number(a.bad));
    // 戻りの線が跨ぐ所を探す用の真っ直ぐな所 (縦の幹・横の棒・子へ下りる縦)
    const segs: Seg[] = [{ x0: px, y0: py, x1: px, y1: busY }, ...kids.flatMap((k) => { const cx = midOf(k.id); return [{ x0: px, y0: busY, x1: cx, y1: busY }, { x0: cx, y0: busY, x1: cx, y1: k.q.y }]; })];
    return { id: b.id, hand: b.hand, split: b.split?.length, jx: px, jy, stem: `M ${px} ${py} L ${px} ${busY - 10}`, to, segs };
  }));
  return { edges };
}
