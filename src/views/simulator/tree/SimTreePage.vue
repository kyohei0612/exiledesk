<!--
  SimTreePage.vue — クラフトの道 (ツリー) のページ (?page=sim-tree、2026-10-22 オーナー OK「UI の表面だけ」、開発版だけ・PC だけ)。
  入口 (web-page.ts の treePage・web/page.ts・WebApp.vue) はジン部長、中身はシミュ部長。設計は docs/org/simulator/notes/2026-10-22-manual-sim-design.md の 11。
  一番上がフラクチャーの箱 (始まり)。下の＋で打つ手 (クラフト台の棚から) → 矢印の先に結果の箱。横の＋で当たりを足す、↩ で既にある箱へ戻す。
  ＋は長押しで引っ張り、箱の上で離すとその箱へつなぐ (何も無い所ならやめる)。箱はドラッグで動かす、1 つ戻す / Ctrl+Z。
  線は普通の木の図の直角の線、戻りの矢印は箱の下の札に乗せた時だけ (10-22 整列の定義)。
  土台は Vue Flow (10-22 オーナー): 画面の送り・拡大縮小・箱のドラッグ・押した判定は Vue Flow、見え方の決まりは use-tree-flow.ts。
  線・打つ手の札・引っ張る線・戻りの弧は Vue Flow の zoom-pane (倍率と移動が掛かる層) に描く。100 人回す計算はまだ繋がない
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { VueFlow, type NodeMouseEvent } from "@vue-flow/core";
import "@vue-flow/core/dist/style.css";
import Icon from "../../../components/ui/Icon.vue";
import TreeMemoFloat from "./TreeMemoFloat.vue";
import TreeCanvasTools from "./TreeCanvasTools.vue";
import TreeBox from "./TreeBox.vue";
import TreeHandShelf from "./TreeHandShelf.vue";
import TreeModPick from "./TreeModPick.vue";
import TreeNote from "./TreeNote.vue";
import TreeTrial from "./TreeTrial.vue";
import { useTree } from "./use-tree";
import { FLOW_ID, useTreeFlow } from "./use-tree-flow";
import { craftStage as s } from "../../../state/craft-stage";
import { addHit, aimKey, BOX_H, BOX_W, canRemove, clearHand, moveBox, removeHit, setAim, setBack, setDone, setHand, tidy, handUses, type Aim, type Hand, type HandKind, type TreeBox as Box } from "../../../services/simulator/tree/tree-model";
import { handLabel } from "./tree-names";
import { aimHeld, aimsOf, sampleOf } from "../../../services/simulator/tree/tree-sample";
import { checkTree, type CheckIssue } from "../../../services/simulator/tree/tree-check";
import { treeSample } from "../../../services/simulator/tree/tree-samples";
import { MATCH, RESTART } from "../../../services/simulator/tree/tree-run";
import { treePage } from "../../../state/web-page";
import { tr } from "../../../i18n/lang";
import { pageZoom } from "../../../utils/zoom";
import { gesture, HOLD_MS } from "./use-gesture";

const t = useTree();
const doc = t.doc;

/** 右の欄 (箱を選んだ時だけ) */
const panel = ref<{ kind: "hand" | "aim" | "fracture" | "trial" | "note"; id: string } | null>(null);
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
onBeforeUnmount(v.dispose);

// ドラッグ中は Vue Flow の箱だけが動き、離した時に 1 回だけ組み替える (1 つ戻すが 1 手で済む)。線は引っ張っている位置に合わせる
const drag = ref<{ id: string; x: number; y: number } | null>(null);
const posOf = (b: Box): { x: number; y: number } => (drag.value?.id === b.id ? { x: drag.value.x, y: drag.value.y } : { x: b.x, y: b.y });
const boxes = computed(() => Object.values(doc.value.boxes));

/**
 * 進む線 (2026-10-22 整列の定義、オーナー「クソ汚い」の後): 普通の木の図と同じ直角の線。親の下から 1 本下りて (途中に手の札)、
 * 子の段の上で横の棒、そこから子の上の辺へ下ろす。色は 進む = 灰 / 外れ・消えた = 赤系 の 2 つだけ
 */
