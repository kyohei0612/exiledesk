/**
 * boot-timing.ts — 起動直後の処理の時間を exiledesk.log に書く (2026-10-06 オーナー「起動し始めがバカ重い、リリース版何の処理か」)。
 *
 * 時刻は画面の読み込み開始からのミリ秒 (performance.now)。起動から BOOT_WINDOW_MS の間だけ書く (普段の操作では書かない)。
 * あわせて、画面が固まった時間 (メインスレッドの長いタスク、150ms 以上) も同じ間だけ書く。原因が分かったら外してよい
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./isTauriRuntime";

const BOOT_WINDOW_MS = 180_000;
const inBoot = (): boolean => performance.now() < BOOT_WINDOW_MS;

export function bootLog(msg: string): void {
  if (!inBoot() || !isTauriRuntime()) return;
  void invoke("app_log_write", { msg: `[起動計測] +${Math.round(performance.now())}ms ${msg}` }).catch(() => undefined);
}

/** 非同期の処理を 1 つ計る (起動の間だけ書く) */
export async function bootTimed<T>(label: string, run: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  bootLog(`${label}: 始め`);
  try {
    return await run();
  } finally {
    bootLog(`${label}: 終わり ${Math.round(performance.now() - t0)}ms`);
  }
}

/** 同期の処理を 1 つ計る (メインスレッドを止める集計など) */
export function bootTimedSync<T>(label: string, run: () => T): T {
  const t0 = performance.now();
  try {
    return run();
  } finally {
    const ms = Math.round(performance.now() - t0);
    if (ms >= 20) bootLog(`${label}: ${ms}ms (画面が止まる処理)`);
  }
}

/** 画面が固まった時間 (長いタスク) を起動の間だけ書く */
export function watchBootLongTasks(): void {
  if (!isTauriRuntime() || typeof PerformanceObserver === "undefined") return;
  try {
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.duration >= 150) bootLog(`画面が ${Math.round(e.duration)}ms 固まった (+${Math.round(e.startTime)}ms から)`);
      }
      if (!inBoot()) obs.disconnect();
    });
    obs.observe({ type: "longtask", buffered: true });
  } catch {
    /* longtask に対応していない WebView では書かない */
  }
}
