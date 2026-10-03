/**
 * anim-clock.ts — 動画モードの手つきを「時刻を指定して、その瞬間の絵で止める」ための仮の時計 (2026-10-04、POE2Tube 要望 ㉖)
 *
 * POE2Tube は手つきを Playwright の録画で撮っていたが、録画がコマを落とす (動く 2 コマ → 止まる 4 コマを繰り返す) ので
 * スロー・カクつきに見えた。URL の `&anim_t=<ミリ秒>` で、手つき (と付いた後の演出) を始まりからその時刻まで進めた絵で止める。
 * POE2Tube は 1000/24 ミリ秒ずつ時刻を変えて 1 枚ずつスクリーンショットを撮る (録画をやめる)。
 *
 * 作り: このページの時計を全部この時計に差し替える (撮影用に開いたページだけ。手で使う画面では入れない)
 *   - setTimeout / setInterval / requestAnimationFrame / performance.now / Date.now
 *   - CSS のアニメーション・トランジション (Web Animations API): 生まれた仮の時刻を覚えて止め、
 *     時計が進むたびに `currentTime = 今 − 生まれた時刻` にそろえる (途中で次の動きが始まっても、その時の位置から動く)
 * 時計は待ち合わせの時刻を順にたどって一気に進める (実際には待たない)。同じ URL なら毎回同じ絵。
 */

type Timer = { id: number; at: number; fn: (...a: unknown[]) => void; args: unknown[]; every: number | null; raf: boolean };

/** 手つきの時刻の情報 (POE2Tube が読む)。`window.__stageAnim` */
export interface StageAnimInfo {
  /** 止めた時刻 (ミリ秒、手つきの始まりから) */
  t: number;
  /** 付いた瞬間 (アイテムの手が進んだ時刻)。まだなら null */
  attach_ms: number | null;
  /** 手つきと付いた後の演出が全部終わる時刻 (`anim_t=end` の時だけ。それ以外は null) */
  total_ms: number | null;
  /** この時刻の絵が出来上がった (撮ってよい) */
  ready: boolean;
}

const FRAME = 1000 / 60;
/** 全体の長さの上限 (これより先の待ち合わせは手つきと関係ない物とみなす) */
const END_CAP = 15_000;
/** 手つきが終わった後、これだけ何も起きなければ終わり */
const QUIET = 1500;

export function installAnimClock() {
  const real = {
    setTimeout: window.setTimeout.bind(window),
    perfNow: performance.now.bind(performance),
    dateNow: Date.now,
  };
  const perfBase = real.perfNow();
  const dateBase = real.dateNow();
  let now = 0;
  let seq = 0;
  const timers = new Map<number, Timer>();
  /** CSS の動き → 生まれた仮の時刻 */
  const born = new Map<Animation, number>();
  // 差し替える前からある動き (開いた時の登場など) は終わらせておく
  for (const a of document.getAnimations()) {
    const end = a.effect?.getComputedTiming().endTime;
    if (typeof end === "number" && Number.isFinite(end)) {
      a.finish();
      born.set(a, -end);
      a.pause();
    } else {
      // 終わりの無い点滅は仮の時刻 0 から始め直す (実際の時刻を引き継ぐと、同じ URL でも撮るたびに絵が変わる)
      born.set(a, 0);
      a.pause();
      a.currentTime = 0;
    }
  }

  const add = (fn: (...a: unknown[]) => void, at: number, args: unknown[], every: number | null, raf: boolean): number => {
    const id = ++seq;
    timers.set(id, { id, at, fn, args, every, raf });
    return id;
  };
  const w = window as unknown as Record<string, unknown>;
  w.setTimeout = (fn: TimerHandler, ms = 0, ...args: unknown[]) => add(fn as (...a: unknown[]) => void, now + Math.max(0, Number(ms) || 0), args, null, false);
  w.setInterval = (fn: TimerHandler, ms = 0, ...args: unknown[]) => {
    const every = Math.max(1, Number(ms) || 0);
    return add(fn as (...a: unknown[]) => void, now + every, args, every, false);
  };
  w.clearTimeout = w.clearInterval = (id?: number) => void (id != null && timers.delete(id));
  w.requestAnimationFrame = (fn: FrameRequestCallback) => add(fn as (...a: unknown[]) => void, (Math.floor(now / FRAME) + 1) * FRAME, [], null, true);
  w.cancelAnimationFrame = (id: number) => void timers.delete(id);
  performance.now = () => perfBase + now;
  Date.now = () => dateBase + Math.round(now);

  /** 実際の時間で 1 回だけ待つ (Vue の描画・スタイルの計算を済ませる) */
  const settle = (): Promise<void> => new Promise((r) => real.setTimeout(r, 0));
  /** CSS の動きを今の仮の時刻にそろえる (新しく生まれた物は今を生まれた時刻にして止める) */
  function sync(): void {
    for (const a of document.getAnimations()) {
      if (!born.has(a)) {
        born.set(a, now);
        a.pause();
      }
      a.currentTime = Math.max(0, now - born.get(a)!);
    }
  }
  function next(limit: number): Timer | null {
    let best: Timer | null = null;
    for (const t of timers.values()) if (t.at <= limit && (!best || t.at < best.at || (t.at === best.at && t.id < best.id))) best = t;
    return best;
  }
  /** target ミリ秒まで進める (その間の待ち合わせを順に実行) */
  async function advanceTo(target: number): Promise<void> {
    await settle();
    sync();
    for (let guard = 0; guard < 20_000; guard++) {
      const t = next(target);
      if (!t) break;
      now = t.at;
      sync();
      if (t.every) t.at += t.every;
      else timers.delete(t.id);
      t.fn(...(t.raf ? [perfBase + now] : t.args));
      await settle();
      sync();
    }
    now = Math.max(now, target);
    sync();
    await settle();
    sync();
  }
  /** CSS の動き (終わりの無い点滅は除く) が全部終わる時刻 */
  function animEnd(): number {
    let end = 0;
    for (const [a, b] of born) {
      const e = a.effect?.getComputedTiming().endTime;
      if (typeof e === "number" && Number.isFinite(e)) end = Math.max(end, b + e);
    }
    return end;
  }
  /**
   * 手つきと付いた後の演出が全部終わる時刻まで進めて、その時刻を返す。doneAt = 手つき (play) が終わった時刻 (まだなら null)。
   * 手つきが終わった後は「最後の動きから QUIET ミリ秒、何も起きない」所で終わりとする (アプリの別の所のタイマー
   * — 相場の読み込みなど — で長さが変わらないように)
   */
  async function runToEnd(doneAt: () => number | null): Promise<number> {
    let last = now;
    for (let guard = 0; guard < 5000; guard++) {
      const done = doneAt();
      const horizon = done == null ? END_CAP : Math.max(done, animEnd(), last) + QUIET;
      let first: Timer | null = null;
      for (const t of timers.values()) if (!t.every && (!first || t.at < first.at)) first = t;
      if (!first || first.at > Math.min(horizon, END_CAP)) break;
      await advanceTo(first.at);
      if (!first.raf) last = now;
    }
    const end = Math.max(doneAt() ?? now, animEnd(), last);
    await advanceTo(end);
    return end;
  }
  return { now: () => now, advanceTo, runToEnd };
}
