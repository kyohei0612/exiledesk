/**
 * daily-cost.ts — 提出の費用と完成率の数え方 (D-34・D-58)。16:00 の検算の台本 (scripts/_daily-roll-entry.ts の Verify) がこれを呼ぶ。
 * 画面の木の帯 (use-tree-run → recipe-card) と同じ数え方 (run-price.ts の runShown): 費用 = runTree の perItem (withStartCost の後) を 0.1 神に丸め、完成率 = round(finished / n × 100)。
 * 種と値段はお題に固定した物 (start の返りの seed・prices)。挑戦の画面も同じ種と値段の引き方 (topicPrice) で回す (S-70c の treeRunRig、11-10 から)
 */
import type { PatchData } from "../../services/craft-stage/engine";
import { healRecipeV1 } from "../../services/simulator/tree/tree-recipe-v1";
import { runTree, withStartCost } from "../../services/simulator/tree/tree-run";
import { runPrice, runShown } from "../../services/simulator/tree/run-price";
import { aimOpts, sampleOf, targetsOf } from "../../services/simulator/tree/tree-sample";
import { isAimMod } from "../../services/simulator/tree/tree-aim";
import { tierNoOf } from "../../services/craft-stage/tier-rank";
import type { StageItem, StageMod } from "../../services/craft-stage/engine";
import { flag } from "../../web/release-flags";
import type { TreeDoc } from "../../services/simulator/tree/tree-model";
import { rebuildTree } from "../simulator/tree/tree-rebuild";
import { NO_FRAC, fillTopicDoc } from "./daily-aims";
import type { GenAim } from "./daily-gen";
import { freshItem } from "../../services/craft-stage/engine";
import { marketStore } from "../../state/market-store";
import { priceOfKey } from "../../state/for-share/craft-stage-shelf";

/** 回す人数 (S-70 の RUN_N と同じ) */
export const RUN_N = 100;

/** 乱数を「何人目 × どの箱」で決める最初のお題の日 (D-58b、11-11 オーナー「乱数同じの方が良いのやっぱり　この動きの後はこの乱数で統一的な」)。前の日は全員で 1 本の列のまま。11-11 の提出は出した後に保存のレシピで回し直して差し替える (11-11 オーナー「ランキングも今の奴に乱数同じでそのレシピで回して本物のランキングにしてあげるか全部入ったら」) */
export const BOX_SEED_FROM = "2026-11-11";
/** その日 ("YYYY-MM-DD"、お題の id "dYYYY-MM-DD" も可) が箱ごとの乱数で回す日か。挑戦の画面・提出・16:00 の検算が同じここを見る */
export const perBoxOn = (day: string): boolean => day.replace(/^d/, "") >= BOX_SEED_FROM;
/** 始め方を (b) 白から確定フラクチャーだけにする最初のお題の日 (D-03・D-37j、11-11 オーナー「２だねフラクチャー時の挙動は失敗費用含めたら絶対いいわ」)。前の日は (a) も選べたまま */
export const FOUR_ONLY_FROM = "2026-11-12";
/** その日のお題が (b) だけか (始め方の窓は (a) を出さない) */
export const fourOnlyOn = (day: string): boolean => day.replace(/^d/, "") >= FOUR_ONLY_FROM;

/**
 * その MOD がお題の狙い a に当たるか (D-35b: 完成は MOD の種類と段だけ、付けた手は問わない)。シミュと同じ isAimMod に加え、
 * エンジンの当たりが別物にするエッセンスの MOD と普通の MOD (どちらの向きも) を、同じ系統で効果の文も同じなら当たりにする。段は段の名前の T で比べる
 * (エッセンスの MOD の段の名前は普通の MOD の段に合わせてある、apply-essence の normalTierOf)。11-11 オーナー「このデイリーの形で完成にならないわけは」
 * (スペルクリティカルが上級エッセンスの版で付き、狙いの普通の MOD と別に見て提出を止めた)
 */
export function dailyHit(data: PatchData, m: StageMod, a: { modId: string; tier: number }): boolean {
  if (isAimMod(m, targetsOf(data, [a]), aimOpts(data))) return true;
  if (m.unrevealed) return false;
  const want = data.mods.get(a.modId), got = data.mods.get(m.modId);
  if (!want || !got || !want.family || got.family !== want.family || got.text !== want.text) return false;
  return tierNoOf(m) <= a.tier;
}
const holdsAll = (data: PatchData, mods: readonly StageMod[], aims: readonly { modId: string; tier: number }[]): boolean =>
  aims.every((a) => mods.some((m) => dailyHit(data, m, a)));

/**
 * 回す時に完成の箱へ着いた人の品を見る物差し (D-35b ④、スイッチ dailyDoneCheck。シミュの回しの口 doneOk = S-05b へ渡す)。
 * お題の狙いを段の下限まで全部持つ人だけ完成に数え、足りない人はその箱の失敗と同じ数え (そこで終わり・費用は合計に入る)。
 * 完成の精査 (missingAims) は箱の見本の品 1 つを見るので、見本は満たすが着く人の一部は満たさない箱 (最後の手の ☑ の段がお題より緩い時など) を回す所で受ける。
 * 挑戦の画面 (DailyPlay の treeRunRig) と 16:00 の検算 (runCost) が同じここを呼ぶ。スイッチが切れている間は undefined = 今までどおり全員完成
 */
