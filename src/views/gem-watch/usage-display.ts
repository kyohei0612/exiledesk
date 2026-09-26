/**
 * usage-display.ts — 使用率ランキングの見出しに出す文 (集計対象 / 取得時刻 / 待機中 / 進み具合 / 母数不足)
 *
 * GemBreak.vue から切り出し (2026-09-26)。受け取った状態から computed を作るだけ。
 */
import { computed, type Ref } from "vue";
import { jaAscendancy, ascendancyIcon } from "../../i18n/ascendancies-ja";
import type { Progress, Result } from "./gem-break-types";
import type { NetworkStatusRaw } from "./use-net-status";

export function useUsageDisplay(result: Ref<Result | null>, progress: Ref<Progress | null>, busy: Ref<boolean>, net: Ref<NetworkStatusRaw | null>) {
  /** 集計対象の表示名 (1 アセなら日本語名、複数なら「上位 N アセ合算」) */
  const resultClassJa = computed(() => {
    const r = result.value;
    if (!r) return "";
    const cs = (r.classes ?? []).filter((c) => c);
    if (cs.length === 0) return "全アセンダンシー";
    if (cs.length === 1) return `${ascendancyIcon(cs[0])} ${jaAscendancy(cs[0])}`;
    if (cs.length > 1) return `${cs.map((c) => jaAscendancy(c)).join(" / ")}`;
    return jaAscendancy(r.class);
  });
  const fetchedAtText = computed(() => {
    const t = result.value?.fetched_at;
    if (!t) return "";
    const d = new Date(t * 1000);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  });
  /** レート制限 / 再試行の待ち中は「取得中」ではない (オーナー指摘 2026-09-16) */
  const waiting = computed(() => busy.value && !!net.value && (net.value.global_penalty_waiting || net.value.active_retry_count > 0));
  /** 待機中に出す「ここまで取れた」表示 */
  const doneText = computed(() => (progress.value ? `${progress.value.done}/${progress.value.total} 人 取得済み` : ""));
  /** 取ろうとした人数より大幅に少ない = レート制限や中止で打ち切られた (数字があてにならない) */
  const shortfall = computed(() => {
    const r = result.value;
    if (!r || !r.requested) return null;
    if (r.characters >= r.requested) return null;
    return { got: r.characters, want: r.requested, cancelled: !!r.cancelled };
  });
  const progressText = computed(() => {
    const p = progress.value;
    if (!p) return "";
    if (p.phase === "search") return "上位プレイヤーを検索中…";
    if (p.phase === "completed") return "集計中…";
    // キャッシュから流用した人数を出す (poe.ninja に取りに行くのは差分だけ)
    const reused = p.reused ? ` (うちキャッシュ ${p.reused} 人)` : "";
    return `キャラ取得中 ${p.done}/${p.total}${reused}`;
  });

  return { resultClassJa, fetchedAtText, waiting, doneText, shortfall, progressText };
}
