/**
 * overflow-guard.ts — 開発版だけ: 画面の横幅からはみ出した物を見つけて赤い枠と console.warn で知らせる (2026-10-13)
 *
 * スマホの Web 版は横を overflow-x: clip で切っているので、はみ出した所は黙って見切れる (要望 ea383d1e の発現の候補)。
 * オーナー「崩れない設計にするべき」→ 作っている時に気付けるように。横に送る箱 (overflow-x: auto など) の中は数えない。
 * window.__overflow() でも呼べる (確かめの時の一覧)
 */
const MARK = "data-overflow-guard";

function scrollerOf(e: Element): boolean {
  for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
    const x = getComputedStyle(p).overflowX;
    if ((x === "auto" || x === "scroll" || x === "hidden") && p.scrollWidth > p.clientWidth + 1) return true;
  }
  return false;
}

/** はみ出した物 (一番外側だけ) */
export function findOverflow(): Element[] {
  const w = document.documentElement.clientWidth;
  const out: Element[] = [];
  for (const e of document.querySelectorAll("#app *")) {
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height || (r.right <= w + 1 && r.left >= -1)) continue;
    const cs = getComputedStyle(e);
    if (cs.position === "fixed" && r.left >= w) continue; // 画面の外に置いた引き出し
    if (cs.pointerEvents === "none") continue; // 打った時の波紋・落ちる絵などの動き
    if (e.getAnimations().length) continue; // すべり込む行など、動きの途中
    if (out.some((o) => o.contains(e)) || scrollerOf(e)) continue;
    out.push(e);
  }
  return out;
}

function check(): void {
  document.querySelectorAll(`[${MARK}]`).forEach((e) => { e.removeAttribute(MARK); (e as HTMLElement).style.outline = ""; });
  const bad = findOverflow();
  for (const e of bad) {
    e.setAttribute(MARK, "");
    (e as HTMLElement).style.outline = "2px solid #f00";
  }
  if (bad.length) console.warn(`[overflow-guard] 画面の幅 ${document.documentElement.clientWidth}px からはみ出し ${bad.length} 件`, bad);
}

export function startOverflowGuard(): void {
  let t = 0;
  const later = (): void => { clearTimeout(t); t = window.setTimeout(check, 600); };
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener("resize", later);
  (window as unknown as { __overflow: () => Element[] }).__overflow = findOverflow;
  later();
}
