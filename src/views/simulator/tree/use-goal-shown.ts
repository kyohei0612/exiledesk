/**
 * use-goal-shown.ts — 完成形のカードに出すアイテム (TreeGoalPage・TreeGoalCard・スマホの PhoneOverview で共通。スイッチ goalQuality)。
 * 「品質も狙う」☑ がオンの時は品質の値・種類をカードに乗せる。品質がベースの上限を 11% 以上超える時 (上限 20 → 31% 以上。+10 まではヴァールのインフューザーで届く)、
 * ブリーチのエッセンスの MOD の行を足して「途中で消える」の札を付ける (10-27 夜オーナー「途中で消えるって書いとけばいいんじゃね、完成品に」)。
 * 足した行は見せるだけ: 完成の狙い・MOD の枠 (use-tree の goalItem の left)・完成の判定には数えない (品質の値で見るのは tree-unbounded の qualityOk のまま)
 */
import { computed } from "vue";
import { applyCurrency, maxQualityOf, mulberry32, type StageItem, type StageMod } from "../../../services/craft-stage/engine";
import { craftStage as s } from "../../../state/craft-stage";
import type { RowTag } from "../../../components/for-share/item/stage-item-row-tag";
import { useTree } from "./use-tree";
import { wayRows, WAY_ORDER } from "./tree-way-mods";
import { tr } from "../../../i18n/lang";

/** ベースの上限をこれ以上超えたらブリーチのエッセンスが要る (+10 まではインフューザー) */
export const BREACH_OVER = 11;

export function useGoalShown() {
  const t = useTree();
  /** 足すブリーチのエッセンスの MOD (要らない時・付かないベースは null)。エンジンで完成形にブリーチのエッセンスを打って、付いた MOD を取る */
  const breach = computed((): StageMod | null => {
    const d = s.data.value, g = t.goalItem.value?.item, doc = t.doc.value;
    if (!d || !g || !doc.goalQualityOn || (doc.goalQuality ?? 0) - maxQualityOf(g) < BREACH_OVER) return null;
    // ブリーチのエッセンスを MOD 一覧で足してある時は、その行で足りる (同じ行を 2 つ出さない)
    if ([...(doc.wayMods ?? []), ...(doc.memoAims ?? [])].some((a) => /LocalMaximumQuality/.test(a.modId))) return null;
    // 完成形に既にエッセンスの MOD があると「エッセンスの MOD は 1 つまで」で打てないので、エッセンスの MOD を除いた写しに打つ (途中で付けて消える物なので、完成形と同時には付かない)
    const bare = { ...g, prefixes: g.prefixes.filter((m) => !m.crafted), suffixes: g.suffixes.filter((m) => !m.crafted) };
    try { return applyCurrency(d, bare, "essence:breach", mulberry32(1)).added?.[0] ?? null; } catch { return null; }
  });
  /** 途中で消える行 = MOD 一覧で「途中で消える」にしたクラフト MOD (tree-way-mods) + 品質で自動で出るブリーチ */
  const ways = computed((): StageMod[] => {
    const d = s.data.value;
    if (!d) return [];
    return [...wayRows(d, t.doc.value), ...(breach.value ? [breach.value] : [])];
  });
  const item = computed((): StageItem | null => {
    const g = t.goalItem.value?.item, doc = t.doc.value;
    if (!g) return null;
    const q = doc.goalQualityOn && doc.goalQuality ? { ...g, quality: doc.goalQuality, ...(doc.goalQualityTag ? { qualityTag: doc.goalQualityTag } : {}) } : g;
    const ws = ways.value;
    return ws.length ? { ...q, prefixes: [...q.prefixes, ...ws.filter((m) => m.side === "prefix")], suffixes: [...q.suffixes, ...ws.filter((m) => m.side === "suffix")] } : q;
  });
  /** 途中で消える行の札 (どれも同じ「途中で消える」) */
  const tags = computed((): Map<string, RowTag> | null => {
    const ws = ways.value;
    return ws.length ? new Map(ws.map((m) => [m.modId, { text: tr("途中で消える", "Removed on the way"), tone: "warn" as const, title: `${tr("途中で付けて、その後で消えてよい MOD (品質は残る)。完成の狙い・MOD の枠・完成の判定には数えない", "Added on the way, then may be removed (quality stays). Not counted as a final target, mod slot or for completion")}
${WAY_ORDER()}` }])) : null;
  });
  return { item, tags, breach };
}
