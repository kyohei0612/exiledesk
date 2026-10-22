<!--
  SimTreePage.vue — クラフトの道 (ツリー) のページ (?page=sim-tree、2026-10-22 オーナー OK「UI の表面だけ」、開発版だけ・PC だけ)。
  入口 (web-page.ts の treePage・web/page.ts・WebApp.vue) はジン部長、中身はシミュ部長。設計は docs/org/simulator/notes/2026-10-22-manual-sim-design.md の 11。
  一番上が 0 完成形の設定の箱 (TreeGoalNode、木の形の外)、その下がスタートの箱。箱を押すと重ね窓 (TreeOverlays)。下の＋で打つ手 (クラフト台の棚から) → 矢印の先に結果の箱。横の＋で当たりを足す、↩ で既にある箱へ戻す。
  ＋は長押しで引っ張り、箱の上で離すとその箱へつなぐ (何も無い所ならやめる)。箱はドラッグで動かす、1 つ戻す / Ctrl+Z。
  線は普通の木の図の直角の線。戻りの矢印だけの箱も普通の箱 (10-22 オーナーの選び)、戻りの線は乗せた箱の分だけ (帯の「線を全部表示」で全部、10-22 オーナーの案 A)。
  箱に乗せるとその時点のアイテムのカード。試し打ちの欄は 10-22 に消した (オーナー「試し打ちマジ意味わからんから消して」)。
  土台は Vue Flow (10-22 オーナー): 画面の送り・拡大縮小・箱のドラッグ・押した判定は Vue Flow、見え方の決まりは use-tree-flow.ts。
  線・打つ手の札・引っ張る線・合流の線は Vue Flow の zoom-pane (倍率と移動が掛かる層) に描く。100 人回す計算はまだ繋がない
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { VueFlow, type NodeMouseEvent } from "@vue-flow/core";
import "@vue-flow/core/dist/style.css";
import Icon from "../../../components/ui/Icon.vue";
import TreeMemoFloat from "./TreeMemoFloat.vue";
import TreeCanvasTools from "./TreeCanvasTools.vue";
import TreeBox from "./TreeBox.vue";
import TreeOverlays from "./TreeOverlays.vue"; import TreeGoalNode from "./TreeGoalNode.vue";
import TreeHandPage from "./TreeHandPage.vue";
import { useTree } from "./use-tree";
import { FLOW_ID, useTreeFlow } from "./use-tree-flow";
import { craftStage as s } from "../../../state/craft-stage";
import { addHit, aimKey, BOX_H, BOX_W, canRemove, clearHand, moveBox, removeHit, setAim, setBack, setDone, setHand, setSplit, tidy, handUses, type Aim, type Hand, type HandKind, type OutKind, type TreeBox as Box } from "../../../services/simulator/tree/tree-model";
import { handLabel, outName } from "./tree-names";
import { aimsOf, sampleOf } from "../../../services/simulator/tree/tree-sample";
import { aimHeldOn } from "../../../services/simulator/tree/tree-play";
import { treeSample } from "../../../services/simulator/tree/tree-samples";
import { linkSameShape, MATCH, RESTART } from "../../../services/simulator/tree/tree-run";
import { treePage } from "../../../state/web-page";
import { tr } from "../../../i18n/lang";
import { pageZoom } from "../../../utils/zoom";
import { LINE, useTreeEdges } from "./use-tree-edges";
import TreeRecipeBar from "./TreeRecipeBar.vue";
import { setCurrentTreeRecipe } from "../../../state/simulator/tree-recipes";
import { gesture, HOLD_MS } from "./use-gesture";
import { useDismiss } from "../../../utils/use-dismiss";
import { ARMED_CLASS, useArmed } from "../../../utils/use-armed";
import { useTreeLink } from "./use-tree-link";
import { useTreeCheck } from "./use-tree-check";
import TreeIssues from "./TreeIssues.vue";
import { GOAL_ID, goalPos } from "./tree-goal";
import TreePanelPage from "./TreePanelPage.vue";
import BusyTag from "../../../components/ui/BusyTag.vue";
import { useTreeTune } from "./use-tree-tune";
import { useTreeReveal } from "./use-tree-reveal";
import { RUN_N, useTreeRun } from "./use-tree-run";
import TreeRunBar from "./TreeRunBar.vue";
import TreeRunLayer from "./TreeRunLayer.vue";
import TreeHandChip from "./TreeHandChip.vue"; import TreeBandLayer from "./TreeBandLayer.vue"; import TreeTabs from "./TreeTabs.vue";
import TreeMergeLayer from "./TreeMergeLayer.vue";
import TreeHoverCard from "./TreeHoverCard.vue";
import { backTargetsOf, joinSameShape } from "./tree-merge";
import { useTreeMerge } from "./use-tree-merge";

const t = useTree();
const doc = t.doc;
// エンジンの設定 (触媒・聖別の倍率・MOD の重み) は開いている間この木の値 (use-tree-tune.ts)
useTreeTune(doc, t.edit);

/** 右の欄 (箱を選んだ時だけ) */
const panel = ref<{ kind: "hand" | "aim" | "start" | "note" | "base" | "split"; id: string } | null>(null);
/** 戻りの矢印の先を選んでいる箱 */
const picking = ref<string | null>(null);
/** メモの窓を開いているか (このブラウザに覚える。無くても使える) */
const MEMO_KEY = "exiledesk.tree.memo-open";
const memoOpen = ref((() => { try { return localStorage.getItem(MEMO_KEY) === "1"; } catch { return false; } })());
watch(memoOpen, (v) => { try { localStorage.setItem(MEMO_KEY, v ? "1" : "0"); } catch { /* 覚えられなくても使える */ } });
/** メモの窓の札で選んだ札 (その札を使っている箱が光る) */
const glowAim = ref<string | null>(null);
const v = useTreeFlow(doc);
const { zoom, full, viewOnly, pageZ } = v;
/**
 * 縮めて組んでいる時 (75〜99%) の倍率の逆数: 押せる物だけ大きさを戻す。100% 以上でページの zoom が 1 未満 (1280 幅で 0.85) の時はその分も戻す
 * (箱の中の押せる物が 24px を切った、オーナー 10-22 OK。1920 以上は今のまま)。75% でまで戻すと 1.57 倍になり箱の中で重なった (zoom-steps 29 件) ので 75% は前のまま
 */
