/**
 * tree-ideal-line.ts — 理想手の道を 1 本ずつ同じ列に縦に (S-142q 案、スイッチ idealLine、開発版だけ)。
 * 11-21 オーナー「理想手どうにか1列にできんかね別々のルートごとに」「分岐先から完成まで1列で見たい」「7段目の上に並ばんかな直線で」
 * 「後から見た人が分かりやすいような理想ツリーがいいのよ」(ブラック 144 経由)。
 * 理想手の箱が 2 つ以上の親から届く (同じ枠の合流、S-60・S-22g の「同じ段から指す」) 時、どの親の下に描くかを、親ごとに 1 つずつ
 * 左の親から割り当てる (まだ理想手の続きを描いていない親が受け持つ = 1 つの親が 2 つ描き・隣の親が 0 にならない)。
 * 割り当ては親を木の並びの左から順に、本物の子を先に、取られていれば前に取った親を別の子へ回して (増やす道) 決める。
 * 描く場所だけ (木の中身・回す・精査・保存は変えない)
 */
import type { TreeDoc } from "./tree-model";
import { flag, type Flag } from "../../../web/release-flags";

/** 完成への道の結果 (S-142j ⑤ の当たりの道と同じ辿り) */
const IDEAL_SIDE: ReadonlySet<string> = new Set(["hit", "any", "pass", "branch"]);
export const idealLineOn = (): boolean => flag("idealLine" as Flag);

/** スタートから当たりの側だけでたどれる箱 */
export function idealSide(d: TreeDoc): Set<string> {
  const s = new Set<string>();
  const w = (id: string): void => { if (s.has(id)) return; s.add(id); for (const k of d.boxes[id]?.outs ?? []) if (IDEAL_SIDE.has(d.boxes[k]?.out ?? "")) w(k); };
  if (d.boxes.start) w("start");
  return s;
}

/**
 * 合流の箱 t → 描く場所 (t 自身 = 本物の親の下 / 畳んだ箱 via = その親の下)。
 * groups = 行き先の箱 → 指す場所 (t 自身と、同じ段から t を指す畳んだ箱)。hidden = 描かない箱
 */
export function lineHomes(d: TreeDoc, groups: ReadonlyMap<string, string[]>, hidden: ReadonlySet<string>, cmp: (a: string, z: string) => number): Map<string, string> {
  const ideal = idealSide(d), G = new Map<string, string[]>();
  for (const [t, pl] of groups) { const l = pl.filter((a) => ideal.has(a) && !!d.boxes[a]?.parent && !hidden.has(d.boxes[a]!.parent!)); if (ideal.has(t) && l.length >= 2 && l.includes(t)) G.set(t, l); }
  const match = new Map<string, string>();
  if (!G.size) return match;
  const tOf = new Map<string, string>(), cand = new Map<string, string[]>();
  for (const [t, pl] of G) for (const a of pl) { tOf.set(a, t); const p = d.boxes[a]!.parent!; cand.set(p, [...(cand.get(p) ?? []), a]); }
  // 本物の子を先に、ほかは木の並びの順
  for (const [p, l] of cand) cand.set(p, l.sort((a, z) => Number(!G.has(a)) - Number(!G.has(z)) || cmp(a, z)));
  /** その親が合流でない理想手の続きをもう描いている (その親の列は続いている) */
  const own = (p: string): boolean => (d.boxes[p]?.outs ?? []).some((o) => ideal.has(o) && !tOf.has(o) && !hidden.has(o));
  const tryP = (p: string, seen: Set<string>): boolean => {
    for (const a of cand.get(p) ?? []) {
      const t = tOf.get(a)!;
      if (seen.has(t)) continue;
      seen.add(t);
      const cur = match.get(t);
      if (!cur || tryP(d.boxes[cur]!.parent!, seen)) { match.set(t, a); return true; }
    }
    return false;
  };
  for (const p of [...cand.keys()].sort(cmp)) if (!own(p)) tryP(p, new Set());
  return match;
}
