/**
 * tree-goal-stop.ts — 予期せぬ狙い MOD で止まった人 (S-33g ②、スイッチ goalMetTag)。オーナー 11-16「結果画面のまとめで予期せぬMODで止まったに詳細書いてあげるといいだろうな
 * 詳細ボタンだして〇段目の箱にこの手の札を刺して狙い無しの手で狙いMODが付きツリーが止まった」「詳細ボタンで止まりとして数える方で」。
 * 狙い無しの手 (当たりの箱の無い手) で完成形の狙いを段以上で満たす MOD が新しく付き、後でその狙いを ☑ した手を通ってから止まった人を、
 * 止まりのまま (人数・止まった箱は変えない) 狙い無しの手の箱ごとに数える。判定は外れの式 1 本 (tree-miss の isMissMod = エンジンの aimHits)。
 */
import type { PatchData, StageItem, StageMod } from "../../craft-stage/engine";
import { flag } from "../../../web/release-flags";
import type { Aim, TreeDoc } from "./tree-model";
import { isMissMod, missAims } from "./tree-miss";

/** 狙い無しの手で付いた完成形の狙いの MOD (box = その手の箱、aimed = 後でその狙いを ☑ した手を通った) */
export interface GoalMark { box: string; modId: string; aimed: boolean }

const modsOf = (it: StageItem): StageMod[] => [...it.prefixes, ...it.suffixes];
/** 印の MOD がまだ品に付いているか (同じ MOD を手の前後で追うだけ。当たりの判定は isMissMod) */
const held = (it: StageItem, id: string): StageMod | undefined => modsOf(it).find((m) => m.modId === id);
/** 箱の手の ☑ (当たりの箱の札) */
const hitAimsOf = (doc: TreeDoc, id: string): Aim[] => (doc.boxes[id]?.outs ?? []).flatMap((o) => { const c = doc.boxes[o]; return c?.out === "hit" && c.aim ? [c.aim] : []; });

/** 1 手ごとに呼ぶ (箱 at の手で before → after)。消えた MOD の印は捨て、☑ の手を通った印に aimed、狙い無しの手で付いた完成形の狙いに印を足す */
export function goalMarks(data: PatchData, doc: TreeDoc, at: string, before: StageItem, after: StageItem, marks: readonly GoalMark[]): GoalMark[] {
  if (!flag("goalMetTag") || !doc.memoAims?.length) return [];
  const hits = hitAimsOf(doc, at);
  if (hits.length) {
    const t = missAims(data, hits);
    return marks.filter((g) => held(after, g.modId)).map((g) => { const m = held(before, g.modId); return !g.aimed && m && !isMissMod(m, t) ? { ...g, aimed: true } : g; });
  }
  const out = marks.filter((g) => held(after, g.modId)), goal = missAims(data, doc.memoAims);
  for (const m of modsOf(after)) if (!held(before, m.modId) && !m.fractured && !m.unrevealed && !isMissMod(m, goal)) out.push({ box: at, modId: m.modId, aimed: false });
  return out;
}

/** 止まった人の印のうち、☑ の手を通り止まった時もまだ付いている物の狙い無しの手の箱 (無ければ undefined) */
export const goalStopAt = (marks: readonly GoalMark[], item: StageItem): string | undefined => marks.find((g) => g.aimed && held(item, g.modId))?.box;

/** 箱から始まりまでの段 (1 = 始まり。止まりの文の「n 段目」、tree-run の boxWord と同じ数え) */
export function stepOf(doc: TreeDoc, id: string): number {
  let n = 1;
  for (let b = doc.boxes[id]; b?.parent; b = doc.boxes[b.parent]) n++;
  return n;
}
