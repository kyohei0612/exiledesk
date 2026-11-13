/**
 * tree-ideal-first.ts — 完成を押すまで、組んでいる道の横の枝を灰色にする (S-142i、スイッチ treeIdealFirst)。
 * 11-13 オーナー「これ先理想形完成させてから動かした方が良いかな。完成を押すまで他の子枝グレーアウトで」「一旦その案で行ってみるか」。
 * 組んでいる道 = スタートから「手の付いた子が 1 つだけ」の間たどった箱。その道の箱の兄弟 (手の無い箱) とその下を灰色にする。
 * 道の先 (一番下の手の結果の箱) は全部押せる = どれに次の手を置くか選べる。置くとほかの兄弟が灰色になる。
 * 灰色にしない (null): 完成 (main) の印がある木・道の外に手がある木 (前に保存した木・人のレシピ、ブラック 95 の決め)。
 * 覚えておく物は無く、手の付き方だけで決まる (開き直しても同じ)
 */
import type { TreeDoc } from "./tree-model";
import { flag } from "../../../web/release-flags";

export interface IdealPath {
  /** 組んでいる道の箱 (スタートから一番下の手の箱まで。道の先の結果の箱は含まない。buildHitsFirst の間は当たりの道の箱を全部) */ path: ReadonlySet<string>;
  /** 灰色の箱 */ gray: ReadonlySet<string>;
  /** (buildHitsFirst) 当たりの道の未設定の箱を左の枝から深くの順 (「次へ」の順、S-142j ⑤ ①)。② の後は空 */ order?: readonly string[];
}

const memo = new WeakMap<TreeDoc, { key: string; v: IdealPath | null }>();

/** 灰色が効くか。スイッチ treeTidyOnDone の間はやめ (S-142k、11-13 オーナー: 灰色はやめて自由に組ませ、完成・最終チェックを押した時に並べ直す) */
export const idealOn = (): boolean => flag("treeIdealFirst") && !flag("treeTidyOnDone");
/** 組む順 2 段 (S-142j ⑤、スイッチ buildHitsFirst、開発版だけ・実験)。treeTidyOnDone と一緒に効く */
export const hitsOn = (): boolean => flag("buildHitsFirst");
/** 組んでいる道と灰色の箱 (灰色が効かない・灰色にしない木は null) */
export function idealPath(d: TreeDoc): IdealPath | null {
  if ((!idealOn() && !hitsOn()) || !d.boxes.start) return null;
  // 木の形と手の付き方だけで決まるので、それを鍵にして同じ木では 1 回だけ数える (箱ごとに呼ばれる)
  const key = Object.values(d.boxes).map((b) => `${b.id}:${b.outs.join(",")}:${b.hand ? 1 : 0}${b.split?.length ? 1 : 0}${b.back ? "b" : ""}${b.done ?? ""}${b.doneNow ? "n" : ""}`).join("|");
  const m = memo.get(d);
  if (m?.key === key) return m.v;
  const v = hitsOn() ? hitsWalk(d) : walk(d);
  memo.set(d, { key, v });
  return v;
}
/** 箱の「次へ」の順 (buildHitsFirst の ① の間の当たりの道の未設定だけ。ほかは null = 今どおり上の段から) */
export function idealRank(d: TreeDoc, id: string): number | null {
  const o = idealPath(d)?.order;
  if (!o?.length) return null;
  const i = o.indexOf(id);
  return i < 0 ? null : i;
}

/** 「次へ」の並べ: ① の当たりの道の未設定を先に左の枝から深く、ほかは上の段から・同じ段は左から (S-89b のまま) */
export function nextCmp(d: TreeDoc): (a: string, z: string) => number {
  const r = (id: string): number => idealRank(d, id) ?? Infinity;
  return (a, z) => r(a) - r(z) || d.boxes[a]!.y - d.boxes[z]!.y || d.boxes[a]!.x - d.boxes[z]!.x;
}

/** 完成への道の結果 (S-50g と同じ当たり・打った後に、通り抜け・分かれ目) */
const HIT_SIDE: ReadonlySet<string> = new Set(["hit", "any", "pass", "branch"]);
const RANK = ["hit", "any", "pass", "branch", "lost", "junkGone", "junk", "blocked"];

/**
 * (S-142j ⑤) 当たりの道 = スタートから完成への道の結果だけをたどった箱を全部。当たりの道に未設定が残る間 (①) は、道の外の枝で手も印も無い物とその下を灰色、
 * 「次へ」の順は左の枝から深く。未設定が無くなれば (②) 灰色なし・順なし (道は左端の幹のために返す)
 */
