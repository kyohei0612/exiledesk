/**
 * flow-summary-text.ts — 捌き速度の判定を人の言葉にする (時間・割合の書き方と 1 行の文)
 *
 * flow-summary.ts から切り出し (2026-09-26)。呼ぶ側は今まで通り market-flow / flow-summary から取れる。
 */
import { MIN_KNOWN, type FlowSummary } from "./flow-summary-types";

/** 分 → 「3 時間」「25 分」「2 日」 */
export function fmtSellTime(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${Math.max(1, Math.round(min))} 分`;
  const h = min / 60;
  if (h < 48) return `${h < 10 ? h.toFixed(1).replace(/\.0$/, "") : Math.round(h)} 時間`;
  return `${Math.round(h / 24)} 日`;
}

/**
 * 判定を 1 行の日本語にする。実測そのままを書く
 * (オーナー指示 2026-09-17:「事実ベースで売れ時間出そう。暫定とかいいから」)。
 */
export function flowSentence(f: FlowSummary): string {
  if (f.truncated) return "出品が多すぎて (100 件超) 売れたかどうかを判定できません";
  if (f.firstLook && f.gone === 0) {
    return `初回の取得です。今並んでいる ${f.alive} 件（最長 ${fmtSellTime(f.oldestMin)}）を覚えたところなので、次回の取得でこのうち何件が売れたかを見て判定します`;
  }
  if (f.gone === 0) {
    const extra = [
      f.pending > 0 ? `一覧から 1 回消えただけの ${f.pending} 件は次の取得で確定します` : "",
      f.unknown > 0 ? `売れたか分からない ${f.unknown} 件は数えていません` : "",
    ].filter(Boolean);
    const tail = extra.length > 0 ? `。${extra.join("。")}` : "";
    if (f.alive === 0) return `${f.pending + f.unknown > 0 ? "まだ売れた記録がありません" : "まだ記録がありません"}${tail}`;
    return `まだ 1 件も売れていません（並んでいる ${f.alive} 件・最長 ${fmtSellTime(f.oldestMin)}）${tail}`;
  }
  const parts = [`${f.gone} 件が売れました（売れるまで ${fmtSellTime(f.medianMin)}）`];
  if (!f.enough) parts.push(`判定にはあと ${Math.max(0, MIN_KNOWN - f.known24)} 件 (結果が分かっている出品が ${MIN_KNOWN} 件要ります)`);
  else if (f.gone < MIN_KNOWN) parts.push(`${f.gone} 件だけで出した判定です`);
  // 「速い」と出していても、それより長く並んでいる出品があるなら必ず併記する
  if (f.olderThanMedian > 0) parts.push(`ただし並んでいる ${f.alive} 件のうち ${f.olderThanMedian} 件はもっと長く並んでいます`);
  if (f.pending > 0) parts.push(`一覧から 1 回消えただけの ${f.pending} 件は次の取得で確定します`);
  if (f.unknown > 0) parts.push(`出品時刻か出品者が分からず売れたと言えない ${f.unknown} 件は数えていません`);
  if (f.stale > 0) parts.push(`2 日以上売れ残り ${f.stale} 件`);
  if (f.droppedUnsold > 0) parts.push(`7 日売れずに打ち切り ${f.droppedUnsold} 件`);
  if (f.droppedBuried > 0) parts.push(`最安帯から沈んで追跡をやめた ${f.droppedBuried} 件`);
  return parts.join("。");
}

/** 分 → "18 分" / "3 時間 20 分" / "2 日" */
export function fmtAge(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min} 分`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 === 0 ? `${h} 時間` : `${h} 時間 ${min % 60} 分`;
  const d = Math.floor(h / 24);
  return h % 24 === 0 ? `${d} 日` : `${d} 日 ${h % 24} 時間`;
}

/** 0-1 → "78%" */
export function fmtPct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}
