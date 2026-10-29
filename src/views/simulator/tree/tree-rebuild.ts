/**
 * tree-rebuild.ts — 保存の形 v1 (打ち方だけ) から木を組み直す (S-105〜S-107、スイッチ recipeV1)。
 * スタートから上の段の順 (同じ段は結果の順) に、決めのある箱で保存した手を打ち直す = 画面で手を決めた時と同じ applyPick (結果の箱は今の決まり、自動の ↩ も付け直す)。
 * 人の手のある箱は人の手が先 (自動の ↩ で上書きしない)、完成 / 失敗だけの箱は付いた自動の ↩ を外して印を付ける。
 * 札の無くなった決めは要確認 (orphans、⑦20)。前の形の木から開いた時だけ、前に無かった札の箱に「組み直しで増えた」(fresh、⑦19、保存しない)
 */
import type { PatchData } from "../../../services/craft-stage/engine";
import { migrateStart, TREE_SCHEMA_N, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { childKeysOf, isRecipeV1, pathKeysOf, premiseOf, toRecipeV1, type RecipeOrphan } from "../../../services/simulator/tree/tree-recipe-v1";
import { applyPick, kindOf, onlyOf } from "./tree-hand-plan";
import { flag } from "../../../web/release-flags";

export function rebuildTree(data: PatchData, src: TreeDoc): TreeDoc {
  const rec = toRecipeV1(src), d = premiseOf(rec, `exiledesk-tree/${TREE_SCHEMA_N}`);
  migrateStart(d);
  const picks = new Map((rec.picks ?? []).map((p) => [p.at, p]));
  const used = new Set<string>();
  const q: Array<[string, string]> = [["start", "s"]];
  while (q.length) {
    const [id, key] = q.shift()!;
    if (!d.boxes[id]) continue;
    const p = picks.get(key);
    if (p) {
      used.add(key);
      if (p.hand) { const aims = p.aims ?? [], pre = p.pre ?? null; applyPick(d, id, p.hand, kindOf(p.hand), aims, pre, onlyOf(data, d, id, p.hand, pre, aims)); }
      const b = d.boxes[id];
      if (b) {
        if ((p.done || p.noAutoBack) && b.autoBack) { b.back = null; delete b.autoBack; delete b.merged; delete b.handBack; }
        if (p.done && !b.hand && !b.back) b.done = p.done;
        if (p.note) b.note = p.note;
        if (p.unwanted) b.unwanted = [...p.unwanted];
        if (p.noAutoBack) b.noAutoBack = true;
      }
    }
    q.push(...childKeysOf(d, id, key));
  }
  const gone = [...picks.values()].filter((p) => !used.has(p.at)).map((p): RecipeOrphan => ({ at: p.at, why: "gone", raw: p }));
  const orphans = [...(rec.orphans ?? []), ...gone];
  if (orphans.length) d.orphans = orphans;
  // 前の形の木 (箱を全部持っている) から開いた時だけ、前に無かった札の箱が分かる
  if (!isRecipeV1(src)) {
    const before = new Set(pathKeysOf(src).values());
    for (const [id, k] of pathKeysOf(d)) if (!before.has(k)) d.boxes[id]!.fresh = true;
  }
  return d;
}

/** 開く木の形 (use-tree の open): スイッチ recipeV1 の下と v1 の木は組み直す。データがまだ無ければ前提だけ (wait = データが来たら開き直す) */
export function openForm(tree: TreeDoc, data: PatchData | null | undefined): { doc: TreeDoc; wait: boolean } {
  if (!isRecipeV1(tree) && !flag("recipeV1")) return { doc: tree, wait: false };
  return data ? { doc: rebuildTree(data, tree), wait: false } : { doc: premiseOf(toRecipeV1(tree), `exiledesk-tree/${TREE_SCHEMA_N}`), wait: true };
}
