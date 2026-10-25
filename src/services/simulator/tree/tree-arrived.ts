/**
 * tree-arrived.ts — 箱の見本の元 = 木を回して実際にその箱に着いた人のアイテム (シミュ 26 本目 10-25、置き換え一覧の 8・9)。
 * 前は親の見本に親の手を打ち「結果がその箱になるまで引き直す・引けなければ指名で付ける」形をツリーが自分で作っていて、照らしの「見本 1 つで比べている」ずれの元だった。
 * ここは 100 人回し (tree-run) と同じ道を PEOPLE 人たどり、箱に着いた時のアイテム (onArrive) を箱ごとに KEEP 個まで覚えるだけ (打つのも分けるのも tree-run・エンジン)。
 * 同じ木 (doc) なら 1 回だけ回す。誰も着かない箱は tree-sample の今までの作り方へ戻る
 */
import type { PatchData, StageItem } from "../../craft-stage/engine";
import type { TreeDoc } from "./tree-model";
import { runTreeSteps } from "./tree-run";
import { withTreeTune } from "./tree-tune";

/** 見本を取るために回す人数 */
const PEOPLE = 40;
/**
 * 1 人の手の上限 (100 人回しは 20000)。戻りの輪で打ち止めまで回る木は 1 人 1 秒かかり、40 人で 25 秒画面が固まった (猿 m-76)。
 * 箱に着くのは始めの方の手なので、見本にはこれで足りる
 */
const STEPS = 200;
/** 回す時間の上限 (ミリ秒、1 人目は必ず最後まで)。超えたらそこまでの人の物で見本にする */
const BUDGET_MS = 300;
/** 箱ごとに覚える数 (結果が 1 通りかを見る見本の数 SINGLE_SEEDS と同じ) */
const KEEP = 8;
/** 覚えておく木の数 (タブ・精査の写し) */
const CACHE = 6;

type Arrived = ReadonlyMap<string, readonly StageItem[]>;
const byData = new WeakMap<PatchData, Map<string, Arrived>>();
const keyOfDoc = new WeakMap<TreeDoc, string>();
let running = false;

/** 回す結果に効く物だけの鍵 (同じ中身の木は同じ鍵。Vue の包みと元の物でも同じ) */
function keyOf(doc: TreeDoc): string {
  let k = keyOfDoc.get(doc);
  if (k == null) {
    // 箱の位置 (x・y)・メモは回す結果に効かないので入れない (引っ張るたびに回し直さない)
    const boxes = Object.values(doc.boxes).map(({ x: _x, y: _y, note: _n, ...b }) => b);
    k = JSON.stringify([doc.base, doc.itemLevel, doc.start, doc.fracture, doc.startRandom, doc.memoAims, doc.tune, boxes]);
    keyOfDoc.set(doc, k);
  }
  return k;
}

/** その箱に着いた人のアイテム (着いた順、KEEP 個まで)。誰も着かない・回している最中は空 */
export function arrivedAt(data: PatchData, doc: TreeDoc, boxId: string): readonly StageItem[] {
  if (running) return [];
  let cache = byData.get(data);
  if (!cache) byData.set(data, (cache = new Map()));
  const k = keyOf(doc);
  let got = cache.get(k);
  if (!got) {
    const m = new Map<string, StageItem[]>();
    running = true;
    try {
      withTreeTune(doc, () => {
        const g = runTreeSteps(data, doc, {
          n: PEOPLE, seed: 1, price: () => 0, capDiv: Infinity, capSteps: STEPS,
          onArrive: (box, item) => { const a = m.get(box); if (!a) m.set(box, [item]); else if (a.length < KEEP) a.push(item); },
        });
        const t0 = Date.now();
        while (!g.next().done && Date.now() - t0 < BUDGET_MS);
      });
    } finally { running = false; }
    got = m;
    cache.set(k, got);
    if (cache.size > CACHE) cache.delete(cache.keys().next().value!);
  }
  return got.get(boxId) ?? [];
}