const LINE = { fwd: "#a39a88", bad: "#c96a72", back: "#5fd0e0" } as const;
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
const edges = computed(() => boxes.value.filter((b) => b.hand && b.outs.length).map((b) => {
  const p = posOf(b);
  const px = p.x + BOX_W / 2, py = p.y + BOX_H, jy = py + 46;
  const kids = b.outs.map((o) => ({ id: o, c: doc.value.boxes[o]!, q: posOf(doc.value.boxes[o]!) }));
  const busY = Math.min(...kids.map((k) => k.q.y)) - 18;
  // 角丸の段付き (React Flow の smoothstep、見本の 3): 親の下から下りて、角を丸めて横へ、角を丸めて子の上の辺へ。
  // 外れ (赤) を先に描き、進む (灰) を上に重ねる (同じ横の棒を通る所は灰に見える)
  const to = kids.map((k) => {
    const cx = k.q.x + BOX_W / 2, cy = k.q.y - 3, dx = cx - px, r = Math.min(10, Math.abs(dx) / 2), s = Math.sign(dx);
    const d = !s ? `M ${px} ${busY - 10} L ${cx} ${cy}`
      : `M ${px} ${busY - 10} L ${px} ${busY - r} Q ${px} ${busY} ${px + s * r} ${busY} L ${cx - s * r} ${busY} Q ${cx} ${busY} ${cx} ${busY + r} L ${cx} ${cy}`;
    const bad = k.c.out !== "hit";
    return { id: k.id, color: bad ? LINE.bad : LINE.fwd, kind: bad ? "bad" : "fwd", d, bad };
  }).sort((a, z) => Number(z.bad) - Number(a.bad));
  return { id: b.id, hand: b.hand!, jx: px, jy, stem: `M ${px} ${py} L ${px} ${busY - 10}`, to };
}));
/**
 * 戻りの矢印は既定では引かない (外側を回る長い線でツリーが囲まれた、オーナー 10-22)。箱の下の札「↩ 戻り先」にマウスを乗せた時だけ、
 * 箱の左から戻り先の左へ柔らかい線を一時的に出し、戻り先を光らせる (押すとそこへ寄る)
 */
const hoverBack = ref<string | null>(null);
const backLine = computed(() => {
  const b = hoverBack.value ? doc.value.boxes[hoverBack.value] : null, to = b?.back ? doc.value.boxes[b.back] : null;
  if (!b || !to) return null;
  // 箱の横の辺から戻り先の同じ側の横の辺へ、外へふくらむ 1 本の弧を箱より前に描く (乗せている間だけ。10-22 開発版で触って見て決めた:
  // ツリーの外側を大回りすると画面の外へ出て戻り先が分からず、上の辺へ入れると自分の箱と戻り先の箱を突き抜けた)
  const p = posOf(b), q = posOf(to);
  const left = p.x + BOX_W / 2 <= q.x + BOX_W / 2;
  const sx = left ? p.x - 3 : p.x + BOX_W + 3, sy = p.y + BOX_H / 2;
  const tx = left ? q.x - 4 : q.x + BOX_W + 4, ty = q.y + BOX_H / 2;
  const out = (left ? -1 : 1) * Math.max(70, Math.abs(sy - ty) / 3);
  return `M ${sx} ${sy} C ${sx + out} ${sy} ${tx + out} ${ty} ${tx} ${ty}`;
});
function goBack(b: Box): void { hoverBack.value = null; if (b.back) void v.reveal(b.back, true); }

function backLabel(b: Box): string {
  if (b.back === MATCH) return tr("形の合う箱へ", "Matching box");
  if (b.back === RESTART) return tr("作り直し", "Start over");
  const to = b.back ? doc.value.boxes[b.back] : null;
  if (!to) return "";
  if (to.out === "start") return tr("始まり", "Start");
  if (to.out === "hit") return to.aim ? t.aimLabel(to.aim) : tr("当たり", "Hit");
  return to.out === "junk" ? tr("外れ", "Miss") : to.out === "junkGone" ? tr("外れが消えた", "Miss removed") : tr("狙いが消えた", "Target lost");
}

