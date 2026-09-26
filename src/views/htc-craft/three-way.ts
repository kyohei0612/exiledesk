/**
 * three-way.ts — 3 つの道 (完成品を買う / 固定済みを買って作る / 自分でフラクチャーして作る) と、一番安い道の判定
 * DiagnosisCard.vue から切り出し (2026-09-26)。中身は変えていない。
 */
import { computed } from "vue";
import type { useHtcCraft } from "./useHtcCraft";
import type { useStartSearch } from "./useStartSearch";
import type { useFinishedCompare } from "./useFinishedCompare";

export function useThreeWay(
  c: ReturnType<typeof useHtcCraft>,
  ss: ReturnType<typeof useStartSearch>,
  fin: ReturnType<typeof useFinishedCompare>,
) {
  /** 3 つの道: 完成品を買う / 固定済みを買って作る / 自分でフラクチャーして作る。一番安い物に印 */
  const threeWay = computed(() => {
    const tw = ss.threeWay.value;
    // 全部取れてから出す (オーナー 2026-09-26:「全部終わってから ② → ③。目が疲れない」。取得中に値が入れ替わって見えていた)
    if (c.phase.value !== "done" || (!ss.chosen.value && !fin.buyCost.value)) return [];
    // 完成品が無くても近い物 (MOD だけ同じ形) は「妥協」として比べる
    const compromise = !!fin.found.value && fin.buyCost.value != null && (fin.tierless.value || fin.dropped.value.length > 0);
    const list = [
      { key: "buy", name: compromise ? "完成品を買う (妥協)" : "完成品を買う", cost: fin.outlier.value ? null : fin.buyCost.value,
        why: fin.found.value ? (fin.exhausted.value ? "緩めても無し" : fin.outlier.value ? "当てにならない" : "出品なし") : "まだ",
        detail: compromise ? (fin.dropped.value.length ? `MOD だけ同じ形。${fin.dropped.value.join(" / ")} は付いていない (買ってから付ける)` : "MOD だけ同じ形 (段は問わず)") : "",
        url: fin.found.value?.url ?? null },
      { key: "fixed", name: "固定済みを買って途中から作る", cost: tw.fixed?.cost ?? null, why: ss.busy.value ? "取得中…" : "出品なし", detail: tw.fixed?.label ?? "", url: tw.fixed?.url ?? null },
      { key: "self", name: "自分でフラクチャーして作る", cost: tw.self?.cost ?? null, why: ss.kind.value.kind === "separate" ? "固定不要" : ss.busy.value ? "取得中…" : "出品が足りない", detail: tw.self?.label ?? "", url: tw.self?.url ?? null },
    ];
    const min = Math.min(...list.map((w) => w.cost ?? Infinity));
    return list.map((w) => ({ ...w, best: w.cost != null && w.cost === min }));
  });
  /** 一番安い道と、2 番目との差 */
  const verdict3 = computed(() => {
    const list = threeWay.value.filter((w) => w.cost != null).sort((x, y) => x.cost! - y.cost!);
    const best = list[0], second = list[1];
    return best ? { name: best.name, diff: second ? second.cost! - best.cost! : null, second: second?.name ?? "" } : null;
  });
  return { threeWay, verdict3 };
}

export type ThreeWay = ReturnType<typeof useThreeWay>;
