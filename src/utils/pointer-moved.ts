/**
 * pointer-moved.ts — マウスが実際に動いた時だけ動かす (2026-10-24 モンキー初めての人の回: マウスは止まったまま、下の画面が動いて
 * 札・ベースが来ただけで説明のカードが開き、筋力・器用の札や棚の右半分を隠した。兜を押した後の送り・＋ で開いた窓)。
 * mouseenter は画面が動いて下に来ただけでも来るが、mousemove はマウスを動かした時だけ。直前 (150ms) に動いていなければ、次に動くまで待つ。
 * 返す関数で取り消す (待っている間に離れた時)。棚の札 (ShelfButton)・ベースのカード (BaseCardGrid) の説明のカードで使う
 */
let lastMove = 0;
if (typeof window !== "undefined") window.addEventListener("mousemove", () => { lastMove = performance.now(); }, { capture: true, passive: true });

export function afterPointerMoves(run: () => void): () => void {
  if (performance.now() - lastMove < 150) { run(); return () => undefined; }
  const go = (): void => { window.removeEventListener("mousemove", go, true); run(); };
  window.addEventListener("mousemove", go, { capture: true, passive: true });
  return () => window.removeEventListener("mousemove", go, true);
}