const inv = computed(() => (viewOnly.value ? 1 : zoom.value < 1 ? 1 / zoom.value : Math.max(1, 1 / (zoom.value * pageZ.value))));
onBeforeUnmount(v.dispose);

// ドラッグ中は Vue Flow の箱だけが動き、離した時に 1 回だけ組み替える (1 つ戻すが 1 手で済む)。線は引っ張っている位置に合わせる
const drag = ref<{ id: string; x: number; y: number } | null>(null);
const posOf = (b: Box): { x: number; y: number } => (drag.value?.id === b.id ? { x: drag.value.x, y: drag.value.y } : { x: b.x, y: b.y });
const boxes = computed(() => Object.values(doc.value.boxes));
/** 描く箱 (品質だけ上げた後の通り抜け pass は箱を描かず、打つ手の札の下に次の札か＋、tree-model の OutKind) */
const shown = computed(() => boxes.value.filter((b) => b.out !== "pass"));
const passes = computed(() => boxes.value.filter((b) => b.out === "pass"));
/** 開いた時は箱を上の段から順に出す (データが来てから。use-tree-reveal.ts) */
const rv = useTreeReveal(shown, () => !!s.data.value, t.opened);
/** 出ている箱どうしの線と札だけ描く (通り抜けは箱が無いので数えない) */
const shownEdges = computed(() => edges.value.filter((e) => [e.id, ...e.to.map((o) => o.id)].every((id) => doc.value.boxes[id]?.out === "pass" || rv.isShown(id))));

/**
 * 画面の高さ (拡大前の CSS ピクセル)。html の zoom (WebApp.vue の fitZoom) が 1 より大きいと 100vh が画面より高くなり、
 * 1920 幅でツリーの枠がはみ出してページごと下へ送られた (10-22 開発版で見た)。WebApp.vue の後で読む
 */
const row = ref<HTMLElement | null>(null);
/** ツリーの段の高さ = 画面の下まで (段の上の位置を測って引く。決め打ちの 230px では 1920 幅で 24px はみ出した、10-22 開発版で測った) */
const rowH = ref(480);
/** 段の下にある物 (.g-panel の下の余白 8 + 枠 18 + ページの下の余白 16) と少しの余り */
const ROW_BOTTOM = 46;
function measureRow(): void {
  const el = row.value;
  if (!el) return;
  const z = pageZoom();
  rowH.value = Math.max(200, Math.floor(innerHeight / z - (el.getBoundingClientRect().top + window.scrollY) / z - ROW_BOTTOM));
}
const onResizeH = (): void => { requestAnimationFrame(measureRow); };
onMounted(() => { window.addEventListener("resize", onResizeH); onResizeH(); });
onBeforeUnmount(() => window.removeEventListener("resize", onResizeH));
/** 手 (見るだけ): どこを引いても画面が動き、箱は押せない (ComfyUI の手、見本の 6) */
const hand = ref(false);
const { edges } = useTreeEdges(doc, boxes, posOf);
/** 打つ手の札の幅 (画面で測る。戻りの線を札の左の端へ入れる、tree-lines.ts の handAnchor) */
const chipW = ref<Record<string, number>>({});
function measureChips(): void {
  const w: Record<string, number> = {};
  for (const el of document.querySelectorAll<HTMLElement>("[data-tree-hand], [data-tree-split-chip]")) if (el.dataset.handOf) w[el.dataset.handOf] = el.offsetWidth;
  if (JSON.stringify(w) !== JSON.stringify(chipW.value)) chipW.value = w;
}
watch(() => edges.value.map((e) => `${e.id}:${e.hand ? handLabel(e.hand) : `split${e.split}`}`).join("|"), measureChips, { flush: "post" });
onMounted(() => { measureChips(); void document.fonts?.ready.then(measureChips); });
const { merged, linesAll, hoverBox, cardBox } = useTreeMerge({ doc, posOf, segs: () => edges.value.flatMap((e) => e.segs), chipW, inv, busy: () => !!drag.value || !!plus.value, reset: () => [v.flow.viewport.value, panel.value, drag.value] });
/** 白紙に戻す = 2 回押し (本番の「白に戻す」と同じ use-armed、3 秒で戻る)。枠の外・Esc でも戻す (オーナー 10-22「白紙に戻すもあれやな、2 回だな」) */
const clearArm = useArmed();
const clearBtn = ref<HTMLElement | null>(null);
useDismiss(() => clearArm.is(), [clearBtn], clearArm.clear);
function onClear(): void { if (clearArm.arm()) { t.reset(); setCurrentTreeRecipe(null); } }
/** 戻り先へ寄る (編集のポップアップの札を押した時) */
function goBack(b: Box): void { const to = backTargetsOf(doc.value, b.id)[0]; if (to) void v.reveal(to, true); }

/** 戻り先の箱の名前 (始めに戻る・当たりは付く MOD・ほかは結果の名前) */
function boxLabel(id: string): string {
  const to = doc.value.boxes[id];
  if (!to) return "";
  if (to.out === "start") return tr("始めに戻る", "Back to start");
  // 分かれ目の箱へ戻る札は分かれ目の札と同じ ◇ を添える (当たりの箱の名前だけでは分かれ目と分からなかった、10-22 オーナー OK)
  if (to.split) return `◇ ${to.out === "hit" && to.aim ? t.aimLabel(to.aim) : outName(to.out)}`;
  if (to.out === "hit" && to.aim) return t.aimLabel(to.aim);
  // 外れ・消えたの箱は、道で付いている狙いの MOD を添える (「↩ 外れ」だけではどの外れか分からなかった、10-22 靴・手袋を白紙から組んで)
  const held: string[] = [];
  for (let x: Box | undefined = to; x; x = x.parent ? doc.value.boxes[x.parent] : undefined) if (x.out === "hit" && x.aim) held.unshift(t.aimShort(x.aim));
  return held.length ? tr(`${outName(to.out)} (${[...new Set(held)].join("・")})`, `${outName(to.out)} (${[...new Set(held)].join(", ")})`) : tr(`${outName(to.out)} (狙い無し)`, `${outName(to.out)} (no target)`);
}
/**
 * 戻りの箱の下の行 = いつも行き先の箱の名前 (10-22 オーナー「続きからって選択肢選べんでしょ、そもそも白紙の状態からこうなるはず」)。
 * 前の版の「形の合う箱へ」(MATCH) も行きうる箱の名前で出す (複数なら「○○ ほか n か所」)
 */
