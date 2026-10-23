/**
 * use-tree-plus.ts — 箱の＋を引っ張ってつなぐ (SimTreePage から分けた、2026-10-24。500 行の決まり)。
 * ＋: 押すだけ = 足す (今まで通り)。長押し (か大きく動かす) で引っ張る → 箱の上で離す = その箱へつなぐ (重なった箱が光る) / 何も無い所 = やめる
 */
import { computed, ref, type Ref } from "vue";
import { BOX_H, BOX_W, setBack, type TreeBox as Box, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { gesture, HOLD_MS } from "./use-gesture";
import { useTreeLink } from "./use-tree-link";

export function useTreePlus(o: {
  doc: Ref<TreeDoc>;
  posOf: (b: Box) => { x: number; y: number };
  viewOnly: Ref<boolean>;
  toWorld: (cx: number, cy: number) => { x: number; y: number };
  edit: (fn: (d: TreeDoc) => void) => void;
  /** 横の＋ = 当たりの箱を足す (link = その箱へつなぐ) */
  onAddHit: (b: Box, at?: { x: number; y: number }, link?: string) => void;
  /** 下の＋を押した = 打つ手の窓 */
  startLink: (b: Box) => void;
}) {
  /** 引っ張っている＋ (cx・cy はマウスの実ピクセル。ツリーの座標へは toWorld) */
  const plus = ref<{ id: string; kind: "side" | "next"; cx: number; cy: number; target: string | null } | null>(null);
  /** 下の＋を引っ張って戻り先にする時も、押して選ぶ時と同じくつなげない箱 (灰色) には付けない (10-22 13 通り組んだ #15) */
  const plusLink = useTreeLink(o.doc, computed(() => (plus.value?.kind === "next" ? plus.value.id : null)));
  function plusAt(cx: number, cy: number): void {
    const p = plus.value;
    if (!p) return;
    p.cx = cx; p.cy = cy;
    const id = (document.elementFromPoint(cx, cy) as HTMLElement | null)?.closest<HTMLElement>("[data-tree-box]")?.dataset.boxId ?? null;
    p.target = id && id !== p.id && !(p.kind === "next" && plusLink.value.get(id)) ? id : null;
  }
  function onPlus(b: Box, kind: "side" | "next", e: PointerEvent): void {
    if (o.viewOnly.value) return;
    gesture(e, {
      holdMs: HOLD_MS,
      onStart: (q) => { plus.value = { id: b.id, kind, cx: q.clientX, cy: q.clientY, target: null }; plusAt(q.clientX, q.clientY); },
      onMove: (q) => plusAt(q.clientX, q.clientY),
      // 引っ張って離した (オーナー 10-22): 箱の上 = その箱へつなぐ (打つ手の窓は出さない)、何も無い所 = やめる (元のまま)
      onEnd: () => {
        const p = plus.value;
        plus.value = null;
        if (!p?.target) return;
        if (kind === "side") o.onAddHit(b, undefined, p.target);
        else o.edit((d) => setBack(d, b.id, p.target!));
      },
      onTap: () => { if (kind === "side") o.onAddHit(b); else o.startLink(b); },
      onCancel: () => { plus.value = null; },
    });
  }
  /** 引っ張っている＋の線 (＋の所 → マウス、ツリーの座標)。直線ではなく柔らかい曲線 (オーナー「直線すぎてキモい」) */
  const plusLine = computed(() => {
    const p = plus.value, b = p ? o.doc.value.boxes[p.id] : null;
    if (!p || !b) return null;
    const q = o.posOf(b), end = o.toWorld(p.cx, p.cy);
    const x1 = p.kind === "side" ? q.x + BOX_W + 2 : q.x + BOX_W / 2, y1 = p.kind === "side" ? q.y + BOX_H / 2 : q.y + BOX_H + 20;
    const ex = end.x, ey = end.y;
    const k = Math.max(40, Math.hypot(ex - x1, ey - y1) / 2.5);
    const c1 = p.kind === "side" ? `${x1 + k} ${y1}` : `${x1} ${y1 + k}`;
    return `M ${x1} ${y1} C ${c1} ${ex} ${ey + (ey < y1 ? k : -k)} ${ex} ${ey}`;
  });
  return { plus, onPlus, plusLine };
}
