/**
 * use-tree-flow.ts — ツリーの見え方を Vue Flow の上で (2026-10-22 オーナー「Vue Flow を入れて、拡大縮小は中身を読んで合わせる」)。
 * 前の use-tree-view.ts (自前のスクロールと scale) と同じ形で外へ出す: 倍率 zoom・見るだけ viewOnly・全体 fit・等倍 resetZoom・
 * 寄る reveal・画面の点 → ツリーの座標 toWorld・全画面 full。
 *
 * ページの CSS zoom (WebApp.vue の fitZoom、Z = 0.85〜1.6) との合わせ方: ツリーの枠だけ zoom 1/Z を掛けて打ち消す (SimTreePage の枠)。
 * 枠の中は実質 1 倍なので、Vue Flow の座標 (clientX − getBoundingClientRect、d3-zoom の transform) がマウスと揃う。
 * そのままだと箱が 1/Z に小さく見えるので、Vue Flow の倍率は Z 倍で持つ: 画面の「100%」= Vue Flow の zoom Z。
 * (Vue Flow 1.48.2 の pointer() と getEventPosition() を読んで確かめた: 枠の BCR とマウスの clientX はどちらも拡大後のピクセル)
 */
import { computed, ref, watch, type Ref } from "vue";
import { useVueFlow } from "@vue-flow/core";
import { BOX_H, BOX_W, boundsOf, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { pageZoom } from "../../../utils/zoom";

export const FLOW_ID = "sim-tree";
export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 1.6;
const STEP = 1.2;
/** これ未満は箱の中の物を押させず、箱を押すと等倍の編集のポップアップ (ボタンが 24px の 3/4 = 18px を切る。10-22 オーナー「75% 未満の見るだけをやめる」) */
export const VIEW_ONLY = 0.75;

export function useTreeFlow(doc: Ref<TreeDoc>) {
  const f = useVueFlow(FLOW_ID);
  /** ページの zoom (枠で打ち消す量)。画面の幅が変わると WebApp.vue が掛け直すので、その後で読み直す */
  const pageZ = ref(pageZoom());
  /** 画面の倍率 (前と同じ 100% = 箱が拡大前の CSS ピクセルどおり) */
  const zoom = computed(() => f.viewport.value.zoom / pageZ.value);
  const viewOnly = computed(() => zoom.value < VIEW_ONLY - 1e-6);
  const minZoom = computed(() => ZOOM_MIN * pageZ.value);
  const maxZoom = computed(() => ZOOM_MAX * pageZ.value);
  const full = ref(false);
  const bounds = computed(() => boundsOf(doc.value));
  const clamp = (z: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));

  /** 倍率を変える (画面の真ん中を軸に) */
  async function setZoom(z: number): Promise<void> { await f.zoomTo(clamp(z) * pageZ.value); }
  const zoomIn = (): Promise<void> => setZoom(zoom.value * STEP);
  const zoomOut = (): Promise<void> => setZoom(zoom.value / STEP);
  /**
   * 全体に合わせる (大きくはしない)。右下に浮かぶ道具とミニマップ (TreeCanvasTools、幅 RIGHT_ROOM) の所を空けて収める
   * (Vue Flow の fitView は浮かぶ物を知らず、右下の箱がミニマップの下に隠れた。10-22 手元で見た)
   */
  async function fit(): Promise<void> {
    const b = bounds.value, w = f.dimensions.value.width, h = f.dimensions.value.height;
    if (!w || !h) return;
    const PAD = 28, RIGHT_ROOM = 250;
    const room = w - RIGHT_ROOM - PAD * 2 > b.w * minZoom.value ? RIGHT_ROOM : 0;
    const z = Math.min(pageZ.value, Math.max(minZoom.value, Math.min((w - room - PAD * 2) / b.w, (h - PAD * 2) / b.h)));
    await f.setViewport({ x: (w - room) / 2 - (b.x + b.w / 2) * z, y: Math.max(PAD, h / 2 - (b.y + b.h / 2) * z), zoom: z });
  }
  /** 始まりの箱を上の真ん中へ、等倍で (開いた時と、一望から等倍に戻した時。真ん中を軸にすると枝の間の空き所に出た、10-22) */
  async function goHome(): Promise<void> {
    const st = doc.value.boxes.start;
    if (!st) return;
    const z = pageZ.value, w = f.dimensions.value.width;
    await f.setViewport({ x: w / 2 - (st.x + BOX_W / 2) * z, y: 40 - st.y * z, zoom: z });
  }
  /** 等倍に戻す。一望 (VIEW_ONLY 未満) からは始まりへ、75% 以上の時は今見ている真ん中を軸に */
  async function resetZoom(): Promise<void> {
    if (viewOnly.value) await goHome(); else await setZoom(1);
  }
  /** 画面の点 (マウスの clientX / clientY) → ツリーの座標 (箱の x・y と同じ) */
  const toWorld = (clientX: number, clientY: number): { x: number; y: number } => f.screenToFlowCoordinate({ x: clientX, y: clientY });
  /** 箱を見える所へ (center = 真ん中へ。そうでなければ外れている時だけ) */
  async function reveal(id: string, center = false): Promise<void> {
    const b = doc.value.boxes[id];
    if (!b) return;
    const { x, y, zoom: z } = f.viewport.value, w = f.dimensions.value.width, h = f.dimensions.value.height, m = 24;
    const sx = b.x * z + x, sy = b.y * z + y, sw = BOX_W * z, sh = BOX_H * z;
    const out = sx < m || sy < m || sx + sw > w - m || sy + sh > h - m;
    if (center || out) await f.setCenter(b.x + BOX_W / 2, b.y + BOX_H / 2, { zoom: z });
  }
  async function toggleFull(): Promise<void> { full.value = !full.value; }
  /** 今見ている所 (ツリーの座標。ミニマップの枠) */
  const view = computed(() => {
    const { x, y, zoom: z } = f.viewport.value;
    return { x: -x / z, y: -y / z, w: f.dimensions.value.width / z, h: f.dimensions.value.height / z };
  });
  /** ミニマップで押した所 (ツリーの座標) を真ん中へ */
  const centerOn = (wx: number, wy: number): Promise<void> => f.setCenter(wx, wy, { zoom: f.viewport.value.zoom }).then(() => {});

  // 画面の幅が変わってページの zoom が変わったら、見た目の倍率をそのまま保つ
  const onResize = (): void => {
    requestAnimationFrame(() => {
      const z = pageZoom();
      if (Math.abs(z - pageZ.value) < 1e-4) return;
      const keep = zoom.value;
      pageZ.value = z;
      void f.zoomTo(clamp(keep) * z);
    });
  };
  window.addEventListener("resize", onResize);
  f.onPaneReady(() => { void goHome(); });
  // 右の欄を開いた時など、枠の幅が変わっても見ている真ん中は動かさない (Vue Flow は左上を軸にするので、何もしなければ左上が残る)
  watch(() => f.dimensions.value.width, (w, old) => {
    if (!old || !w) return;
    const vp = f.viewport.value;
    void f.setViewport({ x: vp.x + (w - old) / 2, y: vp.y, zoom: vp.zoom });
  });

  return { flow: f, pageZ, zoom, viewOnly, minZoom, maxZoom, full, bounds, view, setZoom, zoomIn, zoomOut, fit, goHome, resetZoom, toWorld, reveal, toggleFull, centerOn, dispose: () => window.removeEventListener("resize", onResize) };
}
