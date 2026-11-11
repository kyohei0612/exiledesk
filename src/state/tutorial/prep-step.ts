/**
 * prep-step.ts — 動作を学ぶコースの手の用意 (T-05)。用意の手 (prep = 変成・錬金など) を打って、今の手を打てる品を作る。
 * 用意でランダムに付いた MOD が今の手と同じ系統だと打てない回があった (「エッセンスを学ぶ」のオパレンス・肉体・適応の合金・ヒステリー、E-11a)。
 * 打てるかはエンジンの useReason で見て、打てなければ乱数を替えて用意し直す (PREP_TRIES 回まで。だめなら最後の品)。
 * 画面 (craft-lesson の prepareStep) とテスト (tests/tutorial/topic-courses.test.ts) が同じこの関数を呼ぶ
 */
import { applyCurrency, freshItem, mulberry32, startFrom, useReason, type PatchData, type StageItem } from "../../services/craft-stage/engine";
import { topicKey, type TopicCourse } from "../../services/tutorial/topic-courses";
import { fullSockets } from "../for-share/stage-steps";

/** 用意し直す回数の上限 */
export const PREP_TRIES = 20;

/** rand = 0 以上 1 未満の乱数 (画面は Math.random、テストは種のある乱数)。rollSeed = 台の品の振りの種 (画面だけ) */
export function prepItem(data: PatchData, st: TopicCourse["steps"][number], base: string, itemLevel: number, rand: () => number, rollSeed?: StageItem["rollSeed"]): StageItem {
  const keep = (x: StageItem): StageItem => (rollSeed === undefined ? x : { ...x, rollSeed });
  let next: StageItem | null = null;
  for (let n = 0; n < PREP_TRIES; n++) {
    const g = mulberry32(Math.floor(rand() * 1e9));
    // startMods があれば決まった MOD から用意の手を打つ (カタリストは決まった MOD の指輪に火の品質 20%。2026-10-18)
    const from = st.startMods ? startFrom(data, base, itemLevel, { rarity: st.start ?? "rare", mods: st.startMods }, Math.floor(rand() * 1e9)) : freshItem(data, base, itemLevel, st.start);
    let made = keep(fullSockets(from));
    for (const k of st.prep ?? []) { const r = applyCurrency(data, made, k, g, []); if (r.applied) made = keep(r.item); }
    next = made;
    const key = topicKey(st, data, made);
    if (!key || useReason(data, made, key, st.omens ?? []) === null) break;
  }
  return next!;
}
