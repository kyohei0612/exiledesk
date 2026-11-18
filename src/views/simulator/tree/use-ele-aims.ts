/**
 * use-ele-aims.ts — 手の窓の「いずれかの元素耐性」の ☑ まわり (スイッチ eleAny。整理 ③-7 で use-ele-second.ts・use-ele-singles.ts を 1 つに、動きは同じ)。
 * ① 手の窓の「☐ 2 個目の MOD も狙う」(S-10h ②、スイッチ eleAny)。
 * 2 つ付く手 (偉大な高貴のお告げなど) で、候補に同じ段の「いずれか」が 2 本あれば、2 本目は ☑ の行にせず 1 本目の下の ☐ にする (TreeAimRows の seconds)。
 * 1 つしか付かない手では候補は 1 本目だけ (tree-ele-any の nextEleOnly) なので ☐ は出ず、今は付けられない灰色の行 (lockedAimRows) からも同じ段の後の本を外す。
 * 1 本目の ☑ を外したら 2 本目も外す (2 本目だけの当たりの箱は作れない)
 *
 * ② 手の窓の「いずれかの元素耐性」の ☑ の下の火・冷気・雷の単体の ☑ (S-10h ⑩、スイッチ eleAny)。
 * 11-15 夜オーナー「冷気・火・雷も単体で狙えるように出してあげて一応」「いずれか元素が選択できるくせにそれぞれ単品で狙いMOD選択したんだったら3つ枝別れするのはそうやろね」:
 * 「いずれか」が ☑ の間、単体 (同じ段以上) は「いずれか」に含まれる形で ☑ (押せない。別の狙いにならず、当たりの箱は「いずれか」1 つ)。
 * 「いずれか」を外すと単体を 1 つずつ ☑ でき、☑ した元素は元素を決めた手の狙い (札の eleOne) = 元素ごとに当たりの箱が分かれる。
 * 品にもう付いている元素と、元素を決めた完成形の狙いの元素 (数えない系統) は出さない
 */
import { computed, ref, type Ref } from "vue";
import { ELE_FAMILIES, eleAnyOn, eleIdsOf, eleLaterOf, isEleMod } from "../../../services/simulator/tree/tree-ele-any";
import { eleBindOn } from "../../../services/simulator/tree/tree-miss";
import { aimKey, bothOf, type Aim } from "../../../services/simulator/tree/tree-model";
import type { StageItem } from "../../../services/craft-stage/engine";
import { craftStage as s } from "../../../state/craft-stage";
import { tr } from "../../../i18n/lang";

// ① 2 個目の MOD も狙う (S-10h ②)
/** 窓の「結果の箱」の文で「2 つとも付いた」の当たりの箱 (鍵 a:、S-22d) を名前で分ける (前は当たりが全部「当たり」で 1 つにまとまり、☐ を入れても文が変わらなかった)。スイッチ eleAny の下だけ */
export const bothLabel = (o: { out: string; junkKey?: string }, plain: string): string => (eleAnyOn() && o.out === "hit" && bothOf(o.junkKey).length ? tr("当たり (2 つとも付いた)", "Hit (both landed)") : plain);

export function useEleSecond(choices: Ref<readonly Aim[]>) {
  /** 1 本目の鍵 → 2 本目 */
  const seconds = computed((): Record<string, Aim> => {
    const out: Record<string, Aim> = {};
    if (!eleAnyOn()) return out;
    for (const a of choices.value) { const p = eleLaterOf(a, choices.value); if (p && !out[aimKey(p)]) out[aimKey(p)] = a; }
    return out;
  });
  const isSecond = (a: Aim): boolean => Object.values(seconds.value).some((b) => aimKey(b) === aimKey(a));
  return {
    seconds,
    /** ☑ の行に並べる物 (2 本目を抜く) */
    rows: (l: readonly Aim[]): Aim[] => l.filter((a) => !isSecond(a)),
    /** 灰色の行の元にする完成形の狙い (候補にある本と同じ段の後の本を抜く) */
    lockGoals: (goals: readonly Aim[]): Aim[] => (eleAnyOn() ? goals.filter((g) => !eleLaterOf(g, choices.value)) : [...goals]),
    /** 1 本目が外れた 2 本目の鍵を落とす */
    fix: (keys: readonly string[]): string[] => keys.filter((k) => !Object.entries(seconds.value).some(([p, b]) => aimKey(b) === k && !keys.includes(p))),
  };
}

// ② 火・冷気・雷の単体の ☑ (S-10h ⑩)
/** locked = 2 本目からで「いずれか」に含まれる形のまま押せない (S-10h2 ②、スイッチ eleBind) */
export interface EleSingle { fam: string; aim: Aim; locked?: boolean }

/** init = 前に決めた手の当たりの狙い (単体の札 eleOne から ☑ を戻す) */
export function useEleSingles(choices: Ref<readonly Aim[]>, item: Ref<StageItem | null | undefined>, init: readonly Aim[] = []) {
  /** 単体で ☑ した物 (modId|段) */
  const picked = ref<string[]>(init.filter((a) => a.eleOne).map(aimKey));
  /**
   * 2 本目から (品に一般の火・冷気・雷耐性がもう付いていて、2 番からの「いずれか」の行) は単体を灰色で押せなくし、☑ は親の「いずれか」の ☑ に合わせる (親が ☑ なら ☑ 入り、空なら空。レビュワー 2 の R2-b)。単体へ選び直せない (S-10h2 ②、スイッチ eleBind)。
   * 当たりを付いた元素に結ぶので、2 本目を元素で分けると 1 本目の結びと食い違う
   */
  const locked = computed((): boolean => { const d = s.data.value, it = item.value; return eleBindOn() && !!d && !!it && [...it.prefixes, ...it.suffixes].some((m) => !m.unrevealed && isEleMod(d, m.modId)); });
  /** 「いずれか」の鍵 → 出す単体 (元素の系統と、その元素の同じ段の札) */
  const singles = computed((): Record<string, EleSingle[]> => {
    const d = s.data.value, it = item.value, out: Record<string, EleSingle[]> = {};
    if (!eleAnyOn() || !d || !it) return out;
    const on = new Set([...it.prefixes, ...it.suffixes].map((m) => m.family));
    for (const a of choices.value) {
      if (!a.anyEle) continue;
      const list = eleIdsOf(d, a.modId).flatMap((id) => { const fam = d.mods.get(id)?.family ?? ""; return ELE_FAMILIES.includes(fam) && !on.has(fam) && !a.eleSkip?.includes(fam) ? [{ fam, aim: { modId: id, tier: a.tier, eleOne: true }, ...(locked.value && (a.anyEle ?? 0) >= 2 ? { locked: true } : {}) }] : []; });
      if (list.length) out[aimKey(a)] = list;
    }
    return out;
  });
  const isPicked = (x: EleSingle): boolean => !x.locked && picked.value.includes(aimKey(x.aim));
  /** 単体の ☑ を押す (「いずれか」が ☑ の間・2 本目からは含まれているので何もしない) */
  function toggle(a: Aim, fam: string, anyOn: boolean): void {
    if (anyOn) return;
    const x = singles.value[aimKey(a)]?.find((y) => y.fam === fam);
    if (!x || x.locked) return;
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
  return { singles, toggle, reset, apply, shown, clear, locked };
}
