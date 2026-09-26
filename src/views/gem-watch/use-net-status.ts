/**
 * use-net-status.ts — poe.ninja のレート制限 / 再試行の状態を 1 秒ごとに見る (取得中だけ)
 *
 * GemBreak.vue から切り出し (2026-09-26)。画面ごとに 1 つ (呼んだ画面の中だけの状態)。
 */
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";

/** poe.ninja のレート制限 / 再試行の状態 (MOD 一覧のヘッダーと同じ物を出す) */
export interface NetworkStatusRaw {
  global_penalty_waiting: boolean;
  global_penalty_remaining_secs: number;
  global_penalty_reason?: string | null;
  active_retry_count: number;
  last_retry_reason?: string | null;
  last_retry_remaining_secs: number;
}

export function useNetStatus(inApp: boolean) {
  const net = ref<NetworkStatusRaw | null>(null);
  let netTimer: ReturnType<typeof setInterval> | null = null;

  function startNetPolling(): void {
    if (netTimer || !inApp) return;
    netTimer = setInterval(async () => {
      try {
        const s = await invoke<NetworkStatusRaw>("get_network_status");
        net.value = s.global_penalty_waiting || s.active_retry_count > 0 ? s : null;
      } catch {
        net.value = null;
      }
    }, 1000);
  }
  function stopNetPolling(): void {
    if (netTimer) clearInterval(netTimer);
    netTimer = null;
    net.value = null;
  }

  return { net, startNetPolling, stopNetPolling };
}