function backLabel(b: Box): string {
  if (b.back === RESTART) return tr("作り直し", "Start over");
  const to = backTargetsOf(doc.value, b.id);
  if (!to.length) return b.back === MATCH ? tr("行き先の箱が無い", "No box to go to") : "";
  return to.length > 1 ? tr(`${boxLabel(to[0]!)} ほか ${to.length - 1} か所`, `${boxLabel(to[0]!)} +${to.length - 1} more`) : boxLabel(to[0]!);
}

// 組み替え
/**
 * 手を決める。pre = 前に足す品質だけ上げる手のカタリスト (触媒のお告げ、10-22 オーナーの案 A)。完成の箱に手を付けたら同じ形の完成の箱もここへ (joinSameShape)。
 * 新しくできた結果の箱は、同じ形の箱があればそこへ自動でつなぐ (linkSameShape。手の種類が同じで箱を作り直さない時は人が選んだ戻り先のまま)
 */
function pickHand(h: Hand, kind: HandKind, aims: Aim[], pre: string | null = null, only: { out: OutKind; aim: Aim | null } | null = null): void {
  const id = panel.value!.id;
  if (picking.value === id) picking.value = null;
  let at = id;
  t.edit((d) => {
    const had = new Set(Object.keys(d.boxes));
    if (pre) { setHand(d, id, { currency: pre, omens: [], catalyst: null, quality: 0 }, "quality"); at = d.boxes[id]!.outs[0]!; }
    setHand(d, at, h, kind, aims, only);
    joinSameShape(d, id);
    // 前に作ってまだ行き先も手も無い箱も、今手を付けた箱と同じ形ならつなぐ (先に作った当たりの箱は、同じ形の箱に手が付いた時につながる)
    linkSameShape(d, Object.values(d.boxes).filter((b) => !had.has(b.id) || (!b.hand && !b.back && !b.done)).map((b) => b.id));
  });
  panel.value = null;
  // 出来た結果の箱が枠の外なら寄る (真ん中の箱。10-22 白紙から組んで、出来た箱が下に出て自分で動かさないと見えなかった)
  const kids = doc.value.boxes[at]?.outs ?? [];
  if (kids.length) void v.reveal(kids[Math.floor(kids.length / 2)]!);
}
/** 打たずに分ける (分かれ目にして、行の欄を開く) */
function onSplit(): void { const id = panel.value!.id; if (picking.value === id) picking.value = null; t.edit((d) => setSplit(d, id)); panel.value = { kind: "split", id }; }
/**
 * Vue Flow の出来事: 空き所を押す = 右の欄を閉じる (よくあるモーダルと同じ。オーナー 10-22。引っ張った時は Vue Flow が画面を動かすだけ)。
 * 箱を押す = 戻り先を選んでいる時はそこへつなぐ / 縮めて見ている時は編集のポップアップ / ふつうは開いている欄を閉じるだけ
 * (試し打ちの欄は 10-22 に消した、オーナー「試し打ちマジ意味わからんから消して」。箱の時点のアイテムは乗せた時のカード)。
 * 箱を引っ張る = 動かす (startDrag。Vue Flow の引っ張りは使わない)
 */
function onPaneClick(): void { if (panel.value) closeHand(); }
/** 引っ張り終えた直後の click (押した所と離した所が同じ箱だと出る) は押した事にしない */
let dragEndedAt = 0;
function onNodeClick(e: NodeMouseEvent): void {
  if (e.node.id === GOAL_ID && !hand.value && !picking.value) { panel.value = null; t.goalPage.value = 1; return; } // 0 完成形の設定の重ね窓
  const b = doc.value.boxes[e.node.id];
  if (!b || hand.value || performance.now() - dragEndedAt < 300) return;
  if (picking.value) { if (picking.value !== b.id) onTarget(b); return; }
  // 縮めて見ている時は、その箱の編集を等倍のポップアップで (オーナー 10-22「75% 未満の見るだけをやめる」)
  if (viewOnly.value) { pop.value = b.id; return; }
  if (panel.value) closeHand();
}
/** 箱を引っ張る (use-gesture.ts: 遊び 5px を超えた後も押した所からの差をそのまま使う。差はツリーの倍率で割る) */
function startDrag(b: Box, e: PointerEvent): void {
  gesture(e, {
    onStart: () => { drag.value = { id: b.id, x: b.x, y: b.y }; },
    onMove: (p) => { if (drag.value) { drag.value.x = b.x + p.dx / zoom.value; drag.value.y = b.y + p.dy / zoom.value; } },
    onEnd: () => { const g = drag.value; drag.value = null; dragEndedAt = performance.now(); if (g) t.edit((d) => moveBox(d, g.id, g.x, g.y)); },
    onCancel: () => { drag.value = null; },
  });
}
function closeHand(): void { if (picking.value && picking.value === panel.value?.id) picking.value = null; panel.value = null; }
/** 下の＋を押した = 打つ手の棚を開き、同時にツリーの箱をつなげる / つなげないで色分けする (箱を押せばそこへつなぐ、棚で選べば新しい箱) */
function startLink(b: Box): void { panel.value = { kind: "hand", id: b.id }; } // 打つ手の重ね窓 (戻り先へは窓の「既にある箱へ戻す」か＋の引っ張り)
const link = useTreeLink(doc, picking);
/** 縮めて見ている時に押した箱の編集のポップアップ (等倍、箱でできる事が全部) */
const pop = ref<string | null>(null);
const popEl = ref<HTMLElement | null>(null);
useDismiss(() => !!pop.value, [popEl], () => { pop.value = null; });
watch(viewOnly, (on) => { if (!on) pop.value = null; });
/** ポップアップの置き場 (押した箱の真ん中に重ねる。枠はページの zoom を打ち消しているので、実ピクセル ÷ ページの zoom) */
const popStyle = computed(() => {
  const b = pop.value ? doc.value.boxes[pop.value] : null;
  if (!b) return {};
  const { x, y, zoom: z } = v.flow.viewport.value, Z = pageZ.value;
  // 枠の中に収める (ポップアップの大きさ = 箱 + 余白 12・右 28・下 48)
  const { width: W, height: H } = v.flow.dimensions.value;
  const left = Math.min(W / Z - BOX_W - 48, ((b.x + BOX_W / 2) * z + x) / Z - BOX_W / 2 - 12), top = Math.min(H / Z - BOX_H - 68, ((b.y + BOX_H / 2) * z + y) / Z - BOX_H / 2 - 12);
  return { left: `${Math.max(8, left)}px`, top: `${Math.max(8, top)}px` };
});
/** ポップアップの中で押した物は、閉じてからいつもの動きへ */
function popDo(f: (id: string, b: Box) => void): void { const id = pop.value, b = id ? doc.value.boxes[id] : null; pop.value = null; if (id && b) f(id, b); }
/**
 * 箱の重ね窓 (打つ手・分かれ目・MOD を選ぶ・メモ) は、窓の外を押す / Esc で何も変えずに閉じる (オーナー 10-22「枠の外・Esc で選ぶ前に戻す」、共通の useDismiss)。
 * 押した物には届ける。ツリーの枠の中は数えない (空き所は押した時だけ閉じ、引っ張って画面を動かしても閉じない = onPaneClick、箱・札は開き直す)。メモの窓・窓から出した小窓も中に数える
 */
