/**
 * use-preview.ts — 持っている物を打つ前に、アイテムの上で光らせる物 (2026-10-17 オーナー「消去とかも持ったらどれが消えるか削減みたいな文字色で光らせたい。
 * エッセンス然り冒涜で入れ替わるなら入れ替わる奴。高貴とか追加する系は空いている枠を光らせる、偉大ならマックス 4 枠」)。
 *
 * カレンシーごとには書かない。打つ処理と同じ planSpec (対象・制約・お告げの効き目) と動作の部品 (actions) をたどる:
 *   remove → 消える候補 (土台 spec/basis.ts の removalOf = 打つ処理と同じ: お告げの側・削りのお告げ・付ける側が満杯ならその側・光のお告げは冒涜だけ。当たると手ごと不成立の上限超えの側 (E-25) は光らせない)
 *   reroll → 数値が変わる MOD (固定と未発現以外。祝福のお告げは暗黙だけなので無し)、fracture → 固定される候補
 *   addUnrevealed → 骨で入れ替わる物 (アビサルロードの紋章、満杯の側の候補)
 *   add → 付く空き (お告げの側 ∩ 空きのある側に、付く数まで。大いなる高貴なら 2 ずつ = 最大 4)。消してから付ける手 (カオス) は空きを光らせない
 * 付ける手のうちエッセンス・冒涜は空きを光らせない (付く側が決まっている / 付ける作業は要らない、オーナー)。
 * お告げを掛けていない時は何も光らせない (お告げで変わる所を見せる物)
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { allMods, limitOf, listOf, rerollableMods, room, SIDES, unfracturable } from "./stage-core";
import { addSidesOf, boneSlotOf, removalOf } from "./spec/basis";
import type { StageItem, StageMod, StageSide } from "./types";
import { planSpec } from "./spec/run-spec";
import { prepareEssence } from "./spec/essence-specs";
import { unrevealedPlan } from "./spec/parts-unrevealed";

export interface UsePreview {
  /** 打つと消える・入れ替わる・数値が変わる・固定される候補の MOD (modId) */
  change: string[];
  /** 付く空き (側ごとに光らせる枠の数) */
  open: Record<StageSide, number>;
}

const fixedRng = (): number => 0.5;

/** o.essence = エッセンスはお告げが無くても光らせる (シミュの手の窓・打つ前の箱、10-28 深夜オーナー「エッセンス持ってもどこをMODが消えるか表示されてないね」。エミュは前のまま) */
export function previewUse(data: PatchData, item: StageItem, key: string, omens: readonly string[], o: { essence?: boolean } = {}): UsePreview | null {
  const plan = planSpec(data, item, key, omens);
  if (!plan || plan.block) return null;
  // 光らせるのは、この手に効くお告げを掛けている時だけ (2026-10-17 オーナー「お告げオンの時にカレンシー持ったらで限定、お告げオフは何でもいい」。フラクチャーは完全ランダムなので光らない)
  if (!plan.used.length && !(o.essence && plan.actions.some((a) => "addEssence" in a))) return null;
  const { mods, actions } = plan;
  const change = new Set<string>();
  const open: Record<StageSide, number> = { prefix: 0, suffix: 0 };
  const mark = (ms: readonly StageMod[]): void => { for (const m of ms) change.add(m.modId); };
  const essence = actions.some((a) => "addEssence" in a) ? prepareEssence(data, item, key, fixedRng) : null;
  let cur: StageItem = item;
  let removes = false;
  for (const a of actions) {
    if ("setRarity" in a) cur = { ...cur, rarity: a.setRarity };
    else if ("remove" in a) {
      removes = true;
      // 消える候補は打つ処理と同じ土台 (basis.ts の removalOf)。打つ前に分かって弾かれる組・当たると手ごと不成立の MOD (E-25) は光らせない
      const R = removalOf(cur, a.remove, mods, essence?.side);
      if ("all" in R) mark(R.all);
      else if ("pick" in R) mark(R.pick(cur).filter((m) => !R.voids(cur, m)));
    } else if ("reroll" in a) {
      if (!mods.implicitOnly) mark(rerollableMods(cur));
    } else if ("fracture" in a) mark(allMods(cur).filter((m) => !unfracturable(data, cur, m)));
    else if ("addUnrevealed" in a) {
      if (a.addUnrevealed.fill) continue;
      const p = unrevealedPlan(data, cur, a.addUnrevealed, mods);
      // 付ける側が満杯なら、その側の固定以外のどれかが消えて入れ替わる (枠は打つ処理と同じ土台の boneSlotOf。上限を超えた側には付かない = 光らせない、E-25)
      const sides = p.mark ? [p.mark.side] : p.fixed ? [p.fixed] : SIDES.filter((s) => room(cur, s)).length ? [] : SIDES;
      for (const s of sides) {
        const slot = boneSlotOf(cur, s, p.mark);
        if ("mark" in slot) mark([slot.mark]);
        else if ("replace" in slot) mark(slot.replace);
      }
    } else if ("add" in a && !removes) {
      const n = mods.addCount ?? a.add.n;
      for (const s of addSidesOf(mods)) open[s] = Math.min(n, Math.max(0, limitOf(cur, s) - listOf(cur, s).length));
    }
  }
  return { change: [...change], open };
}
