/**
 * tree-fail.ts — 失敗した時 (外れ・狙いが消えた・外れが消えた・打った後) の箱の「どこへ・なぜ」の文と、回した結果の 1 行
 * (2026-10-26 オーナー「失敗時の挙動をかなりしっかり作りこまないとダメだね」の案 2。PC の箱・スマホの結果の行と重ね窓で同じ文)。
 * 木の作りと回し方は変えない (文はどれも今の setBack・autoBack・settle・stuckWhy を読むだけ)。決めは notes/2026-10-26-failure-behavior.md
 */
import { MATCH, RESTART } from "../../../services/simulator/tree/tree-shape";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import type { TreeRunResult } from "../../../services/simulator/tree/tree-run";
import { backTargetsOf } from "./tree-merge";
import { tr } from "../../../i18n/lang";

/** 戻りの種類 (戻り方 5 つのうち戻る 3 つと、自動・形の合う箱。次の手・完成は戻りでない) */
export type RouteKind = "retry" | "start" | "auto" | "other" | "match" | "restart" | "none";
export function routeKind(doc: TreeDoc, id: string): RouteKind {
  const b = doc.boxes[id];
  if (!b?.back) return "none";
  if (b.back === RESTART) return "restart";
  if (b.back === "start") return "start";
  if (b.back === MATCH) return "match";
  if (b.back === b.parent) return "retry";
  return b.autoBack ? "auto" : "other";
}

/**
 * 箱の行き先の文 (戻りがある箱だけ。無ければ null)。名前は渡した name で (PC は箱の札の名前、スマホは道の名前)。
 * name を渡さなければ行き先の名前を省く (PC の箱は下の札に名前がある)。例: 「↩ 同じ手をもう一度 (打つ前の箱へ)」「↩ 狙いが消えたので始めから」「↩ 同じ状態の箱へ自動: 当たり ライフ」
 */
export function routeText(doc: TreeDoc, id: string, name?: (id: string) => string): string | null {
  const b = doc.boxes[id], k = routeKind(doc, id);
  if (!b || k === "none") return null;
  const to = backTargetsOf(doc, id);
  if (k === "restart") return tr("↩ ベースから作り直し", "↩ Start over from a new base");
  // このアイテムのまま始めの箱へ戻る (新しいベースからではない。10-26 モンキー 7 の 1「新しい白のベースから打ち直すと読める」)
  if (k === "start") return b.out === "lost" ? tr("↩ 狙いが消えたので、このアイテムのまま始めの箱へ戻る", "↩ A target was lost: back to the start box with this item") : tr("↩ このアイテムのまま始めの箱へ戻る", "↩ Back to the start box with this item");
  if (k === "match") return to.length ? (name ? tr(`↩ 形の合う箱へ: ${to.map(name).join("・")}`, `↩ To the box of the same shape: ${to.map(name).join(", ")}`) : tr(`↩ 形の合う箱へ (${to.length} か所)`, `↩ To the box of the same shape (${to.length})`)) : tr("↩ 形の合う箱が無い (回すとここで止まる)", "↩ No box of the same shape (runs stop here)");
  const n = name && to[0] ? name(to[0]) : "", ja = n ? `: ${n}` : "", en = n ? `: ${n}` : "";
  if (k === "retry") return tr(`↩ 同じ手をもう一度 (打つ前の箱へ)${ja}`, `↩ Same craft again (back to the box before it)${en}`);
  if (k === "auto") return tr(`↩ 同じ状態の箱へ自動 (狙いの MOD が同じ)${ja}`, `↩ Auto-linked to the same state (same target mods)${en}`);
  return tr(`↩ 選んだ箱へ${ja}`, `↩ To the chosen box${en}`);
}

/**
 * 回した結果のその箱の 1 行 (来た人・形の合う箱へ移った人・止まった人と理由)。回していない・誰も来ない箱は null。
 * moved = 着いてから形の合う別の箱へ移った人 (tree-run の settle、矢印の先と実際に進む箱が違う時)
 */
export function runText(r: TreeRunResult | null | undefined, id: string): string | null {
  const st = r?.boxes[id];
  if (!r || !st?.reach) return null;
  const parts = [tr(`回すと ${st.reach} 人が来た`, `${st.reach} runs reached`)];
  const mv = r.moved[id] ?? 0;
  if (mv) parts.push(tr(`${mv} 人は形の合う別の箱へ移った`, `${mv} moved on to a box of the same shape`));
  const s = r.stuckAt[id] ?? 0;
  if (s) parts.push(tr(`${s} 人がここで止まった: ${r.stuckWhy[id]?.reason ?? ""}`, `${s} stopped here: ${r.stuckWhy[id]?.reason ?? ""}`));
  return parts.join(tr(" · ", " · "));
}

/** 「同じ手をもう一度」の行き先 = 打つ前の箱 (親)。始まり・つなげない箱 (use-tree-link の理由あり) なら null。PC の戻り先選びの帯とスマホの ② で同じ (10-26 戻り方 5 つを揃える) */
export function retryOf(doc: TreeDoc, id: string | null, link: ReadonlyMap<string, string | null>): string | null {
  const p = id ? doc.boxes[id]?.parent ?? null : null;
  return p && p !== "start" && link.get(p) === null ? p : null;
}

/** 完成の狙い (memoAims) に無い MOD を当たりにしている箱 (完成の MOD で狙いを外しても箱は残る。知らせと箱の札、10-26 モンキー 7 の 5)。完成の狙いが無い木は数えない */
export function orphanHits(doc: TreeDoc): string[] {
  const goals = doc.memoAims ?? [];
  if (!goals.length) return [];
  return Object.values(doc.boxes).filter((b) => b.out === "hit" && b.aim && !goals.some((g) => g.modId === b.aim!.modId)).map((b) => b.id);
}
