/**
 * tree-same-frame.ts — 外れの道の同じ枠探し (S-190b、11-03)。外れの道の箱には自動の ↩ を付けず、人が手を決めた時だけ 1 回、
 * 今の未設定の中から同じ形の箱を探してつなぐ。ハズレ整理の後に手を決めてできた枝は、グレーにせずその場で新しい未設定にする
 */
import type { PatchData } from "../../craft-stage/engine";
import { judgeMemo } from "./tree-judge";
import { straightUp } from "./tree-judge-link";
import { isGrayBox, junkPath } from "./tree-junk-tidy";
import type { Hand, TreeDoc } from "./tree-model";

/**
 * 箱 id に手 h を決めた後 (to = 人が行く箱。同じ手なら戻る S-51 で id が ↩ になった時はその行き先)。
 * had = 手を決める前にあった箱。pre (触媒の前のカタリスト) 付きの手は保存の手と打ち方が揃わないので探さない
 */
export function afterHandSet(data: PatchData | null, d: TreeDoc, id: string, to: string, h: Hand, had: ReadonlySet<string> | null, pre: string | null): void {
  if (had && d.tidyRan) for (const b of Object.values(d.boxes)) if (!had.has(b.id) && !b.hand && !b.done && !b.split) b.tidied = true;
  if (data && !pre) linkSameFrame(data, d, id, to, h);
}

/**
 * 同じ枠探し: 今の未設定の外れの道の箱 (決めの無い・× でない・グレーでない) のうち id と同じ形 (S-50b の箱どうし) の箱を ↩ to にする。
 * 決めた箱・木全体は見ない。選んだ手は handBack に持つ (保存して開き直しても同じ手で戻る、S-51)。つないだ箱を返す
 */
export function linkSameFrame(data: PatchData, d: TreeDoc, id: string, to: string, h: Hand): string[] {
  const j = judgeMemo(data, d), out: string[] = [];
  for (const y of Object.values(d.boxes)) {
    if (y.id === id || y.id === to || !junkPath(y) || y.hand || y.back || y.done || y.split || y.noAutoBack || isGrayBox(y)) continue;
    if (straightUp(d, y.id, to) || !j.fitsBox(y.id, id)) continue;
    y.back = to; y.autoBack = true; y.handBack = { ...h }; delete y.merged;
    out.push(y.id);
  }
  return out;
}
