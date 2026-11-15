/**
 * tree-ele-reuse.ts — 「いずれかの元素耐性」の使い回し (S-10h ⑧、11-15 夜オーナー「複数使いまわしできると思ってた」)。
 * 手の窓の候補に、完成形に置いた本が全部付いた品でも「品に付いている『いずれか』の数 + 1」番目の札を足す
 * (段は完成形の一番緩い本と同じ。品のサフィに空きがある間、3 番まで)。完成に要るのは完成形に置いた本数だけ (この札は完成形に入れない)。
 * 札の modId は「いずれか」の名前の印と同じく火・冷気・雷の modId を借りる (まだ候補・完成形の「いずれか」に使っていない元素から)
 */
import { limitOf, type PatchData, type StageItem } from "../../craft-stage/engine";
import { aimHeldOn } from "./tree-aim";
import { eleIdsOf } from "./tree-ele-any";
import type { Aim } from "./tree-model";

const MAX_ELE = 3;

/** n 番の札 (段は全部 tier の緩い方を足して n 本に。steps は置いた本の段) */
function nth(base: Aim, modId: string, n: number, steps: readonly number[], loose: number): Aim {
  const { fractured: _f, via: _v, values: _x, ...r } = base;
  const t = [...steps].sort((x, y) => x - y).slice(0, n);
  while (t.length < n) t.push(loose);
  return { ...r, modId, tier: loose, anyEle: n, eleTiers: t };
}

/** 候補 pool に「付いた数 + 1」番目の「いずれか」を足す (足す物が無ければ pool のまま) */
export function withEleReuse(data: PatchData, item: StageItem, pool: readonly Aim[]): Aim[] {
  const any = pool.filter((a) => a.anyEle);
  if (!any.length || limitOf(item, "suffix") - item.suffixes.length <= 0) return [...pool];
  const steps = any.map((a) => a.tier), loose = Math.max(...steps), lead = any[0]!;
  // 品に付いている「いずれか」の数 (緩い段で 1, 2, 3 番が付いているか)
  let held = 0;
  for (let n = 1; n <= MAX_ELE; n++) if (aimHeldOn(data, item, nth(lead, lead.modId, n, [], loose), { sameText: true })) held = n;
  const next = held + 1, top = Math.max(...any.map((a) => a.anyEle!));
  if (next > MAX_ELE || next <= top) return [...pool];
  const used = new Set(pool.map((a) => a.modId)), ids = eleIdsOf(data, lead.modId); // ☑ の鍵 (modId|段) が候補のほかの札とぶつからない元素を借りる
  const modId = ids.find((id) => !used.has(id));
  if (!modId) return [...pool]; // 元素が全部ほかの札に使われている = 残りは元素を決めた狙い (数えない系統) なので次の番号は付かない
  return [...pool, nth(lead, modId, next, steps, loose)];
}