useDismiss(() => !!panel.value, [], closeHand, { swallow: false, keep: "[data-tree-canvas], [data-tree-mode-pill], [data-tree-memo-float], [role=dialog], [data-helptip-pop], [data-mod-list], [data-mod-add-menu]" });
function clearHandOf(): void { const id = panel.value!.id; t.edit((d) => clearHand(d, id)); panel.value = null; }
function pickAim(a: Aim): void {
  const p = panel.value!;
  t.edit((d) => setAim(d, p.id, a));
  panel.value = null;
}
function onAim(b: Box): void { if (b.out === "start") t.startPage.value = true; else panel.value = { kind: "aim", id: b.id }; }
function onAddHit(b: Box, at?: { x: number; y: number }, link?: string): void {
  let made: string | null = null;
  t.edit((d) => {
    made = addHit(d, b.parent!, b.id);
    if (made && at) moveBox(d, made, at.x - BOX_W / 2, at.y);
    if (made && link) setBack(d, made, link);
  });
  // 引っ張って既にある箱へつないだ時は欄を出さない (つなぐだけ。オーナー 10-22「つなげた時も…表示される。意味が分からないので出さなくて OK」)
  if (made && !link) panel.value = { kind: "aim", id: made };
}
function onDone(b: Box): void { t.edit((d) => setDone(d, b.id, b.done ? null : "main")); }
/** 戻り先を選んでいる時の札のボタン: ↩ 始めに戻る (10-22 オーナー「選択肢として初めに戻るでいいのでは」。ほかは箱を押して選ぶ、「続きから」は 10-22 に消した) */
function pickBack(to: string): void { const from = picking.value; if (!from) return; picking.value = null; if (panel.value?.id === from) panel.value = null; t.edit((d) => setBack(d, from, to)); }
function onTarget(b: Box): void {
  const from = picking.value;
  // つなげない箱 (灰色、use-tree-link.ts) は押しても何もしない (理由は箱に乗せると出る)
  if (from && link.value.get(b.id)) return;
  picking.value = null;
  if (panel.value?.kind === "hand" && panel.value.id === from) panel.value = null;
  if (from && from !== b.id) t.edit((d) => setBack(d, from, b.id));
}
// ルート精査 (押した時に始める、use-tree-check.ts)
const { issues, issuesOpen, issuesFold, checking, progress, onCheck, issueOf } = useTreeCheck(doc);
/** 待たせている間の小さな札 (題の横。データの読み込み・箱を順に出している間、共通の BusyTag。精査の進みは精査の帯の上) */
// 100 人回す (結果は木の上に重ねる層だけ、use-tree-run.ts・TreeRunLayer.vue。値段 = 始め方のベースの値段 (結果のまとめで入れる、use-tree の startPrice) + 今の相場)
const tr100 = useTreeRun(doc, t.startPrice, t.treePrice, (id) => goIssue(id), (id, i) => void (i ? v.reveal(id) : v.fit(true)));
const busy = computed((): { text: string; n?: number; of?: number } | null => {
  if (!s.data.value) return { text: tr("読み込み中", "Loading") };
  if (tr100.running.value) return { text: tr("回している", "Running"), n: tr100.result.value?.n ?? 0, of: RUN_N };
  const r = rv.run.value;
  return r ? { text: tr("読み込み中", "Loading"), n: r.n, of: r.of } : t.baseCostBusy.value ? { text: tr("始まりの値段を計算中", "Pricing the start") } : null;
});
const checkBusy = computed((): { text: string; n?: number; of?: number } | null => {
  if (!checking.value) return null;
  const p = progress.value;
  return !p ? { text: tr("精査の準備中", "Preparing") } : p.phase === "walk" ? { text: tr("5 人を辿っている", "Walking runs"), n: p.n, of: p.of } : { text: tr("30 人を回している", "Running"), n: p.n, of: p.of };
});
function goIssue(id: string): void { void v.reveal(id, true); }

