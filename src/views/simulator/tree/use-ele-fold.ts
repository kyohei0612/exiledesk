/**
 * use-ele-fold.ts — 完成形の MOD 一覧の「いずれかの元素耐性」の畳む行 (S-10h ①、スイッチ eleAny)。行の口はデザインの ModTable の folds (U-12i)。
 * 畳む行 = 一般の火・冷気・雷耐性の 3 行。出やすさ = 3 元素の合計 (元素耐性を付いていない物として数える、エンジンの modListFor の withoutAnyEle)。
 * 「いずれか」は 1 本ずつ段のプルダウンと × を持ち、「＋ 追加」で増やす。増やせるのはサフィの空きがある間 (ゲームの決まり、オーナー 11-15「上限はサフィ数だね」)。
 * 置いた後の番号・札の modId は木を変えた時に揃う (tree-ele-any の tidyEleAny)
 */
import { computed } from "vue";
import { anyEleMod, limitOf, modListFor, tierRankLabel, type ListRow } from "../../../services/craft-stage/engine";
import { craftStage as s } from "../../../state/craft-stage";
import { eleAnyOn, eleAnyText } from "../../../services/simulator/tree/tree-ele-any";
import { migrateStart, startRarity, type Aim, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { simOp } from "../../../web/track";
import type { ModFold } from "../../../components/for-share/mod-list/ModTable.vue";
import { useTree } from "./use-tree";

export const ELE_FOLD_KEY = "eleAny";

export function useEleFold() {
  const t = useTree();
  /** 一覧の一般の火・冷気・雷耐性の行 */
  const rows = computed((): ListRow[] => {
    const d = s.data.value, it = t.goalItem.value?.item;
    if (!eleAnyOn() || !d || !it) return [];
    return modListFor(d, it, { withoutAnyEle: true }).filter((r) => r.group === "normal" && anyEleMod(d, r.tiers[0]?.modId ?? r.id));
  });
  /** 置いている「いずれか」の狙い (完成形の並びの順) */
  const placed = computed((): Aim[] => t.goals.value.filter((a) => a.anyEle));
  /** サフィの空きがある (「＋ 追加」を出す。完成形の品のサフィの数が枠の上限に届いたら消える) */
  const canAdd = computed(() => { const it = t.goalItem.value?.item; return !!it && rows.value.length > 0 && limitOf(it, "suffix") - it.suffixes.length > 0; });
  const folds = computed((): ModFold[] => {
    const rs = rows.value;
    if (rs.length < 2) return [];
    // 札は元素の 3 つだけ (オーナーの見本の [火][冷気][雷])
    const tags = ["fire", "cold", "lightning"].filter((g) => rs.some((r) => r.tags.includes(g)));
    return [{ key: ELE_FOLD_KEY, members: rs.map((r) => r.id), text: eleAnyText(rs[0]!.text), tags, share: rs.reduce((n, r) => n + r.share, 0) }];
  });
  /** 段のプルダウンの段 (値は 3 元素で同じ。火の行の段) */
  const tiers = computed(() => (rows.value[0]?.tiers ?? []).map((x) => ({ tier: x.tier, label: tierRankLabel(x.tier) })));
  /** 完成形の「いずれか」を書き換える (i 番目を f で。null を返すと外す)。札の modId と番号は揃える時に決まる */
  function change(f: (list: Aim[], lead: string) => Aim[]): void {
    const lead = rows.value[0]?.tiers[0]?.modId ?? rows.value[0]?.id;
    if (!lead) return;
    simOp("pick-goal-ele-any");
    t.edit((d: TreeDoc) => {
      const list = d.memoAims ?? [], rest = list.filter((a) => !a.anyEle), next = [...rest, ...f(list.filter((a) => a.anyEle), lead)];
      if (next.length) d.memoAims = next; else delete d.memoAims;
      migrateStart(d);
      d.start!.rarity = startRarity(d);
    });
  }
  /** 1 本目を置く (まだ無い時) / i 本目の段を替える */
  const setTier = (i: number, tier: number): void => change((xs, lead) => (xs.length ? xs.map((a, j) => (j === i ? { ...a, tier } : a)) : [{ modId: lead, tier, anyEle: 1 }]));
  /** もう 1 本 (段は最後の物と同じ) */
  const add = (): void => { if (canAdd.value) change((xs, lead) => [...xs, { modId: lead, tier: xs[xs.length - 1]?.tier ?? 2, anyEle: xs.length + 1 }]); };
  /** i 本目を外す */
  const remove = (i: number): void => change((xs) => xs.filter((_, j) => j !== i));
  /**
   * 一覧に渡す品: 完成形の品から「いずれか」の札に借りた元素の MOD だけを外した物 (借りた火・冷気が一覧で「付いている 0%」と出た。
   * 元素を決めて選んだ狙いは「付いている」のまま出したいので、元素耐性を全部外す withoutAnyEle は使わない)
   */
  const listItem = computed(() => {
    const it = t.goalItem.value?.item, ids = new Set(placed.value.map((a) => a.modId));
    return it && ids.size ? { ...it, suffixes: it.suffixes.filter((m) => !ids.has(m.modId)) } : it ?? null;
  });
  return { listItem, folds, foldOn: (f: ModFold): boolean => f.key === ELE_FOLD_KEY && placed.value.length > 0, tiers, placed, canAdd, setTier, add, remove };
}
