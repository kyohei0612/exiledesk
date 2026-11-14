/**
 * use-goal-shown.ts — 完成形のカードに出すアイテム (TreeGoalPage・TreeGoalCard・スマホの PhoneOverview で共通)。
 * 「品質も狙う」☑ がオンの時は品質の値・種類をカードに乗せる。品質を上げるブリーチのエッセンスの行は足さない (S-31、11-07 オーナー「結局完成形って見本だから途中の道でソケットやら勝手につけるでしょ」。
 * 品質が欲しい人は自分で木にブリーチを打つ。前は上限を 11% 以上超える時に「途中で消える」の行を自動で足していた)
 */
import { computed } from "vue";
import type { StageItem, StageMod } from "../../../services/craft-stage/engine";
import { craftStage as s } from "../../../state/craft-stage";
import type { RowTag } from "../../../components/for-share/item/stage-item-row-tag";
import { useTree } from "./use-tree";
import { tr } from "../../../i18n/lang";
import { aimRows, bundleTag, craftBundle, desecratedBundle, desecratedTag, isCraftAim, isDesecratedAim } from "./tree-way-mods";

export function useGoalShown() {
  const t = useTree();
  // 「途中で消える」の行は無い: 完成形に入れたクラフト MOD は全部狙い (S-30 撤回 11-07)。木の手で打つエッセンスの MOD (S-30d 撤回)・品質のブリーチ (S-31 撤回) も出さない
  /** 上限を溢れたクラフト MOD の束 (S-30b)。カードに乗らなかった束の MOD は行を足して全部カードに出す */
  const bundle = computed(() => (s.data.value ? craftBundle(s.data.value, t.doc.value, t.goalItem.value?.item ?? null) : null));
  /** 冒涜の束 (2 つ目から、どれか 1 つ) */
  const desecrated = computed(() => (s.data.value ? desecratedBundle(s.data.value, t.doc.value) : null));
  /** 束に入っている狙いの MOD (カードに全部出し、枠の外の一覧からは除く) */
  const bundled = computed(() => new Set([...(bundle.value?.aims ?? []), ...(desecrated.value ?? [])].map((a) => a.modId)));
  const bundleRows = computed((): StageMod[] => {
    const d = s.data.value, g = t.goalItem.value?.item;
    if (!d || !g || !bundled.value.size) return [];
    const on = new Set([...g.prefixes, ...g.suffixes].map((m) => m.modId));
    // 冒涜専用 MOD の行はエミュと同じ冒涜の枠で出す (S-82 と同じ見た目)
    return aimRows(d, t.doc.value, (t.doc.value.memoAims ?? []).filter((a) => bundled.value.has(a.modId) && !on.has(a.modId))).map((m) => (d.mods.get(m.modId)?.source === "desecrated" ? { ...m, desecrated: true } : m));
  });
  /** 枠に乗らない狙いもカードの中に、ほかと同じふつうの行で (S-04c。カードの行 = ツリーで選べる狙い)。束の物は bundleRows で出すので除く。木の判定は替えない */
  const overRows = computed((): StageMod[] => {
    const d = s.data.value, l = t.goalItem.value?.left ?? [];
    if (!d || !l.length) return [];
    const over = l.filter((a) => !bundled.value.has(a.modId)), frac = new Set(over.filter((a) => a.fractured).map((a) => a.modId));
    return aimRows(d, t.doc.value, over).map((m) => (frac.has(m.modId) ? { ...m, fractured: true } : m));
  });
  const item = computed((): StageItem | null => {
    const g = t.goalItem.value?.item, doc = t.doc.value;
    if (!g) return null;
    const q = doc.goalQualityOn && doc.goalQuality ? { ...g, quality: doc.goalQuality, ...(doc.goalQualityTag ? { qualityTag: doc.goalQualityTag } : {}) } : g;
    // ノーマルに MOD は付かないのでカードは常に空 (前は束の行だけ出て見え方が割れた、S-10c)
    if (t.goalRarity.value === "normal") return q;
    const ws = [...overRows.value, ...bundleRows.value];
    const it = ws.length ? { ...q, prefixes: [...q.prefixes, ...ws.filter((m) => m.side === "prefix")], suffixes: [...q.suffixes, ...ws.filter((m) => m.side === "suffix")] } : q;
    // 付け方が冒涜の狙いは 1 つ目から冒涜の行 = エミュと同じ枠・一番下 (S-10b。見せるだけで木の判定は替えない)
    const d = s.data.value;
    if (!d) return it;
    const ids = new Set((doc.memoAims ?? []).filter((a) => !a.fractured && isDesecratedAim(d, a)).map((a) => a.modId));
    const mark = (ms: readonly StageMod[]): StageMod[] => ms.map((m) => (ids.has(m.modId) ? { ...m, desecrated: true } : m));
    return ids.size ? { ...it, prefixes: mark(it.prefixes), suffixes: mark(it.suffixes) } : it;
  });
  /** 束の札 (クラフト MOD「どれか n つ残る」・冒涜「どれか 1 つ」) */
  const tags = computed((): Map<string, RowTag> | null => {
    const b = bundle.value, ds = desecrated.value, ea = (t.doc.value.memoAims ?? []).filter((a) => a.anyEle); // いずれかの元素耐性の札 (S-10h ③)
    return b || ds || ea.length ? new Map([...(b?.aims ?? []).map((a) => [a.modId, bundleTag(b!.lim)] as const), ...(ds ?? []).map((a) => [a.modId, desecratedTag()] as const), ...ea.map((a) => [a.modId, { text: t.aimShort(a), replace: true, tone: "info", title: tr("火・冷気・雷耐性のどれか 1 つが段以上で当たり。2 つ目は違う元素", "Any one of fire / cold / lightning at this tier or better. The 2nd must be a different element") } as RowTag] as const)]) : null;
  });
  /**
   * カードの並びの束 (StageItemCard の rowGroup): エッセンス・合金の MOD (束でなくても全部) = 1 で、ふつうの MOD の下・冒涜の上に
   * (10-31 オーナー「エッセンスは下にした方が見た目いいね、冒涜はプレサフィ関係なく一番↓につくけど、その上にエッセンス」)。冒涜の束 = 2 (冒涜は元から一番下)
   */
  const groups = computed((): Map<string, number> | null => {
    const d = s.data.value, it = item.value;
    if (!d || !it) return null;
    const m = new Map<string, number>();
    for (const x of [...it.prefixes, ...it.suffixes]) if (isCraftAim(d, x)) m.set(x.modId, 1);
    for (const a of desecrated.value ?? []) m.set(a.modId, 2);
    return m.size ? m : null;
  });
  return { item, tags, bundled, groups };
}
