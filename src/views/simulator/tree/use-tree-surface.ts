/**
 * use-tree-surface.ts — 木の描き面 1 枚分の作り (S-09c、11-14)。前は SimTreePage に 1 つきりで、タブを替えるたびに同じ面へ別の木を描き直した
 * (オーナー 11-14「タブ化するってのは木を残しておくって意味」)。
 * スイッチ tabKeep の外: 面は 1 枚、木・開いた回数・畳み・並べの控えはページに 1 つの物 (前と同じ)。
 * スイッチ tabKeep の中: 一度開いたタブごとに面を 1 枚 (SimTreePage が v-show で並べる)。面ごとに作り直すのは
 * 視点 (Vue Flow の名前)・畳み (stripOpen の差し替え)・並べの控え (kept)・段ごとの出し (開いた回数) の 4 つ。隠れた面は中の部品ごと止め (pauseTree)、最後の木のまま残す
 */
import { computed, effectScope, getCurrentInstance, onBeforeUnmount, ref, shallowRef, triggerRef, watch, type Ref } from "vue";
import type { NodeMouseEvent } from "@vue-flow/core";
import { craftStage as s } from "../../../state/craft-stage";
import type { TreeBox as Box, TreeDoc } from "../../../services/simulator/tree/tree-model";
import { mergedAway } from "../../../services/simulator/tree/tree-merge-open";
import { bandAway } from "../../../services/simulator/tree/tree-band";
import { laneMarks, laneYs, rowLayout } from "../../../services/simulator/tree/tree-row-tops";
import { placeTree } from "../../../services/simulator/tree/tree-place";
import type { KeptOrder } from "../../../services/simulator/tree/tree-place-order";
import { useStripOpen } from "../../../services/simulator/tree/tree-strip-fold";
import { setSigShown } from "../../../services/simulator/tree/tree-frame";
import { FLOW_ID, useTreeFlow } from "./use-tree-flow";
import { useStripFold } from "./use-strip-fold";
import { useTreeReveal } from "./use-tree-reveal";
import { boxHeightOf, placeKept, useRowSettle } from "./use-row-settle";
import { useTreeEdges } from "./use-tree-edges";
import { useTreeMerge } from "./use-tree-merge";
import { useTreePlus } from "./use-tree-plus";
import { useTreeBands } from "./use-tree-bands";
import { backLabelOf } from "./tree-fail";
import { pauseTree, provideSurfaceDoc } from "./tree-surface";
import type { useTree } from "./use-tree";
import type { useJunkTidy } from "./use-junk-tidy";
import type { useTreeRun } from "./use-tree-run";

/** 右の欄 (箱を選んだ時だけ)。add = 横の ＋ で開いた選ぶ窓 */
export type Panel = { kind: "hand" | "aim" | "start" | "note" | "base" | "split"; id: string; add?: { at?: { x: number; y: number } } };
type Drag = { id: string; x: number; y: number };
/** 置き場 (SimTreePage) が全部の面へ同じ物を渡す (面ごとに替わらない。手はどれも今のタブの木へ) */
export type PageCtx = {
  keep: boolean; liveKey: Readonly<Ref<number>>; t: ReturnType<typeof useTree>;
  hand: Ref<boolean>; panel: Ref<Panel | null>; drag: Ref<Drag | null>;
  jt: ReturnType<typeof useJunkTidy>; tr100: ReturnType<typeof useTreeRun>;
  glowOf: (b: Box) => boolean; issueOf: (b: Box) => string | null; issueBoxes: () => readonly string[]; stuckAt: () => Readonly<Record<string, number>> | null;
  startDrag: (b: Box, e: PointerEvent) => void; onAim: (b: Box) => void; removeHandOf: (id: string) => void; clearBack: (d: TreeDoc, id: string) => void;
  onDone: (b: Box) => void; onFail: (b: Box) => void; openIssues: () => void; goBack: (b: Box) => void; startLink: (b: Box) => void;
  goIssue: (id: string) => Promise<void>; onPaneClick: () => void; onNodeClick: (e: NodeMouseEvent) => void;
  onAddHit: (b: Box, at?: { x: number; y: number }, link?: string) => void;
  /** 面ができた / 消えた (置き場は出ている面の物を使う。型は Surface) */
  register: (key: number, api: object | null) => void;
};

