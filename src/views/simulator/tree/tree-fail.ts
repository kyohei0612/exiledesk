/**
 * tree-fail.ts — 失敗した時 (外れ・狙いが消えた・外れが消えた・打った後) の箱の「どこへ・なぜ」の文と、回した結果の 1 行
 * (2026-10-26 オーナー「失敗時の挙動をかなりしっかり作りこまないとダメだね」の案 2。PC の箱・スマホの結果の行と重ね窓で同じ文)。
 * 木の作りと回し方は変えない (文はどれも今の setBack・autoBack・settle・stuckWhy を読むだけ)。決めは notes/2026-10-26-failure-behavior.md
 */
import { MATCH, RESTART } from "../../../services/simulator/tree/tree-shape";
import { boxAims, GAP_Y, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import type { TreeRunResult } from "../../../services/simulator/tree/tree-run";
import { backTargetsOf } from "./tree-merge";
import { tr } from "../../../i18n/lang";

/** 箱の段 (始まり = 1 段目、画面の段の並び。戻り方の文は全部「n 段目へ戻る」、10-26 オーナー「始めに戻るはなんかややこしい話だから普通にどこに戻るかいつも通り書く」「1段目へ戻るとかにするか？全て、矢印は違うから段が同じもどり方でも」) */
export function stepOf(doc: TreeDoc, id: string): number {
  // 画面の段 (箱の高さ ÷ 段の間)。親をたどる深さではない (整列は揃った狙いの数で段を分けるので、深さ 2 の箱が 3 段目に並ぶ)
  const b = doc.boxes[id], s = doc.boxes.start;
  return b && s ? Math.max(1, Math.round((b.y - s.y) / GAP_Y) + 1) : 1;
}
/** 「n 段目へ戻る」(英語は GLOSSARY に無いので案 Back to step n、notes/2026-10-26-failure-behavior.md) */
export const stepBackText = (doc: TreeDoc, to: string): string => { const n = stepOf(doc, to); return tr(`${n} 段目へ戻る`, `Back to step ${n}`); };
/** 再度挑戦 = 戻り先の箱の手が、この箱を出した手と同じ (同じ手をもう一度打ちに戻る。外れのカオスを打ち直す・狙いが残った消去など。10-26 オーナー「狙い残った時とかの日本語は、再度挑戦にしたら分かりやすいかな」) */
export function isRetry(doc: TreeDoc, id: string): boolean {
  const b = doc.boxes[id], p = b?.parent ? doc.boxes[b.parent] : undefined;
  const to = b?.back ? doc.boxes[b.back] : undefined;
  return !!p?.hand && !!to?.hand && to.hand.currency === p.hand.currency;
}
/** 戻りの札の文: 「n 段目へ戻る」、再度挑戦なら「再度挑戦 · n 段目へ戻る」(英語の案は Retry · Back to step n、notes/2026-10-26-failure-behavior.md) */
export function backText(doc: TreeDoc, id: string, to: string): string {
  // 当たりの箱を別の道の同じ状態の当たりの箱へまとめた (tree-shape の joinSameHit、10-26 夜) は戻りでなく合流
  if (doc.boxes[id]?.out === "hit" && doc.boxes[to]?.out === "hit") { const n = stepOf(doc, to); return tr(`同じ MOD 群のため統合 (${n} 段目)`, `Merged: same mod group (step ${n})`); } // 10-27 オーナー「文言は『同じ MOD 群のため統合』と出そうか」
  const step = stepBackText(doc, to);
  return isRetry(doc, id) ? tr(`再度挑戦 · ${step}`, `Retry · ${step}`) : step;
}
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
 * name を渡さなければ行き先の名前を省く (PC の箱は下の札に名前がある)。例: 「↩ 3 段目へ戻る」(スマホは「↩ 3 段目へ戻る: 当たり ライフ」)
 */
export function routeText(doc: TreeDoc, id: string, name?: (id: string) => string): string | null {
  const b = doc.boxes[id], k = routeKind(doc, id);
  if (!b || k === "none") return null;
  const to = backTargetsOf(doc, id);
  if (k === "restart") return tr("↩ ベースから作り直し", "↩ Start over from a new base");
  if (!to.length) return tr("↩ 形の合う箱が無い (回すとここで止まる)", "↩ No box of the same shape (runs stop here)");
  if (b.out === "hit" && to.every((x) => doc.boxes[x]?.out === "hit")) return `→ ${backText(doc, id, to[0]!)}${name ? `: ${to.map(name).join(tr("・", ", "))}` : ""}`;
  // 戻り方の文は全部「n 段目へ戻る」(同じ手をもう一度・始め・自動・選んだ箱も。どの箱かは矢印で分かる)。スマホは矢印が無いので行き先の名前を添える
  const steps = [...new Set(to.map((x) => stepOf(doc, x)))].sort((a, b) => a - b);
  const names = name ? `: ${to.map(name).join(tr("・", ", "))}` : "";
  const head = isRetry(doc, id) ? tr("再度挑戦 · ", "Retry · ") : "";
  return tr(`↩ ${head}${steps.join("・")} 段目へ戻る${names}`, `↩ ${head}Back to step ${steps.join(", ")}${names}`);
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
  return Object.values(doc.boxes).filter((b) => b.out === "hit" && b.aim && boxAims(b).every((x) => !goals.some((g) => g.modId === x.modId))).map((b) => b.id);
}
