/**
 * tree-goal-stop.ts — 予期せぬ狙い MOD で止まった人 (S-33g ②、スイッチ goalMetTag)。オーナー 11-16「結果画面のまとめで予期せぬMODで止まったに詳細書いてあげるといいだろうな
 * 詳細ボタンだして〇段目の箱にこの手の札を刺して狙い無しの手で狙いMODが付きツリーが止まった」「詳細ボタンで止まりとして数える方で」。
 * 狙い無しの手 (当たりの箱の無い手) で完成形の狙いを段以上で満たす MOD が新しく付き、後でその狙いを ☑ した手を通ってから止まった人を、
 * 止まりのまま (人数・止まった箱は変えない) 狙い無しの手の箱ごとに数える。判定は外れの式 1 本 (tree-miss の isMissMod = エンジンの aimHits)。
 * エッセンス / 合金と同じ系統の MOD が前の手で付いて打てずに止まった人も同じ欄の詳細へ (S-33e ⑧、スイッチ essSameStop。オーナー 11-16「エッセンスと同じ扱いとかなしにして予期せぬ枠でだしたら？」)
 */
import { familiesOf, type PatchData, type StageItem, type StageMod } from "../../craft-stage/engine";
import { essenceTierVerdict } from "../../craft-stage/apply-essence";
import { flag } from "../../../web/release-flags";
import { tr } from "../../../i18n/lang";
import type { Aim, TreeDoc } from "./tree-model";
import { isMissMod, missAims } from "./tree-miss";
import { essenceHold } from "./tree-outcome";

/** 狙い無しの手で付いた完成形の狙いの MOD (box = その手の箱、aimed = 後でその狙いを ☑ した手を通った)。src = どの手で付いたかだけの印 (S-33e ⑧、どの手でも) */
export interface GoalMark { box: string; modId: string; aimed: boolean; src?: true }

const modsOf = (it: StageItem): StageMod[] => [...it.prefixes, ...it.suffixes];
/** 印の MOD がまだ品に付いているか (同じ MOD を手の前後で追うだけ。当たりの判定は isMissMod) */
const held = (it: StageItem, id: string): StageMod | undefined => modsOf(it).find((m) => m.modId === id);
/** 箱の手の ☑ (当たりの箱の札) */
const hitAimsOf = (doc: TreeDoc, id: string): Aim[] => (doc.boxes[id]?.outs ?? []).flatMap((o) => { const c = doc.boxes[o]; return c?.out === "hit" && c.aim ? [c.aim] : []; });

/** 1 手ごとに呼ぶ (箱 at の手で before → after)。消えた MOD の印は捨て、☑ の手を通った印に aimed、狙い無しの手で付いた完成形の狙いに印を足す */
export function goalMarks(data: PatchData, doc: TreeDoc, at: string, before: StageItem, after: StageItem, marks: readonly GoalMark[]): GoalMark[] {
  // どの手で付いたか (S-33e ⑧): 新しく付いた MOD は全部この手の箱に
  const src: GoalMark[] = flag("essSameStop") ? [...marks.filter((g) => g.src && held(after, g.modId)), ...modsOf(after).filter((m) => !held(before, m.modId)).map((m) => ({ box: at, modId: m.modId, aimed: false, src: true as const }))] : [];
  return [...src, ...goalOnly(data, doc, at, before, after, marks.filter((g) => !g.src))];
}
function goalOnly(data: PatchData, doc: TreeDoc, at: string, before: StageItem, after: StageItem, marks: readonly GoalMark[]): GoalMark[] {
  if (!flag("goalMetTag") || !doc.memoAims?.length) return [];
  const hits = hitAimsOf(doc, at);
  if (hits.length) {
    const t = missAims(data, hits);
    return marks.filter((g) => held(after, g.modId)).map((g) => { const m = held(before, g.modId); return !g.aimed && m && !isMissMod(m, t, before) ? { ...g, aimed: true } : g; });
  }
  const out = marks.filter((g) => held(after, g.modId)), goal = missAims(data, doc.memoAims);
  for (const m of modsOf(after)) if (!held(before, m.modId) && !m.fractured && !m.unrevealed && !isMissMod(m, goal, after)) out.push({ box: at, modId: m.modId, aimed: false });
  return out;
}

/**
 * 止まった人の印のうち、☑ の手を通り止まった時もまだ付いている物の狙い無しの手の箱 (無ければ undefined)。
 * noBox = 形の合う箱が無くて止まった。スイッチ oddStop (S-21b、11-18 オーナー「それは予期せぬでしょりするんじゃなかったの」) の間は、☑ の手を通らなくても
 * 狙い無しの手で偶然付いた狙いを持ったまま形の合う箱が無く止まった人を予期せぬ狙い MOD に数える (前は「狙いが付いた」の箱を足していた)
 */
export const goalStopAt = (marks: readonly GoalMark[], item: StageItem, noBox = false): string | undefined => {
  const loose = noBox && flag("oddStop");
  return marks.find((g) => !g.src && (g.aimed || loose) && held(item, g.modId))?.box;
};

/**
 * エッセンス / 合金の手 key を品 item に打てない (前の手で同じ系統の普通の MOD が付いた = 塞がる・同格以上とも) 時の止まり (S-33e ⑧、スイッチ essSameStop)。
 * box = その MOD が付いた手の箱 (始まりから付いていた等で分からなければ無し)。打てる・スイッチ off は null
 */
export function essStopOf(data: PatchData, key: string, item: StageItem, marks: readonly GoalMark[]): { box?: string; why: string } | null {
  if (!flag("essSameStop") || !essenceHold(data, item, key)) return null;
  const fams = essenceTierVerdict(data, item, key)?.families ?? [];
  const m = modsOf(item).find((x) => { const md = data.mods.get(x.modId); return !!md && !x.crafted && familiesOf(md).some((f) => fams.includes(f)); });
  const box = m ? marks.find((g) => g.src && held(item, g.modId) === m)?.box : undefined;
  return { ...(box ? { box } : {}), why: tr("エッセンス / 合金と同じ系統の MOD が前の手で付いていて打てない (予期せぬ狙い MOD)", "A mod of the same group as the essence / alloy was added by an earlier craft, so it can't be used (unexpected target mod)") };
}

/** 箱から始まりまでの段 (1 = 始まり。止まりの文の「n 段目」、tree-run の boxWord と同じ数え) */
export function stepOf(doc: TreeDoc, id: string): number {
  let n = 1;
  for (let b = doc.boxes[id]; b?.parent; b = doc.boxes[b.parent]) n++;
  return n;
}
