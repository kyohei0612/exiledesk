/**
 * tree-fixed-values.ts — 箱に出すアイテムの MOD の値を木の中で揃える (10-26 夜オーナー「基本 MOD の値は、コピーした (貼り付けた) 時はその値、
 * MOD を手で選んだ時は段 (ティア) の真ん中で固定しよう。ツリー内で同じ MOD じゃないと混乱する」)。
 * 決めは完成形の窓 (use-tree の goalItem) と同じ: 貼り付けで取り込んだ狙い (memoAims の values、同じ段の時) はその値、ほかは段の真ん中
 * (エンジンの makeStageMod に 0.5 を返す乱数)。見本の乱数の値は回す・割合・照らしにはそのまま使い、出す時だけ写して直す (TreeBox・TreeHoverCard)
 */
import { makeStageMod, tierIndexOf, type PatchData, type StageItem, type StageMod } from "../../../services/craft-stage/engine";
import { retext } from "../../../services/simulator/sim-engine";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";

const MID_ROLL = (): number => 0.5;

export function fixedValues(data: PatchData, doc: TreeDoc, item: StageItem): StageItem {
  const goals = doc.memoAims ?? [];
  const fix = (m: StageMod): StageMod => {
    const def = data.mods.get(m.modId);
    if (!def?.tiers[m.tierIndex]) return m;
    // 貼った値 (同じ MOD・同じ段・数の向きが合う時だけ、goalItem の pasted と同じ確かめ)
    const v = goals.find((a) => a.modId === m.modId && a.values?.length === m.values.length && tierIndexOf(data, a.modId, a.tier) === m.tierIndex)?.values;
    if (v && v.every((x, i) => Math.sign(x) === Math.sign(m.values[i]!) || x === 0)) return { ...m, values: [...v], ...retext(m, v, data) };
    const mid = makeStageMod(def, m.side, m.tierIndex, MID_ROLL);
    return { ...m, values: mid.values, textJa: mid.textJa, textEn: mid.textEn };
  };
  return { ...item, prefixes: item.prefixes.map(fix), suffixes: item.suffixes.map(fix) };
}
