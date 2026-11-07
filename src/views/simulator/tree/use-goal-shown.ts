/**
 * use-goal-shown.ts — 完成形のカードに出すアイテム (TreeGoalPage・TreeGoalCard・スマホの PhoneOverview で共通)。
 * 「品質も狙う」☑ がオンの時は品質の値・種類をカードに乗せる。品質がベースの上限を 11% 以上超える時 (上限 20 → 31% 以上。+10 まではヴァールのインフューザーで届く)、
 * ブリーチのエッセンスの MOD の行を足して「途中で消える」の札を付ける (10-27 夜オーナー「途中で消えるって書いとけばいいんじゃね、完成品に」)。
 * 足した行は見せるだけ: 完成の狙い・MOD の枠 (use-tree の goalItem の left)・完成の判定には数えない (品質の値で見るのは tree-unbounded の qualityOk のまま)
 */
import { computed } from "vue";
import { applyCurrency, INFUSER_OVER, isQualityCapMod, maxQualityOf, mulberry32, type StageItem, type StageMod } from "../../../services/craft-stage/engine";
import { craftStage as s } from "../../../state/craft-stage";
import type { RowTag } from "../../../components/for-share/item/stage-item-row-tag";
import { useTree } from "./use-tree";
import { bundleTag, craftBundle, desecratedBundle, desecratedTag, isCraftAim, isDesecratedAim, wayRows, WAY_ORDER } from "./tree-way-mods";
import { flag } from "../../../web/release-flags";
import { catalystPart } from "../../../services/simulator/tree/tree-unbounded";
import { tr } from "../../../i18n/lang";

/** ベースの上限をこれ以上超えたらブリーチのエッセンスが要る (インフューザーで越せる幅 = エンジンの INFUSER_OVER まではインフューザー) */
export const BREACH_OVER = INFUSER_OVER + 1;

