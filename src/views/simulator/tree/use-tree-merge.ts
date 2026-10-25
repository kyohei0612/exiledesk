/**
 * use-tree-merge.ts — SimTreePage の戻りの見え方の動き (2026-10-22、SimTreePage が 500 行を超えるので分けた): 戻りの矢印だけの箱から行き先へ流れ込む線
 * (tree-merge.ts の mergeReqs → tree-lines の routeBacks、同じ行き先は束ねる)・&lines=a の「線を全部表示」・乗せている箱とホバーのカード
 */
import { computed, ref, watch, type Ref } from "vue";
import { BOX_H, BOX_W, type TreeBox, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { mirrorPath, mirrorPos, mirrorSeg, routeBacks, type Seg } from "./tree-lines";
import { mergeReqs } from "./tree-merge";

export function useTreeMerge(o: {
  doc: Ref<TreeDoc>; posOf: (b: TreeBox) => { x: number; y: number }; segs: () => Seg[];
  /** カードを出さない・消す時 (引っ張っている・画面が動いた・欄を開いた) */ busy: () => boolean; reset: () => unknown;
}) {
  const merged = computed(() => {
    const d = o.doc.value;
    const pos = (id: string) => ({ ...o.posOf(d.boxes[id]!), w: BOX_W, h: BOX_H });
    const { reqs, lines } = mergeReqs(d, pos);
    // 行き先の箱の左の辺へ入る線はそのまま、右の辺へ入る線 (flip) は左右を裏返して同じ道の探し方で引き、描く時に戻す
    const bx = Object.keys(d.boxes).map(pos), sg = o.segs();
    const flip = reqs.filter((r) => r.flip);
    const back = routeBacks(flip.map((r) => ({ ...r, from: mirrorPos(r.from), to: mirrorPos(r.to), end: { x: -r.end.x, y: r.end.y }, start: r.start && { x: -r.start.x, y: r.start.y } })), bx.map(mirrorPos), sg.map(mirrorSeg), { bundle: true });
    const paths = routeBacks(reqs.filter((r) => !r.flip), bx, sg, { bundle: true });
    for (const [id, p] of back) paths.set(id, mirrorPath(p));
    return { lines, paths };
  });
  /** 帯の「線を全部表示」(このブラウザに覚える) */
  const KEY = "exiledesk.tree.lines-all";
  const linesAll = ref((() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } })());
  watch(linesAll, (on) => { try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* 覚えられなくても使える */ } });
  /** 乗せている箱 (線を濃く) と、少し待ってから出すホバーのカード (全部の箱・戻り先を選んでいる時の候補の箱も。オーナー 10-22「全てカードが出るように」) */
  const hoverBox = ref<string | null>(null);
  const cardBox = ref<string | null>(null);
  let t = 0;
  watch(hoverBox, (id) => { clearTimeout(t); cardBox.value = null; if (id) t = window.setTimeout(() => { if (hoverBox.value === id && !o.busy()) cardBox.value = id; }, 350); });
  watch(o.reset, () => { cardBox.value = null; });
  return { merged, linesAll, hoverBox, cardBox };
}
