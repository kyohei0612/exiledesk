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

/**
 * ランダム操作の確かめ (開発版だけ、2026-10-13 オーナー「いろんな使い方して試しまくって」)。
 * window.__monkey(手数, 乱数の種) で、棚から持って使う・ボタンを押す・Esc・Ctrl+Z・送りを混ぜて回し、
 * はみ出し・console.error・NaN / undefined・残った #・日本語の画面の英語の MOD を拾って返す。
 * 取引所・要望・使い方・支援・記録のボタンは押さない (外に出る・送る物)
 */
export interface MonkeyFound { kind: string; detail: string; act: string; w: number; lang: string }
const errs: string[] = [];
let hooked = false;
function hookErrors(): void {
  if (hooked) return;
  hooked = true;
  const ce = console.error.bind(console);
  console.error = (...a: unknown[]) => { errs.push(a.map(String).join(" ").slice(0, 200)); ce(...a); };
  addEventListener("error", (e) => errs.push(`uncaught: ${(e.message || "").slice(0, 200)}`));
  addEventListener("unhandledrejection", (e) => errs.push(`rejection: ${String(e.reason).slice(0, 200)}`));
}
const SKIP = /要望|Feedback|使い方|How to use|取引所|trade|支援|Support|記録|logging|更新|取得|Refresh|ログイン|Log ?in/i;
const HAS_JA = /[ぁ-んァ-ヶ一-龠]/;
/** root: 押す範囲 (アプリはクラフトステージの中だけ = "[data-stage-root]"。他の画面は取引所・poe.ninja を取りに行くので押さない) */
export async function monkey(steps = 150, seed = 1, root = "#app"): Promise<MonkeyFound[]> {
  hookErrors();
  errs.length = 0;
  let s = seed >>> 0;
  const rnd = (): number => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)]!;
  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const found: MonkeyFound[] = [];
  const seen = new Set<string>();
  const note = (kind: string, detail: string, act: string): void => {
    if (seen.has(`${kind}|${detail}`)) return;
    seen.add(`${kind}|${detail}`);
    found.push({ kind, detail, act, w: innerWidth, lang: document.documentElement.lang });
  };
  const visible = (e: Element): boolean => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
  const check = (act: string): void => {
    for (const e of findOverflow()) note("はみ出し", `${e.tagName}.${String((e as HTMLElement).className).slice(0, 60)} 「${(e.textContent ?? "").trim().slice(0, 30)}」`, act);
    for (const m of errs.splice(0)) note("エラー", m, act);
    // 浮いている窓 (持っている物のお告げ・エッセンスの段など) が 2 つ同時に出ていたら重なり
    const pops = [...document.querySelectorAll(".held-anchor")].filter(visible);
    if (pops.length > 1) note("重なり", pops.map((e) => String((e as HTMLElement).className)).join(" / "), act);
    const txt = (document.querySelector("#app") as HTMLElement | null)?.innerText ?? "";
    for (const bad of [/NaN/, /undefined/, /\[object/, /null%/, /Infinity/]) { const m = txt.match(new RegExp(`.{0,20}${bad.source}.{0,20}`)); if (m) note("変な字", m[0].replace(/\n/g, " "), act); }
    const hash = txt.match(/[^\s(]{0,12}#[%\s]{0,2}[^\s]{0,12}/);
    if (hash && !/#\d|C#|#share/.test(hash[0])) note("# が残る", hash[0], act);
    if (document.documentElement.lang === "ja") {
      const en = [...document.querySelectorAll<HTMLElement>("#app .text-rarity-magic, #app [class*=text-mod], #app [data-item-mini] p")].filter(visible).map((e) => e.innerText)
        .find((t) => /\b(to|increased|Adds|maximum|Damage)\b/.test(t) && !HAS_JA.test(t));
      if (en) note("日本語の画面に英語", en.slice(0, 60), act);
    }
  };
  const useBtn = (): HTMLButtonElement | undefined => [...document.querySelectorAll<HTMLButtonElement>("button")].find((x) => x.textContent?.trim() === "使う" || x.textContent?.trim() === "Use");
  for (let i = 0; i < steps; i++) {
    const r = rnd();
    let act = "";
    try {
      if (r < 0.06) { (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); act = "Esc"; }
      else if (r < 0.1) { (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true })); act = "Ctrl+Z"; }
      else if (r < 0.14) { scrollTo(0, rnd() * document.documentElement.scrollHeight); act = "送り"; }
      else if (r < 0.5) {
        const shelf = [...document.querySelectorAll<HTMLElement>(`${root} [data-rec^='shelf:']`)].filter(visible);
        if (shelf.length) {
          const b = pick(shelf); b.click(); act = b.dataset.rec ?? ""; await wait(150);
          const u = useBtn();
          if (u && !u.disabled) { u.click(); act += " → 使う"; } else { (document.querySelector("#app [data-stage-card]") as HTMLElement | null)?.click(); act += " → カード"; }
        }
      } else if (r < 0.56) {
        const rv = [...document.querySelectorAll<HTMLElement>(`${root} [data-rec^='reveal:']`)].filter(visible);
        if (rv.length) { const b = pick(rv); b.click(); act = b.dataset.rec ?? ""; }
      } else {
        const c = [...document.querySelectorAll<HTMLElement>(`${root} button:not([disabled]), ${root} [role=tab], ${root} input[type=checkbox], ${root} summary`)].filter(visible).filter((b) => !SKIP.test(b.textContent ?? "") && !b.closest("a[target=_blank]"));
        if (c.length) { const b = pick(c); act = `押す「${(b.textContent || b.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 24)}」`; b.click(); }
      }
    } catch (e) { note("例外", String(e).slice(0, 200), act); }
    await wait(220);
    check(act);
  }
  return found;
}
/** 長く回す時: 結果は window.__monkeyResult に (道具の待ち時間に収まらないので) */
function monkeyBg(plan: Array<[label: string, steps: number, seed: number, lang?: "ja" | "en"]>, root = "#app"): void {
  const out = { done: false, runs: [] as Array<{ label: string; found: MonkeyFound[] }> };
  (window as unknown as { __monkeyResult: typeof out }).__monkeyResult = out;
  void (async () => {
    for (const [label, steps, seed, lang] of plan) {
      if (lang) { [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === (lang === "ja" ? "日本語" : "EN"))?.click(); await new Promise((r) => setTimeout(r, 800)); }
      out.runs.push({ label, found: await monkey(steps, seed, root) });
    }
    out.done = true;
  })();
}
Object.assign(window, { __monkey: monkey, __monkeyBg: monkeyBg });