export function useGoalShown() {
  const t = useTree();
  /** 足すブリーチのエッセンスの MOD (要らない時・付かないベースは null)。エンジンで完成形にブリーチのエッセンスを打って、付いた MOD を取る */
  const breach = computed((): StageMod | null => {
    const d = s.data.value, g = t.goalItem.value?.item, doc = t.doc.value;
    // カタリスト以外の部位の品質は最初に上げてある前提 (S-31、11-05) なので、ブリーチを途中で付ける行は出さない
    if (!d || !g || !catalystPart(g) || !doc.goalQualityOn || (doc.goalQuality ?? 0) - maxQualityOf(g) < BREACH_OVER) return null;
    // ブリーチのエッセンスを MOD 一覧で足してある時は、その行で足りる (同じ行を 2 つ出さない)
    if ([...(doc.wayMods ?? []), ...(doc.memoAims ?? [])].some((a) => isQualityCapMod(d, a.modId))) return null;
    // 完成形に既にエッセンスの MOD があると「エッセンスの MOD は 1 つまで」で打てないので、エッセンスの MOD を除いた写しに打つ (途中で付けて消える物なので、完成形と同時には付かない)
    const bare = { ...g, prefixes: g.prefixes.filter((m) => !m.crafted), suffixes: g.suffixes.filter((m) => !m.crafted) };
    try { return applyCurrency(d, bare, "essence:breach", mulberry32(1)).added?.[0] ?? null; } catch { return null; }
  });
  /** 途中で消える行 = MOD 一覧で「途中で消える」にしたクラフト MOD (tree-way-mods) + 品質で自動で出るブリーチ */
  const ways = computed((): StageMod[] => {
    const d = s.data.value;
    if (!d) return [];
    const way = wayRows(d, t.doc.value), brq = breach.value;
    // 木の手で打つエッセンスの MOD は出さない (S-30d 撤回 11-07、オーナー「別に途中で消えてもここに表示しなくてよくね」。完成形に無い物は外れ = S-33c)。
    // 品質の上限超えで自動で出るブリーチの行は特例で残す (S-31、11-07 オーナー「完成形にはだしていいんじゃないあいつ特例でしょたしか」)
    return [...way, ...(brq ? [brq] : [])];
  });
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
    return wayRows(d, t.doc.value, (t.doc.value.memoAims ?? []).filter((a) => bundled.value.has(a.modId) && !on.has(a.modId))).map((m) => (d.mods.get(m.modId)?.source === "desecrated" ? { ...m, desecrated: true } : m));
  });
  /** 枠に乗らない狙いもカードの中に、ほかと同じふつうの行で (S-04c、スイッチ goalAllIn。カードの行 = ツリーで選べる狙い)。束の物は bundleRows で出すので除く。木の判定は替えない */
  const overRows = computed((): StageMod[] => {
    const d = s.data.value, l = t.goalItem.value?.left ?? [];
    if (!flag("goalAllIn") || !d || !l.length) return [];
    const over = l.filter((a) => !bundled.value.has(a.modId)), frac = new Set(over.filter((a) => a.fractured).map((a) => a.modId));
    return wayRows(d, t.doc.value, over).map((m) => (frac.has(m.modId) ? { ...m, fractured: true } : m));
  });
  const item = computed((): StageItem | null => {
    const g = t.goalItem.value?.item, doc = t.doc.value;
    if (!g) return null;
    const q = doc.goalQualityOn && doc.goalQuality ? { ...g, quality: doc.goalQuality, ...(doc.goalQualityTag ? { qualityTag: doc.goalQualityTag } : {}) } : g;
    // ノーマルに MOD は付かないのでカードは常に空 (前は束と途中で消える行だけ出て見え方が割れた、S-10c)
    if (t.goalRarity.value === "normal") return q;
    const ws = [...overRows.value, ...ways.value, ...bundleRows.value];
    const it = ws.length ? { ...q, prefixes: [...q.prefixes, ...ws.filter((m) => m.side === "prefix")], suffixes: [...q.suffixes, ...ws.filter((m) => m.side === "suffix")] } : q;
    // 付け方が冒涜の狙いは 1 つ目から冒涜の行 = エミュと同じ枠・一番下 (S-10b。見せるだけで木の判定は替えない)
    const d = s.data.value;
    if (!d) return it;
    const ids = new Set((doc.memoAims ?? []).filter((a) => !a.fractured && isDesecratedAim(d, a)).map((a) => a.modId));
    const mark = (ms: readonly StageMod[]): StageMod[] => ms.map((m) => (ids.has(m.modId) ? { ...m, desecrated: true } : m));
    return ids.size ? { ...it, prefixes: mark(it.prefixes), suffixes: mark(it.suffixes) } : it;
  });
  /** 途中で消える行の札 (どれも同じ「途中で消える」) */
  const tags = computed((): Map<string, RowTag> | null => {
    const ws = ways.value, b = bundle.value, ds = desecrated.value;
    if (b || ds) return new Map([...ws.map((m) => [m.modId, wayTag()] as const), ...(b?.aims ?? []).map((a) => [a.modId, bundleTag(b!.lim)] as const), ...(ds ?? []).map((a) => [a.modId, desecratedTag()] as const)]);
    return ws.length ? new Map(ws.map((m) => [m.modId, wayTag()])) : null;
  });
  const wayTag = (): RowTag => ({ text: tr("途中で消える", "Removed on the way"), tone: "warn" as const, title: `${tr("途中で付けて、その後で消えてよい MOD (品質は残る)。完成の狙い・MOD の枠・完成の判定には数えない", "Added on the way, then may be removed (quality stays). Not counted as a final target, mod slot or for completion")}
${WAY_ORDER()}` });
  /**
   * カードの並びの束 (StageItemCard の rowGroup): エッセンス・合金の MOD (束でなくても全部、途中で消える物も) = 1 で、ふつうの MOD の下・冒涜の上に
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
  return { item, tags, breach, bundled, groups };
}