export const doneOkOf = (data: PatchData, aims: readonly { modId: string; tier: number }[]): ((item: StageItem) => boolean) | undefined =>
  flag("dailyDoneCheck") ? (item) => holdsAll(data, [...item.prefixes, ...item.suffixes], aims) : undefined;

/**
 * 完成の箱のうち、お題の狙いを段の下限まで全部持っていない物の id (D-35b)。シミュでは完成は人が決める (S-05) が、デイリーで完成に数えるのは狙いを満たした品だけ。
 * 箱の見本の品 (sampleOf) で見る。当たりの判定は dailyHit (シミュの isAimMod + 同じ文のエッセンスの版)
 */
export function unmetDone(data: PatchData, doc: TreeDoc, aims: readonly { modId: string; tier: number }[]): string[] {
  return Object.values(doc.boxes).filter((b) => b.done === "main").filter((b) => missingAims(data, doc, b.id, aims).length > 0).map((b) => b.id);
}
/**
 * その箱の見本の品に足りないお題の狙い (D-35b)。完成の判定の物差しはここ 1 つ = unmetDone (提出・16:00 の検算) と、完成を押した時の精査 (D-35b ③、DailyPlay) が同じ物を呼ぶ。
 * 見本が読めない箱は全部足りない扱い
 */
export function missingAims<A extends { modId: string; tier: number }>(data: PatchData, doc: TreeDoc, boxId: string, aims: readonly A[]): A[] {
  let mods: StageMod[];
  try { const it = sampleOf(data, doc, boxId, 1).item; mods = [...it.prefixes, ...it.suffixes]; } catch { return [...aims]; }
  return aims.filter((a) => !mods.some((m) => dailyHit(data, m, a)));
}

/**
 * 完成形と同じ形の箱 (D-35b ②、オーナー 11-09「デイリーだけは完成形と同じ形でおｋにさせよう。提出は」)。
 * 手も戻りも分かれ目も無く、印がまだ無い (null) 結果の箱のうち、見本の品がお題の狙いを全部持つ物。見方は unmetDone と同じ isAimMod。
 * 人が「失敗」を付けた箱は触らない
 */
export function metBoxes(data: PatchData, doc: TreeDoc, aims: readonly { modId: string; tier: number }[]): string[] {
  return Object.values(doc.boxes).filter((b) => b.out !== "start" && b.done == null && !b.hand && !b.back && !b.split?.length).filter((b) => {
    let mods;
    try { const it = sampleOf(data, doc, b.id, 1).item; mods = [...it.prefixes, ...it.suffixes]; } catch { return false; }
    return holdsAll(data, mods, aims);
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
export function runCost(data: PatchData, topic: { base: string; ilvl: number; aims: readonly GenAim[]; seed: number; perBox?: boolean }, recipe: string | Record<string, unknown>, price: (key: string) => number): { cost: number; rate: number } | null {
  const raw = typeof recipe === "string" ? (JSON.parse(recipe) as Record<string, unknown>) : recipe;
  const doc = rebuildTree(data, healRecipeV1(raw));
  const frac = doc.memoAims?.find((a) => a.fractured)?.modId;
  // ✦ の無い木 = フラクチャー無し (11-12 のお題から選べる、D-03)。✦ があればお題の狙いの物だけ
  if (doc.base !== topic.base || (frac && !topic.aims.some((a) => a.modId === frac))) return null;
  doc.itemLevel = topic.ilvl;
  fillTopicDoc(doc, topic.aims, frac ?? NO_FRAC, doc.start?.from === "four" ? "four" : "fractured"); // 始め方は提出の木のまま (D-37j)
  markMet(data, doc, topic.aims); // 完成形と同じ形の箱は完成 (D-35b ②、挑戦の木と同じ)
  if (unmetDone(data, doc, topic.aims).length) return null;
  return runShown(withStartCost(runTree(data, doc, { n: RUN_N, seed: topic.seed, price: runPrice(price), startCost: 0, perBox: !!topic.perBox, doneOk: doneOkOf(data, topic.aims) }), 0));
}

/**
 * お題の相場の写し (daily_topics.prices = /boot.json の market と同じ JSON、start の返りの prices) で 1 個の値段を引く (高貴建て、priceOfKey と同じ形)。
 * 挑戦の画面 (DailyPlay が treeRunRig に入れる) と 16:00 の検算 (makeVerify) が同じ物を呼ぶ。写しが無ければ null。
 * 引く間だけ相場の控えを写しに差し替えて priceOfKey を呼び、すぐ戻す (引き方を写さないため。回す側の runPrice が 1 物 1 回に覚えるので差し替えは数回)
 */
export function topicPrice(data: PatchData, topic: { base: string; ilvl: number; prices: unknown }): ((key: string) => number) | null {
  const snap = (typeof topic.prices === "string" ? JSON.parse(topic.prices) : topic.prices) as { items?: unknown[] } | null;
  if (!snap?.items?.length) return null;
  const items = snap.items as typeof marketStore.items.value;
  const item = freshItem(data, topic.base, topic.ilvl, "rare");
  return (key) => {
    const was = marketStore.items.value;
    marketStore.items.value = items;
    try { return priceOfKey(key, item); } finally { marketStore.items.value = was; }
  };
}
