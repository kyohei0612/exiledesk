/**
 * daily-plate.ts — 題の札 (title-c.webp、660×164) を字の長さに合わせる (11-05 オーナー「UI崩れてる…拡大縮小とかでいたいめみるぞ」)。
 * 字は絵の金の板 (x 218〜446・縦の中心 0.713) の中に置く。字が板より長い時は札を縦横同じ比率で大きくし、
 * 枠の幅 (h2 の幅) を超えるなら字を小さくする (12px まで)。それでも入らなければ板の幅で折り返す。
 * 基の高さと字の大きさは CSS の --plate-h・--plate-fs-base (幅ごと)。絵を伸ばさないので飾りの形は崩れない
 */
import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";

const IMG_W = 660, IMG_H = 164;
/** 金の板の中で字を置ける幅 (絵の画素) */
const INNER = 228;
/** 板の縁と字の間 (px) */
const PAD = 8;
const MIN_FS = 12;

export function usePlateFit(box: Ref<HTMLElement | null>, text: Ref<HTMLElement | null>) {
  const style = ref<Record<string, string>>({});
  /** 札の絵をやめて伸びる帯にしている (とても狭い時) */
  const band = ref(false);
  let ro: ResizeObserver | null = null;
  let mo: MutationObserver | null = null;
  function fit(): void {
    const h = box.value, t = text.value;
    if (!h || !t) return;
    const cs = getComputedStyle(h);
    const baseH = parseFloat(cs.getPropertyValue("--plate-h")) || 118;
    const baseFs = parseFloat(cs.getPropertyValue("--plate-fs-base")) || 25;
    // 字の素の幅 (基の字の大きさ・折り返し無し) は写しで測る
    const m = t.cloneNode(true) as HTMLElement;
    m.removeAttribute("style");
    Object.assign(m.style, { position: "absolute", visibility: "hidden", whiteSpace: "nowrap", fontSize: `${baseFs}px`, maxWidth: "none", width: "max-content", transform: "none", left: "0", top: "0" });
    h.appendChild(m);
    // offsetWidth = 画面の高さ合わせの縮小 (zoom) の掛かる前の幅 (clientWidth と同じ物差し)
    const tw = m.offsetWidth;
    m.remove();
    const s0 = baseH / IMG_H;
    const sMax = h.clientWidth / IMG_W;
    const s = Math.max(0.1, Math.min(sMax, Math.max(s0, (tw + PAD * 2) / INNER)));
    const room = INNER * s - PAD * 2;
    const fs = Math.max(MIN_FS, Math.min(baseFs, (baseFs * room) / tw));
    // 板に字が入らないほど狭い (字の幅か、板の高さ 42 画素が字より低い) 時は札の絵をやめ、伸びる帯 (title-m) に字を折り返して置く
    if ((tw * fs) / baseFs > room + PAD || 42 * s < fs * 1.1) { style.value = { "--plate-fs": `${Math.max(MIN_FS, Math.min(baseFs, 16)).toFixed(2)}px` }; band.value = true; return; }
    band.value = false;
    // 折り返しの幅は測った幅より少し広く (小数点の差で 1 行が 2 行に折れた。板の縁までは PAD のゆとりがある)
    style.value = { "--plate-s": s.toFixed(4), "--plate-fs": `${fs.toFixed(2)}px`, "--plate-max": `${Math.max(0, room + PAD).toFixed(1)}px` };
  }
  onMounted(() => {
    fit();
    ro = new ResizeObserver(() => fit());
    if (box.value) ro.observe(box.value);
    // 言葉を切り替えた時 (字が変わる)
    mo = new MutationObserver(() => fit());
    if (text.value) mo.observe(text.value, { characterData: true, childList: true, subtree: true });
    void document.fonts?.ready.then(() => fit());
  });
  onBeforeUnmount(() => { ro?.disconnect(); mo?.disconnect(); });
  return { style, band };
}
