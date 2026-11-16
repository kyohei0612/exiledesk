/**
 * tree-ideal-first.ts — 組む順 2 段の当たりの道と「次へ」の順 (S-142j ⑤、スイッチ buildHitsFirst)。
 * 前の S-142i (スイッチ treeIdealFirst、完成を押すまで組んでいる道の横の枝を灰色) は treeTidyOnDone (本番) の下で通らないので 11-16 に消した (整理 ①)。
 * 覚えておく物は無く、手の付き方だけで決まる (開き直しても同じ)
 */
import type { TreeDoc } from "./tree-model";
import { flag } from "../../../web/release-flags";

export interface IdealPath {
  /** 組んでいる道の箱 (スタートから一番下の手の箱まで。道の先の結果の箱は含まない。buildHitsFirst の間は当たりの道の箱を全部) */ path: ReadonlySet<string>;
  /** (buildHitsFirst) 当たりの道の未設定の箱を左の枝から深くの順 (「次へ」の順、S-142j ⑤ ①)。② の後は空 */ order?: readonly string[];
}

const memo = new WeakMap<TreeDoc, { key: string; v: IdealPath | null }>();

/** 組む順 2 段 (S-142j ⑤、スイッチ buildHitsFirst、開発版だけ・実験)。treeTidyOnDone と一緒に効く */
export const hitsOn = (): boolean => flag("buildHitsFirst");
/** 組んでいる道 (buildHitsFirst の当たりの道。スイッチが閉じている・スタートが無い木は null) */
export function idealPath(d: TreeDoc): IdealPath | null {
  if (!hitsOn() || !d.boxes.start) return null;
  // 木の形と手の付き方だけで決まるので、それを鍵にして同じ木では 1 回だけ数える (箱ごとに呼ばれる)
  const key = Object.values(d.boxes).map((b) => `${b.id}:${b.outs.join(",")}:${b.hand ? 1 : 0}${b.split?.length ? 1 : 0}${b.back ? "b" : ""}${b.done ?? ""}${b.doneNow ? "n" : ""}`).join("|");
  const m = memo.get(d);
  if (m?.key === key) return m.v;
  const v = hitsWalk(d);
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
/** 当たりの道に入る結果か (消去などの「外れが消えた」は入れない。実験 junkGoneHit は 11-16 にやめた = S-50g) */
export const onHitSide = (out: string | undefined): boolean => !!out && HIT_SIDE.has(out);
const RANK = ["hit", "any", "pass", "branch", "lost", "junkGone", "junk", "blocked"];

/**
 * (S-142j ⑤) 当たりの道 = スタートから完成への道の結果だけをたどった箱を全部。灰色は無し (どの箱も押せる)。
 * 当たりの道に未設定が残る間 (①) の「次へ」の順は、当たりの道を左の枝から深く → その後に残りを上の段から。道は左端の幹のために返す
 */
function hitsWalk(d: TreeDoc): IdealPath {
  const path = new Set<string>(), order: string[] = [];
  const open = (id: string): boolean => { const b = d.boxes[id]; return !!b && !b.hand && !b.back && !b.done && !b.split?.length; };
  const kids = (id: string): string[] => (d.boxes[id]?.outs ?? []).filter((o) => !!d.boxes[o]).map((o, i) => ({ o, i })).sort((a, z) => RANK.indexOf(d.boxes[a.o]!.out) - RANK.indexOf(d.boxes[z.o]!.out) || a.i - z.i).map((x) => x.o);
  const dfs = (id: string): void => {
    if (path.has(id)) return;
    path.add(id);
    if (open(id) && id !== "start") order.push(id);
    for (const k of kids(id)) if (onHitSide(d.boxes[k]!.out)) dfs(k);
  };
  dfs("start");
  if (open("start")) order.unshift("start");
  // 灰色にはしない (S-142k の「組んでいる間は自由に手を置ける」のまま。11-14 ブラック 105 の直し)。組む順は「次へ」の案内の順だけ
  return { path, order };
}

