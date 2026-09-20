/**
 * usePlaceholderStep.ts — 灰色で出している既定値から数字を動かす (2026-09-20)
 *
 * オーナー指示:「デフォルトで収支の売値入れてくれてるじゃん。こういう灰色だけど計算に
 * 入ってるみたいな表記で数字動かすと 0 から始まるから、例えば 12.5 とかで灰色なら
 * 上は次 13、14、15 と 1 ずつ、下は 12、11、10 みたいな挙動して欲しいな」。
 *
 * 収支の単価・売値・使った数・売れた数は、空欄なら灰色の既定値 (相場 / 期待値) が
 * **そのまま計算に入っている**。なのに欄自体は空なので、矢印やスピナーを押すと
 * ブラウザは 0 から数え始めて 1 になっていた (実測: 灰色 37 の欄が 1 になった)。
 *
 * 押した時は灰色の値から動かす。12.5 なら 上 → 13・14・15 / 下 → 12・11・10。
 *
 * ## 上下の動かし方は 2 通りある
 * 1. **矢印キー** … keydown を横取りして自分で動かす (既定の動きは止める)。
 * 2. **右端のスピナー** … クリックを捕まえる口が無いので input イベントで見分ける。
 *    文字を打つと `beforeinput` が飛んでから `input` が飛ぶが、スピナーは
 *    `beforeinput` を飛ばさず `input` だけ飛ばす。これで見分ける。
 *    将来 `beforeinput` が両方で飛ぶようになっても「打った」と見なすだけで壊れない。
 */

/** 灰色の値から 1 つ動かした数 */
export function stepFrom(placeholder: number | null | undefined, dir: 1 | -1): number {
  if (placeholder == null || !Number.isFinite(placeholder)) return dir > 0 ? 1 : 0;
  // 12.5 から上は 13 (= floor + 1)、下は 12 (= ceil − 1)。整数 12 なら 13 / 11
  const next = dir > 0 ? Math.floor(placeholder) + 1 : Math.ceil(placeholder) - 1;
  return Math.max(0, next);
}

export interface PlaceholderStep {
  /** 入力欄の @beforeinput に繋ぐ */
  onBeforeInput: () => void;
  /**
   * 入力欄の @keydown に繋ぐ。上下キーを自分で処理する。
   * @param current 今の値 (空欄なら null)
   * @param placeholder 灰色に出している値
   * @param apply 新しい値を入れる
   * @returns 処理したか (上下キー以外なら false で、呼ぶ側は何もしない)
   */
  onKeydown: (ev: KeyboardEvent, current: number | null, placeholder: number | null | undefined, apply: (v: number) => void) => boolean;
  /**
   * 入力欄の @input の先頭で呼ぶ。
   * @param ev        その input イベント
   * @param wasEmpty  押す前が空欄 (= 灰色を使っていた) か
   * @param placeholder 灰色に出している値
   * @returns 矢印 / スピナーで動かした時の新しい値。打ち込みなら undefined (呼ぶ側が今まで通り処理する)
   */
  stepValue: (ev: Event, wasEmpty: boolean, placeholder: number | null | undefined) => number | undefined;
}

export function usePlaceholderStep(): PlaceholderStep {
  let typed = false;
  return {
    onBeforeInput: () => {
      typed = true;
    },
    onKeydown: (ev, current, placeholder, apply) => {
      const dir = ev.key === "ArrowUp" ? 1 : ev.key === "ArrowDown" ? -1 : 0;
      if (dir === 0) return false;
      // 既定の動き (空欄を 0 と見なして数え直す) は止めて、自分で動かす
      ev.preventDefault();
      apply(current == null ? stepFrom(placeholder, dir as 1 | -1) : Math.max(0, current + dir));
      return true;
    },
    stepValue: (ev, wasEmpty, placeholder) => {
      const wasTyped = typed;
      typed = false;
      if (wasTyped || !wasEmpty) return undefined;
      const raw = (ev.target as HTMLInputElement).value;
      if (raw === "") return undefined;
      const n = Number(raw);
      if (!Number.isFinite(n)) return undefined;
      // 空欄から動かした時にブラウザが入れる値は 上 = step (1) / 下 = min (0)。向きだけ読む
      return stepFrom(placeholder, n > 0 ? 1 : -1);
    },
  };
}