function hitsWalk(d: TreeDoc): IdealPath {
  const path = new Set<string>(), side: string[] = [], order: string[] = [];
  const open = (id: string): boolean => { const b = d.boxes[id]; return !!b && !b.hand && !b.back && !b.done && !b.split?.length; };
  const kids = (id: string): string[] => (d.boxes[id]?.outs ?? []).filter((o) => !!d.boxes[o]).map((o, i) => ({ o, i })).sort((a, z) => RANK.indexOf(d.boxes[a.o]!.out) - RANK.indexOf(d.boxes[z.o]!.out) || a.i - z.i).map((x) => x.o);
  const dfs = (id: string): void => {
    if (path.has(id)) return;
    path.add(id);
    if (open(id) && id !== "start") order.push(id);
    for (const k of kids(id)) if (HIT_SIDE.has(d.boxes[k]!.out)) dfs(k); else side.push(k);
  };
  dfs("start");
  if (open("start")) order.unshift("start");
  if (!order.length) return { path, gray: new Set(), order: [] };
  // 手・完成 / 失敗の印・人の ↩ が 1 つでもある枝は灰色にしない (置いた物が急に触れなくなるのを避ける、S-142i のブラック 95 の決めと同じ)
  const touched = (k: string): boolean => { const b = d.boxes[k]; return !!b && (!!b.hand || !!b.done || !!b.split?.length || (!!b.back && !b.autoBack) || b.outs.some((o) => !path.has(o) && touched(o))); };
  const gray = new Set<string>();
  const down = (k: string): void => { if (gray.has(k) || path.has(k)) return; gray.add(k); for (const o of d.boxes[k]?.outs ?? []) if (d.boxes[o]) down(o); };
  for (const s of side) if (!path.has(s) && !touched(s)) down(s);
  return { path, gray, order };
}

function walk(d: TreeDoc): IdealPath | null {
  if (Object.values(d.boxes).some((b) => b.done === "main")) return null;
  // 手のある箱 = 次の手・分かれ目。完成でない印 (失敗など) は止まりの印なので手と数えない (11-13 最終チェック 11 の A: 結果の片方に失敗を付けるともう片方が灰色)
  const busy = (id: string): boolean => { const b = d.boxes[id]; return !!b && (!!b.hand || !!b.split?.length); };
  // 完成を外した後 (この画面で押した印 doneNow が残り、完成は外れた箱): その箱までの道に戻す。手のある枝は灰色にしない (ブラック 95 の決め、置いた物が急に触れなくなるのを避ける)
  const was = Object.values(d.boxes).find((b) => b.doneNow && !b.done);
  if (was) return undone(d, was.id, busy);
  const path = new Set<string>(), gray = new Set<string>();
  for (let at: string | undefined = "start"; at; ) {
    const ks: string[] = (d.boxes[at]?.outs ?? []).filter((o) => !!d.boxes[o]);
    const on: string[] = ks.filter(busy);
    path.add(at);
    if (on.length > 1) return null;
    if (!on.length) break;
    for (const k of ks) if (k !== on[0] && !d.boxes[k]!.done) gray.add(k); // 失敗などの印を付けた箱は灰色にしない (付けた物を触れなくしない)
    at = on[0];
  }
  // 道の外に手がある = 前の作り方の木 (灰色にしない)
  for (const b of Object.values(d.boxes)) if (busy(b.id) && !path.has(b.id)) return null;
  // 灰色の箱の下も灰色
  const down = (id: string): void => { for (const o of d.boxes[id]?.outs ?? []) if (d.boxes[o] && !gray.has(o)) { gray.add(o); down(o); } };
  for (const g of [...gray]) down(g);
  return { path, gray };
}

/**
 * 完成を外した後の道 (前の完成の箱まで、その箱に手を置いた後は組む時と同じく手の付いた子が 1 つだけの間たどる) と灰色 (道の横の、下に手が 1 つも無い枝)。
 * 道の先 (一番下の手の結果の箱) は灰色にしない (11-13 最終チェック 11 の B: 外した箱に手を置くと結果が灰色で押せなかった)
 */
function undone(d: TreeDoc, id: string, busy: (id: string) => boolean): IdealPath {
  const path = new Set<string>(), gray = new Set<string>();
  for (let x: string | undefined = id; x && d.boxes[x]; x = d.boxes[x]!.parent ?? undefined) path.add(x);
  let end = id;
  for (;;) {
    const on = (d.boxes[end]?.outs ?? []).filter((o) => !!d.boxes[o] && busy(o));
    if (on.length !== 1) break;
    end = on[0]!; path.add(end);
  }
  const touched = (k: string): boolean => busy(k) || !!d.boxes[k]?.done || (d.boxes[k]?.outs ?? []).some((o) => !!d.boxes[o] && touched(o));
  const down = (k: string): void => { gray.add(k); for (const o of d.boxes[k]?.outs ?? []) if (d.boxes[o] && !gray.has(o)) down(o); };
  for (const p of path) if (p !== end) for (const k of d.boxes[p]?.outs ?? []) if (d.boxes[k] && !path.has(k) && !touched(k)) down(k);
  return { path, gray };
}

/** 箱が灰色か (組んでいる道の横の枝) */
export const idealGray = (d: TreeDoc, id: string): boolean => !!idealPath(d)?.gray.has(id);