// 組み替え
function pickHand(h: Hand, kind: HandKind, aims: Aim[]): void {
  const id = panel.value!.id;
  t.edit((d) => setHand(d, id, h, kind, aims));
  panel.value = null;
}
/**
 * Vue Flow の出来事: 空き所を押す = 右の欄を閉じる (よくあるモーダルと同じ。オーナー 10-22。引っ張った時は Vue Flow が画面を動かすだけ)。
 * 箱を押す = 戻り先を選んでいる時はそこへつなぐ / 縮めて見ている時はそこへ寄る / ふつうは試し打ちの欄 (手の間は何もしない)。
 * 箱を引っ張る = 動かす (startDrag。Vue Flow の引っ張りは使わない)
 */
function onPaneClick(): void { if (panel.value) closeHand(); }
/** 引っ張り終えた直後の click (押した所と離した所が同じ箱だと出る) は押した事にしない */
let dragEndedAt = 0;
function onNodeClick(e: NodeMouseEvent): void {
  const b = doc.value.boxes[e.node.id];
  if (!b || hand.value || performance.now() - dragEndedAt < 300) return;
  if (picking.value) { if (picking.value !== b.id) onTarget(b); return; }
  if (viewOnly.value) { void v.focusBox(b.id); return; }
  hoverBack.value = null;
  panel.value = { kind: "trial", id: b.id };
}
/** 箱を引っ張る (use-gesture.ts: 遊び 5px を超えた後も押した所からの差をそのまま使う。差はツリーの倍率で割る) */
function startDrag(b: Box, e: PointerEvent): void {
  hoverBack.value = null;
  gesture(e, {
    onStart: () => { drag.value = { id: b.id, x: b.x, y: b.y }; },
    onMove: (p) => { if (drag.value) { drag.value.x = b.x + p.dx / zoom.value; drag.value.y = b.y + p.dy / zoom.value; } },
    onEnd: () => { const g = drag.value; drag.value = null; dragEndedAt = performance.now(); if (g) t.edit((d) => moveBox(d, g.id, g.x, g.y)); },
    onCancel: () => { drag.value = null; },
  });
}
function closeHand(): void { panel.value = null; }
function clearHandOf(): void { const id = panel.value!.id; t.edit((d) => clearHand(d, id)); panel.value = null; }
function pickAim(a: Aim): void {
  const p = panel.value!;
  t.edit((d) => { if (p.kind === "fracture") d.fracture = { ...a }; else setAim(d, p.id, a); });
  panel.value = null;
}
function onAim(b: Box): void { panel.value = { kind: b.out === "start" ? "fracture" : "aim", id: b.id }; }
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
function onDone(b: Box): void { t.edit((d) => setDone(d, b.id, b.done === null ? "main" : b.done === "main" ? "compromise" : null)); }
function onTarget(b: Box): void {
  const from = picking.value;
  picking.value = null;
  if (from && from !== b.id) t.edit((d) => setBack(d, from, b.id));
}
// ルート精査 (押した時に始める)。! は穴が解消した時だけ消える: 道を組み替えたら精査し直して、残った穴の ! は残す。
// 一覧を閉じる・箱を押す・動かすでは消さない (オーナー 10-22「！マークは解消したら消していく感じで」)
const issues = ref<CheckIssue[] | null>(null);
const issuesOpen = ref(false);
const checking = ref(false);
/** 道の形 (箱の位置・メモは入れない)。位置を動かしただけでは精査し直さない */
const routeKey = computed(() => JSON.stringify([doc.value.fracture, Object.values(doc.value.boxes).map(({ x: _x, y: _y, note: _n, ...r }) => r)]));
let recheck = 0;
/** 精査を押した時に見つけた穴 (箱と種類)。組み替えた後はこの中で今も残る物だけ出す (新しい穴は精査を押した時。1 つ戻すで穴が戻れば ! も戻る) */
let found: CheckIssue[] = [];
watch(routeKey, () => { if (!found.length) return; clearTimeout(recheck); recheck = window.setTimeout(() => void runCheck(true), 300); });
async function runCheck(keep = false): Promise<void> {
  const d = s.data.value;
  if (!d || checking.value) return;
  checking.value = true;
  await new Promise((r) => setTimeout(r, 30)); // 「精査中」を先に出す
  try {
    const now = checkTree(d, doc.value);
    if (!keep) found = now;
    issues.value = keep ? now.filter((x) => found.some((y) => y.boxId === x.boxId && y.kind === x.kind)) : now;
  } finally { checking.value = false; }
}
async function onCheck(): Promise<void> { issuesOpen.value = true; await runCheck(); }
const issueOf = (b: Box): string | null => issues.value?.filter((x) => x.boxId === b.id).map((x) => x.text).join(" / ") || null;
function goIssue(id: string): void { void v.reveal(id, true); }

