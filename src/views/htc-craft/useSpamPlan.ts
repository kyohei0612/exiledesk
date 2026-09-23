/**
 * useSpamPlan.ts — カオススパムで何を狙い、同じ側の残りをどう足すか ([[spam-plan.ts]]) の状態 (2026-09-23)
 *
 * useHtcCraft.ts が 500 行に届くので分けた。カタリストは種類ごとに使う / 使わないを選べる
 * (既定は 1 個 0.2 神以上を使わない)。貼り付けが無い時 (ベースから 0 で組む) は [[craft-settings.ts]] の
 * `zeroStart` (品質・固定済みの枠) を使う。
 */
import { computed, ref } from "vue";
import { sideLimits } from "../../services/htc/bridge";
import type { PastedItem } from "../../services/htc/paste";
import { spamPlan } from "../../services/htc/spam-plan";
import type { Prices } from "../../vendor/poe2htc/optimizer/cost";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import type { ItemBase, PatchData } from "../../vendor/poe2htc/engine/types";
import { craftForce, zeroStart } from "./craft-settings";

type Src<T> = { readonly value: T };

export function useSpamPlan(deps: {
  data: Src<PatchData | null>;
  base: Src<ItemBase | null>;
  prices: Src<Prices | null>;
  targets: Src<TierTarget[]>;
  item: Src<PastedItem | null>;
  fracturedTargets: Src<TierTarget[]>;
  slotsUsed: Src<{ prefixes: number; suffixes: number }>;
}) {
  const catalystChoice = ref<Record<string, boolean>>({});
  const spamOverride = ref<string | null>(null);
  /** 固定済み・樹 MOD で埋まっている枠 (スパムの組み立てと途中品の検索で共通) */
  const spamUsed = computed(() => {
    const fr = deps.fracturedTargets.value.map((t) => deps.data.value?.mods.get(t.modId)?.type);
    const z = deps.item.value ? { fixedPrefix: 0, fixedSuffix: 0 } : zeroStart.value;
    return {
      prefix: deps.slotsUsed.value.prefixes + fr.filter((x) => x === "prefix").length + z.fixedPrefix,
      suffix: deps.slotsUsed.value.suffixes + fr.filter((x) => x === "suffix").length + z.fixedSuffix,
    };
  });
  const spam = computed(() => {
    const d = deps.data.value, cls = deps.base.value, p = deps.prices.value, it = deps.item.value;
    // 固定済みの MOD は付いている物なので作る対象から外す (枠は spamUsed で数えている)。
    // 半影の指輪 (火の追加ダメージが固定済み) で、火を「後で作る」狙いに数えていた (2026-09-23)
    const fixed = new Set(deps.fracturedTargets.value.map((t) => t.modId));
    const targets = deps.targets.value.filter((t) => !fixed.has(t.modId));
    if (!d || !cls || !p || !targets.length) return null;
    const z = zeroStart.value;
    // 貼り付けの品質が 20% を超えていればブリーチのエッセンスで上げている (プレにゴミ MOD が 1 つ)
    const q = it ? it.quality ?? 20 : z.quality;
    return spamPlan({
      data: d, cls, targets, prices: p,
      itemLevel: it ? it.itemLevel ?? 82 : z.itemLevel,
      quality: q,
      breach: q > 20,
      used: spamUsed.value,
      baseLimits: sideLimits(d, it ? it.baseType : z.baseType),
      catalystChoice: catalystChoice.value,
      qualityTag: it ? it.catalystTag ?? null : z.qualityTag,
      ...(spamOverride.value ? { spamOverride: spamOverride.value } : {}),
      force: craftForce.value,
    });
  });
  return { catalystChoice, spamOverride, spamUsed, spam };
}
