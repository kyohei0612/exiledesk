/**
 * turn-page.ts — 「横向きで表示」(U-53d、スイッチ phonePcView、2026-11-17): 端末は縦のまま (向きのロックが入ったままでも)、頁の中身を 90 度回して横画面の形で描く。
 * 頁の幅 (viewport 1280) はそのままなので、幅の判定 (usePhone・CSS の境) は PC のまま。body を「幅 1280 × 横画面の高さ」の箱にし、
 * 右へ 90 度回して画面いっぱいに伸ばす。スマホを左へ倒して持てば横画面に見える。
 * 高さで木や窓の大きさを決める所 (innerHeight) が回した箱の高さを読むよう、回している間だけ innerHeight を箱の高さに見せる。
 * 弱い所: 要素の位置 (getBoundingClientRect) は回った画面の座標で返るので、木を指で動かす向きが 90 度ずれる・位置から大きさを決める所は少しずれる。select などブラウザの窓は回らない。
 */
import { ref } from "vue";

/** 今回している */
export const turned = ref(false);

let saved: { body: string; app: string; html: string } | null = null;
/** 本物の innerHeight (window か、その上の型に付いている) */
const ownH = Object.getOwnPropertyDescriptor(window, "innerHeight");
const realGet = ((): (() => number) | null => {
  for (let o: object | null = window; o; o = Object.getPrototypeOf(o)) {
    const d = Object.getOwnPropertyDescriptor(o, "innerHeight");
    if (d?.get) return d.get as () => number;
    if (d && "value" in d) return null;
  }
  return null;
})();
const readRealH = (): number => (realGet ? realGet.call(window) : (ownH?.value as number | undefined) ?? document.documentElement.clientHeight);
let busy = false;

/** 箱の高さ (頁の CSS px)。幅 1280 の横画面 = 1280 × 1280 / 縦の高さ */
const boxH = (): number => (window.innerWidth * window.innerWidth) / Math.max(1, readRealH());

function lay(): void {
  const b = document.body, app = document.getElementById("app");
  const z = parseFloat(document.documentElement.style.zoom) || 1;
  const W = window.innerWidth, H = readRealH();
  const wu = W / z, hu = boxH() / z;
  // Web 版の min-height: 100% (style.css) を外さないと箱の高さが効かない
  b.style.cssText = `${saved?.body ?? ""};position:fixed;left:0;top:0;margin:0;width:${wu}px;height:${hu}px;min-height:0;max-height:${hu}px;overflow:hidden;transform-origin:0 0;transform:translateX(${wu}px) rotate(90deg) scale(${H / W})`;
  if (app) app.style.cssText = `${saved?.app ?? ""};height:100%;min-height:0;overflow:auto;overscroll-behavior:contain`;
}

/** 回す / やめる。替えた後に resize を出して、幅・高さで決める所 (WebApp の fitZoom・木の高さ) を測り直させる */
export function setTurned(on: boolean): void {
  if (on === turned.value || busy) return;
  busy = true;
  try {
    const html = document.documentElement, app = document.getElementById("app");
    if (on) {
      saved = { body: document.body.style.cssText, app: app?.style.cssText ?? "", html: html.style.overflow };
      Object.defineProperty(window, "innerHeight", { configurable: true, get: boxH });
      html.style.overflow = "hidden";
      turned.value = true;
      window.dispatchEvent(new Event("resize"));
      lay();
      window.addEventListener("resize", onResize);
    } else {
      window.removeEventListener("resize", onResize);
      if (ownH) Object.defineProperty(window, "innerHeight", ownH); else delete (window as { innerHeight?: number }).innerHeight;
      document.body.style.cssText = saved?.body ?? "";
      if (app) app.style.cssText = saved?.app ?? "";
      html.style.overflow = saved?.html ?? "";
      saved = null;
      turned.value = false;
      window.dispatchEvent(new Event("resize"));
    }
  } finally { busy = false; }
}

/** 回している間にアドレス帯などで高さが変わったら、箱を引き直す */
function onResize(): void { if (turned.value && !busy) lay(); }
