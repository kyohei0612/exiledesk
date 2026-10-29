/**
 * tree-fixed-values.ts — 箱に出すアイテムの MOD の値を木の中で揃える (10-26 夜オーナー「基本 MOD の値は、コピーした (貼り付けた) 時はその値、
 * MOD を手で選んだ時は段 (ティア) の真ん中で固定しよう。ツリー内で同じ MOD じゃないと混乱する」)。
 * 決めは完成形の窓 (use-tree の goalItem) と同じ: 貼り付けで取り込んだ狙い (memoAims の values、同じ段の時) はその値、ほかは段の真ん中
 * (エンジンの makeStageMod に 0.5 を返す乱数)。見本の乱数の値は回す・割合・照らしにはそのまま使い、出す時だけ写して直す (TreeBox・TreeHoverCard)
 */
import { makeStageMod, tierIndexOf, type PatchData, type StageItem, type StageMod } from "../../../services/craft-stage/engine";
import { retext } from "../../../services/simulator/sim-engine";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { copyOfSample } from "../../../services/simulator/tree/tree-judge";

const MID_ROLL = (): number => 0.5;

export function fixedValues(data: PatchData, doc: TreeDoc, item: StageItem): StageItem {
  const goals = doc.memoAims ?? [];
  const fix = (m: StageMod): StageMod => {
    const def = data.mods.get(m.modId);
    if (!def?.tiers[m.tierIndex]) return m;
    // フラクチャーした MOD は木の中で 1 つ (印の段。「T5 以上」なら T5)。前は箱ごとの見本で段が違い、22% と 19% が並んだ (10-27 モンキー 9 の 8)
    const mark = m.fractured ? goals.find((a) => a.fractured && a.modId === m.modId) : undefined;
    const ti = mark ? tierIndexOf(data, mark.modId, mark.tier) : -1;
    if (mark && ti >= 0 && def.tiers[ti] && ti !== m.tierIndex) {
      const mt = makeStageMod(def, m.side, ti, MID_ROLL);
      const pv = mark.values?.length === mt.values.length ? mark.values : null;
      return pv ? { ...m, tierIndex: ti, values: [...pv], ...retext({ ...m, tierIndex: ti }, pv, data) } : { ...m, tierIndex: ti, values: mt.values, textJa: mt.textJa, textEn: mt.textEn };
    }
    // 貼った値 (同じ MOD・同じ段・数の向きが合う時だけ、goalItem の pasted と同じ確かめ)
    const v = goals.find((a) => a.modId === m.modId && a.values?.length === m.values.length && tierIndexOf(data, a.modId, a.tier) === m.tierIndex)?.values;
    if (v && v.every((x, i) => Math.sign(x) === Math.sign(m.values[i]!) || x === 0)) return { ...m, values: [...v], ...retext(m, v, data) };
    const mid = makeStageMod(def, m.side, m.tierIndex, MID_ROLL);
    return { ...m, values: mid.values, textJa: mid.textJa, textEn: mid.textEn };
  };
  // エミュから来た木は暗黙もエミュの振りのまま (完成形の窓 use-tree の goalItem と同じ。前は手の窓のカードだけ 5% → 4%、10-27 モンキー 9 の 9)
  const gi = doc.goalImplicit?.base === doc.base ? doc.goalImplicit : null;
  const imp = gi ? { rollSeed: gi.rollSeed, implicitRoll: gi.implicitRoll, implicitFixed: gi.implicitFixed } : {};
  // 写しから元の見本の ☑ を引けるように (カードの「外れ MOD」の札、S-82)
  return copyOfSample({ ...item, ...imp, prefixes: item.prefixes.map(fix), suffixes: item.suffixes.map(fix) }, item);
}
