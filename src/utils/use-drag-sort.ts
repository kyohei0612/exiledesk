/**
 * use-drag-sort.ts — 行をつかんで持ち上げ、好きな所に置いて並べ替える (2026-10-19 オーナー「4 だけど矢印のテキストじゃなくて UX ベースで、持ってよいしょって感じで入れ替えたい」)。
 * マウスは行のどこをつかんでもよい (ボタン・入力欄は除く)。指は [data-drag-handle] (左端のつまみ) からだけ (行全体を指でつかむと、ページを縦に送れなくなる)。
 * 動かしている間: つかんだ行は指・マウスに付いて浮き、通り過ぎた行は 1 段ずれて空きを作る。離したら onMove(from, to)。Esc でやめる
 */
import { ref } from "vue";

type Drag = { from: number; to: number; dy: number; h: number };

export function useDragSort(opts: { rows: () => HTMLElement[]; onMove: (from: number, to: number) => void; enabled: () => boolean }) {
  const drag = ref<Drag | null>(null);
  function start(e: PointerEvent, from: number): void {
    if (!opts.enabled() || e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest("button, input, select, a, label")) return;
    if (e.pointerType !== "mouse" && !t.closest("[data-drag-handle]")) return;
    const rows = opts.rows();
    const rects = rows.map((r) => r.getBoundingClientRect());
    const me = rects[from];
    if (!me) return;
    e.preventDefault();
    const y0 = e.clientY;
    const mids = rects.map((r) => r.top + r.height / 2);
    drag.value = { from, to: from, dy: 0, h: me.height };
    const move = (ev: PointerEvent): void => {
      const d = drag.value;
      if (!d) return;
      d.dy = ev.clientY - y0;
      // つかんだ行の真ん中が、ほかの行の真ん中を越えたら入れ替わる
      const c = mids[from]! + d.dy;
      let to = from;
      for (let j = from + 1; j < mids.length && c > mids[j]!; j++) to = j;
      for (let j = from - 1; j >= 0 && c < mids[j]!; j--) to = j;
      d.to = to;
    };
    const end = (commit: boolean): void => {
      const d = drag.value;
      drag.value = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      if (commit && d && d.to !== d.from) opts.onMove(d.from, d.to);
    };
    const up = (): void => end(true);
    const cancel = (): void => end(false);
    const key = (ev: KeyboardEvent): void => { if (ev.key === "Escape") end(false); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
  }
  /** 行の見た目 (つかんだ行は浮いて付いてくる、ほかは空きを作るように 1 段ずれる) */
  function styleOf(i: number): Record<string, string> {
    const d = drag.value;
    if (!d) return {};
    if (i === d.from) return { transform: `translateY(${d.dy}px) scale(1.01)`, position: "relative", zIndex: "5", background: "rgba(201,162,90,0.16)", boxShadow: "0 8px 22px rgba(0,0,0,0.65)", cursor: "grabbing" };
    const shift = d.from < d.to && i > d.from && i <= d.to ? -d.h : d.to < d.from && i >= d.to && i < d.from ? d.h : 0;
    return { transform: `translateY(${shift}px)`, transition: "transform 150ms ease" };
  }
  /** 動かしている間の、その行の今の番号 (0 から。置いたらこの番号になる) */
  function posOf(i: number): number {
    const d = drag.value;
    if (!d) return i;
    if (i === d.from) return d.to;
    return d.from < d.to && i > d.from && i <= d.to ? i - 1 : d.to < d.from && i >= d.to && i < d.from ? i + 1 : i;
  }
  return { drag, start, styleOf, posOf };
}
