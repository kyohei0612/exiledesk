/**
 * tree-swap-hand.ts — 手だけ替える (S-57c、スイッチ swapHand。オーナー 10-31「手だけ替えて比べる形、作って」)。
 * 下に箱のある手を替える時、下の箱を消さず、替えた手の結果の箱のうち同じ結果 (道の札 = 結果の種類・☑ の狙い・側、S-106) の箱へ下の決めを引き継ぐ。
 * 作りは保存の形の組み直し (S-104・S-105) そのまま: 今の木を打ち方 (picks) にして、その箱の手だけ替えて rebuildTree。起きなくなった結果の下の決めは要確認に残さない
 */
import type { PatchData } from "../../../services/craft-stage/engine";
import { boxAims, migrateStart, subtree, type Aim, type Hand, type HandKind, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { mergedAway } from "../../../services/simulator/tree/tree-merge-open";
import { pathKeysOf, toRecipeV1, type RecipePick } from "../../../services/simulator/tree/tree-recipe-v1";
import { resetStripFolds } from "../../../services/simulator/tree/tree-strip-fold";
import { flag } from "../../../web/release-flags";
import { applyPick, holdLinks, kindOf, type OnlyOut } from "./tree-hand-plan";
import { tidyOn } from "../../../services/simulator/tree/tree-junk-tidy";
import { rebuildTree } from "./tree-rebuild";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
/** 画面に出る箱か (通り抜け・まとめて描かない箱は「下の n 箱」に数えない。use-tree の lostOnBase と同じ見方) */
const drawn = (d: TreeDoc, id: string): boolean => { const b = d.boxes[id]; return !!b && b.out !== "pass" && !mergedAway(d, b); };
/** 札の最後の側の鍵を除いた物 */
const plain = (k: string): string => k.replace(/\[[^\]/]*\]$/, "");
/** 手を替えて下が消える数 (「続ける」の時。手を決める時と同じ applyPick を写しに打つ。結果の箱が同じ手なら 0) */
export function dropCountOf(doc: TreeDoc, id: string, h: Hand, kind: HandKind, aims: Aim[], pre: string | null, only: OnlyOut): number {
  // 今の手のままなら下は消えない (窓を開いただけで写しに打っていた、S-71b ⑪、スイッチ treeLight)
  const b = doc.boxes[id], had = (b?.outs ?? []).flatMap((o) => (doc.boxes[o]?.out === "hit" ? boxAims(doc.boxes[o]!) : []));
  if (flag("treeLight") && !pre && b?.hand && JSON.stringify(b.hand) === JSON.stringify(h) && JSON.stringify(had) === JSON.stringify(aims)) return 0;
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

/** 変わらなかった箱の自動の ↩ と整理の印を道の札で引き継ぐ (手を変えても前に整理した所はそのまま、S-192) */
function carryTidy(doc: TreeDoc, was: ReadonlyMap<string, string>, d: TreeDoc, now: ReadonlyMap<string, string>): void {
  const idOf = new Map([...now].map(([id, k]) => [k, id]));
  for (const [id, k] of was) {
    const o = doc.boxes[id], nid = idOf.get(k), n = nid ? d.boxes[nid] : undefined;
    if (!o || !n || n.hand || n.back || n.done || n.split) continue;
    if (o.tidied) n.tidied = true;
    const to = o.autoBack && o.back ? idOf.get(was.get(o.back) ?? "") : undefined;
    if (to) { n.back = to; n.autoBack = true; if (o.merged) n.merged = true; }
  }
}
type Swapped = { doc: TreeDoc; box: string | null; gone: number; made: string[] };
/** 最後の組み直し (棚で持つ・確かめの窓・使うで同じ物を 3 回組み直していた、S-71b ⑪、スイッチ treeLight) */
let lastSwap: { key: string; r: Swapped } | null = null;
/** 手だけ替えた木。box = 替えた箱の新しい id、gone = 下ごと消えた箱の数 (画面に出る箱)、made = 新しくできた箱 (未設定) */
export function swapHand(data: PatchData, doc: TreeDoc, id: string, h: Hand, aims: Aim[], pre: string | null): Swapped {
  if (!flag("treeLight")) return swapRaw(data, doc, id, h, aims, pre);
  const key = JSON.stringify([id, h, aims, pre, doc]);
  if (lastSwap?.key !== key) lastSwap = { key, r: swapRaw(data, doc, id, h, aims, pre) };
  return lastSwap.r;
}
function swapRaw(data: PatchData, doc: TreeDoc, id: string, h: Hand, aims: Aim[], pre: string | null): Swapped {
  const was = pathKeysOf(doc), at = was.get(id)!, rec = recipeWith(doc, id, h, aims, pre);
  const d = holdLinks(() => rebuildTree(data, rec, at));
  // 起きなくなった結果の下の決めは箱ごと消える物 (要確認に残さない)。前からの要確認はそのまま
  const had = new Set((rec.orphans ?? []).map((o) => o.at));
  const orphans = (d.orphans ?? []).filter((o) => o.why !== "gone" || !o.at.startsWith(`${at}/`) || had.has(o.at));
  if (orphans.length) d.orphans = orphans; else delete d.orphans;
  const now = pathKeysOf(d), old = new Set(was.values());
  if (tidyOn()) carryTidy(doc, was, d, now);
  // 替えた箱の札は組み直しで側の鍵が替わる事がある (s/any → s/any[s:2|2]、下の箱は引き継がれる)。下はその箱からの札で比べる
  const box = [...now].find(([, k]) => k === at) ?? [...now].find(([, k]) => plain(k) === plain(at)) ?? null;
  const nowAt = box?.[1] ?? at, left = new Set([...now.values()].filter((k) => k.startsWith(`${nowAt}/`)).map((k) => k.slice(nowAt.length)));
  const under = subtree(doc, id).slice(1).filter((x) => drawn(doc, x));
  const made = [...now].filter(([x, k]) => !!d.boxes[x] && k.startsWith(`${nowAt}/`) ? !old.has(at + k.slice(nowAt.length)) : !old.has(k) && k !== nowAt).map(([x]) => x);
  return { doc: d, box: box?.[0] ?? null, gone: under.filter((x) => !left.has(was.get(x)!.slice(at.length))).length, made };
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
