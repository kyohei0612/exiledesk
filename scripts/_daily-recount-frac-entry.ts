/**
 * _daily-recount-frac-entry.ts — D-03f の数え直しの足し分 (デイリー部長 27、11-15)。daily-cost.ts の runCost と同じ組み直し・同じ回しで、
 * 1 人ずつ「フラクチャーの箱に着いた時の費用 − 直前にスタートに着いた時の費用」= 前の手 を拾い、足し分 = 前の手 × 2 の合計を返す。
 * 前の手はフラクチャーより前の費用なので、新しい数えの版 (フラクチャーで前の手 ×2 を足す) でも前の版でも同じ数が出る = どちらの版で回してもよい。
 * 返り: add = 足し分の合計 (100 人分)、finished = 回し直しで完成した人数、fracHit = フラクチャーを打った回数、jump = フラクチャーの箱での費用の上がりの平均 (版の見分けの目安)
 */
import { loadPatchSync } from "./_htc-bridge-entry";
import { healRecipeV1 } from "../src/services/simulator/tree/tree-recipe-v1";
import { runTree } from "../src/services/simulator/tree/tree-run";
import { runPrice } from "../src/services/simulator/tree/run-price";
import { rebuildTree } from "../src/views/simulator/tree/tree-rebuild";
import { NO_FRAC, fillTopicDoc } from "../src/views/daily/daily-aims";
import { RUN_N, doneOkOf, markMet, perBoxOn, setJudgeDay, topicPrice, unmetDone } from "../src/views/daily/daily-cost";
import { sureFracOn } from "../src/services/simulator/tree/tree-sure-frac";
import { qualityOfSnap } from "../src/views/daily/daily-quality";
export { loadPatchSync, topicPrice, qualityOfSnap, perBoxOn, RUN_N };

export function fracAdd(data: any, topic: any, recipe: string, price: (k: string) => number): { why?: string; from?: string; add?: number; finished?: number; fracHit?: number; jump?: number } {
  setJudgeDay(topic.day);
  const doc = rebuildTree(data, healRecipeV1({ ...(JSON.parse(recipe) as Record<string, unknown>), eleAny: 1 }));
  const frac = doc.memoAims?.find((a: any) => a.fractured)?.modId;
  if (doc.base !== topic.base || (frac && !topic.aims.some((a: any) => a.modId === frac))) return { why: "ベース・✦ がお題と違う" };
  doc.itemLevel = topic.ilvl;
  const from = doc.start?.from === "four" ? "four" : "fractured";
  if (!frac || from !== "four") return { from: !frac ? "無し" : "(a)", add: 0 };
  fillTopicDoc(doc, topic.aims, frac ?? NO_FRAC, from, topic.quality);
  markMet(data, doc, topic.aims, topic.quality);
  if (unmetDone(data, doc, topic.aims, topic.quality).length) return { from: "(b)", why: "満たさない完成の箱" };
  const fb = new Set(Object.values(doc.boxes).filter((b: any) => sureFracOn(doc, b.hand)).map((b: any) => b.id));
  let add = 0, fracHit = 0, jump = 0;
  const r = runTree(data, doc, {
    n: RUN_N, seed: topic.seed, price: runPrice(price), startCost: 0, perBox: !!topic.perBox, doneOk: doneOkOf(data, topic.aims, topic.quality),
    onPerson: (p) => {
      let s = 0;
      p.visits.forEach((v, i) => {
        if (v.box === "start") s = v.cost;
        if (!fb.has(v.box)) return;
        const nx = p.visits[i + 1]?.cost ?? p.cost;
        if (nx <= v.cost) return; // 打っていない
        add += 2 * (v.cost - s); fracHit++; jump += nx - v.cost;
      });
    },
  });
  return { from: "(b)", add, finished: r.finished, fracHit, jump: fracHit ? jump / fracHit : 0 };
}