/** 整列して、全体に合わせる (1 つ戻すで元の並びへ) */
const tidyOf = (d: typeof doc.value): void => tidy(d);
async function onTidy(): Promise<void> {
  t.edit(tidyOf);
  await v.fit();
}
/** カオススパムを 1 押しで (当たりの既定 = このツリーの狙いのうち、この箱でまだ付いていない物を全部) */
function onSpam(b: Box): void {
  const d0 = s.data.value;
  const all = aimsOf(doc.value);
  const it = d0 ? sampleOf(d0, doc.value, b.id, 1).item : null;
  const aims = d0 && it ? all.filter((a) => !aimHeldOn(d0, it, a, { sameText: true })) : all;
  t.edit((d) => setHand(d, b.id, { currency: "chaos", omens: [], catalyst: null, quality: 0, repeat: { until: "hit", max: null } }, "spam", aims));
}

// ＋: 押すだけ = 足す (今まで通り)。長押し (か大きく動かす) で引っ張る → 箱の上で離す = その箱へつなぐ (重なった箱が光る) / 何も無い所 = やめる
/** 引っ張っている＋ (cx・cy はマウスの実ピクセル。ツリーの座標へは v.toWorld) */
const plus = ref<{ id: string; kind: "side" | "next"; cx: number; cy: number; target: string | null } | null>(null);
/** 下の＋を引っ張って戻り先にする時も、押して選ぶ時と同じくつなげない箱 (灰色) には付けない (10-22 13 通り組んだ #15) */
const plusLink = useTreeLink(doc, computed(() => (plus.value?.kind === "next" ? plus.value.id : null)));
function plusAt(cx: number, cy: number): void {
  const p = plus.value;
  if (!p) return;
  p.cx = cx; p.cy = cy;
  const id = (document.elementFromPoint(cx, cy) as HTMLElement | null)?.closest<HTMLElement>("[data-tree-box]")?.dataset.boxId ?? null;
  p.target = id && id !== p.id && !(p.kind === "next" && plusLink.value.get(id)) ? id : null;
}
function onPlus(b: Box, kind: "side" | "next", e: PointerEvent): void {
  if (viewOnly.value) return;
  gesture(e, {
    holdMs: HOLD_MS,
    onStart: (q) => { plus.value = { id: b.id, kind, cx: q.clientX, cy: q.clientY, target: null }; plusAt(q.clientX, q.clientY); },
    onMove: (q) => plusAt(q.clientX, q.clientY),
    // 引っ張って離した (オーナー 10-22): 箱の上 = その箱へつなぐ (打つ手の窓は出さない)、何も無い所 = やめる (元のまま)
    onEnd: () => {
      const p = plus.value;
      plus.value = null;
      if (!p?.target) return;
      if (kind === "side") onAddHit(b, undefined, p.target);
      else t.edit((d) => setBack(d, b.id, p.target!));
    },
    onTap: () => { if (kind === "side") onAddHit(b); else startLink(b); },
    onCancel: () => { plus.value = null; },
  });
}
/** 引っ張っている＋の線 (＋の所 → マウス、ツリーの座標)。直線ではなく柔らかい曲線 (オーナー「直線すぎてキモい」) */
const plusLine = computed(() => {
  const p = plus.value, b = p ? doc.value.boxes[p.id] : null;
  if (!p || !b) return null;
  const q = posOf(b), end = v.toWorld(p.cx, p.cy);
  const x1 = p.kind === "side" ? q.x + BOX_W + 2 : q.x + BOX_W / 2, y1 = p.kind === "side" ? q.y + BOX_H / 2 : q.y + BOX_H + 20;
  const ex = end.x, ey = end.y;
  const k = Math.max(40, Math.hypot(ex - x1, ey - y1) / 2.5);
  const c1 = p.kind === "side" ? `${x1 + k} ${y1}` : `${x1} ${y1 + k}`;
  return `M ${x1} ${y1} C ${c1} ${ex} ${ey + (ey < y1 ? k : -k)} ${ex} ${ey}`;
});

watch(() => panel.value?.id, (id) => { if (id) setTimeout(() => void v.reveal(id), 0); });
/** Vue Flow に渡す箱 (位置は木の形のまま。動かせるのは組める時だけ = 手・一望・戻り先を選んでいる間は画面だけ動く) */
const flowNodes = computed(() => [...(rv.isShown("start") ? [{ id: GOAL_ID, type: "goal", position: goalPos(doc.value), draggable: false, selectable: false, connectable: false }] : []), ...rv.visible.value.map((b) => ({ id: b.id, type: "box", position: posOf(b), draggable: false, selectable: false, connectable: false }))]);
// Vue Flow へは setNodes で直接入れる (:nodes で渡すと、Vue Flow が中の並びを書き戻している一瞬の変化を拾わず、
// 見本を開いた時に始まりの箱しか出なかった。10-23 開発版で見た)
watch(flowNodes, (n) => v.flow.setNodes(n), { immediate: true });
/** ドットの格子 (Vue Flow の送りと倍率に合わせて動く) */
const grid = computed(() => {
  const { x, y, zoom: z } = v.flow.viewport.value;
  return { backgroundImage: "radial-gradient(rgba(214,180,120,0.16) 1.2px, transparent 1.7px)", backgroundSize: `${22 * z}px ${22 * z}px`, backgroundPosition: `${x}px ${y}px` };
});

function onKey(e: KeyboardEvent): void {
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); t.undo(); return; }
  if (e.key === "1" && !e.ctrlKey && !e.metaKey && !e.altKey) { void v.fit(); return; }
  // 箱の重ね窓は useDismiss が先に閉じる (defaultPrevented)。同じ Esc でページまで閉じない
  if (e.key === "Escape" && !e.defaultPrevented) {
    if (cardBox.value) { cardBox.value = null; hoverBox.value = null; }
    else if (plus.value) plus.value = null;
    else if (picking.value) picking.value = null;
    else if (panel.value) panel.value = null;
    else if (full.value) void v.toggleFull();
    else close();
  }
}
onMounted(() => window.addEventListener("keydown", onKey));
/**
 * 見本を開く (?page=sim-tree&sample=<名前>、tree-samples.ts。10-23 オーナー「サフィックスを全部付けるまでの手順で表示してみて」)。
 * 今の木は置き換える前にこのブラウザに控える (exiledesk.tree.v0.before-sample)。1 つ戻すでも戻せる
 */
