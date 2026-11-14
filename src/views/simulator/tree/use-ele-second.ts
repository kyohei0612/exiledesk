/**
 * use-ele-second.ts — 手の窓の「☐ 2 個目の MOD も狙う」(S-10h ②、スイッチ eleAny)。
 * 2 つ付く手 (偉大な高貴のお告げなど) で、候補に同じ段の「いずれか」が 2 本あれば、2 本目は ☑ の行にせず 1 本目の下の ☐ にする (TreeAimRows の seconds)。
 * 1 つしか付かない手では候補は 1 本目だけ (tree-ele-any の nextEleOnly) なので ☐ は出ず、今は付けられない灰色の行 (lockedAimRows) からも同じ段の後の本を外す。
 * 1 本目の ☑ を外したら 2 本目も外す (2 本目だけの当たりの箱は作れない)
 */
import { computed, type Ref } from "vue";
import { eleAnyOn, eleLaterOf } from "../../../services/simulator/tree/tree-ele-any";
import { aimKey, bothOf, type Aim } from "../../../services/simulator/tree/tree-model";
import { tr } from "../../../i18n/lang";

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
