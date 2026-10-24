<!--
  TreeShowcase.vue — レシピのページの上の「見本のレシピ」(2026-10-24 オーナー「B をレシピに入れてみてよ、せっかくだし」)。
  動画の作り方を見本の木 (tree-samples.ts、?page=sim-tree&sample=…) にした物を 1 枚ずつ: 完成品・手順・費用の目安・出典・ツリーで見る。
  作り方の元は動画の人 (出典に書く)、費用はシミュで回した数字 (いつの相場か添える)。名前はカレンシー・MOD とも画面と同じ関数から (poe2db の日本語 / 英語)
-->
<script setup lang="ts">
import { computed } from "vue";
import { freshItem, modListFor, tierRankLabel } from "../../services/craft-stage/engine";
import { treeSample } from "../../services/simulator/tree/tree-samples";
import { craftStage as s } from "../../state/craft-stage";
import { nameOfKey } from "../../state/for-share/craft-stage-shelf";
import { jaTypeName } from "../../i18n/item-names-ja";
import { tr } from "../../i18n/lang";
import { useArmed, ARMED_CLASS } from "../../utils/use-armed";
import { track } from "../../utils/track";

const props = defineProps<{ dirty: boolean }>();

interface Step { ja: string; en: string; keys: string[] }
interface Showcase { sample: string; video: string; cost: { mean: number; median: number; p90: number; when: string }; titleJa: string; titleEn: string; steps: Step[] }
const AM = "Amulets/";
/** 手の文の {0} {1} … = keys の名前 (棚と同じ nameOfKey) */
const SHOWCASES: Showcase[] = [{
  sample: "absent-b", video: "mjaMYCYl-PI",
  titleJa: "冒涜をエッセンスで戻す作り方 (光のお告げなし)", titleEn: "Reset the desecration with an essence (no Omen of Light)",
  cost: { mean: 96.2, median: 76, p90: 193, when: "2026-10-24" },
  steps: [
    { keys: ["chaos"], ja: "{0}を当たるまで (スピリット T1)。MOD 4 つの満杯のまま", en: "{0} until Spirit T1 (the item stays full at 4 mods)" },
    { keys: ["desecrate", "OmenofDextralNecromancy", "OmenofAbyssalEchoes"], ja: "{0} + {1} + {2} でサフィックスを冒涜し、発現でキャストスピード T1 を狙う", en: "{0} + {1} + {2} to desecrate a suffix, then reveal for Cast Speed T1" },
    { keys: ["OmenofDextralCrystallisation", `essence:perfect:${AM}PerfectEssence_PercentageDexterity`], ja: "外れたら {0} + {1} で冒涜の MOD を消して、2 に戻る", en: "On a miss, {0} + {1} removes the desecrated mod; back to 2" },
    { keys: [`essence:perfect:${AM}PerfectEssence_RunicWardPercent`, "OmenofSinistralCrystallisation"], ja: "{0} + {1} で 50/50 (プレフィックスの外れかスピリットが消える)。勝てば完成、負けたら 1 に戻る", en: "{0} + {1} is a 50/50 (the other prefix or Spirit is removed). Win = done, lose = back to 1" },
  ],
}];

const shown = computed(() => {
  const data = s.data.value;
  if (!data) return [];
  return SHOWCASES.flatMap((c) => {
    const tree = treeSample(c.sample);
    if (!tree) return [];
    const item = freshItem(data, tree.base, tree.itemLevel, "rare");
    const rows = modListFor(data, item);
    const goals = (tree.memoAims ?? []).map((a) => {
      const r = rows.find((x) => x.id === a.modId || x.tiers.some((t) => t.modId === a.modId));
      const t = r?.tiers.filter((x) => (x.modId ?? r.id) === a.modId)[a.tier - 1];
      return `${a.fractured ? "✦ " : ""}${tierRankLabel(a.tier)} ${t?.text ?? r?.text ?? a.modId}`;
    });
    const steps = c.steps.map((st) => tr(st.ja, st.en).replace(/\{(\d)\}/g, (_, i: string) => nameOfKey(st.keys[Number(i)]!, item)));
    return [{ ...c, base: tr(jaTypeName(tree.base), tree.base), itemLevel: tree.itemLevel, goals, steps }];
  });
});

const arm = useArmed();
function openSample(name: string): void {
  // 今の木は見本を開く前に控える (SimTreePage の見本の開き方)。保存していない変更がある時は 2 回押し
  if (props.dirty && !arm.arm(`sample:${name}`)) return;
  track("tree-recipe:showcase");
  location.href = `${location.pathname}?page=sim-tree&sample=${encodeURIComponent(name)}`;
}
</script>

<template>
  <div v-if="shown.length" data-recipes-showcase class="mb-3">
    <h2 class="mb-1.5 text-[13px] font-bold text-[var(--exile-color-text-title)]">{{ tr("見本のレシピ", "Sample recipes") }}</h2>
    <ul class="grid gap-2">
      <li v-for="c in shown" :key="c.sample" data-showcase-card :data-showcase="c.sample" class="min-w-0 rounded-md border border-[var(--exile-color-border-brass)] bg-black/30 px-3 py-2.5">
        <p class="min-w-0 break-words text-[14px] font-bold text-[var(--exile-color-text-primary)]">{{ c.base }} — {{ tr(c.titleJa, c.titleEn) }}</p>
        <p class="text-[12px] text-[var(--exile-color-text-secondary)]">{{ tr(`アイテムレベル ${c.itemLevel}`, `Item level ${c.itemLevel}`) }}</p>
        <ul data-showcase-goals class="mt-1 text-[12px] text-[#c8c8ff]">
          <li v-for="g in c.goals" :key="g" class="min-w-0 break-words">{{ g }}</li>
        </ul>
        <ol data-showcase-steps class="mt-1.5 list-decimal pl-5 text-[12px] leading-relaxed">
          <li v-for="(st, i) in c.steps" :key="i" class="min-w-0 break-words">{{ st }}</li>
        </ol>
        <p data-showcase-cost class="mt-1.5 text-[12px]">
          {{ tr(`費用の目安: 1 個 ${c.cost.mean} 神 (中央 ${c.cost.median}・10 人に 9 人は ${c.cost.p90} まで)、ベース代は別`, `Cost: ${c.cost.mean} div per item (median ${c.cost.median}, 9 in 10 within ${c.cost.p90}), base not included`) }}
        </p>
        <p class="text-[11px] opacity-60">{{ tr(`費用はこのシミュで 100 人回した数字 (${c.cost.when} の相場)。作り方の出典:`, `Cost from 100 runs in this simulator (prices of ${c.cost.when}). Method from:`) }}
          <a :href="`https://www.youtube.com/watch?v=${c.video}`" target="_blank" rel="noopener" class="underline-offset-2 hover:underline">{{ tr("YouTube の動画", "YouTube video") }}</a>
        </p>
        <div class="mt-2 flex flex-wrap items-center gap-1.5">
          <button type="button" data-showcase-open class="max-md:min-h-10" :class="arm.is(`sample:${c.sample}`) ? ARMED_CLASS : 'g-btn sm'" @click="openSample(c.sample)">{{ arm.is(`sample:${c.sample}`) ? tr("今の木は控えて置き換わります。もう一度押すと開く", "The current tree is backed up and replaced. Click again to open") : tr("ツリーで見る", "View the tree") }}</button>
        </div>
      </li>
    </ul>
  </div>
</template>
