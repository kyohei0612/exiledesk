/**
 * prefetch.ts — 後から読む部品の塊を、画面が落ち着いて手が空いた時に先に読んでおく (2026-10-23 オーナー「シミュは開いてから読み込みじゃなくて、裏で読み込んでおいて」)。
 * 読み込み (load) の後の requestIdleCallback (無ければ 2 秒後) に 1 回だけ。通信が弱い時 (saveData・2g / slow-2g) はしない。失敗は黙る (開いた時にもう一度読む)
 *   prefetchWhenIdle(() => import("../views/…/Page.vue"))   ← defineAsyncComponent と同じ import を渡すと同じ塊が温まる
 */
type Conn = { saveData?: boolean; effectiveType?: string };
type IdleWin = { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void };

export function prefetchWhenIdle(load: () => Promise<unknown>): void {
  if (typeof window === "undefined") return;
  const c = (navigator as { connection?: Conn }).connection;
  if (c?.saveData || /2g$/.test(c?.effectiveType ?? "")) return;
  const run = (): void => { void load().catch(() => undefined); };
  const go = (): void => {
    const idle = (window as IdleWin).requestIdleCallback;
    if (idle) idle(run, { timeout: 5000 });
    else setTimeout(run, 2000);
  };
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go, { once: true });
}
