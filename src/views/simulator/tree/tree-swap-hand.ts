/**
 * tree-swap-hand.ts — 手だけ替える (S-57c、スイッチ swapHand。オーナー 10-31「手だけ替えて比べる形、作って」)。
 * 下に箱のある手を替える時、下の箱を消さず、替えた手の結果の箱のうち同じ結果 (道の札 = 結果の種類・☑ の狙い・側、S-106) の箱へ下の決めを引き継ぐ。
 * 作りは保存の形の組み直し (S-104・S-105) そのまま: 今の木を打ち方 (picks) にして、その箱の手だけ替えて rebuildTree。起きなくなった結果の下の決めは要確認に残さない
 */
import type { PatchData } from "../../../services/craft-stage/engine";
import { migrateStart, subtree, type Aim, type Hand, type HandKind, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { mergedAway } from "../../../services/simulator/tree/tree-merge-open";
import { pathKeysOf, toRecipeV1, type RecipePick } from "../../../services/simulator/tree/tree-recipe-v1";
import { resetStripFolds } from "../../../services/simulator/tree/tree-strip-fold";
import { applyPick, kindOf, type OnlyOut } from "./tree-hand-plan";
import { rebuildTree } from "./tree-rebuild";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
/** 画面に出る箱か (通り抜け・まとめて描かない箱は「下の n 箱」に数えない。use-tree の lostOnBase と同じ見方) */
const drawn = (d: TreeDoc, id: string): boolean => { const b = d.boxes[id]; return !!b && b.out !== "pass" && !mergedAway(d, b); };
/** 手を替えて下が消える数 (「続ける」の時。手を決める時と同じ applyPick を写しに打つ。結果の箱が同じ手なら 0) */
export function dropCountOf(doc: TreeDoc, id: string, h: Hand, kind: HandKind, aims: Aim[], pre: string | null, only: OnlyOut): number {
  const after = clone(doc);
  applyPick(after, id, h, kind, aims, pre, only);
  return subtree(doc, id).slice(1).filter((x) => drawn(doc, x) && !after.boxes[x]).length;
}

/** 今の木の打ち方の、その箱の手だけを替えた物 */
function recipeWith(doc: TreeDoc, id: string, h: Hand, aims: Aim[], pre: string | null): TreeDoc {
  const keys = pathKeysOf(doc), rec = toRecipeV1(doc), picks: RecipePick[] = rec.picks ?? [], b = doc.boxes[id], up = b?.parent ? doc.boxes[b.parent] : null;
  const set = (p: RecipePick): void => { p.hand = clone(h); p.aims = clone(aims); };
  // 触媒の前に足したカタリストの次の手は、決めが親の札に 1 つ (S-109 の 1)
  const viaPre = b?.out === "pass" && up?.hand ? picks.find((p) => p.at === keys.get(up.id) && p.pre === up.hand!.currency) : undefined;
  if (viaPre) { set(viaPre); return rec; }
  const at = keys.get(id)!;
  let p = picks.find((x) => x.at === at);
  if (!p) { p = { at }; picks.push(p); }
  // 前に足すカタリストの箱でカタリストの種類だけ替えた時は、次の手はそのまま
  if (p.pre && kindOf(h) === "quality" && !h.quality) { p.pre = h.currency; return { ...rec, picks }; }
  set(p);
  if (pre) p.pre = pre; else delete p.pre;
  return { ...rec, picks };
}

/** 手だけ替えた木。box = 替えた箱の新しい id、gone = 下ごと消えた箱の数 (画面に出る箱)、made = 新しくできた箱 (未設定) */
export function swapHand(data: PatchData, doc: TreeDoc, id: string, h: Hand, aims: Aim[], pre: string | null): { doc: TreeDoc; box: string | null; gone: number; made: string[] } {
  const was = pathKeysOf(doc), at = was.get(id)!, rec = recipeWith(doc, id, h, aims, pre);
  const d = rebuildTree(data, rec, at);
  // 起きなくなった結果の下の決めは箱ごと消える物 (要確認に残さない)。前からの要確認はそのまま
  const had = new Set((rec.orphans ?? []).map((o) => o.at));
  const orphans = (d.orphans ?? []).filter((o) => o.why !== "gone" || !o.at.startsWith(`${at}/`) || had.has(o.at));
  if (orphans.length) d.orphans = orphans; else delete d.orphans;
  const now = pathKeysOf(d), left = new Set(now.values()), old = new Set(was.values());
  const under = subtree(doc, id).slice(1).filter((x) => drawn(doc, x));
  return { doc: d, box: [...now].find(([, k]) => k === at)?.[0] ?? null, gone: under.filter((x) => !left.has(was.get(x)!)).length, made: [...now].filter(([x, k]) => !old.has(k) && !!d.boxes[x]).map(([x]) => x) };
}

/** 手だけ替える (t.edit の中で呼ぶ。渡した d の中身を替えた木に差し替える) */
export function swapHandIn(data: PatchData, d: TreeDoc, id: string, h: Hand, aims: Aim[], pre: string | null): { box: string | null; made: string[] } {
  const r = swapHand(data, d, id, h, aims, pre);
  for (const k of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[k];
  Object.assign(d, clone(r.doc));
  migrateStart(d);
  resetStripFolds(); // 箱の id が振り直される
  return { box: r.box, made: r.made };
}