onMounted(() => {
  const name = new URLSearchParams(location.search).get("sample");
  const sample = name ? treeSample(name) : null;
  if (!sample) { if (t.takeAskBase()) t.goalPage.value = 1; return; } // 白紙ならまず 0 完成形の設定の重ね窓 (10-22 オーナー)
  try { localStorage.setItem("exiledesk.tree.v0.before-sample", JSON.stringify(doc.value)); } catch { /* 控えられなくても開く */ }
  t.edit((d) => { for (const k of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[k]; Object.assign(d, sample); tidyOf(d); });
});
onBeforeUnmount(() => { window.removeEventListener("keydown", onKey); });

function close(): void { treePage.value = false; }
const panelBox = computed(() => (panel.value ? doc.value.boxes[panel.value.id] ?? null : null));
/** 一覧に出す箱の名前 (種類 + 当たりの札) */
function boxName(id: string): string { const b = doc.value.boxes[id]; return !b ? id : b.out === "hit" && b.aim ? `${outName("hit")} ${t.aimLabel(b.aim)}` : outName(b.out); }
/** 光る箱: MOD の札 = その札の当たりの箱、カレンシーの札 ("cur:" + キー) = その手を使っている箱 */
const glowOf = (b: Box): boolean => {
  const g = glowAim.value;
  if (!g) return false;
  if (g.startsWith("cur:")) return handUses(b, g.slice(4));
  return b.out === "hit" && !!b.aim && aimKey(b.aim) === g;
};
</script>

<template>
  <section data-tree-page class="min-w-0 flex-1 p-4">
    <div class="mb-3 flex flex-wrap items-center gap-3">
      <h1 class="g-tabbar g-brush flex min-w-0 flex-1 items-center gap-3 px-8 text-[22px] tracking-[0.18em] text-[var(--exile-color-text-title)] [text-shadow:0_2px_2px_#000,0_0_16px_rgba(255,200,110,0.3)] max-md:flex-wrap max-md:gap-x-2 max-md:gap-y-1 max-md:px-4 max-md:py-2 max-md:text-[17px] max-md:tracking-[0.08em]"><span class="whitespace-nowrap">{{ tr("クラフトの道 (ツリー)", "Craft route tree") }}</span><BusyTag v-if="busy" :text="busy.text" :n="busy.n" :of="busy.of" /></h1>
      <button type="button" class="g-btn sm" @click="close">{{ tr("← 戻る", "← Back") }}</button>
    </div>
    <TreeOverlays /><TreeHandPage v-if="panel?.kind === 'hand' && panelBox" :key="`h-${panel.id}`" :box-id="panel.id" :current="panelBox.hand" @pick="pickHand" @clear="clearHandOf" @close="closeHand" @split="onSplit" @back="picking = panel!.id; panel = null" />
    <TreePanelPage v-else-if="panel && panelBox" :key="`${panel.kind}-${panel.id}`" :kind="panel.kind === 'split' || panel.kind === 'note' ? panel.kind : 'aim'" :box-id="panel.id" :current="panelBox.aim" @pick="pickAim" @close="panel = null" />
    <div class="g-panel flex flex-col gap-2 px-3 py-2" :class="full ? '!fixed inset-0 z-[60] !m-0 rounded-none' : ''">
      <!-- 帯: 全体の数字 (まだ) ・1 つ戻す・拡大縮小・全画面 -->
      <!-- 折り返さない (回した結果の文で 1 行と 2 行の境目になり、木の枠が上下して箱の × が押せなかった、10-22)。左は狭ければ … で切る。768px 未満は左と右を 2 段に (右が画面より広く左が潰れて「回す」が押せなかった、10-22) -->
      <div class="flex flex-wrap items-center gap-2 text-[13px] md:flex-nowrap">
        <span class="flex min-w-0 flex-1 basis-full items-center gap-2 max-md:flex-wrap md:basis-auto">
        <TreeRecipeBar @opened="v.fit()" />
        <TreeRunBar v-model:shown="tr100.shown.value" :result="tr100.result.value" :running="tr100.running.value" :ready="!!s.data.value" :stuck="tr100.stuckBoxes.value" @run="tr100.run" @go="goIssue" :halted="tr100.halted.value" :walk="tr100.walk.value" @skip="tr100.skipWalk" />
        </span>
        <span class="ml-auto flex shrink-0 flex-wrap items-center gap-1 max-md:ml-0 max-md:shrink max-md:basis-full md:flex-nowrap">
          <button type="button" data-tree-undo class="g-btn sm inline-flex items-center gap-1" :disabled="!t.canUndo.value" :title="tr('1 つ戻す (Ctrl+Z)', 'Undo (Ctrl+Z)')" @click="t.undo"><Icon name="undo" class="size-4" />{{ tr("1 つ戻す", "Undo") }}</button>
          <button type="button" data-tree-tidy class="g-btn sm" :title="tr('段ごとに横一列・親は子の並びの真ん中・線は直角の木の線 (1 つ戻すで元の並びへ)', 'Rows by depth, each parent centered over its children, right-angle tree lines (undo restores)')" @click="onTidy">{{ tr("整列", "Tidy") }}</button>
          <button type="button" data-tree-lines-all class="g-btn sm" :aria-pressed="linesAll" :title="tr('戻りの線を全部出す (もう一度押すと、乗せた箱の線だけ)', 'Show all return lines (click again to show only the hovered box’s lines)')" @click="linesAll = !linesAll">{{ linesAll ? tr("線を隠す", "Hide lines") : tr("線を全部表示", "Show all lines") }}</button>
          <button type="button" data-tree-check class="g-btn sm" :disabled="checking" :title="tr('5 人をエンジンで辿り 30 人を回して、止まる所・打てない手・付かない当たり・完成に着かない道を探す (費用は出さない)', 'Walk 5 runs and play 30 runs with the engine to find dead ends, unusable crafts, unreachable hits and paths that never finish (no costs)')" @click="onCheck">{{ checking ? tr("精査中…", "Checking…") : tr("ルート精査", "Check route") }}</button>
          <button type="button" data-tree-memo class="g-btn sm inline-flex items-center gap-1" :aria-pressed="memoOpen" :title="tr('欲しい MOD とメモの窓 (ツリーを押しても閉じない)', 'Wanted mods & notes window (stays open while you edit)')" @click="memoOpen = !memoOpen"><Icon name="pencil" class="size-4" />{{ tr("メモ", "Notes") }}<span v-if="doc.note" class="size-1.5 rounded-full bg-amber-400" /></button>
          <button type="button" data-tree-full class="g-btn sm" :aria-pressed="full" @click="v.toggleFull">{{ full ? tr("全画面を閉じる", "Exit full screen") : tr("全画面に広げる", "Full screen") }}</button>
          <button ref="clearBtn" type="button" data-tree-clear :class="clearArm.is() ? ARMED_CLASS : 'g-btn sm'" :title="tr('始まりの箱だけに戻す (1 つ戻すで戻せる)', 'Back to just the start box (undo restores it)')" @click="onClear">{{ clearArm.is() ? tr("もう一度押すと白紙に戻す", "Click again to clear") : tr("白紙に戻す", "Clear") }}</button>
        </span>
      </div>

      <TreeTabs @switched="v.goHome()" />
      <div ref="row" class="flex min-h-0 gap-2" :class="full ? 'flex-1' : ''" :style="full ? {} : { height: `${rowH}px` }">
        <!-- ツリー (暗い地 + ドットの格子、見本の 1。右下に浮かぶ道具とミニマップ、左上に今の状態の札) -->
        <div data-tree-frame class="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-white/[0.06] bg-[#0c0a08]">
        <!-- ページの zoom を枠だけ打ち消す (中は実質 1 倍。Vue Flow の座標とマウスが揃う、use-tree-flow.ts)。格子は Vue Flow の送りと倍率に合わせる。ホイールは決まった段へ 1 段ずつ (use-tree-flow の onWheel) -->
        <div data-tree-canvas data-overflow-ok class="absolute left-0 top-0 h-full w-full" :class="hand ? 'cursor-grab' : ''" :style="{ zoom: 1 / pageZ, ...grid }" @wheel="v.onWheel">
          <VueFlow :id="FLOW_ID" :default-viewport="{ x: 0, y: 0, zoom: pageZ }" :min-zoom="v.minZoom.value" :max-zoom="v.maxZoom.value"
            :nodes-draggable="false" :nodes-connectable="false" :elements-selectable="false"
            :pan-on-drag="true" :pan-on-scroll="false" :zoom-on-scroll="false" :zoom-activation-key-code="null" :zoom-on-double-click="false" :zoom-on-pinch="false"
            :delete-key-code="null" :selection-key-code="null" :multi-selection-key-code="null" :auto-pan-on-node-drag="true"
            @pane-click="onPaneClick" @node-click="onNodeClick">
            <template #node-goal><TreeGoalNode :selected="!!t.goalPage.value" /></template>
            <template #node-box="{ id }">
              <TreeBox v-if="doc.boxes[id]" :box="doc.boxes[id]!" :removable="canRemove(doc, id)" :picking="!!picking && picking !== id"
                :selected="panel?.id === id || picking === id || plus?.target === id" :back-label="backLabel(doc.boxes[id]!)" :view-only="viewOnly || hand" :glow="glowOf(doc.boxes[id]!) || plus?.target === id" :issue="issueOf(doc.boxes[id]!)" :inv="inv" :link-no="picking ? link.get(id) ?? null : null"
                @drag="startDrag(doc.boxes[id]!, $event)" @aim="onAim(doc.boxes[id]!)" @plus="(k, e) => onPlus(doc.boxes[id]!, k, e)" @remove="t.edit((d) => removeHit(d, id))"
                @back="picking = id" @clear-back="t.edit((d) => setBack(d, id, null))" @done="onDone(doc.boxes[id]!)"
                @note="panel = { kind: 'note', id }" @base="t.goalPage.value = 1" @spam="onSpam(doc.boxes[id]!)" @back-go="goBack(doc.boxes[id]!)" @hover="(on) => (hoverBox = on ? id : hoverBox === id ? null : hoverBox)" />
            </template>
            <!-- Vue Flow の倍率と移動が掛かる層: 線は箱の後ろ (z-index -1)、打つ手の札・引っ張る線・戻りの弧は箱の前 -->
            <template #zoom-pane>
              <svg data-tree-lines class="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" style="z-index: -1">
                <defs>
                  <marker v-for="(c, k) in LINE" :id="`tree-arrow-${k}`" :key="k" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" :fill="c" /></marker>
                </defs>
                <g v-for="e in shownEdges" :key="e.id" data-tree-edge>
                  <path :d="e.stem" :stroke="LINE.fwd" stroke-width="2" fill="none" />
                  <path v-for="o in e.to" :key="o.id" :d="o.d" :stroke="o.color" stroke-width="2" stroke-linejoin="round" fill="none" :marker-end="`url(#tree-arrow-${o.kind})`" />
                </g>
              </svg>
              <!-- 矢印の上の札 = 打つ手 (押すと替える・消す)。戻りの矢印だけの箱から流れ込む線 -->
              <!-- 段の目印 (木の左の外、当たりの箱の揃った狙いの数) -->
              <TreeBandLayer :doc="doc" :k="1 / zoom" />
              <TreeHandChip v-for="e in shownEdges" :key="`hand-${e.id}`" :id="e.id" :hand="e.hand" :split="e.split" :x="e.jx" :y="e.jy" :inv="inv" :off="hand" @open="panel = { kind: e.hand ? 'hand' : 'split', id: e.id }" />
              <!-- 品質だけ上げた後 (箱無し) で次の手がまだ無い所の＋ (押すと次の手の棚) -->
              <button v-for="b in rv.done.value ? passes.filter((x) => !x.hand && !x.back) : []" :key="`pass-${b.id}`" type="button" data-tree-pass-next :data-box-id="b.id" class="nodrag nopan pointer-events-auto absolute z-[5] flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-amber-400/70 bg-[#1d1812] text-amber-200 hover:bg-amber-500/30"
                :class="viewOnly || hand ? '!pointer-events-none opacity-60' : ''" :style="{ left: `${posOf(b).x + BOX_W / 2}px`, top: `${posOf(b).y}px`, scale: String(inv) }" :title="tr('次に打つ手を足す', 'Add the next craft')" @click="startLink(b)"><Icon name="plus" class="size-4" /></button>
              <TreeMergeLayer v-if="merged && rv.done.value" :lines="merged.lines" :paths="merged.paths" :hover="hoverBox" :show-all="linesAll" />
              <TreeRunLayer v-if="(tr100.result.value || tr100.walk.value) && tr100.shown.value && rv.done.value" :result="tr100.result.value" :walk="tr100.walk.value" :k="1 / zoom" :boxes="shown" :pos-of="posOf" :edges="shownEdges" :lines="merged?.lines ?? []" :paths="merged?.paths ?? new Map()" @go="goIssue" />
              <!-- 引っ張っている＋の線と、戻り先の札に乗せた時の線は箱の前 (相手の箱の上まで見える) -->
              <svg v-if="plusLine" class="pointer-events-none absolute left-0 top-0 z-10 overflow-visible" width="1" height="1">
                <defs><marker id="tree-arrow-drag" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" :fill="LINE.back" /></marker></defs>
                <path v-if="plusLine" data-tree-plus-line :d="plusLine" :stroke="LINE.back" stroke-width="3" stroke-linecap="round" fill="none" marker-end="url(#tree-arrow-drag)" />
              </svg>
            </template>
          </VueFlow>
        </div>
        <!-- 今の状態の札 (左上に浮かべる。ツリーを押し下げない) -->
        <p v-if="picking || hand || viewOnly" data-tree-mode-pill class="pointer-events-none absolute left-3 top-3 z-20 flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] shadow-[0_4px_14px_rgba(0,0,0,0.6)]"
          :class="[picking ? 'border-cyan-400/50 bg-[#0d1a1c]/95 text-cyan-100' : 'border-white/10 bg-[#15110c]/95 text-[#d8ccb4]', picking || hand ? '' : 'max-md:hidden']">
          {{ picking && panel?.kind === "hand" && panel.id === picking ? tr("右の棚で次に打つ手を選ぶ / 箱を押すとそこへ戻る (Esc でやめる)", "Pick the next craft on the right, or click a box to return to it (Esc cancels)") : picking ? tr("戻り先の箱を押す (Esc でやめる)", "Click the box to return to (Esc cancels)") : hand ? tr("手: 見るだけ (選択に戻すと組める)", "Hand: view only (switch to Select to edit)") : tr("縮めて見ている間は箱を押すとその箱の編集が開く", "Zoomed out: click a box to edit it") }}
          <!-- 完成の箱からつなぐと完成の印は外れる (黙って外れていた、10-22 白紙から組んだ試し #19) -->
          <b v-if="picking && doc.boxes[picking]?.done" data-tree-pick-undone class="text-amber-200">{{ tr("(この箱の完成の印は外れる)", "(this box's done mark will be removed)") }}</b>
          <template v-if="picking && picking !== 'start'">
            <button type="button" data-tree-pick-start class="g-btn sm pointer-events-auto" :title="tr('始まりの箱の手から打ち直す', 'Craft again from the start box')" @click="pickBack('start')">{{ tr("↩ 始めに戻る", "↩ Back to start") }}</button>
          </template>
        </p>
        <TreeIssues v-if="issues && issuesOpen" v-model:fold="issuesFold" :issues="issues" :busy="checkBusy" :lower="!!(picking || hand || viewOnly)" :box-name="boxName" @go="goIssue" @close="issuesOpen = false" />
        <!-- 縮めて見ている時の箱の編集 (等倍。枠の外・Esc で閉じる) -->
        <div v-if="pop && doc.boxes[pop]" ref="popEl" data-tree-pop class="absolute z-30 w-max rounded-2xl border border-white/10 bg-[#0c0a08]/95 p-3 pb-12 pr-7 shadow-[0_10px_30px_rgba(0,0,0,0.7)]" :style="popStyle">
          <div class="relative" :style="{ width: `${BOX_W}px`, height: `${BOX_H}px` }">
            <TreeBox :box="doc.boxes[pop]!" :x="0" :y="0" :removable="canRemove(doc, pop)" :picking="false" :selected="true" :back-label="backLabel(doc.boxes[pop]!)" :issue="issueOf(doc.boxes[pop]!)"
              @drag="() => {}" @aim="popDo((_, b) => onAim(b))" @plus="(k) => popDo((_, b) => (k === 'side' ? onAddHit(b) : startLink(b)))" @remove="popDo((id) => t.edit((d) => removeHit(d, id)))"
              @back="popDo((id) => (picking = id))" @clear-back="t.edit((d) => setBack(d, pop!, null))" @done="onDone(doc.boxes[pop!]!)"
              @note="popDo((id) => (panel = { kind: 'note', id }))" @base="popDo(() => (t.goalPage.value = 1))" @spam="onSpam(doc.boxes[pop!]!)" @back-go="popDo((_, b) => goBack(b))" />
          </div>
        </div>
        <TreeHoverCard v-if="cardBox && doc.boxes[cardBox]" :box-id="cardBox" :rect="v.rectOf(doc.boxes[cardBox]!)" />
        <TreeCanvasTools v-model:hand="hand" :boxes="rv.visible.value" :view="v.view.value" :zoom="zoom" @center="v.centerOn" @fit="v.fit" @zoom-in="v.zoomIn" @zoom-out="v.zoomOut" @reset="v.resetZoom" />
        </div>
      </div>
    </div>
    <!-- 欲しい MOD とメモの浮かぶ窓 (ページの中で一番上、ツリーを押しても閉じない) -->
    <TreeMemoFloat v-model:open="memoOpen" v-model:glow="glowAim" :avoid="panel ? `${panel.kind}:${panel.id}:${full}` : null" />
  </section>
</template>