export function useTreeSurface(key: number, p: PageCtx, root: Ref<HTMLElement | null>) {
  const t = p.t;
  const live = (): boolean => !p.keep || p.liveKey.value === key;
  // 面の木・開いた回数・並べの控え・畳みの印。スイッチの外はページに 1 つの物そのまま
  const doc = p.keep ? shallowRef(t.doc.value) : t.doc;
  const opened = p.keep ? ref(0) : t.opened;
  const kept: KeptOrder = p.keep ? new Map() : placeKept;
  const foldOpen = p.keep ? ref<ReadonlySet<string>>(new Set()) : null;
  if (p.keep) {
    const inst = getCurrentInstance()!;
    useStripOpen(foldOpen); // 面ができるのは出ている時
    // 面を止めても動く所: 出ている間は今のタブの木を写す (その場の書き換え triggerRef は両方へ)・開いた回数・止める / 動かす
    const ctl = effectScope(true);
    ctl.run(() => {
      let echo = false;
      const once = (f: () => void): void => { if (echo) return; echo = true; try { f(); } finally { echo = false; } };
      watch(t.doc, (d, old) => { if (live()) once(() => { if (d !== doc.value) doc.value = d; else if (d === old) triggerRef(doc); }); }, { flush: "sync" });
      watch(doc, (d) => { if (live() && d === t.doc.value) once(() => triggerRef(t.doc)); }, { flush: "sync" });
      watch(t.opened, () => { if (live()) opened.value++; }, { flush: "sync" });
      // 隠すのはタブを替えた瞬間 (木が替わる前)。出すのは替え終えた後 (今のタブの木がこの面の木に戻ってから)
      watch(live, (on) => { if (!on) pauseTree(inst, true); }, { flush: "sync" });
      watch(live, (on) => { if (on) { useStripOpen(foldOpen); setSigShown(doc.value); pauseTree(inst, false); } });
    });
    onBeforeUnmount(() => { ctl.stop(); if (live()) useStripOpen(null); }); // 出ている面が消えたら (ページを出た・タブを閉じた) ページに 1 つの印へ戻す
  }
  const flowId = p.keep ? `${FLOW_ID}-${key}` : FLOW_ID;
  const v = useTreeFlow(doc, flowId, () => root.value);
  onBeforeUnmount(v.dispose);
  const { zoom, viewOnly, pageZ } = v;
  /**
   * 縮めて組んでいる時 (75〜99%) の倍率の逆数: 押せる物だけ大きさを戻す。100% 以上でページの zoom が 1 未満 (1280 幅で 0.85) の時はその分も戻す
   * (箱の中の押せる物が 24px を切った、オーナー 10-22 OK。1920 以上は今のまま)。75% でまで戻すと 1.57 倍になり箱の中で重なった (zoom-steps 29 件) ので 75% は前のまま
   */
  const inv = computed(() => (viewOnly.value ? 1 : zoom.value < 1 ? 1 / zoom.value : Math.max(1, 1 / (zoom.value * pageZ.value))));
  // ドラッグ中は Vue Flow の箱だけが動き、離した時に 1 回だけ組み替える (置き場の startDrag)。線は引っ張っている位置に合わせる
  const posOf = (b: Box): { x: number; y: number } => (p.drag.value?.id === b.id ? { x: p.drag.value.x, y: p.drag.value.y } : { x: b.x, y: b.y });
  const boxes = computed(() => Object.values(doc.value.boxes));
  // 消去の続きを畳む (S-28g ③、use-strip-fold.ts): 隠した箱は描かず、根の最初の自動の消去の箱は札 (TreeStripFold)、止まった箱は札の下
  const sf = useStripFold(doc, opened, p.keep ? ref(key) : t.active, p.issueBoxes, p.stuckAt);
  /** 描く箱 (品質だけ上げた後の通り抜け pass は箱を描かず、打つ手の札の下に次の札か＋、tree-model の OutKind) */
  const shown = computed(() => boxes.value.filter((b) => b.out !== "pass" && !mergedAway(doc.value, b) && !bandAway(doc.value, b) && !sf.hidden.value.has(b.id)));
  const passes = computed(() => boxes.value.filter((b) => b.out === "pass"));
  /** 開いた時は箱を上の段から順に出す (データが来てから。use-tree-reveal.ts) */
  const rv = useTreeReveal(shown, () => !!s.data.value, opened, t.bigStepNow);
  /** 出ている箱どうしの線と札だけ描く (通り抜けは箱が無いので数えない) */
  const shownEdges = computed(() => edges.value.filter((e) => [e.id, ...e.to.map((o) => o.id)].every((id) => doc.value.boxes[id]?.out === "pass" || rv.isShown(bd.drawnId(id)))));
  const heightOf = (id: string): number => v.flow.findNode(id)?.dimensions.height ?? 0;
  const { edges, chipRoom } = useTreeEdges(doc, boxes, posOf, () => rowL.value, heightOf);
  const { merged, linesAll, hoverBox, cardBox } = useTreeMerge({ doc, posOf, heightOf, segs: () => edges.value.flatMap((e) => e.segs), moving: () => p.drag.value?.id ?? null, busy: () => !!p.drag.value || !!plus.value, reset: () => [v.flow.viewport.value, p.panel.value, p.drag.value], lanes: () => (rowL.value ? laneYs(rowL.value) : []), chips: () => edges.value.filter((e) => e.hand && e.chip).map((e) => ({ x: e.jx, y: e.jy, w: chipRoom.value.get(e.id) ?? 340 })) });
  // 札の幅は名前を切らない幅 (… で切れている分を足す) × 今の倍率で拡げる分 (全体表示で並んでも重ならない)。探すのはこの面の中だけ (隠れた面にも同じ id の札がある)
  const chipNatural = (id: string): number | undefined => {
    const el = (root.value ?? document).querySelector<HTMLElement>(`[data-hand-of="${id}"]`);
    if (!el) return undefined;
    const name = el.querySelector<HTMLElement>(".truncate");
    return (el.offsetWidth + (name ? name.scrollWidth - name.clientWidth : 0)) * Math.max(1, inv.value);
  };
  // 行の高さは箱の本当の高さで詰める (描く前は見込み、描いた後に use-row-settle が直す)
  const measureBox = (id: string): number | undefined => v.flow.findNode(id)?.dimensions.height || undefined;
  const tidyOf = (d: TreeDoc): void => void placeTree(d, boxHeightOf(measureBox), chipNatural, kept);
  useRowSettle(doc, measureBox, chipNatural, { opened, loading: t.loading }, kept);
  /** 乗せた箱につながる木の線 (parent = その箱の手から子へ、child = 親の手からその箱へ、S-85b) */
  const edgeHot = (e: { id: string; to: Array<{ id: string }> }): "parent" | "child" | null => (!hoverBox.value ? null : e.id === hoverBox.value ? "parent" : e.to.some((o) => o.id === hoverBox.value) ? "child" : null);
  const rowL = computed(() => rowLayout(doc.value, boxHeightOf(measureBox)));
  // 段の札は 11-11 から木の面の中に重ねる (枠の幅が変わらない) ので、帯の幅の変わりを木の送りで打ち消す laneShift は呼ばない
  const lanes = computed(() => laneMarks(doc.value, rowL.value));
  // ＋を引っ張ってつなぐ (use-tree-plus.ts)
  const { plus, onPlus, plusLine } = useTreePlus({ doc, posOf, viewOnly, toWorld: v.toWorld, edit: t.edit, onAddHit: p.onAddHit, startLink: p.startLink });
  const bd = useTreeBands({ doc, selectedId: () => p.panel.value?.id ?? plus.value?.id ?? null, issueOf: p.issueOf, openHand: (id) => (p.panel.value = { kind: "hand", id }), onPlus: (b, e) => onPlus(b, "next", e), edit: t.edit }); // 削減の手前の枠の帯 (S-65c ⑫)
  /** Vue Flow に渡す箱 (位置は木の形のまま。動かせるのは組める時だけ = 手・一望・戻り先を選んでいる間は画面だけ動く) */
  const flowNodes = computed(() => [...rv.visible.value.map((b) => ({ id: b.id, type: "box", position: posOf(b), draggable: false, selectable: false, connectable: false }))]);
  // Vue Flow へは setNodes で直接入れる (:nodes で渡すと、Vue Flow が中の並びを書き戻している一瞬の変化を拾わず、
  // 見本を開いた時に始まりの箱しか出なかった。10-23 開発版で見た)
  watch(flowNodes, (n) => v.flow.setNodes(n), { immediate: true });
  /** ドットの格子 (Vue Flow の送りと倍率に合わせて動く) */
  const grid = computed(() => {
    const { x, y, zoom: z } = v.flow.viewport.value;
    return { backgroundImage: "radial-gradient(rgba(214,180,120,0.16) 1.2px, transparent 1.7px)", backgroundSize: `${22 * z}px ${22 * z}px`, backgroundPosition: `${x}px ${y}px` };
  });
  const backLabel = (b: Box): string => backLabelOf(doc.value, b);
  provideSurfaceDoc({ doc, opened });
  /** 置き場が出ている面へ届ける物 (寄る・整列・畳み・帯・＋・乗せた箱) */
  const api = { key, doc, kept, v, sf, rv, bd, plus, hoverBox, cardBox, linesAll, measureBox, chipNatural, tidyOf };
  p.register(key, api);
  onBeforeUnmount(() => p.register(key, null));
  return { ...api, flowId, pageZ, zoom, viewOnly, inv, grid, lanes, posOf, shown, passes, shownEdges, edgeHot, chipRoom, merged, plusLine, onPlus, backLabel };
}
export type Surface = ReturnType<typeof useTreeSurface>;
