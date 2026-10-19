import { nextTick } from "vue";
import { pageZoom, toCss } from "./zoom";

/**
 * スクロールまわりの共通の部品 (2026-10-10 オーナー「全体コード整理、スクロール周り余分な奴とか重複」で 1 か所に):
 *   - scrollBoxOf: 送っている枠を探す
 *   - keepPlace / keepTopOf: 中身が伸び縮みしても、押した物を画面の同じ高さに残す (一気に戻す = 見た目は動かない)
 *   - scrollToTop / glideBy: 見える所へ送る時は、いつも同じ速さでぬるっと (ブラウザ任せの smooth と混ぜない)
 */

/** el を送っている枠 (overflow が auto / scroll で、中身があふれている一番近い親)。無ければ null = ページ全体 (スマホ) */
export function scrollBoxOf(el: Element): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/** el の画面の高さを before に戻す (枠ごとに一気に。見た目は動かない) */
export function keepTopOf(el: Element, before: number): void {
  if (!el.isConnected) return;
  // 位置の差は画面の座標 (拡大率込み)、スクロール量は CSS の px なので換算する (2026-10-10 点検: 拡大率の分だけ行き過ぎていた)
  const d = toCss(el.getBoundingClientRect().top - before);
  if (Math.abs(d) > 1) (scrollBoxOf(el) ?? window).scrollBy({ top: d, behavior: "instant" as ScrollBehavior });
}

/**
 * 押した物を画面の同じ高さに残したまま中身を変える (2026-10-09 オーナー「スマホ版は上に戻らないといけない仕組みは用意しないで、
 * MOD とか選んで設定が戻って上にとかだるい」)。上の方が伸び縮みしても、押した行が画面の外へ流れない。
 * iOS Safari は CSS の scroll anchoring (overflow-anchor) が無いので手で直す。PC は画面の中の枠、スマホはページを送る
 */
export function keepPlace(el: Element | null | undefined, change: () => void): void {
  const before = el?.getBoundingClientRect().top;
  change();
  if (before == null || !el) return;
  void nextTick(() => keepTopOf(el, before));
}

/**
 * 物を見える所へ送る。スマホは上に貼るアイテムの帯 (StageItemMini) の下に出す
 * (2026-10-09 エミュレーターの「狙う」: scrollIntoView だと見出しと狙いの札が帯の裏に隠れた)。
 * 「見える所へ送る」はみなこれで。pcBlock = PC の時の位置 (発現の欄は真ん中)。behavior "auto" は一気に、それ以外は glideBy でぬるっと
 */
export function scrollToTop(el: Element | null | undefined, behavior: ScrollBehavior = "smooth", pcBlock: ScrollLogicalPosition = "start"): void {
  if (!el) return;
  const box = scrollBoxOf(el);
  const r = el.getBoundingClientRect();
  const view = box ? box.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  const bar = window.innerWidth < 768 ? (document.querySelector("[data-item-mini]") as HTMLElement | null)?.offsetHeight ?? 0 : 0;
  // 固定の見出し (scroll-mt-*) の分は下げる (MOD 一覧の目次で飛ぶと、節の見出しが固定の目次の裏に隠れていた。2026-10-10 点検)
  const mt = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  const top = view.top + bar + 8 + mt;
  let d: number;
  if (window.innerWidth < 768 || pcBlock === "start") d = r.top - top;
  else if (pcBlock === "center") d = r.top + r.height / 2 - (view.top + view.bottom) / 2;
  else if (pcBlock === "end") d = r.bottom - view.bottom + 8;
  else d = r.top < top ? r.top - top : r.bottom > view.bottom ? r.bottom - view.bottom + 8 : 0; // nearest
  if (behavior === "auto" || behavior === "instant") { if (Math.abs(d) > 1) (box ?? window).scrollBy({ top: toCss(d), behavior: "instant" as ScrollBehavior }); return; }
  void glideBy(box, d);
}

/**
 * 物を画面の真ん中へ送る (スマホも。上に貼るアイテムの帯と下に貼る帯 [data-bottom-bar] の間の真ん中)。
 * 2026-10-16 オーナー「確率機ボタン押したら、その位置を画面の真ん中に。今は目の前がカレンシー」
 */
