/**
 * use-ele-singles.ts — 手の窓の「いずれかの元素耐性」の ☑ の下の火・冷気・雷の単体の ☑ (S-10h ⑩、スイッチ eleAny)。
 * 11-15 夜オーナー「冷気・火・雷も単体で狙えるように出してあげて一応」「いずれか元素が選択できるくせにそれぞれ単品で狙いMOD選択したんだったら3つ枝別れするのはそうやろね」:
 * 「いずれか」が ☑ の間、単体 (同じ段以上) は「いずれか」に含まれる形で ☑ (押せない。別の狙いにならず、当たりの箱は「いずれか」1 つ)。
 * 「いずれか」を外すと単体を 1 つずつ ☑ でき、☑ した元素は元素を決めた手の狙い (札の eleOne) = 元素ごとに当たりの箱が分かれる。
 * 品にもう付いている元素と、元素を決めた完成形の狙いの元素 (数えない系統) は出さない
 */
import { computed, ref, type Ref } from "vue";
import { ELE_FAMILIES, eleAnyOn, eleIdsOf } from "../../../services/simulator/tree/tree-ele-any";
import { aimKey, type Aim } from "../../../services/simulator/tree/tree-model";
import type { StageItem } from "../../../services/craft-stage/engine";
import { craftStage as s } from "../../../state/craft-stage";

export interface EleSingle { fam: string; aim: Aim }

/** init = 前に決めた手の当たりの狙い (単体の札 eleOne から ☑ を戻す) */
export function useEleSingles(choices: Ref<readonly Aim[]>, item: Ref<StageItem | null | undefined>, init: readonly Aim[] = []) {
  /** 単体で ☑ した物 (modId|段) */
  const picked = ref<string[]>(init.filter((a) => a.eleOne).map(aimKey));
  /** 「いずれか」の鍵 → 出す単体 (元素の系統と、その元素の同じ段の札) */
  const singles = computed((): Record<string, EleSingle[]> => {
    const d = s.data.value, it = item.value, out: Record<string, EleSingle[]> = {};
    if (!eleAnyOn() || !d || !it) return out;
    const on = new Set([...it.prefixes, ...it.suffixes].map((m) => m.family));
    for (const a of choices.value) {
      if (!a.anyEle) continue;
      const list = eleIdsOf(d, a.modId).flatMap((id) => { const fam = d.mods.get(id)?.family ?? ""; return ELE_FAMILIES.includes(fam) && !on.has(fam) && !a.eleSkip?.includes(fam) ? [{ fam, aim: { modId: id, tier: a.tier, eleOne: true } }] : []; });
      if (list.length) out[aimKey(a)] = list;
    }
    return out;
  });
  const isPicked = (x: EleSingle): boolean => picked.value.includes(aimKey(x.aim));
  /** 単体の ☑ を押す (「いずれか」が ☑ の間は含まれているので何もしない) */
  function toggle(a: Aim, fam: string, anyOn: boolean): void {
    if (anyOn) return;
    const x = singles.value[aimKey(a)]?.find((y) => y.fam === fam);
    if (!x) return;
    const k = aimKey(x.aim);
    picked.value = picked.value.includes(k) ? picked.value.filter((y) => y !== k) : [...picked.value, k];
  }
  /** 「いずれか」を ☑ にした時は単体の ☑ を落とす (含まれるので) */
  const reset = (a: Aim): void => { const ks = new Set((singles.value[aimKey(a)] ?? []).map((x) => aimKey(x.aim))); if (picked.value.some((k) => ks.has(k))) picked.value = picked.value.filter((k) => !ks.has(k)); };
  /** 当たりの箱に渡す狙い: ☑ した狙い + 外れている「いずれか」の下で単体で ☑ した元素 */
  const apply = (checkedAims: readonly Aim[]): Aim[] => {
    const on = new Set(checkedAims.map(aimKey)), add: Aim[] = [];
    for (const [k, list] of Object.entries(singles.value)) if (!on.has(k)) for (const x of list) if (isPicked(x)) add.push(x.aim);
    return [...checkedAims, ...add];
  };
  /** 単体の行の ☑ (「いずれか」が ☑ なら含まれる形で ☑) */
  const shown = (a: Aim, fam: string, anyOn: boolean): boolean => anyOn || !!singles.value[aimKey(a)]?.some((x) => x.fam === fam && isPicked(x));
  /** 単体の ☑ を全部落とす (狙い無しを押した時) */
  const clear = (): void => { if (picked.value.length) picked.value = []; };
  return { singles, toggle, reset, apply, shown, clear };
}
