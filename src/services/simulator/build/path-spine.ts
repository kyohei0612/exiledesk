/**
 * シミュレーターの入口 ④ (2026-10-22 オーナー「③ の道が木の背骨。ツリーで外れ MOD の処理 (行き先) を決める」)。
 * ③ で打った手を 1 手ずつ、木の始まりの箱から同じ手で置き (tree-model の setHand = 画面の棚で手を選んだのと同じ)、選んだ結果の箱へ進む:
 * 狙いが付いた = 当たりの箱 (札はその狙い)、狙いが付かない = 外れの箱、消去で外れが消えた / 狙いが消えた = その箱、カタリスト = 通り抜け。
 * 狙いが全部付いた箱に完成の印。外れの箱の行き先はツリーで決める (ここでは置かない)
 */
import { allMods, type StageItem, type StageMod } from "../../craft-stage/engine";
import { kindOfCurrency } from "../tree/tree-hands";
import { setDone, setHand, type Aim, type Hand, type OutKind, type TreeDoc } from "../tree/tree-model";

/** ③ の 1 手 (クラフト台の工程の手から: カレンシー・お告げ・打つ前・付いた / 消えた MOD) */
export interface SpineStep { currency: string; omens: string[]; before: StageItem; added: readonly StageMod[]; removed: readonly StageMod[] }
/** 狙い (木の札の段 tier と、当たりの判定の tierIndex) */
export interface SpineTarget extends Aim { tierIndex: number }

const hitOf = (m: StageMod, ts: readonly SpineTarget[]): SpineTarget | undefined => (m.unrevealed ? undefined : ts.find((t) => m.modId === t.modId && m.tierIndex >= t.tierIndex));

export function buildSpine(d: TreeDoc, steps: readonly SpineStep[], targets: readonly SpineTarget[]): void {
  let cur = "start";
  let held = new Set<string>();
  if (steps[0]) for (const m of allMods(steps[0].before)) { const t = hitOf(m, targets); if (t) held.add(t.modId); }
  for (const st of steps) {
    const kind = kindOfCurrency(st.currency);
    const hand: Hand = { currency: st.currency, omens: [...st.omens], catalyst: null, quality: 0 };
    const got = st.added.map((m) => hitOf(m, targets)).find((t): t is SpineTarget => !!t && !held.has(t.modId));
    const lost = st.removed.some((m) => !!hitOf(m, targets));
    // 進む先の箱の種類 (setHand が作る結果の箱のどれか)
    const want: OutKind = kind === "quality" ? "pass" : kind === "remove" ? (lost ? "lost" : "junkGone") : lost ? "lost" : got ? "hit" : kind === "essence" ? "hit" : "junk";
    setHand(d, cur, hand, kind, got ? [{ modId: got.modId, tier: got.tier }] : []);
    const outs = d.boxes[cur]!.outs.map((o) => d.boxes[o]!);
    const next = outs.find((b) => b.out === want && (want !== "hit" || !got || b.aim?.modId === got.modId)) ?? outs.find((b) => b.out === want) ?? outs[0];
    if (!next) break;
    cur = next.id;
    for (const m of st.removed) { const t = hitOf(m, targets); if (t) held.delete(t.modId); }
    if (got) held = new Set([...held, got.modId]);
  }
  if (cur !== "start" && targets.every((t) => held.has(t.modId)) && d.boxes[cur]?.out === "hit") setDone(d, cur, "main");
}