export function centerOnScreen(el: Element | null | undefined, again = true): void {
  if (!el) return;
  const box = scrollBoxOf(el);
  const r = el.getBoundingClientRect();
  const view = box ? box.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  const phone = window.innerWidth < 768;
  const top = view.top + (phone ? (document.querySelector("[data-item-mini]") as HTMLElement | null)?.offsetHeight ?? 0 : 0);
  const bottom = Math.min(view.bottom, ...[...document.querySelectorAll<HTMLElement>("[data-bottom-bar]")].map((b) => b.getBoundingClientRect().top));
  // 入り切らない時は頭を上に揃える
  const d = r.height > bottom - top - 16 ? r.top - top - 8 : r.top + r.height / 2 - (top + bottom) / 2;
  // スマホの上のアイテムの帯は送った後で出てくる (一番上にいる間は無い) ので、送り終わったらもう一度測って直す
  // (途中で別の送りに替わった時は直さない)
  const p = glideBy(box, d), mine = gliding;
  void p.then(() => { if (again && Math.abs(d) > 1 && mine === gliding) centerOnScreen(el, false); });
}

/**
 * 送りが要る時だけ、短く減速で滑らせる (2026-10-10 オーナー「ぱっと移動させるんじゃなくて高速でスライド」「やるのは全部じゃなくスクロールが必要な時だけ」)。
 * ブラウザの smooth は遅くて途中で他の送りと重なるとカクつくので、自前で 1 本の rAF。動きを減らす設定の時は一気に
 */
let gliding = 0;
/** 送り終わったら解ける (途中で別の送りに替わった時も解ける)。d は画面の座標の差 (拡大率込み)、中で CSS の px に換算する */
export function glideBy(box: HTMLElement | null, dScreen: number, ms = 260): Promise<void> {
  return glideCss(box, toCss(dScreen), ms);
}
/**
 * el の位置の差 (getBoundingClientRect の単位) だけ送る。スクロール量との比をその場で測ってから 1 回で滑らせる
 * (拡大率の掛かった画面では、位置の差とスクロール量の単位の関係がブラウザで違う: 1920 幅 (拡大 1.16) の Chrome で toCss の換算だと足りず、
 * 途中で止まってから残りを送る 2 段の動きになっていた。2026-10-14 オーナー「いっかいたたむのまえでとまって」)。測る時の送り戻しは同じコマの中なので見えない
 */
export function glideRect(box: HTMLElement | null, el: Element, dRect: number, ms = 260): Promise<void> {
  const getY = (): number => (box ? box.scrollTop : window.scrollY);
  const setY = (y: number): void => { if (box) box.scrollTop = y; else window.scrollTo(0, y); };
  const y = getY(), t = el.getBoundingClientRect().top;
  const probe = dRect > 0 ? 40 : -40;
  setY(y + probe);
  const moved = getY() - y, shifted = t - el.getBoundingClientRect().top;
  setY(y);
  // 動けなかった時 (端) は今まで通りの換算
  const k = moved !== 0 && shifted !== 0 ? shifted / moved : pageZoom();
  return glideCss(box, dRect / k, ms);
}
function glideCss(box: HTMLElement | null, d: number, ms: number): Promise<void> {
  if (Math.abs(d) < 1) return Promise.resolve();
  const getY = (): number => (box ? box.scrollTop : window.scrollY);
  const setY = (y: number): void => { if (box) box.scrollTop = y; else window.scrollTo(0, y); };
  if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) { setY(getY() + d); return Promise.resolve(); }
  return new Promise((done) => {
  const run = ++gliding;
  // 数え始めは最初のコマ (重い描画の直後は最初のコマが遅れ、決めた時から数えると 1 コマ目で大きく飛んでカクついた。2026-10-10 オーナー「時折カクつく、ぬるっと」)。
  // 動き出しと止まり際をゆっくり (ease-in-out)
  let t0 = 0, y0 = 0;
  const ease = (k: number): number => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
  const step = (t: number): void => {
    if (run !== gliding) { done(); return; }
    if (!t0) { t0 = t; y0 = getY(); }
    const k = Math.min(1, (t - t0) / ms);
    setY(y0 + d * ease(k));
    if (k < 1) requestAnimationFrame(step); else done();
  };
  requestAnimationFrame(step);
  });
}

/**
 * 段が進んだ時の送り: el (次に決める段の枠) の下の線 + pad が画面に入るまでぬるっと送る。枠が画面より高ければ枠の上で止める。見えていれば動かさない
 * (2026-10-18 オーナー「番号が進む時もスクロールで次工程表示は必ず」「下枠 + 24px が基準」。ベースの一覧の「もっと見る」と同じ 24px)
 */
/**
 * 画面の上に貼り付いている物の下端 (スマホのアイテムの要約 [data-item-mini]。窓の中を送る時は 0)。
 * 送って上で止める時は、この下で止める (2026-10-19 段の表を開いた時、止めた行の頭が要約に隠れていた)
 */
