/**
 * tree-old-same.ts — 差の無い古いレシピは印を出さない (S-104g ⑥、スイッチ recipeFrozen)。
 * 古いレシピ (S-104e) として保存の写しのまま開いた木を、開いた後に裏で 1 回だけ今の決まりで組み直し (「新しい版で組み直す」と同じ組み方)、
 * 出す木が同じなら印を外す (tree-built の markOldSame)。置き場は触らない。組むのに SAME_MS を超える重い木・途中で木が替わった時は比べず印を出したまま
 */
import { ref, type ShallowRef } from "vue";
import type { PatchData } from "../../../services/craft-stage/engine";
import { migrateStart, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { markOldSame, sameShown } from "../../../services/simulator/tree/tree-built";
import { tidyEleAny } from "../../../services/simulator/tree/tree-ele-any";
import { rebuildInSteps } from "./tree-rebuild";
import { tidyJunk } from "./tree-hand-plan";
import { DEV_BUILD } from "../../../web/release-flags";

/** 裏で組む時間の上限 (超えたら重い木 = 印を出したまま) */
const SAME_MS = 4000;
/** 比べている間 (古いレシピの 1 行を出さない = 差の無い木で一瞬出て消えない。印の決め = 100 人回す・触る前の組み直しは今どおり) */
export const oldChecking = ref(false);

/** 開いた木を置く時と同じ整え (use-tree の putTree → edit の開く時の道) */
function shownOf(data: PatchData, t: TreeDoc): TreeDoc {
  const d = JSON.parse(JSON.stringify(t)) as TreeDoc;
  migrateStart(d); tidyEleAny(data, d);
  if (d.boxes.start) tidyJunk(d, true);
  return d;
}

/** (開発版だけ) 差のある所: 頭の鍵と箱の id */
function diffOf(a: TreeDoc, b: TreeDoc): string {
  const ka = a as unknown as Record<string, unknown>, kb = b as unknown as Record<string, unknown>, s = JSON.stringify;
  const keys = [...new Set([...Object.keys(ka), ...Object.keys(kb)])].filter((k) => k !== "boxes" && !["built", "oldBuilt", "examples", "dailyPast", "builtZ", "droppedOld", "midDropped"].includes(k) && s(ka[k]) !== s(kb[k]));
  const ids = [...new Set([...Object.keys(a.boxes), ...Object.keys(b.boxes)])];
  const nb = (x: unknown): string => { if (!x) return ""; const { x: _x, y: _y, ...r } = x as { x: number; y: number }; return s(r); };
  const boxes = ids.filter((i) => nb(a.boxes[i]) !== nb(b.boxes[i]));
  const one = boxes[0] ? (() => { const x = (a.boxes[boxes[0]] ?? {}) as unknown as Record<string, unknown>, y = (b.boxes[boxes[0]] ?? {}) as unknown as Record<string, unknown>; return [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => k !== "x" && k !== "y" && s(x[k]) !== s(y[k])).map((k) => `${k}: ${s(x[k])?.slice(0, 120)} / ${s(y[k])?.slice(0, 120)}`).join(" | "); })() : "";
  return `鍵 [${keys.map((k) => `${k}=${s(ka[k])?.slice(0, 200)}/${s(kb[k])?.slice(0, 200)}`).join(",")}] 箱 ${boxes.length}/${ids.length} [${boxes.slice(0, 6).join(",")}] ${one}`;
}

/** tree = 開いた保存の形、doc = 画面の木 (古い写しのまま置いた後)。同じと分かれば印を外して true */
export async function checkOldSame(data: PatchData, tree: TreeDoc, doc: ShallowRef<TreeDoc>): Promise<boolean> {
  const ob = doc.value.oldBuilt;
  if (!ob) return false;
  const { built: _b, oldBuilt: _o, builtZ: _z, dailyPast: _p, ...src } = tree;
  const end = performance.now() + SAME_MS;
  const live = (): boolean => performance.now() < end && JSON.stringify(doc.value.oldBuilt) === JSON.stringify(ob);
  oldChecking.value = true;
  try {
    const t0 = performance.now();
    const re = await rebuildInSteps(data, src as TreeDoc, () => {}, live, 30);
    const ok = !!re && live() && sameShown(shownOf(data, re), doc.value);
    if (DEV_BUILD) console.info("[old-same]", ok ? "同じ" : !re ? "組めない・時間切れ" : !live() ? "木が替わった・時間切れ" : "差あり", Math.round(performance.now() - t0) + "ms", re && !ok ? diffOf(shownOf(data, re), doc.value) : "");
    if (!ok) return false;
    markOldSame(ob);
    return true;
  } catch { return false; } finally { oldChecking.value = false; }
}
