/**
 * use-fold-slide.ts — 同じ流れの列の札 (S-28h ③、スイッチ foldFracChaos) の引き戸 (11-20 オーナー「スライドドアみたいな挙動がいいなアニメーション畳むボタンと展開」)。
 * 開く: 札を開いて並べ直しが落ち着くまで畳んでいた箱を隠し、落ち着いたら札の場所から右へ自分の場所まで滑らせる。
 * 畳む: 箱を 1 本目の箱 (札になる箱) の場所へ滑らせてから札に戻す。
 * 滑るのは箱だけ (Vue Flow の箱の中身の translate)。線と手の札は動いている間は隠し、止まってから出す。動きを減らす設定ではそのまま開け閉めだけ。
 * 他の畳み (消去・✦ の枝・カオスの続き) は今までどおりすぐ開け閉め
 */
import { ref, type Ref } from "vue";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { downStack, stripChains, stripOpen, toggleStripFold, type StripFold } from "../../../services/simulator/tree/tree-strip-fold";

/** 滑る時間 (ms) */
export const SLIDE_MS = 320;
const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));
const hideRule = (ids: readonly string[], lines: readonly string[]): string =>
  [...ids.map((id) => `.vue-flow__node[data-id="${id}"]`), ...lines.flatMap((id) => [`[data-tree-edge][data-edge-id="${id}"]`, `[data-hand-of="${id}"]`])].join(",") + "{opacity:0 !important}";