function topInset(box: HTMLElement | null): number {
  if (box) return 0;
  const mini = [...document.querySelectorAll("[data-item-mini]")].find((e) => e.getClientRects().length);
  return mini ? Math.max(0, mini.getBoundingClientRect().bottom) : 0;
}
export function revealBottom(el: Element, pad = 24): void {
  const box = scrollBoxOf(el as HTMLElement);
  const r = el.getBoundingClientRect();
  const viewTop = (box ? box.getBoundingClientRect().top : 0) + topInset(box), viewH = (box ? box.clientHeight : window.innerHeight) - topInset(box);
  const d = Math.min(r.bottom + pad - (viewTop + viewH), r.top - viewTop - 8);
  if (d > 0) void glideRect(box, el, d, 320);
}
/**
 * 次に押す所へ送る (上にも戻る版の revealBottom)。el が画面より上にあれば上の線 - 8px まで戻し、下にあれば下の線 + pad まで送る。見えていれば動かさない
 * (2026-10-19 オーナー「スマホのスパムシミュレーター、次入力するとこまで自動スクロールじゃないためややこしい」)
 */
/**
 * 段の表を開いた時: 描き直しの後に、行と表の全体が見える所まで送る (revealNext。見えていれば動かさない)
 * (2026-10-19 オーナー「全システム共通、ティア開いたらティアも全体表示させてくれ。付けた後のティア仕舞いは今と一緒」)。
 * MOD 一覧・狙う MOD を選ぶ窓・フラクチャーの選びで同じ物を使う
 */
/**
 * 後から出る枠 (後から読む画面の中など) を、出るまで待ってから下の線 + 24px まで送る (最大 3 秒)。見えている物だけを見る
 * (2026-10-19: シミュレーターを後から読む形にしたので、ベースを選んだ・「この状態からシミュレーター」の直後はまだ 2 の枠が無い)
 */
export function revealWhenReady(selector: string, ms = 3000, at: "bottom" | "top" = "bottom"): void {
  const t0 = Date.now();
  const tryReveal = (): void => {
    const el = [...document.querySelectorAll<HTMLElement>(selector)].find((e) => e.getClientRects().length);
    // top = 枠の頭を画面の上に (「この状態からシミュレーター」は 2 の頭 = MOD と付け方を決める所から見せる。2026-10-19 オーナー)
    if (el) { requestAnimationFrame(() => (at === "top" ? scrollToTop(el) : revealBottom(el))); return; }
    if (Date.now() - t0 < ms) setTimeout(tryReveal, 60);
  };
  tryReveal();
}
export function revealOpened(el: Element | null | undefined): void {
  if (!el) return;
  requestAnimationFrame(() => requestAnimationFrame(() => revealNext(el)));
}
export function revealNext(el: Element | null | undefined, pad = 24): void {
  if (!el) return;
  // 中だけ送る箱 (シミュレーターの 2 の MOD 一覧は高さ 62vh の箱) の中にある時は、箱の中を送ってから外側 (ページ) も送る
  // (2026-10-19 PC で段の表を開いた時: 箱の中は送れていたが、箱の下の端が画面の外で表が見えなかった)
  const box = scrollBoxOf(el as HTMLElement);
  const outer = box ? scrollBoxOf(box.parentElement as HTMLElement) : null;
  const thenOuter = (): void => { const d = deltaIn(el, box ? outer : null, pad); if (d) void glideRect(box ? outer : null, el, d, 320); };
  if (!box) { thenOuter(); return; }
  const d = deltaIn(el, box, pad);
  if (d) void glideRect(box, el, d, 320).then(thenOuter); else thenOuter();
}
/** その箱 (null = ページ) の中で el を見せる送りの量。上にはみ出していれば負 (上の線 - 8px まで戻す)、下なら正 (下の線 + pad)、見えていれば 0 */
function deltaIn(el: Element, box: HTMLElement | null, pad: number): number {
  const r = el.getBoundingClientRect();
  const top = (box ? box.getBoundingClientRect().top + stickyHead(box) : 0) + topInset(box);
  const bottom = box ? box.getBoundingClientRect().top + box.clientHeight : window.innerHeight;
  if (r.top < top + 8) return r.top - top - 8;
  const d = Math.min(r.bottom + pad - bottom, r.top - top - 8);
  return d > 0 ? d : 0;
}
/** 箱のすぐ中で上に貼り付く見出しの高さ (その下で止める) */
function stickyHead(box: HTMLElement): number {
  const h = [...box.children].find((c) => getComputedStyle(c).position === "sticky" && c.getClientRects().length);
  return h ? h.getBoundingClientRect().height : 0;
}
