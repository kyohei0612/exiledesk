/**
 * daily-cost.ts — 提出の費用と完成率の数え方 (D-34・D-58)。16:00 の検算の台本 (scripts/_daily-roll-entry.ts の Verify) がこれを呼ぶ。
 * 画面の木の帯 (use-tree-run → recipe-card) と同じ数え方 (run-price.ts の runShown): 費用 = runTree の perItem (withStartCost の後) を 0.1 神に丸め、完成率 = round(finished / n × 100)。
 * 種と値段はお題に固定した物 (start の返りの seed・prices)。画面がお題の種・値段で回すのはシミュの D-41 ④ の後で、それまで検算は合わない (checked = null のまま)
 */
import type { PatchData } from "../../services/craft-stage/engine";
import { healRecipeV1 } from "../../services/simulator/tree/tree-recipe-v1";
import { runTree, withStartCost } from "../../services/simulator/tree/tree-run";
import { runPrice, runShown } from "../../services/simulator/tree/run-price";
import { aimOpts, sampleOf, targetsOf } from "../../services/simulator/tree/tree-sample";
import { isAimMod } from "../../services/simulator/tree/tree-aim";
import type { TreeDoc } from "../../services/simulator/tree/tree-model";
import { rebuildTree } from "../simulator/tree/tree-rebuild";
import { fillTopicDoc } from "./daily-aims";
import type { GenAim } from "./daily-gen";

/** 回す人数 (S-70 の RUN_N と同じ) */
export const RUN_N = 100;

/**
 * 完成の箱のうち、お題の狙いを段の下限まで全部持っていない物の id (D-35b)。シミュでは完成は人が決める (S-05) が、デイリーの解決は狙いを満たした品だけ。
 * 箱の見本の品 (sampleOf) で見る。当たりの判定はシミュと同じ isAimMod (同じ系統・同じ文も当たり)
 */
export function unmetDone(data: PatchData, doc: TreeDoc, aims: readonly { modId: string; tier: number }[]): string[] {
  const opts = aimOpts(data);
  return Object.values(doc.boxes).filter((b) => b.done === "main").filter((b) => {
    let mods;
    try { const it = sampleOf(data, doc, b.id, 1).item; mods = [...it.prefixes, ...it.suffixes]; } catch { return true; }
    return !aims.every((a) => mods.some((m) => isAimMod(m, targetsOf(data, [a]), opts)));
  }).map((b) => b.id);
}

/**
 * 完成形と同じ形の箱 (D-35b ②、オーナー 11-09「デイリーだけは完成形と同じ形でおｋにさせよう。提出は」)。
 * 手も戻りも分かれ目も無く、印がまだ無い (null) 結果の箱のうち、見本の品がお題の狙いを全部持つ物。見方は unmetDone と同じ isAimMod。
 * 人が「失敗」を付けた箱は触らない
 */
export function metBoxes(data: PatchData, doc: TreeDoc, aims: readonly { modId: string; tier: number }[]): string[] {
  const opts = aimOpts(data);
  return Object.values(doc.boxes).filter((b) => b.out !== "start" && b.done == null && !b.hand && !b.back && !b.split?.length).filter((b) => {
    let mods;
    try { const it = sampleOf(data, doc, b.id, 1).item; mods = [...it.prefixes, ...it.suffixes]; } catch { return false; }
    return aims.every((a) => mods.some((m) => isAimMod(m, targetsOf(data, [a]), opts)));
  }).map((b) => b.id);
}
/** 完成形と同じ形の箱に完成の印を付ける (挑戦の木と 16:00 の検算で同じ)。付けた数 */
export function markMet(data: PatchData, doc: TreeDoc, aims: readonly { modId: string; tier: number }[]): number {
  const ids = metBoxes(data, doc, aims);
  for (const id of ids) doc.boxes[id]!.done = "main";
  return ids.length;
}

/**
 * 提出の木 (exiledesk-recipe/1 の JSON) をお題の形で組み直して 100 人回す。price は相場のまま (高貴建て、priceOfKey の値) を渡す。神に直すのと見せる数の丸めは画面の木の帯と同じ runPrice・runShown (run-price.ts、写さない)。
 * 狙い・段の下限・始めの値段 0 はお題から入れ直す (始め方 = フラクチャー済みから / 白から確定フラクチャーは提出の木のまま、D-37j) (提出の木の書き換えを効かせない)。
 * ベースが違う・フラクチャーが無い木・お題の狙いを満たさない完成の箱がある木 (D-35b) は null
 */
export function runCost(data: PatchData, topic: { base: string; ilvl: number; aims: readonly GenAim[]; seed: number }, recipe: string | Record<string, unknown>, price: (key: string) => number): { cost: number; rate: number } | null {
  const raw = typeof recipe === "string" ? (JSON.parse(recipe) as Record<string, unknown>) : recipe;
  const doc = rebuildTree(data, healRecipeV1(raw));
  const frac = doc.memoAims?.find((a) => a.fractured)?.modId;
  if (doc.base !== topic.base || !frac || !topic.aims.some((a) => a.modId === frac)) return null;
  doc.itemLevel = topic.ilvl;
  fillTopicDoc(doc, topic.aims, frac, doc.start?.from === "four" ? "four" : "fractured"); // 始め方は提出の木のまま (D-37j)
  markMet(data, doc, topic.aims); // 完成形と同じ形の箱は完成 (D-35b ②、挑戦の木と同じ)
  if (unmetDone(data, doc, topic.aims).length) return null;
  return runShown(withStartCost(runTree(data, doc, { n: RUN_N, seed: topic.seed, price: runPrice(price), startCost: 0 }), 0));
}
