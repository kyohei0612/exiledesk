/**
 * use-tree-view.ts — ツリーの見え方 (2026-10-22): 原点・広さ・拡大縮小・空き所のドラッグ・箱を見える所へ送る・全画面。
 * 拡大縮小 (オーナー 10-22): Ctrl + ホイール = マウスの位置を中心に (ツリーの上ではブラウザの拡大を止める)。Ctrl なしのホイールはスクロールのまま。
 * ＋ / − / 全体に合わせる のボタン。押しにくくなる倍率 (VIEW_ONLY 未満) では箱のボタンを出さず、押すとその箱へ寄る (一望の代わり)
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue";
import { BOX_W, boundsOf, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { toCss } from "../../../utils/zoom";

const PAD = 80;
export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 1.6;
const STEP = 1.2;
/** これ未満は見るだけ (ボタンが 24px の 3/4 = 18px を切る) */
export const VIEW_ONLY = 0.75;

export function useTreeView(doc: Ref<TreeDoc>, panelOpen: () => boolean) {
  const viewport = ref<HTMLElement | null>(null);
  const vpSize = ref({ w: 1000, h: 600 });
  const zoom = ref(1);
  const full = ref(false);
  const bounds = computed(() => boundsOf(doc.value));
  /** 始まりの箱 (x = 0) を真ん中に置く原点。右の欄を開いても動かさない (欄が閉じている時だけ測る) */
  const home = ref(400);
  function measure(): void {
    const el = viewport.value;
    if (!el) return;
    vpSize.value = { w: el.clientWidth, h: el.clientHeight };
    if (!panelOpen()) home.value = Math.max(PAD, Math.round(el.clientWidth / 2 - BOX_W / 2));
  }
  // 原点は決まった所 (箱を動かしても他の箱は動かない)。左・上へはみ出した時だけ広げる
  const ox = computed(() => Math.max(home.value, PAD - bounds.value.x));
  const oy = computed(() => Math.max(PAD, PAD - bounds.value.y));
  /** 中身の広さ (倍率を掛ける前)。縮めた時も枠いっぱいに空き所が残るよう、枠 ÷ 倍率 より小さくしない */
  const content = computed(() => ({ w: ox.value + bounds.value.x + bounds.value.w + PAD + 120, h: oy.value + bounds.value.y + bounds.value.h + PAD + 60 }));
  const area = computed(() => ({ w: Math.max(content.value.w, vpSize.value.w / zoom.value), h: Math.max(content.value.h, vpSize.value.h / zoom.value) }));
  const viewOnly = computed(() => zoom.value < VIEW_ONLY);

  /** 倍率を変える。(cx, cy) = 枠の中のこの点を動かさない (無ければ真ん中) */
  async function setZoom(z: number, cx?: number, cy?: number): Promise<void> {
    const el = viewport.value;
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
    if (!el || next === zoom.value) { zoom.value = next; return; }
    const px = cx ?? el.clientWidth / 2, py = cy ?? el.clientHeight / 2;
    const wx = (el.scrollLeft + px) / zoom.value, wy = (el.scrollTop + py) / zoom.value;
    zoom.value = next;
    await nextTick();
    el.scrollTo({ left: wx * next - px, top: wy * next - py });
  }
  const zoomIn = (): Promise<void> => setZoom(zoom.value * STEP);
  const zoomOut = (): Promise<void> => setZoom(zoom.value / STEP);
  /** 全体に合わせる (大きくはしない) */
  async function fit(): Promise<void> {
    const z = Math.min(1, (vpSize.value.w - 16) / content.value.w, (vpSize.value.h - 16) / content.value.h);
    await setZoom(z);
    viewport.value?.scrollTo({ left: 0, top: 0 });
  }
  function onWheel(e: WheelEvent): void {
    if (!e.ctrlKey && !e.metaKey) return; // Ctrl なしはスクロールのまま
    e.preventDefault(); // ブラウザの拡大を止める
    const r = viewport.value!.getBoundingClientRect();
    void setZoom(zoom.value * (e.deltaY < 0 ? STEP : 1 / STEP), toCss(e.clientX - r.left), toCss(e.clientY - r.top));
  }

  /**
   * 画面の点 → ツリーの座標 (箱の x・y と同じ)。マウスの座標と getBoundingClientRect は html の zoom (WebApp.vue の fitZoom) が掛かった
   * 実ピクセル、スクロールと箱の位置は拡大前の CSS ピクセルなので、差を toCss で割る (10-22、割らないと 1920 幅でマウスより 1.16 倍ずれた)
   */
  function toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const el = viewport.value!, r = el.getBoundingClientRect();
    return { x: (toCss(clientX - r.left) + el.scrollLeft) / zoom.value - ox.value, y: (toCss(clientY - r.top) + el.scrollTop) / zoom.value - oy.value };
  }
  /** 箱を見える所へ送る。ツリーの枠の中だけ (scrollIntoView はページごと送って題が隠れる) */
  function reveal(id: string, center = false): void {
    void nextTick(() => {
      const el = viewport.value, b = el?.querySelector<HTMLElement>(`[data-box-id="${id}"]`);
      if (!el || !b) return;
      const v = el.getBoundingClientRect(), r = b.getBoundingClientRect(), m = 24;
      const dx = center ? r.left + r.width / 2 - (v.left + v.width / 2) : r.left < v.left + m ? r.left - v.left - m : r.right > v.right - m ? r.right - v.right + m : 0;
      const dy = center ? r.top + r.height / 2 - (v.top + v.height / 2) : r.top < v.top + m ? r.top - v.top - m : r.bottom > v.bottom - m ? r.bottom - v.bottom + m : 0;
      el.scrollBy({ left: toCss(dx), top: toCss(dy) });
    });
  }
  /**
   * 等倍に戻す。一望 (VIEW_ONLY 未満) からは始まりの箱を上の真ん中に置く (真ん中を軸にすると枝と枝の間の空き所に出て、
   * どこを見ているか分からなかった。10-22)。75% 以上の時は今見ている真ん中を軸に
   */
  async function resetZoom(): Promise<void> {
    const el = viewport.value;
    if (!el || zoom.value >= VIEW_ONLY) { await setZoom(1); return; }
    zoom.value = 1;
    await nextTick();
    measure();
    goHome();
  }
  /** 始まりの箱を上の真ん中へ (開いた時と、一望から等倍に戻した時。左の枝が長いと始まりが右端で切れて出た) */
  function goHome(): void {
    const el = viewport.value, st = doc.value.boxes.start;
    if (el && st) el.scrollTo({ left: (ox.value + st.x + BOX_W / 2) * zoom.value - el.clientWidth / 2, top: Math.max(0, (oy.value + st.y) * zoom.value - 40) });
  }
  /** 縮めて見ている時に箱を押した = 等倍にしてその箱を真ん中へ */
  async function focusBox(id: string): Promise<void> {
    zoom.value = 1;
    await nextTick();
    measure();
    reveal(id, true);
  }
  async function toggleFull(): Promise<void> {
    full.value = !full.value;
    await nextTick();
    measure();
  }

  const ro = new ResizeObserver(measure);
  watch(viewport, (el, old) => {
    old?.removeEventListener("wheel", onWheel);
    el?.addEventListener("wheel", onWheel, { passive: false });
  });
  onMounted(() => { if (viewport.value) ro.observe(viewport.value); measure(); void nextTick(goHome); });
  onBeforeUnmount(() => { viewport.value?.removeEventListener("wheel", onWheel); ro.disconnect(); });

  return { viewport, zoom, full, bounds, ox, oy, area, viewOnly, measure, setZoom, resetZoom, zoomIn, zoomOut, fit, toWorld, reveal, focusBox, toggleFull };
}