/** 整列して、全体に合わせる (1 つ戻すで元の並びへ) */
async function onTidy(): Promise<void> {
  t.edit((d) => tidy(d));
  await v.fit();
}
/** カオススパムを 1 押しで (当たりの既定 = このツリーの狙いのうち、この箱でまだ付いていない物を全部) */
function onSpam(b: Box): void {
  const d0 = s.data.value;
  const all = aimsOf(doc.value);
  const it = d0 ? sampleOf(d0, doc.value, b.id, 1).item : null;
  const aims = d0 && it ? all.filter((a) => !aimHeld(d0, it, a)) : all;
  t.edit((d) => setHand(d, b.id, { currency: "chaos", omens: [], catalyst: null, quality: 0, repeat: { until: "hit", max: null } }, "spam", aims));
}

// ＋: 押すだけ = 足す (今まで通り)。長押し (か大きく動かす) で引っ張る → 箱の上で離す = その箱へつなぐ (重なった箱が光る) / 何も無い所 = やめる
/** 引っ張っている＋ (cx・cy はマウスの実ピクセル。ツリーの座標へは v.toWorld) */
const plus = ref<{ id: string; kind: "side" | "next"; cx: number; cy: number; target: string | null } | null>(null);
function plusAt(cx: number, cy: number): void {
  const p = plus.value;
  if (!p) return;
  p.cx = cx; p.cy = cy;
  const id = (document.elementFromPoint(cx, cy) as HTMLElement | null)?.closest<HTMLElement>("[data-tree-box]")?.dataset.boxId ?? null;
  p.target = id && id !== p.id ? id : null;
}
function onPlus(b: Box, kind: "side" | "next", e: PointerEvent): void {
  if (viewOnly.value) return;
  hoverBack.value = null;
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
    onTap: () => { if (kind === "side") onAddHit(b); else panel.value = { kind: "hand", id: b.id }; },
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
const flowNodes = computed(() => boxes.value.map((b) => ({ id: b.id, type: "box", position: posOf(b), draggable: false, selectable: false, connectable: false })));
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
  if (e.key === "Escape") {
    if (plus.value) plus.value = null;
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
  if (!sample) return;
  try { localStorage.setItem("exiledesk.tree.v0.before-sample", JSON.stringify(doc.value)); } catch { /* 控えられなくても開く */ }
  t.edit((d) => { for (const k of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[k]; Object.assign(d, sample); });
});
onBeforeUnmount(() => { window.removeEventListener("keydown", onKey); });

function close(): void { treePage.value = false; }
const panelBox = computed(() => (panel.value ? doc.value.boxes[panel.value.id] ?? null : null));
/** 一覧に出す箱の名前 (種類 + 当たりの札) */
function boxName(id: string): string {
  const b = doc.value.boxes[id];
  if (!b) return id;
  if (b.out === "start") return tr("始まり", "Start");
  const k = { hit: tr("当たり", "Hit"), junk: tr("外れ", "Miss"), junkGone: tr("外れが消えた", "Miss removed"), lost: tr("狙いが消えた", "Target lost") }[b.out];
  return b.out === "hit" && b.aim ? `${k} ${t.aimLabel(b.aim)}` : k;
}
/** 縮めて組んでいる時 (75〜99%) の倍率の逆数: 押せる物だけ大きさを戻す */
const inv = computed(() => (viewOnly.value ? 1 : Math.max(1, 1 / zoom.value)));
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
      <h1 class="g-tabbar g-brush flex min-w-0 flex-1 items-center px-8 text-[22px] tracking-[0.18em] text-[var(--exile-color-text-title)] [text-shadow:0_2px_2px_#000,0_0_16px_rgba(255,200,110,0.3)]">{{ tr("クラフトの道 (ツリー)", "Craft route tree") }}</h1>
      <button type="button" class="g-btn sm" @click="close">{{ tr("← 戻る", "← Back") }}</button>
    </div>

    <div class="g-panel flex flex-col gap-2 px-3 py-2" :class="full ? '!fixed inset-0 z-[60] !m-0 rounded-none' : ''">
      <!-- 帯: 全体の数字 (まだ) ・1 つ戻す・拡大縮小・全画面 -->
      <div class="flex flex-wrap items-center gap-2 text-[13px]">
        <span class="opacity-70">{{ tr("100 人回した時: 1 個あたり — 神 · 完成 —%", "100 runs: — div per item · —% done") }}</span>
        <span class="rounded-sm bg-white/10 px-1.5 text-[11px] opacity-70">{{ tr("計算はまだ繋いでいない", "Not calculated yet") }}</span>
        <span class="ml-auto flex items-center gap-1">
          <button type="button" data-tree-undo class="g-btn sm inline-flex items-center gap-1" :disabled="!t.canUndo.value" :title="tr('1 つ戻す (Ctrl+Z)', 'Undo (Ctrl+Z)')" @click="t.undo"><Icon name="undo" class="size-4" />{{ tr("1 つ戻す", "Undo") }}</button>
          <button type="button" data-tree-tidy class="g-btn sm" :title="tr('段ごとに横一列・親は子の並びの真ん中・線は直角の木の線 (1 つ戻すで元の並びへ)', 'Rows by depth, each parent centered over its children, right-angle tree lines (undo restores)')" @click="onTidy">{{ tr("整列", "Tidy") }}</button>
          <button type="button" data-tree-check class="g-btn sm" :disabled="checking" :title="tr('5 人をエンジンで辿って、止まる所・打てない手・付かない当たり・完成に着かない道を探す (費用は出さない)', 'Walk 5 runs with the engine to find dead ends, unusable crafts, unreachable hits and paths that never finish (no costs)')" @click="onCheck">{{ checking ? tr("精査中…", "Checking…") : tr("ルート精査", "Check route") }}</button>
          <button type="button" data-tree-memo class="g-btn sm inline-flex items-center gap-1" :aria-pressed="memoOpen" :title="tr('欲しい MOD とメモの窓 (ツリーを押しても閉じない)', 'Wanted mods & notes window (stays open while you edit)')" @click="memoOpen = !memoOpen"><Icon name="pencil" class="size-4" />{{ tr("メモ", "Notes") }}<span v-if="doc.note" class="size-1.5 rounded-full bg-amber-400" /></button>
          <button type="button" data-tree-full class="g-btn sm" :aria-pressed="full" @click="v.toggleFull">{{ full ? tr("全画面を閉じる", "Exit full screen") : tr("全画面に広げる", "Full screen") }}</button>
          <button type="button" class="g-btn sm" :title="tr('始まりの箱だけに戻す (1 つ戻すで戻せる)', 'Back to just the start box (undo restores it)')" @click="t.reset">{{ tr("白紙に戻す", "Clear") }}</button>
        </span>
      </div>

      <div ref="row" class="flex min-h-0 gap-2" :class="full ? 'flex-1' : ''" :style="full ? {} : { height: `${rowH}px` }">
        <!-- ツリー (暗い地 + ドットの格子、見本の 1。右下に浮かぶ道具とミニマップ、左上に今の状態の札) -->
        <div class="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-white/[0.06] bg-[#0c0a08]">
        <!-- ページの zoom を枠だけ打ち消す (中は実質 1 倍。Vue Flow の座標とマウスが揃う、use-tree-flow.ts)。格子は Vue Flow の送りと倍率に合わせる -->
        <div data-tree-canvas data-overflow-ok class="absolute left-0 top-0 h-full w-full" :class="hand ? 'cursor-grab' : ''" :style="{ zoom: 1 / pageZ, ...grid }">
          <VueFlow :id="FLOW_ID" :default-viewport="{ x: 0, y: 0, zoom: pageZ }" :min-zoom="v.minZoom.value" :max-zoom="v.maxZoom.value"
            :nodes-draggable="false" :nodes-connectable="false" :elements-selectable="false"
            :pan-on-drag="true" :pan-on-scroll="true" :zoom-on-scroll="false" zoom-activation-key-code="Control" :zoom-on-double-click="false" :zoom-on-pinch="true"
            :delete-key-code="null" :selection-key-code="null" :multi-selection-key-code="null" :auto-pan-on-node-drag="true"
            @pane-click="onPaneClick" @node-click="onNodeClick">
            <template #node-box="{ id }">
              <TreeBox v-if="doc.boxes[id]" :box="doc.boxes[id]!" :removable="canRemove(doc, id)" :picking="!!picking && picking !== id"
                :selected="panel?.id === id || picking === id || plus?.target === id" :back-label="backLabel(doc.boxes[id]!)" :view-only="viewOnly || hand" :glow="glowOf(doc.boxes[id]!) || plus?.target === id || (!!hoverBack && doc.boxes[hoverBack]?.back === id)" :issue="issueOf(doc.boxes[id]!)" :inv="inv"
                @drag="startDrag(doc.boxes[id]!, $event)" @aim="onAim(doc.boxes[id]!)" @plus="(k, e) => onPlus(doc.boxes[id]!, k, e)" @remove="t.edit((d) => removeHit(d, id))"
                @back="picking = id" @clear-back="t.edit((d) => setBack(d, id, null))" @done="onDone(doc.boxes[id]!)"
                @note="panel = { kind: 'note', id }" @spam="onSpam(doc.boxes[id]!)" @back-hover="(on) => (hoverBack = on ? id : null)" @back-go="goBack(doc.boxes[id]!)" />
            </template>
            <!-- Vue Flow の倍率と移動が掛かる層: 線は箱の後ろ (z-index -1)、打つ手の札・引っ張る線・戻りの弧は箱の前 -->
            <template #zoom-pane>
              <svg data-tree-lines class="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" style="z-index: -1">
                <defs>
                  <marker v-for="(c, k) in LINE" :id="`tree-arrow-${k}`" :key="k" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" :fill="c" /></marker>
                </defs>
                <g v-for="e in edges" :key="e.id" data-tree-edge>
                  <path :d="e.stem" :stroke="LINE.fwd" stroke-width="2" fill="none" />
                  <path v-for="o in e.to" :key="o.id" :d="o.d" :stroke="o.color" stroke-width="2" stroke-linejoin="round" fill="none" :marker-end="`url(#tree-arrow-${o.kind})`" />
                </g>
              </svg>
              <!-- 矢印の上の札 = 打つ手 (押すと替える・消す) -->
              <button v-for="e in edges" :key="`hand-${e.id}`" type="button" data-tree-hand class="nodrag nopan pointer-events-auto absolute z-[5] max-w-[300px] -translate-x-1/2 -translate-y-1/2 truncate rounded-full border border-amber-400/60 bg-[#1a140d] px-3 py-1 text-[12px] font-semibold text-amber-100 shadow-[0_2px_10px_rgba(0,0,0,0.6)] hover:border-amber-300 hover:bg-[#2a2014]"
                :class="viewOnly || hand ? '!pointer-events-none' : ''" :style="{ left: `${e.jx}px`, top: `${e.jy}px`, scale: String(inv) }" :title="handLabel(e.hand)" @click="panel = { kind: 'hand', id: e.id }">{{ handLabel(e.hand) }}</button>
              <!-- 引っ張っている＋の線と、戻り先の札に乗せた時の線は箱の前 (相手の箱の上まで見える) -->
              <svg v-if="plusLine || backLine" class="pointer-events-none absolute left-0 top-0 z-10 overflow-visible" width="1" height="1">
                <defs><marker id="tree-arrow-drag" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" :fill="LINE.back" /></marker></defs>
                <path v-if="plusLine" data-tree-plus-line :d="plusLine" :stroke="LINE.back" stroke-width="3" stroke-linecap="round" fill="none" marker-end="url(#tree-arrow-drag)" />
                <path v-if="backLine" data-tree-back :d="backLine" :stroke="LINE.back" stroke-width="2.5" stroke-linecap="round" fill="none" marker-end="url(#tree-arrow-drag)" />
              </svg>
            </template>
          </VueFlow>
        </div>
        <!-- 今の状態の札 (左上に浮かべる。ツリーを押し下げない) -->
        <p v-if="picking || hand || viewOnly" data-tree-mode-pill class="pointer-events-none absolute left-3 top-3 z-20 rounded-full border px-3 py-1 text-[12px] shadow-[0_4px_14px_rgba(0,0,0,0.6)]"
          :class="picking ? 'border-cyan-400/50 bg-[#0d1a1c]/95 text-cyan-100' : 'border-white/10 bg-[#15110c]/95 text-[#d8ccb4]'">
          {{ picking ? tr("戻り先の箱を押す (Esc でやめる)", "Click the box to return to (Esc cancels)") : hand ? tr("手: 見るだけ (選択に戻すと組める)", "Hand: view only (switch to Select to edit)") : tr("縮めて見ている間は箱を押すとそこへ寄る (組むのは 75% 以上で)", "Zoomed out: click a box to jump to it (edit at 75%+)") }}
        </p>
        <!-- ルート精査の結果 (押した時だけ。ツリーの上に浮かべて、ツリーを押し下げない) -->
        <div v-if="issues && issuesOpen" data-tree-issues class="absolute left-3 z-20 flex max-h-[45%] w-[min(720px,calc(100%-24px))] flex-col gap-1 overflow-y-auto rounded-lg border px-2 py-1.5 text-[12px] shadow-[0_6px_20px_rgba(0,0,0,0.6)]"
          :class="[issues.length ? 'border-rose-500/40 bg-[#1c0f10]/95' : 'border-emerald-500/40 bg-[#0d1a12]/95', picking || hand || viewOnly ? 'top-12' : 'top-3']">
          <div class="flex items-center gap-2">
            <b :class="issues.length ? 'text-rose-200' : 'text-emerald-200'">{{ issues.length ? tr(`穴 ${issues.length} 件`, `${issues.length} issue(s)`) : tr("穴は見つからなかった (5 人で全部の枝を通した)", "No issues found (all branches walked by 5 runs)") }}</b>
            <button type="button" class="g-btn sm ml-auto" @click="issuesOpen = false">{{ tr("閉じる", "Close") }}</button>
          </div>
          <button v-for="(x, i) in issues" :key="i" type="button" data-tree-issue-row class="flex min-h-7 items-center gap-2 rounded px-1 text-left hover:bg-white/5" @click="goIssue(x.boxId)">
            <span class="shrink-0 rounded-sm bg-rose-600 px-1.5 text-[11px] font-bold text-white">!</span>
            <span class="max-w-[40%] shrink-0 truncate opacity-70" :title="boxName(x.boxId)">{{ boxName(x.boxId) }}</span>
            <span class="min-w-0 truncate" :title="x.text">{{ x.text }}</span>
          </button>
        </div>
        <TreeCanvasTools v-model:hand="hand" :boxes="boxes" :view="v.view.value" :zoom="zoom" @center="v.centerOn" @fit="v.fit" @zoom-in="v.zoomIn" @zoom-out="v.zoomOut" @reset="v.resetZoom" />
        </div>

        <!-- 右の欄 -->
        <aside v-if="panel && panelBox" data-tree-panel class="flex shrink-0 flex-col overflow-y-auto rounded-md bg-white/[0.04] p-3" :class="panel.kind === 'trial' || panel.kind === 'hand' ? 'w-[400px]' : 'w-[320px]'">
          <TreeHandShelf v-if="panel.kind === 'hand'" :key="`h-${panel.id}`" :box-id="panel.id" :current="panelBox.hand" @pick="pickHand" @clear="clearHandOf" @close="closeHand" />
          <TreeTrial v-else-if="panel.kind === 'trial'" :key="`t-${panel.id}`" :box-id="panel.id" @close="panel = null" @next="panel = { kind: 'hand', id: panel.id }" @note="panel = { kind: 'note', id: panel.id }" />
          <TreeNote v-else-if="panel.kind === 'note'" :key="`n-${panel.id}`" :box-id="panel.id" @close="panel = null" />
          <TreeModPick v-else :key="`m-${panel.id}-${panel.kind}`" :mode="panel.kind === 'fracture' ? 'fracture' : 'hit'" :current="panel.kind === 'fracture' ? doc.fracture : panelBox.aim" @pick="pickAim" @close="panel = null" />
        </aside>
      </div>
    </div>
    <!-- 欲しい MOD とメモの浮かぶ窓 (ページの中で一番上、ツリーを押しても閉じない) -->
    <TreeMemoFloat v-model:open="memoOpen" v-model:glow="glowAim" :avoid="panel ? `${panel.kind}:${panel.id}:${full}` : null" />
  </section>
</template>
