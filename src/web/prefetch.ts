/**
 * prefetch.ts — 後から読む部品の塊を、画面が落ち着いて手が空いた時に先に読んでおく (2026-10-23 オーナー「シミュは開いてから読み込みじゃなくて、裏で読み込んでおいて」)。
 * 読み込み (load) の 3 秒後の requestIdleCallback (無ければその時) に 1 回だけ。通信が弱い時 (saveData・2g / slow-2g) はしない。失敗は黙る (開いた時にもう一度読む)
 *   prefetchWhenIdle(() => import("../views/…/Page.vue"))   ← defineAsyncComponent と同じ import を渡すと同じ塊が温まる
 */
type Conn = { saveData?: boolean; effectiveType?: string };
type IdleWin = { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void };

export function prefetchWhenIdle(load: () => Promise<unknown>): void {
  if (typeof window === "undefined") return;
  const c = (navigator as { connection?: Conn }).connection;
  if (c?.saveData || /2g$/.test(c?.effectiveType ?? "")) return;
  const run = (): void => { void load().catch(() => undefined); };
  // load の直後の手の空きは、画面の相場・データの読み込みの最中にも来る (開発版で 0.3 秒で取りに行っていた)。3 秒待ってから手の空きを待つ
  const go = (): void => {
    setTimeout(() => {
      const idle = (window as IdleWin).requestIdleCallback;
      if (idle) idle(run, { timeout: 5000 });
      else run();
    }, 3000);
  };
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go, { once: true });
}
