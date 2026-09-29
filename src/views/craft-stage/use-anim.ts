/**
 * use-anim.ts — 動画用の画面の「登場の動き」の共通の決まり (2026-09-29、POE2Tube 要望 ⑰「動きの共通の決まり」)
 *
 *   - URL の `&play=1` で登場の動きを再生。無ければ最後の止め絵 (今の静止画の撮影はそのまま)
 *   - 動きの長さは画面ごとに固定で `document.body.dataset.animMs` に書き、終わったら `data-anim-done="1"`
 *     (POE2Tube は Playwright の動画録画でその長さだけ撮る)
 *   - `&reveal=1` = 答えを隠した状態から答えが出る動き (hide が true → 途中で false)。各画面の「隠す」指定 (`&hl=0` 等) と組にして使う
 *   - 同じ URL なら毎回同じ動き (時間だけで決まり、乱数を使わない)
 * 使い方: const a = useAnim(1800); a.t (0 → 1 の進み)、a.playing、a.reveal (答えを出してよいか)。
 */
import { onBeforeUnmount, onMounted, ref } from "vue";

export const animFlags = (): { play: boolean; reveal: boolean } => {
  const q = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
  return { play: q.get("play") === "1", reveal: q.get("reveal") === "1" };
};

export function useAnim(ms: number, o: { revealAt?: number } = {}) {
  const f = animFlags();
  /** 0 → 1 の進み (止め絵は 1) */
  const t = ref(f.play ? 0 : 1);
  const playing = ref(f.play);
  /** 答えを出してよいか (reveal=1 で動かす時は revealAt の割合まで隠す) */
  const shown = ref(!(f.play && f.reveal));
  let raf = 0;
  let start = 0;
  function frame(now: number): void {
    if (!start) start = now;
    const p = Math.min(1, (now - start) / ms);
    t.value = p;
    if (!shown.value && p >= (o.revealAt ?? 0.5)) shown.value = true;
    if (p < 1) raf = requestAnimationFrame(frame);
    else {
      playing.value = false;
      document.body.dataset.animDone = "1";
    }
  }
  onMounted(() => {
    document.body.dataset.animMs = String(f.play ? ms : 0);
    document.body.dataset.animDone = f.play ? "0" : "1";
    if (f.play) raf = requestAnimationFrame(frame);
  });
  onBeforeUnmount(() => cancelAnimationFrame(raf));
  return { t, playing, shown, play: f.play, reveal: f.reveal };
}

/** 0 → 1 を滑らかに (ease-out) */
export const easeOut = (x: number): number => 1 - (1 - x) ** 3;
/** 区間 [a, b] の中の進み (0〜1) */
export const seg = (t: number, a: number, b: number): number => Math.max(0, Math.min(1, (t - a) / (b - a)));
