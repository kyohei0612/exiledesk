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
import { judgeMemo } from "../../../services/simulator/tree/tree-judge";

export function rebuildTree(data: PatchData, src: TreeDoc): TreeDoc {
  const rec = toRecipeV1(src), d = premiseOf(rec, `exiledesk-tree/${TREE_SCHEMA_N}`);
  migrateStart(d);
  const picks = new Map((rec.picks ?? []).map((p) => [p.at, p]));
  // 保存の札とその上の札の全部 (子の札を探す時に、決めのある道か見る)
  const onPath = new Set([...picks.keys()].flatMap((k) => k.split("/").map((_, i, a) => a.slice(0, i + 1).join("/"))));
  const used = new Set<string>(), decided: string[] = [];
  // [箱, 今の札, 保存の札]。側の鍵の無い保存の札 (S-65 より前の木) は、側に分かれた箱の全部に同じ決めを付ける (S-106・S-65「両方の側を受ける」)
  const q: Array<[string, string, string]> = [["start", "s", "s"]];
  while (q.length) {
    const [id, key, at] = q.shift()!;
    if (!d.boxes[id]) continue;
    const p = picks.get(at);
    if (p) {
      used.add(at);
      if (p.hand) { const aims = p.aims ?? [], pre = p.pre ?? null; applyPick(d, id, p.hand, kindOf(p.hand), aims, pre, onlyOf(data, d, id, p.hand, pre, aims)); }
      const b = d.boxes[id];
      if (b) {
        if ((p.done || p.noAutoBack) && b.autoBack) { b.back = null; delete b.autoBack; delete b.merged; delete b.handBack; }
        if (p.done && !b.hand && !b.back) { b.done = p.done; decided.push(id); }
        if (p.note) b.note = p.note;
        if (p.unwanted) b.unwanted = [...p.unwanted];
        if (p.noAutoBack) b.noAutoBack = true;
      }
    }
    for (const [cid, ck] of childKeysOf(d, id, key)) {
      const tail = ck.slice(key.length), cand = at + tail, bare = at + tail.replace(/\[[^\]]*\](~\d+)?$/, "");
      q.push([cid, ck, onPath.has(cand) || !onPath.has(bare) ? cand : bare]);
    }
  }
  if (flag("judgeOne")) mergeIntoDecided(data, d, decided);
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

/**
 * 完成 / 失敗を付けた箱へ、同じ段・同じ中身で決めの無い箱をまとめ直す (S-66 のまとめ先は作った順より人の決めが先、S-105)。
 * 組み直しは上の段から作るので、前の木で人が決めた箱より先に同じ中身の箱ができ、そちらがまとめ先になって決めの無い箱に人が流れた
 * (10-29 共有の木 GFFzxueM: 前は 3 箱が「失敗」の箱にまとまっていたのに、組み直すと決めの無い箱へまとまって止まり 0 → 32)。そこを指していた ↩ も付け替える
 */
function mergeIntoDecided(data: PatchData, d: TreeDoc, decided: readonly string[]): void {
  const j = judgeMemo(data, d), depth = (id: string): number => { let n = 0; for (let b = d.boxes[id]; b?.parent; b = d.boxes[b.parent]) n++; return n; };
  for (const x of decided) {
    for (const l of Object.values(d.boxes)) {
      if (l.id === x || l.hand || l.done || l.split || l.noAutoBack || (l.back && !l.autoBack) || !OPEN.has(l.out) || depth(l.id) !== depth(x) || !j.fitsBox(l.id, x)) continue;
      for (const o of Object.values(d.boxes)) if (o.autoBack && o.back === l.id) o.back = x;
      l.back = x; l.autoBack = true; l.merged = true;
    }
  }
}
const OPEN: ReadonlySet<string> = new Set(["junk", "any", "junkGone", "lost"]);

/** 開く木の形 (use-tree の open): スイッチ recipeV1 の下と v1 の木は組み直す。データがまだ無ければ前提だけ (wait = データが来たら開き直す) */
export function openForm(tree: TreeDoc, data: PatchData | null | undefined): { doc: TreeDoc; wait: boolean } {
  if (!isRecipeV1(tree) && !flag("recipeV1")) return { doc: tree, wait: false };
  return data ? { doc: rebuildTree(data, tree), wait: false } : { doc: premiseOf(toRecipeV1(tree), `exiledesk-tree/${TREE_SCHEMA_N}`), wait: true };
}
