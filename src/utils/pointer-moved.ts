/**
 * pointer-moved.ts — マウスが実際に動いて乗った時だけ動かす (2026-10-24 モンキー初めての人の回: マウスは止まったまま、下の画面が動いて
 * 札・ベースが来ただけで説明のカードが開き、筋力・器用の札や棚の右半分を隠した。兜を押した後の送り・＋ で開いた窓)。
 * 見分け方: マウスで乗った時は、入った位置 (mouseenter の座標) が最後の mousemove の位置と違う (入りは移動より先に来る)。
 * 画面が動いて下に来ただけの時は、マウスは最後に動いた位置のまま。その時は、その位置から実際に動く (座標が変わる mousemove) まで待つ
 * (前は「直前 150ms に動いたか」で見ていて、＋ を押す前の動きを数えて窓の札で開いていた。10-24 隊長の本物のマウスで 6/6)。
 * 返す関数で取り消す (待っている間に離れた時)。棚の札 (ShelfButton)・ベースのカード (BaseCardGrid) の説明のカードで使う
 */
let lastX = Number.NaN;
let lastY = Number.NaN;
if (typeof window !== "undefined") window.addEventListener("mousemove", (e) => { lastX = e.clientX; lastY = e.clientY; }, { capture: true, passive: true });

export function afterPointerMoves(e: MouseEvent, run: () => void): () => void {
  const x = e.clientX, y = e.clientY;
  if (x !== lastX || y !== lastY) { run(); return () => undefined; }
  const go = (m: MouseEvent): void => {
    if (m.clientX === x && m.clientY === y) return;
    window.removeEventListener("mousemove", go, true);
    run();
  };
  window.addEventListener("mousemove", go, { capture: true, passive: true });
  return () => window.removeEventListener("mousemove", go, true);
}