export function useFoldSlide(doc: Ref<TreeDoc>, root: () => HTMLElement | null) {
  /** 動いている間だけ隠す物の CSS (描き面の <style>) */
  const css = ref("");
  let busy = false;
  const inner = (id: string): HTMLElement | null => (root() ?? document).querySelector<HTMLElement>(`.vue-flow__node[data-id="${id}"]`)?.firstElementChild as HTMLElement | null;
  /** 並べ直しが落ち着くまで待つ (箱が全部描かれ、位置が 3 こま続けて同じ。長くても 40 こま) */
  async function settle(ids: readonly string[]): Promise<void> {
    let last = "", same = 0;
    for (let n = 0; n < 40 && same < 3; n++) {
      await frame();
      const now = ids.map((id) => `${doc.value.boxes[id]?.x},${inner(id) ? 1 : 0}`).join(";");
      same = now === last ? same + 1 : 0;
      last = now;
    }
  }
  async function toggle(head: string): Promise<void> {
    const f = stripChains(doc.value).get(head);
    const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (f && downStack(f) && !still && !busy) { busy = true; try { await slideDown(f); } finally { css.value = ""; busy = false; } return; }
    if (!f || f.kind !== "same" || still || busy) { if (!busy) toggleStripFold(head); return; }
    busy = true;
    // 線を隠すのは中の箱の線と、畳んだ列のほかの親の手の札 (札へ引いた線)
    const ids = f.mids, lines = [...ids, ...(f.cols ?? []).map((c) => doc.value.boxes[c]?.parent ?? "").filter(Boolean)];
    // (S-28h ④) 左の枠へ重ねる畳みは、左の枠から出て左の枠へ畳まれに行く (滑る箱は左の枠の後ろを通る)
    const base = f.keep ?? head, front = f.keep ? `.vue-flow__node[data-id="${f.keep}"]{z-index:3000 !important}` : "";
    try {
      if (!stripOpen.value.has(head)) {
        css.value = hideRule(ids, lines) + front;
        toggleStripFold(head);
        await settle(ids);
        const from = doc.value.boxes[base]!.x;
        css.value = hideRule([], lines) + front;
        const runs = ids.flatMap((id) => { const el = inner(id), b = doc.value.boxes[id]; return el && b ? [el.animate([{ translate: `${from - b.x}px 0`, opacity: 0.35 }, { translate: "0 0", opacity: 1 }], { duration: SLIDE_MS, easing: "cubic-bezier(.2,.8,.2,1)" })] : []; });
        await Promise.all(runs.map((a) => a.finished.catch(() => undefined)));
      } else {
        const to = doc.value.boxes[base]!.x;
        css.value = hideRule([], lines) + front;
        const runs = ids.flatMap((id) => { const el = inner(id), b = doc.value.boxes[id]; return el && b ? [el.animate([{ translate: "0 0", opacity: 1 }, { translate: `${to - b.x}px 0`, opacity: id === head && !f.keep ? 1 : 0.35 }], { duration: SLIDE_MS, easing: "cubic-bezier(.6,0,.8,.4)", fill: "forwards" })] : []; });
        await Promise.all(runs.map((a) => a.finished.catch(() => undefined)));
        toggleStripFold(head);
        await settle([base]);
        for (const a of runs) a.cancel();
      }
    } finally { css.value = ""; busy = false; }
  }
  /** 描いている箱全部の画面の場所 (箱の中身の要素の左上) と、木の 1 px が画面の何 px か */
  const rects = (): Map<string, { x: number; y: number; k: number }> => {
    const m = new Map<string, { x: number; y: number; k: number }>();
    for (const n of (root() ?? document).querySelectorAll<HTMLElement>(".vue-flow__node[data-id]")) {
      const el = n.firstElementChild as HTMLElement | null, r = el?.getBoundingClientRect();
      if (el && r && el.offsetWidth) m.set(n.dataset.id!, { x: r.left - (parseFloat(el.style.translate) || 0), y: r.top - (parseFloat(el.style.translate.split(" ")[1] ?? "") || 0), k: r.width / el.offsetWidth });
    }
    return m;
  };
  /**
   * 並べ直しが落ち着くまで、動いた箱を前の場所に留めて待つ (こまごとに translate で前の場所へ戻す = 途中の場所がちらつかない)。
   * 新しく出た箱は from (前の箱の前の場所) に留める。終わると留めた分を返す
   */
  async function hold(before: Map<string, { x: number; y: number; k: number }>, from: { x: number; y: number } | null, fresh: ReadonlySet<string>): Promise<Map<string, [number, number]>> {
    let last = "", same = 0, off = new Map<string, [number, number]>();
    for (let n = 0; n < 40 && same < 3; n++) {
      await frame();
      for (const [id] of off) { const el = inner(id); if (el) el.style.translate = ""; }
      const now = rects(), next = new Map<string, [number, number]>();
      for (const [id, q] of now) {
        const o = before.get(id) ?? (fresh.has(id) && from ? from : null);
        if (!o) continue;
        const dx = (o.x - q.x) / q.k, dy = (o.y - q.y) / q.k;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
        next.set(id, [dx, dy]);
        inner(id)!.style.translate = `${dx}px ${dy}px`;
      }
      off = next;
      const key = [...now].map(([id, q]) => `${id}:${Math.round(q.x)},${Math.round(q.y)}`).join(";") + [...next.keys()].join();
      same = key === last ? same + 1 : 0;
      last = key;
    }
    return off;
  }
  /** 留めた所から今の場所へ滑らせる (新しく出た箱は薄い所から) */
  async function release(off: Map<string, [number, number]>, fresh: ReadonlySet<string>, ease: string): Promise<void> {
    const runs = [...off].flatMap(([id, [dx, dy]]) => {
      const el = inner(id);
      if (!el) return [];
      el.style.translate = "";
      return [el.animate([{ translate: `${dx}px ${dy}px`, opacity: fresh.has(id) ? 0.35 : 1 }, { translate: "0 0", opacity: 1 }], { duration: SLIDE_MS, easing: ease })];
    });
    await Promise.all(runs.map((a) => a.finished.catch(() => undefined)));
  }
  /**
   * (S-28i) 消去・カオスの縦の重ねの引き戸 (11-21 オーナー「スライドで↓かなスライドしたらツリーもそれに合った形でズレる挙動になりそうだね」)。
   * 開く: 隠していた箱が前の箱の後ろから自分の場所まで下へ滑り出て、止まった箱とその下の木 (並べ直しで動いた箱全部) も前の場所から今の場所へ一緒に滑る。
   * 畳む: 箱が前の箱へ滑り込んでから重ねに戻し、動いた木が今の場所へ滑って戻る。滑っている間は線・手の札・重ねの印を隠す
   */
  async function slideDown(f: StripFold): Promise<void> {
    const keep = f.keep!, ids = f.mids.filter((id) => id !== keep), fresh = new Set(ids);
    const quiet = "[data-tree-edge],[data-hand-of],[data-tree-fold-stack],[data-tree-fold-stack-card],[data-tree-fold-stack-chip],[data-tree-strip-refold],[data-tree-pass-next]{opacity:0 !important}";
    const front = `.vue-flow__node[data-id="${keep}"]{z-index:3000 !important}`;
    css.value = quiet + front;
    const before = rects(), from = before.get(keep) ?? null;
    if (!stripOpen.value.has(f.head)) {
      toggleStripFold(f.head);
      await release(await hold(before, from, fresh), fresh, "cubic-bezier(.2,.8,.2,1)");
      return;
    }
    // 畳む: 先に中の箱を前の箱へ滑り込ませる
    const ins = ids.flatMap((id) => { const el = inner(id), q = before.get(id); return el && q && from ? [el.animate([{ translate: "0 0", opacity: 1 }, { translate: `${(from.x - q.x) / q.k}px ${(from.y - q.y) / q.k}px`, opacity: 0.35 }], { duration: SLIDE_MS, easing: "cubic-bezier(.6,0,.8,.4)", fill: "forwards" })] : []; });
    await Promise.all(ins.map((a) => a.finished.catch(() => undefined)));
    const mid = rects();
    for (const id of ids) mid.delete(id);
    toggleStripFold(f.head);
    const off = await hold(mid, null, new Set());
    for (const a of ins) a.cancel();
    await release(off, new Set(), "cubic-bezier(.2,.8,.2,1)");
  }
  return { css, toggle };
}
