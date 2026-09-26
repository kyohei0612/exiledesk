/**
 * use-ev-attempts.ts — 自動ジェム監視の一覧で期待値を出す回数 (この PC に残す)
 *
 * GemWatch.vue から切り出し (2026-09-26)。
 */
import { ref, watch } from "vue";

/**
 * 一覧の期待値を出す回数 (オーナー指示 2026-09-20)。この PC に残す。
 * ジェムコラプトの賭けの回数とは別 (あちらはジェムごとの帳簿の回数)。
 */
const EV_ATTEMPTS_KEY = "exiledesk.gem-watch.evAttempts";

export function useEvAttempts() {
  const evAttempts = ref<number>(
    (() => {
      try {
        const n = Number(localStorage.getItem(EV_ATTEMPTS_KEY));
        return n >= 1 ? n : 30;
      } catch {
        return 30;
      }
    })(),
  );
  watch(evAttempts, (n) => {
    try {
      localStorage.setItem(EV_ATTEMPTS_KEY, String(n));
    } catch {
      /* 残せなくても動く */
    }
  });
  return evAttempts;
}
