/**
 * use-fold-slide.ts — 同じ流れの列の札 (S-28h ③、スイッチ foldFracChaos) の引き戸 (11-20 オーナー「スライドドアみたいな挙動がいいなアニメーション畳むボタンと展開」)。
 * 開く: 札を開いて並べ直しが落ち着くまで畳んでいた箱を隠し、落ち着いたら札の場所から右へ自分の場所まで滑らせる。
 * 畳む: 箱を 1 本目の箱 (札になる箱) の場所へ滑らせてから札に戻す。
 * 滑るのは箱だけ (Vue Flow の箱の中身の translate)。線と手の札は動いている間は隠し、止まってから出す。動きを減らす設定ではそのまま開け閉めだけ。
 * 他の畳み (消去・✦ の枝・カオスの続き) は今までどおりすぐ開け閉め
 */
import { ref, type Ref } from "vue";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { stripChains, stripOpen, toggleStripFold } from "../../../services/simulator/tree/tree-strip-fold";

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
  return { css, toggle };
}
