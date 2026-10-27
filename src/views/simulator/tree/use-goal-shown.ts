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
import { tr } from "../../../i18n/lang";
import { flag } from "../../../web/release-flags";

/** ベースの上限をこれ以上超えたらブリーチのエッセンスが要る (+10 まではインフューザー) */
export const BREACH_OVER = 11;

export function useGoalShown() {
  const t = useTree();
  /** 足すブリーチのエッセンスの MOD (要らない時・付かないベースは null)。エンジンで完成形にブリーチのエッセンスを打って、付いた MOD を取る */
  const breach = computed((): StageMod | null => {
    const d = s.data.value, g = t.goalItem.value?.item, doc = t.doc.value;
    if (!flag("goalQuality") || !d || !g || !doc.goalQualityOn || (doc.goalQuality ?? 0) - maxQualityOf(g) < BREACH_OVER) return null;
    // 完成形に既にエッセンスの MOD があると「エッセンスの MOD は 1 つまで」で打てないので、エッセンスの MOD を除いた写しに打つ (途中で付けて消える物なので、完成形と同時には付かない)
    const bare = { ...g, prefixes: g.prefixes.filter((m) => !m.crafted), suffixes: g.suffixes.filter((m) => !m.crafted) };
    try { return applyCurrency(d, bare, "essence:breach", mulberry32(1)).added?.[0] ?? null; } catch { return null; }
  });
  const item = computed((): StageItem | null => {
    const g = t.goalItem.value?.item, doc = t.doc.value;
    if (!g) return null;
    if (!flag("goalQuality") || !doc.goalQualityOn || !doc.goalQuality) return g;
    const b = breach.value, q = { ...g, quality: doc.goalQuality, ...(doc.goalQualityTag ? { qualityTag: doc.goalQualityTag } : {}) };
    return b ? { ...q, [b.side === "prefix" ? "prefixes" : "suffixes"]: [...(b.side === "prefix" ? g.prefixes : g.suffixes), b] } : q;
  });
  /** ブリーチの行の札 */
  const tags = computed((): Map<string, RowTag> | null => {
    const b = breach.value;
    return b ? new Map([[b.modId, { text: tr("途中で消える", "Removed on the way"), tone: "warn" as const, title: tr("品質を上げるために途中で付けて、その後で消えてよい MOD (品質は残る)。完成の MOD の枠には数えない", "Added on the way to raise quality, then may be removed (the quality stays). Not counted as a final mod slot") }]]) : null;
  });
  return { item, tags, breach };
}
