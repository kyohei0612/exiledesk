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
import { bandsOf } from "../../../services/simulator/tree/tree-layout";
import { pageZoom } from "../../../utils/zoom";

export const FLOW_ID = "sim-tree";
/**
 * 倍率は決まった段だけ (10-22 オーナー: 自由な値だと 76% で札がくっついて重なった)。ホイール・＋−・全体表示・幅が変わった時もこの段に吸い付く。
 * 75% は縮めたまま組める一番下の段 (VIEW_ONLY)、それ未満は見るだけ。20% は見本の木にプレフィックスをつないで 25% でも収まらなくなった分 (10-22)
 */
const ZOOM_LEVELS = [0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5] as const;
const ZOOM_MIN = ZOOM_LEVELS[0];
const ZOOM_MAX = ZOOM_LEVELS[ZOOM_LEVELS.length - 1]!;
/** 一番近い段 */
const snapZoom = (z: number): number => ZOOM_LEVELS.reduce((a, l) => (Math.abs(l - z) < Math.abs(a - z) ? l : a), ZOOM_LEVELS[0]);
/** ホイールの量をためてから 1 段動かす (マウスの 1 目盛り ≒ 100、タッチパッドは細かく来る) */
const WHEEL_STEP = 60;
/** これ未満は箱の中の物を押させず、箱を押すと等倍の編集のポップアップ (ボタンが 24px の 3/4 = 18px を切る。10-22 オーナー「75% 未満の見るだけをやめる」) */
const VIEW_ONLY = 0.75;
/** スマホの全体表示の一番小さい段 */
const PHONE_MIN = 0.5;
/** 開いた時の一番小さい段 (これ未満でしか収まらない木は、この段で始まりの箱を上の真ん中) */
const OPEN_MIN = 0.5;
/** 全体に合わせる時の余白の下限 */
const PAD_MIN = 12;
/** 右下に浮かぶ道具とミニマップ (TreeCanvasTools) の幅・高さ (ページの CSS ピクセル) */
const RIGHT_ROOM = 250, TOOLS_H = 200;

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

  /** 倍率を変える (段に吸い付く。at = 軸にする画面の点 (clientX / clientY)、無ければ画面の真ん中) */
  async function setZoom(z: number, at?: { x: number; y: number }): Promise<void> {
    const to = snapZoom(z) * pageZ.value, vp = f.viewport.value;
    if (!at) { await f.zoomTo(to); return; }
    // 軸の点の下のツリーの座標が、倍率を変えた後も同じ画面の点に来るように
    const w = f.screenToFlowCoordinate(at);
    await f.setViewport({ x: w.x * vp.zoom + vp.x - w.x * to, y: w.y * vp.zoom + vp.y - w.y * to, zoom: to });
  }
  /** 今より 1 段上 / 下 (段の間にいる時は近い側の次) */
  const stepZoom = (dir: 1 | -1, at?: { x: number; y: number }): Promise<void> => {
    const z = zoom.value, next = dir > 0 ? ZOOM_LEVELS.find((l) => l > z + 1e-3) : [...ZOOM_LEVELS].reverse().find((l) => l < z - 1e-3);
    return setZoom(next ?? (dir > 0 ? ZOOM_MAX : ZOOM_MIN), at);
  };
  const zoomIn = (): Promise<void> => stepZoom(1);
  const zoomOut = (): Promise<void> => stepZoom(-1);
  /** ホイール (タッチパッドのピンチ = ctrl + ホイールも) はマウスの所を軸に 1 段ずつ。Vue Flow のホイールの拡大縮小は切ってある (SimTreePage) */
  let wheelAcc = 0, wheelT = 0;
  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    clearTimeout(wheelT);
    wheelT = window.setTimeout(() => { wheelAcc = 0; }, 200);
    wheelAcc += e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1);
    if (Math.abs(wheelAcc) < WHEEL_STEP) return;
    const dir = wheelAcc < 0 ? 1 : -1;
    wheelAcc = 0;
    void stepZoom(dir, { x: e.clientX, y: e.clientY });
  }
  /**
   * 全体に合わせる (大きくはしない。収まる一番大きい段)。右下に浮かぶ道具とミニマップ (TreeCanvasTools、幅 RIGHT_ROOM) の所を空けて収める
   * (Vue Flow の fitView は浮かぶ物を知らず、右下の箱がミニマップの下に隠れた。10-22 手元で見た)
   */
  /** 一番上の箱を置く高さ (0 完成形の設定は枠の左上の札、10-23。スマホは札 (高さ約 110px) の下へ) */
  const topY = (): number => (innerWidth < 768 ? 130 : 40);
  /**
   * 全体に収まる一番大きい段 lv と、左 left・右下 room に空ける幅。top = 上寄せの時 (上は topY、下は余白だけ)
   */
  function fitPlan(top: boolean): { lv: number; left: number; room: number } | null {
    const b = bounds.value, w = f.dimensions.value.width, h = f.dimensions.value.height;
    if (!w || !h) return null;
    const availH = top ? h - topY() - PAD_MIN : h - PAD_MIN * 2;
    // 木の左の外の段の目印 (TreeBandLayer、画面の上で約 110px × ページの zoom) の分も左を空ける (1280 で目印が枠の外に切れた、10-22)
    const left = bandsOf(doc.value).length ? Math.round(110 * pageZ.value) : 0;
    /** 幅 avail に収まる一番大きい段 (段を選ぶ時は余白を PAD_MIN まで詰めてよい) */
    const level = (avail: number): number => {
      const fz = Math.min((avail - PAD_MIN * 2) / b.w, availH / b.h) / pageZ.value;
      return [...ZOOM_LEVELS].reverse().find((l) => l <= Math.min(1, fz) + 1e-6) ?? ZOOM_MIN;
    };
    // 右下を空けると段が下がる時は空けない (見本の木は 1920 幅で空けると 25%、空けなければ 33%)
    const room = level(w - left - RIGHT_ROOM) >= level(w - left) ? RIGHT_ROOM : 0;
    return { lv: level(w - left - room), left, room };
  }
  /** 始まりの箱を上の真ん中へ、段 lv で */
  async function startTop(lv: number): Promise<void> {
    const st = doc.value.boxes.start;
    if (!st) return;
    const z = lv * pageZ.value, w = f.dimensions.value.width;
    await f.setViewport({ x: w / 2 - (st.x + BOX_W / 2) * z, y: topY() - st.y * z, zoom: z });
  }
  /** whole = スマホでも 50% の下限を使わず木の全体 (回すの 1 人目が歩く時。光る枠を画面の外へ出さない) */
  async function fit(whole = false): Promise<void> {
    const p = fitPlan(false);
    if (!p) return;
    const b = bounds.value, w = f.dimensions.value.width, h = f.dimensions.value.height, PAD = 28;
    // スマホ (768px 未満) は 50% より小さくしない (20% で箱の字が読めなかった、10-22)。収まらない時は始まりの箱を上の真ん中に
    if (!whole && innerWidth < 768 && p.lv < PHONE_MIN && doc.value.boxes.start) { await startTop(PHONE_MIN); return; }
    const z = p.lv * pageZ.value;
    // 縦は真ん中、上は PAD まで。PAD だと下が切れる時は下を PAD_MIN に (段は PAD_MIN の余白で選ぶので、下の箱が 2px 枠の外に出た、10-25)
    const y = Math.max(h / 2 - (b.y + b.h / 2) * z, Math.min(PAD - b.y * z, h - PAD_MIN - (b.y + b.h) * z));
    await f.setViewport({ x: p.left + (w - p.left - p.room) / 2 - (b.x + b.w / 2) * z, y, zoom: z });
  }
  /**
   * 開いた時の見え方 (10-25 オーナー「任せる」、23 本目の決め): 木全体が収まる段 (100% まで) で上寄せ。
   * 50% 未満でしか収まらない時は 50% で始まりの箱を上の真ん中 (前は 100% で始まりを上の真ん中にしていて、木の下が枠の外にあった)
   */
  async function openView(): Promise<void> {
    const p = fitPlan(true);
    if (!p) { await goHome(); return; }
    if (p.lv < OPEN_MIN) { await startTop(OPEN_MIN); return; }
    const b = bounds.value, w = f.dimensions.value.width, h = f.dimensions.value.height, z = p.lv * pageZ.value;
    // 右下の道具に掛からない木は枠の真ん中に (上寄せの小さい木が道具の分だけ左へ寄った、10-25)
    const mid = p.left + (w - p.left) / 2, Z = pageZ.value;
    const clear = mid + (b.w * z) / 2 < w - RIGHT_ROOM * Z || topY() + b.h * z < h - TOOLS_H * Z;
    const cx = clear ? mid : p.left + (w - p.left - p.room) / 2;
    await f.setViewport({ x: cx - (b.x + b.w / 2) * z, y: topY() - b.y * z, zoom: z });
  }
  /** 始まりの箱を上の真ん中へ、等倍で (一望から等倍に戻した時。真ん中を軸にすると枝の間の空き所に出た、10-22) */
  const goHome = (): Promise<void> => startTop(1);
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
  /** 箱の枠の上の位置 (ページの CSS ピクセル = 実ピクセル ÷ ページの zoom。ポップアップ・ホバーのカードの置き場)。W・H = 枠の大きさ */
  function rectOf(b: { x: number; y: number }, w = BOX_W, h = BOX_H): { left: number; top: number; right: number; bottom: number; W: number; H: number } {
    const { x, y, zoom: z } = f.viewport.value, Z = pageZ.value;
    return { left: (b.x * z + x) / Z, top: (b.y * z + y) / Z, right: ((b.x + w) * z + x) / Z, bottom: ((b.y + h) * z + y) / Z, W: f.dimensions.value.width / Z, H: f.dimensions.value.height / Z };
  }
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
      void f.zoomTo(snapZoom(keep) * z);
    });
  };
  window.addEventListener("resize", onResize);
  f.onPaneReady(() => { void openView(); });
  // 右の欄を開いた時など、枠の幅が変わっても見ている真ん中は動かさない (Vue Flow は左上を軸にするので、何もしなければ左上が残る)
  watch(() => f.dimensions.value.width, (w, old) => {
    if (!old || !w) return;
    const vp = f.viewport.value;
    void f.setViewport({ x: vp.x + (w - old) / 2, y: vp.y, zoom: vp.zoom });
  });

  return { flow: f, pageZ, zoom, viewOnly, minZoom, maxZoom, full, bounds, view, setZoom, zoomIn, zoomOut, onWheel, fit, openView, goHome, resetZoom, toWorld, reveal, toggleFull, centerOn, rectOf, dispose: () => window.removeEventListener("resize", onResize) };
}
